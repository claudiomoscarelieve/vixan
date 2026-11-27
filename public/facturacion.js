// Vixan — Facturación: panel con tarjetas y filtros, factura manual (varias alícuotas, impuestos internos,
// notas de crédito y débito), manuales emitidas, comprobantes faltantes, canceladas con factura y exportación fiscal.
(() => {
const { esc, badge } = VG;
const nf2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const m2 = (n) => '$ ' + nf2.format(Number(n) || 0);
const mon = VG.money;
const fecha = VG.date;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ── Período compartido por Facturación y Contabilidad ──
const hoy = VG.today();
VG.periodo = VG.periodo || { desde: `${hoy.slice(0, 7)}-01`, hasta: new Date(Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7), 0)).toISOString().slice(0, 10) };
VG.barraPeriodo = (onCambio, { soloHasta = false, extra = '' } = {}) => {
  const el = VG.h(`<div class="toolbar periodo">${soloHasta ? '' : `<label class="small muted">Desde <input type="date" data-d value="${VG.periodo.desde}"></label>`}<label class="small muted">${soloHasta ? 'Al' : 'Hasta'} <input type="date" data-h value="${VG.periodo.hasta}"></label>
    <button class="btn small" data-m="-1" title="Mes anterior">‹ Mes</button><button class="btn small" data-m="0">Este mes</button><button class="btn small" data-m="1" title="Mes siguiente">Mes ›</button><button class="btn small primary" data-ok>Actualizar</button>${extra}</div>`);
  const aplicar = () => { if (!soloHasta) VG.periodo.desde = el.querySelector('[data-d]').value; VG.periodo.hasta = el.querySelector('[data-h]').value; onCambio(VG.periodo); };
  el.querySelector('[data-ok]').onclick = aplicar;
  el.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => {
    const k = Number(b.dataset.m);
    const base = k === 0 ? VG.today().slice(0, 7) : VG.periodo.desde.slice(0, 7);
    const [y, m] = base.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + k, 1));
    VG.periodo.desde = d.toISOString().slice(0, 10); VG.periodo.hasta = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    if (!soloHasta) el.querySelector('[data-d]').value = VG.periodo.desde; el.querySelector('[data-h]').value = VG.periodo.hasta; onCambio(VG.periodo);
  });
  return el;
};
VG.qs = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
VG.m2 = m2;

