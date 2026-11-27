// Vixan — servidor HTTP (Express)
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const store = require('./db');
const logic = require('./logic');
const { integrar } = require('./integrations');
const woo = require('./woo');
const catalogo = require('./catalogo');
const facturacion = require('./facturacion');
const contabilidad = require('./contab-rutas');
const arca = require('./arca');
const tienda = require('./tienda');
const cuentas = require('./cuentas');
const checkout = require('./checkout');
const { facturaHTML } = require('./factura-html');
const STOCK_ENTITIES = new Set(['lotes', 'pedidos', 'productos']);
// Avisa al sincronizador de WooCommerce cuando algo pudo cambiar el stock
const tocaStock = (req) => woo.programarEnvioStock(req.tenantId);

const app = express();
app.disable('x-powered-by');
// Detrás de Caddy (y de Cloudflare): la IP real del visitante viene en los encabezados del proxy
app.set('trust proxy', 'loopback');
const ipDe = (req) => String(req.headers['cf-connecting-ip'] || req.ip || '');
app.use(express.json({ limit: '5mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

// Entidades que el CRUD genérico acepta (todo lo demás se rechaza)
const ENTITIES = new Set([
  'pedidos', 'presupuestos', 'clientes', 'canales', 'productos', 'categorias', 'listas_precio',
  'lotes', 'movimientos_stock', 'depositos', 'envios_full', 'proveedores', 'marcas', 'fabricantes', 'cc_proveedores',
  'ordenes_compra', 'ordenes_reabastecimiento', 'facturas', 'caja_movimientos', 'bancos', 'retenciones', 'auditoria',
  'integraciones', 'publicaciones', 'wa_conversaciones', 'wa_envios', 'wa_anuncios', 'mail_campanas', 'mail_audiencias',
  'reventa_ofertas', 'reventa_liquidaciones', 'tienda_promos', 'comprobantes', 'webhooks', 'tickets_soporte', 'cuentas_contables',
]);

// ───────────── Sesiones ─────────────
const SESSION_DAYS = 14;
function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}
function auth(req, res, next) {
  const token = parseCookies(req).vg_session;
  if (token) {
    const s = store.db.prepare('SELECT s.*, u.email, u.nombre, u.rol, u.activo, u.tenant_id AS home_tenant, t.activo AS tenant_activo FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN tenants t ON t.id=u.tenant_id WHERE s.token=? AND s.expires_at>?').get(token, Date.now());
    if (s && s.activo && (s.rol === 'superadmin' || s.tenant_activo)) {
      req.user = { id: s.user_id, email: s.email, nombre: s.nombre, rol: s.rol };
      req.tenantId = s.tenant_id;
      return next();
    }
  }
  // Acceso por API key (integraciones de terceros)
  const key = req.headers['x-api-key'];
  if (key) {
    const k = store.db.prepare('SELECT * FROM api_keys WHERE key_hash=?').get(store.sha256(String(key)));
    if (k) {
      // Las claves de Vixan Tienda solo pueden leer el catálogo de la tienda
      if (k.alcance === 'tienda' && !(req.method === 'GET' && req.path.startsWith('/v1/tienda/'))) {
        return res.status(403).json({ ok: false, error: 'Esta clave solo sirve para Vixan Tienda' });
      }
      if (k.alcance !== 'tienda' && !store.db.prepare('SELECT activo FROM tenants WHERE id=?').get(k.tenant_id)?.activo) {
        return res.status(403).json({ ok: false, error: 'La cuenta está suspendida' });
      }
      req.user = { id: null, rol: 'api', nombre: 'API: ' + k.nombre }; req.tenantId = k.tenant_id; return next();
    }
  }
  res.status(401).json({ ok: false, error: 'No autenticado' });
}
const onlyRoles = (...roles) => (req, res, next) => (roles.includes(req.user.rol) ? next() : res.status(403).json({ ok: false, error: 'Sin permiso' }));
const ok = (res, data) => res.json({ ok: true, data });
const wrap = (fn) => (req, res) => { try { const r = fn(req, res); if (r !== undefined) ok(res, r); } catch (e) { console.error(e); res.status(500).json({ ok: false, error: e.message }); } };

// Límite simple de intentos de login por IP
const attempts = new Map();
app.post('/api/auth/login', (req, res) => {
  const ip = ipDe(req);
  const a = attempts.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60000) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 10) return res.status(429).json({ ok: false, error: 'Demasiados intentos. Probá en 15 minutos.' });
  const { email, password } = req.body || {};
  const u = store.db.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').get(String(email || '').trim());
  if (!u || !u.activo || !store.checkPassword(String(password || ''), u.pass_hash)) {
    a.n++; attempts.set(ip, a);
    return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
  }
  if (u.rol !== 'superadmin' && !store.db.prepare('SELECT activo FROM tenants WHERE id=?').get(u.tenant_id)?.activo) {
    return res.status(403).json({ ok: false, error: 'La cuenta está suspendida. Contactá a Vixan.' });
  }
  attempts.delete(ip);
  let tenantId = u.tenant_id;
  if (!tenantId) tenantId = store.db.prepare('SELECT id FROM tenants ORDER BY id LIMIT 1').get()?.id || null;
  const token = crypto.randomBytes(32).toString('hex');
  store.db.prepare('INSERT INTO sessions (token, user_id, tenant_id, expires_at) VALUES (?,?,?,?)').run(token, u.id, tenantId, Date.now() + SESSION_DAYS * 86400000);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `vg_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`);
  store.logEvent(tenantId, u.id, 'login', u.email);
  ok(res, { email: u.email, rol: u.rol });
});
app.post('/api/auth/logout', (req, res) => {
  const token = parseCookies(req).vg_session;
  if (token) store.db.prepare('DELETE FROM sessions WHERE token=?').run(token);
  res.setHeader('Set-Cookie', 'vg_session=; Path=/; Max-Age=0');
  ok(res, true);
});

