// Vixan — Contabilidad: resumen, posición mensual, libros IVA, libro diario, mayor, balance, bienes de uso,
// bancos, cheques, préstamos, provincias (IIBB), plan de cuentas y tipos de impuesto.
(() => {
const { esc, badge } = VG;
const m2 = VG.m2;
const fecha = VG.date;
const n0 = (v) => Number(v) || 0;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => (n0(v) ? VG.m2(v).replace('$ ', '') : '—');
const kpi = (label, value, sub = '', tone = '') => `<div class="card kpi ${tone}"><div class="l">${esc(label)}</div><div class="v">${value}</div><div class="s">${sub}</div></div>`;
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesTxt = (ym) => `${MES[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const leerArchivo = (f) => new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => mal(new Error('No se pudo leer el archivo')); r.readAsDataURL(f); });
const elegirArchivo = (accept) => new Promise((ok) => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => ok(i.files[0] || null); i.click(); });
const avisos = (xs) => (xs || []).map((a) => `<div class="note warn small">${esc(a)}</div>`).join('');
const exportar = (nombre, cols, filas) => { VG.exportExcel(nombre, cols, filas); };
let PLAN = null;
async function plan() { if (!PLAN) PLAN = await VG.get('/api/contabilidad/plan'); return PLAN; }
const nombreCta = (c) => PLAN?.cuentas.find((x) => x.codigo === c)?.nombre || '';
// Selector de cuentas imputables con búsqueda
function selectorCuenta(valor = '', { soloImputables = true, vacio = '' } = {}) {
  const cs = PLAN.cuentas.filter((c) => (!soloImputables || !c.rubro) && c.activa !== false);
  return `<select data-cta>${vacio ? `<option value="">${esc(vacio)}</option>` : ''}${cs.map((c) => `<option value="${c.codigo}" ${c.codigo === valor ? 'selected' : ''}>${c.codigo} ${esc(c.nombre)}</option>`).join('')}</select>`;
}

// Esqueleto de cada pestaña: barra de período + contenido que se vuelve a pintar
function pestaña(el, dibujar, opciones = {}) {
  const cuerpo = VG.h('<div><div class="muted small">Cargando…</div></div>');
  const recargar = async () => { cuerpo.innerHTML = '<div class="muted small">Cargando…</div>'; try { await dibujar(cuerpo, recargar); } catch (e) { cuerpo.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; } };
  if (!opciones.sinPeriodo) el.appendChild(VG.barraPeriodo(recargar, opciones));
  el.appendChild(cuerpo);
  recargar();
  return recargar;
}
const qp = () => VG.qs(VG.periodo);
// Tabla simple con exportación
function tabla(cols, filas, { pie = null, vacio = 'Sin datos en el período.', max = 2000, clase = '' } = {}) {
  const head = `<tr>${cols.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr>`;
  const cuerpo = filas.slice(0, max).map((r) => `<tr class="${r._clase || ''}">${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.fmt ? c.fmt(r[c.k], r) : esc(r[c.k] ?? '')}</td>`).join('')}</tr>`).join('');
  return `<div class="tw ${clase}"><table class="t"><thead>${head}</thead><tbody>${cuerpo || `<tr><td colspan="${cols.length}" class="empty">${vacio}</td></tr>`}</tbody>${pie ? `<tfoot>${pie}</tfoot>` : ''}</table>${filas.length > max ? `<p class="small muted">Se muestran ${max} de ${filas.length}; el export lleva todo.</p>` : ''}</div>`;
}
const botonesExport = (id) => `<button class="btn small" data-xls="${id}">Exportar Excel</button><button class="btn small" data-csv="${id}">CSV</button>`;
function conectarExport(el, id, nombre, cols, filas) {
  const c = cols.map((x) => ({ label: x.label, get: (r) => (x.exp ? x.exp(r) : r[x.k]) }));
  el.querySelector(`[data-xls="${id}"]`)?.addEventListener('click', () => exportar(nombre, c, filas));
  el.querySelector(`[data-csv="${id}"]`)?.addEventListener('click', () => VG.exportCSV(nombre, c, filas));
}

// ═════════ Resumen ═════════
function tabResumen(el) {
  pestaña(el, async (c) => {
    const r = await VG.get(`/api/contabilidad/resumen?${qp()}`);
    const k = r.kpis;
    c.innerHTML = `<div class="grid g4" style="margin-bottom:12px">
      ${kpi(`IVA ${k.iva_mes}`, m2(Math.abs(k.iva)), k.iva >= 0 ? 'a pagar según el sistema' : 'saldo a favor', k.iva > 0 ? 'warn' : 'ok')}
      ${kpi('Créditos de IIBB', m2(k.creditos_iibb), 'percepciones y retenciones sufridas: se descuentan en la DDJJ', 'info')}
      ${kpi('Ventas sin factura', m2(k.ventas_sin_factura), 'pedidos del período sin factura con CAE', k.ventas_sin_factura ? 'warn' : 'ok')}
      ${kpi('Datos de ARCA', esc(k.datos_arca), 'Mis Comprobantes Emitidos y Recibidos', k.datos_arca === 'Sin cargar' ? 'err' : '')}</div>
      <div class="card" style="margin-bottom:12px"><h3>Lo que hay que hacer</h3>${r.tareas.length ? r.tareas.map((t) => `<div style="display:flex;gap:12px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #f1f5f9"><div style="flex:1"><b>${esc(t.titulo)}</b><div class="small muted">${esc(t.detalle)}</div></div>${t.monto ? `<b>${m2(t.monto)}</b>` : ''}</div>`).join('') : `${badge('Todo al día', 'ok')} No hay pendientes en el período.`}</div>
      <div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">Mes por mes</h3><span><button class="btn small" data-rep>Reporte para el contador</button> ${botonesExport('mm')}</span></div>
      ${tabla(COLS_MM, r.mes_por_mes)}</div>`;
    conectarExport(c, 'mm', 'contabilidad-mes-por-mes', COLS_MM, r.mes_por_mes);
    c.querySelector('[data-rep]').onclick = () => reporteContador(r);
  });
}
const COLS_MM = [{ k: 'mes_txt', label: 'Mes' }, { k: 'facturado', label: 'Facturado con CAE', num: true, fmt: num }, { k: 'ventas_sistema', label: 'Ventas del sistema', num: true, fmt: num },
  { k: 'iva', label: 'IVA (sistema)', num: true, fmt: (v) => `${num(Math.abs(v))} <span class="small muted">${v >= 0 ? 'a pagar' : 'a favor'}</span>`, exp: (r) => r.iva }, { k: 'creditos_iibb', label: 'Créditos IIBB', num: true, fmt: num }, { k: 'a_revisar', label: 'Ventas sin factura', num: true, fmt: num }];
async function reporteContador(r) {
  const [pos, ven, com] = await Promise.all([VG.get(`/api/contabilidad/posicion?${qp()}`), VG.get(`/api/contabilidad/ventas?${qp()}`), VG.get(`/api/contabilidad/compras?${qp()}`)]);
  const w = window.open('', '_blank');
  const fila = (l, v) => `<tr><td>${esc(l)}</td><td style="text-align:right">${m2(v)}</td></tr>`;
  const u = pos.ultimo || {};
  w.document.write(`<html><head><title>Reporte para el contador</title><style>body{font-family:system-ui;font-size:12px;padding:24px;max-width:900px;margin:auto}table{width:100%;border-collapse:collapse;margin:8px 0 18px}td,th{border-bottom:1px solid #ddd;padding:5px;text-align:left}th{background:#f1f5f9}h2{margin-bottom:0}</style></head><body>
    <h1>Reporte para el contador</h1><div>${esc(VG.app.tenant?.nombre || '')} · Período ${fecha(VG.periodo.desde)} a ${fecha(VG.periodo.hasta)} · generado ${new Date().toLocaleString('es-AR')}</div>
    <h2>Posición de IVA ${u.mes ? mesTxt(u.mes) : ''}</h2><table>${fila('Débito fiscal (ventas)', u.debito)}${fila('Crédito fiscal (compras computables)', u.credito)}${fila('Saldo técnico a favor del mes anterior', u.favor_anterior)}${fila('Percepciones de IVA sufridas', u.percep_iva)}${fila('Retenciones de IVA sufridas', u.ret_iva)}${fila('Saldo de libre disponibilidad anterior', u.libre_anterior)}${fila('IVA a pagar', u.a_pagar)}${fila('Saldo a favor que pasa al mes siguiente', (u.favor_siguiente || 0) + (u.libre_siguiente || 0))}</table>
    <h2>Libro IVA Ventas</h2><table>${fila('Comprobantes', ven.totales.comprobantes).replace('$ ', '')}${fila('Neto gravado', ven.totales.neto)}${fila('IVA débito', ven.totales.iva)}${fila('No gravado / exento', ven.totales.no_gravado)}${fila('Impuestos internos', ven.totales.imp_internos)}${fila('Total', ven.totales.total)}</table>
    <h2>Libro IVA Compras</h2><table>${fila('Comprobantes', com.totales.comprobantes).replace('$ ', '')}${fila('Neto gravado', com.totales.neto)}${fila('IVA computable', com.totales.iva_computable)}${fila('IVA a costo', com.totales.iva_costo)}${fila('Percepciones de IVA', com.totales.percep_iva)}${fila('Percepciones de IIBB', com.totales.percep_iibb)}${fila('Total', com.totales.total)}</table>
    <h2>Ingresos Brutos ${u.mes ? mesTxt(u.mes) : ''}</h2><table>${fila('Base: ventas netas del mes', u.base_iibb)}${fila('Percepciones de IIBB sufridas', u.percep_iibb)}${fila('Retenciones de IIBB sufridas', u.ret_iibb)}</table>
    <h2>Pendientes</h2><ul>${r.tareas.map((t) => `<li><b>${esc(t.titulo)}</b>: ${esc(t.detalle)}</li>`).join('') || '<li>Sin pendientes.</li>'}</ul>
    <h2>Avisos de los libros</h2><ul>${[...ven.avisos, ...com.avisos].map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
    <script>onload=()=>print()<\/script></body></html>`);
  w.document.close();
}

// ═════════ Posición mensual ═════════
const FILAS_POS = [
  ['IVA'], ['debito', 'Débito fiscal (ventas)'], ['credito', 'Crédito fiscal (compras computables)', -1], ['credito_ordenes', '· de compras con orden', -1, true], ['credito_arca', '· de comprobantes que sólo están en ARCA', -1, true],
  ['favor_anterior', 'Saldo técnico a favor del mes anterior', -1], ['tecnico', 'Saldo técnico (negativo: a favor)'], ['percep_iva', 'Percepciones de IVA sufridas', -1], ['ret_iva', 'Retenciones de IVA sufridas', -1],
  ['libre_anterior', 'Saldo de libre disponibilidad del mes anterior', -1], ['a_pagar', 'IVA a pagar', 1, false, true], ['favor_siguiente', 'Saldo técnico a favor que pasa al mes siguiente'], ['libre_siguiente', 'Libre disponibilidad que pasa al mes siguiente'],
  ['A DEPOSITAR COMO AGENTE'], ['imp_internos', 'Impuestos internos facturados'],
  ['INGRESOS BRUTOS'], ['base_iibb', 'Base: ventas netas del mes'], ['percep_iibb', 'Percepciones de IIBB sufridas'], ['ret_iibb', 'Retenciones de IIBB sufridas'],
  ['OTROS'], ['ganancias', 'Retenciones de Ganancias / SUSS sufridas'], ['iva_costo', 'IVA no computable (factura B, C: queda en el costo)'], ['imp_costo', 'Otros tributos de compras (costo)'],
];
function tabPosicion(el) {
  pestaña(el, async (c) => {
    const p = await VG.get(`/api/contabilidad/posicion?${qp()}`);
    const u = p.ultimo;
    if (!u) { c.innerHTML = '<div class="note">Sin datos todavía.</div>'; return; }
    const ms = p.meses;
    c.innerHTML = `<div class="grid g4" style="margin-bottom:12px">
      ${kpi(`IVA a pagar (${mesTxt(u.mes)})`, m2(u.a_pagar), u.favor_siguiente + u.libre_siguiente ? `Saldo a favor ${m2(u.favor_siguiente + u.libre_siguiente)}` : 'Sin saldo a favor', u.a_pagar ? 'warn' : 'ok')}
      ${kpi('Débito fiscal', m2(u.debito), `${u.ventas} comprobantes de venta`)}${kpi('Crédito fiscal', m2(u.credito), `${u.compras} comprobantes de compra`)}
      ${kpi('Créditos de IIBB', m2(u.percep_iibb + u.ret_iibb), `${Object.keys(p.iibb_jurisdicciones).length} jurisdicciones`, 'info')}</div>
      <div class="card"><div style="display:flex;justify-content:flex-end">${botonesExport('pos')}</div>
      <div class="tw"><table class="t"><thead><tr><th>Concepto</th>${ms.map((m) => `<th class="num">${mesTxt(m.mes)}</th>`).join('')}</tr></thead><tbody>
      ${FILAS_POS.map(([k, l, s = 1, sub, fuerte]) => (!l ? `<tr><td colspan="${ms.length + 1}"><b class="small">${k}</b></td></tr>` : `<tr><td class="${sub ? 'small muted' : ''}" style="${sub ? 'padding-left:22px' : ''}">${fuerte ? `<b>${esc(l)}</b>` : esc(l)}</td>${ms.map((m) => `<td class="num">${fuerte ? '<b>' : ''}${m2(s * m[k])}${fuerte ? '</b>' : ''}</td>`).join('')}</tr>`)).join('')}
      </tbody></table></div></div>
      ${Object.keys(p.iibb_jurisdicciones).length ? `<div class="card" style="margin-top:12px"><h3>Créditos de IIBB por jurisdicción (${mesTxt(u.mes)})</h3>${tabla([{ k: 'j', label: 'Jurisdicción' }, { k: 'percepciones', label: 'Percepciones', num: true, fmt: num }, { k: 'retenciones', label: 'Retenciones', num: true, fmt: num }], Object.entries(p.iibb_jurisdicciones).map(([j, x]) => ({ j, ...x })))}</div>` : ''}`;
    const cols = [{ label: 'Concepto', get: (r) => r.l }, ...ms.map((m) => ({ label: mesTxt(m.mes), get: (r) => r[m.mes] }))];
    const filas = FILAS_POS.filter((x) => x[1]).map(([k, l, s = 1]) => ({ l, ...Object.fromEntries(ms.map((m) => [m.mes, r2(s * m[k])])) }));
    c.querySelector('[data-xls="pos"]').onclick = () => exportar('posicion-iva', cols, filas);
    c.querySelector('[data-csv="pos"]').onclick = () => VG.exportCSV('posicion-iva', cols, filas);
  });
}

// ═════════ Libros IVA ═════════
const alic = (r, a, k) => r.alicuotas.filter((g) => Number(g.alic) === a).reduce((x, g) => x + g[k], 0);
function colsLibro(compras) {
  const s = (fn) => (v, r) => num(r.signo * fn(r));
  const e = (fn) => (r) => r2(r.signo * fn(r));
  return [
    { k: 'fecha', label: 'Fecha', fmt: fecha, exp: (r) => fecha(r.fecha) }, { k: 'comprobante', label: 'Comprobante' }, { k: 'doc_nro', label: compras ? 'CUIT' : 'CUIT/DNI' }, { k: 'nombre', label: 'Razón social', fmt: (v, r) => `${esc(v)}${r.aviso ? `<div class="small" style="color:#b45309">${esc(r.aviso)}</div>` : ''}` },
    { k: 'n21', label: 'Neto 21%', num: true, fmt: s((r) => alic(r, 21, 'neto')), exp: e((r) => alic(r, 21, 'neto')) }, { k: 'i21', label: 'IVA 21%', num: true, fmt: s((r) => alic(r, 21, 'iva')), exp: e((r) => alic(r, 21, 'iva')) },
    { k: 'n105', label: 'Neto 10,5%', num: true, fmt: s((r) => alic(r, 10.5, 'neto')), exp: e((r) => alic(r, 10.5, 'neto')) }, { k: 'i105', label: 'IVA 10,5%', num: true, fmt: s((r) => alic(r, 10.5, 'iva')), exp: e((r) => alic(r, 10.5, 'iva')) },
    { k: 'otras', label: 'Otras alícuotas', num: true, fmt: s((r) => r.alicuotas.filter((g) => ![21, 10.5].includes(Number(g.alic))).reduce((x, g) => x + g.neto + g.iva, 0)), exp: e((r) => r.alicuotas.filter((g) => ![21, 10.5].includes(Number(g.alic))).reduce((x, g) => x + g.neto + g.iva, 0)) },
    { k: 'ex', label: 'Exento / no gravado', num: true, fmt: s((r) => r.exento + r.no_gravado), exp: e((r) => r.exento + r.no_gravado) },
    ...(compras ? [{ k: 'perc', label: 'Percepciones', num: true, fmt: s((r) => r.percep_iva + r.percep_iibb), exp: e((r) => r.percep_iva + r.percep_iibb) }, { k: 'otros', label: 'Otros tributos', num: true, fmt: s((r) => r.otros_tributos), exp: e((r) => r.otros_tributos) }]
      : [{ k: 'ii', label: 'Imp. internos', num: true, fmt: s((r) => r.imp_internos || 0), exp: e((r) => r.imp_internos || 0) }]),
    { k: 'total', label: 'Total', num: true, fmt: s((r) => r.total), exp: e((r) => r.total) },
    ...(compras ? [{ k: 'iva_computable', label: 'IVA computable', num: true, fmt: s((r) => r.iva_computable), exp: e((r) => r.iva_computable) }] : [{ k: 'cae', label: 'CAE', fmt: (v) => (v ? `<code class="k">${esc(v)}</code>` : '—') }]),
    { k: 'origen', label: 'Origen', fmt: (v) => badge(v, /ARCA/.test(v) ? 'info' : /prueba/.test(v) ? 'warn' : '') },
  ];
}
function tabLibro(el, compras) {
  pestaña(el, async (c, recargar) => {
    const r = await VG.get(`/api/contabilidad/${compras ? 'compras' : 'ventas'}?${qp()}`);
    const t = r.totales;
    const origen = compras ? 'recibidos' : 'emitidos';
    c.innerHTML = `<div class="toolbar" style="flex-wrap:wrap"><input type="search" data-q placeholder="Buscar comprobante, CUIT o razón social" style="min-width:260px"><label class="check"><input type="checkbox" data-av> Sólo con avisos</label>
        <button class="btn" data-sub title="El archivo que baja ARCA en Mis Comprobantes → ${compras ? 'Recibidos' : 'Emitidos'} (CSV o Excel)">Subir Mis Comprobantes ${compras ? 'Recibidos' : 'Emitidos'} (ARCA)</button>
        <button class="btn" data-txt title="Comprobantes y alícuotas del mes para importar en IVA Simple / Libro IVA Digital">Archivos para IVA Simple</button>${botonesExport('lib')}</div>
      <div class="grid g4" style="margin-bottom:12px">${kpi('Comprobantes', t.comprobantes, compras ? `${r.sin_datos ? `${r.sin_datos} órdenes sin datos de factura` : 'órdenes con factura y lo de ARCA'}` : `${r.numeracion.rangos.slice(0, 3).join(' · ') || '—'}`)}
        ${kpi('Neto gravado', m2(t.neto), `Exento / no gravado ${m2(t.no_gravado)}`)}${kpi(compras ? 'IVA computable' : 'IVA débito', m2(compras ? t.iva_computable : t.iva), compras ? `IVA a costo ${m2(t.iva_costo)}` : `Imp. internos ${m2(t.imp_internos)}`, 'info')}
        ${kpi('Total', m2(t.total), compras ? `Percepciones IVA ${m2(t.percep_iva)} · IIBB ${m2(t.percep_iibb)}` : (r.numeracion.faltan.length ? `${r.numeracion.faltan.length} números faltan` : 'Sin números faltantes'), !compras && r.numeracion.faltan.length ? 'err' : '')}</div>
      ${avisos(r.avisos)}${!compras && r.numeracion.faltan.length ? `<div class="note warn small">Faltan en la numeración: ${esc(r.numeracion.faltan.slice(0, 20).join(', '))}${r.numeracion.faltan.length > 20 ? '…' : ''}</div>` : ''}
      <div data-t></div>`;
    const cols = colsLibro(compras);
    const pintar = () => {
      const q = c.querySelector('[data-q]').value.toLowerCase(); const av = c.querySelector('[data-av]').checked;
      const fs = r.filas.filter((x) => (!q || `${x.comprobante} ${x.doc_nro} ${x.nombre}`.toLowerCase().includes(q)) && (!av || x.aviso));
      c.querySelector('[data-t]').innerHTML = tabla(cols, fs.map((x) => ({ ...x, _clase: x.signo < 0 ? 'nc' : '' })), { pie: `<tr><td colspan="4"><b>${fs.length} comprobantes</b></td>${cols.slice(4).map((col) => (col.num ? `<td class="num"><b>${num(fs.reduce((a, x) => a + col.exp(x), 0))}</b></td>` : '<td></td>')).join('')}</tr>` });
    };
    c.querySelector('[data-q]').oninput = pintar; c.querySelector('[data-av]').onchange = pintar; pintar();
    conectarExport(c, 'lib', `libro-iva-${compras ? 'compras' : 'ventas'}-${VG.periodo.desde}`, cols, r.filas);
    c.querySelector('[data-sub]').onclick = async () => {
      const f = await elegirArchivo('.csv,.xlsx,.txt'); if (!f) return;
      try { const x = await VG.post('/api/contabilidad/mis-comprobantes', { origen, nombre: f.name, contenido: await leerArchivo(f) }); VG.toast(`Mis Comprobantes ${origen}: ${x.nuevos} nuevos, ${x.actualizados} actualizados (${x.meses.map(mesTxt).join(', ')})${x.errores.length ? ` · ${x.errores.length} filas con error` : ''}`); recargar(); } catch (e) { VG.toast(e.message, true); }
    };
    c.querySelector('[data-txt]').onclick = () => archivosIva();
  });
}
async function archivosIva() {
  const m = VG.periodo.desde.slice(0, 7);
  const body = VG.h(`<div><label class="small">Mes <input type="month" data-m value="${m}"></label><p class="small muted">Se generan los cuatro archivos del Libro IVA Digital (RG 4597) para importar en IVA Simple: comprobantes y alícuotas de ventas y de compras. Los comprobantes de prueba (homologación) no van. Revisalos con tu contador antes de presentar.</p><div data-r></div></div>`);
  VG.modal({ title: 'Archivos para IVA Simple', body, saveLabel: 'Descargar .zip', onSave: async () => {
    const mes = body.querySelector('[data-m]').value;
    const r = await VG.get(`/api/contabilidad/txt?mes=${mes}`);
    VG.download(`libro-iva-digital-${mes}.zip`, Uint8Array.from(atob(r.zip), (x) => x.charCodeAt(0)), 'application/zip');
    VG.toast(`Listo: ${r.ventas} comprobantes de venta y ${r.compras} de compra`);
  } });
}

// ═════════ Libro diario ═════════
function tabDiario(el) {
  pestaña(el, async (c, recargar) => {
    await plan();
    const d = await VG.get(`/api/contabilidad/diario?${qp()}`);
    c.innerHTML = `<div class="toolbar"><input type="search" data-q placeholder="Buscar concepto, cuenta o comprobante" style="min-width:260px"><select data-tipo><option value="">Todos los tipos</option>${Object.keys(d.por_tipo).map((t) => `<option>${esc(t)}</option>`).join('')}</select>
      <button class="btn primary" data-nuevo title="Para lo que el sistema no arma solo: sueldos, amortizaciones, pago de impuestos, apertura, ajustes">Nuevo asiento manual</button>${botonesExport('dia')}</div>
      <div class="grid g4" style="margin-bottom:12px">${kpi('Asientos', d.asientos.length, Object.entries(d.por_tipo).map(([k, v]) => `${k}: ${v}`).join(' · '))}${kpi('Debe', m2(d.debe), 'total del período')}${kpi('Haber', m2(d.haber), Math.abs(d.debe - d.haber) < 0.01 ? 'cuadra con el debe' : 'NO cuadra', Math.abs(d.debe - d.haber) < 0.01 ? 'ok' : 'err')}${kpi('Plan de cuentas', d.propio ? 'Propio' : 'Modelo', d.propio ? 'el que guardó la cuenta' : 'el plan modelo de Vixan')}</div>
      ${avisos(d.avisos)}<div data-t></div>`;
    const pintar = () => {
      const q = c.querySelector('[data-q]').value.toLowerCase(); const tp = c.querySelector('[data-tipo]').value;
      const xs = d.asientos.filter((a) => (!tp || a.tipo === tp) && (!q || `${a.concepto} ${a.referencia} ${a.lineas.map((l) => `${l.cuenta} ${d.nombres[l.cuenta]}`).join(' ')}`.toLowerCase().includes(q)));
      const max = 400;
      c.querySelector('[data-t]').innerHTML = `<div class="tw"><table class="t diario"><thead><tr><th>N.º</th><th>Fecha</th><th>Cuenta</th><th class="num">Debe</th><th class="num">Haber</th></tr></thead><tbody>${xs.slice(0, max).map((a) => `<tr class="as"><td><b>${a.n}</b></td><td>${fecha(a.fecha)}</td><td colspan="3"><b>${esc(a.tipo)}</b> · ${esc(a.concepto)}${a.referencia ? ` <span class="small muted">${esc(a.referencia)}</span>` : ''}${a.sugerida ? ` ${badge('cuenta sugerida', 'warn')}` : ''}${a.avisos.map((x) => ` ${badge(x, 'err')}`).join('')}${a.manual_id ? ` <button class="btn small" data-ed="${a.manual_id}">Editar</button> <button class="btn small danger" data-del="${a.manual_id}">Borrar</button>` : ''}</td></tr>
        ${a.lineas.map((l) => `<tr><td></td><td></td><td style="padding-left:${l.haber ? 34 : 12}px"><code class="k">${l.cuenta}</code> ${esc(d.nombres[l.cuenta] || '¿?')}${l.detalle ? ` <span class="small muted">${esc(l.detalle)}</span>` : ''}</td><td class="num">${l.debe ? num(l.debe) : ''}</td><td class="num">${l.haber ? num(l.haber) : ''}</td></tr>`).join('')}`).join('') || '<tr><td colspan="5" class="empty">Sin asientos en el período.</td></tr>'}</tbody></table>${xs.length > max ? `<p class="small muted">Se muestran ${max} de ${xs.length} asientos; el export lleva todos.</p>` : ''}</div>`;
      c.querySelectorAll('[data-ed]').forEach((b) => b.onclick = () => { asientoManual(d.asientos.find((a) => String(a.manual_id) === b.dataset.ed), recargar); });
      c.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!VG.confirm('¿Borrar este asiento manual?')) return; await VG.del(`/api/contabilidad/asientos/${b.dataset.del}`); VG.toast('Asiento borrado'); recargar(); });
    };
    c.querySelector('[data-q]').oninput = pintar; c.querySelector('[data-tipo]').onchange = pintar; pintar();
    const filas = d.asientos.flatMap((a) => a.lineas.map((l) => ({ n: a.n, fecha: a.fecha, tipo: a.tipo, concepto: a.concepto, cuenta: l.cuenta, nombre: d.nombres[l.cuenta], debe: l.debe, haber: l.haber })));
    const cols = [{ label: 'N.º', k: 'n' }, { label: 'Fecha', k: 'fecha', exp: (r) => fecha(r.fecha) }, { label: 'Tipo', k: 'tipo' }, { label: 'Concepto', k: 'concepto' }, { label: 'Cuenta', k: 'cuenta' }, { label: 'Nombre', k: 'nombre' }, { label: 'Debe', k: 'debe' }, { label: 'Haber', k: 'haber' }];
    conectarExport(c, 'dia', `libro-diario-${VG.periodo.desde}`, cols, filas);
    c.querySelector('[data-nuevo]').onclick = () => asientoManual(null, recargar);
  });
}
function asientoManual(a, alTerminar) {
  const lineas = a ? a.lineas.map((l) => ({ ...l })) : [{ cuenta: '', debe: '', haber: '' }, { cuenta: '', debe: '', haber: '' }];
  const body = VG.h(`<div><div class="form grid" style="grid-template-columns:1fr 2fr 1fr"><label>Fecha<input type="date" data-f value="${a ? a.fecha : VG.today()}"></label><label>Concepto<input data-c placeholder="Por ejemplo: sueldos de noviembre" value="${esc(a?.concepto || '')}"></label><label>Comprobante o referencia (opcional)<input data-r value="${esc(a?.referencia || '')}"></label></div>
    <table class="t" style="margin-top:10px"><thead><tr><th>Cuenta contable</th><th>Detalle (opcional)</th><th class="num">Debe</th><th class="num">Haber</th><th></th></tr></thead><tbody data-l></tbody><tfoot><tr><td colspan="2"><button class="btn small" data-add>Agregar renglón</button></td><td class="num" data-td></td><td class="num" data-th></td><td></td></tr></tfoot></table>
    <p class="small muted" data-msg>Cargá al menos dos renglones: uno al debe y uno al haber.</p></div>`);
  const tb = body.querySelector('[data-l]');
  const pintar = () => {
    tb.innerHTML = lineas.map((l, i) => `<tr data-i="${i}"><td>${selectorCuenta(l.cuenta, { vacio: 'Elegí la cuenta' })}</td><td><input data-k="detalle" value="${esc(l.detalle || '')}"></td><td class="num"><input type="number" step="0.01" data-k="debe" value="${l.debe || ''}" style="width:120px;text-align:right"></td><td class="num"><input type="number" step="0.01" data-k="haber" value="${l.haber || ''}" style="width:120px;text-align:right"></td><td><button class="btn small danger" data-x="${i}">Quitar</button></td></tr>`).join('');
    tb.querySelectorAll('tr').forEach((tr) => { const i = +tr.dataset.i; tr.querySelector('[data-cta]').onchange = (e) => { lineas[i].cuenta = e.target.value; }; tr.querySelectorAll('[data-k]').forEach((x) => x.oninput = () => { lineas[i][x.dataset.k] = x.value; totales(); }); });
    tb.querySelectorAll('[data-x]').forEach((b) => b.onclick = () => { lineas.splice(+b.dataset.x, 1); pintar(); });
    totales();
  };
  const totales = () => { const d = lineas.reduce((x, l) => x + n0(l.debe), 0), h = lineas.reduce((x, l) => x + n0(l.haber), 0); body.querySelector('[data-td]').textContent = num(d); body.querySelector('[data-th]').textContent = num(h); body.querySelector('[data-msg]').innerHTML = Math.abs(d - h) < 0.01 && d ? badge('Cuadra', 'ok') : `Diferencia: ${m2(d - h)}`; };
  body.querySelector('[data-add]').onclick = () => { lineas.push({ cuenta: '', debe: '', haber: '' }); pintar(); };
  pintar();
  VG.modal({ title: a ? `Editar asiento ${a.n}` : 'Nuevo asiento manual', body, wide: true, saveLabel: 'Guardar asiento', onSave: async () => {
    await VG.post('/api/contabilidad/asientos', { id: a?.manual_id, fecha: body.querySelector('[data-f]').value, concepto: body.querySelector('[data-c]').value, referencia: body.querySelector('[data-r]').value, lineas });
    VG.toast('Asiento guardado'); alTerminar?.();
  } });
}

