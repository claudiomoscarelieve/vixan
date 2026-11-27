// Vixan — contabilidad: bienes de uso, cheques, préstamos, bancos (extractos y conciliación) e Ingresos Brutos por provincia.
const store = require('./db');
const { leerArchivo, numero } = require('./importar');
const base = require('./contabilidad');

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const n0 = (v) => Number(v) || 0;
const dia = (s) => String(s || '').slice(0, 10);
const enRango = (f, desde, hasta) => (!desde || dia(f) >= desde) && (!hasta || dia(f) <= hasta);
const hoyAR = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const sumarMeses = (f, k) => { const [y, m, d] = dia(f).split('-').map(Number); const x = new Date(Date.UTC(y, m - 1 + k, 1)); const ult = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(); return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), Math.min(d, ult))).toISOString().slice(0, 10); };
const finDeMes = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const diasEntre = (a, b) => Math.round((Date.parse(dia(a)) - Date.parse(dia(b))) / 86400000);
const cuentaDe = (t, concepto) => base.imputacionDe(t).conceptos[concepto];

// ════════════════ Bienes de uso ════════════════
const RUBROS = {
  'Muebles y útiles': { cod: '01', vida: 10 }, Instalaciones: { cod: '02', vida: 10 }, Rodados: { cod: '03', vida: 5 },
  'Equipos de computación': { cod: '04', vida: 3 }, Maquinarias: { cod: '05', vida: 10 }, Inmuebles: { cod: '06', vida: 50 },
};
// Fin del ejercicio que contiene una fecha (según el mes de cierre)
function cierreDe(f, cierreMes) {
  const [y, m] = dia(f).split('-').map(Number);
  const anio = m <= cierreMes ? y : y + 1;
  return finDeMes(`${anio}-${String(cierreMes).padStart(2, '0')}`);
}
// Cuotas de amortización de un bien: [{fecha, importe}] hasta una fecha
function amortizaciones(b, cfg, hasta) {
  const vida = n0(b.vida_util) || RUBROS[b.rubro]?.vida || 10;
  const valor = n0(b.valor_origen);
  if (!valor || b.estado === 'anulado' || b.rubro === 'Inmuebles' && b.solo_terreno) return [];
  const out = [];
  if (cfg.amortizacion === 'mensual') {
    const cuota = valor / (vida * 12);
    let m = dia(b.fecha_alta).slice(0, 7);
    const fin = b.fecha_baja ? dia(b.fecha_baja).slice(0, 7) : null;
    for (let k = 0; k < vida * 12; k++) {
      const f = finDeMes(m);
      if (f > hasta || (fin && m >= fin)) break;
      out.push({ fecha: f, importe: cuota });
      m = sumarMeses(`${m}-01`, 1).slice(0, 7);
    }
  } else {
    // Año de alta completo: el ejercicio en que se compra amortiza entero y el de la baja no
    const cuota = valor / vida;
    let c = cierreDe(b.fecha_alta, cfg.cierre_mes);
    const cBaja = b.fecha_baja ? cierreDe(b.fecha_baja, cfg.cierre_mes) : null;
    for (let k = 0; k < vida; k++) {
      if (c > hasta || (cBaja && c >= cBaja)) break;
      out.push({ fecha: c, importe: cuota });
      c = sumarMeses(c, 12); c = finDeMes(c.slice(0, 7));
    }
  }
  // el redondeo no puede pasarse del valor de origen
  let acum = 0;
  return out.map((x, i) => { const imp = i === vida * (cfg.amortizacion === 'mensual' ? 12 : 1) - 1 ? r2(valor - acum) : r2(x.importe); acum = r2(acum + imp); return { ...x, importe: imp }; });
}
function bienesResumen(t, { desde, hasta } = {}) {
  const cfg = base.configDe(t);
  const al = hasta || hoyAR();
  const bienes = store.list(t, 'bienes_uso').map((b) => {
    const am = amortizaciones(b, cfg, al);
    const acum = r2(am.reduce((a, x) => a + x.importe, 0));
    const periodo = r2(am.filter((x) => enRango(x.fecha, desde, hasta)).reduce((a, x) => a + x.importe, 0));
    return { ...b, amort_acumulada: acum, amort_periodo: periodo, residual: b.estado === 'vigente' ? r2(n0(b.valor_origen) - acum) : 0 };
  });
  const vig = bienes.filter((b) => b.estado === 'vigente');
  const s = (k) => r2(vig.reduce((a, b) => a + n0(b[k]), 0));
  return { bienes, al, kpis: { vigentes: vig.length, valor_origen: s('valor_origen'), amort_acumulada: s('amort_acumulada'), residual: s('residual'), amort_periodo: r2(bienes.reduce((a, b) => a + b.amort_periodo, 0)) }, config: { amortizacion: cfg.amortizacion, cierre_mes: cfg.cierre_mes } };
}
function altaBien(t, b) {
  const rubro = RUBROS[b.rubro];
  if (!rubro) throw new Error('Elegí el rubro del bien');
  if (!String(b.nombre || '').trim()) throw new Error('Poné un nombre al bien (por ejemplo: Racks del depósito)');
  const valor = r2(b.valor_origen);
  if (!(valor > 0)) throw new Error('El valor de origen (sin IVA) tiene que ser mayor a cero');
  if (!b.fecha_alta) throw new Error('Falta la fecha de alta');
  const plan = base.planDe(t);
  const set = new Set(plan.cuentas.map((c) => c.codigo));
  if (!b.contra || !set.has(b.contra)) throw new Error('Elegí contra qué cuenta va el alta: proveedores, caja, banco o apertura');
  // Cada bien tiene su cuenta propia dentro de su rubro
  const prefijo = `1.2.1.${rubro.cod}.`;
  let n = 1; while (set.has(prefijo + String(n).padStart(3, '0'))) n++;
  const cuenta = prefijo + String(n).padStart(3, '0');
  const nombreCuenta = String(b.nombre).trim().toUpperCase().slice(0, 60);
  store.setSetting(t, 'plan_cuentas', { cuentas: [...plan.cuentas, { codigo: cuenta, nombre: nombreCuenta, activa: true, bien: true }], guardado: plan.guardado || { fecha: new Date().toISOString(), por: 'Bienes de uso' } });
  return store.create(t, 'bienes_uso', { nombre: String(b.nombre).trim(), rubro: b.rubro, vida_util: n0(b.vida_util) || rubro.vida, fecha_alta: dia(b.fecha_alta), valor_origen: valor, fiscal: b.fiscal || 'blanco', comprobante: b.comprobante || '', contra: b.contra, cuenta, estado: 'vigente' });
}
function bajaBien(t, id, { fecha, precio = 0, contra, motivo = '' }) {
  const b = store.get(t, 'bienes_uso', id);
  if (!b || b.estado !== 'vigente') throw new Error('Ese bien no está vigente');
  if (!fecha || dia(fecha) < b.fecha_alta) throw new Error('La fecha de la baja tiene que ser posterior al alta');
  if (n0(precio) > 0 && !contra) throw new Error('Indicá contra qué cuenta entra lo cobrado por la venta');
  return store.update(t, 'bienes_uso', id, { estado: n0(precio) > 0 ? 'vendido' : 'baja', fecha_baja: dia(fecha), precio_venta: r2(precio), contra_baja: contra || null, motivo_baja: motivo });
}
function asientosBienes(t, hasta) {
  const cfg = base.configDe(t);
  const out = [];
  const porFecha = new Map();
  for (const b of store.list(t, 'bienes_uso')) {
    if (b.estado === 'anulado') continue;
    const r = RUBROS[b.rubro];
    const acumCta = `1.2.2.${r.cod}.001`;
    out.push({ fecha: b.fecha_alta, tipo: 'Bien de uso (alta)', concepto: `Alta de ${b.nombre}`, referencia: b.comprobante || '', lineas: [{ cuenta: b.cuenta, debe: b.valor_origen }, { cuenta: b.contra, haber: b.valor_origen }] });
    const am = amortizaciones(b, cfg, hasta);
    for (const a of am) { if (!porFecha.has(a.fecha)) porFecha.set(a.fecha, []); porFecha.get(a.fecha).push({ b, acumCta, importe: a.importe }); }
    if (b.fecha_baja && b.fecha_baja <= hasta) {
      const acum = r2(am.filter((x) => x.fecha <= b.fecha_baja).reduce((x, y) => x + y.importe, 0));
      const precio = n0(b.precio_venta);
      const res = r2(precio + acum - n0(b.valor_origen));
      const lineas = [{ cuenta: acumCta, debe: acum }, ...(precio ? [{ cuenta: b.contra_baja, debe: precio }] : []), { cuenta: b.cuenta, haber: n0(b.valor_origen) }];
      if (res > 0) lineas.push({ cuenta: cuentaDe(t, 'resultado_bienes'), haber: res }); else if (res < 0) lineas.push({ cuenta: cuentaDe(t, 'resultado_bienes'), debe: -res });
      out.push({ fecha: b.fecha_baja, tipo: 'Bien de uso (baja)', concepto: `${precio ? 'Venta' : 'Baja'} de ${b.nombre}`, referencia: b.motivo_baja || '', lineas });
    }
  }
  for (const [fecha, xs] of porFecha) {
    const total = r2(xs.reduce((a, x) => a + x.importe, 0));
    const porCta = new Map();
    for (const x of xs) porCta.set(x.acumCta, r2((porCta.get(x.acumCta) || 0) + x.importe));
    out.push({ fecha, tipo: 'Amortización', concepto: `Amortización de bienes de uso (${xs.length})`, referencia: cfg.amortizacion === 'mensual' ? 'mensual' : 'ejercicio', lineas: [{ cuenta: cuentaDe(t, 'amortizaciones'), debe: total }, ...[...porCta].map(([cuenta, haber]) => ({ cuenta, haber }))] });
  }
  return out;
}