// ───────────── Webhooks públicos (antes del auth) ─────────────
app.use('/api/hooks', integrar.publicRouter);

// Vixan Tienda: registro e ingreso de compradores (lo usa la tienda desde el navegador; sin sesión de Vixan)
app.use('/api/v1/tienda/publico', cuentas.publico, checkout.publico);
// Notificaciones de pago de Mercado Pago para la tienda
app.use('/api/v1/tienda/mp', checkout.webhook);

app.use('/api', auth);

app.get('/api/auth/me', wrap((req) => {
  const t = store.db.prepare('SELECT id, nombre, slug, plan, webhook_key FROM tenants WHERE id=?').get(req.tenantId);
  return { user: req.user, tenant: t };
}));

// Cambiar la contraseña propia (cierra las demás sesiones)
const intentosClave = new Map();
app.post('/api/auth/password', wrap((req, res) => {
  if (!req.user?.id) { res.status(403).json({ ok: false, error: 'No disponible para claves de API' }); return; }
  const n = intentosClave.get(req.user.id) || 0;
  if (n >= 5) { res.status(429).json({ ok: false, error: 'Demasiados intentos. Cerrá sesión y volvé a entrar.' }); return; }
  const { actual, nueva } = req.body || {};
  const u = store.db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!store.checkPassword(String(actual || ''), u.pass_hash)) {
    intentosClave.set(req.user.id, n + 1);
    res.status(400).json({ ok: false, error: 'La contraseña actual no es correcta' }); return;
  }
  const clave = String(nueva || '');
  if (clave.length < 10) { res.status(400).json({ ok: false, error: 'La nueva contraseña debe tener al menos 10 caracteres' }); return; }
  intentosClave.delete(req.user.id);
  store.db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(store.hashPassword(clave), u.id);
  store.db.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').run(u.id, parseCookies(req).vg_session || '');
  store.logEvent(req.tenantId, u.id, 'cambio_clave', u.email);
  return true;
}));

// Superadmin: cambiar de cliente activo
app.post('/api/auth/switch-tenant', onlyRoles('superadmin'), wrap((req) => {
  const token = parseCookies(req).vg_session;
  store.db.prepare('UPDATE sessions SET tenant_id=? WHERE token=?').run(Number(req.body.tenantId), token);
  return true;
}));