// ═════════ Mayor y saldos ═════════
function tabMayor(el) {
  pestaña(el, async (c) => {
    const r = await VG.get(`/api/contabilidad/mayor?${qp()}`);
    c.innerHTML = `<div class="grid g3" style="margin-bottom:12px">${kpi('Debe', m2(r.debe), 'sumas del período')}${kpi('Haber', m2(r.haber), Math.abs(r.debe - r.haber) < 0.01 ? 'cuadra con el debe' : 'NO cuadra', Math.abs(r.debe - r.haber) < 0.01 ? 'ok' : 'err')}${kpi('Cuentas con movimiento', r.con_movimiento, `${r.asientos} asientos · tocá una cuenta para ver su mayor`)}</div>
      <div class="toolbar"><label class="check"><input type="checkbox" data-rub checked> Mostrar los rubros (cuentas madre)</label>${botonesExport('may')}<button class="btn small" data-pdf>Imprimir o PDF</button></div><div data-t></div>`;
    const cols = [{ k: 'codigo', label: 'Código', fmt: (v, x) => `<a href="#" data-cta="${v}">${v}</a>` }, { k: 'nombre', label: 'Cuenta', fmt: (v, x) => (x.rubro ? `<b>${esc(v)}</b>` : `${esc(v)} <span class="small muted">(${x.movimientos})</span>`) }, { k: 'debe', label: 'Debe', num: true, fmt: num }, { k: 'haber', label: 'Haber', num: true, fmt: num }, { k: 'saldo_deudor', label: 'Saldo deudor', num: true, fmt: num }, { k: 'saldo_acreedor', label: 'Saldo acreedor', num: true, fmt: num }];
    const pintar = () => {
      const fs = r.filas.filter((x) => c.querySelector('[data-rub]').checked || !x.rubro);
      c.querySelector('[data-t]').innerHTML = tabla(cols, fs);
      c.querySelectorAll('[data-cta]').forEach((a) => a.onclick = (e) => { e.preventDefault(); mayorCuenta(a.dataset.cta); });
    };
    c.querySelector('[data-rub]').onchange = pintar; pintar();
    conectarExport(c, 'may', `sumas-y-saldos-${VG.periodo.desde}`, cols, r.filas);
    c.querySelector('[data-pdf]').onclick = () => VG.exportPDF(`Sumas y saldos ${fecha(VG.periodo.desde)} a ${fecha(VG.periodo.hasta)}`, cols.map((x) => ({ label: x.label, get: (f) => (x.num ? num(f[x.k]) : f[x.k]) })), r.filas);
  });
}
async function mayorCuenta(cuenta) {
  const r = await VG.get(`/api/contabilidad/mayor?${qp()}&cuenta=${cuenta}`);
  const cols = [{ k: 'n', label: 'N.º' }, { k: 'fecha', label: 'Fecha', fmt: fecha }, { k: 'concepto', label: 'Concepto', fmt: (v, x) => `${esc(v)} <span class="small muted">${esc(x.tipo)}</span>` }, { k: 'debe', label: 'Debe', num: true, fmt: num }, { k: 'haber', label: 'Haber', num: true, fmt: num }, { k: 'saldo', label: 'Saldo', num: true, fmt: (v) => m2(v) }];
  VG.modal({ title: `Mayor de ${cuenta} ${r.nombre}`, wide: true, body: `<p>Saldo al inicio: <b>${m2(r.saldo_inicial)}</b> · saldo final: <b>${m2(r.saldo_final)}</b></p>${tabla(cols, r.movimientos)}` });
}

