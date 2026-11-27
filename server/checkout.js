// Vixan — checkout de Vixan Tienda: pedidos de clientes con cuenta y cobro con Mercado Pago.
// Los precios y totales se calculan SIEMPRE acá, con la lista del cliente: la tienda solo manda qué y cuánto.
// El pedido entra a Vixan como "Vixan Market" en estado pendiente, así reserva stock como cualquier pedido.
const express = require('express');
const store = require('./db');
const catalogo = require('./catalogo');
const correo = require('./correo');
const cuentas = require('./cuentas');

const MP_API = () => (process.env.MP_API || 'https://api.mercadopago.com').replace(/\/$/, '');
const PUBLIC_URL = () => (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round(v * 100) / 100;
const pesos = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const error = (status, mensaje, extra = {}) => Object.assign(new Error(mensaje), { status, ...extra });
const texto = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, max);

// ───────────── Configuración ─────────────
// settings.tienda: condiciones, formas de pago y envío (no secretas). settings.mercadopago: el token (privado).
function config(t) {
  const s = store.getSettings(t).tienda || {};
  const si = (v, def) => (v === undefined || v === null || v === '' ? def : !!v);
  return {
    nombre: s.nombre || store.db.prepare('SELECT nombre FROM tenants WHERE id=?').get(t)?.nombre || 'la tienda',
    minimo: n0(s.minimo_inicial),
    descuento: n0(s.descuento_pct) > 0 && n0(s.descuento_desde) > 0 ? { desde: n0(s.descuento_desde), pct: n0(s.descuento_pct) } : null,
    conIva: !!s.precio_con_iva,
    ivaPct: n0(s.iva_pct) || 21,
    pagos: {
      mp: si(s.pago_mp, false) && !!(store.getSettings(t).mercadopago || {}).access_token,
      transferencia: si(s.pago_transf, true),
      coordinar: si(s.pago_coordinar, false),
    },
    datosTransferencia: s.datos_transferencia || '',
    textoCoordinar: s.texto_coordinar || 'Coordinamos el pago con vos (efectivo al retirar, cuenta corriente u otro medio).',
    envios: { retiro: si(s.retiro, true), coordinar: si(s.envio_coordinar, true) },
    retiroDireccion: s.retiro_direccion || '', retiroHorario: s.retiro_horario || '',
    cancelarHoras: s.mp_cancelar_horas === undefined || s.mp_cancelar_horas === '' ? 48 : n0(s.mp_cancelar_horas),
  };
}
const NOMBRES_PAGO = { mp: 'Mercado Pago', transferencia: 'Transferencia', coordinar: 'A coordinar' };
const NOMBRES_ENVIO = { retiro: 'Retiro en depósito', coordinar: 'Envío a coordinar' };

function opciones(t) {
  const c = config(t);
  return {
    pagos: Object.entries(c.pagos).filter(([, on]) => on).map(([id]) => ({ id, nombre: NOMBRES_PAGO[id],
      detalle: id === 'mp' ? 'Tarjeta de crédito o débito, dinero en cuenta. Te llevamos a Mercado Pago para pagar.' : id === 'transferencia' ? 'Te mostramos los datos para transferir al confirmar el pedido.' : c.textoCoordinar })),
    envios: Object.entries(c.envios).filter(([, on]) => on).map(([id]) => ({ id, nombre: NOMBRES_ENVIO[id],
      detalle: id === 'retiro' ? [c.retiroDireccion, c.retiroHorario].filter(Boolean).join(' · ') || 'Te avisamos cuando esté listo para retirar.' : 'Te contactamos para coordinar el envío y su costo.' })),
    condiciones: { minimo: c.minimo, descuento: c.descuento, conIva: c.conIva, ivaPct: c.ivaPct },
  };
}

// ───────────── Cálculo del pedido ─────────────
function primeraCompra(t, cuenta) {
  return !store.list(t, 'pedidos').some((p) => p.estado !== 'cancelado' && ((cuenta.cliente_id && Number(p.cliente_id) === Number(cuenta.cliente_id)) || Number(p.tienda_cuenta_id) === cuenta.id));
}

