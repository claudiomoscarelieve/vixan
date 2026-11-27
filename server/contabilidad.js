// Vixan — contabilidad: plan de cuentas, libros IVA (con lo de ARCA), libro diario con asientos
// automáticos y manuales, mayor, balance, posición de IVA e IIBB, bienes de uso, bancos, cheques y préstamos.
const express = require('express');
const store = require('./db');
const { leerArchivo, numero } = require('./importar');

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const n0 = (v) => Number(v) || 0;
const dia = (s) => String(s || '').slice(0, 10);
const enRango = (f, desde, hasta) => (!desde || dia(f) >= desde) && (!hasta || dia(f) <= hasta);
const soloDigitos = (s) => String(s || '').replace(/\D/g, '');
const mesDe = (f) => dia(f).slice(0, 7);
const hoyAR = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9%,.]+/g, ' ').trim();
const finDeMes = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const sumarMeses = (ym, k) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + k, 1)); return d.toISOString().slice(0, 7); };
const meses = (desde, hasta) => { const out = []; for (let m = mesDe(desde); m <= mesDe(hasta) && out.length < 36; m = sumarMeses(m, 1)) out.push(m); return out; };

// ════════════════ Tipos de comprobante (tabla de ARCA) ════════════════
const CBTE_NOMBRE = {
  1: 'Factura A', 2: 'Nota de Débito A', 3: 'Nota de Crédito A', 4: 'Recibo A', 6: 'Factura B', 7: 'Nota de Débito B', 8: 'Nota de Crédito B', 9: 'Recibo B',
  11: 'Factura C', 12: 'Nota de Débito C', 13: 'Nota de Crédito C', 15: 'Recibo C', 51: 'Factura M', 52: 'Nota de Débito M', 53: 'Nota de Crédito M',
  81: 'Tique Factura A', 82: 'Tique Factura B', 83: 'Tique', 111: 'Tique Factura C', 66: 'Despacho de Importación',
  201: 'Factura de Crédito MiPyME A', 202: 'Nota de Débito MiPyME A', 203: 'Nota de Crédito MiPyME A', 206: 'Factura de Crédito MiPyME B', 207: 'Nota de Débito MiPyME B', 208: 'Nota de Crédito MiPyME B',
  211: 'Factura de Crédito MiPyME C', 212: 'Nota de Débito MiPyME C', 213: 'Nota de Crédito MiPyME C',
};
const CODIGO_DE_LETRA = { A: 1, B: 6, C: 11, 'NC A': 3, 'NC B': 8, 'NC C': 13, 'ND A': 2, 'ND B': 7, 'ND C': 12, M: 51, 'NC M': 53, 'ND M': 52 };
const esNCcod = (c) => [3, 8, 13, 53, 203, 208, 213].includes(Number(c));
const letraDeCod = (c) => { const n = CBTE_NOMBRE[c] || ''; const m = n.match(/ ([ABCM])$/); return m ? m[1] : (Number(c) === 66 ? 'D' : ''); };
const abrevCbte = (c) => { const n = CBTE_NOMBRE[c] || `Tipo ${c}`; return n.replace('Nota de Crédito', 'NC').replace('Nota de Débito', 'ND').replace('Factura de Crédito MiPyME', 'FCE').replace('Factura', 'Fact.'); };
const ALIC_ID = { 0: 3, 10.5: 4, 21: 5, 27: 6, 5: 8, 2.5: 9 };