// ════════════════ Cheques ════════════════
const ESTADO_CHEQUE = { en_cartera: 'En cartera', depositado: 'Depositado', cobrado: 'Cobrado', endosado: 'Endosado', rechazado: 'Rechazado', anulado: 'Anulado', emitido: 'Emitido', debitado: 'Debitado' };
const PENDIENTES = ['en_cartera', 'depositado', 'emitido'];
function altaCheque(t, b) {
  const tipo = b.tipo === 'emitido' ? 'emitido' : 'recibido';
  const importe = r2(b.importe);
  if (!(importe > 0)) throw new Error('Falta el importe');
  if (!String(b.numero || '').trim()) throw new Error('Falta el número del cheque');
  if (!b.pago) throw new Error('Falta la fecha de pago');
  const fecha = dia(b.recibido || b.emision || hoyAR());
  return store.create(t, 'cheques', {
    tipo, formato: b.formato || 'Físico', banco: b.banco || '', numero: String(b.numero).trim(), librador: b.librador || '', beneficiario: b.beneficiario || '', cuit: b.cuit || '',
    importe, emision: dia(b.emision || fecha), pago: dia(b.pago), fecha, origen: b.origen || (tipo === 'emitido' ? 'proveedor' : 'cliente'), cliente: b.cliente || '', referencia: b.referencia || '', obs: b.obs || '',
    estado: tipo === 'emitido' ? 'emitido' : 'en_cartera', historial: [{ fecha, accion: 'alta' }],
  });
}
const TRANSICIONES = {
  recibido: { depositar: ['en_cartera', 'depositado'], cobrar: ['depositado', 'cobrado'], endosar: ['en_cartera', 'endosado'], rechazar: [['en_cartera', 'depositado'], 'rechazado'], anular: ['en_cartera', 'anulado'] },
  emitido: { debitar: ['emitido', 'debitado'], anular: ['emitido', 'anulado'] },
};
function accionCheque(t, id, { accion, fecha, detalle = '' }) {
  const c = store.get(t, 'cheques', id);
  if (!c) throw new Error('No existe el cheque');
  const tr = TRANSICIONES[c.tipo][accion];
  if (!tr) throw new Error('Acción no válida para este cheque');
  const desdeOk = Array.isArray(tr[0]) ? tr[0].includes(c.estado) : tr[0] === c.estado;
  if (!desdeOk) throw new Error(`No se puede ${accion} un cheque ${ESTADO_CHEQUE[c.estado].toLowerCase()}`);
  const f = dia(fecha || hoyAR());
  return store.update(t, 'cheques', id, { estado: tr[1], historial: [...(c.historial || []), { fecha: f, accion, desde: c.estado, detalle }] });
}
function chequesResumen(t) {
  const hoy = hoyAR();
  const semana = new Date(Date.parse(hoy) + 7 * 86400000).toISOString().slice(0, 10);
  const finMes = finDeMes(hoy.slice(0, 7));
  const cs = store.list(t, 'cheques');
  const s = (xs) => ({ monto: r2(xs.reduce((a, c) => a + c.importe, 0)), cantidad: xs.length });
  const aCobrar = cs.filter((c) => c.tipo === 'recibido' && ['en_cartera', 'depositado'].includes(c.estado));
  const aPagar = cs.filter((c) => c.tipo === 'emitido' && c.estado === 'emitido');
  return {
    cheques: cs.map((c) => ({ ...c, estado_txt: ESTADO_CHEQUE[c.estado] })),
    kpis: {
      en_cartera: s(cs.filter((c) => c.tipo === 'recibido' && c.estado === 'en_cartera')), emitidos: s(aPagar),
      cobrar_semana: s(aCobrar.filter((c) => c.pago <= semana)), cobrar_mes: s(aCobrar.filter((c) => c.pago <= finMes)),
      pagar_semana: s(aPagar.filter((c) => c.pago <= semana)), pagar_mes: s(aPagar.filter((c) => c.pago <= finMes)),
    },
    vencen_mes: [...aCobrar, ...aPagar].filter((c) => c.pago.slice(0, 7) === hoy.slice(0, 7)).sort((a, b) => a.pago.localeCompare(b.pago)),
  };
}
function asientosCheques(t) {
  const out = [];
  const C = (k) => cuentaDe(t, k);
  for (const c of store.list(t, 'cheques')) {
    const ref = `Cheque ${c.banco} N.º ${c.numero}`;
    let depositado = false;
    for (const h of c.historial || []) {
      const L = (d, hc) => out.push({ fecha: h.fecha, tipo: 'Cheque', concepto: `${ref} · ${h.accion}${c.tipo === 'recibido' ? ` · ${c.librador || c.cliente}` : ` · ${c.beneficiario}`}`, referencia: c.referencia || '', lineas: [{ cuenta: d, debe: c.importe }, { cuenta: hc, haber: c.importe }] });
      const contraAlta = c.origen === 'caja' ? C('otros_ingresos') : C('deudores');
      if (c.tipo === 'recibido') {
        if (h.accion === 'alta') L(C('valores'), contraAlta);
        else if (h.accion === 'depositar') { L(C('banco'), C('valores')); depositado = true; }
        else if (h.accion === 'endosar') L(C('proveedores'), C('valores'));
        else if (h.accion === 'rechazar') L(C('cheques_rechazados'), depositado ? C('banco') : C('valores'));
        else if (h.accion === 'anular') L(contraAlta, C('valores'));
      } else {
        const contra = c.origen === 'gasto' ? C('gastos') : C('proveedores');
        if (h.accion === 'alta') L(contra, C('cheques_diferidos'));
        else if (h.accion === 'debitar') L(C('cheques_diferidos'), C('banco'));
        else if (h.accion === 'anular') L(C('cheques_diferidos'), contra);
      }
    }
  }
  return out;
}