// ═════════ Balance ═════════
function tabBalance(el) {
  pestaña(el, async (c) => {
    const b = await VG.get(`/api/contabilidad/balance?hasta=${VG.periodo.hasta}`);
    const sec = (titulo, xs, total) => `<div class="card"><h3>${titulo} <span style="float:right">${m2(total)}</span></h3><table class="t">${xs.map((x) => `<tr><td style="padding-left:${(x.nivel - 1) * 12}px">${x.rubro ? `<b>${esc(x.nombre)}</b>` : esc(x.nombre)} <span class="small muted">${x.codigo}</span></td><td class="num">${x.rubro ? `<b>${m2(x.saldo)}</b>` : m2(x.saldo)}</td></tr>`).join('') || '<tr><td class="empty">Sin movimientos.</td></tr>'}</table></div>`;
    c.innerHTML = `<div class="grid g4" style="margin-bottom:12px">${kpi('Lo que tiene (activo)', m2(b.activo), `al ${fecha(b.al)}`)}${kpi('Lo que debe (pasivo)', m2(b.pasivo), '', 'warn')}${kpi('Patrimonio neto', m2(b.patrimonio + b.resultado), `capital y resultados ${m2(b.patrimonio)} + resultado ${m2(b.resultado)}`, 'info')}${kpi('Ecuación contable', b.cuadra ? 'Cuadra' : 'No cuadra', 'activo = pasivo + patrimonio', b.cuadra ? 'ok' : 'err')}</div>
      ${avisos(b.avisos)}<div class="grid g2">${sec('Activo', b.detalle.activo, b.activo)}<div>${sec('Pasivo', b.detalle.pasivo, b.pasivo)}<div style="height:12px"></div>${sec('Patrimonio neto', b.detalle.patrimonio, b.patrimonio)}<div style="height:12px"></div>${sec('Resultado (ingresos − egresos)', b.detalle.resultados, b.resultado)}</div></div>`;
  }, { soloHasta: true });
}

