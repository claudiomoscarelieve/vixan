// Vixan — reglas de negocio: stock, tableros, resultados, proyecciones,
// cuenta corriente de proveedores, IVA y cotizador de envíos.
const store = require('./db');

const DAY = 86400000;
const ESTADOS_ACTIVOS = ['pendiente', 'para_armar', 'para_despachar'];
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const num = (v) => Number(v) || 0;
const hoyAR = () => ymd(Date.now() - 3 * 3600000);

function inRange(fecha, desde, hasta) {
  const f = String(fecha || '').slice(0, 10);
  return (!desde || f >= desde) && (!hasta || f <= hasta);
}
const vendidos = (pedidos) => pedidos.filter((p) => p.estado !== 'cancelado');

// ───────────── Stock ─────────────
function stockPorSku(t) {
  // Los combos, cajas y presentaciones no tienen stock propio: se calcula con lo que hay de sus componentes
  const cat = require('./catalogo');
  const ctx = cat.contexto(t);
  const out = [];
  const vistos = new Set();
  for (const pr of ctx.productos) {
    const s = ctx.stock.get(String(pr.sku)) || { enLotes: 0, reservado: 0, disponible: 0 };
    const tipo = cat.tipoDe(pr);
    const calculado = tipo !== 'unidad';
    out.push({ sku: String(pr.sku), producto: pr.nombre, marca: pr.marca, stock_minimo: num(pr.stock_minimo), tipo,
      enLotes: calculado ? 0 : s.enLotes, reservado: calculado ? 0 : s.reservado, total: calculado ? 0 : s.enLotes,
      disponible: calculado ? cat.disponible(pr, ctx) : s.disponible });
    vistos.add(String(pr.sku));
  }
  // SKU con stock o ventas que no están en el catálogo
  for (const s of ctx.stock.values()) if (!vistos.has(s.sku)) out.push({ sku: s.sku, enLotes: s.enLotes, reservado: s.reservado, total: s.enLotes, disponible: s.disponible, tipo: 'unidad' });
  return out;
}

// Descuenta del stock por FIFO de vencimiento cuando un pedido sale.
// Combos y cajas descuentan sus componentes; las presentaciones, la parte del producto entero.
function descontarStock(t, pedido, userId) {
  const cat = require('./catalogo');
  const ctx = cat.contexto(t, { stock: false });
  const lotes = store.list(t, 'lotes').sort((a, b) => String(a.vencimiento || '9999').localeCompare(String(b.vencimiento || '9999')));
  const r4 = (v) => Math.round(v * 10000) / 10000;
  for (const it of pedido.items || []) {
    for (const x of cat.expandir(it.sku, it.cantidad, ctx)) {
      let falta = num(x.cantidad);
      const prod = ctx.bySku.get(x.sku);
      for (const l of lotes.filter((y) => String(y.sku) === x.sku && num(y.cantidad) > 0)) {
        if (falta <= 1e-9) break;
        const usa = r4(Math.min(falta, num(l.cantidad)));
        l.cantidad = r4(num(l.cantidad) - usa);
        falta = r4(falta - usa);
        store.update(t, 'lotes', l.id, { cantidad: l.cantidad });
        const via = x.sku !== String(it.sku) ? ` (${it.cantidad}× ${it.sku})` : '';
        store.create(t, 'movimientos_stock', { fecha: new Date().toISOString(), tipo: 'Egreso por venta', sku: x.sku, producto: prod?.nombre || it.nombre, deposito: l.deposito, lote: l.lote, cantidad: -usa, nota: `Pedido ${pedido.numero}${via}` });
      }
    }
  }
  store.logEvent(t, userId, 'stock.egreso', { pedido: pedido.numero });
}

function cambiarEstadoPedido(t, id, estado, userId) {
  const p = store.get(t, 'pedidos', id);
  if (!p) return null;
  const antes = p.estado;
  const despachado = (e) => ['enviado', 'entregado'].includes(e);
  if (!despachado(antes) && despachado(estado)) descontarStock(t, p, userId);
  if (despachado(antes) && estado === 'cancelado') {
    // Igual que el portal de referencia: ningún reingreso de stock es automático
    store.create(t, 'auditoria', { pedido: p.numero, pedido_id: p.id, fecha: new Date().toISOString(), cliente: p.cliente, plataforma: p.plataforma, productos: (p.items || []).map((i) => `${i.cantidad}× ${i.sku}`).join(', '), total: p.total, estado: 'pendiente' });
  }
  const patch = { estado };
  if (estado === 'cancelado' && antes !== 'cancelado') setImmediate(() => { try { require('./facturacion').alCancelar(t, p); } catch { /* sin facturación */ } });
  if (estado === 'enviado' && !p.tracking) patch.tracking = 'VG' + String(p.id).padStart(8, '0');
  if (estado === 'entregado') patch.entregado_at = new Date().toISOString();
  return store.update(t, 'pedidos', id, patch);
}