app.use('/api/catalogo', catalogo.router);
// Vixan Tienda: catálogo para la tienda (clave de alcance "tienda") y panel de conexión
app.use('/api/v1/tienda', (req, res, next) => (store.db.prepare('SELECT activo FROM tenants WHERE id=?').get(req.tenantId)?.activo ? next() : res.status(403).json({ ok: false, error: 'La cuenta está suspendida' })), tienda.publicRouter);
app.use('/api/tienda/cuentas', cuentas.panel);
app.use('/api/tienda/cobros', checkout.panel);
app.use('/api/correo', cuentas.correoRouter);
app.use('/api/tienda', tienda.router);

// ───────────── CRUD genérico ─────────────
function checkEntity(req, res, next) {
  if (!ENTITIES.has(req.params.entity)) return res.status(404).json({ ok: false, error: 'Entidad desconocida' });
  next();
}
// Una factura con CAE no se edita ni se borra: se anula con nota de crédito
function bloquearFiscal(req, res, next) {
  if (req.params.entity === 'facturas' && store.get(req.tenantId, 'facturas', req.params.id)?.cae) return res.status(403).json({ ok: false, error: 'Una factura autorizada por ARCA no se puede editar ni borrar: anulala con una nota de crédito' });
  next();
}
app.get('/api/r/:entity', checkEntity, wrap((req) => {
  let rows = store.list(req.tenantId, req.params.entity);
  const q = String(req.query.q || '').toLowerCase().trim();
  if (q) rows = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  for (const [k, v] of Object.entries(req.query)) {
    if (!k.startsWith('f_') || v === '' || v === 'todos') continue;
    const campo = k.slice(2);
    rows = rows.filter((r) => String(r[campo] ?? '') === String(v));
  }
  if (req.query.desde || req.query.hasta) {
    const campo = req.query.campoFecha || 'fecha';
    rows = rows.filter((r) => { const f = String(r[campo] || '').slice(0, 10); return (!req.query.desde || f >= req.query.desde) && (!req.query.hasta || f <= req.query.hasta); });
  }
  return rows;
}));
app.get('/api/r/:entity/:id', checkEntity, wrap((req, res) => store.get(req.tenantId, req.params.entity, req.params.id) ?? res.status(404).json({ ok: false, error: 'No existe' })));
app.post('/api/r/:entity', checkEntity, wrap((req) => {
  const r = store.create(req.tenantId, req.params.entity, req.body || {});
  store.logEvent(req.tenantId, req.user.id, `${req.params.entity}.crear`, { id: r.id });
  if (STOCK_ENTITIES.has(req.params.entity)) tocaStock(req);
  return r;
}));
app.put('/api/r/:entity/:id', checkEntity, bloquearFiscal, wrap((req, res) => {
  const r = store.update(req.tenantId, req.params.entity, req.params.id, req.body || {});
  if (!r) return res.status(404).json({ ok: false, error: 'No existe' });
  store.logEvent(req.tenantId, req.user.id, `${req.params.entity}.editar`, { id: r.id });
  if (STOCK_ENTITIES.has(req.params.entity)) tocaStock(req);
  return r;
}));
app.delete('/api/r/:entity/:id', checkEntity, bloquearFiscal, wrap((req) => {
  store.logEvent(req.tenantId, req.user.id, `${req.params.entity}.borrar`, { id: req.params.id });
  if (STOCK_ENTITIES.has(req.params.entity)) tocaStock(req);
  return store.remove(req.tenantId, req.params.entity, req.params.id);
}));
app.post('/api/r/:entity/bulk-delete', checkEntity, wrap((req) => { const n = (req.body.ids || []).filter((id) => !(req.params.entity === 'facturas' && store.get(req.tenantId, 'facturas', id)?.cae) && store.remove(req.tenantId, req.params.entity, id)).length; if (STOCK_ENTITIES.has(req.params.entity)) tocaStock(req); return n; }));

