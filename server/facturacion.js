// Vixan — panel de facturación: qué falta facturar, notas de crédito de ventas canceladas,
// numeración, comprobantes manuales y exportación fiscal.
const express = require('express');
const store = require('./db');
const arca = require('./arca');

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const dia = (s) => String(s || '').slice(0, 10);
const enRango = (f, desde, hasta) => (!desde || dia(f) >= desde) && (!hasta || dia(f) <= hasta);
const esNC = (f) => /^NC /.test(String(f.tipo));
const esND = (f) => /^ND /.test(String(f.tipo));
const signo = (f) => (esNC(f) ? -1 : 1);
const CANCELADOS = ['cancelado', 'devuelto'];
const cfgDe = (t) => store.getSettings(t).facturacion || {};

// Factura "viva" de cada pedido (la última sin anular)
function facturasPorPedido(t) {
  const m = new Map();
  for (const f of store.list(t, 'facturas')) {
    if (!f.pedido_id || esNC(f) || esND(f)) continue;
    const prev = m.get(Number(f.pedido_id));
    if (!prev || (prev.estado === 'anulada' && f.estado !== 'anulada')) m.set(Number(f.pedido_id), f);
  }
  return m;
}

// Panel: pedidos del período con su estado de factura y las tarjetas de arriba
function panel(t, { desde, hasta } = {}) {
  const fac = facturasPorPedido(t);
  const pedidos = store.list(t, 'pedidos').filter((p) => enRango(p.fecha, desde, hasta));
  const filas = pedidos.map((p) => {
    const f = fac.get(Number(p.id));
    let est = 'Pendiente';
    if (f) est = f.estado === 'anulada' ? 'NC' : 'Facturado';
    const cancelado = CANCELADOS.includes(p.estado);
    return {
      id: p.id, numero: p.numero, fecha: p.fecha, cliente: p.cliente, plataforma: p.plataforma, tipo_envio: p.tipo_envio, total: Number(p.total) || 0, estado: p.estado,
      est_fact: est, cancelado, facturable: !cancelado || (f && f.estado !== 'anulada'),
      factura_id: f?.id || null, factura: f ? `${f.tipo} ${f.numero}` : '', tipo_cbte: f?.tipo || '', cae: f?.cae || '', nc: f?.anulada_por || (f?.ncs || []).join(', '),
    };
  });
  const sum = (a) => r2(a.reduce((x, r) => x + r.total, 0));
  const sinFacturar = filas.filter((r) => r.est_fact === 'Pendiente' && !r.cancelado);
  const facturado = filas.filter((r) => r.est_fact === 'Facturado');
  const conNC = filas.filter((r) => r.est_fact === 'NC');
  const cancelados = filas.filter((r) => r.cancelado && r.est_fact === 'Pendiente');
  // Lo emitido por FECHA DE COMPROBANTE (lo que mira ARCA y el contador), aunque el pedido sea de otro mes
  const emitidas = store.list(t, 'facturas').filter((f) => f.cae && enRango(f.fecha, desde, hasta));
  const fact = emitidas.filter((f) => !esNC(f));
  const ncs = emitidas.filter(esNC);
  return {
    filas,
    tarjetas: {
      sin_facturar: { monto: sum(sinFacturar), cantidad: sinFacturar.length },
      facturado: { monto: sum(facturado), cantidad: facturado.length, porcentaje: sum(sinFacturar) + sum(facturado) ? r2(sum(facturado) / (sum(sinFacturar) + sum(facturado)) * 100) : 0 },
      facturable: { monto: r2(sum(sinFacturar) + sum(facturado)), cantidad: sinFacturar.length + facturado.length },
      nc: { monto: sum(conNC), cantidad: conNC.length },
      cancelados: { monto: sum(cancelados), cantidad: cancelados.length },
      emitido: { monto: r2(fact.reduce((a, f) => a + Number(f.total), 0)), cantidad: fact.length, nc_cantidad: ncs.length, nc_monto: r2(ncs.reduce((a, f) => a + Number(f.total), 0)) },
    },
    nc_automatica: !!cfgDe(t).nc_automatica,
  };
}

// Facturas vivas de ventas canceladas o devueltas: hay que hacerles nota de crédito
function canceladas(t) {
  const pedidos = new Map(store.list(t, 'pedidos').map((p) => [Number(p.id), p]));
  return store.list(t, 'facturas').filter((f) => f.cae && f.pedido_id && !esNC(f) && !esND(f) && f.estado !== 'anulada').map((f) => {
    const p = pedidos.get(Number(f.pedido_id));
    if (!p || !CANCELADOS.includes(p.estado)) return null;
    const pendiente = r2(Number(f.total) - Number(f.nc_total || 0));
    return { id: f.id, factura: `${f.tipo} ${f.numero}`, fecha: f.fecha, cliente: f.cliente, pedido: f.pedido, motivo: p.estado === 'devuelto' ? 'Devolución' : 'Venta cancelada', total: pendiente, estado_nc: f.nc_auto?.estado || 'revisar', error: f.nc_auto?.error || '' };
  }).filter(Boolean);
}
async function ncDeCanceladas(t, ids) {
  const out = [];
  for (const id of ids) {
    const f = store.get(t, 'facturas', id);
    if (!f) continue;
    try {
      store.update(t, 'facturas', f.id, { nc_auto: { estado: 'esperando', desde: new Date().toISOString() } });
      const nc = await arca.notaCredito(t, f.id, 'Venta cancelada');
      store.update(t, 'facturas', f.id, { nc_auto: { estado: 'emitida', nc: nc.numero } });
      out.push({ factura: f.numero, ok: true, nc: nc.numero });
    } catch (e) {
      store.update(t, 'facturas', f.id, { nc_auto: { estado: 'error', error: e.message } });
      out.push({ factura: f.numero, ok: false, error: e.message });
      if (/certificado|Falta el punto|conectar con ARCA|no respondió/.test(e.message)) break;
    }
  }
  return out;
}
// Llamado al cancelar un pedido: si la NC automática está prendida, se emite sola en segundo plano
function alCancelar(t, pedido) {
  if (!cfgDe(t).nc_automatica) return;
  const f = facturasPorPedido(t).get(Number(pedido.id));
  if (!f || !f.cae || f.estado === 'anulada') return;
  setImmediate(() => ncDeCanceladas(t, [f.id]).catch(() => {}));
}

