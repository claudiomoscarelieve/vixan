// Vixan — catálogo y precios: costos (pesos o dólares), costos internos, listas de precios,
// combos, cajas y fraccionados (presentaciones que se venden por partes de un producto entero).
const express = require('express');
const store = require('./db');

const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
const n0 = (v) => num(v) || 0;
const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 10000) / 10000;
const TIPOS = ['unidad', 'combo', 'caja', 'presentacion'];
const tipoDe = (p) => (TIPOS.includes(p.tipo) ? p.tipo : 'unidad');
const esArmado = (p) => tipoDe(p) === 'combo' || tipoDe(p) === 'caja';

// ───────────── Configuración del catálogo ─────────────
const CONFIG_DEF = { costos_internos_general: 0, piso_margen: 55, redondeo_general: 'ninguno' };
const configDe = (t) => ({ ...CONFIG_DEF, ...(store.getSettings(t).catalogo || {}) });

// ───────────── Dólar del día ─────────────
// Se toma el oficial (venta) de una API pública y se guarda; también se puede cargar a mano.
const DOLAR_URL = () => process.env.DOLAR_URL || 'https://dolarapi.com/v1/dolares/oficial';
const dolarDe = (t) => store.getSettings(t).dolar || null;
const fallos = new Map(); // si la API no responde, no se reintenta en cada pantalla
async function actualizarDolar(t, { forzar = false } = {}) {
  const d = dolarDe(t);
  if (d?.manual && !forzar) return d;
  if (d && !forzar && Date.now() - new Date(d.actualizado || 0).getTime() < 6 * 3600000) return d;
  if (!forzar && Date.now() - (fallos.get(t) || 0) < 30 * 60000) return d;
  try {
    const r = await fetch(DOLAR_URL(), { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    const valor = Number(j.venta);
    if (!r.ok || !valor) throw new Error('sin dato');
    const nuevo = { valor, fuente: 'Oficial (Banco Nación, venta)', fecha: String(j.fechaActualizacion || new Date().toISOString()).slice(0, 10), actualizado: new Date().toISOString(), manual: false };
    store.setSetting(t, 'dolar', nuevo);
    return nuevo;
  } catch {
    fallos.set(t, Date.now());
    return d; // sin internet o API caída: se sigue con el último valor guardado
  }
}

// ───────────── Redondeo ─────────────
const REDONDEOS = {
  ninguno: 'Sin redondear', c10: 'A $10, el más cercano', c100: 'A $100, el más cercano', c1000: 'A $1.000, el más cercano',
  u10: 'A $10 hacia arriba', u100: 'A $100 hacia arriba', u1000: 'A $1.000 hacia arriba',
  t99u: 'Terminación 99 hacia arriba', t99c: 'Terminación 99, la más cercana', t99d: 'Terminación 99 hacia abajo',
};
function redondear(v, modo) {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const m = { c10: 10, c100: 100, c1000: 1000 }[modo];
  if (m) return Math.round(v / m) * m;
  const u = { u10: 10, u100: 100, u1000: 1000 }[modo];
  if (u) return Math.ceil(v / u) * u;
  if (modo && modo.startsWith('t99')) {
    const arriba = Math.ceil((v + 1) / 100) * 100 - 1;
    const abajo = Math.max(99, arriba - 100);
    if (modo === 't99u') return arriba;
    if (modo === 't99d') return v >= arriba ? arriba : abajo;
    return arriba - v <= v - abajo ? arriba : abajo;
  }
  return r2(v);
}

// ───────────── Listas de precios ─────────────
// modo "propio": el precio se escribe producto por producto.
// modo "calculada": sale del costo final o de otra lista, más un porcentaje (negativo = descuento).
function normalizarLista(l) {
  if (l.modo) return l;
  // listas de la versión anterior
  if (l.tipo === 'Precio fijo') return { ...l, modo: 'propio' };
  if (l.tipo === 'Descuento sobre precio') return { ...l, modo: 'calculada', base: 'general', porcentaje: -n0(l.markup) };
  return { ...l, modo: 'calculada', base: 'costo', porcentaje: n0(l.markup) };
}

// ───────────── Cálculo del catálogo ─────────────
// Arma un "contexto" con todo lo necesario para calcular costos, precios y stock de cualquier producto.
function contexto(t, { stock = true } = {}) {
  const productos = store.list(t, 'productos');
  const bySku = new Map(productos.map((p) => [String(p.sku), p]));
  const cfg = configDe(t);
  const dolar = dolarDe(t);
  const listas = store.list(t, 'listas_precio').map(normalizarLista);
  const listasById = new Map(listas.map((l) => [String(l.id), l]));
  const ctx = { t, productos, bySku, cfg, dolar, listas, listasById, memoCosto: new Map(), memoPrecio: new Map() };
  if (stock) ctx.stock = stockFisico(t, ctx);
  return ctx;
}

// Costo de una unidad en pesos, antes de costos internos
function costoBase(p, ctx) {
  if (n0(p.costo_usd) > 0 && n0(ctx.dolar?.valor) > 0) return n0(p.costo_usd) * ctx.dolar.valor;
  return n0(p.costo);
}
// Costo final = costo base + costos internos (%). Combos y cajas: el guardado (o la suma si no tienen);
// presentaciones: la parte proporcional del producto entero.
function costoFinal(p, ctx, prof = 0) {
  if (!p || prof > 6) return 0;
  const k = String(p.sku);
  if (ctx.memoCosto.has(k)) return ctx.memoCosto.get(k);
  let c;
  if (tipoDe(p) === 'presentacion') {
    const base = ctx.bySku.get(String(p.fraccion_de));
    const total = n0(base?.fraccion?.partes_por_unidad) || 1;
    c = base ? (costoFinal(base, ctx, prof + 1) * n0(p.partes)) / total : 0;
  } else if (esArmado(p)) {
    c = n0(p.costo) > 0 ? n0(p.costo) : sumaComponentes(p, ctx, prof);
  } else {
    const ci = num(p.costos_internos) ?? n0(ctx.cfg.costos_internos_general);
    c = costoBase(p, ctx) * (1 + ci / 100);
  }
  c = r2(c);
  ctx.memoCosto.set(k, c);
  return c;
}
function sumaComponentes(p, ctx, prof = 0) {
  return r2((p.componentes || []).reduce((a, c) => a + costoFinal(ctx.bySku.get(String(c.sku)), ctx, prof + 1) * n0(c.cantidad), 0));
}
// Precio "general" del producto (el de la ficha). Si tiene markup, sigue al costo.
function precioGeneral(p, ctx, prof = 0) {
  if (!p || prof > 6) return null;
  if (tipoDe(p) === 'presentacion') {
    const base = ctx.bySku.get(String(p.fraccion_de));
    const total = n0(base?.fraccion?.partes_por_unidad) || 1;
    const pb = base ? precioGeneral(base, ctx, prof + 1) : null;
    if (num(p.markup) !== null) return redondear(costoFinal(p, ctx) * (1 + num(p.markup) / 100), ctx.cfg.redondeo_general);
    if (!pb) return num(p.precio);
    return redondear(((pb * n0(p.partes)) / total) * (1 + n0(p.recargo) / 100), ctx.cfg.redondeo_general);
  }
  if (num(p.markup) !== null) return redondear(costoFinal(p, ctx) * (1 + num(p.markup) / 100), ctx.cfg.redondeo_general);
  return num(p.precio);
}
// Precio en una lista. Devuelve null si el producto no tiene precio en esa lista.
function precioEnLista(p, listaId, ctx, prof = 0) {
  if (!listaId || listaId === 'general') return precioGeneral(p, ctx);
  const l = ctx.listasById.get(String(listaId));
  if (!l || prof > 6) return null;
  let v;
  if (l.modo === 'propio') v = num(p.precios?.[l.id]);
  else {
    const base = l.base === 'costo' ? costoFinal(p, ctx) : precioEnLista(p, l.base || 'general', ctx, prof + 1);
    v = base ? base * (1 + n0(l.porcentaje) / 100) : null;
  }
  return v === null ? null : redondear(v, l.redondeo);
}

// ───────────── Stock ─────────────
// Lo que pide un ítem vendido, traducido a productos físicos (los combos y cajas se arman con
// sus componentes; las presentaciones descuentan partes del producto entero).
function expandir(sku, cantidad, ctx, prof = 0) {
  const p = ctx.bySku.get(String(sku));
  if (!p || prof > 6) return [{ sku: String(sku), cantidad: n0(cantidad) }];
  if (esArmado(p) && (p.componentes || []).length) return p.componentes.flatMap((c) => expandir(c.sku, n0(c.cantidad) * n0(cantidad), ctx, prof + 1));
  if (tipoDe(p) === 'presentacion' && p.fraccion_de) {
    const base = ctx.bySku.get(String(p.fraccion_de));
    const total = n0(base?.fraccion?.partes_por_unidad) || 1;
    return expandir(p.fraccion_de, r4((n0(cantidad) * n0(p.partes)) / total), ctx, prof + 1);
  }
  return [{ sku: String(p.sku), cantidad: n0(cantidad) }];
}
const ESTADOS_ACTIVOS = ['pendiente', 'para_armar', 'para_despachar'];
function stockFisico(t, ctx) {
  const map = new Map();
  const base = (sku) => { if (!map.has(sku)) map.set(sku, { sku, enLotes: 0, reservado: 0 }); return map.get(sku); };
  for (const l of store.list(t, 'lotes')) base(String(l.sku)).enLotes += n0(l.cantidad);
  for (const pe of store.list(t, 'pedidos')) {
    if (!ESTADOS_ACTIVOS.includes(pe.estado)) continue;
    for (const it of pe.items || []) for (const x of expandir(it.sku, it.cantidad, ctx)) base(x.sku).reservado += x.cantidad;
  }
  for (const s of map.values()) { s.enLotes = r4(s.enLotes); s.reservado = r4(s.reservado); s.disponible = r4(s.enLotes - s.reservado); }
  return map;
}
// Cuántas unidades de un producto se pueden vender hoy (para combos, cajas y presentaciones se calcula)
function disponible(p, ctx, prof = 0) {
  if (!p || prof > 6) return 0;
  const fis = (sku) => ctx.stock.get(String(sku))?.disponible || 0;
  if (esArmado(p) && (p.componentes || []).length) {
    return Math.max(0, Math.min(...p.componentes.map((c) => Math.floor(disponible(ctx.bySku.get(String(c.sku)), ctx, prof + 1) / (n0(c.cantidad) || 1)))));
  }
  if (tipoDe(p) === 'presentacion' && p.fraccion_de) {
    const b = ctx.bySku.get(String(p.fraccion_de));
    const total = n0(b?.fraccion?.partes_por_unidad) || 1;
    return Math.max(0, Math.floor(r4((fis(p.fraccion_de) * total) / (n0(p.partes) || 1))));
  }
  return fis(p.sku);
}

// Fila calculada de un producto para las pantallas
function fila(p, ctx) {
  const tipo = tipoDe(p);
  const cf = costoFinal(p, ctx);
  const pg = precioGeneral(p, ctx);
  const f = {
    ...p, tipo, costo_base: r2(costoBase(p, ctx)), costo_final: cf, precio_general: pg,
    stock: ctx.stock ? disponible(p, ctx) : null,
    margen: pg && cf ? r2(((pg - cf) / pg) * 100) : null,
    markup_equivalente: pg && cf ? r2((pg / cf - 1) * 100) : null,
    precios_lista: Object.fromEntries(ctx.listas.map((l) => [l.id, precioEnLista(p, l.id, ctx)])),
  };
  f.bajo_piso = !!(pg && cf && pg < cf * (1 + n0(ctx.cfg.piso_margen) / 100));
  if (esArmado(p)) {
    f.suma_componentes = sumaComponentes(p, ctx);
    f.costo_guardado = n0(p.costo);
    f.revisar = !(p.componentes || []).length || Math.abs(f.costo_guardado - f.suma_componentes) >= 1;
    f.detalle_componentes = (p.componentes || []).map((c) => { const q = ctx.bySku.get(String(c.sku)); return { sku: c.sku, nombre: q?.nombre || '(no está en el catálogo)', existe: !!q, cantidad: n0(c.cantidad), costo_unitario: costoFinal(q, ctx), subtotal: r2(costoFinal(q, ctx) * n0(c.cantidad)), disponible: q ? disponible(q, ctx) : 0 }; });
  }
  if (p.fraccion) {
    const pres = ctx.productos.filter((x) => tipoDe(x) === 'presentacion' && String(x.fraccion_de) === String(p.sku)).sort((a, b) => n0(b.partes) - n0(a.partes));
    f.presentaciones = pres.map((x) => ({ id: x.id, sku: x.sku, nombre: x.nombre, presentacion: x.presentacion, partes: n0(x.partes), recargo: num(x.recargo), precio: precioGeneral(x, ctx), se_pueden_vender: ctx.stock ? disponible(x, ctx) : null }));
  }
  return f;
}

// ───────────── Validaciones ─────────────
function validarComponentes(t, sku, componentes, ctx) {
  const lista = (componentes || []).map((c) => ({ sku: String(c.sku || '').trim(), cantidad: n0(c.cantidad) })).filter((c) => c.sku && c.cantidad > 0);
  if (!lista.length) throw new Error('Agregá al menos un componente');
  const juntos = new Map();
  for (const c of lista) juntos.set(c.sku, (juntos.get(c.sku) || 0) + c.cantidad);
  for (const s of juntos.keys()) {
    if (s === sku) throw new Error('Un combo no puede contenerse a sí mismo');
    if (!ctx.bySku.has(s)) throw new Error(`El SKU ${s} no está en el catálogo`);
    // evita ciclos: A contiene B y B contiene A
    const visto = new Set();
    const contiene = (x) => { const q = ctx.bySku.get(x); if (!q || visto.has(x)) return false; visto.add(x); return (q.componentes || []).some((c) => String(c.sku) === sku || contiene(String(c.sku))); };
    if (contiene(s)) throw new Error(`${s} ya contiene a ${sku}: se formaría un círculo`);
  }
  return [...juntos].map(([s, cantidad]) => ({ sku: s, cantidad }));
}
const skuLibre = (t, sku, id) => !store.list(t, 'productos').some((p) => String(p.sku) === String(sku) && String(p.id) !== String(id ?? ''));

// Los combos y cajas de la versión anterior eran registros aparte con los componentes en texto:
// se pasan al catálogo como productos de tipo combo o caja.
function migrar(t) {
  for (const [entidad, tipo] of [['combos', 'combo'], ['cajas', 'caja']]) {
    const viejos = store.list(t, entidad);
    if (!viejos.length) continue;
    const ctx = contexto(t, { stock: false });
    store.enTransaccion(() => {
      for (const v of viejos) {
        const componentes = String(v.componentes || '').split(',').map((s) => s.trim().match(/^(.+?)\s*[×x*]\s*(\d+(?:[.,]\d+)?)$/i)).filter(Boolean).map((m) => ({ sku: m[1].trim(), cantidad: Number(m[2].replace(',', '.')) }));
        const ya = ctx.bySku.get(String(v.sku));
        if (ya) store.update(t, 'productos', ya.id, { tipo, componentes: ya.componentes?.length ? ya.componentes : componentes });
        else if (v.sku) store.create(t, 'productos', { sku: v.sku, nombre: v.descripcion || v.sku, tipo, componentes, costo: n0(v.costo), precio: n0(v.precio) || null });
        store.remove(t, entidad, v.id);
      }
    });
  }
}
function migrarTodos() {
  for (const { id } of store.db.prepare('SELECT id FROM tenants').all()) { try { migrar(id); } catch (e) { console.error('migración de combos', id, e.message); } }
}

// ───────────── Rutas (/api/catalogo) ─────────────
const router = express.Router();
const wrap = (fn) => async (req, res) => { try { res.json({ ok: true, data: await fn(req) }); } catch (e) { res.status(400).json({ ok: false, error: e.message }); } };
const avisarStock = (t) => { try { require('./woo').programarEnvioStock(t); } catch { /* sin Woo */ } };

router.get('/', wrap(async (req) => {
  const t = req.tenantId;
  await actualizarDolar(t);
  const ctx = contexto(t);
  return {
    productos: ctx.productos.map((p) => fila(p, ctx)),
    listas: ctx.listas.filter((l) => !l.archivada),
    dolar: ctx.dolar, config: ctx.cfg, redondeos: REDONDEOS,
    categorias: store.list(t, 'categorias').map((c) => c.nombre).filter(Boolean),
  };
}));

router.post('/config', wrap((req) => {
  const c = { ...configDe(req.tenantId) };
  for (const k of Object.keys(CONFIG_DEF)) if (req.body[k] !== undefined) c[k] = k === 'redondeo_general' ? (REDONDEOS[req.body[k]] ? req.body[k] : 'ninguno') : n0(req.body[k]);
  store.setSetting(req.tenantId, 'catalogo', c);
  return c;
}));

router.post('/dolar', wrap(async (req) => {
  const t = req.tenantId;
  if (req.body.automatico) { const d = dolarDe(t); if (d) store.setSetting(t, 'dolar', { ...d, manual: false }); const n = await actualizarDolar(t, { forzar: true }); if (!n) throw new Error('No se pudo leer el dólar oficial. Cargalo a mano.'); return n; }
  const valor = n0(req.body.valor);
  if (valor <= 0) throw new Error('Escribí el valor del dólar');
  const d = { valor, fuente: 'Cargado a mano', fecha: new Date().toISOString().slice(0, 10), actualizado: new Date().toISOString(), manual: true };
  store.setSetting(t, 'dolar', d);
  return d;
}));

// Costos: cambios en lote [{id, costo, costo_usd, costos_internos, pasar_a_pesos}]
router.post('/costos', wrap((req) => {
  const t = req.tenantId;
  const ctx = contexto(t, { stock: false });
  let n = 0;
  store.enTransaccion(() => {
    for (const c of req.body.cambios || []) {
      const p = store.get(t, 'productos', c.id);
      if (!p) continue;
      const patch = {};
      if (c.pasar_a_pesos) { patch.costo = r2(costoBase(p, ctx)); patch.costo_usd = null; }
      if (c.costo_usd !== undefined) patch.costo_usd = num(c.costo_usd);
      if (c.costo !== undefined) patch.costo = num(c.costo) ?? 0;
      if (c.costos_internos !== undefined) patch.costos_internos = num(c.costos_internos);
      store.update(t, 'productos', p.id, patch); n++;
    }
  });
  if (req.body.costos_internos_general !== undefined) {
    const cfg = { ...configDe(t), costos_internos_general: n0(req.body.costos_internos_general) };
    store.setSetting(t, 'catalogo', cfg);
    if (req.body.aplicar_a_todos) store.enTransaccion(() => { for (const p of store.list(t, 'productos')) if (num(p.costos_internos) !== null) { store.update(t, 'productos', p.id, { costos_internos: null }); n++; } });
  }
  return { actualizados: n };
}));

// Precios de una lista: [{id, markup, precio}]. Lista "general" = el precio de la ficha.
router.post('/precios', wrap((req) => {
  const t = req.tenantId;
  const listaId = String(req.body.lista || 'general');
  const ctx = contexto(t, { stock: false });
  const lista = listaId === 'general' ? null : ctx.listasById.get(listaId);
  if (listaId !== 'general' && !lista) throw new Error('Esa lista no existe');
  if (lista && lista.modo !== 'propio') throw new Error('Esta lista se calcula sola: cambiá su porcentaje en Administrar listas');
  let n = 0;
  store.enTransaccion(() => {
    if (req.body.markup_general !== undefined && !lista) {
      for (const p of ctx.productos) if (tipoDe(p) !== 'presentacion') { store.update(t, 'productos', p.id, { markup: n0(req.body.markup_general) }); n++; }
    }
    for (const c of req.body.cambios || []) {
      const p = store.get(t, 'productos', c.id);
      if (!p) continue;
      if (lista) store.update(t, 'productos', p.id, { precios: { ...(p.precios || {}), [lista.id]: num(c.precio) } });
      else {
        const patch = {};
        if (c.markup !== undefined) patch.markup = num(c.markup);
        if (c.precio !== undefined) { patch.precio = num(c.precio); if (c.markup === undefined) patch.markup = null; }
        store.update(t, 'productos', p.id, patch);
      }
      n++;
    }
  });
  return { actualizados: n };
}));

// Recalcular: fija el precio de todo lo que tiene markup y le pone a cada combo la suma de sus componentes
router.post('/recalcular', wrap((req) => {
  const t = req.tenantId;
  let combos = 0, precios = 0;
  let ctx = contexto(t, { stock: false });
  store.enTransaccion(() => {
    for (const p of ctx.productos) if (esArmado(p) && (p.componentes || []).length) { const s = sumaComponentes(p, ctx); if (Math.abs(s - n0(p.costo)) >= 0.01) { store.update(t, 'productos', p.id, { costo: s }); combos++; } }
  });
  ctx = contexto(t, { stock: false });
  store.enTransaccion(() => {
    for (const p of ctx.productos) if (num(p.markup) !== null) { const v = precioGeneral(p, ctx); if (v !== num(p.precio)) { store.update(t, 'productos', p.id, { precio: v }); precios++; } }
  });
  return { combos, precios };
}));

// Combos y cajas: crea o edita un producto armado con sus componentes
router.post('/armado', wrap((req) => {
  const t = req.tenantId;
  const b = req.body || {};
  const tipo = b.tipo === 'caja' ? 'caja' : 'combo';
  const sku = String(b.sku || '').trim();
  if (!sku || !String(b.nombre || '').trim()) throw new Error('Completá el nombre y el SKU');
  if (!skuLibre(t, sku, b.id)) throw new Error(`Ya hay otro producto con el SKU ${sku}`);
  const ctx = contexto(t, { stock: false });
  const componentes = validarComponentes(t, sku, b.componentes, ctx);
  const cand = { sku, componentes };
  const suma = sumaComponentes(cand, ctx);
  const data = { sku, nombre: String(b.nombre).trim(), tipo, componentes, costo: b.costo === undefined || b.reparar ? suma : n0(b.costo) };
  if (b.markup !== undefined) data.markup = num(b.markup);
  const p = b.id ? store.update(t, 'productos', b.id, data) : store.create(t, 'productos', { ...data, markup: data.markup ?? null, categoria: b.categoria || '' });
  avisarStock(t);
  return p;
}));
router.post('/armado/:id/convertir', wrap((req) => {
  const p = store.get(req.tenantId, 'productos', req.params.id);
  if (!p || !esArmado(p)) throw new Error('No es un combo ni una caja');
  return store.update(req.tenantId, 'productos', p.id, { tipo: tipoDe(p) === 'combo' ? 'caja' : 'combo' });
}));

// Fraccionados: el producto entero y sus presentaciones
// body: {base_id, unidad, trae, parte, presentaciones:[{id?, sku, nombre?, partes, recargo}]}
router.post('/fraccionado', wrap((req) => {
  const t = req.tenantId;
  const b = req.body || {};
  const base = store.get(t, 'productos', b.base_id);
  if (!base) throw new Error('Elegí el producto entero');
  if (tipoDe(base) !== 'unidad') throw new Error('El producto entero tiene que ser un producto por unidad (no un combo ni una presentación)');
  const trae = n0(b.trae), parte = n0(b.parte);
  if (trae <= 0 || parte <= 0) throw new Error('Completá cuánto trae la unidad entera y la porción más chica');
  const total = trae / parte;
  if (Math.abs(total - Math.round(total)) > 1e-9) throw new Error('La porción más chica tiene que entrar justa en la unidad entera (por ejemplo 500 g en partes de 25 g)');
  const unidad = String(b.unidad || 'g').trim() || 'g';
  const pres = (b.presentaciones || []).filter((x) => String(x.sku || '').trim());
  if (!pres.length) throw new Error('Agregá al menos una presentación');
  const vistos = new Set();
  for (const x of pres) {
    const partes = n0(x.partes);
    if (partes <= 0 || partes >= total || Math.abs(partes - Math.round(partes)) > 1e-9) throw new Error(`La presentación ${x.sku} tiene que ser de 1 a ${Math.round(total) - 1} partes`);
    const s = String(x.sku).trim();
    if (s === String(base.sku)) throw new Error('Cada presentación necesita un SKU distinto al del producto entero');
    if (vistos.has(s)) throw new Error(`El SKU ${s} está repetido`); vistos.add(s);
    const otro = store.list(t, 'productos').find((p) => String(p.sku) === s);
    if (otro && tipoDe(otro) !== 'unidad' && !(tipoDe(otro) === 'presentacion' && String(otro.fraccion_de) === String(base.sku))) throw new Error(`El SKU ${s} ya es un combo, una caja o una presentación de otro producto`);
  }
  const res = { creadas: 0, actualizadas: 0, quitadas: 0, stockPasado: [] };
  store.enTransaccion(() => {
    store.update(t, 'productos', base.id, { fraccion: { unidad, trae, parte, partes_por_unidad: Math.round(total) } });
    const actuales = store.list(t, 'productos').filter((p) => tipoDe(p) === 'presentacion' && String(p.fraccion_de) === String(base.sku));
    for (const x of pres) {
      const s = String(x.sku).trim();
      const partes = Math.round(n0(x.partes));
      const etiqueta = `${r4(partes * parte)} ${unidad}`;
      const data = { tipo: 'presentacion', fraccion_de: String(base.sku), partes, recargo: num(x.recargo) ?? recargoHabitual(partes / total), presentacion: etiqueta };
      const existente = store.list(t, 'productos').find((p) => String(p.sku) === s);
      if (existente) {
        // Si ya existía como producto suelto, su stock pasa a partes del producto entero
        if (tipoDe(existente) === 'unidad') {
          const lotes = store.list(t, 'lotes').filter((l) => String(l.sku) === s && n0(l.cantidad) > 0);
          for (const l of lotes) {
            const unidades = r4((n0(l.cantidad) * partes) / total);
            store.update(t, 'lotes', l.id, { sku: String(base.sku), producto: base.nombre, cantidad: unidades, costo_unit: r2((n0(l.costo_unit) * total) / partes), nota: `Pasado desde ${s} (${l.cantidad} × ${etiqueta})` });
            store.create(t, 'movimientos_stock', { fecha: new Date().toISOString(), tipo: 'Fraccionado', sku: s, producto: existente.nombre, deposito: l.deposito, lote: l.lote, cantidad: -n0(l.cantidad), nota: `Pasa a ${base.sku} como ${unidades} unidades` });
            res.stockPasado.push({ sku: s, cantidad: n0(l.cantidad), unidades });
          }
        }
        store.update(t, 'productos', existente.id, { ...data, nombre: x.nombre || existente.nombre });
        res.actualizadas++;
      } else {
        store.create(t, 'productos', { ...data, sku: s, nombre: x.nombre || `${base.nombre} · ${etiqueta}`, marca: base.marca || '', categoria: base.categoria || '', markup: null, precio: null });
        res.creadas++;
      }
    }
    // Presentaciones que se sacaron: vuelven a ser productos sueltos sin stock propio
    for (const a of actuales) if (!vistos.has(String(a.sku))) { store.update(t, 'productos', a.id, { tipo: 'unidad', fraccion_de: null, partes: null, recargo: null }); res.quitadas++; }
  });
  avisarStock(t);
  return res;
}));
router.delete('/fraccionado/:id', wrap((req) => {
  const t = req.tenantId;
  const base = store.get(t, 'productos', req.params.id);
  if (!base?.fraccion) throw new Error('Ese producto no está fraccionado');
  let n = 0;
  store.enTransaccion(() => {
    for (const p of store.list(t, 'productos')) if (tipoDe(p) === 'presentacion' && String(p.fraccion_de) === String(base.sku)) { store.update(t, 'productos', p.id, { tipo: 'unidad', fraccion_de: null, partes: null, recargo: null }); n++; }
    store.update(t, 'productos', base.id, { fraccion: null });
  });
  avisarStock(t);
  return { presentaciones: n };
}));
// Recargo que se usa si no se escribe uno: mitad +10 %, un quinto +15 %, un décimo +30 %, un veinteavo +50 %
function recargoHabitual(fraccion) {
  if (fraccion >= 0.5) return 10;
  if (fraccion >= 0.2) return 15;
  if (fraccion >= 0.1) return 30;
  return 50;
}

// Importar productos desde Excel / CSV (primero se revisa con probar=true, después se importa)
router.post('/importar', wrap((req) => {
  const t = req.tenantId;
  const b = req.body || {};
  const r = require('./importar').importar(t, { nombre: b.nombre, contenido: b.contenido, probar: b.probar !== false, publicar: b.publicar !== false, stockInicial: b.stockInicial !== false, actualizar: b.actualizar !== false, deposito: String(b.deposito || 'Central') });
  if (b.probar === false) {
    store.logEvent(t, req.user?.id, 'importar_productos', `${b.nombre || 'archivo'}: ${r.nuevos} nuevos, ${r.actualizados} actualizados, ${r.conStock} con stock inicial`);
    avisarStock(t);
  }
  return r;
}));

// Categorías: asignar en masa
router.post('/categorias/asignar', wrap((req) => {
  const t = req.tenantId;
  const cat = String(req.body.categoria ?? '').trim();
  const ids = new Set((req.body.ids || []).map(String));
  if (cat && !store.list(t, 'categorias').some((c) => c.nombre === cat)) store.create(t, 'categorias', { nombre: cat });
  let n = 0;
  store.enTransaccion(() => { for (const p of store.list(t, 'productos')) if (ids.has(String(p.id))) { store.update(t, 'productos', p.id, { categoria: cat }); n++; } });
  return { actualizados: n };
}));

module.exports = { router, contexto, expandir, disponible, stockFisico, precioEnLista, precioGeneral, costoFinal, redondear, recargoHabitual, migrarTodos, normalizarLista, actualizarDolar, tipoDe };