// ───────────── Pedidos ─────────────
app.post('/api/pedidos', wrap((req) => {
  tocaStock(req);
  const b = req.body || {};
  const items = (b.items || []).map((i) => ({ sku: i.sku, nombre: i.nombre, cantidad: Number(i.cantidad) || 1, precio: Number(i.precio) || 0 }));
  const n = store.count(req.tenantId, 'pedidos') + 1001;
  return store.create(req.tenantId, 'pedidos', {
    numero: b.numero || `VG-${n}`, fecha: b.fecha || new Date().toISOString(), plataforma: b.plataforma || 'Venta directa',
    tipo_envio: b.tipo_envio || 'Vixan 24 h', cliente: b.cliente || 'Consumidor final', items,
    total: b.total ?? items.reduce((a, i) => a + i.cantidad * i.precio, 0), deposito: b.deposito || 'Central',
    pago: b.pago || 'Pendiente', metodo_pago: b.metodo_pago || 'Transferencia', estado: 'pendiente',
    direccion: b.direccion || '', localidad: b.localidad || '', cp: b.cp || '', telefono: b.telefono || '', notas: b.notas || '',
  });
}));
app.post('/api/pedidos/:id/estado', wrap((req, res) => { tocaStock(req); return logic.cambiarEstadoPedido(req.tenantId, req.params.id, req.body.estado, req.user.id) ?? res.status(404).json({ ok: false, error: 'No existe' }); }));
app.post('/api/pedidos/estado-masivo', wrap((req) => { tocaStock(req); return (req.body.ids || []).map((id) => logic.cambiarEstadoPedido(req.tenantId, id, req.body.estado, req.user.id)).filter(Boolean).length; }));
app.post('/api/presupuestos/:id/convertir', wrap((req) => {
  const p = store.get(req.tenantId, 'presupuestos', req.params.id);
  if (!p) throw new Error('No existe');
  const n = store.count(req.tenantId, 'pedidos') + 1001;
  const ped = store.create(req.tenantId, 'pedidos', { numero: `VG-${n}`, fecha: new Date().toISOString(), plataforma: 'Venta directa', tipo_envio: 'Vixan 24 h', cliente: p.cliente, items: p.items || [], total: p.total, deposito: 'Central', pago: 'Pendiente', metodo_pago: 'Transferencia', estado: 'pendiente' });
  store.update(req.tenantId, 'presupuestos', p.id, { estado: 'Convertido', pedido: ped.numero });
  return ped;
}));

// Auditoría de reingresos: aprobar devuelve stock al depósito central
app.post('/api/auditoria/:id/resolver', wrap((req) => {
  const a = store.get(req.tenantId, 'auditoria', req.params.id);
  if (!a || a.estado !== 'pendiente') throw new Error('Ya resuelto o inexistente');
  const aprobar = req.body.accion === 'aprobar';
  if (aprobar) {
    const p = store.get(req.tenantId, 'pedidos', a.pedido_id);
    // Un combo vuelve como sus componentes; una presentación, como parte del producto entero
    const cctx = catalogo.contexto(req.tenantId, { stock: false });
    for (const it of p?.items || []) for (const x of catalogo.expandir(it.sku, it.cantidad, cctx)) {
      const nombre = cctx.bySku.get(x.sku)?.nombre || it.nombre;
      store.create(req.tenantId, 'lotes', { lote: `REING-${a.pedido}`, sku: x.sku, producto: nombre, ingreso: logic.hoyAR(), vencimiento: '', cantidad: x.cantidad, costo_unit: 0, origen: 'Reingreso', deposito: 'Central' });
      store.create(req.tenantId, 'movimientos_stock', { fecha: new Date().toISOString(), tipo: 'Reingreso aprobado', sku: x.sku, producto: nombre, deposito: 'Central', lote: `REING-${a.pedido}`, cantidad: x.cantidad, nota: (req.body.nota || '') + (x.sku !== String(it.sku) ? ` (${it.cantidad}× ${it.sku})` : '') });
    }
  }
  tocaStock(req);
  return store.update(req.tenantId, 'auditoria', a.id, { estado: aprobar ? 'aprobado' : 'rechazado', resuelto_por: req.user.nombre || req.user.email, resuelto_at: new Date().toISOString(), nota: req.body.nota || '' });
}));

