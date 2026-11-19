// Vixan — sincronización con WooCommerce (API REST v3)
//  · Importa productos (y variantes) por SKU, sin duplicar.
//  · Trae TODOS los pedidos (paginado) y después solo los nuevos.
//  · Envía el stock disponible de Vixan a WooCommerce (solo lo que cambió).
//  · Corre sola cada N minutos para cada cliente que la tenga activada.
const store = require('./db');

const cfgDe = (t) => store.getSettings(t).woo || {};
const guardar = (t, patch) => store.setSetting(t, 'woo', { ...cfgDe(t), ...patch });
const num = (v) => Number(v) || 0;
const corriendo = new Set(); // evita dos sincronizaciones a la vez del mismo cliente

async function wooFetch(cfg, path, { method = 'GET', body, query = {} } = {}) {
  if (!cfg.url || !cfg.consumer_key || !cfg.consumer_secret) throw new Error('Faltan la URL o las claves de la API de WooCommerce');
  const u = new URL(`${cfg.url.replace(/\/$/, '')}/wp-json/wc/v3/${path}`);
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) u.searchParams.set(k, v);
  const auth = Buffer.from(`${cfg.consumer_key}:${cfg.consumer_secret}`).toString('base64');
  const r = await fetch(u, { method, headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const text = await r.text();
  let j; try { j = text ? JSON.parse(text) : {}; } catch { throw new Error(`WooCommerce no devolvió JSON (¿la URL es correcta y los enlaces permanentes no están en "Simple"?)`); }
  if (r.status === 401 || r.status === 403) throw new Error(method === 'GET' ? 'WooCommerce rechazó las claves (revisá consumer key y secret)' : 'Las claves no tienen permiso de escritura: generá unas con permiso Lectura/Escritura');
  if (!r.ok) throw new Error(j.message || `WooCommerce respondió ${r.status}`);
  return { data: j, totalPages: Number(r.headers.get('x-wp-totalpages')) || 1 };
}
// Deja respirar al servidor entre tandas para que el resto de los usuarios no quede esperando
const pausa = () => new Promise((r) => setImmediate(r));
async function porTandas(lista, fn, tanda = 25) {
  for (let i = 0; i < lista.length; i += tanda) {
    store.enTransaccion(() => { for (const x of lista.slice(i, i + tanda)) fn(x); });
    await pausa();
  }
}
async function todasLasPaginas(cfg, path, query = {}, tope = 100) {
  const out = [];
  for (let page = 1; page <= tope; page++) {
    const { data, totalPages } = await wooFetch(cfg, path, { query: { per_page: 100, page, ...query } });
    out.push(...data);
    if (page >= totalPages || !data.length) break;
  }
  return out;
}

// ───────────── Productos ─────────────
async function importarProductos(t, { stockInicial = true } = {}) {
  const cfg = cfgDe(t);
  const productos = await todasLasPaginas(cfg, 'products', { status: 'any' });
  const existentes = Object.fromEntries(store.list(t, 'productos').map((p) => [String(p.sku).trim(), p]));
  const res = { leidos: 0, creados: 0, actualizados: 0, sinSku: [], stockCargado: 0 };
  const items = [];
  for (const p of productos) {
    if (p.type === 'variable') {
      const vars = await todasLasPaginas(cfg, `products/${p.id}/variations`);
      for (const v of vars) {
        const attrs = (v.attributes || []).map((a) => a.option).filter(Boolean).join(' / ');
        items.push({ woo: v, woo_id: v.id, woo_parent_id: p.id, nombre: `${p.name}${attrs ? ' — ' + attrs : ''}`, categoria: p.categories?.[0]?.name || '' });
      }
    } else {
      items.push({ woo: p, woo_id: p.id, woo_parent_id: null, nombre: p.name, categoria: p.categories?.[0]?.name || '' });
    }
  }
  for (const it of items) {
    res.leidos++;
    const sku = String(it.woo.sku || '').trim();
    if (!sku) { res.sinSku.push(it.nombre); continue; }
    const precio = num(it.woo.price || it.woo.regular_price);
    const vinc = { woo_id: it.woo_id, woo_parent_id: it.woo_parent_id };
    const prev = existentes[sku];
    if (prev) {
      // Ya existía en Vixan: se vincula y se completa lo que falte, sin pisar costos ni stock
      store.update(t, 'productos', prev.id, { ...vinc, nombre: prev.nombre || it.nombre, precio: prev.precio || precio, categoria: prev.categoria || it.categoria });
      res.actualizados++;
    } else {
      store.create(t, 'productos', { sku, nombre: it.nombre, marca: '', fabricante: '', categoria: it.categoria, precio, costo: 0, stock_minimo: 0, market: false, activo: true, ...vinc });
      existentes[sku] = true;
      res.creados++;
      const qty = num(it.woo.stock_quantity);
      if (stockInicial && it.woo.manage_stock && qty > 0) {
        store.create(t, 'lotes', { lote: 'INICIAL-WOO', sku, producto: it.nombre, ingreso: new Date().toISOString().slice(0, 10), vencimiento: '', cantidad: qty, costo_unit: 0, origen: 'Stock inicial WooCommerce', deposito: 'Central' });
        store.create(t, 'movimientos_stock', { fecha: new Date().toISOString(), tipo: 'Stock inicial', sku, producto: it.nombre, deposito: 'Central', lote: 'INICIAL-WOO', cantidad: qty, nota: 'Importado de WooCommerce' });
        res.stockCargado++;
      }
    }
  }
  guardar(t, { ultima_import_productos: new Date().toISOString() });
  store.logEvent(t, null, 'woo.productos', res);
  return res;
}

// ───────────── Pedidos ─────────────
async function sincronizarPedidos(t) {
  const { pedidoDesdeWoo } = require('./integrations');
  const cfg = cfgDe(t);
  const desde = cfg.ultima_sync_pedidos ? new Date(new Date(cfg.ultima_sync_pedidos).getTime() - 2 * 3600000).toISOString() : undefined;
  const inicio = new Date().toISOString();
  const pedidos = await todasLasPaginas(cfg, 'orders', { modified_after: desde, orderby: 'date', order: 'asc' }, desde ? 20 : 200);
  const res = { leidos: pedidos.length, creados: 0, cancelados: 0 };
  const actuales = new Map(store.list(t, 'pedidos').filter((p) => p.origen === 'woocommerce').map((p) => [String(p.external_id), p]));
  const cacheClientes = store.list(t, 'clientes');
  await porTandas(pedidos, (o) => {
    const ya = actuales.get(String(o.id));
    if (!ya) { const nuevo = pedidoDesdeWoo(t, o, undefined, cacheClientes); if (nuevo) { res.creados++; actuales.set(String(o.id), nuevo); } return; }
    // Un pedido cancelado en la tienda que todavía no salió libera su reserva de stock
    if (['cancelled', 'refunded', 'failed'].includes(o.status) && ['pendiente', 'para_armar', 'para_despachar'].includes(ya.estado)) {
      store.update(t, 'pedidos', ya.id, { estado: 'cancelado' });
      res.cancelados++;
    }
  });
  guardar(t, { ultima_sync_pedidos: inicio });
  if (res.creados || res.cancelados) { store.logEvent(t, null, 'woo.pedidos', res); programarEnvioStock(t); }
  return res;
}

// ───────────── Clientes ─────────────
async function detectarCamposCheckout(t) {
  const { detectarCampos } = require('./woo-clientes');
  const { data } = await wooFetch(cfgDe(t), 'orders', { query: { per_page: 50, orderby: 'date', order: 'desc' } });
  const r = detectarCampos(data);
  const c = cfgDe(t);
  return { ...r, campo_doc: c.campo_doc || '', campo_cond: c.campo_cond || '', pedidosRevisados: data.length };
}
async function importarClientes(t) {
  const wc = require('./woo-clientes');
  const cfg = cfgDe(t);
  const cache = store.list(t, 'clientes');
  const res = { registrados: 0, dePedidos: 0, creados: 0, actualizados: 0, conDocumento: 0, conCondicion: 0, pedidosVinculados: 0 };
  const contar = (r, d) => { if (r.accion === 'creado') res.creados++; else if (r.accion === 'actualizado') res.actualizados++; if (d.doc) res.conDocumento++; if (d.condicion_iva) res.conCondicion++; };
  // 1) Clientes con cuenta en la tienda
  await porTandas(await todasLasPaginas(cfg, 'customers', { role: 'all' }), (c) => {
    const d = wc.datosDeCliente(c, cfg);
    if (!d.email) return;
    contar(wc.vincularCliente(t, d, cache), d); res.registrados++;
  });
  // 2) Todos los pedidos: suma a los que compraron sin cuenta y trae el DNI/CUIT del checkout (más nuevo primero)
  const pedidosWoo = await todasLasPaginas(cfg, 'orders', { orderby: 'date', order: 'desc' }, 200);
  const porExterno = Object.fromEntries(store.list(t, 'pedidos').filter((p) => p.origen === 'woocommerce').map((p) => [String(p.external_id), p]));
  const vistos = new Set();
  await porTandas(pedidosWoo, (o) => {
    const d = wc.datosDePedido(o, cfg);
    const clave = String(d.email || '').trim().toLowerCase() || (d.doc ? `doc:${d.doc}` : `nombre:${String(d.nombre || '').trim().toLowerCase()}`);
    let cli;
    if (!vistos.has(clave)) { vistos.add(clave); const r = wc.vincularCliente(t, d, cache); contar(r, d); cli = r.cliente; res.dePedidos++; }
    else cli = wc.vincularCliente(t, { ...d, doc: null, condicion_iva: null }, cache).cliente; // ya actualizado con el pedido más nuevo
    const ped = porExterno[String(o.id)];
    if (ped && Number(ped.cliente_id) !== cli.id) { store.update(t, 'pedidos', ped.id, { cliente_id: cli.id, cliente: ped.cliente || cli.nombre, doc: d.doc || ped.doc || '', condicion_iva: d.condicion_iva || ped.condicion_iva || '' }); res.pedidosVinculados++; }
  });
  guardar(t, { ultima_import_clientes: new Date().toISOString() });
  store.logEvent(t, null, 'woo.clientes', res);
  return res;
}

// ───────────── Stock hacia WooCommerce ─────────────
async function enviarStock(t, { forzar = false } = {}) {
  const cfg = cfgDe(t);
  if (!cfg.enviar_stock && !forzar) return { enviados: 0, desactivado: true };
  const { stockPorSku } = require('./logic');
  const disp = Object.fromEntries(stockPorSku(t).map((s) => [s.sku, Math.max(0, s.disponible)]));
  const cambios = store.list(t, 'productos').filter((p) => p.woo_id && (forzar || num(p.woo_stock_enviado) !== (disp[p.sku] ?? 0) || p.woo_stock_enviado === undefined));
  const grupos = {}; // 'p' = productos simples; '<id padre>' = variantes de ese producto
  for (const p of cambios) (grupos[p.woo_parent_id || 'p'] ||= []).push(p);
  let enviados = 0;
  const errores = [];
  for (const [g, lista] of Object.entries(grupos)) {
    for (let i = 0; i < lista.length; i += 100) {
      const lote = lista.slice(i, i + 100);
      const path = g === 'p' ? 'products/batch' : `products/${g}/variations/batch`;
      try {
        const { data } = await wooFetch(cfg, path, { method: 'POST', body: { update: lote.map((p) => ({ id: p.woo_id, manage_stock: true, stock_quantity: disp[p.sku] ?? 0 })) } });
        const fallidos = new Set((data.update || []).filter((x) => x.error).map((x) => x.id));
        for (const p of lote) {
          if (fallidos.has(p.woo_id)) { errores.push(p.sku); continue; }
          store.update(t, 'productos', p.id, { woo_stock_enviado: disp[p.sku] ?? 0, woo_stock_at: new Date().toISOString() });
          enviados++;
        }
      } catch (e) { errores.push(e.message); if (/permiso de escritura|claves/.test(e.message)) break; }
    }
    if (errores.some((x) => /permiso de escritura|claves/.test(x))) break;
  }
  guardar(t, { ultimo_envio_stock: new Date().toISOString(), ultimo_error_stock: errores.length ? errores.slice(0, 5).join(' · ') : null });
  if (enviados || errores.length) store.logEvent(t, null, 'woo.stock', { enviados, errores: errores.slice(0, 5) });
  return { enviados, errores };
}

// Después de cualquier cambio de stock, espera unos segundos y manda lo que cambió
const pendientes = new Map();
function programarEnvioStock(t) {
  if (!cfgDe(t).enviar_stock) return;
  clearTimeout(pendientes.get(t));
  pendientes.set(t, setTimeout(() => { pendientes.delete(t); enviarStock(t).catch((e) => guardar(t, { ultimo_error_stock: e.message })); }, Number(process.env.WOO_STOCK_DEBOUNCE_MS) || 8000));
}

// ───────────── Ciclo automático ─────────────
// Una sola sincronización a la vez por cliente (la automática y los botones no se pisan)
async function exclusivo(t, fn) {
  if (corriendo.has(t)) throw new Error('Ya hay una sincronización con WooCommerce en curso. Esperá unos minutos y probá de nuevo.');
  corriendo.add(t);
  try { return await fn(); } finally { corriendo.delete(t); }
}
async function sincronizarCliente(t) {
  if (corriendo.has(t)) return { ocupado: true };
  corriendo.add(t);
  try {
    const pedidos = await sincronizarPedidos(t);
    const stock = await enviarStock(t);
    guardar(t, { ultimo_error: null });
    return { pedidos, stock };
  } catch (e) {
    guardar(t, { ultimo_error: e.message, ultimo_error_at: new Date().toISOString() });
    throw e;
  } finally { corriendo.delete(t); }
}
function iniciarAuto() {
  const minutos = Number(process.env.WOO_SYNC_MINUTOS) || 5;
  const tick = async () => {
    const filas = store.db.prepare("SELECT s.tenant_id FROM settings s JOIN tenants t ON t.id=s.tenant_id WHERE s.key='woo' AND t.activo=1 AND json_extract(s.value,'$.auto')=1").all();
    for (const { tenant_id } of filas) await sincronizarCliente(tenant_id).catch(() => {});
  };
  setInterval(tick, minutos * 60000).unref();
  setTimeout(tick, 15000).unref();
}

module.exports = { exclusivo, detectarCamposCheckout, importarClientes, importarProductos, sincronizarPedidos, enviarStock, programarEnvioStock, sincronizarCliente, iniciarAuto, cfgDe };
