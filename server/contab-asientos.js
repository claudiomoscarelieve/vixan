// Vixan — contabilidad: libro diario (asientos automáticos y manuales), mayor y saldos, balance,
// posición mensual de IVA e IIBB, archivos para IVA Simple / Libro IVA Digital y resumen.
const store = require('./db');
const base = require('./contabilidad');
const gestion = require('./contab-gestion');

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const n0 = (v) => Number(v) || 0;
const dia = (s) => String(s || '').slice(0, 10);
const enRango = (f, desde, hasta) => (!desde || dia(f) >= desde) && (!hasta || dia(f) <= hasta);
const hoyAR = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const mesDe = (f) => dia(f).slice(0, 7);
const sumarMes = (ym, k) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + k, 1)).toISOString().slice(0, 7); };
const finDeMes = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const listaMeses = (a, b) => { const out = []; for (let m = a; m <= b && out.length < 60; m = sumarMes(m, 1)) out.push(m); return out; };
const MES_TXT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesTxt = (ym) => `${MES_TXT[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ════════════════ Asientos automáticos ════════════════
const medio = (t, metodo) => { const c = base.imputacionDe(t).conceptos; return metodo === 'Efectivo' ? c.caja : /mercado ?pago/i.test(metodo || '') ? c.mercado_pago : c.banco; };
function cuentaGasto(t, categoria) {
  const imp = base.imputacionDe(t);
  if (categoria && imp.categorias[categoria]) return { cuenta: imp.categorias[categoria], sugerida: false };
  const n = norm(categoria);
  const s = base.SUGERENCIAS.find(([re]) => re.test(n));
  return { cuenta: s ? s[1] : imp.conceptos.gastos, sugerida: true };
}
function asientosVentas(t, desde, hasta) {
  const C = base.imputacionDe(t).conceptos;
  const lib = base.ventasLibro(t, { desde, hasta });
  return lib.filas.filter((r) => !r.prueba).map((r) => {
    const iva = r2(r.alicuotas.reduce((a, g) => a + g.iva, 0));
    const neto = r2(r.total - iva - n0(r.imp_internos) - n0(r.percep_iva)); // todo lo que no es impuesto va a ventas
    const L = [{ cuenta: C.deudores, debe: r.total }, { cuenta: C.iva_debito, haber: iva }, { cuenta: C.ventas, haber: neto }, { cuenta: C.imp_internos, haber: r.imp_internos }, { cuenta: C.percep_iva_ventas || '2.1.1.02.005', haber: n0(r.percep_iva) }];
    return { fecha: r.fecha, tipo: r.arca_id ? 'Venta por fuera de Vixan (ARCA)' : 'Venta', concepto: `${r.comprobante} · ${r.nombre}`, referencia: r.pedido || r.cae, lineas: r.signo < 0 ? invertir(L) : L };
  });
}
function asientosCompras(t, desde, hasta) {
  const C = base.imputacionDe(t).conceptos;
  const lib = base.comprasLibro(t, { desde, hasta });
  return lib.filas.map((r) => {
    const neto = r2(r.total - r.iva_computable - r.percep_iva - r.percep_iibb); // lo que no es crédito fiscal va al costo o al gasto
    const cuenta = r.orden_id ? C.mercaderias : (r.cuenta || C.gastos_arca);
    const L = [{ cuenta, debe: neto }, { cuenta: C.iva_credito, debe: r.iva_computable }, { cuenta: C.percep_iva, debe: r.percep_iva }, { cuenta: C.percep_iibb, debe: r.percep_iibb }, { cuenta: C.proveedores, haber: r.total }];
    return { fecha: r.fecha, tipo: r.orden_id ? 'Compra (orden)' : 'Gasto o compra (ARCA)', concepto: `${r.comprobante} · ${r.nombre}`, referencia: r.doc_nro, sugerida: !r.orden_id && !r.cuenta, lineas: r.signo < 0 ? invertir(L) : L };
  });
}
function asientosCaja(t, desde, hasta) {
  const C = base.imputacionDe(t).conceptos;
  const out = [];
  for (const m of store.list(t, 'caja_movimientos')) {
    if (!enRango(m.fecha, desde, hasta) || !n0(m.monto)) continue;
    const monto = Math.abs(n0(m.monto));
    const md = medio(t, m.metodo);
    const ref = m.concepto || m.categoria || '';
    if (m.tipo === 'Gasto' || (n0(m.monto) < 0 && !['Retiro de socio', 'Préstamo', 'Transferencia'].includes(m.tipo))) {
      const aProv = /proveedor/i.test(`${m.categoria} ${m.origen}`);
      const g = aProv ? { cuenta: C.proveedores, sugerida: false } : cuentaGasto(t, m.categoria);
      out.push({ fecha: dia(m.fecha), tipo: aProv ? 'Pago a proveedor' : 'Gasto (Flujo de caja)', concepto: ref, referencia: m.categoria || '', sugerida: g.sugerida, categoria: m.categoria || '', lineas: [{ cuenta: g.cuenta, debe: monto }, { cuenta: md, haber: monto }] });
    } else if (m.tipo === 'Aporte de socio') out.push({ fecha: dia(m.fecha), tipo: 'Aporte de socio', concepto: ref, lineas: [{ cuenta: md, debe: monto }, { cuenta: C.aportes, haber: monto }] });
    else if (m.tipo === 'Retiro de socio') out.push({ fecha: dia(m.fecha), tipo: 'Retiro de socio', concepto: ref, lineas: [{ cuenta: C.retiros, debe: monto }, { cuenta: md, haber: monto }] });
    else if (m.tipo === 'Ingreso') { const g = base.imputacionDe(t).categorias[m.categoria]; out.push({ fecha: dia(m.fecha), tipo: 'Ingreso (Flujo de caja)', concepto: ref, lineas: [{ cuenta: md, debe: monto }, { cuenta: g || C.otros_ingresos, haber: monto }] }); }
  }
  return out;
}
function invertir(lineas) { return lineas.map((l) => ({ ...l, debe: l.haber || 0, haber: l.debe || 0 })); }
function asientosManuales(t, desde, hasta) {
  return store.list(t, 'asientos').filter((a) => enRango(a.fecha, desde, hasta)).map((a) => ({ fecha: dia(a.fecha), tipo: 'Manual', concepto: a.concepto, referencia: a.referencia || '', lineas: a.lineas, manual_id: a.id }));
}
// Limpia, redondea y controla que cada asiento cuadre
function normalizar(a, set) {
  const lineas = a.lineas.map((l) => ({ cuenta: l.cuenta, detalle: l.detalle || '', debe: r2(l.debe || 0), haber: r2(l.haber || 0) })).filter((l) => l.debe || l.haber);
  // negativos: pasan al otro lado
  for (const l of lineas) { if (l.debe < 0) { l.haber = r2(l.haber - l.debe); l.debe = 0; } if (l.haber < 0) { l.debe = r2(l.debe - l.haber); l.haber = 0; } }
  const d = r2(lineas.reduce((x, l) => x + l.debe, 0)), h = r2(lineas.reduce((x, l) => x + l.haber, 0));
  const avisos = [];
  const dif = r2(d - h);
  if (dif && Math.abs(dif) <= 0.05) { const l = dif > 0 ? lineas.filter((x) => x.haber).sort((a, b) => b.haber - a.haber)[0] : lineas.filter((x) => x.debe).sort((a, b) => b.debe - a.debe)[0]; if (l) { if (dif > 0) l.haber = r2(l.haber + dif); else l.debe = r2(l.debe - dif); } }
  else if (dif) avisos.push(`No cuadra: debe ${d.toFixed(2)} y haber ${h.toFixed(2)}`);
  for (const l of lineas) if (!set.has(l.cuenta)) avisos.push(`La cuenta ${l.cuenta} no está en el plan`);
  return { ...a, lineas, debe: r2(lineas.reduce((x, l) => x + l.debe, 0)), haber: r2(lineas.reduce((x, l) => x + l.haber, 0)), avisos };
}
const ORDEN_TIPO = ['Bien de uso (alta)', 'Préstamo', 'Compra (orden)', 'Gasto o compra (ARCA)', 'Venta', 'Venta por fuera de Vixan (ARCA)', 'Cheque', 'Gasto (Flujo de caja)', 'Pago a proveedor', 'Ingreso (Flujo de caja)', 'Aporte de socio', 'Retiro de socio', 'Préstamo (cuota)', 'Bien de uso (baja)', 'Amortización', 'Manual'];
function diario(t, { desde, hasta } = {}) {
  const h = hasta || hoyAR();
  const plan = base.planDe(t);
  const set = new Set(plan.cuentas.map((c) => c.codigo));
  const todos = [
    ...asientosVentas(t, desde, h), ...asientosCompras(t, desde, h), ...asientosCaja(t, desde, h),
    ...gestion.asientosCheques(t).filter((a) => enRango(a.fecha, desde, h)), ...gestion.asientosPrestamos(t).filter((a) => enRango(a.fecha, desde, h)),
    ...gestion.asientosBienes(t, h).filter((a) => enRango(a.fecha, desde, h)), ...asientosManuales(t, desde, h),
  ].map((a) => normalizar(a, set)).filter((a) => a.lineas.length);
  todos.sort((a, b) => a.fecha.localeCompare(b.fecha) || ORDEN_TIPO.indexOf(a.tipo) - ORDEN_TIPO.indexOf(b.tipo));
  todos.forEach((a, i) => { a.n = i + 1; });
  const porTipo = {};
  for (const a of todos) porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1;
  const sugeridas = todos.filter((a) => a.sugerida);
  return {
    asientos: todos, por_tipo: porTipo, debe: r2(todos.reduce((x, a) => x + a.debe, 0)), haber: r2(todos.reduce((x, a) => x + a.haber, 0)),
    nombres: Object.fromEntries(plan.cuentas.map((c) => [c.codigo, c.nombre])), propio: plan.propio,
    avisos: [
      ...(sugeridas.length ? [`${sugeridas.length} asiento(s) usan una cuenta sugerida por el nombre del proveedor o de la categoría del gasto: confirmala o cambiala en Plan de cuentas → Imputación.`] : []),
      ...(todos.some((a) => a.avisos.length) ? [`${todos.filter((a) => a.avisos.length).length} asiento(s) con avisos (no cuadran o usan cuentas que no están en el plan).`] : []),
    ],
  };
}

// ════════════════ Mayor y saldos ════════════════
function saldos(t, asientos) {
  const plan = base.planDe(t);
  const set = new Set(plan.cuentas.map((c) => c.codigo));
  const m = new Map();
  const suma = (cod, d, h, n) => { const x = m.get(cod) || { debe: 0, haber: 0, n: 0 }; x.debe = r2(x.debe + d); x.haber = r2(x.haber + h); x.n += n; m.set(cod, x); };
  for (const a of asientos) for (const l of a.lineas) {
    suma(l.cuenta, l.debe, l.haber, 1);
    let p = base.padreDe(l.cuenta, set);
    while (p) { suma(p, l.debe, l.haber, 0); p = base.padreDe(p, set); }
  }
  return plan.cuentas.filter((c) => m.has(c.codigo)).map((c) => {
    const x = m.get(c.codigo); const s = r2(x.debe - x.haber);
    return { codigo: c.codigo, nombre: c.nombre, rubro: base.esRubro(c.codigo), debe: x.debe, haber: x.haber, movimientos: x.n, saldo_deudor: s > 0 ? s : 0, saldo_acreedor: s < 0 ? -s : 0 };
  });
}
function mayor(t, { desde, hasta, cuenta } = {}) {
  const d = diario(t, { desde, hasta });
  const filas = saldos(t, d.asientos);
  if (!cuenta) return { filas, debe: d.debe, haber: d.haber, asientos: d.asientos.length, con_movimiento: filas.filter((f) => !f.rubro).length };
  // Mayor de una cuenta: saldo anterior + movimientos con saldo acumulado
  const antes = desde ? diario(t, { hasta: new Date(Date.parse(desde) - 86400000).toISOString().slice(0, 10) }) : null;
  const pref = (c) => (base.esRubro(cuenta) ? c.startsWith(cuenta.replace(/(\.0+)+$/, '')) : c === cuenta);
  let saldo = antes ? r2(antes.asientos.flatMap((a) => a.lineas).filter((l) => pref(l.cuenta)).reduce((x, l) => x + l.debe - l.haber, 0)) : 0;
  const inicial = saldo;
  const movs = [];
  for (const a of d.asientos) for (const l of a.lineas) if (pref(l.cuenta)) { saldo = r2(saldo + l.debe - l.haber); movs.push({ n: a.n, fecha: a.fecha, concepto: a.concepto, tipo: a.tipo, cuenta: l.cuenta, debe: l.debe, haber: l.haber, saldo }); }
  return { cuenta, nombre: d.nombres[cuenta] || '', saldo_inicial: inicial, movimientos: movs, saldo_final: saldo };
}

// ════════════════ Balance ════════════════
function balance(t, { hasta } = {}) {
  const h = hasta || hoyAR();
  const d = diario(t, { hasta: h });
  const filas = saldos(t, d.asientos);
  const saldoDe = (pref) => r2(filas.filter((f) => !f.rubro && f.codigo.startsWith(pref)).reduce((a, f) => a + f.debe - f.haber, 0));
  const activo = saldoDe('1.'), pasivo = -saldoDe('2.'), pn = -saldoDe('3.'), resultado = -saldoDe('4.');
  const grupo = (pref, signo) => filas.filter((f) => f.codigo.startsWith(pref) && (f.debe || f.haber)).map((f) => ({ codigo: f.codigo, nombre: f.nombre, rubro: f.rubro, nivel: f.codigo.split('.').filter((x) => !/^0+$/.test(x)).length, saldo: r2(signo * (f.debe - f.haber)) }));
  return {
    al: h, activo, pasivo, patrimonio: pn, resultado, cuadra: Math.abs(activo - (pasivo + pn + resultado)) < 0.05,
    detalle: { activo: grupo('1.', 1), pasivo: grupo('2.', -1), patrimonio: grupo('3.', -1), resultados: grupo('4.', -1) },
    avisos: [...d.avisos, 'Asientos automáticos de ventas, compras (con lo de ARCA), gastos de Flujo de caja, cheques, préstamos y bienes de uso, más los asientos manuales. Los cobros de ventas, el costo de lo vendido y los sueldos todavía no entran solos: se cargan como asiento manual.'],
  };
}

// ════════════════ Posición mensual (IVA e Ingresos Brutos) ════════════════
function posicion(t, { desde, hasta } = {}) {
  const h = hasta || hoyAR();
  const d = desde || `${sumarMes(mesDe(h), -2)}-01`;
  // los saldos a favor se arrastran desde el primer mes con datos
  const fechas = [...store.list(t, 'facturas').map((f) => f.fecha), ...store.list(t, 'arca_comprobantes').map((c) => c.fecha), ...store.list(t, 'ordenes_compra').map((o) => o.fecha)].filter(Boolean).map(dia).sort();
  const inicio = fechas[0] && mesDe(fechas[0]) < mesDe(d) ? mesDe(fechas[0]) : mesDe(d);
  const todos = listaMeses(inicio, mesDe(h));
  const ventas = base.ventasLibro(t, { desde: `${inicio}-01`, hasta: finDeMes(mesDe(h)) }).filas.filter((r) => !r.prueba);
  const compras = base.comprasLibro(t, { desde: `${inicio}-01`, hasta: finDeMes(mesDe(h)) }).filas;
  const ret = store.list(t, 'retenciones');
  const filtRet = (m, re) => r2(ret.filter((r) => mesDe(r.fecha) === m && re.test(norm(r.tipo))).reduce((a, r) => a + n0(r.monto), 0));
  let favorTec = 0, libre = 0;
  const cols = [];
  for (const m of todos) {
    const v = ventas.filter((r) => mesDe(r.fecha) === m), c = compras.filter((r) => mesDe(r.fecha) === m);
    const S = (xs, fn) => r2(xs.reduce((a, r) => a + r.signo * fn(r), 0));
    const debito = S(v, (r) => r.alicuotas.reduce((a, g) => a + g.iva, 0));
    const credito = S(c, (r) => r.iva_computable);
    const percepIva = r2(S(c, (r) => r.percep_iva) + filtRet(m, /percep.*iva/));
    const retIva = filtRet(m, /reten.*iva/);
    const favorAnt = favorTec, libreAnt = libre;
    const tecnico = r2(debito - credito - favorAnt);
    favorTec = tecnico < 0 ? -tecnico : 0;
    const aPagar0 = tecnico > 0 ? tecnico : 0;
    let aPagar = r2(aPagar0 - percepIva - retIva - libreAnt);
    libre = aPagar < 0 ? -aPagar : 0; if (aPagar < 0) aPagar = 0;
    cols.push({
      mes: m, debito, credito, credito_ordenes: S(c.filter((r) => r.orden_id), (r) => r.iva_computable), credito_arca: S(c.filter((r) => r.arca_id), (r) => r.iva_computable),
      favor_anterior: favorAnt, tecnico, percep_iva: percepIva, ret_iva: retIva, libre_anterior: libreAnt, a_pagar: aPagar, favor_siguiente: favorTec, libre_siguiente: libre,
      percep_iva_practicadas: S(v, (r) => r.percep_iva || 0), imp_internos: S(v, (r) => r.imp_internos || 0),
      base_iibb: S(v, (r) => r.alicuotas.reduce((a, g) => a + g.neto, 0) + r.no_gravado + r.exento),
      percep_iibb: r2(S(c, (r) => r.percep_iibb) + filtRet(m, /percep.*(iibb|ingresos brutos)/)), ret_iibb: filtRet(m, /reten.*(iibb|ingresos brutos)/),
      ganancias: filtRet(m, /ganancias|suss/), iva_costo: S(c, (r) => r.iva_costo), imp_costo: S(c, (r) => r.otros_tributos),
      ventas: v.length, compras: c.length,
    });
  }
  const visibles = cols.filter((x) => x.mes >= mesDe(d));
  const ultimo = visibles[visibles.length - 1] || cols[cols.length - 1] || null;
  const jurisd = {};
  if (ultimo) for (const r of ret.filter((x) => mesDe(x.fecha) === ultimo.mes && /iibb|ingresos brutos/.test(norm(x.tipo)))) { const j = (jurisd[r.jurisdiccion || 'Sin jurisdicción'] ||= { percepciones: 0, retenciones: 0 }); if (/percep/.test(norm(r.tipo))) j.percepciones = r2(j.percepciones + n0(r.monto)); else j.retenciones = r2(j.retenciones + n0(r.monto)); }
  return { meses: visibles, ultimo, iibb_jurisdicciones: jurisd };
}

// ════════════════ Archivos para IVA Simple / Libro IVA Digital (RG 4597) ════════════════
const ascii = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, ' ');
const txt = (s, n) => ascii(s).slice(0, n).padEnd(n, ' ');
const nro = (v, n) => String(Math.trunc(Math.abs(Number(v) || 0))).padStart(n, '0').slice(-n);
const imp = (v, n = 15) => String(Math.round(Math.abs(Number(v) || 0) * 100)).padStart(n, '0').slice(-n);
const docTipo = (r) => (Number(r.doc_tipo) === 80 || String(r.doc_nro).length === 11 ? 80 : Number(r.doc_tipo) === 96 || (String(r.doc_nro).length >= 7 && String(r.doc_nro).length <= 8) ? 96 : 99);
function archivosLID(t, mes) {
  const desde = `${mes}-01`, hasta = finDeMes(mes);
  const V = base.ventasLibro(t, { desde, hasta }).filas.filter((r) => !r.prueba && (r.cae || r.arca_id));
  const Cm = base.comprasLibro(t, { desde, hasta }).filas;
  const ventasCbte = [], ventasAlic = [], comprasCbte = [], comprasAlic = [];
  for (const r of V) {
    const dt = docTipo(r);
    const alic = r.alicuotas.filter((g) => g.neto || g.iva);
    const codOp = alic.length ? '0' : r.exento ? 'E' : 'N';
    ventasCbte.push([r.fecha.replace(/-/g, ''), nro(r.cbte_tipo, 3), nro(r.punto_venta, 5), nro(r.nro, 20), nro(r.nro, 20), nro(dt, 2), nro(dt === 99 ? 0 : r.doc_nro, 20), txt(dt === 99 ? 'CONSUMIDOR FINAL' : r.nombre, 30),
      imp(r.total), imp(r.no_gravado), imp(0), imp(r.exento), imp(r.percep_iva || 0), imp(0), imp(0), imp(r.imp_internos), 'PES', '0001000000', String(alic.length), codOp, imp(r.otros_tributos), '00000000'].join(''));
    for (const g of alic) ventasAlic.push([nro(r.cbte_tipo, 3), nro(r.punto_venta, 5), nro(r.nro, 20), imp(g.neto), nro(base.ALIC_ID[g.alic] ?? 5, 4), imp(g.iva)].join(''));
  }
  for (const r of Cm) {
    const letra = base.letraDeCod(r.cbte_tipo);
    const alic = ['A', 'M', 'D'].includes(letra) ? r.alicuotas.filter((g) => g.neto || g.iva) : [];
    const codOp = alic.length ? '0' : r.exento ? 'E' : 'N';
    comprasCbte.push([r.fecha.replace(/-/g, ''), nro(r.cbte_tipo, 3), nro(r.punto_venta, 5), nro(r.nro, 20), txt('', 16), '80', nro(r.doc_nro, 20), txt(r.nombre, 30),
      imp(r.total), imp(r.no_gravado + (alic.length ? 0 : r.alicuotas.reduce((a, g) => a + g.neto + g.iva, 0))), imp(r.exento), imp(r.percep_iva), imp(0), imp(r.percep_iibb), imp(0), imp(r.imp_internos || 0),
      'PES', '0001000000', String(alic.length), codOp, imp(r.iva_computable), imp(r.otros_tributos), nro(0, 11), txt('', 30), imp(0)].join(''));
    for (const g of alic) comprasAlic.push([nro(r.cbte_tipo, 3), nro(r.punto_venta, 5), nro(r.nro, 20), '80', nro(r.doc_nro, 20), imp(g.neto), nro(base.ALIC_ID[g.alic] ?? 5, 4), imp(g.iva)].join(''));
  }
  const j = (xs) => (xs.length ? xs.join('\r\n') + '\r\n' : '');
  const per = mes.replace('-', '');
  return {
    archivos: [
      { nombre: `LIBRO_IVA_DIGITAL_VENTAS_CBTE_${per}.txt`, contenido: j(ventasCbte) }, { nombre: `LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS_${per}.txt`, contenido: j(ventasAlic) },
      { nombre: `LIBRO_IVA_DIGITAL_COMPRAS_CBTE_${per}.txt`, contenido: j(comprasCbte) }, { nombre: `LIBRO_IVA_DIGITAL_COMPRAS_ALICUOTAS_${per}.txt`, contenido: j(comprasAlic) },
    ],
    ventas: V.length, compras: Cm.length,
  };
}
// Zip sin compresión (para bajar los cuatro TXT juntos)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(archivos) {
  const partes = [], central = []; let off = 0;
  for (const a of archivos) {
    const nombre = Buffer.from(a.nombre, 'utf8'); const datos = Buffer.from(a.contenido, 'latin1'); const crc = crc32(datos);
    const loc = Buffer.alloc(30); loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0, 6); loc.writeUInt16LE(0, 8); loc.writeUInt32LE(0, 10); loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(datos.length, 18); loc.writeUInt32LE(datos.length, 22); loc.writeUInt16LE(nombre.length, 26); loc.writeUInt16LE(0, 28);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0, 8); cen.writeUInt16LE(0, 10); cen.writeUInt32LE(0, 12); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(datos.length, 20); cen.writeUInt32LE(datos.length, 24); cen.writeUInt16LE(nombre.length, 28); cen.writeUInt32LE(off, 42);
    partes.push(loc, nombre, datos); central.push(cen, nombre); off += 30 + nombre.length + datos.length;
  }
  const cd = Buffer.concat(central);
  const fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(archivos.length, 8); fin.writeUInt16LE(archivos.length, 10); fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(off, 16);
  return Buffer.concat([...partes, cd, fin]);
}

// ════════════════ Resumen ════════════════
function resumen(t, { desde, hasta } = {}) {
  const h = hasta || hoyAR();
  const d = desde || `${mesDe(h)}-01`;
  const pos = posicion(t, { desde: `${sumarMes(mesDe(h), -11)}-01`, hasta: h });
  const ventas = base.ventasLibro(t, { desde: `${sumarMes(mesDe(h), -11)}-01`, hasta: h }).filas.filter((r) => !r.prueba);
  const compras = base.comprasLibro(t, { desde: d, hasta: h });
  const pedidos = store.list(t, 'pedidos').filter((p) => p.estado !== 'cancelado');
  const conFactura = new Set(store.list(t, 'facturas').filter((f) => f.pedido_id && f.cae && !/^N[CD] /.test(String(f.tipo))).map((f) => Number(f.pedido_id)));
  const arca = store.list(t, 'arca_comprobantes');
  const mesesPer = listaMeses(mesDe(d), mesDe(h));
  const sinEmit = mesesPer.filter((m) => !arca.some((c) => c.origen === 'emitidos' && mesDe(c.fecha) === m));
  const sinRec = mesesPer.filter((m) => !arca.some((c) => c.origen === 'recibidos' && mesDe(c.fecha) === m));
  const enPer = pos.meses.filter((m) => m.mes >= mesDe(d));
  const creditosIibb = r2(enPer.reduce((a, m) => a + m.percep_iibb + m.ret_iibb, 0));
  const ventasSinFactura = r2(pedidos.filter((p) => enRango(p.fecha, d, h) && !conFactura.has(Number(p.id))).reduce((a, p) => a + n0(p.total), 0));
  const ult = pos.ultimo;
  const tareas = [];
  if (creditosIibb) tareas.push({ titulo: 'Créditos de IIBB a descontar', detalle: 'Percepciones y retenciones de IIBB sufridas en el período: confirmá con el contador que se cargan en la DDJJ de IIBB / SIFERE de cada mes.', monto: creditosIibb });
  if (compras.sin_datos) tareas.push({ titulo: 'Compras sin datos de factura', detalle: `${compras.sin_datos} orden(es) de compra del período no tienen tipo de comprobante ni importes: no entran al Libro IVA Compras ni al diario. Se completan en Reabastecimiento → Compras recibidas.`, ir: 'reabastecimiento' });
  if (sinEmit.length) tareas.push({ titulo: 'Subir Mis Comprobantes Emitidos', detalle: `Falta el archivo de ARCA de ${sinEmit.map(mesTxt).join(', ')}: lo facturado por fuera de Vixan (por ejemplo, con el facturador de Mercado Libre) no está en el libro.`, ir: 'ventas' });
  if (sinRec.length) tareas.push({ titulo: 'Subir Mis Comprobantes Recibidos', detalle: `Falta el archivo de ARCA de ${sinRec.map(mesTxt).join(', ')}: los gastos con factura que no están en una orden no están en el libro.`, ir: 'compras' });
  const libV = base.ventasLibro(t, { desde: d, hasta: h });
  if (libV.numeracion.faltan.length) tareas.push({ titulo: 'Números de comprobante faltantes', detalle: `${libV.numeracion.faltan.length} número(s) faltan en la numeración: ${libV.numeracion.faltan.slice(0, 5).join(', ')}${libV.numeracion.faltan.length > 5 ? '…' : ''}. En Facturación → Buscar comprobantes faltantes se traen de ARCA.` });
  const prov = gestion.provincias(t, { desde: d, hasta: h });
  const sinAlic = prov.filas.filter((x) => x.alicuota === null);
  if (sinAlic.length) tareas.push({ titulo: 'Alícuotas de IIBB por provincia', detalle: `Vendiste en ${sinAlic.length} provincia(s) sin alícuota cargada: ${sinAlic.slice(0, 6).map((x) => x.nombre).join(', ')}.`, ir: 'provincias' });
  const dia_ = diario(t, { desde: d, hasta: h });
  const sug = dia_.asientos.filter((a) => a.sugerida).length;
  if (sug) tareas.push({ titulo: 'Confirmar cuentas sugeridas', detalle: `${sug} asiento(s) del período usan una cuenta sugerida por el nombre del gasto o del proveedor. Confirmalas en Plan de cuentas → Imputación.`, ir: 'plan' });
  const ch = gestion.chequesResumen(t);
  if (ch.kpis.cobrar_semana.cantidad || ch.kpis.pagar_semana.cantidad) tareas.push({ titulo: 'Cheques de esta semana', detalle: `A cobrar: ${ch.kpis.cobrar_semana.cantidad} por $ ${ch.kpis.cobrar_semana.monto.toLocaleString('es-AR')} · a pagar: ${ch.kpis.pagar_semana.cantidad} por $ ${ch.kpis.pagar_semana.monto.toLocaleString('es-AR')}.`, ir: 'cheques' });
  const pr = gestion.prestamosResumen(t);
  if (pr.kpis.vencidas) tareas.push({ titulo: 'Cuotas de préstamos vencidas', detalle: `${pr.kpis.vencidas} cuota(s) vencidas sin marcar como pagadas.`, monto: pr.kpis.vencidas_monto, ir: 'prestamos' });
  const pendBanco = store.list(t, 'banco_movimientos').filter((m) => m.estado === 'pendiente').length;
  if (pendBanco) tareas.push({ titulo: 'Movimientos de banco sin conciliar', detalle: `${pendBanco} movimiento(s) de extractos todavía pendientes.`, ir: 'bancos' });
  const mesPorMes = pos.meses.slice().reverse().map((m) => {
    const vm = ventas.filter((r) => mesDe(r.fecha) === m.mes);
    const sistema = r2(pedidos.filter((p) => mesDe(p.fecha) === m.mes).reduce((a, p) => a + n0(p.total), 0));
    const facturado = r2(vm.reduce((a, r) => a + r.signo * r.total, 0));
    return { mes: m.mes, mes_txt: mesTxt(m.mes), facturado, ventas_sistema: sistema, iva: m.a_pagar ? m.a_pagar : -(m.favor_siguiente + m.libre_siguiente), creditos_iibb: r2(m.percep_iibb + m.ret_iibb), a_revisar: r2(pedidos.filter((p) => mesDe(p.fecha) === m.mes && !conFactura.has(Number(p.id))).reduce((a, p) => a + n0(p.total), 0)) };
  });
  return {
    kpis: { iva: ult ? (ult.a_pagar ? ult.a_pagar : -(ult.favor_siguiente + ult.libre_siguiente)) : 0, iva_mes: ult ? mesTxt(ult.mes) : '', creditos_iibb: creditosIibb, ventas_sin_factura: ventasSinFactura, datos_arca: arca.length ? `${[...new Set(arca.map((c) => mesDe(c.fecha)))].length} mes(es) cargados` : 'Sin cargar' },
    tareas, mes_por_mes: mesPorMes,
  };
}

module.exports = { diario, mayor, saldos, balance, posicion, archivosLID, zip, resumen, cuentaGasto };