function cotizar(t, cuenta, itemsPedidos) {
  if (!Array.isArray(itemsPedidos) || !itemsPedidos.length) throw error(400, 'Tu pedido está vacío');
  if (itemsPedidos.length > 300) throw error(400, 'El pedido tiene demasiados productos');
  const c = config(t);
  const { precios } = cuentas.preciosDeCuenta(t, cuenta);
  const ctx = catalogo.contexto(t);
  const porId = new Map(ctx.productos.map((p) => [Number(p.id), p]));
  const lineas = []; const problemas = [];
  const juntos = new Map();
  for (const it of itemsPedidos) { const id = Number(it?.id); const q = Math.floor(n0(it?.cantidad)); if (id && q > 0) juntos.set(id, (juntos.get(id) || 0) + q); }
  for (const [id, cantidad] of juntos) {
    const p = porId.get(id);
    const precio = precios[id];
    if (!p || !precio) { problemas.push({ id, nombre: p?.nombre || 'Producto', motivo: 'Ya no está disponible en la tienda' }); continue; }
    const mult = Math.max(1, Math.floor(n0(p.venta_multiplo) || 1));
    if (cantidad % mult) { problemas.push({ id, nombre: p.nombre, motivo: `Se vende de a ${mult} unidades` }); continue; }
    const disp = Math.max(0, Math.floor(catalogo.disponible(p, ctx)));
    if (cantidad > disp) { problemas.push({ id, nombre: p.nombre, motivo: disp ? `Solo quedan ${disp} unidades` : 'Sin stock', disponible: disp }); continue; }
    lineas.push({ id, sku: String(p.sku), nombre: p.nombre, cantidad, precio, importe: r2(precio * cantidad) });
  }
  const subtotal = r2(lineas.reduce((a, l) => a + l.importe, 0));
  const pct = c.descuento && subtotal >= c.descuento.desde ? c.descuento.pct : 0;
  const descuento = r2(subtotal * pct / 100);
  const neto = r2(subtotal - descuento);
  const iva = c.conIva ? 0 : r2(neto * c.ivaPct / 100);
  const total = r2(neto + iva);
  const primera = primeraCompra(t, cuenta);
  const avisoMinimo = c.minimo && primera && subtotal < c.minimo ? `Tu primera compra tiene un mínimo de ${pesos(c.minimo)}${c.conIva ? '' : ' + IVA'}: te faltan ${pesos(c.minimo - subtotal)}.` : '';
  return { lineas, problemas, subtotal, descuentoPct: pct, descuento, neto, iva, ivaPct: c.conIva ? 0 : c.ivaPct, total, primeraCompra: primera, avisoMinimo };
}