// Traspaso entre depósitos
app.post('/api/inventario/traspaso', wrap((req) => {
  const { lote_id, deposito_destino, cantidad } = req.body;
  const l = store.get(req.tenantId, 'lotes', lote_id);
  const c = Number(cantidad);
  if (!l || !(c > 0) || c > Number(l.cantidad)) throw new Error('Cantidad inválida para ese lote');
  store.update(req.tenantId, 'lotes', l.id, { cantidad: Number(l.cantidad) - c });
  const nuevo = store.create(req.tenantId, 'lotes', { ...l, id: undefined, cantidad: c, deposito: deposito_destino, origen: `Traspaso desde ${l.deposito}` });
  tocaStock(req);
  store.create(req.tenantId, 'movimientos_stock', { fecha: new Date().toISOString(), tipo: 'Traspaso', sku: l.sku, producto: l.producto, deposito: `${l.deposito} → ${deposito_destino}`, lote: l.lote, cantidad: c, nota: '' });
  return nuevo;
}));

// ───────────── Reportes / cálculos ─────────────
app.get('/api/stats/dashboard', wrap((req) => logic.dashboard(req.tenantId, req.query)));
app.get('/api/stats/stock', wrap((req) => logic.stockPorSku(req.tenantId)));
app.get('/api/stats/resultados', wrap((req) => logic.resultados(req.tenantId, req.query)));
app.get('/api/stats/proyecciones', wrap((req) => logic.proyecciones(req.tenantId, req.query)));
app.get('/api/stats/iva', wrap((req) => logic.libroIva(req.tenantId, req.query)));
app.get('/api/stats/cuenta-corriente', wrap((req) => logic.cuentaCorrienteServicio(req.tenantId, req.query)));
app.get('/api/proveedores/cc/resumen', wrap((req) => logic.ccResumen(req.tenantId)));
app.get('/api/proveedores/cc/calendario', wrap((req) => logic.calendarioPagos(req.tenantId)));
app.get('/api/proveedores/:id/cc', wrap((req) => logic.ccProveedor(req.tenantId, req.params.id)));
app.post('/api/cotizar', wrap((req) => logic.cotizar(req.tenantId, req.body || {})));
app.post('/api/proyecciones/crear-oc', wrap((req) => {
  const items = req.body.items || [];
  const porProv = {};
  for (const it of items) (porProv[it.proveedor_id || 0] ||= []).push(it);
  return Object.entries(porProv).map(([pid, its]) => {
    const prov = store.get(req.tenantId, 'proveedores', pid);
    const n = store.count(req.tenantId, 'ordenes_reabastecimiento') + 1;
    return store.create(req.tenantId, 'ordenes_reabastecimiento', { numero: `OC-${String(n).padStart(5, '0')}`, fecha: logic.hoyAR(), proveedor: prov?.nombre_fantasia || 'Sin proveedor', proveedor_id: prov?.id || null, items: its.map((i) => ({ sku: i.sku, nombre: i.producto, cantidad: i.aComprar, costo: i.costo })), total: its.reduce((a, i) => a + i.aComprar * (Number(i.costo) || 0), 0), estado: 'Borrador', entrega: '' });
  });
}));

// ───────────── Configuración, usuarios y API keys ─────────────
// La configuración se devuelve SIN secretos (claves de APIs, certificados, tokens)
const PRIVADAS = /^(arca_secret|arca_ta_|arca$|woo$|ml$|correo$|mercadopago$)/; // correo: la contraseña SMTP solo se maneja en /api/correo
function settingsPublicas(t) {
  const s = store.getSettings(t);
  for (const k of Object.keys(s)) if (PRIVADAS.test(k)) delete s[k];
  // el logo viaja aparte (GET /api/logo): acá sólo si está cargado
  if (s.logo_archivo) { s.logo_cargado = { nombre: s.logo_archivo.nombre || '', version: s.logo_archivo.version || 1 }; delete s.logo_archivo; }
  return s;
}
// Logo de la cuenta: sale en facturas, notas de crédito/débito y remitos
const LOGO_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;
app.get('/api/logo', (req, res) => {
  const l = store.getSettings(req.tenantId).logo_archivo;
  const m = l && LOGO_RE.exec(l.data || '');
  if (!m) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=300').type(`image/${m[1]}`).send(Buffer.from(m[2], 'base64'));
});
app.post('/api/logo', onlyRoles('superadmin', 'admin'), wrap((req) => {
  const data = String(req.body?.data || '');
  if (!LOGO_RE.test(data)) throw new Error('El logo tiene que ser una imagen PNG, JPG o WEBP');
  if (data.length > 1_400_000) throw new Error('La imagen es muy pesada: usá una de menos de 1 MB');
  const ant = store.getSettings(req.tenantId).logo_archivo;
  store.setSetting(req.tenantId, 'logo_archivo', { data, nombre: String(req.body.nombre || '').slice(0, 120), version: (ant?.version || 0) + 1 });
  return true;
}));
app.delete('/api/logo', onlyRoles('superadmin', 'admin'), wrap((req) => { store.setSetting(req.tenantId, 'logo_archivo', null); return true; }));

