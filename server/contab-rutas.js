// Vixan — rutas de Contabilidad (/api/contabilidad)
const express = require('express');
const store = require('./db');
const base = require('./contabilidad');
const gestion = require('./contab-gestion');
const asientos = require('./contab-asientos');

const router = express.Router();
const wrap = (fn) => async (req, res) => { try { res.json({ ok: true, data: await fn(req) }); } catch (e) { res.status(400).json({ ok: false, error: e.message }); } };
const admin = (req) => { if (!['admin', 'superadmin'].includes(req.user?.rol)) throw new Error('Solo un admin de la cuenta puede cambiar esto'); };
const q = (req) => ({ desde: req.query.desde || undefined, hasta: req.query.hasta || undefined });
const T = (req) => req.tenantId;

// ── Consultas ──
router.get('/resumen', wrap((req) => asientos.resumen(T(req), q(req))));
router.get('/posicion', wrap((req) => asientos.posicion(T(req), q(req))));
router.get('/ventas', wrap((req) => base.ventasLibro(T(req), q(req))));
router.get('/compras', wrap((req) => base.comprasLibro(T(req), q(req))));
router.get('/diario', wrap((req) => asientos.diario(T(req), q(req))));
router.get('/mayor', wrap((req) => asientos.mayor(T(req), { ...q(req), cuenta: req.query.cuenta || undefined })));
router.get('/balance', wrap((req) => asientos.balance(T(req), { hasta: req.query.hasta })));
router.get('/bienes', wrap((req) => gestion.bienesResumen(T(req), q(req))));
router.get('/bancos', wrap((req) => gestion.bancosResumen(T(req), { ...q(req), banco_id: req.query.banco_id })));
router.get('/cheques', wrap((req) => gestion.chequesResumen(T(req))));
router.get('/prestamos', wrap((req) => gestion.prestamosResumen(T(req))));
router.get('/provincias', wrap((req) => gestion.provincias(T(req), q(req))));
router.get('/plan', wrap((req) => {
  const plan = base.planDe(T(req)); const imp = base.imputacionDe(T(req));
  const set = new Set(plan.cuentas.map((c) => c.codigo));
  // cuentas usadas por asientos manuales (no se pueden borrar)
  const usadas = new Set([...store.list(T(req), 'asientos').flatMap((a) => a.lineas.map((l) => l.cuenta)), ...Object.values(imp.conceptos), ...Object.values(imp.categorias), ...Object.values(imp.proveedores)]);
  const categorias = [...new Set(store.list(T(req), 'caja_movimientos').map((m) => m.categoria).filter(Boolean))].sort();
  const proveedores = new Map();
  for (const c of store.list(T(req), 'arca_comprobantes').filter((x) => x.origen === 'recibidos')) proveedores.set(c.doc_nro, c.nombre);
  return {
    ...plan, cuentas: plan.cuentas.map((c) => ({ ...c, rubro: base.esRubro(c.codigo), padre: base.padreDe(c.codigo, set), usada: usadas.has(c.codigo) })),
    conceptos: base.CONCEPTOS.map(([grupo, k, nombre, def]) => ({ grupo, k, nombre, defecto: def, cuenta: imp.conceptos[k] })),
    categorias: categorias.map((c) => ({ categoria: c, cuenta: imp.categorias[c] || null, sugerida: asientos.cuentaGasto(T(req), c).cuenta })),
    proveedores: [...proveedores].map(([cuit, nombre]) => ({ cuit, nombre, cuenta: imp.proveedores[cuit] || null })),
  };
}));
router.get('/config', wrap((req) => base.configDe(T(req))));
router.get('/txt', wrap((req) => {
  const mes = String(req.query.mes || '');
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('Elegí el mes');
  const r = asientos.archivosLID(T(req), mes);
  return { ...r, zip: asientos.zip(r.archivos).toString('base64'), archivos: r.archivos.map((a) => ({ nombre: a.nombre, lineas: a.contenido ? a.contenido.split('\r\n').length - 1 : 0 })) };
}));