// ───────────── Dashboard ─────────────
function dashboard(t, { mes } = {}) {
  const pedidos = vendidos(store.list(t, 'pedidos'));
  const productos = store.list(t, 'productos');
  const prodBySku = Object.fromEntries(productos.map((p) => [p.sku, p]));
  const hoy = hoyAR();
  const m = mes || hoy.slice(0, 7);
  const [y, mm] = m.split('-').map(Number);
  const prev = mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`;
  const delMes = pedidos.filter((p) => String(p.fecha).startsWith(m));
  const delPrev = pedidos.filter((p) => String(p.fecha).startsWith(prev));
  const sum = (arr) => arr.reduce((a, p) => a + num(p.total), 0);
  const unidades = (arr) => arr.reduce((a, p) => a + (p.items || []).reduce((b, i) => b + num(i.cantidad), 0), 0);
  const ventas = sum(delMes);
  const ventasPrev = sum(delPrev);
  const diasMes = new Date(y, mm, 0).getDate();
  const diaHoy = m === hoy.slice(0, 7) ? Number(hoy.slice(8, 10)) : diasMes;

  const porDia = {};
  for (let d = 1; d <= diasMes; d++) porDia[`${m}-${String(d).padStart(2, '0')}`] = 0;
  for (const p of delMes) porDia[String(p.fecha).slice(0, 10)] = (porDia[String(p.fecha).slice(0, 10)] || 0) + num(p.total);

  const agg = (keyFn) => {
    const o = {};
    for (const p of delMes) for (const it of p.items || []) {
      const k = keyFn(it, p); if (!k) continue;
      const r = (o[k] ||= { nombre: k, facturacion: 0, unidades: 0, costo: 0 });
      r.facturacion += num(it.precio) * num(it.cantidad);
      r.unidades += num(it.cantidad);
      r.costo += num(prodBySku[it.sku]?.costo) * num(it.cantidad);
    }
    return Object.values(o).map((r) => ({ ...r, mg: r.facturacion ? Math.round((1 - r.costo / r.facturacion) * 1000) / 10 : 0 })).sort((a, b) => b.facturacion - a.facturacion);
  };
  const porCliente = {};
  for (const p of delMes) { const r = (porCliente[p.cliente] ||= { nombre: p.cliente, facturacion: 0, pedidos: 0 }); r.facturacion += num(p.total); r.pedidos++; }

  const stock = stockPorSku(t);
  const alertas = stock.filter((s) => s.producto && s.tipo === 'unidad').map((s) => {
    const estado = s.disponible <= 0 ? 'sin_stock' : s.disponible < s.stock_minimo * 0.5 ? 'critica' : s.disponible < s.stock_minimo ? 'por_agotarse' : null;
    return estado ? { ...s, estado } : null;
  }).filter(Boolean);

  const costoMes = delMes.reduce((a, p) => a + (p.items || []).reduce((b, i) => b + num(prodBySku[i.sku]?.costo) * num(i.cantidad), 0), 0);
  const todos = store.list(t, 'pedidos');
  const settings = store.getSettings(t);
  return {
    mes: m,
    ventas, ventasPrev, variacion: ventasPrev ? (ventas - ventasPrev) / ventasPrev : null,
    pedidos: delMes.length, unidades: unidades(delMes),
    ticket: delMes.length ? ventas / delMes.length : 0,
    clientes: new Set(delMes.map((p) => p.cliente)).size,
    acumuladoAnio: sum(pedidos.filter((p) => String(p.fecha).startsWith(String(y)))),
    proyeccion: diaHoy ? (ventas / diaHoy) * diasMes : 0,
    objetivo: num(settings[`objetivo_${m}`]),
    margen: ventas ? 1 - costoMes / ventas : 0,
    porDia: Object.entries(porDia).map(([fecha, total]) => ({ fecha, total })),
    topProductos: agg((it) => it.nombre).slice(0, 8),
    porMarca: agg((it) => prodBySku[it.sku]?.marca || 'Sin marca').slice(0, 10),
    topClientes: Object.values(porCliente).sort((a, b) => b.facturacion - a.facturacion).slice(0, 8),
    alertas,
    incidencias: {
      sinSeguimiento: todos.filter((p) => p.estado === 'enviado' && !p.tracking).length,
      demorados: todos.filter((p) => ESTADOS_ACTIVOS.includes(p.estado) && Date.now() - new Date(p.fecha) > 3 * DAY).length,
      reingresosPendientes: store.list(t, 'auditoria').filter((a) => a.estado === 'pendiente').length,
      sinProducto: todos.filter((p) => (p.items || []).some((i) => !prodBySku[i.sku])).length,
    },
    contadores: Object.fromEntries(['pendiente', 'para_armar', 'para_despachar', 'enviado', 'entregado', 'cancelado'].map((e) => [e, todos.filter((p) => p.estado === e).length])),
  };
}

// ───────────── Resultados ─────────────
function resultados(t, { desde, hasta } = {}) {
  const prodBySku = Object.fromEntries(store.list(t, 'productos').map((p) => [p.sku, p]));
  const cfg = store.getSettings(t);
  const costoLogistico = num(cfg.costo_logistico_pedido ?? 1500);
  const pedidos = vendidos(store.list(t, 'pedidos')).filter((p) => inRange(p.fecha, desde, hasta));
  const filas = pedidos.map((p) => {
    const costoProd = (p.items || []).reduce((a, i) => a + num(prodBySku[i.sku]?.costo) * num(i.cantidad), 0);
    const comision = num(p.comision);
    const envio = num(p.costo_envio);
    const impuestos = num(p.impuestos);
    const ganancia = num(p.total) - comision - envio - impuestos - costoProd - costoLogistico;
    return { id: p.id, numero: p.numero, fecha: p.fecha, plataforma: p.plataforma, cliente: p.cliente, estado: p.estado, total: num(p.total), costoProd, envio, comision, impuestos, logistica: costoLogistico, ganancia, pct: p.total ? ganancia / p.total : 0 };
  });
  const tot = (k) => filas.reduce((a, f) => a + f[k], 0);
  const porPlat = {};
  for (const f of filas) { const r = (porPlat[f.plataforma] ||= { plataforma: f.plataforma, bruto: 0, comisiones: 0 }); r.bruto += f.total; r.comisiones += f.comision; }
  return {
    resumen: { ingresos: tot('total'), costoProd: tot('costoProd'), envio: tot('envio'), comision: tot('comision'), impuestos: tot('impuestos'), logistica: tot('logistica'), ganancia: tot('ganancia') },
    porPlataforma: Object.values(porPlat).map((r) => ({ ...r, neto: r.bruto - r.comisiones, pct: r.bruto ? r.comisiones / r.bruto : 0 })),
    filas,
  };
}

// ───────────── Proyecciones / reposición ─────────────
function proyecciones(t, { cobertura = 30 } = {}) {
  const productos = store.list(t, 'productos');
  const pedidos = vendidos(store.list(t, 'pedidos'));
  const stock = Object.fromEntries(stockPorSku(t).map((s) => [s.sku, s]));
  const marcas = store.list(t, 'marcas');
  const proveedores = store.list(t, 'proveedores');
  const now = Date.now();
  const v = {};
  // Lo vendido en combos, cajas y presentaciones cuenta como venta de sus componentes
  const cat = require('./catalogo');
  const cctx = cat.contexto(t, { stock: false });
  for (const p of pedidos) {
    const age = (now - new Date(p.fecha)) / DAY;
    for (const it of p.items || []) for (const x of cat.expandir(it.sku, it.cantidad, cctx)) {
      const r = (v[x.sku] ||= { d7: 0, d30: 0, d90: 0, ultima: null });
      if (age <= 7) r.d7 += num(x.cantidad);
      if (age <= 30) r.d30 += num(x.cantidad);
      if (age <= 90) r.d90 += num(x.cantidad);
      if (!r.ultima || p.fecha > r.ultima) r.ultima = p.fecha;
    }
  }
  return productos.filter((pr) => cat.tipoDe(pr) === 'unidad').map((pr) => {
    const s = stock[pr.sku] || { disponible: 0 };
    const vv = v[pr.sku] || { d7: 0, d30: 0, d90: 0 };
    const vel = vv.d30 / 30;
    const dias = vel ? Math.floor(s.disponible / vel) : null;
    const minimo = num(pr.stock_minimo);
    const aComprar = Math.max(0, Math.ceil(vel * cobertura + minimo - s.disponible));
    const marca = marcas.find((m) => m.nombre === pr.marca);
    const prov = proveedores.find((x) => x.id === Number(marca?.proveedor_id)) || null;
    const estado = s.disponible <= 0 ? 'Sin stock' : dias !== null && dias < 7 ? 'Crítico' : s.disponible < minimo ? 'Bajo mínimo' : vel === 0 ? 'Sin rotación' : 'OK';
    return { sku: pr.sku, producto: pr.nombre, marca: pr.marca, fabricante: pr.fabricante, proveedor: prov?.nombre_fantasia || '—', proveedor_id: prov?.id || null, stock: s.disponible, precio: num(pr.precio), costo: num(pr.costo), valorVenta: s.disponible * num(pr.precio), valorCosto: s.disponible * num(pr.costo), v7: vv.d7, v30: vv.d30, v90: vv.d90, promMensual: Math.round(vv.d90 / 3), velocidad: Math.round(vel * 100) / 100, diasStock: dias, aComprar, estado, ultima: vv.ultima, minimo };
  });
}

// ───────────── Cuenta corriente de proveedores (FIFO) ─────────────
function ccProveedor(t, proveedorId) {
  const prov = store.get(t, 'proveedores', proveedorId);
  const plazo = num(prov?.plazo_pago_dias);
  const movs = store.list(t, 'cc_proveedores').filter((m) => Number(m.proveedor_id) === Number(proveedorId))
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || a.id - b.id);
  let pagos = movs.reduce((a, m) => a + num(m.credito), 0);
  const out = movs.map((m) => {
    const r = { ...m };
    if (num(m.debito) > 0) {
      r.due_date = ymd(new Date(m.fecha).getTime() + plazo * DAY);
      const aplica = Math.min(pagos, num(m.debito));
      pagos -= aplica;
      r.pagado = aplica;
      r.pendiente = num(m.debito) - aplica;
    }
    return r;
  });
  const saldo = movs.reduce((a, m) => a + num(m.debito) - num(m.credito), 0);
  return { proveedor: prov, saldo, movimientos: out.reverse() };
}
function ccResumen(t) {
  const hoy = hoyAR();
  const suppliers = store.list(t, 'proveedores').map((p) => {
    const cc = ccProveedor(t, p.id);
    const pend = cc.movimientos.filter((m) => m.pendiente > 0).sort((a, b) => a.due_date.localeCompare(b.due_date));
    return { id: p.id, nombre_fantasia: p.nombre_fantasia, cuit: p.cuit, plazo_pago_dias: p.plazo_pago_dias, saldo: cc.saldo, prox_venc: pend[0]?.due_date || null };
  });
  return { hoy, totalPorPagar: suppliers.reduce((a, s) => a + Math.max(0, s.saldo), 0), suppliers };
}
function calendarioPagos(t) {
  const hoy = hoyAR();
  const items = [];
  for (const p of store.list(t, 'proveedores')) {
    for (const m of ccProveedor(t, p.id).movimientos) if (m.pendiente > 0) items.push({ ...m, proveedor: p.nombre_fantasia });
  }
  items.sort((a, b) => a.due_date.localeCompare(b.due_date));
  const en7 = ymd(new Date(hoy).getTime() + 7 * DAY);
  const g = { vencido: [], semana: [], futuro: [] };
  for (const i of items) (i.due_date < hoy ? g.vencido : i.due_date <= en7 ? g.semana : g.futuro).push(i);
  const tot = (a) => a.reduce((s, i) => s + i.pendiente, 0);
  return { hoy, grupos: g, totales: { vencido: tot(g.vencido), semana: tot(g.semana), futuro: tot(g.futuro) } };
}

// ───────────── IVA / contabilidad ─────────────
function libroIva(t, { desde, hasta } = {}) {
  const ventas = store.list(t, 'facturas').filter((f) => inRange(f.fecha, desde, hasta) && f.estado === 'emitida');
  const compras = store.list(t, 'ordenes_compra').filter((o) => inRange(o.fecha, desde, hasta) && o.nro_factura);
  const desglose = (total, alic = 21) => { const neto = num(total) / (1 + alic / 100); return { neto, iva: num(total) - neto }; };
  const v = ventas.map((f) => ({ ...f, ...desglose(f.total, f.alicuota || 21) }));
  const c = compras.map((o) => ({ fecha: o.fecha, comprobante: o.nro_factura, proveedor: o.proveedor, total: num(o.total), ...desglose(o.total, 21) }));
  const debito = v.reduce((a, f) => a + f.iva, 0);
  const credito = c.reduce((a, f) => a + f.iva, 0);
  return { ventas: v, compras: c, debito, credito, saldo: debito - credito };
}

function cuentaCorrienteServicio(t, { desde, hasta } = {}) {
  const cfg = store.getSettings(t);
  const costoLog = num(cfg.costo_logistico_pedido ?? 1500);
  const pctFact = num(cfg.porcentaje_facturacion ?? 2);
  const pedidos = vendidos(store.list(t, 'pedidos')).filter((p) => inRange(p.fecha, desde, hasta));
  const filas = pedidos.map((p) => ({ id: p.id, numero: p.numero, fecha: p.fecha, plataforma: p.plataforma, tipo_envio: p.tipo_envio, cliente: p.cliente, total: num(p.total), costoLog, costoPct: num(p.total) * pctFact / 100, cobro: p.pago === 'Pagado' ? (p.metodo_pago === 'Efectivo contra entrega' ? 'A rendir' : 'Cobrado por plataforma') : 'Pendiente' }));
  const aRendir = filas.filter((f) => f.cobro === 'A rendir').reduce((a, f) => a + f.total, 0);
  const servicios = filas.reduce((a, f) => a + f.costoLog + f.costoPct, 0);
  return { servicios, aRendir, saldo: aRendir - servicios, filas, costoLog, pctFact };
}

// ───────────── Cotizador de envíos ─────────────
// Tarifas propias por zona (CABA/GBA) + estimaciones de correos configurables.
function zonaPorCP(cp) {
  const n = Number(String(cp).replace(/\D/g, '').slice(0, 4));
  if (n >= 1000 && n <= 1499) return { zona: 'CABA', propia: true };
  if (n >= 1600 && n <= 1774) return { zona: 'GBA 1', propia: true };
  if (n >= 1775 && n <= 1999) return { zona: 'GBA 2', propia: true };
  if (n >= 1 && n <= 9431) return { zona: n < 3000 ? 'Interior cercano' : 'Interior', propia: false };
  return { zona: 'CP inválido', propia: false, invalido: true };
}
function cotizar(t, { cp, entrega = 'domicilio', bultos = [] }) {
  const cfg = store.getSettings(t);
  const tarifas = cfg.tarifas_propias || { 'CABA': 4200, 'GBA 1': 5600, 'GBA 2': 7300 };
  const z = zonaPorCP(cp);
  if (z.invalido) return { error: 'Código postal inválido' };
  const bs = bultos.length ? bultos : [{ peso: 1, alto: 10, ancho: 20, largo: 30 }];
  const pesoFact = bs.map((b) => Math.max(num(b.peso), (num(b.alto) * num(b.ancho) * num(b.largo)) / 5000));
  const total = pesoFact.reduce((a, b) => a + b, 0);
  const opciones = [];
  if (z.propia) {
    const base = num(tarifas[z.zona]);
    const precio = pesoFact.reduce((a, p) => a + base * (p <= 2 ? 1 : p <= 5 ? 1.35 : p <= 10 ? 1.8 : 2.6), 0);
    opciones.push({ transportista: 'Vixan (flota propia)', servicio: 'Entrega en 24 h', precio: Math.round(precio), plazo: '24 h hábiles', recomendado: true });
  }
  const lejos = z.zona === 'Interior' ? 1.45 : z.zona === 'Interior cercano' ? 1.2 : 1;
  const suc = entrega === 'sucursal' ? 0.82 : 1;
  const correo = (nombre, base, porKg, plazo) => ({ transportista: nombre, servicio: entrega === 'sucursal' ? 'A sucursal' : 'A domicilio', precio: Math.round(bs.length * base * lejos * suc + total * porKg * lejos), plazo });
  opciones.push(correo('OCA', num(cfg.oca_base ?? 6900), num(cfg.oca_kg ?? 950), '3 a 6 días hábiles'));
  opciones.push(correo('Andreani', num(cfg.andreani_base ?? 7400), num(cfg.andreani_kg ?? 880), '2 a 5 días hábiles'));
  opciones.sort((a, b) => a.precio - b.precio);
  return { zona: z.zona, pesoFacturable: Math.round(total * 100) / 100, bultos: bs.length, opciones, nota: 'Las tarifas de correos son estimaciones configurables en Configuración → Costos hasta conectar las APIs de OCA y Andreani.' };
}

module.exports = { stockPorSku, cambiarEstadoPedido, dashboard, resultados, proyecciones, ccProveedor, ccResumen, calendarioPagos, libroIva, cuentaCorrienteServicio, cotizar, hoyAR, ESTADOS_ACTIVOS };