// Aviso de deuda: pedidos impagos del cliente en los canales que cuentan (Mercado Libre nunca: es prepago)
app.get('/api/clientes/deuda', wrap((req) => {
  const cfg = store.getSettings(req.tenantId).deuda || {};
  const nombre = String(req.query.cliente || '').trim().toLowerCase();
  if (!cfg.avisar || !nombre) return { avisar: !!cfg.avisar, pedidos: [], total: 0 };
  const canales = cfg.canales || {};
  const cuenta = (plat) => {
    if (/mercado ?libre/i.test(plat || '')) return false;
    const k = /venta directa|manual|presupuesto/i.test(plat || '') ? 'directa' : /shopify/i.test(plat) ? 'shopify' : /tienda ?nube/i.test(plat) ? 'tiendanube' : /woo/i.test(plat) ? 'woocommerce' : /red ?101/i.test(plat) ? 'red101' : /vixan market/i.test(plat) ? 'market' : 'otros';
    return canales[k] !== false;
  };
  const excluir = Number(req.query.excluir) || 0;
  const pedidos = store.list(req.tenantId, 'pedidos').filter((p) => p.id !== excluir && String(p.cliente || '').trim().toLowerCase() === nombre && p.estado !== 'cancelado' && String(p.pago || '').toLowerCase() !== 'pagado' && cuenta(p.plataforma))
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).map((p) => ({ id: p.id, numero: p.numero, fecha: p.fecha, total: Number(p.total) || 0, plataforma: p.plataforma }));
  return { avisar: true, pedidos, total: Math.round(pedidos.reduce((a, p) => a + p.total, 0) * 100) / 100 };
}));
// Vista previa de la percepción de IVA para la factura manual
app.post('/api/arca/percepcion', wrap((req) => {
  const b = req.body || {};
  const cond = Number(b.cond_iva_receptor) || 5;
  const letra = b.tipo && b.tipo !== 'auto' ? b.tipo : arca.letraPara(req.tenantId, cond);
  const cfg = arca.configPercepcion(req.tenantId);
  if (!cfg.activa) return { activa: false };
  const items = (b.items || []).filter((i) => Number(i.cantidad) > 0);
  const calc = arca.calcularImportes(letra, items.map((i) => ({ cantidad: Number(i.cantidad), precio: Number(i.neto || 0), alicuota: Number(i.alicuota ?? 21), imp_int: Number(i.imp_int || 0) })));
  const auto = arca.calcularPercepcion(req.tenantId, { letra, condReceptor: cond, plataforma: 'Venta directa', items, calc });
  const forzada = arca.calcularPercepcion(req.tenantId, { letra, condReceptor: cond, plataforma: 'Venta directa', items, calc, forzar: true });
  return { activa: true, letra, aplica: !!forzada, auto: !!auto, importe: forzada?.importe || 0, alic: forzada?.alic || 0 };
}));
app.get('/api/settings', wrap((req) => settingsPublicas(req.tenantId)));
app.put('/api/settings', onlyRoles('superadmin', 'admin'), wrap((req) => {
  for (const [k, v] of Object.entries(req.body || {})) { if (PRIVADAS.test(k)) continue; store.setSetting(req.tenantId, k, v); }
  return settingsPublicas(req.tenantId);
}));