// ───────────── Mercado Pago ─────────────
async function mp(t, metodo, ruta, cuerpo) {
  const token = (store.getSettings(t).mercadopago || {}).access_token;
  if (!token) throw error(400, 'Mercado Pago no está configurado');
  const r = await fetch(`${MP_API()}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(metodo === 'POST' ? { 'X-Idempotency-Key': `${t}-${ruta}-${Date.now()}-${Math.random()}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw error(502, `Mercado Pago respondió: ${j.message || j.error || r.status}`);
  return j;
}

async function preferencia(t, pedido) {
  const c = config(t);
  const tienda = cuentas.urlTienda(t);
  const volver = `${tienda}/cuenta/pedido/?n=${encodeURIComponent(pedido.numero)}`;
  const vence = c.cancelarHoras > 0 ? new Date(Date.now() + c.cancelarHoras * 3600000) : null;
  const pref = await mp(t, 'POST', '/checkout/preferences', {
    items: [{ id: pedido.numero, title: `Pedido ${pedido.numero} · ${c.nombre}`.slice(0, 250), quantity: 1, unit_price: r2(pedido.total), currency_id: 'ARS' }],
    external_reference: `vt:${pedido.id}`,
    payer: { email: pedido.email || undefined, name: pedido.contacto || undefined },
    back_urls: { success: volver, pending: volver, failure: volver },
    auto_return: tienda.startsWith('https://') ? 'approved' : undefined,
    notification_url: `${PUBLIC_URL()}/api/v1/tienda/mp/${encodeURIComponent(cuentas.idPublico(t))}`,
    statement_descriptor: c.nombre.replace(/[^\w ]/g, '').slice(0, 22) || undefined,
    ...(vence ? { expires: true, expiration_date_to: vence.toISOString().replace('Z', '-00:00') } : {}),
  });
  store.update(t, 'pedidos', pedido.id, { mp_preferencia: pref.id });
  return pref.init_point || pref.sandbox_init_point;
}

// Consulta el pago en Mercado Pago (así una notificación falsa no puede marcar nada como pagado)
async function procesarPago(t, pagoId) {
  const pago = await mp(t, 'GET', `/v1/payments/${encodeURIComponent(pagoId)}`);
  const ref = String(pago.external_reference || '');
  if (!ref.startsWith('vt:')) return null;
  const pedido = store.get(t, 'pedidos', Number(ref.slice(3)));
  if (!pedido || pedido.origen !== 'tienda') return null;
  const cambios = { mp_pago: String(pago.id), mp_estado: pago.status, mp_detalle: pago.status_detail || '' };
  if (pago.status === 'approved' && pedido.pago !== 'Pagado') {
    const pagado = r2(n0(pago.transaction_amount));
    if (pagado + 0.01 < r2(pedido.total)) cambios.notas_pago = `Mercado Pago aprobó ${pesos(pagado)} y el pedido es de ${pesos(pedido.total)}: revisar`;
    else {
      Object.assign(cambios, { pago: 'Pagado', pagado_en: new Date().toISOString() });
      if (pedido.estado === 'pendiente') cambios.estado = 'para_armar';
    }
    store.update(t, 'pedidos', pedido.id, cambios);
    store.logEvent(t, null, 'tienda_pago', `Pedido ${pedido.numero} pagado con Mercado Pago (${pago.id})`);
    if (cambios.pago === 'Pagado') mailPagado(t, { ...pedido, ...cambios });
  } else store.update(t, 'pedidos', pedido.id, cambios);
  return { pedido: pedido.numero, estado: pago.status };
}

// ───────────── Emails ─────────────
const resumenTexto = (p) => (p.items || []).map((i) => `• ${i.cantidad} × ${i.nombre} (${i.sku})`).join('\n');
function mailNuevoPedido(t, p) {
  const c = config(t); const url = `${cuentas.urlTienda(t)}/cuenta/pedido/?n=${encodeURIComponent(p.numero)}`;
  const pago = p.metodo_pago === 'Transferencia' && c.datosTransferencia ? `Para pagar por transferencia:\n${c.datosTransferencia}` : p.metodo_pago === 'Mercado Pago' ? 'Si todavía no lo pagaste, podés hacerlo desde el detalle del pedido.' : c.textoCoordinar;
  correo.enviarSinEsperar(t, { para: p.email, asunto: `Recibimos tu pedido ${p.numero}`,
    texto: `Hola ${p.contacto || ''}, recibimos tu pedido ${p.numero} por ${pesos(p.total)}.\n\n${resumenTexto(p)}\n\nPago: ${p.metodo_pago}. Envío: ${p.tipo_envio}.\n${pago}\n\nDetalle: ${url}`,
    html: correo.plantilla({ titulo: `Pedido ${p.numero} recibido`, parrafos: [`Hola ${p.contacto || ''}, recibimos tu pedido por ${pesos(p.total)}.`, ...(p.items || []).map((i) => `${i.cantidad} × ${i.nombre}`), `Pago: ${p.metodo_pago} · Envío: ${p.tipo_envio}`, pago], boton: { texto: 'Ver mi pedido', url }, pie: c.nombre }) });
  const aviso = correo.config(t).avisos;
  if (aviso) correo.enviarSinEsperar(t, { para: aviso, responderA: p.email, asunto: `Pedido nuevo de la tienda: ${p.numero} · ${p.cliente}`,
    texto: `${p.cliente} (CUIT ${p.doc}) hizo el pedido ${p.numero} por ${pesos(p.total)}.\nPago: ${p.metodo_pago} · Envío: ${p.tipo_envio}\n\n${resumenTexto(p)}${p.notas ? `\n\nNotas: ${p.notas}` : ''}\n\nLo ves en Vixan → Vixan Market → Pedidos.`,
    html: correo.plantilla({ titulo: `Pedido nuevo ${p.numero}`, parrafos: [`${p.cliente} (CUIT ${p.doc}) · ${pesos(p.total)}`, `Pago: ${p.metodo_pago} · Envío: ${p.tipo_envio}`, ...(p.items || []).map((i) => `${i.cantidad} × ${i.nombre} (${i.sku})`), ...(p.notas ? [`Notas: ${p.notas}`] : []), 'Lo ves en Vixan → Vixan Market → Pedidos.'] }) });
}
function mailPagado(t, p) {
  const c = config(t);
  correo.enviarSinEsperar(t, { para: p.email, asunto: `Recibimos el pago de tu pedido ${p.numero}`,
    texto: `Hola ${p.contacto || ''}, Mercado Pago nos confirmó el pago de tu pedido ${p.numero} por ${pesos(p.total)}. Ya lo estamos preparando.`,
    html: correo.plantilla({ titulo: '¡Pago recibido!', parrafos: [`Hola ${p.contacto || ''}, Mercado Pago nos confirmó el pago de tu pedido ${p.numero} por ${pesos(p.total)}.`, 'Ya lo estamos preparando.'], pie: c.nombre }) });
  const aviso = correo.config(t).avisos;
  if (aviso) correo.enviarSinEsperar(t, { para: aviso, asunto: `Pedido ${p.numero} pagado con Mercado Pago`, texto: `${p.cliente} pagó el pedido ${p.numero} (${pesos(p.total)}). Pasó a "Para armar".` });
}

// ───────────── Pedidos ─────────────
function siguienteNumero(t) {
  const max = store.list(t, 'pedidos').reduce((m, p) => { const k = /^VT-(\d+)$/.exec(p.numero || ''); return k ? Math.max(m, Number(k[1])) : m; }, 1000);
  return `VT-${max + 1}`;
}
const ESTADOS = { pendiente: 'Recibido', para_armar: 'En preparación', para_despachar: 'Listo para despachar', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };
function pedidoPublico(t, p, detalle = false) {
  const c = config(t);
  const base = { numero: p.numero, fecha: p.fecha, total: p.total, estado: p.estado, estado_txt: ESTADOS[p.estado] || p.estado, pago: p.pago, metodo_pago: p.metodo_pago, tipo_envio: p.tipo_envio, unidades: (p.items || []).reduce((a, i) => a + n0(i.cantidad), 0) };
  if (!detalle) return base;
  const pendienteMP = p.metodo_pago === 'Mercado Pago' && p.pago !== 'Pagado' && p.estado !== 'cancelado';
  return { ...base, items: (p.items || []).map((i) => ({ sku: i.sku, nombre: i.nombre, cantidad: i.cantidad, precio: i.precio_lista ?? i.precio, importe: r2(n0(i.precio_lista ?? i.precio) * n0(i.cantidad)) })),
    subtotal: p.subtotal, descuento: p.descuento, iva: p.iva, notas: p.notas || '', direccion: [p.direccion, p.localidad, p.provincia].filter(Boolean).join(', '),
    mp_estado: p.mp_estado || '', puedePagar: pendienteMP && !!c.pagos.mp,
    instrucciones: p.estado === 'cancelado' ? '' : p.metodo_pago === 'Transferencia' && p.pago !== 'Pagado' ? c.datosTransferencia : p.metodo_pago === 'A coordinar' && p.pago !== 'Pagado' ? c.textoCoordinar : p.tipo_envio === NOMBRES_ENVIO.retiro ? [c.retiroDireccion, c.retiroHorario].filter(Boolean).join(' · ') : '' };
}
const delCliente = (t, cuenta) => store.list(t, 'pedidos').filter((p) => p.origen === 'tienda' && (Number(p.tienda_cuenta_id) === cuenta.id || (cuenta.cliente_id && Number(p.cliente_id) === Number(cuenta.cliente_id))));

// ───────────── Rutas públicas (tienda → Vixan, con la sesión del comprador) ─────────────
const publico = express.Router();
const responder = (fn) => async (req, res) => {
  try { res.json({ ok: true, data: await fn(req) }); } catch (e) {
    if (!e.status || e.status >= 500 && e.status !== 502) console.error('[tienda/checkout]', e);
    res.status(e.status || 500).json({ ok: false, error: e.status ? e.message : 'Ocurrió un error. Probá de nuevo.', problemas: e.problemas });
  }
};
const conCuenta = (req) => {
  const c = cuentas.cuentaDeToken(req, req.tenantId);
  if (!c) throw error(401, 'Ingresá con tu cuenta para continuar.');
  return c;
};

publico.get('/:tid/checkout', responder((req) => {
  const c = conCuenta(req);
  const datos = JSON.parse(c.datos || '{}');
  return { ...opciones(req.tenantId), cuenta: { razon_social: c.razon_social, cuit: c.cuit, nombre: c.nombre, email: c.email, telefono: c.telefono, direccion: datos.direccion || '', localidad: datos.localidad || '', provincia: datos.provincia || '', cp: datos.cp || '' } };
}));
publico.post('/:tid/cotizar', responder((req) => cotizar(req.tenantId, conCuenta(req), req.body?.items)));

publico.post('/:tid/pedido', responder(async (req) => {
  const t = req.tenantId; const cuenta = conCuenta(req); const b = req.body || {};
  const op = opciones(t);
  const pago = op.pagos.find((x) => x.id === b.pago); const envio = op.envios.find((x) => x.id === b.envio);
  if (!pago) throw error(400, 'Elegí una forma de pago');
  if (!envio) throw error(400, 'Elegí cómo recibir el pedido');
  const q = cotizar(t, cuenta, b.items);
  if (q.problemas.length) throw error(409, 'Algunos productos cambiaron: revisá tu pedido', { problemas: q.problemas });
  if (!q.lineas.length) throw error(400, 'Tu pedido está vacío');
  const c = config(t); const datos = JSON.parse(cuenta.datos || '{}');
  const dir = envio.id === 'coordinar' ? { direccion: texto(b.direccion) || datos.direccion || '', localidad: texto(b.localidad, 80) || datos.localidad || '', provincia: texto(b.provincia, 60) || datos.provincia || '', cp: texto(b.cp, 12) || datos.cp || '' } : {};
  if (envio.id === 'coordinar' && (!dir.direccion || !dir.localidad)) throw error(400, 'Completá la dirección de envío');
  // Precio unitario final (con IVA y descuento) en los renglones, como el resto de los pedidos de Vixan: así se factura bien
  const factor = (1 - q.descuentoPct / 100) * (c.conIva ? 1 : 1 + c.ivaPct / 100);
  const items = q.lineas.map((l) => ({ sku: l.sku, nombre: l.nombre, cantidad: l.cantidad, precio: r2(l.precio * factor), precio_lista: l.precio, producto_id: l.id }));
  const pedido = store.create(t, 'pedidos', {
    numero: siguienteNumero(t), origen: 'tienda', fecha: new Date().toISOString(), plataforma: 'Vixan Market', cuenta: c.nombre,
    cliente: cuenta.razon_social, cliente_id: cuenta.cliente_id || null, tienda_cuenta_id: cuenta.id, doc: cuenta.cuit, condicion_iva: datos.condicion_iva || '',
    contacto: cuenta.nombre, email: cuenta.email, telefono: cuenta.telefono, ...dir,
    tipo_envio: envio.nombre, items, subtotal: q.subtotal, descuento: q.descuento, iva: q.iva, total: q.total, costo_envio: 0, comision: 0, impuestos: 0,
    deposito: 'Central', pago: 'Pendiente', metodo_pago: pago.nombre, estado: 'pendiente', notas: texto(b.notas, 1000), aviso_minimo: q.avisoMinimo || '',
  });
  store.logEvent(t, null, 'tienda_pedido', `Pedido ${pedido.numero} de ${cuenta.razon_social} por ${pesos(pedido.total)} (${pago.nombre})`);
  try { require('./woo').programarEnvioStock(t); } catch { /* sin WooCommerce */ }
  mailNuevoPedido(t, pedido);
  let url = null;
  if (pago.id === 'mp') {
    try { url = await preferencia(t, pedido); } catch (e) {
      console.error('[mp]', e.message);
      return { numero: pedido.numero, pago: 'mp', error: 'Tu pedido quedó registrado, pero no pudimos abrir Mercado Pago. Probá de nuevo desde el detalle del pedido.' };
    }
  }
  return { numero: pedido.numero, pago: pago.id, url };
}));

publico.get('/:tid/pedidos', responder((req) => delCliente(req.tenantId, conCuenta(req)).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 100).map((p) => pedidoPublico(req.tenantId, p))));
publico.get('/:tid/pedidos/:numero', responder((req) => {
  const p = delCliente(req.tenantId, conCuenta(req)).find((x) => x.numero === req.params.numero);
  if (!p) throw error(404, 'No encontramos ese pedido');
  return pedidoPublico(req.tenantId, p, true);
}));
publico.post('/:tid/pedidos/:numero/pagar', responder(async (req) => {
  const t = req.tenantId;
  const p = delCliente(t, conCuenta(req)).find((x) => x.numero === req.params.numero);
  if (!p) throw error(404, 'No encontramos ese pedido');
  if (p.pago === 'Pagado') throw error(400, 'Este pedido ya está pagado');
  if (p.estado === 'cancelado') throw error(400, 'Este pedido está cancelado');
  if (!config(t).pagos.mp) throw error(400, 'Mercado Pago no está disponible');
  if (p.metodo_pago !== 'Mercado Pago') store.update(t, 'pedidos', p.id, { metodo_pago: 'Mercado Pago' });
  return { url: await preferencia(t, store.get(t, 'pedidos', p.id)) };
}));
// Al volver de Mercado Pago: si trae el id del pago, se consulta en el momento (no hace falta esperar la notificación)
publico.post('/:tid/pedidos/:numero/verificar', responder(async (req) => {
  const t = req.tenantId; const cuenta = conCuenta(req);
  const p = delCliente(t, cuenta).find((x) => x.numero === req.params.numero);
  if (!p) throw error(404, 'No encontramos ese pedido');
  const id = String(req.body?.pago || '').replace(/\D/g, '');
  if (id && p.pago !== 'Pagado') { try { await procesarPago(t, id); } catch (e) { console.error('[mp verificar]', e.message); } }
  return pedidoPublico(t, store.get(t, 'pedidos', p.id), true);
}));