const ESTADO_PEDIDO = { pendiente: 'Pendiente', para_armar: 'Armado', para_despachar: 'Despacho', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado', devuelto: 'Devuelto' };
const TIPOS = [['auto', 'Factura (la letra sale sola)'], ['A', 'Factura A (a Resp. Inscripto o Monotributista)'], ['B', 'Factura B (a Consumidor Final o Exento)'], ['C', 'Factura C (sólo si sos Monotributista)'],
  ['NC A', 'Nota de Crédito A'], ['NC B', 'Nota de Crédito B'], ['NC C', 'Nota de Crédito C'], ['ND A', 'Nota de Débito A'], ['ND B', 'Nota de Débito B'], ['ND C', 'Nota de Débito C']];
const CONDS = [[5, 'Consumidor Final'], [1, 'Responsable Inscripto'], [6, 'Responsable Monotributo'], [4, 'IVA Sujeto Exento'], [15, 'IVA No Alcanzado'], [13, 'Monotributista Social']];
const ALICS = [21, 10.5, 27, 5, 2.5, 0];
const imprimir = (id) => window.open(`/api/arca/facturas/${id}/imprimir`, '_blank');

// ═════════ Panel ═════════
async function panelFacturacion(el) {
  const cab = VG.h('<div></div>'); const cards = VG.h('<div class="grid g6 fac-cards" style="margin-bottom:12px"></div>'); const box = VG.h('<div></div>');
  el.append(cab, cards, box);
  let datos = null; let ctxT = null;
  cab.appendChild(VG.barraPeriodo(() => ctxT.reload()));
  const botones = VG.h(`<div class="toolbar" style="flex-wrap:wrap">
    <button class="btn" data-manual>📝 Factura manual</button><button class="btn" data-manuales title="Las facturas manuales emitidas y sus notas de crédito: reimprimir o hacer la NC">📄 Manuales emitidas</button>
    <button class="btn" data-faltantes title="Controla la numeración: comprobantes que ARCA autorizó y no están en el registro">Buscar comprobantes faltantes</button>
    <button class="btn" data-export title="Resumen fiscal, detalle por línea o la tabla como la ves">Exportar facturas</button>
    <button class="btn" data-canceladas title="Facturas vivas de ventas canceladas o en devolución: emitir la nota de crédito desde acá">Canceladas con factura</button></div>`);
  cab.appendChild(botones);
  botones.querySelector('[data-manual]').onclick = () => facturaManual(() => ctxT.reload());
  botones.querySelector('[data-manuales]').onclick = () => manualesEmitidas(() => ctxT.reload());
  botones.querySelector('[data-faltantes]').onclick = faltantes;
  botones.querySelector('[data-export]').onclick = () => exportarFacturas(ctxT);
  botones.querySelector('[data-canceladas]').onclick = () => canceladas(() => ctxT.reload());
  const card = (k, titulo, monto, sub, tone, tip) => `<div class="card kpi ${tone}" data-card="${k}" title="${esc(tip)}" style="cursor:${k ? 'pointer' : 'default'}"><div class="l">${titulo}</div><div class="v">${mon(monto)}</div><div class="s">${sub}</div></div>`;
  const pintarCards = () => {
    const t = datos.tarjetas;
    cards.innerHTML = [
      card('Pendiente', 'Sin facturar', t.sin_facturar.monto, `${t.sin_facturar.cantidad} pedidos facturables`, 'warn', 'Pedidos del período que todavía no tienen factura y no están cancelados. Click: la tabla queda solo con estos.'),
      card('Facturado', 'Facturado', t.facturado.monto, `${t.facturado.cantidad} pedidos · ${VG.n(t.facturado.porcentaje)}% de lo facturable`, 'ok', 'Pedidos del período con factura emitida. Click: la tabla queda solo con estos.'),
      card('', 'Facturable del período', t.facturable.monto, `${t.facturable.cantidad} pedidos · ventas ${fecha(VG.periodo.desde)} → ${fecha(VG.periodo.hasta)}`, 'info', 'Sin facturar + facturado.'),
      card('NC', 'Notas de crédito', t.nc.monto, `${t.nc.cantidad} pedidos con NC`, '', 'Pedidos cuya factura se anuló con nota de crédito. Click: la tabla queda solo con estos.'),
      card('Cancelado', 'Cancelados', t.cancelados.monto, `${t.cancelados.cantidad} pedidos · no se facturan`, 'err', 'Pedidos cancelados sin factura. No entran en lo facturable.'),
      card('', 'Emitido según ARCA', t.emitido.monto, `${t.emitido.cantidad} comprobantes · NC ${t.emitido.nc_cantidad} por ${mon(t.emitido.nc_monto)} · por fecha de comprobante`, 'teal', 'Facturas con FECHA DE COMPROBANTE dentro del período (lo que mira ARCA y el contador), aunque el pedido sea de otro mes.'),
    ].join('');
    cards.querySelectorAll('[data-card]').forEach((c) => { if (c.dataset.card) c.onclick = () => { ctxT.chip = c.dataset.card; ctxT.reload(); }; });
  };
  ctxT = VG.crud(box, {
    canCreate: false, canEdit: false, canDelete: false, selectable: true, sort: (a, b) => String(b.fecha).localeCompare(String(a.fecha)),
    load: async () => { datos = await VG.get(`/api/facturacion/panel?${VG.qs(VG.periodo)}`); pintarCards(); return datos.filas.map((r) => ({ ...r, estado_txt: ESTADO_PEDIDO[r.estado] || r.estado, fact_txt: r.cancelado && r.est_fact === 'Pendiente' ? 'Cancelado' : r.est_fact })); },
    chips: { options: [['Pendiente', 'Sin facturar'], ['Facturado', 'Facturados'], ['NC', 'Con nota de crédito'], ['Cancelado', 'Cancelados']], match: (r, v) => r.fact_txt === v },
    filters: [{ k: 'estado_txt', label: 'Estado pedido' }, { k: 'tipo_cbte', label: 'Tipo cbte' }, { k: 'plataforma', label: 'Plataforma' }, { k: 'tipo_envio', label: 'Envío' }],
    columns: [
      { k: 'numero', label: 'Pedido', fmt: (v) => `<code class="k">${esc(v)}</code>` }, { k: 'fecha', label: 'Fecha', fmt: fecha }, { k: 'cliente', label: 'Cliente' },
      { k: 'plataforma', label: 'Plataforma', fmt: (v) => (v ? badge(v) : '—') }, { k: 'total', label: 'Monto', num: true, fmt: m2 },
      { k: 'estado_txt', label: 'Est. pedido', fmt: (v, r) => badge(v, r.cancelado ? 'err' : r.estado === 'entregado' ? 'ok' : '') },
      { k: 'fact_txt', label: 'Est. factura', fmt: (v, r) => (v === 'Facturado' ? `${badge('Facturado', 'ok')} <span class="small muted">${esc(r.factura)}</span>` : v === 'NC' ? `${badge('NC', 'warn')} <span class="small muted">${esc(r.nc)}</span>` : v === 'Cancelado' ? badge('Cancelado', 'err') : badge('Pendiente', 'warn')) },
    ],
    footer: (rows) => `<tr><td></td><td colspan="4"><b>${rows.length} pedidos</b></td><td class="num"><b>${m2(rows.reduce((a, r) => a + r.total, 0))}</b></td><td colspan="3"></td></tr>`,
    rowActions: (r) => [
      ...(r.factura_id ? [{ label: 'Imprimir', onClick: () => imprimir(r.factura_id) }] : []),
      ...(r.fact_txt === 'Pendiente' ? [{ label: 'Emitir factura', onClick: () => emitir([r.id]) }] : []),
    ],
    toolbar: (ctx) => [
      { label: `Facturar seleccionadas (${ctx.sel.size})`, primary: true, disabled: !ctx.sel.size, onClick: () => emitir([...ctx.sel].filter((id) => ctx.rows.find((r) => r.id === id)?.fact_txt === 'Pendiente')) },
      { label: 'Facturar todo', onClick: () => emitir(ctx.filtered.filter((r) => r.fact_txt === 'Pendiente').map((r) => r.id)) },
    ],
    empty: 'No hay pedidos en el período.',
  });
  async function emitir(ids) {
    if (!ids.length) return VG.toast('No hay pedidos pendientes de facturar en la selección', true);
    if (!VG.confirm(`¿Emitir ${ids.length} factura(s) en ARCA? Una vez autorizadas no se pueden borrar, solo anular con nota de crédito.`)) return;
    VG.toast(`Pidiendo ${ids.length} CAE a ARCA…`);
    try {
      const r = await VG.post('/api/arca/facturar-pedidos', { ids });
      const ok = r.filter((x) => x.ok).length, mal = r.filter((x) => !x.ok);
      VG.modal({ title: 'Resultado de la facturación', body: `<p><b>${ok}</b> factura(s) emitidas${mal.length ? `, <b>${mal.length}</b> con error` : ''}.</p>${mal.length ? `<table class="t"><thead><tr><th>Pedido</th><th>Error</th></tr></thead><tbody>${mal.map((x) => `<tr><td>${esc(x.pedido)}</td><td>${esc(x.error)}</td></tr>`).join('')}</tbody></table>` : ''}` });
    } catch (e) { VG.toast(e.message, true); }
    ctxT.sel.clear(); ctxT.reload();
  }
}

// ═════════ Factura manual ═════════
function facturaManual(alTerminar, previo = {}) {
  const body = VG.h(`<div>
    <div class="form grid" style="grid-template-columns:1.4fr 1fr 1fr">
      <label>Tipo de comprobante<select data-tipo>${TIPOS.map(([v, l]) => `<option value="${v}" ${previo.tipo === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label data-asoc-w style="display:none">Comprobante que corrige (PV-número)<input data-asoc placeholder="Ej: 5-123" value="${esc(previo.asociado || '')}"></label>
      <label data-asoct-w style="display:none">La nota de débito corrige<select data-asoct><option value="factura">una Factura (la ND le suma)</option><option value="nc">una Nota de Crédito (la ND la anula)</option></select></label>
      <label>Cliente / razón social<input data-cli placeholder="Ej: Juan Pérez" value="${esc(previo.cliente || '')}"></label>
      <label>CUIT / CUIL / DNI<input data-cuit placeholder="Ej: 20123456789" value="${esc(previo.cuit || '')}"></label>
      <label>Condición IVA<select data-cond>${CONDS.map(([v, l]) => `<option value="${v}" ${Number(previo.cond) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label style="grid-column:span 3">Dirección<input data-dom placeholder="Ej: Av. Corrientes 1234, CABA" value="${esc(previo.domicilio || '')}"></label>
    </div>
    <h3>Ítems <button class="btn small" data-add>+ Agregar línea</button></h3>
    <table class="t" data-items><thead><tr><th>Descripción</th><th>SKU</th><th class="num">Cant.</th><th class="num">Precio neto unit.</th><th class="num">IVA</th><th class="num">Imp. int. unit.</th><th class="num">Subtotal</th><th></th></tr></thead><tbody></tbody></table>
    <div style="display:flex;justify-content:flex-end;align-items:flex-start;gap:16px;margin-top:10px"><label class="check" data-per-w style="display:none;margin-top:8px"><input type="checkbox" data-per> Percepción de IVA <span class="small muted" data-per-txt></span></label><table class="t" style="width:auto" data-tot></table></div>
    <p class="muted small">⚠️ Una factura manual no está asociada a ningún pedido y no afecta el stock. Los precios van <b>sin IVA</b>; el IVA y los impuestos internos se suman.</p>
  </div>`);
  const $ = (s) => body.querySelector(s);
  const tb = $('[data-items] tbody');
  const fila = (i = {}) => {
    const tr = VG.h(`<tr><td><input data-k="nombre" value="${esc(i.nombre || '')}" placeholder="Producto o servicio" style="width:200px"></td><td><input data-k="sku" value="${esc(i.sku || '')}" style="width:80px"></td>
      <td class="num"><input data-k="cantidad" type="number" step="any" value="${i.cantidad ?? 1}" style="width:60px;text-align:right"></td><td class="num"><input data-k="neto" type="number" step="0.01" value="${i.neto ?? ''}" style="width:100px;text-align:right"></td>
      <td class="num"><select data-k="alicuota">${ALICS.map((a) => `<option value="${a}" ${Number(i.alicuota ?? 21) === a ? 'selected' : ''}>${String(a).replace('.', ',')}%</option>`).join('')}</select></td>
      <td class="num"><input data-k="imp_int" type="number" step="0.01" value="${i.imp_int || ''}" style="width:80px;text-align:right"></td><td class="num" data-sub></td><td><button class="btn small danger" data-x>✕</button></td></tr>`);
    tr.querySelector('[data-x]').onclick = () => { tr.remove(); calcular(); };
    tr.querySelectorAll('input,select').forEach((x) => x.oninput = calcular);
    tb.appendChild(tr);
  };
  const leer = () => [...tb.querySelectorAll('tr')].map((tr) => { const o = {}; tr.querySelectorAll('[data-k]').forEach((x) => { o[x.dataset.k] = x.type === 'number' || x.tagName === 'SELECT' ? (x.value === '' ? 0 : Number(x.value)) : x.value.trim(); }); return o; }).filter((i) => i.nombre && i.cantidad > 0);
  const esC = () => /C$/.test($('[data-tipo]').value);
  function calcular() {
    const g = {}; let neto = 0, ii = 0;
    [...tb.querySelectorAll('tr')].forEach((tr) => {
      const v = (k) => Number(tr.querySelector(`[data-k=${k}]`).value) || 0;
      const n = r2(v('cantidad') * v('neto')), imp = r2(v('cantidad') * v('imp_int')), a = esC() ? 0 : v('alicuota');
      neto = r2(neto + n); ii = r2(ii + imp); g[a] = r2((g[a] || 0) + n);
      tr.querySelector('[data-sub]').textContent = m2(n + r2(n * a / 100) + imp);
    });
    const ivas = Object.entries(g).filter(([a]) => Number(a) > 0).map(([a, n]) => [a, r2(n * a / 100)]);
    const iva = r2(ivas.reduce((x, [, v]) => x + v, 0));
    const per = $('[data-per]').checked && percep.aplica ? percep.importe : 0;
    $('[data-tot]').innerHTML = `<tr><td>Subtotal neto</td><td class="num">${m2(neto)}</td></tr>${ivas.map(([a, v]) => `<tr><td>IVA ${String(a).replace('.', ',')}%</td><td class="num">${m2(v)}</td></tr>`).join('')}${ii ? `<tr><td>Impuestos internos</td><td class="num">${m2(ii)}</td></tr>` : ''}${per ? `<tr><td>Percepción de IVA</td><td class="num">${m2(per)}</td></tr>` : ''}<tr><td><b>TOTAL</b></td><td class="num"><b>${m2(neto + iva + ii + per)}</b></td></tr>`;
    clearTimeout(timerPer); timerPer = setTimeout(consultarPercepcion, 350);
  }
  // Percepción de IVA (Configuración → Percepción y deuda): se tilda sola según la regla; se puede tildar o destildar a mano
  let percep = { aplica: false, importe: 0 }, tocada = false, timerPer = null, ultimaClave = '';
  async function consultarPercepcion() {
    const datos = { tipo: $('[data-tipo]').value, cond_iva_receptor: Number($('[data-cond]').value), items: leer() };
    const clave = JSON.stringify(datos); if (clave === ultimaClave) return; ultimaClave = clave;
    try {
      const r = await VG.post('/api/arca/percepcion', datos);
      $('[data-per-w]').style.display = r.activa ? '' : 'none';
      percep = r.activa ? r : { aplica: false, importe: 0 };
      if (!tocada) $('[data-per]').checked = !!r.auto;
      $('[data-per]').disabled = !r.aplica;
      $('[data-per-txt]').textContent = r.aplica ? `${m2(r.importe)} (${String(r.alic).replace('.', ',')}%)` : r.activa ? '(no corresponde a este comprobante)' : '';
      calcularSinConsulta();
    } catch { /* sin vista previa */ }
  }
  function calcularSinConsulta() { const t = timerPer; calcular(); clearTimeout(timerPer); timerPer = t; }
  $('[data-per]').onchange = () => { tocada = true; calcularSinConsulta(); };
  $('[data-cond]').onchange = calcular;
  const cambioTipo = () => { const t = $('[data-tipo]').value; $('[data-asoc-w]').style.display = /^(NC|ND) /.test(t) ? '' : 'none'; $('[data-asoct-w]').style.display = /^ND /.test(t) ? '' : 'none'; calcular(); };
  $('[data-tipo]').onchange = cambioTipo;
  $('[data-add]').onclick = () => fila();
  (previo.items?.length ? previo.items : [{}]).forEach(fila);
  cambioTipo();
  VG.modal({ title: '📝 Factura manual', body, wide: true, saveLabel: 'Emitir fiscalmente', onSave: async () => {
    const items = leer();
    if (!items.length) throw new Error('Agregá al menos una línea con descripción, cantidad y precio');
    const datos = { tipo: $('[data-tipo]').value, asociado: $('[data-asoc]').value, asociado_tipo: $('[data-asoct]').value, cliente: $('[data-cli]').value, cuit: $('[data-cuit]').value, domicilio: $('[data-dom]').value, cond_iva_receptor: Number($('[data-cond]').value), items, percepcion: $('[data-per-w]').style.display === 'none' ? undefined : $('[data-per]').checked };
    if (!VG.confirm('¿Emitir este comprobante en ARCA? Una vez autorizado no se puede borrar.')) throw new Error('Cancelado');
    const r = await VG.post('/api/arca/factura-manual', datos);
    VG.toast(`${r.tipo} ${r.numero} emitida · CAE ${r.cae}`); imprimir(r.id); alTerminar?.();
  } });
}

// ═════════ Manuales emitidas ═════════
async function manualesEmitidas(alTerminar) {
  const lista = await VG.get('/api/facturacion/manuales');
  const body = VG.h(`<div><div class="toolbar"><input type="search" data-q placeholder="Buscar por cliente, CUIT o número" style="flex:1"></div><div data-t></div>
    <div class="card" style="margin-top:12px"><h3>¿Falta alguna? Traela de ARCA</h3><div class="toolbar" style="margin:0"><select data-l>${['A', 'B', 'C', 'NC A', 'NC B', 'NC C', 'ND A', 'ND B', 'ND C'].map((x) => `<option>${x}</option>`).join('')}</select><input type="number" data-n placeholder="Número (ej: 12)" style="width:140px"><button class="btn" data-traer>Traer de ARCA</button></div>
    <p class="small muted" style="margin-bottom:0">Del punto de venta de tu cuenta. ARCA no guarda los ítems: queda con los importes exactos por alícuota.</p></div></div>`);
  const pintar = () => {
    const q = body.querySelector('[data-q]').value.toLowerCase();
    const xs = lista.filter((f) => !q || `${f.cliente} ${f.doc_nro} ${f.numero}`.toLowerCase().includes(q));
    body.querySelector('[data-t]').innerHTML = `<p class="small muted">${xs.length} de ${lista.length} comprobantes</p><table class="t"><thead><tr><th>Fecha</th><th>Comprobante</th><th>Cliente</th><th class="num">Total</th><th>CAE</th><th>Estado</th><th></th></tr></thead><tbody>${xs.map((f) => `<tr><td>${fecha(f.fecha)}</td><td>${esc(f.tipo)}<br><span class="small muted">${esc(f.numero)}</span></td><td>${esc(f.cliente)}<br><span class="small muted">${esc(f.doc_nro && f.doc_nro !== '0' ? f.doc_nro : '')}</span></td><td class="num">${m2(f.total)}</td><td><code class="k">${esc(f.cae)}</code></td>
      <td>${f.estado === 'anulada' ? badge(`Con NC ${f.anulada_por}`, 'err') : f.asociada ? `De ${esc(f.asociada)}` : f.nc_parcial ? badge('NC parcial', 'warn') : badge('Vigente', 'ok')}${f.recuperada ? ' ' + badge('traída de ARCA') : ''}</td>
      <td><button class="btn small" data-ver="${f.id}">🖨️ Ver / PDF</button>${!/^N[CD] /.test(f.tipo) && f.estado !== 'anulada' ? ` <button class="btn small" data-nc="${f.id}">↩️ Nota de crédito</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sin comprobantes manuales.</td></tr>'}</tbody></table>`;
    body.querySelectorAll('[data-ver]').forEach((b) => b.onclick = () => imprimir(b.dataset.ver));
    body.querySelectorAll('[data-nc]').forEach((b) => b.onclick = () => { m.close(); notaCredito(lista.find((f) => String(f.id) === b.dataset.nc), alTerminar); });
  };
  body.querySelector('[data-q]').oninput = pintar;
  body.querySelector('[data-traer]').onclick = async () => { try { const r = await VG.post('/api/facturacion/recuperar', { letra: body.querySelector('[data-l]').value, nro: body.querySelector('[data-n]').value }); VG.toast(`Traída de ARCA: ${r.tipo} ${r.numero} por ${m2(r.total)}`); m.close(); manualesEmitidas(alTerminar); } catch (e) { VG.toast(e.message, true); } };
  const m = VG.modal({ title: '📄 Facturas manuales emitidas', body, wide: true });
  pintar();
}
VG.notaCredito = notaCredito;
function notaCredito(f, alTerminar) {
  const pendiente = r2(f.total - (f.nc_total || 0));
  const body = VG.h(`<div class="form grid" style="grid-template-columns:1fr 1fr"><label>Importe de la nota de crédito<input type="number" step="0.01" data-monto value="${pendiente}"></label><label>Motivo (opcional)<input data-mot></label>
    <p class="small muted" style="grid-column:span 2;margin:0">Por el total anula la factura. Por menos, es una nota de crédito parcial: se reparte en proporción entre las alícuotas de la factura${f.nc_total ? ` (ya tiene NC por ${m2(f.nc_total)})` : ''}.</p></div>`);
  VG.modal({ title: `Nota de crédito de ${f.tipo} ${f.numero} — ${m2(f.total)}`, body, saveLabel: 'Emitir nota de crédito', onSave: async () => {
    const nc = await VG.post(`/api/arca/facturas/${f.id}/nota-credito`, { monto: Number(body.querySelector('[data-monto]').value), motivo: body.querySelector('[data-mot]').value });
    VG.toast(`Nota de crédito ${nc.numero} emitida por ${m2(nc.total)}`); imprimir(nc.id); alTerminar?.();
  } });
}

// ═════════ Comprobantes faltantes ═════════
async function faltantes() {
  const body = VG.h(`<div><p class="small">Controla la numeración de tu CUIT por punto de venta y tipo de comprobante: si entre el primer y el último número registrados falta alguno, o si ARCA autorizó números después del último, acá aparece y se puede traer.</p>
    <div class="toolbar"><label class="small muted">Desde <input type="date" data-d value="${VG.periodo.desde}"></label><label class="small muted">Hasta <input type="date" data-h value="${VG.periodo.hasta}"></label><button class="btn primary" data-b>Buscar</button></div><div data-r class="small muted">Buscando…</div></div>`);
  const buscar = async () => {
    const r = body.querySelector('[data-r]'); r.textContent = 'Consultando…';
    try {
      const x = await VG.get(`/api/facturacion/faltantes?${VG.qs({ desde: body.querySelector('[data-d]').value, hasta: body.querySelector('[data-h]').value })}`);
      r.innerHTML = `${x.faltan.length ? `<h3>Faltan en el registro (${x.faltan.length})</h3><table class="t"><thead><tr><th>Comprobante</th><th>Por qué</th><th></th></tr></thead><tbody>${x.faltan.map((f, i) => `<tr><td>${esc(f.letra)} ${String(f.punto_venta).padStart(5, '0')}-${String(f.nro).padStart(8, '0')}</td><td>${esc(f.motivo)}</td><td><button class="btn small" data-t="${i}">Traer de ARCA</button></td></tr>`).join('')}</tbody></table>` : `${badge('Sin faltantes', 'ok')} No falta ningún número en ${x.controlados} combinación(es) de punto de venta y tipo.`}${x.avisos.map((a) => `<div class="note warn">${esc(a)}</div>`).join('')}`;
      r.querySelectorAll('[data-t]').forEach((b) => b.onclick = async () => { const f = x.faltan[b.dataset.t]; try { const rec = await VG.post('/api/facturacion/recuperar', { letra: f.letra, nro: f.nro, punto_venta: f.punto_venta }); VG.toast(`Registrada: ${rec.tipo} ${rec.numero} por ${m2(rec.total)}`); buscar(); } catch (e) { VG.toast(e.message, true); } });
    } catch (e) { r.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; }
  };
  body.querySelector('[data-b]').onclick = buscar;
  VG.modal({ title: 'Comprobantes que faltan en el registro', body, wide: true });
  buscar();
}

// ═════════ Canceladas con factura ═════════
async function canceladas(alTerminar) {
  const [lista, panel] = await Promise.all([VG.get('/api/facturacion/canceladas'), VG.get(`/api/facturacion/panel?${VG.qs(VG.periodo)}`)]);
  const g = (e) => lista.filter((x) => x.estado_nc === e);
  const kp = (l, xs, tone) => `<div class="card kpi ${tone}"><div class="l">${l}</div><div class="v">${xs.length}</div><div class="s">${m2(xs.reduce((a, x) => a + x.total, 0))}</div></div>`;
  const body = VG.h(`<div>
    <div class="toolbar"><label class="check"><input type="checkbox" data-auto ${panel.nc_automatica ? 'checked' : ''}> Nota de crédito automática al cancelar un pedido facturado</label></div>
    <div class="grid g4" style="margin-bottom:10px">${kp('Para revisar', g('revisar'), 'warn')}${kp('Esperando', g('esperando'), 'info')}${kp('Con error', g('error'), 'err')}${kp('Emitidas', g('emitida'), 'ok')}</div>
    <table class="t"><thead><tr><th><input type="checkbox" data-all></th><th>Factura</th><th>Cliente</th><th>Pedido</th><th>Motivo</th><th class="num">Total</th><th>Estado</th></tr></thead><tbody>${lista.map((x) => `<tr><td><input type="checkbox" data-id="${x.id}" ${x.estado_nc === 'esperando' ? 'disabled' : ''}></td><td>${esc(x.factura)}<br><span class="small muted">${fecha(x.fecha)}</span></td><td>${esc(x.cliente)}</td><td>${esc(x.pedido)}</td><td>${esc(x.motivo)}</td><td class="num">${m2(x.total)}</td><td>${x.estado_nc === 'error' ? `${badge('Error', 'err')}<div class="small">${esc(x.error)}</div>` : badge({ revisar: 'Para revisar', esperando: 'Esperando' }[x.estado_nc] || x.estado_nc, 'warn')}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No hay facturas vivas de ventas canceladas o en devolución.</td></tr>'}</tbody></table>
    <p class="small muted">Son las facturas que siguen vivas (sin nota de crédito) de ventas que hoy están canceladas o devueltas. La nota de crédito sale por lo que queda sin acreditar, al mismo receptor, y entra en el libro de IVA. No se le avisa nada al comprador.</p></div>`);
  body.querySelector('[data-all]').onchange = (e) => body.querySelectorAll('[data-id]:not([disabled])').forEach((c) => { c.checked = e.target.checked; });
  body.querySelector('[data-auto]').onchange = async (e) => { await VG.post('/api/facturacion/config', { nc_automatica: e.target.checked }); VG.toast(e.target.checked ? 'Nota de crédito automática: prendida' : 'Nota de crédito automática: apagada'); };
  VG.modal({ title: 'Canceladas con factura', body, wide: true, saveLabel: 'Emitir nota de crédito de las elegidas', onSave: async () => {
    const ids = [...body.querySelectorAll('[data-id]:checked')].map((c) => Number(c.dataset.id));
    if (!ids.length) throw new Error('Elegí al menos una factura');
    if (!VG.confirm(`¿Emitir ${ids.length} nota(s) de crédito en ARCA?`)) throw new Error('Cancelado');
    const r = await VG.post('/api/facturacion/canceladas/nc', { ids });
    const mal = r.filter((x) => !x.ok);
    VG.toast(`${r.length - mal.length} nota(s) de crédito emitidas${mal.length ? ` · ${mal.length} con error: ${mal[0].error}` : ''}`, !!mal.length); alTerminar?.();
  } });
}

// ═════════ Exportar facturas ═════════
function exportarFacturas(ctxT) {
  const mesActual = VG.today().slice(0, 7);
  const meses = Array.from({ length: 18 }, (_, i) => { const d = new Date(Date.UTC(+mesActual.slice(0, 4), +mesActual.slice(5, 7) - 1 - i, 1)); return d.toISOString().slice(0, 7); });
  const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const body = VG.h(`<div class="form grid" style="grid-template-columns:1fr">
    <div><b class="small">QUÉ EXPORTAR</b>
      <label class="check"><input type="radio" name="que" value="resumen" checked> Resumen fiscal — una fila por comprobante (las NC en negativo) y una fila TOTAL</label>
      <label class="check"><input type="radio" name="que" value="detalle"> Detalle por línea — una fila por ítem: SKU, cantidad, neto, IVA, imp. interno</label>
      <label class="check"><input type="radio" name="que" value="tabla"> La tabla como la ves — los pedidos que pasan los filtros de la pantalla</label></div>
    <div data-per><b class="small">DE QUÉ PERÍODO</b>
      <label class="check"><input type="radio" name="per" value="mes" checked> Un mes, por fecha de emisión (lo que mira ARCA y el contador) <select data-mes>${meses.map((m) => `<option value="${m}">${MES[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}</option>`).join('')}</select></label>
      <label class="check"><input type="radio" name="per" value="rango"> Un rango de fechas de emisión <input type="date" data-d value="${VG.periodo.desde}"> a <input type="date" data-h value="${VG.periodo.hasta}"></label></div>
    <div><b class="small">FORMATO</b> <label class="check" style="display:inline-flex"><input type="radio" name="fmt" value="xls" checked> Excel</label> <label class="check" style="display:inline-flex"><input type="radio" name="fmt" value="pdf"> PDF</label> <label class="check" style="display:inline-flex" title="Resumen fiscal de un mes: los archivos de ARCA (IVA Simple / Libro IVA Digital)"><input type="radio" name="fmt" value="txt"> TXT (ARCA)</label></div>
  </div>`);
  const v = (n) => body.querySelector(`[name=${n}]:checked`).value;
  VG.modal({ title: 'Exportar facturas', body, saveLabel: 'Exportar', onSave: async () => {
    const que = v('que'), fmt = v('fmt');
    let desde, hasta;
    if (v('per') === 'mes') { const m = body.querySelector('[data-mes]').value; desde = `${m}-01`; hasta = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).toISOString().slice(0, 10); } else { desde = body.querySelector('[data-d]').value; hasta = body.querySelector('[data-h]').value; }
    if (que === 'tabla') {
      const cols = [{ label: 'Pedido', get: (r) => r.numero }, { label: 'Fecha', get: (r) => VG.date(r.fecha) }, { label: 'Cliente', get: (r) => r.cliente }, { label: 'Plataforma', get: (r) => r.plataforma }, { label: 'Monto', get: (r) => r.total }, { label: 'Estado pedido', get: (r) => r.estado_txt }, { label: 'Estado factura', get: (r) => r.fact_txt }, { label: 'Comprobante', get: (r) => r.factura }, { label: 'CAE', get: (r) => r.cae }];
      return fmt === 'pdf' ? VG.exportPDF('Facturación', cols, ctxT.filtered) : VG.exportExcel('facturacion', cols, ctxT.filtered);
    }
    if (fmt === 'txt') {
      if (v('per') !== 'mes') throw new Error('Los archivos de ARCA son de un mes: elegí "Un mes"');
      const r = await VG.get(`/api/contabilidad/txt?mes=${body.querySelector('[data-mes]').value}`);
      const bin = Uint8Array.from(atob(r.zip), (c) => c.charCodeAt(0));
      VG.download(`libro-iva-digital-${body.querySelector('[data-mes]').value}.zip`, bin, 'application/zip'); return;
    }
    const r = await VG.get(`/api/facturacion/exportar?${VG.qs({ modo: que, desde, hasta })}`);
    if (que === 'detalle') {
      const cols = ['fecha', 'comprobante', 'cliente', 'sku', 'producto', 'cantidad', 'neto', 'alicuota', 'iva', 'imp_int', 'cae'].map((k) => ({ label: k.replace('_', ' '), get: (x) => (k === 'fecha' ? VG.date(x[k]) : x[k]) }));
      return fmt === 'pdf' ? VG.exportPDF(`Detalle de facturas ${VG.date(desde)} a ${VG.date(hasta)}`, cols, r.filas) : VG.exportExcel(`facturas-detalle-${desde}`, cols, r.filas);
    }
    const nombres = { fecha: 'Fecha', tipo: 'Tipo', numero: 'Número', cliente: 'Cliente', doc: 'CUIT/DNI', cond_iva: 'Cond. IVA', neto_21: 'Neto 21%', iva_21: 'IVA 21%', neto_105: 'Neto 10,5%', iva_105: 'IVA 10,5%', neto_27: 'Neto 27%', iva_27: 'IVA 27%', neto_otras: 'Neto otras', iva_otras: 'IVA otras', no_gravado: 'No gravado (C)', imp_internos: 'Imp. internos', percep_iva: 'Percepción IVA', total: 'Total', cae: 'CAE', pedido: 'Pedido' };
    const cols = Object.entries(nombres).map(([k, l]) => ({ label: l, get: (x) => (k === 'fecha' && x[k] ? VG.date(x[k]) : x[k]) }));
    const filas = [...r.filas, r.total];
    if (fmt === 'pdf') VG.exportPDF(`Resumen fiscal ${VG.date(desde)} a ${VG.date(hasta)}`, cols.filter((c) => !['CAE', 'Pedido', 'Neto otras', 'IVA otras', 'Cond. IVA'].includes(c.label)), filas); else VG.exportExcel(`resumen-fiscal-${desde}`, cols, filas);
  } });
}

VG.facturacionTabs = [{ label: 'Facturación', render: panelFacturacion }];
VG.facturaManualNueva = facturaManual;
})();
