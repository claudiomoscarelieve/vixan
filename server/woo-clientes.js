// Vixan — clientes de WooCommerce
//  · Lee DNI/CUIT y condición frente al IVA de los campos extra del checkout
//    (Checkout Field Editor y plugins similares los guardan en meta_data del pedido).
//  · Crea o vincula el cliente de Vixan por email (o documento), sin duplicar.
const store = require('./db');

const soloDigitos = (s) => String(s ?? '').replace(/\D/g, '');
const PATRON_DOC = /(dni|cuit|cuil|documento|doc_?nro|nro_?doc|num(ero)?_?doc|identificaci)/i;
const PATRON_COND = /(iva|condici|tipo_?(de_?)?factura|factura_?tipo|facturaci)/i;
const sinGuion = (k) => String(k).replace(/^_+/, '');

function metas(obj) { return (obj?.meta_data || []).filter((m) => m && m.key && typeof m.value !== 'object'); }

// Traduce lo que escribió/eligió el comprador a la condición de IVA de ARCA
function mapCondicion(v) {
  const s = String(v ?? '').toLowerCase().trim();
  if (!s) return null;
  if (s.includes('monotrib')) return 'Responsable Monotributo';
  if (s.includes('exent')) return 'IVA Sujeto Exento';
  if (s.includes('inscrip') || /(^|[^a-z])r\.?i\.?$/.test(s)) return 'Responsable Inscripto';
  if (s.includes('consumidor') || s.includes('final')) return 'Consumidor Final';
  if (/(^|[^a-z])a$/.test(s) || /factura[\s_-]*a\b/.test(s)) return 'Responsable Inscripto';
  if (/(^|[^a-z])b$/.test(s) || /factura[\s_-]*b\b/.test(s)) return 'Consumidor Final';
  return null;
}

function buscarMeta(obj, campo, patron, valida) {
  const ms = metas(obj);
  if (campo) {
    const m = ms.find((x) => sinGuion(x.key) === sinGuion(campo));
    return m && valida(m.value) ? m.value : null;
  }
  const m = ms.find((x) => patron.test(x.key) && !(patron === PATRON_COND && PATRON_DOC.test(x.key)) && valida(x.value));
  return m ? m.value : null;
}
const docValido = (v) => { const d = soloDigitos(v); return d.length >= 7 && d.length <= 11; };

function fiscalDe(obj, cfg = {}) {
  const doc = buscarMeta(obj, cfg.campo_doc, PATRON_DOC, docValido);
  const condTxt = buscarMeta(obj, cfg.campo_cond, PATRON_COND, (v) => !!mapCondicion(v));
  return { doc: doc ? soloDigitos(doc) : null, condicion_iva: condTxt ? mapCondicion(condTxt) : null };
}

// Para la pantalla: qué campos extra hay en los pedidos y qué valores traen
function detectarCampos(pedidos) {
  const vistos = {};
  for (const o of pedidos) for (const m of metas(o)) {
    if (/^_?(wc_|woocommerce|_order|_cart|_customer_user|_billing_(first|last|email|phone|address|city|state|postcode|country|company)|_shipping|_payment|_transaction|_created_via|_date|_paid|_completed|_recorded|_prices|_download|is_vat|_new_order|_edit_lock|_wp_)/i.test(m.key)) continue;
    const r = (vistos[m.key] ||= { campo: m.key, ejemplos: [], veces: 0 });
    r.veces++;
    if (r.ejemplos.length < 3 && String(m.value).trim()) r.ejemplos.push(String(m.value).slice(0, 40));
  }
  const lista = Object.values(vistos).sort((a, b) => b.veces - a.veces);
  return {
    campos: lista,
    sugerido_doc: lista.find((c) => PATRON_DOC.test(c.campo) && c.ejemplos.some(docValido))?.campo || null,
    sugerido_cond: lista.find((c) => PATRON_COND.test(c.campo) && !PATRON_DOC.test(c.campo) && c.ejemplos.some((v) => mapCondicion(v)))?.campo || null,
  };
}

