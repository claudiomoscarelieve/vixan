// Vixan Market — API para la tienda online (/api/tienda/v1)
// La tienda es una app aparte (repositorio vixan-tienda) que atiende las tiendas de todos los clientes.
// Entra con una clave de plataforma (VIXAN_TIENDA_KEY) que solo abre estas rutas: no puede leer
// facturas, clientes, proveedores ni nada del CRUD genérico. Cada pedido dice a qué tienda pertenece
// con el encabezado X-Tienda-Host (el dominio que abrió el comprador).
const express = require('express');
const crypto = require('crypto');
const store = require('./db');
const catalogo = require('./catalogo');
const logic = require('./logic');

const env = (k) => process.env[k] || '';
const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round(v * 100) / 100;
const DOMINIO_BASE = () => (env('TIENDA_DOMINIO') || 'vixan.com.ar').toLowerCase();
const RESERVADOS = new Set(['app', 'www', 'api', 'admin', 'mail', 'tienda', 'market']);

// ───────────── Qué tienda es ─────────────
const limpiarHost = (h) => String(h || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/:].*$/, '').replace(/\.$/, '');
const slugValido = (s) => /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/.test(String(s || ''));
function tiendaDe(t) {
  const s = store.getSettings(t);
  return { ...(s.tienda || {}) };
}
// Recorre los clientes activos con la tienda abierta. Son pocos: se calcula en cada pedido, sin caché,
// así abrir o cerrar una tienda se nota al instante.
function resolver(host) {
  const h = limpiarHost(host);
  if (!h) return null;
  const base = DOMINIO_BASE();
  const sub = h.endsWith('.' + base) ? h.slice(0, -(base.length + 1)) : null;
  for (const t of store.db.prepare('SELECT id, nombre, slug FROM tenants WHERE activo=1').all()) {
    const cfg = tiendaDe(t.id);
    if (!cfg.abierta) continue;
    const slug = String(cfg.slug || '').toLowerCase();
    const propio = limpiarHost(cfg.dominio);
    if ((sub && slug && sub === slug && !RESERVADOS.has(slug)) || (propio && (h === propio || h === 'www.' + propio))) return { tenant: t, cfg };
  }
  return null;
}