// ════════════════ Préstamos ════════════════
function calcularCuotas({ monto, tna, sistema, cuotas, primer_vto, iva_alic = 10.5, otros_cargos = 0 }) {
  const n = Math.round(n0(cuotas));
  const P = n0(monto);
  if (!(P > 0) || !(n > 0) || n > 360) throw new Error('Revisá el monto y la cantidad de cuotas');
  if (!primer_vto) throw new Error('Falta el primer vencimiento');
  if (!['frances', 'aleman'].includes(sistema)) throw new Error('Elegí el sistema: francés o alemán');
  const i = n0(tna) / 12 / 100;
  const cuotaFija = sistema === 'frances' ? (i ? P * i / (1 - Math.pow(1 + i, -n)) : P / n) : null;
  let saldo = P;
  const out = [];
  for (let k = 1; k <= n; k++) {
    const interes = r2(saldo * i);
    let capital = sistema === 'frances' ? r2(cuotaFija - interes) : r2(P / n);
    if (k === n) capital = r2(saldo);
    saldo = r2(saldo - capital);
    const iva = r2(interes * n0(iva_alic) / 100);
    out.push({ n: k, vto: sumarMeses(primer_vto, k - 1), capital, interes, iva, otros: r2(otros_cargos), total: r2(capital + interes + iva + n0(otros_cargos)), saldo, pagada: false });
  }
  return out;
}
function altaPrestamo(t, b) {
  if (!String(b.acreedor || '').trim()) throw new Error('Falta el banco o acreedor');
  if (!b.fecha) throw new Error('Falta la fecha del préstamo');
  const cuotas = calcularCuotas(b);
  return store.create(t, 'prestamos', {
    acreedor: String(b.acreedor).trim(), cuit: b.cuit || '', fecha: dia(b.fecha), monto: r2(b.monto), tna: n0(b.tna), sistema: b.sistema, cantidad: cuotas.length, primer_vto: dia(b.primer_vto),
    cuenta_pasivo: b.cuenta_pasivo || null, fiscal: b.fiscal || 'blanco', iva_alic: n0(b.iva_alic), otros_cargos: r2(b.otros_cargos), banco: b.banco || '', obs: b.obs || '', cuotas, estado: 'vigente',
  });
}
function pagarCuota(t, id, { n, fecha }) {
  const p = store.get(t, 'prestamos', id);
  if (!p || p.estado !== 'vigente') throw new Error('Ese préstamo no está vigente');
  const cuotas = p.cuotas.map((c) => (c.n === Number(n) ? { ...c, pagada: true, fecha_pago: dia(fecha || hoyAR()) } : c));
  if (!cuotas.some((c) => c.n === Number(n))) throw new Error('No existe esa cuota');
  return store.update(t, 'prestamos', id, { cuotas, estado: cuotas.every((c) => c.pagada) ? 'cancelado' : 'vigente' });
}
function prestamosResumen(t) {
  const hoy = hoyAR();
  const lim = sumarMeses(hoy, 12);
  const ps = store.list(t, 'prestamos');
  const vig = ps.filter((p) => p.estado === 'vigente');
  const pend = vig.flatMap((p) => p.cuotas.filter((c) => !c.pagada).map((c) => ({ ...c, prestamo: p.acreedor, id: p.id })));
  const s = (xs, k = 'capital') => r2(xs.reduce((a, c) => a + c[k], 0));
  return {
    prestamos: ps.map((p) => { const np = p.cuotas.filter((c) => !c.pagada); return { ...p, pagas: p.cuotas.length - np.length, falta: s(np), proxima: np[0] || null, vencidas: np.filter((c) => c.vto < hoy).length }; }),
    kpis: { deuda: s(pend), vigentes: vig.length, corto: s(pend.filter((c) => c.vto <= lim)), largo: s(pend.filter((c) => c.vto > lim)), mes: s(pend.filter((c) => c.vto.slice(0, 7) === hoy.slice(0, 7)), 'total'), vencidas: pend.filter((c) => c.vto < hoy).length, vencidas_monto: s(pend.filter((c) => c.vto < hoy), 'total') },
  };
}
function asientosPrestamos(t) {
  const out = [];
  for (const p of store.list(t, 'prestamos')) {
    if (p.estado === 'anulado') continue;
    const pasivo = p.cuenta_pasivo || cuentaDe(t, 'prestamos');
    out.push({ fecha: p.fecha, tipo: 'Préstamo', concepto: `Préstamo de ${p.acreedor}`, referencia: `${p.cantidad} cuotas · ${p.sistema === 'frances' ? 'francés' : 'alemán'} · TNA ${p.tna}%`, lineas: [{ cuenta: cuentaDe(t, 'banco'), debe: p.monto }, { cuenta: pasivo, haber: p.monto }] });
    for (const c of p.cuotas.filter((x) => x.pagada)) {
      const blanco = p.fiscal !== 'por fuera';
      const lineas = [{ cuenta: pasivo, debe: c.capital }, { cuenta: cuentaDe(t, 'intereses'), debe: r2(c.interes + (blanco ? 0 : c.iva)) }];
      if (blanco && c.iva) lineas.push({ cuenta: cuentaDe(t, 'iva_credito'), debe: c.iva });
      if (c.otros) lineas.push({ cuenta: cuentaDe(t, 'gastos_bancarios'), debe: c.otros });
      lineas.push({ cuenta: cuentaDe(t, 'banco'), haber: c.total });
      out.push({ fecha: c.fecha_pago, tipo: 'Préstamo (cuota)', concepto: `Cuota ${c.n} de ${p.cantidad} · ${p.acreedor}`, referencia: '', lineas });
    }
  }
  return out;
}