app.get('/api/users', wrap((req) => store.db.prepare('SELECT id, email, nombre, rol, activo, created_at FROM users WHERE tenant_id=?').all(req.tenantId)));
app.post('/api/users', onlyRoles('superadmin', 'admin'), wrap((req) => {
  const { email, nombre, rol = 'operador', password } = req.body;
  if (!email || !password || String(password).length < 8) throw new Error('Email y contraseña (mín. 8 caracteres) son obligatorios');
  if (!['admin', 'operador'].includes(rol)) throw new Error('Rol inválido');
  const r = store.db.prepare('INSERT INTO users (tenant_id, email, nombre, rol, pass_hash) VALUES (?,?,?,?,?)').run(req.tenantId, email.trim(), nombre || '', rol, store.hashPassword(password));
  return { id: Number(r.lastInsertRowid) };
}));
app.put('/api/users/:id', onlyRoles('superadmin', 'admin'), wrap((req) => {
  const u = store.db.prepare('SELECT * FROM users WHERE id=? AND tenant_id=?').get(Number(req.params.id), req.tenantId);
  if (!u) throw new Error('No existe');
  if (req.body.password) store.db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(store.hashPassword(req.body.password), u.id);
  if (req.body.activo !== undefined) store.db.prepare('UPDATE users SET activo=? WHERE id=?').run(req.body.activo ? 1 : 0, u.id);
  if (req.body.rol && ['admin', 'operador'].includes(req.body.rol)) store.db.prepare('UPDATE users SET rol=? WHERE id=?').run(req.body.rol, u.id);
  return true;
}));
app.get('/api/api-keys', wrap((req) => store.db.prepare('SELECT id, nombre, prefijo, created_at FROM api_keys WHERE tenant_id=?').all(req.tenantId)));
app.post('/api/api-keys', onlyRoles('superadmin', 'admin'), wrap((req) => {
  const key = 'vg_' + crypto.randomBytes(24).toString('hex');
  store.db.prepare('INSERT INTO api_keys (tenant_id, nombre, key_hash, prefijo) VALUES (?,?,?,?)').run(req.tenantId, req.body.nombre || 'Clave', store.sha256(key), key.slice(0, 10));
  return { key }; // se muestra una sola vez
}));
app.delete('/api/api-keys/:id', onlyRoles('superadmin', 'admin'), wrap((req) => store.db.prepare('DELETE FROM api_keys WHERE id=? AND tenant_id=?').run(Number(req.params.id), req.tenantId).changes > 0));
app.get('/api/eventos', wrap((req) => store.db.prepare('SELECT * FROM event_log WHERE tenant_id=? ORDER BY id DESC LIMIT 200').all(req.tenantId)));


// ───────────── Facturación electrónica ARCA ─────────────
const aWrap = (fn) => async (req, res) => { try { res.json({ ok: true, data: await fn(req) }); } catch (e) { res.status(400).json({ ok: false, error: e.message }); } };
const soloAdmin = onlyRoles('superadmin', 'admin');
app.get('/api/arca/estado', wrap((req) => arca.estado(req.tenantId)));
app.post('/api/arca/ambiente', soloAdmin, wrap((req) => {
  const amb = req.body.ambiente === 'produccion' ? 'produccion' : 'homologacion';
  store.setSetting(req.tenantId, 'arca', { ...(store.getSettings(req.tenantId).arca || {}), ambiente: amb });
  return arca.estado(req.tenantId);
}));
app.post('/api/arca/generar-csr', soloAdmin, aWrap((req) => arca.generarCSR(req.tenantId, req.body || {})));
app.post('/api/arca/certificado', soloAdmin, aWrap((req) => arca.guardarCertificado(req.tenantId, req.body.pem)));
app.post('/api/arca/probar', soloAdmin, aWrap((req) => arca.probar(req.tenantId)));
app.post('/api/arca/facturar-pedidos', aWrap((req) => arca.facturarPedidos(req.tenantId, (req.body.ids || []).map(Number))));
app.post('/api/arca/factura-manual', aWrap((req) => arca.facturaManual(req.tenantId, req.body || {})));
app.post('/api/arca/facturas/:id/nota-credito', aWrap((req) => arca.notaCredito(req.tenantId, req.params.id, req.body.motivo, req.body.monto)));
app.use('/api/facturacion', facturacion.router);
app.use('/api/contabilidad', contabilidad.router);
app.get('/api/arca/facturas/:id/imprimir', async (req, res) => {
  try { res.type('html').send(await facturaHTML(req.tenantId, req.params.id)); } catch (e) { res.status(404).send(e.message); }
});

// ───────────── Integraciones (ML / WooCommerce) ─────────────
app.use('/api/integraciones', integrar.privateRouter);