// ───────────── Notificaciones de Mercado Pago (sin sesión) ─────────────
const webhook = express.Router();
webhook.post('/:tid', async (req, res) => {
  res.sendStatus(200); // Mercado Pago solo necesita saber que llegó
  const t = cuentas.tenantDeId(req.params.tid);
  if (!t) return;
  const tipo = req.body?.type || req.body?.topic || req.query.type || req.query.topic;
  const id = req.body?.data?.id || req.query['data.id'] || (tipo === 'payment' ? req.query.id : null);
  if (tipo !== 'payment' || !id) return;
  try { await procesarPago(t, String(id)); } catch (e) { console.error('[mp webhook]', e.message); }
});

// ───────────── Cancelar pedidos de Mercado Pago que nunca se pagaron (liberan el stock) ─────────────
function cancelarVencidos() {
  const logic = require('./logic');
  for (const { id: t } of store.db.prepare('SELECT id FROM tenants WHERE activo=1').all()) {
    const horas = config(t).cancelarHoras;
    if (!horas) continue;
    const limite = Date.now() - horas * 3600000;
    for (const p of store.list(t, 'pedidos')) {
      if (p.origen !== 'tienda' || p.metodo_pago !== 'Mercado Pago' || p.pago === 'Pagado' || p.estado !== 'pendiente') continue;
      if (new Date(p.fecha).getTime() > limite) continue;
      logic.cambiarEstadoPedido(t, p.id, 'cancelado', null);
      store.update(t, 'pedidos', p.id, { notas_pago: `Cancelado automáticamente: sin pago de Mercado Pago en ${horas} h` });
      store.logEvent(t, null, 'tienda_pedido', `Pedido ${p.numero} cancelado: sin pago en ${horas} h`);
    }
  }
}
setInterval(() => { try { cancelarVencidos(); } catch (e) { console.error('[tienda] cancelar vencidos', e.message); } }, 15 * 60000).unref();