// ════════════════ Bancos: extractos y conciliación ════════════════
function leerExtracto(nombre, contenido) {
  const filas = leerArchivo(nombre, contenido);
  const hi = filas.findIndex((f) => { const n = f.map(norm); return n.some((x) => x.startsWith('fecha')) && n.some((x) => /importe|monto|debito|credito|debe|haber/.test(x)); });
  if (hi < 0) throw new Error('No encuentro las columnas del extracto: tiene que tener Fecha y Importe (o Débito y Crédito)');
  const cab = filas[hi].map(norm);
  const col = (...re) => cab.findIndex((h) => re.some((r) => r.test(h)));
  const C = { fecha: col(/^fecha/), desc: col(/descrip|concepto|detalle|movimiento/), ref: col(/referen|comprobante|nro|numero|codigo/), imp: col(/^importe|^monto/), deb: col(/debito|^debe$|egreso/), cred: col(/credito|^haber$|ingreso/), saldo: col(/saldo/) };
  const fechaDe = (v) => {
    if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
    const s = String(v ?? '').trim(); let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : null;
  };
  const nv = (f, i) => { if (i < 0) return 0; const x = numero(f[i]); return Number.isFinite(x) ? x : 0; };
  const out = [];
  for (let k = hi + 1; k < filas.length; k++) {
    const f = filas[k]; const fecha = fechaDe(f[C.fecha]);
    if (!fecha) continue;
    let imp = C.imp >= 0 ? nv(f, C.imp) : r2(nv(f, C.cred) - Math.abs(nv(f, C.deb)));
    if (C.imp < 0 && C.deb >= 0 && C.cred < 0) imp = -Math.abs(nv(f, C.deb));
    if (!imp) continue;
    out.push({ fecha, descripcion: String(f[C.desc] ?? '').trim(), referencia: C.ref >= 0 ? String(f[C.ref] ?? '').trim() : '', importe: r2(imp), saldo: C.saldo >= 0 ? r2(nv(f, C.saldo)) : null });
  }
  if (!out.length) throw new Error('El extracto no tiene movimientos legibles');
  return out;
}
function subirExtracto(t, { banco_id, nombre, contenido }) {
  const b = store.get(t, 'bancos', banco_id);
  if (!b) throw new Error('Elegí la cuenta bancaria');
  const movs = leerExtracto(nombre, contenido);
  const clave = (m) => `${m.fecha}|${m.importe}|${m.descripcion}|${m.saldo}`;
  const ya = new Set(store.list(t, 'banco_movimientos').filter((m) => Number(m.banco_id) === Number(b.id)).map(clave));
  let nuevos = 0, repetidos = 0;
  store.enTransaccion(() => { for (const m of movs) { if (ya.has(clave(m))) { repetidos++; continue; } store.create(t, 'banco_movimientos', { ...m, banco_id: b.id, banco: b.nombre, estado: 'pendiente' }); nuevos++; } });
  return { nuevos, repetidos, desde: movs.map((m) => m.fecha).sort()[0], hasta: movs.map((m) => m.fecha).sort().pop() };
}
// Todo lo que el sistema sabe que pasó por el banco y que puede explicar un movimiento del extracto
function candidatosBanco(t) {
  const out = [];
  for (const m of store.list(t, 'caja_movimientos')) if (m.metodo !== 'Efectivo' && n0(m.monto)) out.push({ tipo: 'caja', id: m.id, fecha: dia(m.fecha), importe: r2(m.monto), detalle: `Flujo de caja · ${m.tipo}: ${m.concepto || m.categoria || ''}` });
  for (const p of store.list(t, 'pedidos')) if (p.pago === 'Pagado' && p.estado !== 'cancelado' && p.metodo_pago !== 'Efectivo contra entrega' && n0(p.total)) out.push({ tipo: 'pedido', id: p.id, fecha: dia(p.fecha_pago || p.fecha), importe: r2(p.total), detalle: `Cobro del pedido ${p.numero} · ${p.cliente}` });
  for (const c of store.list(t, 'cheques')) for (const h of c.historial || []) {
    if (h.accion === 'depositar') out.push({ tipo: 'cheque', id: `${c.id}-dep`, fecha: dia(h.fecha), importe: c.importe, detalle: `Depósito cheque ${c.numero} · ${c.librador}` });
    if (h.accion === 'debitar') out.push({ tipo: 'cheque', id: `${c.id}-deb`, fecha: dia(h.fecha), importe: -c.importe, detalle: `Débito cheque propio ${c.numero} · ${c.beneficiario}` });
  }
  for (const p of store.list(t, 'prestamos')) {
    if (p.estado === 'anulado') continue;
    out.push({ tipo: 'prestamo', id: `${p.id}-alta`, fecha: p.fecha, importe: p.monto, detalle: `Acreditación del préstamo ${p.acreedor}` });
    for (const c of p.cuotas.filter((x) => x.pagada)) out.push({ tipo: 'prestamo', id: `${p.id}-c${c.n}`, fecha: c.fecha_pago, importe: -c.total, detalle: `Cuota ${c.n} préstamo ${p.acreedor}` });
  }
  return out;
}
function bancosResumen(t, { banco_id, desde, hasta } = {}) {
  const bancos = store.list(t, 'bancos');
  const movsTodos = store.list(t, 'banco_movimientos');
  const bancoSel = banco_id ? Number(banco_id) : (bancos.find((b) => movsTodos.some((m) => Number(m.banco_id) === b.id)) || bancos[0])?.id;
  const movs = movsTodos.filter((m) => Number(m.banco_id) === Number(bancoSel)).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);
  const usados = new Set(movsTodos.filter((m) => m.estado === 'conciliado' && m.match).map((m) => `${m.match.tipo}|${m.match.id}`));
  const cand = candidatosBanco(t).filter((c) => !usados.has(`${c.tipo}|${c.id}`));
  const filas = movs.filter((m) => enRango(m.fecha, desde, hasta)).map((m) => {
    if (m.estado !== 'pendiente') return m;
    const sug = cand.filter((c) => Math.abs(c.importe - m.importe) < 0.01 && Math.abs(diasEntre(c.fecha, m.fecha)) <= 2);
    return { ...m, sugerencias: sug.slice(0, 5), coincidencia: sug.length === 1 ? 'alta' : sug.length ? 'media' : null };
  });
  const pend = filas.filter((m) => m.estado === 'pendiente');
  const ult = movs.find((m) => m.saldo !== null && m.saldo !== undefined);
  return {
    bancos: bancos.map((b) => { const ms = movsTodos.filter((m) => Number(m.banco_id) === b.id); return { id: b.id, nombre: b.nombre, tipo: b.tipo, movimientos: ms.length, desde: ms.map((m) => m.fecha).sort()[0] || null, hasta: ms.map((m) => m.fecha).sort().pop() || null }; }),
    banco_id: bancoSel, filas,
    kpis: { saldo: ult?.saldo ?? null, saldo_fecha: ult?.fecha || null, pendientes: pend.length, entra: r2(pend.filter((m) => m.importe > 0).reduce((a, m) => a + m.importe, 0)), sale: r2(pend.filter((m) => m.importe < 0).reduce((a, m) => a + m.importe, 0)), con_sugerencia: pend.filter((m) => m.coincidencia).length, altas: pend.filter((m) => m.coincidencia === 'alta').length, conciliados: filas.filter((m) => m.estado === 'conciliado').length, ignorados: filas.filter((m) => m.estado === 'ignorado').length },
  };
}
function conciliar(t, id, match) {
  const m = store.get(t, 'banco_movimientos', id);
  if (!m) throw new Error('No existe el movimiento');
  if (!match) return store.update(t, 'banco_movimientos', id, { estado: 'pendiente', match: null });
  if (match === 'ignorar') return store.update(t, 'banco_movimientos', id, { estado: 'ignorado', match: null });
  const c = candidatosBanco(t).find((x) => x.tipo === match.tipo && String(x.id) === String(match.id));
  if (!c) throw new Error('Ese movimiento del sistema ya no existe');
  if (Math.abs(c.importe - m.importe) >= 0.01) throw new Error('Los importes no coinciden');
  return store.update(t, 'banco_movimientos', id, { estado: 'conciliado', match: { tipo: c.tipo, id: c.id, detalle: c.detalle, fecha: c.fecha } });
}
function conciliarAltas(t, banco_id) {
  const r = bancosResumen(t, { banco_id });
  let n = 0; const usados = new Set();
  for (const m of r.filas.filter((x) => x.coincidencia === 'alta')) {
    const s = m.sugerencias[0]; const k = `${s.tipo}|${s.id}`;
    if (usados.has(k)) continue; usados.add(k);
    conciliar(t, m.id, s); n++;
  }
  return { conciliados: n };
}

