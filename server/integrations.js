// Vixan — integraciones con Mercado Libre y WooCommerce.
// Mercado Libre: OAuth 2.0 + notificaciones (topic orders_v2) → crea el pedido.
// WooCommerce: webhook "Order created" firmado con HMAC; la sincronización por API REST está en woo.js.
const express = require('express');
const crypto = require('crypto');
const store = require('./db');

const ML_AUTH = 'https://auth.mercadolibre.com.ar/authorization';
const ML_API = 'https://api.mercadolibre.com';
const env = (k) => process.env[k] || '';
const baseUrl = () => env('PUBLIC_URL') || 'http://localhost:3000';

function tenantByKey(key) {
  return store.db.prepare('SELECT * FROM tenants WHERE webhook_key=? AND activo=1').get(String(key || ''));
}
function existePedido(t, origen, externalId) {
  return store.porExterno(t, 'pedidos', externalId).some((p) => p.origen === origen);
}
const mapEstadoWoo = (s) => ({ pending: 'pendiente', processing: 'para_armar', 'on-hold': 'pendiente', completed: 'entregado', cancelled: 'cancelado', refunded: 'cancelado', failed: 'cancelado' }[s] || 'pendiente');

function pedidoDesdeWoo(t, o, cuenta, cacheClientes) {
  if (existePedido(t, 'woocommerce', o.id)) return null;
  const b = o.billing || {}; const s = o.shipping || {};
  // Cada pedido crea o vincula su cliente (por email o documento) con el DNI/CUIT del checkout
  const wc = require('./woo-clientes');
  const datos = wc.datosDePedido(o, store.getSettings(t).woo || {});
  const { cliente } = wc.vincularCliente(t, datos, cacheClientes);
  return store.create(t, 'pedidos', {
    cliente_id: cliente.id, doc: datos.doc || '', condicion_iva: datos.condicion_iva || '',
    numero: `WC-${o.number || o.id}`, external_id: o.id, origen: 'woocommerce', cuenta: cuenta || 'WooCommerce',
    fecha: o.date_created_gmt ? o.date_created_gmt + 'Z' : new Date().toISOString(), plataforma: 'WooCommerce',
    tipo_envio: (o.shipping_lines || [])[0]?.method_title || 'Vixan 24 h',
    cliente: `${b.first_name || ''} ${b.last_name || ''}`.trim() || b.email || 'Cliente Woo', email: b.email, telefono: b.phone,
    direccion: [s.address_1 || b.address_1, s.address_2 || b.address_2].filter(Boolean).join(' '), localidad: s.city || b.city, cp: s.postcode || b.postcode,
    items: (o.line_items || []).map((i) => ({ sku: i.sku || `WC-${i.product_id}`, nombre: i.name, cantidad: Number(i.quantity), precio: Number(i.price) })),
    total: Number(o.total), costo_envio: Number(o.shipping_total) || 0, comision: 0, impuestos: 0, deposito: 'Central',
    pago: o.date_paid_gmt || ['processing', 'completed'].includes(o.status) ? 'Pagado' : 'Pendiente', metodo_pago: o.payment_method_title || '',
    estado: mapEstadoWoo(o.status),
  });
}