// ───────────── Panel: cobros y envíos ─────────────
const panel = express.Router();
const wrap = (fn) => async (req, res) => { try { res.json({ ok: true, data: await fn(req) }); } catch (e) { res.status(e.status && e.status < 500 ? e.status : 400).json({ ok: false, error: e.message }); } };
const soloAdmin = (req, res, next) => (['superadmin', 'admin'].includes(req.user.rol) ? next() : res.status(403).json({ ok: false, error: 'Sin permiso' }));
panel.get('/', wrap((req) => {
  const s = store.getSettings(req.tenantId);
  const tok = (s.mercadopago || {}).access_token || '';
  return { tienda: s.tienda || {}, mp_token: tok ? `${tok.slice(0, 12)}…${tok.slice(-4)}` : '', mp_cuenta: (s.mercadopago || {}).cuenta || '', notificaciones: `${PUBLIC_URL()}/api/v1/tienda/mp/${cuentas.idPublico(req.tenantId)}` };
}));
panel.put('/', soloAdmin, wrap(async (req) => {
  const t = req.tenantId; const b = req.body || {};
  if (b.mp_token && !b.mp_token.includes('…')) {
    const token = String(b.mp_token).trim();
    // Se comprueba con Mercado Pago antes de guardarlo
    const r = await fetch(`${MP_API()}/users/me`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) throw error(400, 'Mercado Pago no aceptó ese Access Token. Copialo de nuevo desde Tus integraciones → Credenciales de producción.');
    store.setSetting(t, 'mercadopago', { access_token: token, cuenta: j.nickname || j.email || String(j.id || ''), prueba: token.startsWith('TEST-') });
  }
  const campos = ['pago_mp', 'pago_transf', 'pago_coordinar', 'datos_transferencia', 'texto_coordinar', 'retiro', 'retiro_direccion', 'retiro_horario', 'envio_coordinar', 'minimo_inicial', 'descuento_desde', 'descuento_pct', 'precio_con_iva', 'iva_pct', 'mp_cancelar_horas'];
  const actual = store.getSettings(t).tienda || {};
  const nuevo = { ...actual };
  for (const k of campos) if (b[k] !== undefined) nuevo[k] = typeof b[k] === 'string' ? b[k].slice(0, 2000) : b[k];
  store.setSetting(t, 'tienda', nuevo);
  if (b.mp_quitar) store.setSetting(t, 'mercadopago', {});
  return true;
}));

module.exports = { publico, webhook, panel, cotizar, opciones, config, procesarPago, cancelarVencidos };