// ════════════════ Plan de cuentas ════════════════
const PLAN_MODELO = [
  ['1.0.0.00.000', 'ACTIVO'], ['1.1.0.00.000', 'ACTIVO CORRIENTE'], ['1.1.1.00.000', 'CAJA Y BANCOS'],
  ['1.1.1.01.000', 'CAJA'], ['1.1.1.01.001', 'CAJA PRINCIPAL'], ['1.1.1.01.002', 'CAJA CHICA'], ['1.1.1.01.003', 'CAJA MONEDA EXTRANJERA'], ['1.1.1.01.004', 'VALORES A DEPOSITAR'], ['1.1.1.01.005', 'CHEQUES RECHAZADOS'],
  ['1.1.1.02.000', 'BANCOS'], ['1.1.1.02.001', 'BANCO CUENTA CORRIENTE'], ['1.1.1.02.002', 'BANCO CAJA DE AHORRO'], ['1.1.1.02.003', 'MERCADO PAGO'], ['1.1.1.02.050', 'BANCO A CONCILIAR'],
  ['1.1.2.00.000', 'CREDITOS'], ['1.1.2.01.000', 'CREDITOS COMERCIALES'], ['1.1.2.01.001', 'DEUDORES POR VENTAS'], ['1.1.2.01.002', 'CUPONES DE TARJETAS A COBRAR'], ['1.1.2.01.003', 'DOCUMENTOS A COBRAR'], ['1.1.2.01.005', 'ANTICIPOS A PROVEEDORES'],
  ['1.1.2.02.000', 'CREDITOS IMPOSITIVOS'], ['1.1.2.02.001', 'I.V.A. CREDITO FISCAL'], ['1.1.2.02.002', 'I.V.A. SALDO A FAVOR'], ['1.1.2.02.003', 'PERCEPCIONES DE I.V.A. SUFRIDAS'], ['1.1.2.02.004', 'RETENCIONES DE I.V.A. SUFRIDAS'],
  ['1.1.2.02.005', 'PERCEPCIONES DE INGRESOS BRUTOS SUFRIDAS'], ['1.1.2.02.006', 'RETENCIONES DE INGRESOS BRUTOS SUFRIDAS'], ['1.1.2.02.007', 'RETENCIONES DE GANANCIAS SUFRIDAS'], ['1.1.2.02.008', 'INGRESOS BRUTOS SALDO A FAVOR'],
  ['1.1.2.03.000', 'OTROS CREDITOS'], ['1.1.2.03.001', 'DEUDORES VARIOS'], ['1.1.2.03.002', 'GASTOS PAGADOS POR ADELANTADO'],
  ['1.1.3.00.000', 'BIENES DE CAMBIO'], ['1.1.3.01.000', 'MERCADERIAS'], ['1.1.3.01.001', 'MERCADERIAS DE REVENTA'],
  ['1.2.0.00.000', 'ACTIVO NO CORRIENTE'], ['1.2.1.00.000', 'BIENES DE USO'],
  ['1.2.1.01.000', 'MUEBLES Y UTILES'], ['1.2.1.02.000', 'INSTALACIONES'], ['1.2.1.03.000', 'RODADOS'], ['1.2.1.04.000', 'EQUIPOS DE COMPUTACION'], ['1.2.1.05.000', 'MAQUINARIAS'], ['1.2.1.06.000', 'INMUEBLES'],
  ['1.2.2.00.000', 'AMORTIZACIONES ACUMULADAS'], ['1.2.2.01.001', 'AMORT. ACUM. MUEBLES Y UTILES'], ['1.2.2.02.001', 'AMORT. ACUM. INSTALACIONES'], ['1.2.2.03.001', 'AMORT. ACUM. RODADOS'],
  ['1.2.2.04.001', 'AMORT. ACUM. EQUIPOS DE COMPUTACION'], ['1.2.2.05.001', 'AMORT. ACUM. MAQUINARIAS'], ['1.2.2.06.001', 'AMORT. ACUM. INMUEBLES'],
  ['2.0.0.00.000', 'PASIVO'], ['2.1.0.00.000', 'PASIVO CORRIENTE'], ['2.1.1.00.000', 'DEUDAS'],
  ['2.1.1.01.000', 'DEUDAS COMERCIALES'], ['2.1.1.01.001', 'PROVEEDORES'], ['2.1.1.01.002', 'ANTICIPOS DE CLIENTES'], ['2.1.1.01.003', 'TARJETAS DE CREDITO A PAGAR'], ['2.1.1.01.004', 'CHEQUES DIFERIDOS A PAGAR'],
  ['2.1.1.02.000', 'DEUDAS FISCALES'], ['2.1.1.02.001', 'I.V.A. DEBITO FISCAL'], ['2.1.1.02.002', 'I.V.A. SALDO A PAGAR'], ['2.1.1.02.003', 'INGRESOS BRUTOS A PAGAR'], ['2.1.1.02.004', 'IMPUESTO A LAS GANANCIAS A PAGAR'],
  ['2.1.1.02.005', 'PERCEPCIONES DE I.V.A. A DEPOSITAR'], ['2.1.1.02.006', 'IMPUESTOS INTERNOS A PAGAR'], ['2.1.1.02.007', 'RETENCIONES PRACTICADAS A DEPOSITAR'],
  ['2.1.1.03.000', 'DEUDAS SOCIALES'], ['2.1.1.03.001', 'SUELDOS A PAGAR'], ['2.1.1.03.002', 'CARGAS SOCIALES A PAGAR'],
  ['2.1.1.04.000', 'DEUDAS FINANCIERAS'], ['2.1.1.04.001', 'PRESTAMOS BANCARIOS'],
  ['2.1.1.05.000', 'OTRAS DEUDAS'], ['2.1.1.05.001', 'ACREEDORES VARIOS'], ['2.1.1.05.002', 'CUENTA PARTICULAR DE SOCIOS'],
  ['3.0.0.00.000', 'PATRIMONIO NETO'], ['3.1.0.00.000', 'CAPITAL'], ['3.1.1.00.001', 'CAPITAL SOCIAL'], ['3.1.1.00.002', 'APORTES IRREVOCABLES'],
  ['3.2.0.00.000', 'RESERVAS'], ['3.2.1.00.001', 'RESERVA LEGAL'],
  ['3.3.0.00.000', 'RESULTADOS ACUMULADOS'], ['3.3.1.00.001', 'RESULTADOS DE EJERCICIOS ANTERIORES'], ['3.3.2.00.001', 'RESULTADOS NO ASIGNADOS (APERTURA)'],
  ['4.0.0.00.000', 'RESULTADOS'], ['4.1.0.00.000', 'INGRESOS'], ['4.1.1.00.000', 'INGRESOS POR VENTAS'], ['4.1.1.01.001', 'VENTAS'], ['4.1.1.01.002', 'DEVOLUCIONES Y BONIFICACIONES'],
  ['4.1.2.00.000', 'OTROS INGRESOS'], ['4.1.2.01.001', 'INTERESES GANADOS'], ['4.1.2.01.002', 'RESULTADO POR VENTA DE BIENES DE USO'], ['4.1.2.01.003', 'OTROS INGRESOS'],
  ['4.2.0.00.000', 'EGRESOS'], ['4.2.1.00.000', 'COSTO DE VENTAS'], ['4.2.1.01.001', 'COSTO DE MERCADERIAS VENDIDAS'],
  ['4.2.2.00.000', 'GASTOS DE COMERCIALIZACION'], ['4.2.2.01.001', 'COMISIONES DE PLATAFORMAS'], ['4.2.2.01.002', 'FLETES Y ENVIOS'], ['4.2.2.01.003', 'PUBLICIDAD'], ['4.2.2.01.004', 'EMBALAJES'], ['4.2.2.01.005', 'IMPUESTO A LOS INGRESOS BRUTOS'],
  ['4.2.3.00.000', 'GASTOS DE ADMINISTRACION'], ['4.2.3.01.001', 'SUELDOS Y JORNALES'], ['4.2.3.01.002', 'CARGAS SOCIALES'], ['4.2.3.01.003', 'HONORARIOS'], ['4.2.3.01.004', 'ALQUILERES'],
  ['4.2.3.01.005', 'SERVICIOS (LUZ, GAS, INTERNET)'], ['4.2.3.01.006', 'GASTOS GENERALES'], ['4.2.3.01.007', 'AMORTIZACIONES DE BIENES DE USO'], ['4.2.3.01.008', 'IMPUESTOS Y TASAS'],
  ['4.2.4.00.000', 'GASTOS FINANCIEROS'], ['4.2.4.01.001', 'INTERESES PAGADOS'], ['4.2.4.01.002', 'GASTOS Y COMISIONES BANCARIAS'], ['4.2.4.01.003', 'IMPUESTO A LOS DEBITOS Y CREDITOS BANCARIOS'], ['4.2.4.01.004', 'SOBRETASAS DE INGRESOS BRUTOS'],
];
// Conceptos de los asientos automáticos y la cuenta que usan por defecto
const CONCEPTOS = [
  ['Ventas', 'deudores', 'Total facturado (a cobrar)', '1.1.2.01.001'], ['Ventas', 'ventas', 'Ventas (neto)', '4.1.1.01.001'], ['Ventas', 'iva_debito', 'IVA débito fiscal', '2.1.1.02.001'], ['Ventas', 'imp_internos', 'Impuestos internos facturados', '2.1.1.02.006'], ['Ventas', 'percep_iva_ventas', 'Percepciones de IVA practicadas (a depositar)', '2.1.1.02.005'],
  ['Compras', 'proveedores', 'Total de la factura (a pagar)', '2.1.1.01.001'], ['Compras', 'mercaderias', 'Compra de mercadería (órdenes)', '1.1.3.01.001'], ['Compras', 'iva_credito', 'IVA crédito fiscal', '1.1.2.02.001'],
  ['Compras', 'percep_iva', 'Percepciones de IVA sufridas', '1.1.2.02.003'], ['Compras', 'percep_iibb', 'Percepciones de IIBB sufridas', '1.1.2.02.005'], ['Compras', 'gastos_arca', 'Gastos y compras que sólo están en ARCA', '4.2.3.01.006'],
  ['Caja y bancos', 'caja', 'Caja (efectivo)', '1.1.1.01.001'], ['Caja y bancos', 'banco', 'Banco (transferencias)', '1.1.1.02.050'], ['Caja y bancos', 'mercado_pago', 'Mercado Pago', '1.1.1.02.003'],
  ['Gastos', 'gastos', 'Gastos sin categoría', '4.2.3.01.006'], ['Gastos', 'otros_ingresos', 'Otros ingresos', '4.1.2.01.003'], ['Gastos', 'aportes', 'Aportes de socios', '3.1.1.00.002'], ['Gastos', 'retiros', 'Retiros de socios', '2.1.1.05.002'],
  ['Cheques', 'valores', 'Cheques en cartera', '1.1.1.01.004'], ['Cheques', 'cheques_diferidos', 'Cheques propios a pagar', '2.1.1.01.004'], ['Cheques', 'cheques_rechazados', 'Cheques rechazados', '1.1.1.01.005'],
  ['Préstamos', 'prestamos', 'Préstamos (deuda)', '2.1.1.04.001'], ['Préstamos', 'intereses', 'Intereses pagados', '4.2.4.01.001'], ['Préstamos', 'gastos_bancarios', 'Otros cargos del préstamo', '4.2.4.01.002'],
  ['Bienes de uso', 'amortizaciones', 'Amortizaciones del ejercicio', '4.2.3.01.007'], ['Bienes de uso', 'resultado_bienes', 'Resultado por venta de bienes', '4.1.2.01.002'], ['Bienes de uso', 'apertura', 'Apertura (ya lo tenía)', '3.3.2.00.001'],
];
// Si un gasto no tiene cuenta elegida, se sugiere una por el nombre de la categoría
const SUGERENCIAS = [
  [/sueldo|jornal|empleado|personal/, '4.2.3.01.001'], [/carga.? social|f\.?931|aporte/, '4.2.3.01.002'], [/honorario|contador|abogad/, '4.2.3.01.003'], [/alquiler/, '4.2.3.01.004'],
  [/luz|gas|internet|telefon|servicio|agua|edenor|edesur|metrogas|fibertel|telecentro/, '4.2.3.01.005'], [/publicidad|ads|anuncio|marketing|meta|google/, '4.2.2.01.003'],
  [/envio|flete|correo|andreani|oca|logistic/, '4.2.2.01.002'], [/comision|mercado libre|tienda nube|plataforma/, '4.2.2.01.001'], [/embalaje|caja|cinta|packaging/, '4.2.2.01.004'],
  [/banco|bancari|mantenimiento de cuenta/, '4.2.4.01.002'], [/impuesto|tasa|municipal|abl|patente|iibb|ingresos brutos/, '4.2.3.01.008'], [/interes/, '4.2.4.01.001'],
];