// Crea o actualiza el cliente de Vixan. Orden de búsqueda: id de Woo → email → documento.
const indices = new WeakMap();
const claveNombre = (x) => (!x.email ? String(x.nombre || '').trim().toLowerCase() : null);
function indexar(ix, x) {
  // Gana el primero que se cargó con esa clave; si es el mismo cliente, se refresca con sus datos nuevos
  const poner = (m, k) => { if (k && (!m.has(k) || m.get(k).id === x.id)) m.set(k, x); };
  poner(ix.woo, x.woo_customer_id ? String(x.woo_customer_id) : null);
  poner(ix.email, String(x.email || '').trim().toLowerCase());
  poner(ix.doc, soloDigitos(x.cuit));
  poner(ix.nombre, claveNombre(x));
}
function indiceDe(todos) {
  let ix = indices.get(todos);
  if (!ix) { ix = { woo: new Map(), email: new Map(), doc: new Map(), nombre: new Map() }; for (const x of todos) indexar(ix, x); indices.set(todos, ix); }
  return ix;
}
function vincularCliente(t, d, cache) {
  const todos = cache || store.list(t, 'clientes');
  const ix = indiceDe(todos);
  const email = String(d.email || '').trim().toLowerCase();
  let c = (d.woo_customer_id && ix.woo.get(String(d.woo_customer_id)))
    || (email && ix.email.get(email))
    || (d.doc && ix.doc.get(d.doc));
  const nombre = String(d.nombre || '').trim() || email || 'Cliente WooCommerce';
  // Sin email ni documento, el único dato que queda para no duplicar es el nombre
  if (!c && !email && !d.doc) c = ix.nombre.get(nombre.toLowerCase());
  if (c) {
    const patch = {};
    const llenar = (k, v) => { if (v && !c[k]) patch[k] = v; };
    llenar('email', email); llenar('telefono', d.telefono); llenar('direccion', d.direccion); llenar('localidad', d.localidad); llenar('cp', d.cp); llenar('zona', d.zona); llenar('razon_social', d.empresa);
    if (d.woo_customer_id && !c.woo_customer_id) patch.woo_customer_id = d.woo_customer_id;
    // Lo que el comprador cargó en el checkout es lo más nuevo: actualiza documento y condición
    if (d.doc && soloDigitos(c.cuit) !== d.doc) patch.cuit = d.doc;
    if (d.condicion_iva && c.condicion_iva !== d.condicion_iva) patch.condicion_iva = d.condicion_iva;
    if (Object.keys(patch).length) { c = store.update(t, 'clientes', c.id, patch); const k = todos.findIndex((x) => x.id === c.id); if (k >= 0) todos[k] = c; indexar(ix, c); return { cliente: c, accion: 'actualizado' }; }
    return { cliente: c, accion: 'igual' };
  }
  c = store.create(t, 'clientes', { nombre, razon_social: d.empresa || '', cuit: d.doc || '', condicion_iva: d.condicion_iva || 'Consumidor Final', email, telefono: d.telefono || '', direccion: d.direccion || '', localidad: d.localidad || '', cp: d.cp || '', zona: d.zona || '', canal: 'Minorista', etiquetas: ['WooCommerce'], origen: 'WooCommerce', woo_customer_id: d.woo_customer_id || null, vendedor: '' });
  todos.push(c); indexar(ix, c);
  return { cliente: c, accion: 'creado' };
}

function datosDePedido(o, cfg) {
  const b = o.billing || {};
  const f = fiscalDe(o, cfg);
  return { woo_customer_id: o.customer_id || null, email: b.email, nombre: `${b.first_name || ''} ${b.last_name || ''}`.trim(), empresa: b.company, telefono: b.phone, direccion: [b.address_1, b.address_2].filter(Boolean).join(' '), localidad: b.city, cp: b.postcode, zona: b.state, ...f };
}
function datosDeCliente(c, cfg) {
  const b = c.billing || {};
  const f = fiscalDe(c, cfg);
  return { woo_customer_id: c.id, email: c.email || b.email, nombre: `${c.first_name || b.first_name || ''} ${c.last_name || b.last_name || ''}`.trim() || c.username, empresa: b.company, telefono: b.phone, direccion: [b.address_1, b.address_2].filter(Boolean).join(' '), localidad: b.city, cp: b.postcode, zona: b.state, ...f };
}

module.exports = { fiscalDe, detectarCampos, vincularCliente, datosDePedido, datosDeCliente, mapCondicion };