// ════════════════ Ingresos Brutos por provincia ════════════════
const PROVINCIAS = [
  [901, 'CABA', 'C'], [902, 'Buenos Aires', 'B'], [903, 'Catamarca', 'K'], [904, 'Córdoba', 'X'], [905, 'Corrientes', 'W'], [906, 'Chaco', 'H'], [907, 'Chubut', 'U'], [908, 'Entre Ríos', 'E'],
  [909, 'Formosa', 'P'], [910, 'Jujuy', 'Y'], [911, 'La Pampa', 'L'], [912, 'La Rioja', 'F'], [913, 'Mendoza', 'M'], [914, 'Misiones', 'N'], [915, 'Neuquén', 'Q'], [916, 'Río Negro', 'R'],
  [917, 'Salta', 'A'], [918, 'San Juan', 'J'], [919, 'San Luis', 'D'], [920, 'Santa Cruz', 'Z'], [921, 'Santa Fe', 'S'], [922, 'Santiago del Estero', 'G'], [923, 'Tierra del Fuego', 'V'], [924, 'Tucumán', 'T'],
].map(([cod, nombre, letra]) => ({ cod, nombre, letra }));
// Rangos aproximados de códigos postales numéricos
const RANGOS_CP = [[1000, 1499, 901], [1500, 1999, 902], [2000, 2699, 921], [2700, 2999, 902], [3000, 3099, 921], [3100, 3299, 908], [3300, 3399, 914], [3400, 3499, 905], [3500, 3599, 906], [3600, 3699, 909], [3700, 3799, 906],
  [4000, 4199, 924], [4200, 4399, 922], [4400, 4499, 917], [4500, 4699, 910], [4700, 4799, 903], [5000, 5299, 904], [5300, 5399, 912], [5400, 5499, 918], [5500, 5699, 913], [5700, 5799, 919], [5800, 5999, 904],
  [6000, 6299, 902], [6300, 6399, 911], [6400, 6799, 902], [7000, 7699, 902], [8000, 8199, 902], [8200, 8299, 911], [8300, 8399, 915], [8400, 8599, 916], [9000, 9299, 907], [9300, 9409, 920], [9410, 9420, 923]];