const segs = (c) => String(c).split('.');
const esRubro = (c) => segs(c)[4] === '000';
function planDe(t) {
  const p = store.getSettings(t).plan_cuentas;
  const cuentas = p?.cuentas?.length ? p.cuentas : PLAN_MODELO.map(([codigo, nombre]) => ({ codigo, nombre, activa: true }));
  return { cuentas: [...cuentas].sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })), propio: !!p?.cuentas?.length, guardado: p?.guardado || null };
}
function imputacionDe(t) {
  const i = store.getSettings(t).contab_imputacion || {};
  return { conceptos: { ...Object.fromEntries(CONCEPTOS.map((c) => [c[1], c[3]])), ...(i.conceptos || {}) }, categorias: i.categorias || {}, proveedores: i.proveedores || {} };
}
// Cuenta madre de un código (el rubro más cercano que exista)
function padreDe(codigo, set) {
  const s = segs(codigo);
  for (let i = 4; i >= 1; i--) {
    if (/^0+$/.test(s[i])) continue;
    const p = s.map((x, j) => (j >= i ? x.replace(/\d/g, '0') : x)).join('.');
    if (p !== codigo && set.has(p)) return p;
  }
  return null;
}
const CONFIG_DEF = { iva_compras_solo_am: true, compras_mes_orden: false, amortizacion: 'anual', cierre_mes: 12 };
const configDe = (t) => ({ ...CONFIG_DEF, ...(store.getSettings(t).contab_config || {}) });