async function mlToken(t) {
  const cfg = store.getSettings(t).ml || {};
  if (!cfg.access_token) throw new Error('Mercado Libre no está conectado');
  if (cfg.expires_at && Date.now() < cfg.expires_at - 60000) return cfg;
  const r = await fetch(`${ML_API}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: env('ML_CLIENT_ID'), client_secret: env('ML_CLIENT_SECRET'), refresh_token: cfg.refresh_token }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || 'No se pudo renovar el token de ML');
  const next = { ...cfg, access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + j.expires_in * 1000 };
  store.setSetting(t, 'ml', next);
  return next;
}
async function importarOrdenML(t, orderId) {
  if (existePedido(t, 'mercadolibre', orderId)) return null;
  const cfg = await mlToken(t);
  const r = await fetch(`${ML_API}/orders/${orderId}`, { headers: { Authorization: `Bearer ${cfg.access_token}` } });
  const o = await r.json();
  if (!r.ok) throw new Error(o.message || 'Orden no encontrada en ML');
  let envio = {};
  if (o.shipping?.id) {
    const sr = await fetch(`${ML_API}/shipments/${o.shipping.id}`, { headers: { Authorization: `Bearer ${cfg.access_token}` } });
    if (sr.ok) envio = await sr.json();
  }
  const tipo = envio.logistic_type === 'self_service' ? 'Flex' : envio.logistic_type === 'fulfillment' ? 'Full' : envio.logistic_type === 'cross_docking' ? 'Colecta' : 'Mercado Envíos';
  const dir = envio.receiver_address || {};
  return store.create(t, 'pedidos', {
    numero: `ML-${o.id}`, external_id: o.id, origen: 'mercadolibre', cuenta: cfg.nickname || 'Mercado Libre', fecha: o.date_created, plataforma: 'Mercado Libre', tipo_envio: tipo,
    cliente: o.buyer?.nickname || 'Comprador ML', direccion: [dir.street_name, dir.street_number].filter(Boolean).join(' '), localidad: dir.city?.name || '', cp: dir.zip_code || '',
    items: (o.order_items || []).map((i) => ({ sku: i.item?.seller_sku || i.item?.id, nombre: i.item?.title, cantidad: i.quantity, precio: i.unit_price })),
    total: o.total_amount, comision: (o.order_items || []).reduce((a, i) => a + (Number(i.sale_fee) || 0) * i.quantity, 0), costo_envio: 0, impuestos: 0, deposito: 'Central',
    pago: o.status === 'paid' ? 'Pagado' : 'Pendiente', metodo_pago: 'Mercado Pago', estado: o.status === 'cancelled' ? 'cancelado' : 'para_armar', tracking: envio.tracking_number || '',
  });
}

// ───────── Rutas públicas (las llaman ML / Woo) ─────────
const publicRouter = express.Router();

publicRouter.post('/woocommerce/:key', (req, res) => {
  const t = tenantByKey(req.params.key);
  if (!t) return res.status(404).end();
  const secret = (store.getSettings(t.id).woo || {}).webhook_secret;
  if (secret) {
    const sig = crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('base64');
    const recv = String(req.headers['x-wc-webhook-signature'] || '');
    if (sig.length !== recv.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(recv))) return res.status(401).json({ ok: false, error: 'Firma inválida' });
  }
  if (!req.body || !req.body.id) return res.json({ ok: true, ping: true }); // Woo manda un ping al crear el webhook
  const p = pedidoDesdeWoo(t.id, req.body);
  if (p) require('./woo').programarEnvioStock(t.id);
  store.logEvent(t.id, null, 'woo.webhook', { order: req.body.id, creado: !!p });
  res.json({ ok: true, creado: !!p });
});

publicRouter.get('/ml/callback', async (req, res) => {
  try {
    const [tenantKey] = String(req.query.state || '').split('.');
    const t = tenantByKey(tenantKey);
    if (!t || !req.query.code) throw new Error('Estado inválido');
    const r = await fetch(`${ML_API}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: env('ML_CLIENT_ID'), client_secret: env('ML_CLIENT_SECRET'), code: req.query.code, redirect_uri: `${baseUrl()}/api/hooks/ml/callback` }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || 'Error de OAuth');
    const me = await (await fetch(`${ML_API}/users/me`, { headers: { Authorization: `Bearer ${j.access_token}` } })).json();
    store.setSetting(t.id, 'ml', { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + j.expires_in * 1000, user_id: j.user_id, nickname: me.nickname });
    store.logEvent(t.id, null, 'ml.conectado', me.nickname);
    res.redirect('/#integraciones');
  } catch (e) { res.status(400).send(`No se pudo conectar Mercado Libre: ${e.message}`); }
});

// ML manda TODAS las notificaciones de la app a una única URL: se busca el cliente por user_id
publicRouter.post('/mercadolibre', async (req, res) => {
  res.status(200).end(); // ML exige respuesta rápida
  const { topic, resource, user_id } = req.body || {};
  if (!['orders_v2', 'orders'].includes(topic)) return;
  const row = store.db.prepare("SELECT tenant_id FROM settings WHERE key='ml' AND json_extract(value,'$.user_id')=?").get(Number(user_id));
  if (!row) return;
  try { await importarOrdenML(row.tenant_id, String(resource).split('/').pop()); } catch (e) { store.logEvent(row.tenant_id, null, 'ml.error', e.message); }
});