// ── Cambios ──
router.post('/mis-comprobantes', wrap((req) => base.importarMisComprobantes(T(req), req.body || {})));
router.post('/mis-comprobantes/borrar', wrap((req) => {
  const { origen, mes } = req.body || {};
  const xs = store.list(T(req), 'arca_comprobantes').filter((c) => c.origen === origen && String(c.fecha).startsWith(mes));
  store.enTransaccion(() => xs.forEach((c) => store.remove(T(req), 'arca_comprobantes', c.id)));
  return { borrados: xs.length };
}));
router.post('/asientos', wrap((req) => {
  const b = req.body || {};
  const set = new Set(base.planDe(T(req)).cuentas.map((c) => c.codigo));
  const lineas = (b.lineas || []).map((l) => ({ cuenta: String(l.cuenta || '').trim(), detalle: l.detalle || '', debe: Math.round(Number(l.debe || 0) * 100) / 100, haber: Math.round(Number(l.haber || 0) * 100) / 100 })).filter((l) => l.cuenta && (l.debe || l.haber));
  if (!b.fecha) throw new Error('Falta la fecha');
  if (!String(b.concepto || '').trim()) throw new Error('Falta el concepto');
  if (lineas.length < 2 || !lineas.some((l) => l.debe) || !lineas.some((l) => l.haber)) throw new Error('Cargá al menos dos renglones: uno al debe y uno al haber');
  for (const l of lineas) { if (!set.has(l.cuenta)) throw new Error(`La cuenta ${l.cuenta} no está en el plan`); if (base.esRubro(l.cuenta)) throw new Error(`${l.cuenta} es un rubro: los asientos van a cuentas imputables`); if (l.debe && l.haber) throw new Error('Cada renglón va al debe o al haber, no a los dos'); }
  const d = lineas.reduce((a, l) => a + l.debe, 0), h = lineas.reduce((a, l) => a + l.haber, 0);
  if (Math.abs(d - h) >= 0.01) throw new Error(`El asiento no cuadra: debe ${d.toFixed(2)} y haber ${h.toFixed(2)}`);
  const datos = { fecha: String(b.fecha).slice(0, 10), concepto: String(b.concepto).trim(), referencia: b.referencia || '', lineas, usuario: req.user?.email || '' };
  return b.id ? store.update(T(req), 'asientos', b.id, datos) : store.create(T(req), 'asientos', datos);
}));
router.delete('/asientos/:id', wrap((req) => store.remove(T(req), 'asientos', req.params.id)));
router.post('/plan', wrap((req) => {
  admin(req);
  const cuentas = (req.body.cuentas || []).map((c) => ({ codigo: String(c.codigo).trim(), nombre: String(c.nombre || '').trim().toUpperCase(), activa: c.activa !== false, ...(c.bien ? { bien: true } : {}) }));
  const vistos = new Set();
  for (const c of cuentas) {
    if (!/^\d\.\d\.\d\.\d{2}\.\d{3}$/.test(c.codigo)) throw new Error(`El código ${c.codigo} no tiene el formato 1.1.1.01.001`);
    if (!c.nombre) throw new Error(`La cuenta ${c.codigo} no tiene nombre`);
    if (vistos.has(c.codigo)) throw new Error(`El código ${c.codigo} está repetido`); vistos.add(c.codigo);
  }
  store.setSetting(T(req), 'plan_cuentas', { cuentas, guardado: { fecha: new Date().toISOString(), por: req.user?.email || '' } });
  return { cuentas: cuentas.length };
}));
router.post('/plan/modelo', wrap((req) => { admin(req); store.setSetting(T(req), 'plan_cuentas', null); store.setSetting(T(req), 'contab_imputacion', null); return true; }));
router.post('/imputacion', wrap((req) => {
  admin(req);
  const actual = store.getSettings(T(req)).contab_imputacion || {};
  const limpiar = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v));
  const n = { conceptos: { ...(actual.conceptos || {}), ...limpiar(req.body.conceptos) }, categorias: { ...(actual.categorias || {}), ...(req.body.categorias || {}) }, proveedores: { ...(actual.proveedores || {}), ...(req.body.proveedores || {}) } };
  for (const k of ['categorias', 'proveedores']) for (const [x, v] of Object.entries(n[k])) if (!v) delete n[k][x];
  store.setSetting(T(req), 'contab_imputacion', n);
  return true;
}));
router.post('/config', wrap((req) => {
  admin(req);
  const c = { ...base.configDe(T(req)) };
  for (const k of ['iva_compras_solo_am', 'compras_mes_orden']) if (req.body[k] !== undefined) c[k] = !!req.body[k];
  if (req.body.amortizacion) c.amortizacion = req.body.amortizacion === 'mensual' ? 'mensual' : 'anual';
  if (req.body.cierre_mes) c.cierre_mes = Math.min(12, Math.max(1, Number(req.body.cierre_mes) || 12));
  store.setSetting(T(req), 'contab_config', c);
  return c;
}));
router.post('/bienes', wrap((req) => gestion.altaBien(T(req), req.body || {})));
router.post('/bienes/:id/baja', wrap((req) => gestion.bajaBien(T(req), req.params.id, req.body || {})));
router.post('/bienes/:id/anular', wrap((req) => store.update(T(req), 'bienes_uso', req.params.id, { estado: 'anulado' })));
router.post('/bancos/extracto', wrap((req) => gestion.subirExtracto(T(req), req.body || {})));
router.post('/bancos/conciliar-altas', wrap((req) => gestion.conciliarAltas(T(req), req.body.banco_id)));
router.post('/bancos/:id/conciliar', wrap((req) => gestion.conciliar(T(req), req.params.id, req.body.match)));
router.post('/cheques', wrap((req) => gestion.altaCheque(T(req), req.body || {})));
router.post('/cheques/:id/accion', wrap((req) => gestion.accionCheque(T(req), req.params.id, req.body || {})));
router.post('/prestamos/simular', wrap((req) => gestion.calcularCuotas(req.body || {})));
router.post('/prestamos', wrap((req) => gestion.altaPrestamo(T(req), req.body || {})));
router.post('/prestamos/:id/pagar', wrap((req) => gestion.pagarCuota(T(req), req.params.id, req.body || {})));
router.post('/prestamos/:id/anular', wrap((req) => store.update(T(req), 'prestamos', req.params.id, { estado: 'anulado' })));
router.post('/provincias', wrap((req) => gestion.guardarProvincias(T(req), req.body || {})));

module.exports = { router };