function provinciaDe(p) {
  const s = norm(p.provincia || p.estado_provincia || '');
  if (s) {
    const x = PROVINCIAS.find((v) => norm(v.nombre) === s || v.letra.toLowerCase() === s || (s.includes('capital') && v.cod === 901) || (s.includes('ciudad autonoma') && v.cod === 901) || (s === 'buenos aires' && v.cod === 902) || (s.includes('tierra del fuego') && v.cod === 923) || (s.includes('santiago') && v.cod === 922) || (s.includes('cordoba') && v.cod === 904));
    if (x) return { ...x, estimada: false };
  }
  const cp = String(p.cp || '').trim().toUpperCase();
  const letra = cp.match(/^([A-Z])\d{4}/)?.[1];
  if (letra) { const x = PROVINCIAS.find((v) => v.letra === letra); if (x) return { ...x, estimada: false }; }
  const nro = Number(cp.match(/\d{4}/)?.[0]);
  if (nro) { const r = RANGOS_CP.find(([a, b]) => nro >= a && nro <= b); if (r) return { ...PROVINCIAS.find((v) => v.cod === r[2]), estimada: true }; }
  return null;
}
function provincias(t, { desde, hasta } = {}) {
  const cfg = store.getSettings(t).iibb || {};
  const facPorPedido = new Map(store.list(t, 'facturas').filter((f) => f.pedido_id && !/^N[CD] /.test(String(f.tipo)) && f.estado === 'emitida').map((f) => [Number(f.pedido_id), f]));
  const g = new Map(); let sinProv = 0, montoSinProv = 0, estimadas = 0;
  for (const p of store.list(t, 'pedidos').filter((x) => x.estado !== 'cancelado' && enRango(x.fecha, desde, hasta))) {
    const f = facPorPedido.get(Number(p.id));
    const neto = f ? n0(f.neto ?? f.total) : r2(n0(p.total) / 1.21);
    const pr = provinciaDe(p);
    if (!pr) { sinProv++; montoSinProv += neto; continue; }
    if (pr.estimada) estimadas++;
    const x = g.get(pr.cod) || { cod: pr.cod, nombre: pr.nombre, pedidos: 0, neto: 0 };
    x.pedidos++; x.neto = r2(x.neto + neto); g.set(pr.cod, x);
  }
  const total = r2([...g.values()].reduce((a, x) => a + x.neto, 0));
  const filas = [...g.values()].sort((a, b) => b.neto - a.neto).map((x) => {
    const alic = cfg.alicuotas?.[x.cod];
    return { ...x, porcentaje: total ? r2(x.neto / total * 100) : 0, inscripta: !!cfg.inscriptas?.[x.cod], alicuota: alic ?? null, estimado: alic !== undefined && alic !== null && alic !== '' ? r2(x.neto * n0(alic) / 100) : null };
  });
  const sinAlic = filas.filter((x) => x.alicuota === null || x.alicuota === '');
  return {
    filas, total, todas: PROVINCIAS, estimado: r2(filas.reduce((a, x) => a + (x.estimado || 0), 0)), inscriptas: filas.filter((x) => x.inscripta).length,
    avisos: [
      ...(sinAlic.length ? [`${sinAlic.length} provincia(s) con ventas sin alícuota: ${sinAlic.map((x) => x.nombre).join(', ')}. Cargala (la de tu actividad en la ley impositiva de cada provincia) para ver el estimado.`] : []),
      ...(sinProv ? [`${sinProv} venta(s) sin provincia (sin código postal): ${r2(montoSinProv).toFixed(2)} de neto no se reparte.`] : []),
      ...(estimadas ? [`${estimadas} venta(s) con la provincia deducida del código postal numérico (aproximado).`] : []),
    ],
  };
}
function guardarProvincias(t, { alicuotas = {}, inscriptas = {} }) {
  const cfg = store.getSettings(t).iibb || {};
  const a = { ...(cfg.alicuotas || {}) };
  for (const [k, v] of Object.entries(alicuotas)) { if (v === '' || v === null) delete a[k]; else a[k] = n0(v); }
  store.setSetting(t, 'iibb', { alicuotas: a, inscriptas: { ...(cfg.inscriptas || {}), ...inscriptas } });
  return true;
}

module.exports = { RUBROS, bienesResumen, altaBien, bajaBien, asientosBienes, altaCheque, accionCheque, chequesResumen, asientosCheques, ESTADO_CHEQUE, calcularCuotas, altaPrestamo, pagarCuota, prestamosResumen, asientosPrestamos, subirExtracto, bancosResumen, conciliar, conciliarAltas, provincias, guardarProvincias, provinciaDe, PROVINCIAS, PENDIENTES };