// ───────── Rutas privadas (panel) ─────────
const privateRouter = express.Router();
privateRouter.get('/estado', (req, res) => {
  const s = store.getSettings(req.tenantId);
  const t = store.db.prepare('SELECT webhook_key FROM tenants WHERE id=?').get(req.tenantId);
  res.json({ ok: true, data: {
    ml: { conectado: !!s.ml?.access_token, nickname: s.ml?.nickname || null, appConfigurada: !!env('ML_CLIENT_ID') },
    woo: { conectado: !!s.woo?.url, url: s.woo?.url || null, webhookUrl: `${baseUrl()}/api/hooks/woocommerce/${t?.webhook_key}` },
    mlNotificaciones: `${baseUrl()}/api/hooks/mercadolibre`,
  } });
});
privateRouter.post('/ml/conectar', (req, res) => {
  if (!env('ML_CLIENT_ID')) return res.status(400).json({ ok: false, error: 'Falta configurar ML_CLIENT_ID y ML_CLIENT_SECRET en el servidor (ver README).' });
  const t = store.db.prepare('SELECT webhook_key FROM tenants WHERE id=?').get(req.tenantId);
  const url = `${ML_AUTH}?response_type=code&client_id=${env('ML_CLIENT_ID')}&redirect_uri=${encodeURIComponent(`${baseUrl()}/api/hooks/ml/callback`)}&state=${t.webhook_key}.${crypto.randomBytes(6).toString('hex')}`;
  res.json({ ok: true, data: { url } });
});
privateRouter.post('/ml/importar', async (req, res) => {
  try { res.json({ ok: true, data: await importarOrdenML(req.tenantId, req.body.orderId) }); } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});
privateRouter.post('/woo/config', (req, res) => {
  const woo = require('./woo');
  const prev = woo.cfgDe(req.tenantId);
  const b = req.body || {};
  const keep = (k) => (b[k] ? String(b[k]).trim() : prev[k]); // vacío = conservar la clave guardada
  const url = String(b.url ?? prev.url ?? '').trim().replace(/\/$/, '');
  if (url && !/^https?:\/\//.test(url)) return res.status(400).json({ ok: false, error: 'La URL tiene que empezar con https://' });
  store.setSetting(req.tenantId, 'woo', { ...prev, url, consumer_key: keep('consumer_key'), consumer_secret: keep('consumer_secret'), webhook_secret: keep('webhook_secret'), auto: !!b.auto, enviar_stock: !!b.enviar_stock });
  res.json({ ok: true, data: true });
});
privateRouter.get('/woo/estado', (req, res) => {
  const c = require('./woo').cfgDe(req.tenantId);
  const vinculados = store.list(req.tenantId, 'productos').filter((p) => p.woo_id).length;
  res.json({ ok: true, data: { url: c.url || '', tieneClaves: !!(c.consumer_key && c.consumer_secret), tieneSecretoWebhook: !!c.webhook_secret, auto: !!c.auto, enviar_stock: !!c.enviar_stock, ultima_sync_pedidos: c.ultima_sync_pedidos || null, ultimo_envio_stock: c.ultimo_envio_stock || null, ultima_import_productos: c.ultima_import_productos || null, ultimo_error: c.ultimo_error || null, ultimo_error_stock: c.ultimo_error_stock || null, ultima_import_clientes: c.ultima_import_clientes || null, campo_doc: c.campo_doc || '', campo_cond: c.campo_cond || '', clientesWoo: store.list(req.tenantId, 'clientes').filter((x) => x.origen === 'WooCommerce' || x.woo_customer_id).length, vinculados, minutos: Number(process.env.WOO_SYNC_MINUTOS) || 5 } });
});
const wooAccion = (fn) => async (req, res) => {
  try { res.json({ ok: true, data: await fn(req) }); } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
};
privateRouter.post('/woo/importar-productos', wooAccion((req) => require('./woo').exclusivo(req.tenantId, () => require('./woo').importarProductos(req.tenantId, { stockInicial: req.body?.stockInicial !== false }))));
privateRouter.post('/woo/sincronizar', wooAccion((req) => require('./woo').exclusivo(req.tenantId, () => require('./woo').sincronizarPedidos(req.tenantId))));
privateRouter.get('/woo/campos', wooAccion((req) => require('./woo').detectarCamposCheckout(req.tenantId)));
privateRouter.post('/woo/importar-clientes', wooAccion((req) => require('./woo').exclusivo(req.tenantId, () => require('./woo').importarClientes(req.tenantId))));
privateRouter.post('/woo/campos', (req, res) => {
  const woo = require('./woo');
  store.setSetting(req.tenantId, 'woo', { ...woo.cfgDe(req.tenantId), campo_doc: String(req.body.campo_doc || '').trim(), campo_cond: String(req.body.campo_cond || '').trim() });
  res.json({ ok: true, data: true });
});
privateRouter.post('/woo/enviar-stock', wooAccion((req) => require('./woo').enviarStock(req.tenantId, { forzar: true })));

module.exports = { integrar: { publicRouter, privateRouter }, pedidoDesdeWoo };