// ───────────── Precios para el público ─────────────
function listaDe(cfg, ctx) {
  const v = String(cfg.lista || 'general');
  if (v === 'general' || !v) return 'general';
  const l = ctx.listasById.get(v) || ctx.listas.find((x) => String(x.nombre).toLowerCase() === v.toLowerCase());
  return l ? l.id : 'general';
}
const hoy = () => logic.hoyAR();
function promosVigentes(t) {
  const d = hoy();
  const m = new Map();
  for (const p of store.list(t, 'tienda_promos')) {
    if (!p.activa || !p.sku || (p.desde && d < String(p.desde).slice(0, 10)) || (p.hasta && d > String(p.hasta).slice(0, 10))) continue;
    if (!m.has(String(p.sku))) m.set(String(p.sku), p);
  }
  return m;
}
// Precio unitario con la promoción (el 2x1 no cambia el unitario: se descuenta en la línea)
function unitarioConPromo(precio, promo) {
  if (!promo || precio == null) return precio;
  if (promo.tipo === 'Porcentaje') return r2(precio * (1 - n0(promo.valor) / 100));
  if (promo.tipo === 'Monto fijo') return r2(Math.max(0, precio - n0(promo.valor)));
  return precio;
}
function totalLinea(precio, cantidad, promo) {
  const u = unitarioConPromo(precio, promo);
  if (promo?.tipo === '2x1') return r2(u * Math.ceil(cantidad / 2));
  return r2(u * cantidad);
}
const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const publicBase = () => (env('PUBLIC_URL') || 'http://localhost:3000').replace(/\/$/, '');
const urlImagen = (u) => (/^https?:\/\//.test(u) ? u : publicBase() + u);

function armarCatalogo(t, cfg) {
  const ctx = catalogo.contexto(t);
  const lista = listaDe(cfg, ctx);
  const promos = promosVigentes(t);
  const ocultos = new Set(String(cfg.ocultos || '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean));
  const productos = [];
  for (const p of ctx.productos) {
    if (!p.market || p.activo === false || ocultos.has(String(p.sku))) continue;
    const precio = catalogo.precioEnLista(p, lista, ctx);
    if (precio == null || !(precio > 0)) continue; // sin precio no se puede vender
    const promo = promos.get(String(p.sku)) || null;
    productos.push({
      sku: String(p.sku), slug: `${slugify(p.nombre)}-${slugify(p.sku)}`, nombre: p.nombre, descripcion: p.descripcion || '',
      marca: p.marca || '', categoria: p.categoria || '', tipo: catalogo.tipoDe(p),
      imagenes: (p.imagenes || []).map(urlImagen),
      precio_lista: precio, precio: unitarioConPromo(precio, promo),
      promo: promo ? { tipo: promo.tipo, valor: n0(promo.valor), etiqueta: promo.etiqueta || '', hasta: promo.hasta || null } : null,
      stock: Math.max(0, Math.floor(catalogo.disponible(p, ctx))),
      peso_kg: p.peso_kg ?? null, medidas: p.largo ? { largo: p.largo, ancho: p.ancho, alto: p.alto } : null,
      presentacion: p.presentacion || null, fraccion_de: p.fraccion_de || null,
      actualizado: p._updated,
    });
  }
  return { productos, ctx, lista, promos };
}

function configPublica(tenant, cfg) {
  return {
    nombre: cfg.nombre || tenant.nombre, slug: cfg.slug || '', dominio: limpiarHost(cfg.dominio) || null,
    color: /^#[0-9a-f]{6}$/i.test(cfg.color || '') ? cfg.color : '#1FB1A4',
    logo: cfg.logo ? urlImagen(cfg.logo) : null,
    envio: { fijo: cfg.envio ? n0(cfg.envio) : null, cotizador: !cfg.envio },
    pagos: { mercadopago: !!cfg.pago_mp, transferencia: !!cfg.pago_transf, descuento_transferencia: cfg.pago_transf ? 5 : 0, datos_transferencia: cfg.datos_transferencia || '' },
    contacto: { email: cfg.email || '', whatsapp: cfg.whatsapp || '' },
    moneda: 'ARS',
  };
}

// ───────────── Envío ─────────────
function opcionesEnvio(t, cfg, { cp, entrega }, items, ctx) {
  if (entrega === 'retiro') return [{ id: 'retiro', transportista: 'Retiro en el local', servicio: 'Retiro', precio: 0, plazo: 'Te avisamos cuando esté listo' }];
  if (cfg.envio) return [{ id: 'fijo', transportista: 'Envío', servicio: 'A domicilio', precio: n0(cfg.envio), plazo: '' }];
  const bultos = [];
  for (const it of items || []) {
    const p = ctx.bySku.get(String(it.sku));
    const peso = n0(p?.peso_kg) || 1;
    bultos.push({ peso: peso * n0(it.cantidad || 1), alto: n0(p?.alto) || 10, ancho: n0(p?.ancho) || 20, largo: n0(p?.largo) || 30 });
  }
  const r = logic.cotizar(t, { cp, entrega: entrega === 'sucursal' ? 'sucursal' : 'domicilio', bultos: bultos.length ? [{ peso: bultos.reduce((a, b) => a + b.peso, 0), alto: 0, ancho: 0, largo: 0 }] : [] });
  if (r.error) throw new Error(r.error);
  return r.opciones.map((o) => ({ id: slugify(o.transportista + ' ' + o.servicio), ...o }));
}

// ───────────── Rutas ─────────────
const router = express.Router();
const wrap = (fn) => (req, res) => {
  try { const r = fn(req, res); if (r !== undefined) res.json({ ok: true, data: r }); } catch (e) { res.status(e.status || 400).json({ ok: false, error: e.message }); }
};
const err = (status, msg) => Object.assign(new Error(msg), { status });

// Caddy pregunta acá antes de sacar un certificado para un dominio propio (on_demand_tls "ask").
// Sin clave: solo responde si el dominio es de una tienda abierta.
router.get('/dominio-ok', (req, res) => {
  const d = limpiarHost(req.query.domain);
  if (d && resolver(d)) return res.status(200).send('ok');
  res.status(404).send('no');
});

// Clave de plataforma: compara en tiempo constante
function claveTienda(req, res, next) {
  const esperada = env('VIXAN_TIENDA_KEY');
  if (esperada.length < 32) return res.status(503).json({ ok: false, error: 'La API de tienda está desactivada: falta VIXAN_TIENDA_KEY (mínimo 32 caracteres) en el .env' });
  const dada = Buffer.from(String(req.headers['x-tienda-key'] || ''));
  const buena = Buffer.from(esperada);
  if (dada.length !== buena.length || !crypto.timingSafeEqual(dada, buena)) return res.status(401).json({ ok: false, error: 'Clave de tienda inválida' });
  next();
}
function tiendaDelPedido(req, res, next) {
  const r = resolver(req.headers['x-tienda-host']);
  if (!r) return res.status(404).json({ ok: false, error: 'No hay una tienda abierta en ese dominio' });
  req.tenantId = r.tenant.id; req.tenant = r.tenant; req.tiendaCfg = r.cfg;
  next();
}
router.use(claveTienda, tiendaDelPedido);

router.get('/config', wrap((req) => configPublica(req.tenant, req.tiendaCfg)));

router.get('/productos', wrap((req) => {
  const { productos } = armarCatalogo(req.tenantId, req.tiendaCfg);
  return productos;
}));
router.get('/productos/:sku', wrap((req) => {
  const { productos } = armarCatalogo(req.tenantId, req.tiendaCfg);
  const p = productos.find((x) => x.sku === req.params.sku || x.slug === req.params.sku);
  if (!p) throw err(404, 'Ese producto no está en la tienda');
  return p;
}));
router.get('/categorias', wrap((req) => {
  const { productos } = armarCatalogo(req.tenantId, req.tiendaCfg);
  const cuenta = new Map();
  for (const p of productos) if (p.categoria) cuenta.set(p.categoria, (cuenta.get(p.categoria) || 0) + 1);
  return [...cuenta].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([nombre, productos]) => ({ nombre, slug: slugify(nombre), productos }));
}));

// Cotiza el envío del carrito: body {cp, entrega: domicilio|sucursal|retiro, items:[{sku,cantidad}]}
router.post('/cotizar-envio', wrap((req) => {
  const ctx = catalogo.contexto(req.tenantId, { stock: false });
  return opcionesEnvio(req.tenantId, req.tiendaCfg, req.body || {}, (req.body || {}).items, ctx);
}));

// Crea el pedido. Los precios, el stock y el envío se calculan acá: lo que manda la tienda solo dice
// qué productos y cuántos. body: {referencia, items:[{sku,cantidad}], cliente:{nombre,email,telefono,doc,condicion_iva},
// envio:{entrega, opcion, direccion, localidad, provincia, cp}, metodo_pago: mercadopago|transferencia, notas}
router.post('/pedidos', wrap((req) => {
  const t = req.tenantId;
  const cfg = req.tiendaCfg;
  const b = req.body || {};
  const referencia = String(b.referencia || '').trim();
  if (!referencia || referencia.length > 80) throw new Error('Falta la referencia del pedido (un id único de la tienda)');
  // Si la tienda reintenta, devuelve el mismo pedido y no crea otro
  const ya = store.porExterno(t, 'pedidos', `market:${referencia}`)[0];
  if (ya) return resumenPedido(ya);

  const cli = b.cliente || {};
  const nombre = String(cli.nombre || '').trim();
  const email = String(cli.email || '').trim().toLowerCase();
  if (!nombre || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Faltan el nombre o un email válido del comprador');
  const metodo = b.metodo_pago === 'transferencia' ? 'transferencia' : 'mercadopago';
  if (metodo === 'transferencia' && !cfg.pago_transf) throw new Error('La tienda no acepta transferencia');
  if (metodo === 'mercadopago' && !cfg.pago_mp) throw new Error('La tienda no acepta Mercado Pago');

  // Mismo SKU en dos líneas = una sola línea
  const pedidos = new Map();
  for (const it of b.items || []) {
    const c = Math.floor(n0(it.cantidad));
    if (!it.sku || c <= 0 || c > 999) throw new Error('Cantidad inválida');
    pedidos.set(String(it.sku), (pedidos.get(String(it.sku)) || 0) + c);
  }
  if (!pedidos.size) throw new Error('El carrito está vacío');

  const { productos, ctx, promos } = armarCatalogo(t, cfg);
  const bySku = new Map(productos.map((p) => [p.sku, p]));
  // Stock: se suma lo que piden todas las líneas en productos físicos (un combo y su componente comparten stock)
  const necesita = new Map();
  for (const [sku, cant] of pedidos) {
    if (!bySku.has(sku)) throw new Error(`El producto ${sku} ya no está a la venta`);
    for (const x of catalogo.expandir(sku, cant, ctx)) necesita.set(x.sku, (necesita.get(x.sku) || 0) + x.cantidad);
  }
  const sinStock = [];
  for (const [sku, cant] of necesita) if ((ctx.stock.get(sku)?.disponible || 0) + 1e-9 < cant) sinStock.push(sku);
  if (sinStock.length) {
    const afectados = [...pedidos.keys()].filter((s) => catalogo.expandir(s, 1, ctx).some((x) => sinStock.includes(x.sku)));
    throw Object.assign(err(409, 'No hay stock suficiente de: ' + afectados.map((s) => bySku.get(s).nombre).join(', ')), { sinStock: afectados });
  }

  const items = [...pedidos].map(([sku, cantidad]) => {
    const p = bySku.get(sku);
    const promo = promos.get(sku) || null;
    const subtotal = totalLinea(p.precio_lista, cantidad, promo);
    return { sku, nombre: p.nombre, cantidad, precio: r2(subtotal / cantidad), precio_lista: p.precio_lista, promo: promo?.etiqueta || promo?.tipo || null };
  });
  const subtotal = r2(items.reduce((a, i) => a + i.precio * i.cantidad, 0));

  const envio = b.envio || {};
  const entrega = ['domicilio', 'sucursal', 'retiro'].includes(envio.entrega) ? envio.entrega : 'domicilio';
  if (entrega !== 'retiro' && !cfg.envio && !String(envio.cp || '').trim()) throw new Error('Falta el código postal');
  const opciones = opcionesEnvio(t, cfg, { cp: envio.cp, entrega }, [...pedidos].map(([sku, cantidad]) => ({ sku, cantidad })), ctx);
  const opcion = opciones.find((o) => o.id === envio.opcion) || (opciones.length === 1 ? opciones[0] : null);
  if (!opcion) throw new Error('Elegí una forma de envío');
  if (entrega !== 'retiro' && !String(envio.direccion || '').trim()) throw new Error('Falta la dirección de entrega');

  const descuento = metodo === 'transferencia' ? r2(subtotal * 0.05) : 0;
  const total = r2(subtotal - descuento + n0(opcion.precio));

  // Cliente de Vixan: se vincula por email o DNI/CUIT, como con WooCommerce
  const doc = String(cli.doc || '').replace(/\D/g, '');
  const wc = require('./woo-clientes');
  const v = wc.vincularCliente(t, { nombre, email, telefono: cli.telefono || '', doc: doc || null, condicion_iva: cli.condicion_iva || null, direccion: envio.direccion || '', localidad: envio.localidad || '', cp: envio.cp || '' });
  if (v.accion === 'creado') store.update(t, 'clientes', v.cliente.id, { etiquetas: ['Vixan Market'], origen: 'Vixan Market' });

  const numero = `VM-${store.count(t, 'pedidos') + 1001}`;
  const ped = store.create(t, 'pedidos', {
    numero, external_id: `market:${referencia}`, fecha: new Date().toISOString(), plataforma: 'Vixan Market',
    tipo_envio: entrega === 'retiro' ? 'Retiro' : `${opcion.transportista} · ${opcion.servicio}`,
    cliente: nombre, cliente_id: v.cliente.id, email, doc: doc || '', condicion_iva: cli.condicion_iva || '',
    items, subtotal, descuento, costo_envio: n0(opcion.precio), total, deposito: 'Central',
    pago: 'Pendiente', metodo_pago: metodo === 'transferencia' ? 'Transferencia' : 'Mercado Pago', estado: 'pendiente',
    direccion: envio.direccion || '', localidad: envio.localidad || '', provincia: envio.provincia || '', cp: envio.cp || '', telefono: cli.telefono || '',
    notas: String(b.notas || '').slice(0, 1000),
  });
  store.logEvent(t, null, 'market.pedido', { numero, total });
  require('./tienda-avisos').avisarCambio(t);
  try { require('./woo').programarEnvioStock(t); } catch { /* sin Woo */ }
  return resumenPedido(ped);
}));

function resumenPedido(p) {
  return { id: p.id, numero: p.numero, referencia: String(p.external_id || '').replace(/^market:/, ''), estado: p.estado, pago: p.pago, metodo_pago: p.metodo_pago, items: p.items, subtotal: p.subtotal, descuento: p.descuento, costo_envio: p.costo_envio, total: p.total, fecha: p.fecha, tipo_envio: p.tipo_envio };
}
const pedidoDe = (req) => {
  const p = store.porExterno(req.tenantId, 'pedidos', `market:${req.params.ref}`)[0];
  if (!p) throw err(404, 'No existe ese pedido');
  return p;
};
router.get('/pedidos/:ref', wrap((req) => resumenPedido(pedidoDe(req))));

// Pago confirmado (la tienda verificó el pago con Mercado Pago). body: {monto, referencia_pago, medio}
router.post('/pedidos/:ref/pago', wrap((req) => {
  const p = pedidoDe(req);
  if (p.pago === 'Pagado') return resumenPedido(p);
  const monto = n0(req.body?.monto);
  if (Math.abs(monto - n0(p.total)) > 1) throw new Error(`El monto pagado (${monto}) no coincide con el total del pedido (${p.total})`);
  const r = store.update(req.tenantId, 'pedidos', p.id, { pago: 'Pagado', pago_ref: String(req.body?.referencia_pago || '').slice(0, 80), pago_fecha: new Date().toISOString() });
  store.logEvent(req.tenantId, null, 'market.pago', { numero: p.numero, monto });
  return resumenPedido(r);
}));

// Pago rechazado o vencido: cancela el pedido y libera el stock
router.post('/pedidos/:ref/cancelar', wrap((req) => {
  const p = pedidoDe(req);
  if (p.pago === 'Pagado') throw new Error('El pedido ya está pagado: se cancela desde Vixan');
  if (p.estado !== 'pendiente') throw new Error('El pedido ya se está preparando: se cancela desde Vixan');
  const r = logic.cambiarEstadoPedido(req.tenantId, p.id, 'cancelado', null);
  require('./tienda-avisos').avisarCambio(req.tenantId);
  return resumenPedido(r || store.get(req.tenantId, 'pedidos', p.id));
}));

module.exports = { router, resolver, armarCatalogo, unitarioConPromo, totalLinea, slugify };