// Exportación fiscal: una fila por comprobante (las NC restan) o una por ítem
function exportar(t, { modo = 'resumen', desde, hasta } = {}) {
  const fs = store.list(t, 'facturas').filter((f) => f.cae && enRango(f.fecha, desde, hasta)).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || Number(a.nro) - Number(b.nro));
  const alicDe = (f) => (f.alicuotas?.length ? f.alicuotas : /C$/.test(String(f.tipo)) ? [] : [{ alic: f.alicuota || 21, neto: Number(f.neto ?? f.total / 1.21), iva: Number(f.iva ?? f.total - f.total / 1.21) }]);
  if (modo === 'detalle') {
    const filas = [];
    for (const f of fs) {
      const s = signo(f);
      const items = f.items?.length ? f.items : [{ nombre: f.tipo, cantidad: 1 }];
      for (const i of items) {
        const nuevo = i.neto !== undefined;
        const alic = /C$/.test(String(f.tipo)) ? 0 : Number(nuevo ? i.alicuota : (f.alicuota || 21));
        const neto = f.items?.length ? (nuevo ? Number(i.neto) * Number(i.cantidad) : Number(i.precio) * Number(i.cantidad) / (1 + alic / 100)) : Number(f.neto ?? f.total);
        filas.push({ fecha: f.fecha, comprobante: `${f.tipo} ${f.numero}`, cliente: f.cliente, sku: i.sku || '', producto: i.nombre || '', cantidad: Number(i.cantidad) || 1, neto: r2(s * neto), alicuota: alic, iva: r2(s * neto * alic / 100), imp_int: r2(s * Number(i.imp_int || 0) * (Number(i.cantidad) || 1)), cae: f.cae });
      }
    }
    return { filas };
  }
  const filas = fs.map((f) => {
    const s = signo(f);
    const a = alicDe(f);
    const por = (alic, k) => r2(s * a.filter((g) => g.alic === alic).reduce((x, g) => x + Number(g[k]), 0));
    return {
      fecha: f.fecha, tipo: f.tipo, numero: f.numero, cliente: f.cliente, doc: f.doc_tipo === 99 ? '' : f.doc_nro || '', cond_iva: arca.COND_IVA_NOMBRE[f.cond_iva_receptor] || '',
      neto_21: por(21, 'neto'), iva_21: por(21, 'iva'), neto_105: por(10.5, 'neto'), iva_105: por(10.5, 'iva'), neto_27: por(27, 'neto'), iva_27: por(27, 'iva'),
      neto_otras: r2(s * a.filter((g) => ![21, 10.5, 27].includes(g.alic)).reduce((x, g) => x + g.neto, 0)), iva_otras: r2(s * a.filter((g) => ![21, 10.5, 27].includes(g.alic)).reduce((x, g) => x + g.iva, 0)),
      no_gravado: /C$/.test(String(f.tipo)) ? r2(s * (Number(f.total) - Number(f.imp_internos || 0))) : 0,
      imp_internos: r2(s * Number(f.imp_internos || 0)), total: r2(s * Number(f.total)), cae: f.cae, pedido: f.pedido || '', estado: f.estado,
    };
  });
  const tot = { fecha: '', tipo: 'TOTAL', numero: `${filas.length} comprobantes`, cliente: '', doc: '', cond_iva: '', cae: '', pedido: '', estado: '' };
  for (const k of ['neto_21', 'iva_21', 'neto_105', 'iva_105', 'neto_27', 'iva_27', 'neto_otras', 'iva_otras', 'no_gravado', 'imp_internos', 'total']) tot[k] = r2(filas.reduce((a, f) => a + f[k], 0));
  return { filas, total: tot, facturas: fs.filter((f) => !esNC(f)).length, ncs: fs.filter(esNC).length };
}

const router = express.Router();
const wrap = (fn) => async (req, res) => { try { res.json({ ok: true, data: await fn(req) }); } catch (e) { res.status(400).json({ ok: false, error: e.message }); } };
router.get('/panel', wrap((req) => panel(req.tenantId, req.query)));
router.get('/canceladas', wrap((req) => canceladas(req.tenantId)));
router.post('/canceladas/nc', wrap((req) => ncDeCanceladas(req.tenantId, (req.body.ids || []).map(Number))));
router.post('/config', wrap((req) => { const c = { ...cfgDe(req.tenantId), nc_automatica: !!req.body.nc_automatica }; store.setSetting(req.tenantId, 'facturacion', c); return { nc_automatica: c.nc_automatica }; }));
router.get('/manuales', wrap((req) => store.list(req.tenantId, 'facturas').filter((f) => f.manual && f.cae).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || Number(b.nro) - Number(a.nro))));
router.get('/faltantes', wrap((req) => arca.faltantes(req.tenantId, { desde: req.query.desde, hasta: req.query.hasta })));
router.post('/recuperar', wrap((req) => arca.recuperarComprobante(req.tenantId, req.body.letra, req.body.nro, req.body.punto_venta)));
router.get('/exportar', wrap((req) => exportar(req.tenantId, req.query)));

module.exports = { router, panel, canceladas, alCancelar, exportar };