// ───────────── Panel Vixan (superadmin): clientes de la plataforma ─────────────

// Estado del servidor y copia de seguridad descargable (superadmin)
app.get('/api/admin/sistema', onlyRoles('superadmin'), wrap(() => {
  const os = require('os');
  const fs = require('fs');
  const dbPath = process.env.VIXAN_DB || require('path').join(__dirname, '..', 'data', 'vixan.db');
  let disco = null;
  try { const st = fs.statfsSync(require('path').dirname(dbPath)); disco = { total: st.blocks * st.bsize, libre: st.bavail * st.bsize }; } catch {}
  let base = 0; try { base = fs.statSync(dbPath).size; } catch {}
  return { version: require('../package.json').version, memoria: { total: os.totalmem(), libre: os.freemem() }, disco, base, uptime: process.uptime(), node: process.version, carga: os.loadavg()[0], cpus: os.cpus().length };
}));
app.get('/api/admin/copia', onlyRoles('superadmin'), (req, res) => {
  const fs = require('fs'); const path = require('path'); const os = require('os');
  const tmp = path.join(os.tmpdir(), `vixan-copia-${Date.now()}.db`);
  try {
    store.db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`); // copia consistente aunque Vixan esté funcionando
    const nombre = `vixan-copia-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.db`;
    res.download(tmp, nombre, () => fs.unlink(tmp, () => {}));
    store.logEvent(null, req.user.id, 'copia.descarga', nombre);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.get('/api/admin/tenants', onlyRoles('superadmin'), wrap(() => store.db.prepare(`
  SELECT t.*, (SELECT COUNT(*) FROM users u WHERE u.tenant_id=t.id) usuarios,
  (SELECT COUNT(*) FROM records r WHERE r.tenant_id=t.id AND r.entity='pedidos') pedidos FROM tenants t ORDER BY t.id`).all()));
app.post('/api/admin/tenants', onlyRoles('superadmin'), wrap((req) => {
  const { nombre, plan = 'estandar', email, password, nombreUsuario } = req.body;
  if (!nombre || !email || !password || String(password).length < 8) throw new Error('Nombre, email y contraseña (mín. 8) son obligatorios');
  const slug = nombre.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + crypto.randomBytes(2).toString('hex');
  const t = store.db.prepare('INSERT INTO tenants (nombre, slug, plan, webhook_key) VALUES (?,?,?,?)').run(nombre, slug, plan, crypto.randomBytes(16).toString('hex'));
  store.db.prepare('INSERT INTO users (tenant_id, email, nombre, rol, pass_hash) VALUES (?,?,?,?,?)').run(t.lastInsertRowid, email.trim(), nombreUsuario || nombre, 'admin', store.hashPassword(password));
  store.create(Number(t.lastInsertRowid), 'depositos', { nombre: 'Central', dentro_de: '', para: 'Venta', se_vende: true, estado: 'Abierto' });
  return { id: Number(t.lastInsertRowid), slug };
}));
app.put('/api/admin/tenants/:id', onlyRoles('superadmin'), wrap((req) => {
  const { activo, plan, nombre } = req.body;
  if (activo !== undefined) store.db.prepare('UPDATE tenants SET activo=? WHERE id=?').run(activo ? 1 : 0, Number(req.params.id));
  if (plan) store.db.prepare('UPDATE tenants SET plan=? WHERE id=?').run(plan, Number(req.params.id));
  if (nombre) store.db.prepare('UPDATE tenants SET nombre=? WHERE id=?').run(nombre, Number(req.params.id));
  return true;
}));

// ───────────── Frontend ─────────────
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

module.exports = app;

if (require.main === module) {
  require('./seed').ensureSeed();
  catalogo.migrarTodos();
  woo.iniciarAuto();
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || undefined; // en el servidor: 127.0.0.1 (solo se entra por el HTTPS de Caddy)
  const srv = app.listen(PORT, HOST, () => console.log(`Vixan escuchando en http://${HOST || 'localhost'}:${PORT}`));
  // Al apagar (Ctrl+C o el servidor), se cierra la base de datos en orden
  const cerrar = () => { srv.close(); try { store.db.close(); } catch {} process.exit(0); };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
}
