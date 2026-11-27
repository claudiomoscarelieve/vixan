// Vixan — cuentas de compradores de Vixan Tienda.
// El comprador se registra en la tienda, el vendedor aprueba la cuenta en Vixan y le asigna una lista de precios.
// La tienda (HTML estático en otro dominio) habla con estas rutas desde el navegador:
//   /api/v1/tienda/publico/<id público de la tienda>/...   con CORS limitado al dominio de la tienda
// La sesión del comprador es un token (Authorization: Bearer), no una cookie, porque la tienda está en otro dominio.
const express = require('express');
const crypto = require('crypto');
const store = require('./db');
const catalogo = require('./catalogo');
const correo = require('./correo');

store.db.exec(`
CREATE TABLE IF NOT EXISTS tienda_cuentas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  cliente_id INTEGER,
  email TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  nombre TEXT, razon_social TEXT, cuit TEXT, telefono TEXT,
  datos TEXT,
  lista TEXT,
  creado TEXT DEFAULT CURRENT_TIMESTAMP,
  aprobado TEXT,
  ultimo_ingreso TEXT,
  UNIQUE(tenant_id, email)
);
CREATE TABLE IF NOT EXISTS tienda_sesiones (
  token_hash TEXT PRIMARY KEY,
  cuenta_id INTEGER NOT NULL,
  tenant_id INTEGER NOT NULL,
  expira INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tienda_restablecer (
  token_hash TEXT PRIMARY KEY,
  cuenta_id INTEGER NOT NULL,
  tenant_id INTEGER NOT NULL,
  expira INTEGER NOT NULL,
  usado INTEGER DEFAULT 0
);
`);

const DIA = 86400000;
const ESTADOS = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada', bloqueada: 'Bloqueada' };
const limpiarEmail = (s) => String(s || '').trim().toLowerCase();
const soloDigitos = (s) => String(s || '').replace(/\D/g, '');
const cuitConGuiones = (d) => (d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : d);
const texto = (v, max = 120) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