// ════════════════ Mis Comprobantes de ARCA (archivo que baja la web de ARCA) ════════════════
function tipoDesdeTexto(v) {
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{1,3})\b/);
  if (m) return Number(m[1]);
  const n = norm(s);
  for (const [cod, nombre] of Object.entries(CBTE_NOMBRE)) if (norm(nombre) === n) return Number(cod);
  return null;
}
function fechaDesde(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
function leerMisComprobantes(nombre, contenido, origen) {
  const filas = leerArchivo(nombre, contenido);
  const hi = filas.findIndex((f) => { const n = f.map(norm); return n.includes('fecha') && n.some((x) => x === 'tipo' || x.startsWith('tipo de comprobante')) && n.some((x) => x.includes('total')); });
  if (hi < 0) throw new Error('No reconozco el archivo: tiene que ser el de "Mis Comprobantes" de ARCA (Emitidos o Recibidos), en CSV o Excel');
  const cab = filas[hi].map(norm);
  const col = (...alias) => cab.findIndex((h) => alias.some((a) => (a instanceof RegExp ? a.test(h) : h === a)));
  const C = {
    fecha: col('fecha', 'fecha de emision'), tipo: col('tipo', /^tipo de comprobante/), pv: col('punto de venta'), nro: col('numero desde', 'numero', /^nro/),
    cae: col(/cod.* autorizacion/, 'cae'), doc_tipo: col(/tipo doc/), doc_nro: col(/nro.* doc/, /numero doc/), nombre: col(/denominacion/),
    cambio: col('tipo cambio', 'tipo de cambio'), moneda: col('moneda'), neto: col('imp. neto gravado', 'total neto gravado', /neto gravado$/), no_gravado: col('imp. neto no gravado', /no gravado/),
    exento: col('imp. op. exentas', /exent/), otros: col('otros tributos'), iva: col('iva', 'total iva'), total: col('imp. total', 'importe total', 'total'),
  };
  // Columnas por alícuota (formato nuevo de ARCA): "Neto Grav. IVA 21%" e "IVA 21%"
  const porAlic = [];
  for (const a of ['0', '2,5', '5', '10,5', '21', '27']) {
    const ni = cab.findIndex((h) => h.startsWith('neto grav') && h.replace(/\s/g, '').endsWith(`iva${a}%`));
    const ii = cab.findIndex((h) => h.replace(/\s/g, '') === `iva${a}%`);
    if (ni >= 0 || ii >= 0) porAlic.push({ alic: Number(a.replace(',', '.')), ni, ii });
  }
  if (C.fecha < 0 || C.tipo < 0 || C.total < 0) throw new Error('Al archivo le faltan columnas (Fecha, Tipo o Imp. Total)');
  const v = (f, i) => (i >= 0 ? f[i] : '');
  const nv = (f, i) => { const x = numero(v(f, i)); return Number.isFinite(x) ? x : 0; };
  const out = [], errores = [];
  for (let k = hi + 1; k < filas.length; k++) {
    const f = filas[k];
    if (!f || !f.some((x) => String(x).trim() !== '')) continue;
    const fecha = fechaDesde(v(f, C.fecha)), tipo = tipoDesdeTexto(v(f, C.tipo));
    if (!fecha || !tipo) { errores.push(`Fila ${k + 1}: fecha o tipo ilegibles`); continue; }
    const cambio = nv(f, C.cambio) || 1;
    const x = (i) => r2(nv(f, i) * cambio);
    let alicuotas = porAlic.map((a) => ({ alic: a.alic, neto: x(a.ni), iva: x(a.ii) })).filter((g) => g.neto || g.iva);
    const neto = x(C.neto), iva = x(C.iva);
    if (!alicuotas.length && (neto || iva)) {
      // formato viejo: un solo neto e IVA; se deduce la alícuota
      const p = neto ? iva / neto * 100 : 21;
      const alic = [27, 21, 10.5, 5, 2.5, 0].reduce((b, a) => (Math.abs(a - p) < Math.abs(b - p) ? a : b), 21);
      alicuotas = [{ alic, neto, iva, deducida: Math.abs(alic - p) > 0.3 }];
    }
    out.push({
      origen, fecha, cbte_tipo: tipo, punto_venta: Number(v(f, C.pv)) || 0, nro: Number(String(v(f, C.nro)).replace(/\D/g, '')) || 0, cae: String(v(f, C.cae) || ''),
      doc_tipo: String(v(f, C.doc_tipo) || ''), doc_nro: soloDigitos(v(f, C.doc_nro)), nombre: String(v(f, C.nombre) || '').trim(),
      alicuotas, neto: r2(alicuotas.reduce((a, g) => a + g.neto, 0)), iva: r2(alicuotas.reduce((a, g) => a + g.iva, 0)),
      no_gravado: x(C.no_gravado), exento: x(C.exento), otros_tributos: x(C.otros), total: x(C.total), moneda: String(v(f, C.moneda) || '$'), cambio,
    });
  }
  return { comprobantes: out, errores };
}
const claveCbte = (c) => `${c.cbte_tipo}|${Number(c.punto_venta)}|${Number(c.nro)}`;
function importarMisComprobantes(t, { nombre, contenido, origen }) {
  if (!['emitidos', 'recibidos'].includes(origen)) throw new Error('Elegí si son Emitidos o Recibidos');
  const { comprobantes, errores } = leerMisComprobantes(nombre, contenido, origen);
  if (!comprobantes.length) throw new Error(errores[0] || 'El archivo no tiene comprobantes');
  const ya = new Map(store.list(t, 'arca_comprobantes').filter((c) => c.origen === origen).map((c) => [`${claveCbte(c)}|${origen === 'recibidos' ? c.doc_nro : ''}`, c]));
  let nuevos = 0, actualizados = 0;
  store.enTransaccion(() => {
    for (const c of comprobantes) {
      const k = `${claveCbte(c)}|${origen === 'recibidos' ? c.doc_nro : ''}`;
      const prev = ya.get(k);
      if (prev) { store.update(t, 'arca_comprobantes', prev.id, c); actualizados++; } else { store.create(t, 'arca_comprobantes', c); nuevos++; }
    }
  });
  const ms = [...new Set(comprobantes.map((c) => mesDe(c.fecha)))].sort();
  return { nuevos, actualizados, errores: errores.slice(0, 20), meses: ms };
}

// ════════════════ Libro IVA Ventas ════════════════
function ventasLibro(t, { desde, hasta } = {}) {
  const avisos = [];
  const propias = store.list(t, 'facturas').filter((f) => ['emitida', 'anulada'].includes(f.estado) && enRango(f.fecha, desde, hasta));
  const filas = [];
  const claves = new Set();
  let prueba = 0, sinCae = 0;
  for (const f of propias) {
    const cod = Number(f.cbte_tipo) || CODIGO_DE_LETRA[f.tipo] || 6;
    const letra = letraDeCod(cod);
    const total = n0(f.total);
    let alic = f.alicuotas?.length ? f.alicuotas : letra === 'C' ? [] : [{ alic: f.alicuota || 21, neto: f.neto ?? r2(total / (1 + (f.alicuota || 21) / 100)), iva: f.iva ?? r2(total - total / (1 + (f.alicuota || 21) / 100)) }];
    alic = alic.map((g) => ({ alic: Number(g.alic), neto: r2(g.neto), iva: r2(g.iva) }));
    const pv = Number(f.punto_venta) || Number(String(f.numero || '').split('-')[0]) || 0;
    const nro = Number(f.nro) || Number(String(f.numero || '').split('-')[1]) || 0;
    if (f.ambiente === 'homologacion') prueba++;
    if (!f.cae) sinCae++;
    claves.add(`${cod}|${pv}|${nro}`);
    filas.push({
      fecha: dia(f.fecha), cbte_tipo: cod, comprobante: `${CBTE_NOMBRE[cod] || f.tipo} ${String(pv).padStart(5, '0')}-${String(nro).padStart(8, '0')}`, punto_venta: pv, nro,
      doc_tipo: Number(f.doc_tipo) || 99, doc_nro: f.doc_nro || '', nombre: f.cliente || '', cond_iva: f.cond_iva_receptor || null,
      alicuotas: alic, no_gravado: letra === 'C' ? r2(total - n0(f.imp_internos) - n0(f.percep_iva)) : 0, exento: 0, imp_internos: n0(f.imp_internos), percep_iva: n0(f.percep_iva), otros_tributos: 0, total,
      cae: f.cae || '', origen: f.ambiente === 'homologacion' ? 'Vixan (prueba)' : 'Vixan', prueba: f.ambiente === 'homologacion', factura_id: f.id, pedido: f.pedido || '',
    });
  }
  let duplicados = 0;
  for (const c of store.list(t, 'arca_comprobantes').filter((c) => c.origen === 'emitidos' && enRango(c.fecha, desde, hasta))) {
    if (claves.has(claveCbte(c))) { duplicados++; continue; }
    filas.push({
      fecha: c.fecha, cbte_tipo: c.cbte_tipo, comprobante: `${CBTE_NOMBRE[c.cbte_tipo] || c.cbte_tipo} ${String(c.punto_venta).padStart(5, '0')}-${String(c.nro).padStart(8, '0')}`, punto_venta: c.punto_venta, nro: c.nro,
      doc_tipo: Number(c.doc_tipo) || (soloDigitos(c.doc_nro).length === 11 ? 80 : 99), doc_nro: c.doc_nro, nombre: c.nombre, cond_iva: null,
      alicuotas: c.alicuotas || [], no_gravado: c.no_gravado, exento: c.exento, imp_internos: 0, percep_iva: 0, otros_tributos: c.otros_tributos, total: c.total,
      cae: c.cae, origen: 'ARCA (Mis Comprobantes Emitidos)', arca_id: c.id, aviso: c.alicuotas?.some((g) => g.deducida) ? 'Alícuota deducida del neto y el IVA' : '',
    });
  }
  filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.cbte_tipo - b.cbte_tipo || a.nro - b.nro);
  for (const r of filas) r.signo = esNCcod(r.cbte_tipo) ? -1 : 1;
  if (prueba) avisos.push(`${prueba} comprobante(s) de prueba (homologación): se ven acá pero no tienen validez fiscal ni van a los archivos de ARCA.`);
  if (sinCae) avisos.push(`${sinCae} comprobante(s) sin CAE: no son fiscales.`);
  if (duplicados) avisos.push(`${duplicados} comprobante(s) de Mis Comprobantes Emitidos también están en Vixan (mismo tipo, punto de venta y número): van una sola vez, con los datos de Vixan.`);
  const fuera = filas.filter((r) => r.arca_id).length;
  if (fuera) avisos.push(`${fuera} comprobante(s) de ARCA que no están en Vixan entran al libro: lo facturado por fuera, por ejemplo con el facturador de Mercado Libre.`);
  return { filas, avisos, totales: totalesLibro(filas), numeracion: numeracion(filas) };
}
function totalesLibro(filas, compras = false) {
  const s = (fn) => r2(filas.reduce((a, r) => a + r.signo * fn(r), 0));
  const porAlic = {};
  for (const r of filas) for (const g of r.alicuotas) { const a = (porAlic[g.alic] ||= { neto: 0, iva: 0 }); a.neto = r2(a.neto + r.signo * g.neto); a.iva = r2(a.iva + r.signo * g.iva); }
  const t = { comprobantes: filas.length, neto: s((r) => r.alicuotas.reduce((a, g) => a + g.neto, 0)), iva: s((r) => r.alicuotas.reduce((a, g) => a + g.iva, 0)), no_gravado: s((r) => r.no_gravado + r.exento), imp_internos: s((r) => r.imp_internos || 0), total: s((r) => r.total), por_alicuota: porAlic };
  if (compras) Object.assign(t, { iva_computable: s((r) => r.iva_computable), iva_costo: s((r) => r.iva_costo), percep_iva: s((r) => r.percep_iva), percep_iibb: s((r) => r.percep_iibb), otros: s((r) => r.otros_tributos) });
  return t;
}
function numeracion(filas) {
  const g = new Map();
  for (const r of filas.filter((x) => x.cae && x.nro && !x.prueba)) { const k = `${r.cbte_tipo}|${r.punto_venta}`; if (!g.has(k)) g.set(k, []); g.get(k).push(r.nro); }
  const rangos = [], faltan = [];
  for (const [k, ns] of g) {
    const [tipo, pv] = k.split('|').map(Number);
    ns.sort((a, b) => a - b);
    rangos.push(`${CBTE_NOMBRE[tipo] || tipo} ${pv}: ${ns[0]} a ${ns[ns.length - 1]}`);
    const set = new Set(ns);
    for (let n = ns[0]; n <= ns[ns.length - 1] && faltan.length < 200; n++) if (!set.has(n)) faltan.push(`${abrevCbte(tipo)} ${String(pv).padStart(5, '0')}-${String(n).padStart(8, '0')}`);
  }
  return { rangos, faltan };
}