// ═════════ Bienes de uso ═════════
const RUBROS = { 'Muebles y útiles': 10, Instalaciones: 10, Rodados: 5, 'Equipos de computación': 3, Maquinarias: 10, Inmuebles: 50 };
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function tabBienes(el) {
  pestaña(el, async (c, recargar) => {
    await plan();
    const r = await VG.get(`/api/contabilidad/bienes?${qp()}`);
    const k = r.kpis;
    c.innerHTML = `<div class="toolbar" style="flex-wrap:wrap"><button class="btn primary" data-nuevo>+ Nuevo bien</button>
      <label class="small muted" title="Año de alta completo: el ejercicio en que se compra amortiza entero y el de la baja no. Es el criterio por defecto.">Amortización <select data-am><option value="anual" ${r.config.amortizacion === 'anual' ? 'selected' : ''}>Año de alta completo</option><option value="mensual" ${r.config.amortizacion === 'mensual' ? 'selected' : ''}>Mensual desde el mes de alta</option></select></label>
      <label class="small muted">Cierre del ejercicio <select data-ci>${MESES_L.map((m, i) => `<option value="${i + 1}" ${r.config.cierre_mes === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></label>${botonesExport('bu')}</div>
      <div class="grid g4" style="margin-bottom:12px">${kpi('Bienes vigentes', k.vigentes, 'cada uno con su cuenta en el plan')}${kpi('Valor de origen', m2(k.valor_origen), 'sin IVA, de los vigentes')}${kpi('Amortización acumulada', m2(k.amort_acumulada), `al ${fecha(r.al)}`)}${kpi('Valor residual', m2(k.residual), `amortización del período ${m2(k.amort_periodo)}`, 'info')}</div><div data-t></div>`;
    const cols = [{ k: 'cuenta', label: 'Cuenta', fmt: (v) => `<code class="k">${v}</code>` }, { k: 'nombre', label: 'Bien', fmt: (v, x) => `${esc(v)}<div class="small muted">${esc(x.rubro)} · ${x.vida_util} años · alta ${fecha(x.fecha_alta)}</div>` }, { k: 'valor_origen', label: 'Valor de origen', num: true, fmt: num }, { k: 'amort_periodo', label: 'Amort. del período', num: true, fmt: num }, { k: 'amort_acumulada', label: 'Amort. acumulada', num: true, fmt: num }, { k: 'residual', label: 'Residual', num: true, fmt: num },
      { k: 'estado', label: 'Estado', fmt: (v, x) => (v === 'vigente' ? badge('Vigente', 'ok') : v === 'anulado' ? badge('Anulado') : `${badge(v === 'vendido' ? 'Vendido' : 'Dado de baja', 'warn')} <span class="small">${fecha(x.fecha_baja)}</span>`) },
      { k: 'acc', label: '', fmt: (v, x) => (x.estado === 'vigente' ? `<button class="btn small" data-baja="${x.id}">Vender o dar de baja</button> <button class="btn small danger" data-anu="${x.id}">Anular</button>` : '') }];
    c.querySelector('[data-t]').innerHTML = tabla(cols, r.bienes, { vacio: 'Todavía no hay bienes de uso. Con "+ Nuevo bien" se carga cada uno, con su cuenta propia en el plan.' });
    conectarExport(c, 'bu', 'bienes-de-uso', cols.slice(0, 7), r.bienes);
    const cfg = async (b) => { await VG.post('/api/contabilidad/config', b); recargar(); };
    c.querySelector('[data-am]').onchange = (e) => cfg({ amortizacion: e.target.value });
    c.querySelector('[data-ci]').onchange = (e) => cfg({ cierre_mes: Number(e.target.value) });
    c.querySelector('[data-nuevo]').onclick = () => nuevoBien(recargar);
    c.querySelectorAll('[data-baja]').forEach((b) => b.onclick = () => bajaBien(r.bienes.find((x) => String(x.id) === b.dataset.baja), recargar));
    c.querySelectorAll('[data-anu]').forEach((b) => b.onclick = async () => { if (!VG.confirm('¿Anular este bien? Se borran su alta y sus amortizaciones del libro (para cargas por error).')) return; await VG.post(`/api/contabilidad/bienes/${b.dataset.anu}/anular`); recargar(); });
  });
}
function nuevoBien(alTerminar) {
  const contras = [['2.1.1.01.001', 'Proveedores (a pagar)'], ['1.1.1.01.001', 'Caja (pagado en efectivo)'], ['1.1.1.02.050', 'Banco (pagado por transferencia)'], ['3.3.2.00.001', 'Apertura: ya lo tenía (patrimonio)']];
  const body = VG.h(`<div class="form grid" style="grid-template-columns:1fr 1fr">
    <label style="grid-column:span 2">Nombre del bien<input data-n placeholder="Por ejemplo: Racks del depósito"></label>
    <label>Rubro<select data-ru>${Object.keys(RUBROS).map((x) => `<option>${x}</option>`).join('')}</select></label><label>Vida útil (años)<input type="number" data-v value="10"></label>
    <label>Fecha de alta<input type="date" data-f value="${VG.today()}"></label><label>Valor de origen (sin IVA)<input type="number" step="0.01" data-val></label>
    <label>Contra qué cuenta va el alta<select data-c>${contras.map(([v, l]) => `<option value="${v}">${l} · ${v}</option>`).join('')}</select></label>
    <label>Comprobante (opcional)<input data-comp placeholder="Factura A 0004-00000555"></label>
    <label>Fiscal<select data-fis><option value="blanco">En blanco (con factura fiscal)</option><option value="por fuera">Por fuera</option></select></label></div>`);
  body.querySelector('[data-ru]').onchange = (e) => { body.querySelector('[data-v]').value = RUBROS[e.target.value]; };
  VG.modal({ title: 'Nuevo bien de uso', body, saveLabel: 'Dar de alta', onSave: async () => {
    const q = (s) => body.querySelector(s).value;
    const b = await VG.post('/api/contabilidad/bienes', { nombre: q('[data-n]'), rubro: q('[data-ru]'), vida_util: Number(q('[data-v]')), fecha_alta: q('[data-f]'), valor_origen: Number(q('[data-val]')), contra: q('[data-c]'), comprobante: q('[data-comp]'), fiscal: q('[data-fis]') });
    PLAN = null; VG.toast(`Alta de ${b.nombre} en la cuenta ${b.cuenta}`); alTerminar?.();
  } });
}
function bajaBien(b, alTerminar) {
  const body = VG.h(`<div class="form grid" style="grid-template-columns:1fr 1fr"><label>Fecha<input type="date" data-f value="${VG.today()}"></label><label>Precio de venta sin IVA (0 si se da de baja)<input type="number" step="0.01" data-p value="0"></label>
    <label>Lo cobrado entra a<select data-c><option value="1.1.1.01.001">Caja</option><option value="1.1.1.02.050">Banco</option><option value="1.1.2.01.001">Deudores por ventas</option></select></label><label>Motivo<input data-m></label>
    <p class="small muted" style="grid-column:span 2;margin:0">Se da de baja el valor de origen y su amortización acumulada; la diferencia con el precio va a "Resultado por venta de bienes de uso".</p></div>`);
  VG.modal({ title: `Vender o dar de baja: ${b.nombre}`, body, saveLabel: 'Confirmar', onSave: async () => {
    const q = (s) => body.querySelector(s).value;
    await VG.post(`/api/contabilidad/bienes/${b.id}/baja`, { fecha: q('[data-f]'), precio: Number(q('[data-p]')), contra: q('[data-c]'), motivo: q('[data-m]') });
    VG.toast('Listo'); alTerminar?.();
  } });
}

// ═════════ Bancos ═════════
function tabBancos(el) {
  let bancoId = null;
  pestaña(el, async (c, recargar) => {
    const r = await VG.get(`/api/contabilidad/bancos?${VG.qs({ ...VG.periodo, banco_id: bancoId })}`);
    bancoId = r.banco_id;
    const k = r.kpis;
    if (!r.bancos.length) { c.innerHTML = '<div class="note">Primero cargá tus cuentas en Flujo de caja → Bancos y Mercado Pago.</div>'; return; }
    c.innerHTML = `<div class="toolbar" style="flex-wrap:wrap"><label class="small muted">Cuenta bancaria <select data-b>${r.bancos.map((b) => `<option value="${b.id}" ${b.id === bancoId ? 'selected' : ''}>${esc(b.nombre)} · ${b.movimientos ? `${b.movimientos} mov. (${fecha(b.desde)} a ${fecha(b.hasta)})` : 'sin extracto'}</option>`).join('')}</select></label>
      <button class="btn" data-sub title="El extracto que baja el home banking (CSV o Excel)">Subir extracto</button><button class="btn primary" data-altas title="Concilia los pendientes cuya sugerencia es de coincidencia alta (mismo importe, hasta 2 días, una sola opción)">Conciliar las de coincidencia alta (${k.altas})</button>${botonesExport('ban')}</div>
      <div class="grid g4" style="margin-bottom:12px">${kpi('Saldo según el extracto', k.saldo === null ? '—' : m2(k.saldo), k.saldo_fecha ? `al ${fecha(k.saldo_fecha)}` : '')}${kpi('Pendientes', k.pendientes, `entra ${m2(k.entra)} · sale ${m2(k.sale)}`, k.pendientes ? 'warn' : 'ok')}${kpi('Con sugerencia', k.con_sugerencia, `${k.altas} de coincidencia alta`, 'info')}${kpi('Conciliados', k.conciliados, `${k.ignorados} ignorados · ${r.filas.length} en el período`, 'ok')}</div>
      <div data-t></div><p class="small muted">Vixan busca en Flujo de caja, cobros de pedidos, cheques y préstamos algo con el mismo importe y hasta 2 días de diferencia. "Ignorar" sirve para comisiones o movimientos que no hace falta explicar.</p>`;
    const cols = [{ k: 'fecha', label: 'Fecha', fmt: fecha }, { k: 'descripcion', label: 'Descripción' }, { k: 'referencia', label: 'Referencia' }, { k: 'importe', label: 'Importe', num: true, fmt: (v) => `<b style="color:${v < 0 ? 'var(--err)' : 'var(--ok)'}">${m2(v)}</b>` }, { k: 'saldo', label: 'Saldo', num: true, fmt: (v) => (v === null || v === undefined ? '—' : num(v)) },
      { k: 'match', label: 'Con qué coincide', fmt: (v, m) => (m.estado === 'conciliado' ? `${badge('Conciliado', 'ok')} <span class="small">${esc(v?.detalle || '')}</span>` : m.estado === 'ignorado' ? badge('ignorado') : m.sugerencias?.length ? `<select data-sug="${m.id}">${m.sugerencias.map((s, i) => `<option value="${i}">${esc(s.detalle)} · ${fecha(s.fecha)}</option>`).join('')}</select> ${badge(m.coincidencia === 'alta' ? 'alta' : 'varias', m.coincidencia === 'alta' ? 'ok' : 'warn')}` : '<span class="small muted">sin sugerencia</span>'), exp: (m) => m.estado },
      { k: 'acc', label: '', fmt: (v, m) => (m.estado === 'pendiente' ? `${m.sugerencias?.length ? `<button class="btn small" data-con="${m.id}">Conciliar</button> ` : ''}<button class="btn small" data-ign="${m.id}">Ignorar</button>` : `<button class="btn small" data-des="${m.id}">Deshacer</button>`) }];
    c.querySelector('[data-t]').innerHTML = tabla(cols, r.filas, { vacio: 'Sin movimientos: subí el extracto del home banking.' });
    conectarExport(c, 'ban', 'extracto', cols.slice(0, 6), r.filas);
    c.querySelector('[data-b]').onchange = (e) => { bancoId = Number(e.target.value); recargar(); };
    c.querySelector('[data-sub]').onclick = async () => { const f = await elegirArchivo('.csv,.xlsx,.txt'); if (!f) return; try { const x = await VG.post('/api/contabilidad/bancos/extracto', { banco_id: bancoId, nombre: f.name, contenido: await leerArchivo(f) }); VG.toast(`${x.nuevos} movimientos nuevos (${fecha(x.desde)} a ${fecha(x.hasta)})${x.repetidos ? ` · ${x.repetidos} ya estaban` : ''}`); recargar(); } catch (e) { VG.toast(e.message, true); } };
    c.querySelector('[data-altas]').onclick = async () => { const x = await VG.post('/api/contabilidad/bancos/conciliar-altas', { banco_id: bancoId }); VG.toast(`${x.conciliados} conciliados`); recargar(); };
    const accion = async (id, match) => { try { await VG.post(`/api/contabilidad/bancos/${id}/conciliar`, { match }); recargar(); } catch (e) { VG.toast(e.message, true); } };
    c.querySelectorAll('[data-con]').forEach((b) => b.onclick = () => { const m = r.filas.find((x) => String(x.id) === b.dataset.con); const i = Number(c.querySelector(`[data-sug="${m.id}"]`).value); accion(m.id, m.sugerencias[i]); });
    c.querySelectorAll('[data-ign]').forEach((b) => b.onclick = () => accion(b.dataset.ign, 'ignorar'));
    c.querySelectorAll('[data-des]').forEach((b) => b.onclick = () => accion(b.dataset.des, null));
  });
}

// ═════════ Cheques ═════════
const ACCIONES_CH = { recibido: { en_cartera: [['depositar', 'Depositar'], ['endosar', 'Endosar'], ['rechazar', 'Rechazado'], ['anular', 'Anular']], depositado: [['cobrar', 'Acreditado'], ['rechazar', 'Rechazado']] }, emitido: { emitido: [['debitar', 'Debitado'], ['anular', 'Anular']] } };
function tabCheques(el) {
  let filtroTipo = '', filtroEstado = 'pendientes';
  pestaña(el, async (c, recargar) => {
    const r = await VG.get('/api/contabilidad/cheques');
    const k = r.kpis;
    const xs = r.cheques.filter((ch) => (!filtroTipo || ch.tipo === filtroTipo) && (filtroEstado === 'todos' || (filtroEstado === 'pendientes' ? ['en_cartera', 'depositado', 'emitido'].includes(ch.estado) : ch.estado === filtroEstado))).sort((a, b) => a.pago.localeCompare(b.pago));
    c.innerHTML = `<div class="grid g6" style="margin-bottom:12px">${kpi('En cartera', m2(k.en_cartera.monto), `${k.en_cartera.cantidad} cheques recibidos sin depositar`)}${kpi('Emitidos sin debitar', m2(k.emitidos.monto), `${k.emitidos.cantidad} cheques propios pendientes`, 'warn')}${kpi('A cobrar esta semana', m2(k.cobrar_semana.monto), `${k.cobrar_semana.cantidad} cheques`, 'ok')}${kpi('A cobrar este mes', m2(k.cobrar_mes.monto), `${k.cobrar_mes.cantidad} cheques`)}${kpi('A pagar esta semana', m2(k.pagar_semana.monto), `${k.pagar_semana.cantidad} cheques`, 'err')}${kpi('A pagar este mes', m2(k.pagar_mes.monto), `${k.pagar_mes.cantidad} cheques`)}</div>
      <div class="toolbar"><button class="btn primary" data-rec>Cargar cheque recibido</button><button class="btn" data-emi>Cargar cheque emitido</button>
      <select data-ft><option value="">Recibidos y emitidos</option><option value="recibido" ${filtroTipo === 'recibido' ? 'selected' : ''}>Sólo recibidos</option><option value="emitido" ${filtroTipo === 'emitido' ? 'selected' : ''}>Sólo emitidos</option></select>
      <select data-fe>${[['pendientes', 'Pendientes'], ['todos', 'Todos'], ['en_cartera', 'En cartera'], ['depositado', 'Depositado'], ['endosado', 'Endosado'], ['cobrado', 'Cobrado'], ['rechazado', 'Rechazado'], ['anulado', 'Anulado'], ['emitido', 'Emitido'], ['debitado', 'Debitado']].map(([v, l]) => `<option value="${v}" ${filtroEstado === v ? 'selected' : ''}>${l}</option>`).join('')}</select>${botonesExport('ch')}</div>
      <div class="card" style="margin-bottom:12px"><h3>Vencimientos de este mes</h3>${tabla([{ k: 'pago', label: 'Fecha de pago', fmt: fecha }, { k: 'tipo', label: 'A cobrar o a pagar', fmt: (v) => (v === 'recibido' ? badge('A cobrar', 'ok') : badge('A pagar', 'err')) }, { k: 'numero', label: 'N.º' }, { k: 'banco', label: 'Banco' }, { k: 'librador', label: 'Librador o beneficiario', fmt: (v, x) => esc(x.tipo === 'recibido' ? x.librador : x.beneficiario) }, { k: 'importe', label: 'Importe', num: true, fmt: m2 }], r.vencen_mes, { vacio: 'Nada que venza este mes.' })}</div>
      <div data-t></div><p class="small muted">Un cheque en cartera no es caja hasta que se deposita. Cada paso (recibir, depositar, endosar, rechazar, emitir, debitar) entra al libro diario con su asiento.</p>`;
    const cols = [{ k: 'tipo', label: 'Tipo', fmt: (v, x) => `${v === 'recibido' ? 'Recibido' : 'Emitido'} <span class="small muted">${esc(x.formato)}</span>` }, { k: 'numero', label: 'N.º' }, { k: 'banco', label: 'Banco' }, { k: 'librador', label: 'Librador o beneficiario', fmt: (v, x) => esc(x.tipo === 'recibido' ? x.librador || x.cliente : x.beneficiario) }, { k: 'emision', label: 'Emisión', fmt: fecha }, { k: 'pago', label: 'Pago', fmt: fecha }, { k: 'importe', label: 'Importe', num: true, fmt: m2 }, { k: 'estado_txt', label: 'Estado', fmt: (v) => badge(v, /Rechazado/.test(v) ? 'err' : /Cobrado|Debitado/.test(v) ? 'ok' : '') },
      { k: 'acc', label: '', fmt: (v, x) => (ACCIONES_CH[x.tipo][x.estado] || []).map(([a, l]) => `<button class="btn small ${a === 'anular' || a === 'rechazar' ? 'danger' : ''}" data-ac="${x.id}|${a}">${l}</button>`).join(' ') }];
    c.querySelector('[data-t]').innerHTML = tabla(cols, xs, { vacio: 'Ningún cheque con ese filtro.' });
    conectarExport(c, 'ch', 'cheques', cols.slice(0, 8), xs);
    c.querySelector('[data-ft]').onchange = (e) => { filtroTipo = e.target.value; recargar(); };
    c.querySelector('[data-fe]').onchange = (e) => { filtroEstado = e.target.value; recargar(); };
    c.querySelector('[data-rec]').onclick = () => cargarCheque('recibido', recargar);
    c.querySelector('[data-emi]').onclick = () => cargarCheque('emitido', recargar);
    c.querySelectorAll('[data-ac]').forEach((b) => b.onclick = () => {
      const [id, accion] = b.dataset.ac.split('|');
      const body = VG.h(`<div class="form grid" style="grid-template-columns:1fr 1fr"><label>Fecha<input type="date" data-f value="${VG.today()}"></label><label>Detalle (opcional)<input data-d placeholder="${accion === 'endosar' ? 'A quién se endosó' : accion === 'rechazar' ? 'Motivo del rechazo' : ''}"></label></div>`);
      VG.modal({ title: `${b.textContent} el cheque`, body, saveLabel: 'Confirmar', onSave: async () => { await VG.post(`/api/contabilidad/cheques/${id}/accion`, { accion, fecha: body.querySelector('[data-f]').value, detalle: body.querySelector('[data-d]').value }); VG.toast('Listo'); recargar(); } });
    });
  }, { sinPeriodo: true });
}
function cargarCheque(tipo, alTerminar) {
  const rec = tipo === 'recibido';
  const body = VG.h(`<div class="form grid" style="grid-template-columns:1fr 1fr 1fr">
    <label>Tipo de cheque<select data-k="formato"><option>Físico</option><option>ECHEQ</option></select></label><label>Banco${rec ? ' del cheque' : ''}<input data-k="banco"></label><label>Número<input data-k="numero"></label>
    <label>${rec ? 'Librador (quién lo firmó)' : 'Beneficiario'}<input data-k="${rec ? 'librador' : 'beneficiario'}"></label><label>CUIT ${rec ? 'del librador' : 'del beneficiario'}<input data-k="cuit"></label><label>Importe<input type="number" step="0.01" data-k="importe"></label>
    <label>Fecha de emisión<input type="date" data-k="emision" value="${VG.today()}"></label><label>Fecha de pago<input type="date" data-k="pago"></label>${rec ? `<label>Lo recibimos el<input type="date" data-k="recibido" value="${VG.today()}"></label>` : '<span></span>'}
    <label>${rec ? 'De dónde viene' : 'Para qué es'}<select data-k="origen">${rec ? '<option value="cliente">Cobro a un cliente (Deudores por ventas)</option><option value="caja">Ingreso de caja (no es de un cliente)</option>' : '<option value="proveedor">Pago a un proveedor</option><option value="gasto">Un gasto</option>'}</select></label>
    ${rec ? '<label>Cliente<input data-k="cliente" placeholder="Opcional"></label>' : '<span></span>'}<label>Referencia<input data-k="referencia" placeholder="Opcional (pedido, recibo u orden)"></label>
    <label style="grid-column:span 3">Observaciones<input data-k="obs"></label></div>`);
  VG.modal({ title: rec ? 'Cargar un cheque recibido (en cartera)' : 'Cargar un cheque emitido', body, wide: true, saveLabel: 'Guardar el cheque', onSave: async () => {
    const d = { tipo }; body.querySelectorAll('[data-k]').forEach((x) => { d[x.dataset.k] = x.type === 'number' ? Number(x.value) : x.value; });
    await VG.post('/api/contabilidad/cheques', d); VG.toast('Cheque guardado: entra al libro diario'); alTerminar?.();
  } });
}

// ═════════ Préstamos ═════════
function tabPrestamos(el) {
  pestaña(el, async (c, recargar) => {
    await plan();
    const r = await VG.get('/api/contabilidad/prestamos');
    const k = r.kpis;
    c.innerHTML = `<div class="grid g4" style="margin-bottom:12px">${kpi('Deuda por préstamos', m2(k.deuda), `${k.vigentes} préstamos vigentes (capital que falta pagar)`)}${kpi('Corto plazo (12 meses)', m2(k.corto), 'vence en los próximos 12 meses o ya venció', 'warn')}${kpi('Largo plazo', m2(k.largo), 'vence después de 12 meses')}${kpi('Cuotas de este mes', m2(k.mes), k.vencidas ? `${k.vencidas} cuota(s) vencidas sin pagar · ${m2(k.vencidas_monto)}` : 'capital, intereses, IVA y otros', k.vencidas ? 'err' : 'info')}</div>
      <div class="toolbar"><button class="btn primary" data-nuevo>Cargar préstamo</button></div><div data-t></div>
      <p class="small muted">El pago de cada cuota entra al libro diario separado: capital (baja la deuda), intereses (gastos financieros), IVA (crédito fiscal, si es en blanco) y otros cargos, contra el banco.</p>`;
    const cols = [{ k: 'acreedor', label: 'Banco o acreedor', fmt: (v, x) => `${esc(v)}${x.obs ? `<div class="small muted">${esc(x.obs)}</div>` : ''}` }, { k: 'fecha', label: 'Fecha', fmt: fecha }, { k: 'monto', label: 'Monto', num: true, fmt: m2 }, { k: 'tna', label: 'Tasa y sistema', fmt: (v, x) => `${v} % · ${x.sistema === 'frances' ? 'francés' : 'alemán'}` }, { k: 'pagas', label: 'Cuotas', fmt: (v, x) => `${v} de ${x.cantidad} pagas${x.vencidas ? ` · ${badge(`${x.vencidas} vencida(s)`, 'err')}` : ''}` }, { k: 'falta', label: 'Falta pagar', num: true, fmt: m2 }, { k: 'proxima', label: 'Próximo vencimiento', fmt: (v) => (v ? `${fecha(v.vto)} · ${m2(v.total)}` : '—') }, { k: 'estado', label: 'Estado', fmt: (v) => badge(v === 'vigente' ? 'Vigente' : v === 'cancelado' ? 'Cancelado' : 'Anulado', v === 'vigente' ? 'ok' : '') },
      { k: 'acc', label: '', fmt: (v, x) => `<button class="btn small" data-cu="${x.id}">Ver cuotas</button>${x.estado === 'vigente' ? ` <button class="btn small danger" data-anu="${x.id}">Anular</button>` : ''}` }];
    c.querySelector('[data-t]').innerHTML = tabla(cols, r.prestamos, { vacio: 'Sin préstamos cargados.' });
    c.querySelector('[data-nuevo]').onclick = () => nuevoPrestamo(recargar);
    c.querySelectorAll('[data-cu]').forEach((b) => b.onclick = () => cuotas(r.prestamos.find((x) => String(x.id) === b.dataset.cu), recargar));
    c.querySelectorAll('[data-anu]').forEach((b) => b.onclick = async () => { if (!VG.confirm('¿Anular el préstamo? Se borran del libro su alta y sus cuotas (para cargas por error).')) return; await VG.post(`/api/contabilidad/prestamos/${b.dataset.anu}/anular`); recargar(); });
  }, { sinPeriodo: true });
}
function nuevoPrestamo(alTerminar) {
  const pasivos = PLAN.cuentas.filter((c) => !c.rubro && c.codigo.startsWith('2.'));
  const body = VG.h(`<div><div class="form grid" style="grid-template-columns:1fr 1fr 1fr">
    <label>Banco o acreedor<input data-k="acreedor"></label><label>CUIT del banco<input data-k="cuit" placeholder="Opcional"></label><label>Fecha del préstamo<input type="date" data-k="fecha" value="${VG.today()}"></label>
    <label>Monto<input type="number" step="0.01" data-k="monto"></label><label>Tasa (TNA %)<input type="number" step="0.01" data-k="tna" placeholder="Por ejemplo 60"></label><label>Sistema<select data-k="sistema"><option value="frances">Francés (cuota fija)</option><option value="aleman">Alemán (capital fijo)</option></select></label>
    <label>Cuotas<input type="number" data-k="cuotas" value="12"></label><label>Primer vencimiento<input type="date" data-k="primer_vto"></label><label>Cuenta del pasivo<select data-k="cuenta_pasivo"><option value="">Automática (Préstamos bancarios)</option>${pasivos.map((c) => `<option value="${c.codigo}">${c.codigo} ${esc(c.nombre)}</option>`).join('')}</select></label>
    <label>Fiscal<select data-k="fiscal"><option value="blanco">En blanco</option><option value="por fuera">Por fuera</option></select></label><label>IVA sobre intereses<select data-k="iva_alic"><option value="10.5">10,5 %</option><option value="21">21 %</option><option value="0">Sin IVA</option></select></label><label>Otros cargos por cuota<input type="number" step="0.01" data-k="otros_cargos" placeholder="0,00 (seguro, comisión)"></label>
    <label style="grid-column:span 3">Observaciones<input data-k="obs"></label></div>
    <button class="btn small" data-sim>Ver cuotas</button><div data-res style="margin-top:8px"></div></div>`);
  const leer = () => { const d = {}; body.querySelectorAll('[data-k]').forEach((x) => { d[x.dataset.k] = x.type === 'number' || x.dataset.k === 'iva_alic' ? Number(x.value) : x.value; }); return d; };
  body.querySelector('[data-sim]').onclick = async () => { try { const cs = await VG.post('/api/contabilidad/prestamos/simular', leer()); body.querySelector('[data-res]').innerHTML = tablaCuotas(cs); } catch (e) { VG.toast(e.message, true); } };
  VG.modal({ title: 'Cargar un préstamo', body, wide: true, saveLabel: 'Guardar préstamo', onSave: async () => { await VG.post('/api/contabilidad/prestamos', leer()); VG.toast('Préstamo cargado: entra al libro diario'); alTerminar?.(); } });
}
const tablaCuotas = (cs, pagar) => tabla([{ k: 'n', label: 'Cuota' }, { k: 'vto', label: 'Vencimiento', fmt: fecha }, { k: 'capital', label: 'Capital', num: true, fmt: num }, { k: 'interes', label: 'Interés', num: true, fmt: num }, { k: 'iva', label: 'IVA', num: true, fmt: num }, { k: 'otros', label: 'Otros', num: true, fmt: num }, { k: 'total', label: 'Total', num: true, fmt: m2 }, { k: 'saldo', label: 'Saldo de capital', num: true, fmt: num },
  ...(pagar ? [{ k: 'pagada', label: '', fmt: (v, x) => (v ? `${badge('Pagada', 'ok')} <span class="small">${fecha(x.fecha_pago)}</span>` : `<button class="btn small" data-pag="${x.n}">Pagar</button>${x.vto < VG.today() ? ` ${badge('vencida', 'err')}` : ''}`) }] : [])], cs);
function cuotas(p, alTerminar) {
  const body = VG.h(`<div>${tablaCuotas(p.cuotas, p.estado === 'vigente')}</div>`);
  const m = VG.modal({ title: `Cuotas de ${p.acreedor}`, body, wide: true });
  body.querySelectorAll('[data-pag]').forEach((b) => b.onclick = async () => { const f = prompt('Fecha de pago (AAAA-MM-DD)', VG.today()); if (!f) return; try { await VG.post(`/api/contabilidad/prestamos/${p.id}/pagar`, { n: Number(b.dataset.pag), fecha: f }); m.close(); VG.toast('Cuota pagada: entra al libro diario'); alTerminar?.(); } catch (e) { VG.toast(e.message, true); } });
}

// ═════════ Provincias (Ingresos Brutos) ═════════
function tabProvincias(el) {
  pestaña(el, async (c, recargar) => {
    const r = await VG.get(`/api/contabilidad/provincias?${qp()}`);
    c.innerHTML = `<div class="toolbar"><button class="btn primary" data-g title="Guarda las alícuotas y las inscripciones que cambiaste">Guardar alícuotas</button>${botonesExport('pro')}</div>
      <div class="grid g4" style="margin-bottom:12px">${kpi('Neto vendido', m2(r.total), `${r.filas.reduce((a, x) => a + x.pedidos, 0)} ventas · ${r.filas.length} provincias`)}${kpi('IIBB estimado', m2(r.estimado), 'neto de cada provincia × su alícuota', 'info')}${kpi('Inscripta en', r.inscriptas, 'provincias (Convenio Multilateral)')}${kpi('Sin alícuota', r.filas.filter((x) => x.alicuota === null).length, 'provincias con ventas', r.filas.some((x) => x.alicuota === null) ? 'warn' : 'ok')}</div>
      ${avisos(r.avisos)}<div data-t></div><p class="small muted">La provincia sale de la dirección de cada venta (provincia o código postal). La alícuota es la de tu actividad en la ley impositiva de cada provincia; el estimado no reemplaza la DDJJ (CM03/CM05).</p>`;
    const cols = [{ k: 'nombre', label: 'Provincia', fmt: (v, x) => `<span class="small muted">${x.cod}</span> ${esc(v)}` }, { k: 'pedidos', label: 'Ventas', num: true }, { k: 'neto', label: 'Neto vendido', num: true, fmt: m2 }, { k: 'porcentaje', label: '% del total', num: true, fmt: (v) => `${VG.n(v)} %` },
      { k: 'inscripta', label: 'Inscripta', fmt: (v, x) => `<label class="check"><input type="checkbox" data-ins="${x.cod}" ${v ? 'checked' : ''}> ${v ? 'Sí' : 'No'}</label>`, exp: (x) => (x.inscripta ? 'Sí' : 'No') },
      { k: 'alicuota', label: 'Alícuota IIBB', num: true, fmt: (v, x) => `<input type="number" step="0.01" data-al="${x.cod}" value="${v ?? ''}" placeholder="Sin dato" style="width:80px;text-align:right"> %` }, { k: 'estimado', label: 'IIBB estimado', num: true, fmt: (v) => (v === null ? '—' : m2(v)) }];
    c.querySelector('[data-t]').innerHTML = tabla(cols, r.filas, { pie: `<tr><td><b>Total</b></td><td class="num"><b>${r.filas.reduce((a, x) => a + x.pedidos, 0)}</b></td><td class="num"><b>${m2(r.total)}</b></td><td class="num">100 %</td><td></td><td></td><td class="num"><b>${m2(r.estimado)}</b></td></tr>`, vacio: 'Sin ventas en el período.' });
    conectarExport(c, 'pro', 'iibb-por-provincia', cols, r.filas);
    c.querySelector('[data-g]').onclick = async () => {
      const alicuotas = {}; c.querySelectorAll('[data-al]').forEach((i) => { alicuotas[i.dataset.al] = i.value; });
      const inscriptas = {}; c.querySelectorAll('[data-ins]').forEach((i) => { inscriptas[i.dataset.ins] = i.checked; });
      await VG.post('/api/contabilidad/provincias', { alicuotas, inscriptas }); VG.toast('Alícuotas guardadas'); recargar();
    };
  });
}

// ═════════ Plan de cuentas ═════════
function tabPlan(el) {
  pestaña(el, async (c, recargar) => {
    PLAN = null; const p = await plan();
    const cuentas = p.cuentas.map((x) => ({ ...x }));
    c.innerHTML = `<div class="note small">${p.propio ? `Plan propio de la cuenta, guardado el ${fecha(p.guardado?.fecha)}${p.guardado?.por ? ` por ${esc(p.guardado.por)}` : ''}.` : 'Plan modelo de Vixan (todavía no lo cambiaste).'} ${cuentas.length} cuentas, ${cuentas.filter((x) => !x.rubro && x.activa !== false).length} imputables activas. Los rubros (código terminado en 000) suman a sus cuentas; los asientos van siempre a cuentas imputables.</div>
      <div class="card" style="margin-bottom:12px"><h3>Imputación de los asientos automáticos</h3><div data-imp></div><button class="btn primary small" data-gimp style="margin-top:8px">Guardar imputación</button></div>
      <div class="card"><div class="toolbar"><input type="search" data-q placeholder="Buscar código o nombre"><button class="btn" data-crear>Crear cuenta</button><button class="btn primary" data-guardar>Guardar cambios</button><button class="btn" data-desh>Deshacer cambios</button><button class="btn danger" data-modelo>Volver al plan modelo</button>${botonesExport('plan')}</div><div data-t></div></div>`;
    // Imputación
    const grupos = [...new Set(p.conceptos.map((x) => x.grupo))];
    c.querySelector('[data-imp]').innerHTML = `<table class="t"><thead><tr><th>Grupo</th><th>Concepto de los asientos automáticos</th><th>Cuenta</th></tr></thead><tbody>${p.conceptos.map((x) => `<tr><td class="small muted">${esc(x.grupo)}</td><td>${esc(x.nombre)}</td><td data-con="${x.k}">${selectorCuenta(x.cuenta)}</td></tr>`).join('')}</tbody></table>
      ${p.categorias.length ? `<h3 style="margin-top:14px">Gastos de Flujo de caja, por categoría</h3><table class="t"><thead><tr><th>Categoría</th><th>Cuenta</th></tr></thead><tbody>${p.categorias.map((x) => `<tr><td>${esc(x.categoria)}${x.cuenta ? '' : ` ${badge('sugerida', 'warn')}`}</td><td data-cat="${esc(x.categoria)}">${selectorCuenta(x.cuenta || x.sugerida)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${p.proveedores.length ? `<h3 style="margin-top:14px">Comprobantes que sólo están en ARCA, por proveedor</h3><table class="t"><thead><tr><th>Proveedor</th><th>Cuenta</th></tr></thead><tbody>${p.proveedores.map((x) => `<tr><td>${esc(x.nombre)} <span class="small muted">${x.cuit}</span></td><td data-prov="${x.cuit}">${selectorCuenta(x.cuenta || '', { vacio: 'La de "Gastos que sólo están en ARCA"' })}</td></tr>`).join('')}</tbody></table>` : ''}`;
    c.querySelector('[data-gimp]').onclick = async () => {
      const conceptos = {}, categorias = {}, proveedores = {};
      c.querySelectorAll('[data-con]').forEach((td) => { conceptos[td.dataset.con] = td.querySelector('select').value; });
      c.querySelectorAll('[data-cat]').forEach((td) => { categorias[td.dataset.cat] = td.querySelector('select').value; });
      c.querySelectorAll('[data-prov]').forEach((td) => { proveedores[td.dataset.prov] = td.querySelector('select').value || null; });
      await VG.post('/api/contabilidad/imputacion', { conceptos, categorias, proveedores }); PLAN = null; VG.toast('Imputación guardada'); recargar();
    };
    // Cuentas
    const pintar = () => {
      const q = c.querySelector('[data-q]').value.toLowerCase();
      const xs = cuentas.filter((x) => !q || `${x.codigo} ${x.nombre}`.toLowerCase().includes(q));
      c.querySelector('[data-t]').innerHTML = `<table class="t"><thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Activa</th><th></th></tr></thead><tbody>${xs.map((x) => `<tr><td style="padding-left:${x.codigo.split('.').filter((s) => !/^0+$/.test(s)).length * 8}px"><code class="k">${x.codigo}</code></td><td><input data-nom="${x.codigo}" value="${esc(x.nombre)}" style="width:100%;${x.rubro ? 'font-weight:700' : ''}"></td><td class="small">${x.rubro ? 'Rubro' : 'Imputable'}${x.bien ? ' · bien de uso' : ''}${x.usada ? ` <span title="La usan los asientos automáticos o manuales">•</span>` : ''}</td><td>${x.rubro ? '' : `<input type="checkbox" data-act="${x.codigo}" ${x.activa !== false ? 'checked' : ''}>`}</td><td>${!x.usada && !cuentas.some((y) => y.padre === x.codigo) ? `<button class="btn small danger" data-el="${x.codigo}" title="Eliminar la cuenta">Eliminar</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
      c.querySelectorAll('[data-nom]').forEach((i) => i.oninput = () => { cuentas.find((x) => x.codigo === i.dataset.nom).nombre = i.value; });
      c.querySelectorAll('[data-act]').forEach((i) => i.onchange = () => { cuentas.find((x) => x.codigo === i.dataset.act).activa = i.checked; });
      c.querySelectorAll('[data-el]').forEach((b) => b.onclick = () => { cuentas.splice(cuentas.findIndex((x) => x.codigo === b.dataset.el), 1); pintar(); });
    };
    c.querySelector('[data-q]').oninput = pintar; pintar();
    conectarExport(c, 'plan', 'plan-de-cuentas', [{ k: 'codigo', label: 'Código' }, { k: 'nombre', label: 'Nombre' }, { k: 'rubro', label: 'Rubro', exp: (x) => (x.rubro ? 'Rubro' : 'Imputable') }], cuentas);
    c.querySelector('[data-crear]').onclick = () => {
      const body = VG.h('<div class="form grid" style="grid-template-columns:1fr 2fr"><label>Código<input data-c placeholder="4.2.3.01.009"></label><label>Nombre<input data-n></label><p class="small muted" style="grid-column:span 2;margin:0">Formato 1.1.1.01.001. Si termina en 000 es un rubro (no recibe asientos).</p></div>');
      VG.modal({ title: 'Crear cuenta', body, saveLabel: 'Agregar', onSave: async () => {
        const codigo = body.querySelector('[data-c]').value.trim(); const nombre = body.querySelector('[data-n]').value.trim().toUpperCase();
        if (!/^\d\.\d\.\d\.\d{2}\.\d{3}$/.test(codigo)) throw new Error('El código tiene que tener el formato 1.1.1.01.001');
        if (cuentas.some((x) => x.codigo === codigo)) throw new Error('Ese código ya existe');
        if (!nombre) throw new Error('Falta el nombre');
        cuentas.push({ codigo, nombre, activa: true, rubro: codigo.endsWith('.000') }); cuentas.sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })); pintar(); VG.toast('Agregada: tocá Guardar cambios');
      } });
    };
    c.querySelector('[data-guardar]').onclick = async () => { try { await VG.post('/api/contabilidad/plan', { cuentas }); PLAN = null; VG.toast('Plan de cuentas guardado'); recargar(); } catch (e) { VG.toast(e.message, true); } };
    c.querySelector('[data-desh]').onclick = recargar;
    c.querySelector('[data-modelo]').onclick = async () => { if (!VG.confirm('¿Volver al plan modelo? Se pierden las cuentas creadas a mano y la imputación elegida.')) return; await VG.post('/api/contabilidad/plan/modelo'); PLAN = null; VG.toast('Plan modelo restaurado'); recargar(); };
  }, { sinPeriodo: true });
}

// ═════════ Tipos de impuesto ═════════
function tabImpuestos(el) {
  pestaña(el, async (c, recargar) => {
    const cfg = await VG.get('/api/contabilidad/config');
    const reglas = [
      ['IVA crédito fiscal', 'Compras (factura del proveedor)', cfg.iva_compras_solo_am ? 'Crédito fiscal sólo con factura A, M o despacho; con B, C o X va al costo' : 'Crédito fiscal con cualquier factura que discrimine IVA'],
      ['IVA débito fiscal', 'Ventas (facturas de Vixan y lo de ARCA)', 'Deuda con ARCA; se compensa con el crédito en la posición mensual'],
      ['Percepciones de IVA sufridas', 'Compras (en la orden) y Impuestos → Retenciones y percepciones', 'Pago a cuenta del IVA del mes'],
      ['Retenciones de IVA sufridas', 'Cobros (Impuestos → Retenciones y percepciones)', 'Pago a cuenta del IVA del mes'],
      ['Percepciones y retenciones de IIBB', 'Compras y cobros (Mercado Pago, bancos)', 'Crédito a descontar en la DDJJ de IIBB / SIFERE'],
      ['Impuestos internos', 'Ventas con impuestos internos (factura manual)', 'Deuda a depositar'],
      ['Otros tributos de compras', 'Comprobantes de ARCA con "Otros tributos"', 'Costo o gasto: ARCA no dice qué son'],
    ];
    c.innerHTML = `<div class="card" style="margin-bottom:12px">
      <label class="check"><input type="checkbox" data-k="iva_compras_solo_am" ${cfg.iva_compras_solo_am ? 'checked' : ''}> El IVA de compras se computa sólo con factura A, M o despacho (con B, C o X queda en el costo)</label>
      <label class="check"><input type="checkbox" data-k="compras_mes_orden" ${cfg.compras_mes_orden ? 'checked' : ''}> Una factura de compra entra al Libro IVA Compras en el mes de la orden (sin tildar: en el mes de emisión de la factura). Consultalo con el contador</label></div>
      ${tabla([{ k: 0, label: 'Impuesto' }, { k: 1, label: 'Dónde aparece' }, { k: 2, label: 'Cómo se trata' }], reglas.map((x) => ({ 0: x[0], 1: x[1], 2: x[2] })), {})}`;
    c.querySelectorAll('[data-k]').forEach((i) => i.onchange = async () => { await VG.post('/api/contabilidad/config', { [i.dataset.k]: i.checked }); VG.toast('Guardado'); recargar(); });
  }, { sinPeriodo: true });
}

VG.contabilidadTabs = [
  { label: 'Resumen', render: tabResumen }, { label: 'Posición mensual', render: tabPosicion }, { label: 'Libro IVA Compras', render: (el) => tabLibro(el, true) }, { label: 'Libro IVA Ventas', render: (el) => tabLibro(el, false) },
  { label: 'Libro diario', render: tabDiario }, { label: 'Mayor y saldos', render: tabMayor }, { label: 'Balance', render: tabBalance }, { label: 'Bienes de uso', render: tabBienes },
  { label: 'Bancos', render: tabBancos }, { label: 'Cheques', render: tabCheques }, { label: 'Préstamos', render: tabPrestamos }, { label: 'Provincias', render: tabProvincias },
  { label: 'Plan de cuentas', render: tabPlan }, { label: 'Tipos de impuesto', render: tabImpuestos },
];
})();