function cuitValido(d) {
  if (!/^\d{11}$/.test(d)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const s = pesos.reduce((a, p, i) => a + p * Number(d[i]), 0);
  let v = 11 - (s % 11); if (v === 11) v = 0; if (v === 10) v = 9;
  return v === Number(d[10]);
}

// ───────────── Tienda: id público, dominios permitidos ─────────────
function idPublico(t) {
  const s = store.getSettings(t).tienda || {};
  if (s.id_publico) return s.id_publico;
  const id = crypto.randomBytes(9).toString('base64url');
  store.setSetting(t, 'tienda', { ...s, id_publico: id });
  cacheIds.clear();
  return id;
}
const cacheIds = new Map();
function tenantDeId(id) {
  if (!id || !/^[\w-]{6,40}$/.test(id)) return null;
  if (cacheIds.has(id)) return cacheIds.get(id);
  for (const { id: t } of store.db.prepare('SELECT id FROM tenants WHERE activo=1').all()) {
    if ((store.getSettings(t).tienda || {}).id_publico === id) { cacheIds.set(id, t); return t; }
  }
  return null;
}
function origenesPermitidos(t) {
  const s = store.getSettings(t).tienda || {};
  const lista = new Set();
  for (const u of [s.dominio, ...String(s.origenes || '').split(/[\s,]+/)]) {
    if (!u) continue;
    try {
      const url = new URL(/^https?:\/\//.test(u) ? u : `https://${u}`);
      const host = url.host.replace(/^www\./, '');
      lista.add(`${url.protocol}//${host}`); lista.add(`${url.protocol}//www.${host}`);
      if (url.protocol === 'https:') { lista.add(`http://${host}`); }
    } catch { /* dirección mal escrita */ }
  }
  return lista;
}
function urlTienda(t) {
  const d = (store.getSettings(t).tienda || {}).dominio || '';
  return d ? (/^https?:\/\//.test(d) ? d : `https://${d}`).replace(/\/$/, '') : '';
}
const nombreTienda = (t) => (store.getSettings(t).tienda || {}).nombre || store.db.prepare('SELECT nombre FROM tenants WHERE id=?').get(t)?.nombre || 'la tienda';

// ───────────── Precios por lista ─────────────
function listaDeCuenta(t, cuenta) {
  const ctx = catalogo.contexto(t);
  const valor = cuenta?.lista || (store.getSettings(t).tienda || {}).lista || 'general';
  const l = valor === 'general' ? null : ctx.listas.find((x) => String(x.id) === String(valor)) || ctx.listas.find((x) => x.nombre === valor);
  return { ctx, lista: l ? { id: l.id, nombre: l.nombre } : { id: 'general', nombre: 'Precio general' } };
}
function preciosDeCuenta(t, cuenta) {
  const { ctx, lista } = listaDeCuenta(t, cuenta);
  const ocultos = new Set(String((store.getSettings(t).tienda || {}).ocultos || '').split(/[\s,;]+/).filter(Boolean));
  const precios = {};
  for (const p of ctx.productos) {
    if (!p.market || p.activo === false || ocultos.has(String(p.sku))) continue;
    const precio = catalogo.precioEnLista(p, lista.id, ctx);
    if (precio > 0) precios[p.id] = precio;
  }
  return { lista: lista.nombre, precios };
}

// ───────────── Sesiones ─────────────
function crearSesion(cuenta) {
  const token = crypto.randomBytes(32).toString('base64url');
  store.db.prepare('INSERT INTO tienda_sesiones (token_hash, cuenta_id, tenant_id, expira) VALUES (?,?,?,?)').run(store.sha256(token), cuenta.id, cuenta.tenant_id, Date.now() + 30 * DIA);
  store.db.prepare('UPDATE tienda_cuentas SET ultimo_ingreso=? WHERE id=?').run(new Date().toISOString(), cuenta.id);
  store.db.prepare('DELETE FROM tienda_sesiones WHERE expira<?').run(Date.now());
  return token;
}
function cuentaDeToken(req, t) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const s = store.db.prepare('SELECT * FROM tienda_sesiones WHERE token_hash=? AND tenant_id=? AND expira>?').get(store.sha256(token), t, Date.now());
  if (!s) return null;
  const c = store.db.prepare('SELECT * FROM tienda_cuentas WHERE id=?').get(s.cuenta_id);
  return c && c.estado === 'aprobada' ? { ...c, _token: s.token_hash } : null;
}
const publica = (c) => ({ email: c.email, nombre: c.nombre, razon_social: c.razon_social, cuit: c.cuit, telefono: c.telefono, estado: c.estado, ...JSON.parse(c.datos || '{}') });

// ───────────── Límite de intentos (por IP y acción) ─────────────
const intentos = new Map();
function limitar(req, accion, max) {
  const ip = String(req.headers['cf-connecting-ip'] || req.ip || '');
  const k = `${accion}:${ip}`; const a = intentos.get(k) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60000) { a.n = 0; a.t = Date.now(); }
  a.n++; intentos.set(k, a);
  if (intentos.size > 5000) for (const [kk, v] of intentos) if (Date.now() - v.t > 15 * 60000) intentos.delete(kk);
  if (a.n > max) { const e = new Error('Demasiados intentos. Probá de nuevo en 15 minutos.'); e.status = 429; throw e; }
}

// ───────────── Emails ─────────────
function avisos(t) { const c = correo.config(t); return c.avisos || c.remitente || c.usuario || ''; }
function mailRegistroVendedor(t, c) {
  const para = avisos(t); if (!para) return;
  correo.enviarSinEsperar(t, { para, responderA: c.email, asunto: `Nueva cuenta para aprobar: ${c.razon_social || c.nombre}`,
    texto: `Se registró ${c.razon_social} (CUIT ${c.cuit}) en ${nombreTienda(t)}.\nContacto: ${c.nombre} · ${c.email} · ${c.telefono}\n\nAprobala en Vixan → Vixan Market → Compradores.`,
    html: correo.plantilla({ titulo: 'Nueva cuenta para aprobar', parrafos: [`${c.razon_social} (CUIT ${c.cuit}) se registró en ${nombreTienda(t)}.`, `Contacto: ${c.nombre} · ${c.email} · ${c.telefono}`, 'Aprobala en Vixan → Vixan Market → Compradores, y elegí su lista de precios.'] }) });
}
function mailRegistroComprador(t, c) {
  correo.enviarSinEsperar(t, { para: c.email, asunto: `Recibimos tu solicitud de cuenta en ${nombreTienda(t)}`,
    texto: `Hola ${c.nombre}, recibimos tu solicitud de cuenta para ${c.razon_social}. Te avisamos por este medio cuando esté aprobada.`,
    html: correo.plantilla({ titulo: '¡Gracias por registrarte!', parrafos: [`Hola ${c.nombre}, recibimos tu solicitud de cuenta para ${c.razon_social}.`, 'La revisamos y te avisamos por este medio cuando esté aprobada.'], pie: nombreTienda(t) }) });
}
function mailAprobada(t, c) {
  const url = urlTienda(t);
  correo.enviarSinEsperar(t, { para: c.email, asunto: `Tu cuenta en ${nombreTienda(t)} está aprobada`,
    texto: `Hola ${c.nombre}, tu cuenta fue aprobada. Ya podés ingresar${url ? ` en ${url}/cuenta/` : ''} con tu email y contraseña para ver tus precios y armar tu pedido.`,
    html: correo.plantilla({ titulo: 'Tu cuenta está aprobada', parrafos: [`Hola ${c.nombre}, tu cuenta para ${c.razon_social} fue aprobada.`, 'Ya podés ingresar con tu email y contraseña para ver tus precios y armar tu pedido.'], boton: url ? { texto: 'Ingresar a la tienda', url: `${url}/cuenta/` } : null, pie: nombreTienda(t) }) });
}

// ───────────── Rutas públicas (las usa la tienda desde el navegador) ─────────────
const publico = express.Router({ mergeParams: true });
const responder = (fn) => async (req, res) => {
  try { res.json({ ok: true, data: await fn(req, res) }); } catch (e) {
    if (!e.status) console.error('[tienda/cuentas]', e);
    res.status(e.status || 500).json({ ok: false, error: e.status ? e.message : 'Ocurrió un error. Probá de nuevo.', codigo: e.codigo });
  }
};
const error = (status, mensaje, codigo) => Object.assign(new Error(mensaje), { status, codigo });

publico.use('/:tid', (req, res, next) => {
  const t = tenantDeId(req.params.tid);
  const origen = req.headers.origin;
  if (t && origen && origenesPermitidos(t).has(origen)) {
    res.set({ 'Access-Control-Allow-Origin': origen, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600' });
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (!t) return res.status(404).json({ ok: false, error: 'Tienda no encontrada' });
  req.tenantId = t;
  next();
});

publico.post('/:tid/registro', responder((req) => {
  limitar(req, 'registro', 5);
  const t = req.tenantId; const b = req.body || {};
  const email = limpiarEmail(b.email);
  const cuit = soloDigitos(b.cuit);
  const d = { nombre: texto(b.nombre), razon_social: texto(b.razon_social), telefono: texto(b.telefono, 40) };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw error(400, 'Revisá el email');
  if (String(b.password || '').length < 8) throw error(400, 'La contraseña tiene que tener al menos 8 caracteres');
  if (!d.razon_social) throw error(400, 'Falta la razón social o el nombre del comercio');
  if (!d.nombre) throw error(400, 'Falta tu nombre');
  if (!cuitValido(cuit)) throw error(400, 'Revisá el CUIT: tiene que tener 11 números');
  if (!d.telefono) throw error(400, 'Falta un teléfono de contacto');
  if (store.db.prepare('SELECT id FROM tienda_cuentas WHERE tenant_id=? AND email=?').get(t, email)) throw error(409, 'Ya hay una cuenta con ese email. Ingresá o recuperá tu contraseña.');
  const extra = { direccion: texto(b.direccion), localidad: texto(b.localidad, 80), provincia: texto(b.provincia, 60), cp: texto(b.cp, 12), condicion_iva: texto(b.condicion_iva, 40), rubro: texto(b.rubro, 80) };

  // Se vincula con el cliente que ya exista (por CUIT o email) o se crea uno nuevo
  const clientes = store.list(t, 'clientes');
  let cli = clientes.find((c) => soloDigitos(c.cuit) === cuit) || clientes.find((c) => limpiarEmail(c.email) === email);
  if (!cli) {
    cli = store.create(t, 'clientes', { nombre: d.razon_social, razon_social: d.razon_social, cuit: cuitConGuiones(cuit), email, telefono: d.telefono, direccion: extra.direccion, localidad: extra.localidad, provincia: extra.provincia, cp: extra.cp, condicion_iva: extra.condicion_iva || 'Responsable Inscripto', canal: 'Tienda online', etiquetas: ['Tienda'], contacto: d.nombre });
  }
  const r = store.db.prepare('INSERT INTO tienda_cuentas (tenant_id, cliente_id, email, pass_hash, estado, nombre, razon_social, cuit, telefono, datos) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(t, cli.id, email, store.hashPassword(String(b.password)), 'pendiente', d.nombre, d.razon_social, cuitConGuiones(cuit), d.telefono, JSON.stringify(extra));
  const cuenta = store.db.prepare('SELECT * FROM tienda_cuentas WHERE id=?').get(r.lastInsertRowid);
  store.logEvent(t, null, 'tienda_registro', `${d.razon_social} (${email}) pidió una cuenta en la tienda`);
  mailRegistroVendedor(t, cuenta); mailRegistroComprador(t, cuenta);
  return { estado: 'pendiente' };
}));

publico.post('/:tid/ingreso', responder((req) => {
  limitar(req, 'ingreso', 10);
  const t = req.tenantId;
  const c = store.db.prepare('SELECT * FROM tienda_cuentas WHERE tenant_id=? AND email=?').get(t, limpiarEmail(req.body?.email));
  if (!c || !store.checkPassword(String(req.body?.password || ''), c.pass_hash)) throw error(401, 'Email o contraseña incorrectos');
  if (c.estado === 'pendiente') throw error(403, 'Tu cuenta todavía está pendiente de aprobación. Te avisamos por email cuando esté lista.', 'pendiente');
  if (c.estado !== 'aprobada') throw error(403, 'Tu cuenta no está habilitada. Comunicate con nosotros.', c.estado);
  return { token: crearSesion(c), cuenta: publica(c), ...preciosDeCuenta(t, c) };
}));

publico.get('/:tid/yo', responder((req) => {
  const c = cuentaDeToken(req, req.tenantId);
  if (!c) throw error(401, 'La sesión venció. Volvé a ingresar.');
  return { cuenta: publica(c), ...preciosDeCuenta(req.tenantId, c) };
}));

publico.post('/:tid/salir', responder((req) => {
  const c = cuentaDeToken(req, req.tenantId);
  if (c) store.db.prepare('DELETE FROM tienda_sesiones WHERE token_hash=?').run(c._token);
  return true;
}));

publico.post('/:tid/clave', responder((req) => {
  const t = req.tenantId; const c = cuentaDeToken(req, t);
  if (!c) throw error(401, 'La sesión venció. Volvé a ingresar.');
  limitar(req, 'clave', 10);
  if (!store.checkPassword(String(req.body?.actual || ''), c.pass_hash)) throw error(400, 'La contraseña actual no es correcta');
  if (String(req.body?.nueva || '').length < 8) throw error(400, 'La contraseña nueva tiene que tener al menos 8 caracteres');
  store.db.prepare('UPDATE tienda_cuentas SET pass_hash=? WHERE id=?').run(store.hashPassword(String(req.body.nueva)), c.id);
  store.db.prepare('DELETE FROM tienda_sesiones WHERE cuenta_id=? AND token_hash<>?').run(c.id, c._token);
  return true;
}));

publico.post('/:tid/olvide', responder(async (req) => {
  limitar(req, 'olvide', 5);
  const t = req.tenantId;
  if (!correo.configurado(t)) throw error(503, 'La tienda todavía no envía emails. Escribinos por WhatsApp y te damos una contraseña nueva.', 'sin_correo');
  const c = store.db.prepare('SELECT * FROM tienda_cuentas WHERE tenant_id=? AND email=?').get(t, limpiarEmail(req.body?.email));
  // Siempre la misma respuesta, exista o no la cuenta (así no se puede averiguar qué emails están registrados)
  if (c && c.estado !== 'rechazada') {
    const token = crypto.randomBytes(32).toString('base64url');
    store.db.prepare('INSERT INTO tienda_restablecer (token_hash, cuenta_id, tenant_id, expira) VALUES (?,?,?,?)').run(store.sha256(token), c.id, t, Date.now() + 3600000);
    const url = `${urlTienda(t)}/cuenta/?restablecer=${token}`;
    correo.enviarSinEsperar(t, { para: c.email, asunto: `Cambiá tu contraseña de ${nombreTienda(t)}`,
      texto: `Hola ${c.nombre}, para elegir una contraseña nueva entrá a ${url}\nEl enlace vence en 1 hora. Si no lo pediste, ignorá este email.`,
      html: correo.plantilla({ titulo: 'Cambiá tu contraseña', parrafos: [`Hola ${c.nombre}, pediste cambiar la contraseña de tu cuenta.`, 'El enlace vence en 1 hora. Si no lo pediste, ignorá este email: tu contraseña sigue igual.'], boton: { texto: 'Elegir contraseña nueva', url }, pie: nombreTienda(t) }) });
  }
  return true;
}));

publico.post('/:tid/restablecer', responder((req) => {
  limitar(req, 'restablecer', 10);
  const t = req.tenantId;
  const r = store.db.prepare('SELECT * FROM tienda_restablecer WHERE token_hash=? AND tenant_id=?').get(store.sha256(String(req.body?.token || '')), t);
  if (!r || r.usado || r.expira < Date.now()) throw error(400, 'El enlace venció o ya se usó. Pedí uno nuevo.');
  if (String(req.body?.password || '').length < 8) throw error(400, 'La contraseña tiene que tener al menos 8 caracteres');
  store.db.prepare('UPDATE tienda_cuentas SET pass_hash=? WHERE id=?').run(store.hashPassword(String(req.body.password)), r.cuenta_id);
  store.db.prepare('UPDATE tienda_restablecer SET usado=1 WHERE token_hash=?').run(r.token_hash);
  store.db.prepare('DELETE FROM tienda_sesiones WHERE cuenta_id=?').run(r.cuenta_id);
  const c = store.db.prepare('SELECT * FROM tienda_cuentas WHERE id=?').get(r.cuenta_id);
  return { estado: c.estado };
}));

// ───────────── Rutas del panel (Vixan Market → Compradores) ─────────────
const panel = express.Router();
const wrap = (fn) => async (req, res) => { try { res.json({ ok: true, data: await fn(req) }); } catch (e) { res.status(e.status || 400).json({ ok: false, error: e.message }); } };
const soloAdmin = (req, res, next) => (['superadmin', 'admin'].includes(req.user.rol) ? next() : res.status(403).json({ ok: false, error: 'Sin permiso' }));
const cuentaDelPanel = (req) => {
  const c = store.db.prepare('SELECT * FROM tienda_cuentas WHERE id=? AND tenant_id=?').get(Number(req.params.id), req.tenantId);
  if (!c) throw error(404, 'Cuenta no encontrada');
  return c;
};

panel.get('/', wrap((req) => {
  const t = req.tenantId;
  const { ctx } = listaDeCuenta(t, null);
  const nombresLista = new Map([['general', 'Precio general'], ...ctx.listas.map((l) => [String(l.id), l.nombre])]);
  const cuentas = store.db.prepare('SELECT * FROM tienda_cuentas WHERE tenant_id=? ORDER BY CASE estado WHEN \'pendiente\' THEN 0 ELSE 1 END, creado DESC').all(t)
    .map((c) => ({ id: c.id, cliente_id: c.cliente_id, email: c.email, nombre: c.nombre, razon_social: c.razon_social, cuit: c.cuit, telefono: c.telefono, estado: c.estado, estado_txt: ESTADOS[c.estado] || c.estado, lista: c.lista || '', lista_txt: c.lista ? nombresLista.get(String(c.lista)) || '(lista borrada)' : 'La de la tienda', creado: c.creado, aprobado: c.aprobado, ultimo_ingreso: c.ultimo_ingreso, ...JSON.parse(c.datos || '{}') }));
  return {
    cuentas,
    listas: [{ id: '', nombre: 'La de la tienda' }, { id: 'general', nombre: 'Precio general' }, ...ctx.listas.filter((l) => !l.archivada).map((l) => ({ id: String(l.id), nombre: l.nombre }))],
    correo: correo.configurado(t),
    id_publico: idPublico(t),
  };
}));

panel.post('/:id/aprobar', soloAdmin, wrap((req) => {
  const c = cuentaDelPanel(req);
  const lista = req.body?.lista === undefined ? c.lista : String(req.body.lista || '');
  store.db.prepare("UPDATE tienda_cuentas SET estado='aprobada', lista=?, aprobado=COALESCE(aprobado, ?) WHERE id=?").run(lista || null, new Date().toISOString(), c.id);
  store.logEvent(req.tenantId, req.user.id, 'tienda_cuenta', `Cuenta de la tienda aprobada: ${c.email}`);
  if (c.estado !== 'aprobada') mailAprobada(req.tenantId, c);
  return true;
}));
panel.post('/:id/lista', soloAdmin, wrap((req) => {
  const c = cuentaDelPanel(req);
  store.db.prepare('UPDATE tienda_cuentas SET lista=? WHERE id=?').run(String(req.body?.lista || '') || null, c.id);
  return true;
}));
for (const [ruta, estado] of [['rechazar', 'rechazada'], ['bloquear', 'bloqueada']]) {
  panel.post(`/:id/${ruta}`, soloAdmin, wrap((req) => {
    const c = cuentaDelPanel(req);
    store.db.prepare('UPDATE tienda_cuentas SET estado=? WHERE id=?').run(estado, c.id);
    store.db.prepare('DELETE FROM tienda_sesiones WHERE cuenta_id=?').run(c.id);
    store.logEvent(req.tenantId, req.user.id, 'tienda_cuenta', `Cuenta de la tienda ${estado}: ${c.email}`);
    return true;
  }));
}
// Contraseña nueva generada por el vendedor (se muestra una vez y, si hay correo, se envía al comprador)
panel.post('/:id/clave', soloAdmin, wrap((req) => {
  const c = cuentaDelPanel(req);
  const clave = crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x');
  store.db.prepare('UPDATE tienda_cuentas SET pass_hash=? WHERE id=?').run(store.hashPassword(clave), c.id);
  store.db.prepare('DELETE FROM tienda_sesiones WHERE cuenta_id=?').run(c.id);
  let enviado = false;
  if (req.body?.enviar && correo.configurado(req.tenantId)) {
    correo.enviarSinEsperar(req.tenantId, { para: c.email, asunto: `Tu contraseña nueva de ${nombreTienda(req.tenantId)}`,
      texto: `Hola ${c.nombre}, tu contraseña nueva es: ${clave}\nTe recomendamos cambiarla desde Mi cuenta.`,
      html: correo.plantilla({ titulo: 'Tu contraseña nueva', parrafos: [`Hola ${c.nombre}, tu contraseña nueva es: ${clave}`, 'Te recomendamos cambiarla desde Mi cuenta, en la tienda.'], boton: urlTienda(req.tenantId) ? { texto: 'Ingresar', url: `${urlTienda(req.tenantId)}/cuenta/` } : null, pie: nombreTienda(req.tenantId) }) });
    enviado = true;
  }
  return { clave, enviado };
}));
panel.delete('/:id', soloAdmin, wrap((req) => {
  const c = cuentaDelPanel(req);
  store.db.prepare('DELETE FROM tienda_sesiones WHERE cuenta_id=?').run(c.id);
  store.db.prepare('DELETE FROM tienda_restablecer WHERE cuenta_id=?').run(c.id);
  store.db.prepare('DELETE FROM tienda_cuentas WHERE id=?').run(c.id);
  store.logEvent(req.tenantId, req.user.id, 'tienda_cuenta', `Cuenta de la tienda borrada: ${c.email} (el cliente sigue en Clientes)`);
  return true;
}));

// Correo de la cuenta: guardar y probar
const correoRouter = express.Router();
correoRouter.get('/', wrap((req) => { const c = correo.config(req.tenantId); return { ...c, clave: c.clave ? '••••••••' : '', configurado: correo.configurado(req.tenantId) }; }));
correoRouter.put('/', soloAdmin, wrap((req) => {
  const ant = store.getSettings(req.tenantId).correo || {};
  const b = req.body || {};
  const nuevo = { host: texto(b.host), puerto: Number(b.puerto) || '', seguridad: b.seguridad === 'starttls' ? 'starttls' : 'ssl', usuario: texto(b.usuario), remitente: texto(b.remitente), nombre: texto(b.nombre), avisos: texto(b.avisos), ignorarCertificado: !!b.ignorarCertificado,
    clave: b.clave && b.clave !== '••••••••' ? String(b.clave) : ant.clave || '' };
  store.setSetting(req.tenantId, 'correo', nuevo);
  return true;
}));
correoRouter.post('/probar', soloAdmin, wrap(async (req) => {
  const t = req.tenantId;
  if (!correo.configurado(t)) throw error(400, 'Completá servidor, usuario y contraseña del correo');
  const para = texto(req.body?.para) || req.user.email;
  await correo.enviar(t, { para, asunto: 'Prueba de correo de Vixan', texto: 'Si recibiste este email, el correo de tu cuenta de Vixan funciona.', html: correo.plantilla({ titulo: 'El correo funciona', parrafos: ['Si recibiste este email, Vixan ya puede enviar los avisos de la tienda: cuentas nuevas, cuentas aprobadas y recuperación de contraseñas.'] }) });
  return { para };
}));

module.exports = { publico, panel, correoRouter, idPublico, preciosDeCuenta, cuitValido };