// ════════════════ Libro IVA Compras ════════════════
// Datos de factura de una compra (orden de compra recibida). Si no los tiene, no entra al libro.
function datosFacturaOrden(o) {
  if (!o.cbte_tipo) return null;
  const cod = Number(o.cbte_tipo) || CODIGO_DE_LETRA[o.cbte_tipo] || null;
  if (o.cbte_tipo === 'X') return { cod: 'X' };
  if (!cod) return null;
  const alicuotas = [[21, o.neto_21, o.iva_21], [10.5, o.neto_105, o.iva_105], [27, o.neto_27, o.iva_27]]
    .filter(([, n]) => n0(n)).map(([alic, n, i]) => ({ alic, neto: r2(n), iva: i !== undefined && i !== null && i !== '' ? r2(i) : r2(n0(n) * alic / 100) }));
  const exento = n0(o.exento), percepIva = n0(o.percep_iva), percepIibb = n0(o.percep_iibb), otros = n0(o.otros_tributos);
  const total = r2(alicuotas.reduce((a, g) => a + g.neto + g.iva, 0) + exento + percepIva + percepIibb + otros);
  return { cod, alicuotas, exento, percep_iva: percepIva, percep_iibb: percepIibb, jurisdiccion: o.jurisdiccion_iibb || '', otros, total };
}
function comprasLibro(t, { desde, hasta } = {}) {
  const cfg = configDe(t);
  const avisos = [];
  const filas = [];
  let sinDatos = 0, montoSinDatos = 0, noFiscales = 0, montoX = 0;
  const claves = new Set();
  for (const o of store.list(t, 'ordenes_compra')) {
    const fechaLibro = cfg.compras_mes_orden ? dia(o.fecha) : dia(o.fecha_factura || o.fecha);
    if (!enRango(fechaLibro, desde, hasta)) continue;
    const d = datosFacturaOrden(o);
    if (!d) { sinDatos++; montoSinDatos += n0(o.total); continue; }
    if (d.cod === 'X') { noFiscales++; montoX += n0(o.total); continue; }
    const letra = letraDeCod(d.cod);
    const computable = !cfg.iva_compras_solo_am || ['A', 'M', 'D'].includes(letra);
    const ivaTot = r2(d.alicuotas.reduce((a, g) => a + g.iva, 0));
    const pv = Number(o.punto_venta_factura) || 0, nro = Number(o.nro_comprobante) || Number(String(o.nro_factura || '').split('-').pop().replace(/\D/g, '')) || 0;
    const cuit = soloDigitos(o.cuit_proveedor);
    claves.add(`${d.cod}|${pv}|${nro}|${cuit}`);
    filas.push({
      fecha: fechaLibro, cbte_tipo: d.cod, comprobante: `${abrevCbte(d.cod)} ${String(pv).padStart(5, '0')}-${String(nro).padStart(8, '0')}`, punto_venta: pv, nro, doc_tipo: 80, doc_nro: cuit, nombre: o.proveedor || '',
      alicuotas: d.alicuotas, no_gravado: 0, exento: d.exento, percep_iva: d.percep_iva, percep_iibb: d.percep_iibb, jurisdiccion: d.jurisdiccion, imp_internos: 0, otros_tributos: d.otros, total: d.total,
      iva_computable: computable ? ivaTot : 0, iva_costo: computable ? 0 : ivaTot, origen: 'Orden de compra', orden_id: o.id, aviso: !cuit ? 'Falta el CUIT del proveedor' : (Math.abs(d.total - n0(o.total)) > 1 ? `El total de la orden (${n0(o.total).toFixed(2)}) no coincide con el de la factura` : ''),
    });
  }
  const imp = imputacionDe(t);
  let soloArca = 0, montoArca = 0, otrosSinDetalle = 0;
  for (const c of store.list(t, 'arca_comprobantes').filter((x) => x.origen === 'recibidos' && enRango(x.fecha, desde, hasta))) {
    if (claves.has(`${c.cbte_tipo}|${Number(c.punto_venta)}|${Number(c.nro)}|${c.doc_nro}`)) continue;
    const letra = letraDeCod(c.cbte_tipo);
    const computable = !cfg.iva_compras_solo_am || ['A', 'M', 'D'].includes(letra);
    const ivaTot = r2((c.alicuotas || []).reduce((a, g) => a + g.iva, 0));
    soloArca++; montoArca += c.total;
    if (c.otros_tributos) otrosSinDetalle++;
    filas.push({
      fecha: c.fecha, cbte_tipo: c.cbte_tipo, comprobante: `${abrevCbte(c.cbte_tipo)} ${String(c.punto_venta).padStart(5, '0')}-${String(c.nro).padStart(8, '0')}`, punto_venta: c.punto_venta, nro: c.nro, doc_tipo: 80, doc_nro: c.doc_nro, nombre: c.nombre,
      alicuotas: c.alicuotas || [], no_gravado: c.no_gravado, exento: c.exento, percep_iva: 0, percep_iibb: 0, imp_internos: 0, otros_tributos: c.otros_tributos, total: c.total,
      iva_computable: computable ? ivaTot : 0, iva_costo: computable ? 0 : ivaTot, origen: 'ARCA', arca_id: c.id, cuenta: imp.proveedores[c.doc_nro] || null,
      aviso: `Sólo en ARCA: no está en ninguna orden (gasto, servicio o compra sin orden).${c.otros_tributos ? ` Otros tributos ${c.otros_tributos.toFixed(2)}: ARCA no dice qué son, así que no se computan como crédito.` : ''}`,
    });
  }
  filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nro - b.nro);
  for (const r of filas) r.signo = esNCcod(r.cbte_tipo) ? -1 : 1;
  if (sinDatos) avisos.push(`${sinDatos} orden(es) del período sin datos de factura (tipo de comprobante e importes): no entran al libro. Total ${r2(montoSinDatos).toFixed(2)}. Se cargan en Reabastecimiento → Compras recibidas.`);
  if (noFiscales) avisos.push(`${noFiscales} comprobante(s) X (no fiscales) por ${r2(montoX).toFixed(2)}: no entran al libro. Siguen en el costo de la mercadería y en la cuenta corriente del proveedor.`);
  if (soloArca) avisos.push(`${soloArca} comprobante(s) que están en ARCA (Mis Comprobantes Recibidos) y en ninguna orden entran al libro con los datos de ARCA, por ${r2(montoArca).toFixed(2)}: gastos, servicios y compras sin orden.`);
  if (cfg.iva_compras_solo_am) avisos.push('El IVA de compras se computa sólo con factura A, M o despacho de importación; con B o C queda en el costo.');
  return { filas, avisos, totales: totalesLibro(filas, true), sin_datos: sinDatos };
}

module.exports = { PLAN_MODELO, CONCEPTOS, SUGERENCIAS, CBTE_NOMBRE, CODIGO_DE_LETRA, planDe, imputacionDe, configDe, padreDe, esRubro, ventasLibro, comprasLibro, importarMisComprobantes, leerMisComprobantes, letraDeCod, esNCcod, abrevCbte, ALIC_ID, datosFacturaOrden };
