// Vixan — definición de los módulos del portal
(() => {
const { money, esc, badge, date, datetime } = VG;
const tb = (v) => badge(v || '—', VG.toneFor(v));
const PLATS = ['Mercado Libre', 'WooCommerce', 'Tienda Nube', 'Shopify', 'VTEX', 'Venta directa', 'Vixan Market'];
const ENVIOS = ['Flex', 'Colecta', 'Full', 'Vixan 24 h', 'OCA', 'Andreani', 'Retiro en depósito', 'Mercado Envíos'];
const platIcon = (p) => ({ 'Mercado Libre': '🟡', WooCommerce: '🟣', 'Tienda Nube': '🔵', Shopify: '🟢', 'Venta directa': '⚪', 'Vixan Market': '🟩' }[p] || '•');
const sumBy = (rows, k) => rows.reduce((a, r) => a + (Number(typeof k === 'function' ? k(r) : r[k]) || 0), 0);
const byDateDesc = (k = 'fecha') => (a, b) => String(b[k] || '').localeCompare(String(a[k] || ''));
const foot = (label, fn) => (rows, cols, sel) => `<tr>${sel ? '<td></td>' : ''}${cols.map((c, i) => `<td class="${c.num ? 'num' : ''}">${i === 0 ? label : fn(c, rows) ?? ''}</td>`).join('')}<td></td></tr>`;
const totalFoot = (keys) => foot('Total', (c, rows) => (keys.includes(c.k) ? money(sumBy(rows, c.get || c.k)) : ''));
const itemsTxt = (items) => (items || []).map((i) => `${i.cantidad}× ${i.nombre || i.sku}`).join(', ');
const settingsCache = { v: null };
const getSettings = async () => (settingsCache.v ||= await VG.get('/api/settings'));

// ═════════════ Impresión de etiquetas / remitos ═════════════
function imprimir(pedidos, formato) {
  const t = VG.app.tenant?.nombre || 'Vixan';
  const css = formato === 'ticket'
    ? '@page{size:100mm 150mm;margin:0}.lb{width:100mm;height:150mm;padding:6mm;box-sizing:border-box;page-break-after:always;border:1px dashed #ccc}'
    : '@page{size:A4;margin:12mm}.lb{page-break-after:always;padding:4mm}';
  const body = pedidos.map((p) => {
    const items = (p.items || []).map((i) => `<tr><td>${esc(i.sku)}</td><td>${esc(i.nombre)}</td><td style="text-align:right">${i.cantidad}</td>${formato === 'a4' ? `<td style="text-align:right">${money(i.precio)}</td><td style="text-align:right">${money(i.precio * i.cantidad)}</td>` : ''}</tr>`).join('');
    if (formato === 'ticket') return `<div class="lb"><div style="display:flex;justify-content:space-between"><b style="font-size:18px">${esc(t)}</b><span>${esc(p.tipo_envio)}</span></div>
      <hr><div style="font-size:12px">DESTINATARIO</div><div style="font-size:20px;font-weight:800">${esc(p.cliente)}</div><div style="font-size:15px">${esc(p.direccion || '')}</div><div style="font-size:15px">${esc(p.localidad || '')} · CP ${esc(p.cp || '')}</div><div>Tel. ${esc(p.telefono || '—')}</div>
      <hr><div style="font-size:30px;font-weight:900;letter-spacing:1px;text-align:center;font-family:monospace">${esc(p.numero)}</div>
      <svg viewBox="0 0 300 60" style="width:100%;height:60px">${[...String(p.numero)].map((ch, i) => `<rect x="${i * 300 / String(p.numero).length}" y="0" width="${(ch.charCodeAt(0) % 5) + 2}" height="60"/>`).join('')}</svg>
      <div style="font-size:11px;margin-top:6px">${(p.items || []).length} ítems · ${date(p.fecha)} · Bultos: 1</div></div>`;
    return `<div class="lb"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><h2 style="margin:0">${esc(t)}</h2><div>Remito / Orden de entrega</div></div><div style="text-align:right"><b>Pedido ${esc(p.numero)}</b><br>${date(p.fecha)}<br>${esc(p.plataforma)} · ${esc(p.tipo_envio)}</div></div>
      <hr><b>${esc(p.cliente)}</b><br>${esc(p.direccion || '')} — ${esc(p.localidad || '')} (CP ${esc(p.cp || '')})<br>Tel. ${esc(p.telefono || '—')}
      <table style="width:100%;border-collapse:collapse;margin-top:12px" border="1" cellpadding="5"><tr><th>SKU</th><th>Producto</th><th>Cant.</th>${formato === 'a4' ? '<th>Precio</th><th>Subtotal</th>' : ''}</tr>${items}</table>
      ${formato === 'a4' ? `<h3 style="text-align:right">Total ${money(p.total)}</h3><div>Pago: ${esc(p.pago)} — ${esc(p.metodo_pago || '')}</div>` : ''}
      <div style="margin-top:40px;display:flex;gap:40px"><div style="flex:1;border-top:1px solid #000;text-align:center">Firma</div><div style="flex:1;border-top:1px solid #000;text-align:center">Aclaración y DNI</div></div></div>`;
  }).join('');
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>Etiquetas</title><style>body{font-family:system-ui;margin:0}${css}</style></head><body>${body}<script>onload=()=>print()<\/script></body></html>`);
  w.document.close();
}

// ═════════════ Pedidos ═════════════
const formPedido = [
  { k: 'cliente', label: 'Cliente', required: true }, { k: 'plataforma', label: 'Plataforma', type: 'select', options: PLATS, default: 'Venta directa' },
  { k: 'tipo_envio', label: 'Tipo de envío', type: 'select', options: ENVIOS, default: 'Vixan 24 h' }, { k: 'deposito', label: 'Depósito', default: 'Central' },
  { k: 'direccion', label: 'Dirección' }, { k: 'localidad', label: 'Localidad' }, { k: 'cp', label: 'Código postal' }, { k: 'telefono', label: 'Teléfono' },
  { k: 'pago', label: 'Pago', type: 'select', options: ['Pendiente', 'Pagado'] }, { k: 'metodo_pago', label: 'Método de pago', type: 'select', options: ['Transferencia', 'Mercado Pago', 'Efectivo contra entrega', 'Tarjeta'] },
  { k: 'items', label: 'Productos', type: 'items' }, { k: 'notas', label: 'Notas', type: 'textarea', full: true },
];
function verPedido(p, ctx) {
  const body = VG.h(`<div>
    <div class="grid g3" style="margin-bottom:12px">
      <div><div class="muted small">Cliente</div><b>${esc(p.cliente)}</b><div class="small">${esc(p.direccion || '')} ${esc(p.localidad || '')} ${p.cp ? 'CP ' + esc(p.cp) : ''}</div><div class="small">${esc(p.telefono || '')}</div></div>
      <div><div class="muted small">Canal</div><b>${platIcon(p.plataforma)} ${esc(p.plataforma)}</b><div class="small">${esc(p.cuenta || '')}</div><div class="small">Envío: ${esc(p.tipo_envio)}</div></div>
      <div><div class="muted small">Estado</div>${VG.estadoBadge(p.estado)} ${tb(p.pago)}<div class="small">Seguimiento: ${esc(p.tracking || 'sin seguimiento')}</div><div class="small">Transportista: ${esc(p.transportista || '—')}</div></div>
    </div>
    <div class="table-wrap"><table class="t"><thead><tr><th>SKU</th><th>Producto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Subtotal</th></tr></thead>
    <tbody>${(p.items || []).map((i) => `<tr><td>${esc(i.sku)}</td><td>${esc(i.nombre)}</td><td class="num">${i.cantidad}</td><td class="num">${money(i.precio)}</td><td class="num">${money(i.precio * i.cantidad)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="4">Total</td><td class="num">${money(p.total)}</td></tr></tfoot></table></div>
    <h3 style="margin:16px 0 8px">Cambiar estado</h3><div class="toolbar" data-est></div></div>`);
  const m = VG.modal({ title: `Pedido ${p.numero}`, body, wide: true });
  const est = body.querySelector('[data-est]');
  for (const [k, [l]] of Object.entries(VG.ESTADOS)) {
    const b = VG.h(`<button class="btn small ${p.estado === k ? 'dark' : ''}">${l}</button>`);
    b.onclick = async () => { await VG.post(`/api/pedidos/${p.id}/estado`, { estado: k }); VG.toast(`Pedido ${p.numero}: ${l}`); m.close(); ctx.reload(); };
    est.appendChild(b);
  }
  for (const [f, l] of [['a4', 'Imprimir remito'], ['ticket', 'Etiqueta 10x15']]) { const b = VG.h(`<button class="btn small" style="margin-left:auto">${l}</button>`); b.onclick = () => imprimir([p], f); est.appendChild(b); }
}
const pedidosCrud = {
  entity: 'pedidos', singular: 'pedido', newLabel: '+ Nuevo pedido', createPath: '/api/pedidos', selectable: true, sort: byDateDesc(), dateFilter: 'fecha',
  chips: { k: 'estado', options: [['pendiente', 'Pendientes'], ['para_armar', 'Para armar'], ['para_despachar', 'Para despachar'], ['enviado', 'Enviados'], ['entregado', 'Entregados'], ['cancelado', 'Cancelados'], ['sin_seg', '⚠️ Sin seguimiento']], match: (r, v) => (v === 'sin_seg' ? ['enviado', 'entregado'].includes(r.estado) && !r.tracking : r.estado === v) },
  filters: [{ k: 'plataforma', label: 'Tienda' }, { k: 'tipo_envio', label: 'Envío' }, { k: 'pago', label: 'Pago' }],
  columns: [
    { k: 'numero', label: 'ID', fmt: (v) => `<b>${esc(v)}</b>` }, { k: 'fecha', label: 'Fecha/Hora', fmt: datetime },
    { k: 'plataforma', label: 'Plataforma', fmt: (v) => `<span class="plat">${platIcon(v)} ${esc(v)}</span>` }, { k: 'tipo_envio', label: 'Tipo de envío' },
    { k: 'cliente', label: 'Cliente' }, { k: 'items', label: 'Ítems', get: (r) => (r.items || []).reduce((a, i) => a + i.cantidad, 0), num: true },
    { k: 'total', label: 'Total', fmt: money, num: true }, { k: 'deposito', label: 'Depósito' }, { k: 'pago', label: 'Pago', fmt: tb },
    { k: 'estado', label: 'Estado', fmt: VG.estadoBadge },
  ],
  form: formPedido, canEdit: true, onRow: verPedido,
  footer: totalFoot(['total']),
  toolbar: (ctx) => {
    const sel = () => ctx.rows.filter((r) => ctx.sel.has(r.id));
    const need = (fn) => () => { if (!ctx.sel.size) return VG.toast('Seleccioná pedidos primero', true); fn(sel()); };
    return [
      { label: '🖨 A4', onClick: need((s) => imprimir(s, 'a4')) }, { label: '🖨 A4 sin precios', onClick: need((s) => imprimir(s, 'a4sp')) }, { label: '🖨 Ticket 10x15', onClick: need((s) => imprimir(s, 'ticket')) },
      { label: '→ Pasar a…', onClick: need(async (s) => {
        const f = [{ k: 'estado', label: 'Nuevo estado', type: 'select', options: Object.entries(VG.ESTADOS).map(([k, [l]]) => [k, l]) }];
        const el = VG.form(f, {});
        VG.modal({ title: `Cambiar estado de ${s.length} pedidos`, body: el, onSave: async () => { const { estado } = VG.readForm(el, f); await VG.post('/api/pedidos/estado-masivo', { ids: s.map((x) => x.id), estado }); ctx.sel.clear(); VG.toast('Estados actualizados'); ctx.reload(); } });
      }) },
    ];
  },
};

// ═════════════ Inicio ═════════════
async function renderDashboard(view, actions) {
  const mesSel = VG.h(`<input type="month" value="${VG.today().slice(0, 7)}" style="padding:7px 10px;border:1px solid var(--border);border-radius:8px">`);
  const refresh = VG.h('<button class="btn">↻ Actualizar</button>');
  actions.append(mesSel, refresh);
  const box = VG.h('<div><div class="empty-state">Cargando tablero…</div></div>');
  view.appendChild(box);
  const draw = async () => {
    const d = await VG.get(`/api/stats/dashboard?mes=${mesSel.value}`);
    view.querySelector('h1').textContent = `Hola, ${VG.app.user.nombre || VG.app.tenant?.nombre || ''}`;
    const varTxt = d.variacion == null ? 'sin mes anterior' : `${d.variacion >= 0 ? '▲' : '▼'} ${VG.pct(Math.abs(d.variacion))} vs mes anterior`;
    const avance = d.objetivo ? Math.min(1, d.ventas / d.objetivo) : 0;
    box.innerHTML = `
      <div class="grid g4">
        ${VG.kpi({ label: 'Ventas del mes', value: money(d.ventas), sub: `<span class="badge ${d.variacion >= 0 ? 'ok' : 'err'}">${varTxt}</span>` })}
        ${VG.kpi({ label: 'Pedidos', value: VG.n(d.pedidos), sub: `${VG.n(d.unidades)} unidades despachadas`, tone: 'info' })}
        ${VG.kpi({ label: 'Ticket promedio', value: money(d.ticket), sub: `${d.clientes} clientes distintos` })}
        ${VG.kpi({ label: 'Proyección de cierre', value: VG.moneyShort(d.proyeccion), sub: `Acumulado del año: ${VG.moneyShort(d.acumuladoAnio)}`, tone: 'info' })}
      </div>
      <div class="grid g6" style="margin-top:14px">${Object.entries(d.contadores).map(([k, n]) => `<a href="#pedidos" class="card" style="text-decoration:none;color:inherit;padding:12px"><div class="muted small">${VG.ESTADOS[k][0]}</div><div style="font-size:20px;font-weight:800">${n}</div></a>`).join('')}</div>
      <div class="grid g2" style="margin-top:14px;grid-template-columns:2fr 1fr">
        <div class="card"><h3>Ventas día a día</h3>${VG.lineChart(d.porDia.filter((p) => p.fecha <= VG.today()).map((p) => ({ x: p.fecha.slice(8), y: p.total })))}</div>
        <div class="card"><h3>Objetivo del mes</h3>
          ${d.objetivo ? `<div style="font-size:22px;font-weight:800">${VG.pct(avance)}</div><div class="progress" style="margin:8px 0"><div style="width:${avance * 100}%"></div></div><div class="small muted">${money(d.ventas)} de ${money(d.objetivo)}</div>` : '<div class="muted">Sin objetivo cargado.</div>'}
          <button class="btn small" data-obj style="margin-top:10px">Cargar objetivo del mes</button>
          <h3 style="margin-top:18px">Margen</h3><div style="font-size:22px;font-weight:800">${VG.pct(d.margen)}</div><div class="small muted">sobre costo de mercadería</div>
          <h3 style="margin-top:18px">Incidencias</h3>
          <div class="small">Demorados (+3 días): <b>${d.incidencias.demorados}</b></div>
          <div class="small">Enviados sin seguimiento: <b>${d.incidencias.sinSeguimiento}</b></div>
          <div class="small">Reingresos por aprobar: <b><a href="#auditoria">${d.incidencias.reingresosPendientes}</a></b></div>
          <div class="small">Ventas sin producto en catálogo: <b>${d.incidencias.sinProducto}</b></div>
        </div>
      </div>
      <div class="grid g2" style="margin-top:14px">
        <div class="card"><h3>Qué se vendió</h3>${VG.bars(d.topProductos)}</div>
        <div class="card"><h3>Quién te compró</h3>${VG.bars(d.topClientes, { extra: (r) => `<span class="muted small">(${r.pedidos})</span>` })}</div>
      </div>
      <div class="grid g2" style="margin-top:14px">
        <div class="card"><h3>Por marca</h3><div class="table-wrap"><table class="t"><thead><tr><th>Marca</th><th class="num">Facturación</th><th class="num">Unid.</th><th class="num">MG%</th></tr></thead><tbody>${d.porMarca.map((m) => `<tr><td>${esc(m.nombre)}</td><td class="num">${money(m.facturacion)}</td><td class="num">${m.unidades}</td><td class="num">${m.mg}%</td></tr>`).join('')}</tbody></table></div></div>
        <div class="card"><h3>Alertas de stock</h3><div class="chips" data-al></div><div data-al-list></div><a href="#proyecciones" class="small">Ver en Proyecciones →</a></div>
      </div>`;
    box.querySelector('[data-obj]').onclick = () => {
      const f = [{ k: 'obj', label: `Objetivo de ventas ${d.mes} ($)`, type: 'number' }];
      const el = VG.form(f, { obj: d.objetivo || '' });
      VG.modal({ title: 'Objetivo del mes', body: el, onSave: async () => { await VG.put('/api/settings', { [`objetivo_${d.mes}`]: VG.readForm(el, f).obj }); draw(); } });
    };
    const al = box.querySelector('[data-al]'), list = box.querySelector('[data-al-list]');
    const tipos = [['todas', 'Todas'], ['sin_stock', 'Sin stock'], ['critica', 'Críticas'], ['por_agotarse', 'Por agotarse']];
    const show = (t) => {
      al.innerHTML = tipos.map(([k, l]) => `<button class="chip ${k === t ? 'active' : ''}" data-k="${k}">${l}<b>${k === 'todas' ? d.alertas.length : d.alertas.filter((a) => a.estado === k).length}</b></button>`).join('');
      al.querySelectorAll('.chip').forEach((c) => c.onclick = () => show(c.dataset.k));
      const rows = d.alertas.filter((a) => t === 'todas' || a.estado === t).slice(0, 10);
      list.innerHTML = rows.length ? rows.map((a) => `<div class="bar-row" style="grid-template-columns:1fr auto auto"><span>${esc(a.producto)} <span class="muted small">${esc(a.sku)}</span></span><b class="num">${a.disponible} u.</b>${badge({ sin_stock: 'Sin stock', critica: 'Crítica', por_agotarse: 'Por agotarse' }[a.estado], a.estado === 'por_agotarse' ? 'warn' : 'err')}</div>`).join('') : '<div class="muted">Sin alertas 🎉</div>';
    };
    show('todas');
  };
  refresh.onclick = draw; mesSel.onchange = draw;
  draw().catch((e) => box.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`);
}

// ═════════════ Transporte ═════════════
function renderCotizador(el) {
  el.innerHTML = `<div class="grid g2"><div class="card">
    <p class="muted" style="margin-top:0">Cargá el destino y los bultos y compará en un solo lugar: la flota propia de Vixan (CABA y GBA, precio por zona y tamaño) contra OCA y Andreani para el resto del país.</p>
    <div class="form"><label>CP destino<input data-cp placeholder="Ej: 1414"></label><label>Entrega<select data-ent><option value="domicilio">A domicilio</option><option value="sucursal">A sucursal del correo</option></select></label></div>
    <h3 style="margin:14px 0 6px">Bultos del envío</h3>
    <div class="table-wrap"><table class="t"><thead><tr><th>#</th><th>Peso (kg)</th><th>Alto</th><th>Ancho</th><th>Largo (cm)</th><th></th></tr></thead><tbody data-b></tbody></table></div>
    <div class="toolbar" style="margin-top:10px"><button class="btn small" data-add>+ Agregar bulto</button><button class="btn primary" data-q style="margin-left:auto">💰 Cotizar</button></div>
    <div class="small muted">Un bulto = una caja = una etiqueta. El correo cobra por bulto.</div></div>
    <div class="card" data-res><h3>Resultado</h3><div class="muted">Completá el CP y tocá Cotizar.</div></div></div>`;
  const tbody = el.querySelector('[data-b]');
  const add = (b = { peso: 1, alto: 10, ancho: 20, largo: 30 }) => {
    const tr = VG.h(`<tr><td>${tbody.children.length + 1}</td>${['peso', 'alto', 'ancho', 'largo'].map((k) => `<td><input type="number" data-k="${k}" value="${b[k]}" style="width:80px;padding:5px;border:1px solid var(--border);border-radius:6px"></td>`).join('')}<td><button class="btn small ghost">✕</button></td></tr>`);
    tr.querySelector('button').onclick = () => tr.remove(); tbody.appendChild(tr);
  };
  add();
  el.querySelector('[data-add]').onclick = () => add();
  el.querySelector('[data-q]').onclick = async () => {
    const bultos = [...tbody.children].map((tr) => Object.fromEntries([...tr.querySelectorAll('input')].map((i) => [i.dataset.k, Number(i.value)])));
    const r = await VG.post('/api/cotizar', { cp: el.querySelector('[data-cp]').value, entrega: el.querySelector('[data-ent]').value, bultos }).catch((e) => ({ error: e.message }));
    const res = el.querySelector('[data-res]');
    if (r.error) { res.innerHTML = `<h3>Resultado</h3><div class="note warn">${esc(r.error)}</div>`; return; }
    res.innerHTML = `<h3>Zona: ${esc(r.zona)} · ${r.bultos} bulto(s) · ${VG.n(r.pesoFacturable)} kg facturables</h3>${r.opciones.map((o) => `<div class="card" style="margin:8px 0;padding:12px;${o.recomendado ? 'border-color:var(--teal)' : ''}"><div style="display:flex;justify-content:space-between"><b>${esc(o.transportista)}</b><b style="font-size:18px">${money(o.precio)}</b></div><div class="small muted">${esc(o.servicio)} · ${esc(o.plazo)} ${o.recomendado ? badge('Recomendado', 'teal') : ''}</div></div>`).join('')}<div class="small muted">${esc(r.nota)}</div>`;
  };
}
const despachoCols = [
  { k: 'numero', label: 'Pedido', fmt: (v) => `<b>${esc(v)}</b>` }, { k: 'cliente', label: 'Cliente' }, { k: 'estado', label: 'Estado', fmt: VG.estadoBadge },
  { k: 'eta', label: 'ETA', fmt: date }, { k: 'transportista', label: 'Transportista' }, { k: 'tel_transportista', label: 'Teléfono' },
  { k: 'tracking', label: 'Traza', fmt: (v) => (v ? `<code class="k">${esc(v)}</code>` : badge('Sin seguimiento', 'warn')) },
];
const despachos = (flex) => ({
  entity: 'pedidos', canCreate: false, canDelete: false, canEdit: false, sort: byDateDesc(),
  load: async () => (await VG.get('/api/r/pedidos')).filter((p) => ['para_despachar', 'enviado'].includes(p.estado) && (flex ? p.tipo_envio === 'Flex' : p.tipo_envio !== 'Flex')),
  columns: despachoCols, onRow: verPedido,
  rowActions: (r, ctx) => [{ label: r.estado === 'enviado' ? 'Marcar entregado' : 'Despachar', onClick: async () => { await VG.post(`/api/pedidos/${r.id}/estado`, { estado: r.estado === 'enviado' ? 'entregado' : 'enviado' }); VG.toast('Actualizado'); ctx.reload(); } }],
  empty: 'No hay despachos en curso.',
});

// ═════════════ Proveedores: cuenta corriente ═════════════
const chipDias = (due, hoy) => {
  if (!due) return badge('sin fecha');
  const d = Math.round((Date.parse(due) - Date.parse(hoy)) / 86400000);
  return d < 0 ? badge(`vencida hace ${-d}d`, 'err') : d === 0 ? badge('vence HOY', 'warn') : d <= 7 ? badge(`en ${d}d`, 'warn') : badge(`en ${d}d`, 'ok');
};
function renderCCProveedores(el) {
  el.innerHTML = '<div class="note">Llevá la cuenta con cada proveedor: cargá las compras (lo que te facturan) y los pagos. Con el plazo de pago de cada uno el sistema calcula cuándo vence; los pagos se imputan a la factura más vieja primero.</div><div data-res></div><div data-det style="margin-top:16px"></div>';
  const load = async () => {
    const r = await VG.get('/api/proveedores/cc/resumen');
    el.querySelector('[data-res]').innerHTML = `<div class="grid g3" style="margin-bottom:12px">${VG.kpi({ label: 'Total a pagar', value: money(r.totalPorPagar), tone: 'err' })}</div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Proveedor</th><th>CUIT</th><th class="num">Plazo</th><th class="num">Saldo (le debés)</th><th>Próx. venc.</th><th>Días</th><th></th></tr></thead><tbody>
      ${r.suppliers.map((s) => `<tr style="cursor:pointer" data-id="${s.id}"><td><b>${esc(s.nombre_fantasia)}</b></td><td>${esc(s.cuit || '—')}</td><td class="num">${s.plazo_pago_dias ?? '—'}d</td><td class="num" style="color:${s.saldo > 0 ? 'var(--err)' : 'var(--ok)'};font-weight:700">${money(s.saldo)}</td><td>${date(s.prox_venc)}</td><td>${s.prox_venc ? chipDias(s.prox_venc, r.hoy) : '—'}</td><td class="muted">ver CC ›</td></tr>`).join('') || '<tr><td class="empty" colspan="7">Cargá proveedores primero.</td></tr>'}</tbody></table></div>`;
    el.querySelectorAll('[data-id]').forEach((tr) => tr.onclick = () => detalle(tr.dataset.id, r.hoy));
  };
  const detalle = async (id, hoy) => {
    const d = await VG.get(`/api/proveedores/${id}/cc`);
    const det = el.querySelector('[data-det]');
    det.innerHTML = `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h3>${esc(d.proveedor.nombre_fantasia)} — saldo ${money(d.saldo)}</h3><button class="btn small" data-close>✕ Cerrar</button></div>
      <div class="toolbar"><select data-tipo><option value="compra">Compra (le debo)</option><option value="pago">Pago que hice</option></select><input type="date" data-f value="${VG.today()}"><input data-fac placeholder="N° factura" style="padding:7px;border:1px solid var(--border);border-radius:8px"><input data-con placeholder="Concepto" style="padding:7px;border:1px solid var(--border);border-radius:8px"><input type="number" data-m placeholder="Monto" style="padding:7px;border:1px solid var(--border);border-radius:8px;width:130px"><button class="btn primary" data-add>+ Agregar</button></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Fecha</th><th>Factura</th><th>Concepto</th><th class="num">Compra</th><th class="num">Pago</th><th>Vence</th><th>Estado</th><th></th></tr></thead><tbody>
      ${d.movimientos.map((m) => `<tr><td>${date(m.fecha)}</td><td>${m.nro_factura ? `<code class="k">${esc((m.tipo_factura || '') + ' ' + m.nro_factura)}</code>` : '<span class="muted small">—</span>'}</td><td>${esc(m.concepto || '')}</td><td class="num">${m.debito ? money(m.debito) : '—'}</td><td class="num">${m.credito ? money(m.credito) : '—'}</td><td>${date(m.due_date)}</td><td>${m.debito ? (m.pendiente < 1 ? badge('pagada', 'ok') : chipDias(m.due_date, hoy) + (m.pagado ? `<div class="small muted">debe ${money(m.pendiente)}</div>` : '')) : ''}</td><td><button class="btn small ghost" data-del="${m.id}">✕</button></td></tr>`).join('') || '<tr><td class="empty" colspan="8">Sin movimientos.</td></tr>'}</tbody></table></div></div>`;
    det.querySelector('[data-close]').onclick = () => det.innerHTML = '';
    det.querySelector('[data-add]').onclick = async () => {
      const m = Number(det.querySelector('[data-m]').value); if (!(m > 0)) return VG.toast('Monto inválido', true);
      const compra = det.querySelector('[data-tipo]').value === 'compra';
      await VG.post('/api/r/cc_proveedores', { proveedor_id: Number(id), fecha: det.querySelector('[data-f]').value, tipo_factura: compra ? 'A' : '', nro_factura: det.querySelector('[data-fac]').value, concepto: det.querySelector('[data-con]').value || (compra ? 'Compra' : 'Pago'), debito: compra ? m : 0, credito: compra ? 0 : m });
      VG.toast('Movimiento cargado'); await load(); detalle(id, hoy);
    };
    det.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!VG.confirm('¿Borrar movimiento?')) return; await VG.del(`/api/r/cc_proveedores/${b.dataset.del}`); await load(); detalle(id, hoy); });
    det.scrollIntoView({ behavior: 'smooth' });
  };
  load();
}
async function renderCalendario(el) {
  const c = await VG.get('/api/proveedores/cc/calendario');
  const grupo = (t, items, tone) => `<div class="card" style="margin-bottom:12px"><h3>${t} — ${money(items.reduce((a, i) => a + i.pendiente, 0))}</h3><div class="table-wrap"><table class="t"><thead><tr><th>Vence</th><th>Proveedor</th><th>Factura</th><th class="num">Pendiente</th><th>Días</th></tr></thead><tbody>${items.map((i) => `<tr><td>${date(i.due_date)}</td><td>${esc(i.proveedor)}</td><td><code class="k">${esc(i.nro_factura || '—')}</code></td><td class="num">${money(i.pendiente)}</td><td>${chipDias(i.due_date, c.hoy)}</td></tr>`).join('') || '<tr><td class="empty" colspan="5">Nada en este grupo.</td></tr>'}</tbody></table></div></div>`;
  el.innerHTML = `<div class="grid g3" style="margin-bottom:14px">${VG.kpi({ label: 'VENCIDO', value: money(c.totales.vencido), tone: 'err' })}${VG.kpi({ label: 'VENCE EN 7 DÍAS', value: money(c.totales.semana), tone: 'warn' })}${VG.kpi({ label: 'A FUTURO', value: money(c.totales.futuro) })}</div>
    ${grupo('Vencido', c.grupos.vencido)}${grupo('Esta semana', c.grupos.semana)}${grupo('A futuro', c.grupos.futuro)}`;
}

// ═════════════ Proyecciones ═════════════
async function renderPanorama(el) {
  const rows = await VG.get('/api/stats/proyecciones');
  const k = (l, v, tone) => VG.kpi({ label: l, value: v, tone });
  el.innerHTML = `<div class="grid g4" style="margin-bottom:14px">${k('Stock valorizado a venta', VG.moneyShort(sumBy(rows, 'valorVenta')))}${k('Stock valorizado a costo', VG.moneyShort(sumBy(rows, 'valorCosto')), 'info')}${k('SKUs sin stock', rows.filter((r) => r.estado === 'Sin stock').length, 'err')}${k('SKUs a reponer', rows.filter((r) => r.aComprar > 0).length, 'warn')}</div><div data-t></div>`;
  VG.crud(el.querySelector('[data-t]'), {
    title: 'Panorama de stock', load: async () => rows, canCreate: false, canDelete: false, canEdit: false, filters: [{ k: 'marca', label: 'Marca' }, { k: 'estado', label: 'Estado' }],
    columns: [{ k: 'sku', label: 'SKU' }, { k: 'producto', label: 'Producto' }, { k: 'marca', label: 'Marca' }, { k: 'fabricante', label: 'Fabricante' }, { k: 'stock', label: 'Stock', num: true }, { k: 'precio', label: 'Precio', fmt: money, num: true }, { k: 'valorVenta', label: 'Valorizado venta', fmt: money, num: true }, { k: 'valorCosto', label: 'Valorizado costo', fmt: money, num: true }, { k: 'v30', label: 'Vend. 30d', num: true }, { k: 'promMensual', label: 'Prom. mensual', num: true }, { k: 'diasStock', label: 'Días de stock', num: true, fmt: (v) => (v == null ? '∞' : v) }, { k: 'aComprar', label: 'A comprar', num: true, fmt: (v) => (v ? `<b>${v}</b>` : '—') }, { k: 'estado', label: 'Estado', fmt: tb }, { k: 'ultima', label: 'Última venta', fmt: date }],
  });
}
async function renderReposicion(el) {
  const rows = (await VG.get('/api/stats/proyecciones')).filter((r) => r.aComprar > 0).sort((a, b) => (a.diasStock ?? 1e9) - (b.diasStock ?? 1e9));
  rows.forEach((r, i) => r.id = i + 1);
  const ctx = VG.crud(el, {
    title: 'Sugerencia de reposición', load: async () => rows, selectable: true, canDelete: false, canCreate: false, canEdit: false,
    note: 'Cantidad sugerida = velocidad de venta (últimos 30 días) × 30 días de cobertura + stock mínimo − stock disponible. Seleccioná y generá las órdenes de compra en borrador, agrupadas por proveedor.',
    filters: [{ k: 'proveedor', label: 'Proveedor' }],
    columns: [{ k: 'producto', label: 'Producto' }, { k: 'proveedor', label: 'Proveedor' }, { k: 'stock', label: 'Stock hoy', num: true }, { k: 'v30', label: 'Ventas 30d', num: true }, { k: 'v7', label: 'Ventas 7d', num: true }, { k: 'velocidad', label: 'Velocidad/día', num: true }, { k: 'diasStock', label: 'Días de cobertura', num: true, fmt: (v) => (v == null ? '—' : v) }, { k: 'estado', label: 'Estado', fmt: tb }, { k: 'aComprar', label: 'A comprar', num: true, fmt: (v) => `<b>${v}</b>` }],
    toolbar: (c) => [{ label: `📦 Crear OC en borrador (${c.sel.size})`, primary: true, disabled: !c.sel.size, onClick: async () => { const items = rows.filter((r) => c.sel.has(r.id)); const r = await VG.post('/api/proyecciones/crear-oc', { items }); VG.toast(`${r.length} órdenes de compra creadas`); location.hash = '#reabastecimiento'; } }],
  });
  return ctx;
}
async function renderAnalisisVentas(el) {
  const pedidos = (await VG.get('/api/r/pedidos')).filter((p) => p.estado !== 'cancelado');
  el.innerHTML = `<div class="toolbar"><select data-per><option value="30">30 días</option><option value="7">7 días</option><option value="90">90 días</option><option value="365">12 meses</option></select><select data-agr><option value="dia">Por día</option><option value="semana">Por semana</option><option value="mes">Por mes</option></select></div><div class="card" data-ch></div><div class="grid g2" style="margin-top:14px"><div class="card" data-pl></div><div class="card" data-en></div></div>`;
  const draw = () => {
    const dias = Number(el.querySelector('[data-per]').value), agr = el.querySelector('[data-agr]').value;
    const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
    const rows = pedidos.filter((p) => p.fecha.slice(0, 10) >= desde);
    const key = (f) => (agr === 'mes' ? f.slice(0, 7) : agr === 'semana' ? (() => { const d = new Date(f.slice(0, 10)); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10); })() : f.slice(0, 10));
    const g = {}; for (const p of rows) g[key(p.fecha)] = (g[key(p.fecha)] || 0) + p.total;
    const pts = Object.entries(g).sort().map(([x, y]) => ({ x: agr === 'mes' ? x : x.slice(5), y }));
    el.querySelector('[data-ch]').innerHTML = `<h3>Ventas en el tiempo — ${money(sumBy(rows, 'total'))} en ${rows.length} pedidos</h3>${VG.lineChart(pts)}`;
    const grp = (k) => Object.values(rows.reduce((o, p) => { (o[p[k]] ||= { nombre: p[k], facturacion: 0 }).facturacion += p.total; return o; }, {})).sort((a, b) => b.facturacion - a.facturacion);
    el.querySelector('[data-pl]').innerHTML = `<h3>Por canal</h3>${VG.bars(grp('plataforma'))}`;
    el.querySelector('[data-en]').innerHTML = `<h3>Por tipo de envío</h3>${VG.bars(grp('tipo_envio'))}`;
  };
  el.querySelectorAll('select').forEach((s) => s.onchange = draw); draw();
}

// ═════════════ Resultados / finanzas ═════════════
async function renderResultados(el) {
  const r = await VG.get('/api/stats/resultados');
  const s = r.resumen;
  const fila = (l, v, b) => `<tr><td>${b ? `<b>${l}</b>` : l}</td><td class="num">${b ? `<b>${money(v)}</b>` : money(v)}</td></tr>`;
  el.innerHTML = `<div class="grid g4" style="margin-bottom:14px">${VG.kpi({ label: 'Ingresos', value: VG.moneyShort(s.ingresos) })}${VG.kpi({ label: 'Costos totales', value: VG.moneyShort(s.ingresos - s.ganancia), tone: 'warn' })}${VG.kpi({ label: 'Ganancia', value: VG.moneyShort(s.ganancia), tone: s.ganancia >= 0 ? '' : 'err' })}${VG.kpi({ label: 'Margen neto', value: VG.pct(s.ingresos ? s.ganancia / s.ingresos : 0), tone: 'info' })}</div>
    <div class="grid g2"><div class="card"><h3>Estado de resultados</h3><table class="t">${fila('Ventas', s.ingresos, true)}${fila('− Costo de mercadería', -s.costoProd)}${fila('− Comisiones de plataforma', -s.comision)}${fila('− Envíos', -s.envio)}${fila('− Impuestos', -s.impuestos)}${fila('− Logística (servicio)', -s.logistica)}${fila('= Ganancia', s.ganancia, true)}</table></div>
    <div class="card"><h3>Resultados por plataforma</h3><table class="t"><thead><tr><th>Plataforma</th><th class="num">Bruto</th><th class="num">Comisiones</th><th class="num">Neto</th><th class="num">% Comisión</th></tr></thead><tbody>${r.porPlataforma.map((p) => `<tr><td>${platIcon(p.plataforma)} ${esc(p.plataforma)}</td><td class="num">${money(p.bruto)}</td><td class="num">${money(p.comisiones)}</td><td class="num">${money(p.neto)}</td><td class="num">${VG.pct(p.pct)}</td></tr>`).join('')}</tbody></table></div></div><h3 style="margin:18px 0 8px">Detalle por pedido</h3><div data-t></div>`;
  VG.crud(el.querySelector('[data-t]'), { title: 'Resultados por pedido', load: async () => r.filas, sort: byDateDesc(), canCreate: false, canDelete: false, canEdit: false, dateFilter: 'fecha', filters: [{ k: 'plataforma', label: 'Tienda' }],
    columns: [{ k: 'numero', label: 'Pedido' }, { k: 'fecha', label: 'Fecha', fmt: date }, { k: 'plataforma', label: 'Plataforma' }, { k: 'cliente', label: 'Cliente' }, { k: 'total', label: 'Total', fmt: money, num: true }, { k: 'costoProd', label: 'Costo producto', fmt: money, num: true }, { k: 'envio', label: 'Envío', fmt: money, num: true }, { k: 'comision', label: 'Comisión', fmt: money, num: true }, { k: 'impuestos', label: 'Impuestos', fmt: money, num: true }, { k: 'logistica', label: 'Logística', fmt: money, num: true }, { k: 'ganancia', label: 'Ganancia', num: true, fmt: (v) => `<b style="color:${v >= 0 ? 'var(--ok)' : 'var(--err)'}">${money(v)}</b>` }, { k: 'pct', label: '% Ganancia', num: true, fmt: VG.pct }],
    footer: totalFoot(['total', 'costoProd', 'envio', 'comision', 'impuestos', 'logistica', 'ganancia']) });
}
async function renderCuentaCorriente(el) {
  const r = await VG.get('/api/stats/cuenta-corriente');
  el.innerHTML = `<div class="grid g3" style="margin-bottom:14px">${VG.kpi({ label: 'Servicios a facturar', value: money(r.servicios), sub: `${money(r.costoLog)} por pedido + ${r.pctFact}% de la venta`, tone: 'warn' })}${VG.kpi({ label: 'Cobranzas a rendir', value: money(r.aRendir), sub: 'Efectivo cobrado en la entrega', tone: 'info' })}${VG.kpi({ label: 'Saldo a tu favor', value: money(r.saldo), tone: r.saldo >= 0 ? '' : 'err' })}</div><div data-t></div>`;
  VG.crud(el.querySelector('[data-t]'), { title: 'Cuenta corriente', load: async () => r.filas, sort: byDateDesc(), canCreate: false, canDelete: false, canEdit: false, dateFilter: 'fecha', filters: [{ k: 'cobro', label: 'Cobro' }, { k: 'plataforma', label: 'Plataforma' }],
    columns: [{ k: 'numero', label: 'Pedido' }, { k: 'fecha', label: 'Fecha', fmt: date }, { k: 'plataforma', label: 'Plataforma' }, { k: 'tipo_envio', label: 'Tipo envío' }, { k: 'cliente', label: 'Cliente' }, { k: 'total', label: 'Total pedido', fmt: money, num: true }, { k: 'costoLog', label: 'Costo log.', fmt: money, num: true }, { k: 'costoPct', label: 'Costo % fact.', fmt: money, num: true }, { k: 'cobro', label: 'Estado cobro', fmt: tb }],
    footer: totalFoot(['total', 'costoLog', 'costoPct']) });
}
// ═════════════ Integraciones ═════════════
async function renderIntegraciones(el) {
  const est = await VG.get('/api/integraciones/estado');
  const canales = await VG.get('/api/r/integraciones');
  const card = (n, icon, body) => `<div class="card"><h3>${icon} ${n}</h3>${body}</div>`;
  el.innerHTML = `<div class="grid g4" style="margin-bottom:14px">${VG.kpi({ label: 'Cuentas conectadas', value: canales.filter((c) => c.estado === 'Conectada').length })}${VG.kpi({ label: 'Para revisar', value: canales.filter((c) => c.estado === 'Para revisar').length, tone: 'warn' })}${VG.kpi({ label: 'Sin conectar', value: canales.filter((c) => c.estado === 'Sin conectar').length, tone: 'err' })}${VG.kpi({ label: 'Canales disponibles', value: 5, tone: 'info' })}</div>
  <div class="grid g2">
    ${card('Mercado Libre', '🟡', `<p class="muted">Conectá tu cuenta con OAuth. Las ventas entran solas por notificación (orders_v2) con tipo de envío Flex / Colecta / Full.</p>
      <div>Estado: ${est.ml.conectado ? badge('Conectada: ' + (est.ml.nickname || ''), 'ok') : badge('Sin conectar', 'err')}</div>
      <div class="small muted" style="margin:8px 0">URL de notificaciones para tu app de ML: <code class="k">${esc(est.mlNotificaciones)}</code></div>
      <div class="toolbar"><button class="btn primary" data-ml>Conectar cuenta</button><input data-mlid placeholder="ID de orden" style="padding:7px;border:1px solid var(--border);border-radius:8px"><button class="btn" data-mlimp>Importar venta</button></div>
      ${est.ml.appConfigurada ? '' : '<div class="note warn">El servidor no tiene ML_CLIENT_ID / ML_CLIENT_SECRET. Creá la app en developers.mercadolibre.com.ar y cargalos (ver README).</div>'}`)}
    ${card('WooCommerce', '🟣', `<div data-woo>Cargando…</div>`)}
    ${['Tienda Nube', 'Shopify', 'VTEX'].map((n) => card(n, '🔌', `<p class="muted">Conector en el mismo formato que WooCommerce: webhook de pedidos + API. Se habilita por cliente.</p>${tb((canales.find((c) => c.canal === n) || {}).estado || 'Sin conectar')}`)).join('')}
  </div><h3 style="margin:18px 0 8px">Cuentas por canal</h3><div data-t></div>`;
  VG.crud(el.querySelector('[data-t]'), { entity: 'integraciones', columns: [{ k: 'canal', label: 'Canal' }, { k: 'cuenta', label: 'Cuenta' }, { k: 'estado', label: 'Estado', fmt: tb }, { k: 'ultima_sync', label: 'Última sincronización', fmt: datetime }], form: [{ k: 'canal', label: 'Canal', type: 'select', options: PLATS }, { k: 'cuenta', label: 'Cuenta' }, { k: 'estado', label: 'Estado', type: 'select', options: ['Conectada', 'Para revisar', 'Sin conectar'] }], newLabel: '+ Conectar cuenta' });
  const q = (s) => el.querySelector(s);
  q('[data-ml]').onclick = async () => { try { const r = await VG.post('/api/integraciones/ml/conectar'); location.href = r.url; } catch (e) { VG.toast(e.message, true); } };
  q('[data-mlimp]').onclick = async () => { try { await VG.post('/api/integraciones/ml/importar', { orderId: q('[data-mlid]').value }); VG.toast('Venta importada'); } catch (e) { VG.toast(e.message, true); } };
  renderWoo(el.querySelector('[data-woo]'), est.woo.webhookUrl);
}


async function renderWoo(box, webhookUrl) {
  const w = await VG.get('/api/integraciones/woo/estado');
  const cuando = (f) => (f ? datetime(f) : 'nunca');
  box.innerHTML = `
    <div style="margin-bottom:8px">Estado: ${w.tieneClaves ? badge('Conectada', 'ok') : badge('Sin conectar', 'err')} ${w.auto ? badge(`Automática cada ${w.minutos} min`, 'teal') : ''}</div>
    ${w.ultimo_error ? `<div class="note warn">Último error: ${esc(w.ultimo_error)}</div>` : ''}
    <div class="form">
      <label class="full">URL de la tienda<input data-wurl value="${esc(w.url)}" placeholder="https://mitienda.com.ar"></label>
      <label>Consumer key<input data-wck placeholder="${w.tieneClaves ? 'guardada — dejá vacío para no cambiarla' : 'ck_…'}"></label>
      <label>Consumer secret<input data-wcs type="password" placeholder="${w.tieneClaves ? 'guardada' : 'cs_…'}"></label>
      <label class="check full"><input type="checkbox" data-wauto ${w.auto ? 'checked' : ''}> Traer pedidos nuevos solos, cada ${w.minutos} minutos</label>
      <label class="check full"><input type="checkbox" data-wstock ${w.enviar_stock ? 'checked' : ''}> Enviar el stock de Vixan a la tienda cuando cambie (claves con permiso Lectura/Escritura)</label>
    </div>
    <div class="toolbar" style="margin-top:10px"><button class="btn primary" data-wsave>Guardar</button></div>
    <table class="t wrap" style="margin:6px 0 10px">
      <tr><td><b>1. Productos</b><div class="small muted">Trae todos los productos y variantes con su SKU. Si el SKU ya existe en Vixan, solo lo vincula. ${w.vinculados} vinculados · última vez: ${cuando(w.ultima_import_productos)}</div></td><td style="text-align:right"><button class="btn" data-wprod>Importar productos</button></td></tr>
      <tr><td><b>2. Pedidos</b><div class="small muted">La primera vez trae todos; después, solo los nuevos o modificados. Última vez: ${cuando(w.ultima_sync_pedidos)}</div></td><td style="text-align:right"><button class="btn" data-wsync>Sincronizar pedidos</button></td></tr>
      <tr><td><b>3. Clientes</b><div class="small muted">Trae los clientes con cuenta y los que compraron sin cuenta, vinculados por email, con el DNI/CUIT y la condición de IVA del checkout. Los pedidos nuevos crean o vinculan su cliente solos. ${w.clientesWoo} clientes de la tienda · última vez: ${cuando(w.ultima_import_clientes)}<br>Campos del checkout: DNI/CUIT = <b>${esc(w.campo_doc || 'automático')}</b> · condición IVA = <b>${esc(w.campo_cond || 'automático')}</b> · <a href="#" data-wcampos>detectar / cambiar</a></div></td><td style="text-align:right"><button class="btn" data-wcli>Importar clientes</button></td></tr>
      <tr><td><b>4. Stock</b><div class="small muted">Manda a la tienda el stock disponible de cada producto vinculado. Último envío: ${cuando(w.ultimo_envio_stock)}${w.ultimo_error_stock ? ` · <span style="color:var(--err)">${esc(w.ultimo_error_stock)}</span>` : ''}</div></td><td style="text-align:right"><button class="btn" data-wenv>Enviar stock ahora</button></td></tr>
    </table>
    <details><summary class="small" style="cursor:pointer">Pedidos en tiempo real (webhook, requiere Vixan en un servidor público)</summary>
      <div class="small" style="margin-top:6px">En WooCommerce → Ajustes → Avanzado → Webhooks, creá uno con tema <b>Pedido creado</b> y esta URL:</div><code class="k">${esc(webhookUrl)}</code>
      <label class="small" style="display:block;margin-top:8px">Secreto del webhook<input data-wsec type="password" placeholder="${w.tieneSecretoWebhook ? 'guardado' : 'opcional'}" style="width:100%;padding:7px;border:1px solid var(--border);border-radius:8px"></label>
    </details>`;
  const q = (s) => box.querySelector(s);
  const run = async (btn, label, fn) => { const b = q(btn); const t = b.textContent; b.disabled = true; b.textContent = label; try { await fn(); } catch (e) { VG.toast(e.message, true); } b.disabled = false; b.textContent = t; renderWoo(box, webhookUrl); };
  q('[data-wsave]').onclick = () => run('[data-wsave]', 'Guardando…', async () => { await VG.post('/api/integraciones/woo/config', { url: q('[data-wurl]').value, consumer_key: q('[data-wck]').value, consumer_secret: q('[data-wcs]').value, webhook_secret: q('[data-wsec]').value, auto: q('[data-wauto]').checked, enviar_stock: q('[data-wstock]').checked }); VG.toast('Configuración de WooCommerce guardada'); });
  q('[data-wprod]').onclick = () => {
    const f = [{ k: 'stockInicial', label: 'Cargar como stock inicial la cantidad que tiene cada producto en la tienda (solo productos nuevos en Vixan)', type: 'checkbox', default: true, full: true }];
    const e = VG.form(f);
    VG.modal({ title: 'Importar productos de WooCommerce', body: e, saveLabel: 'Importar', onSave: async () => {
      const r = await VG.post('/api/integraciones/woo/importar-productos', VG.readForm(e, f));
      VG.cache.productos = await VG.get('/api/r/productos');
      VG.modal({ title: 'Importación terminada', body: `<p>Leídos: <b>${r.leidos}</b> · nuevos: <b>${r.creados}</b> · ya existían y se vincularon: <b>${r.actualizados}</b> · con stock inicial: <b>${r.stockCargado}</b></p>${r.sinSku.length ? `<div class="note warn">${r.sinSku.length} productos no tienen SKU en la tienda y no se importaron. Cargales un SKU en WooCommerce y volvé a importar:<br>${r.sinSku.slice(0, 15).map(esc).join('<br>')}${r.sinSku.length > 15 ? '<br>…' : ''}</div>` : ''}<p class="small muted">Completá costo, marca y proveedor de cada producto en Catálogo y precios.</p>` });
      renderWoo(box, webhookUrl);
    } });
  };
  q('[data-wcli]').onclick = () => run('[data-wcli]', 'Importando…', async () => {
    const r = await VG.post('/api/integraciones/woo/importar-clientes');
    VG.modal({ title: 'Clientes importados', body: `<p>Clientes nuevos: <b>${r.creados}</b> · actualizados: <b>${r.actualizados}</b><br>Con cuenta en la tienda: ${r.registrados} · compradores encontrados en pedidos: ${r.dePedidos}<br>Con DNI/CUIT: <b>${r.conDocumento}</b> · con condición de IVA: <b>${r.conCondicion}</b> · pedidos vinculados: ${r.pedidosVinculados}</p>${r.dePedidos && !r.conDocumento ? '<div class="note warn">No se encontró DNI/CUIT en ningún pedido. Tocá "detectar / cambiar" para elegir el campo del checkout.</div>' : ''}<p class="small muted">Los ves en Clientes → Datos de clientes, con la etiqueta WooCommerce.</p>` });
  });
  q('[data-wcampos]').onclick = async (ev) => {
    ev.preventDefault();
    let d; try { d = await VG.get('/api/integraciones/woo/campos'); } catch (x) { return VG.toast(x.message, true); }
    const opts = (sug, actual) => `<option value="">Automático${sug ? ` (detectado: ${esc(sug)})` : ''}</option>` + d.campos.map((c) => `<option value="${esc(c.campo)}" ${c.campo === actual ? 'selected' : ''}>${esc(c.campo)} — ej.: ${esc(c.ejemplos.join(', '))}</option>`).join('');
    const body = VG.h(`<div><p class="small">Revisé tus últimos ${d.pedidosRevisados} pedidos. Estos son los campos extra que guarda tu checkout (por ejemplo, los de Checkout Field Editor):</p>
      <div class="table-wrap" style="max-height:220px;overflow:auto;margin-bottom:12px"><table class="t wrap"><thead><tr><th>Campo</th><th>Ejemplos</th><th class="num">Pedidos</th></tr></thead><tbody>${d.campos.map((c) => `<tr><td><code class="k">${esc(c.campo)}</code></td><td>${esc(c.ejemplos.join(' · '))}</td><td class="num">${c.veces}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">No hay campos extra en los pedidos.</td></tr>'}</tbody></table></div>
      <div class="form"><label>Campo con el DNI / CUIT<select data-cd>${opts(d.sugerido_doc, d.campo_doc)}</select></label><label>Campo con la condición de IVA o tipo de factura<select data-cc>${opts(d.sugerido_cond, d.campo_cond)}</select></label></div>
      <p class="small muted">La condición se interpreta sola: "Responsable Inscripto" o "Factura A" → Responsable Inscripto; "Monotributo"; "Exento"; "Consumidor final" o "Factura B" → Consumidor Final. Si tu checkout no pregunta la condición, queda Consumidor Final y la podés cambiar en la ficha del cliente.</p></div>`);
    VG.modal({ title: 'Campos del checkout', body, wide: true, onSave: async () => { await VG.post('/api/integraciones/woo/campos', { campo_doc: body.querySelector('[data-cd]').value, campo_cond: body.querySelector('[data-cc]').value }); VG.toast('Campos guardados. Volvé a importar clientes para aplicarlos.'); renderWoo(box, webhookUrl); } });
  };
  q('[data-wsync]').onclick = () => run('[data-wsync]', 'Sincronizando…', async () => { const r = await VG.post('/api/integraciones/woo/sincronizar'); VG.toast(`Leídos ${r.leidos} · nuevos ${r.creados}${r.cancelados ? ` · cancelados ${r.cancelados}` : ''}`); });
  q('[data-wenv]').onclick = () => run('[data-wenv]', 'Enviando…', async () => { const r = await VG.post('/api/integraciones/woo/enviar-stock'); VG.toast(r.errores?.length ? `Enviados ${r.enviados}, con errores: ${r.errores[0]}` : `Stock enviado: ${r.enviados} productos`, !!r.errores?.length); });
}


// ═════════════ Facturación electrónica (ARCA) ═════════════
const COND_IVA = ['Consumidor Final', 'Responsable Inscripto', 'Responsable Monotributo', 'IVA Sujeto Exento', 'Sujeto No Categorizado', 'IVA No Alcanzado', 'Cliente del Exterior', 'Monotributista Social', 'Monotributo Trabajador Independiente Promovido'];
const CODIGO_COND = { 'Responsable Inscripto': 1, 'IVA Sujeto Exento': 4, 'Consumidor Final': 5, 'Responsable Monotributo': 6, 'Sujeto No Categorizado': 7, 'Cliente del Exterior': 9, 'Monotributista Social': 13, 'IVA No Alcanzado': 15, 'Monotributo Trabajador Independiente Promovido': 16 };
const imprimirFactura = (id) => window.open(`/api/arca/facturas/${id}/imprimir`, '_blank');
async function avisoArca(el) {
  const e = await VG.get('/api/arca/estado').catch(() => null);
  if (!e) return;
  if (!e.tiene_cert) el.insertAdjacentHTML('afterbegin', `<div class="note warn">Todavía no conectaste Vixan con ARCA. Hacelo en <a href="#configuracion">Configuración → Facturación electrónica (ARCA)</a>.</div>`);
  else if (e.ambiente === 'homologacion') el.insertAdjacentHTML('afterbegin', `<div class="note warn">Estás en <b>modo de prueba (homologación)</b>: los comprobantes no tienen validez fiscal. Pasá a producción en Configuración cuando esté todo probado.</div>`);
}
function resultadoFacturacion(r) {
  const ok = r.filter((x) => x.ok), mal = r.filter((x) => !x.ok);
  VG.modal({ title: 'Resultado de la facturación', body: `<p><b>${ok.length}</b> emitidas · <b>${mal.length}</b> con problemas</p>
    <div class="table-wrap"><table class="t wrap"><thead><tr><th>Pedido</th><th>Resultado</th></tr></thead><tbody>${r.map((x) => `<tr><td>${esc(x.pedido)}</td><td>${x.ok ? `${badge('Factura ' + x.tipo, 'ok')} ${esc(x.factura)} · CAE ${esc(x.cae)}` : `<span style="color:var(--err)">${esc(x.error)}</span>`}</td></tr>`).join('')}</tbody></table></div>` });
}
async function renderComprobantes(el) {
  const box = VG.h('<div></div>'); el.appendChild(box);
  await avisoArca(el);
  const ctx = VG.crud(box, {
    entity: 'facturas', canCreate: false, canEdit: false, canDelete: false, sort: byDateDesc(), dateFilter: 'fecha', filters: [{ k: 'tipo', label: 'Tipo' }, { k: 'estado', label: 'Estado' }],
    columns: [{ k: 'fecha', label: 'Fecha', fmt: date }, { k: 'tipo', label: 'Tipo', fmt: (v) => badge(v, String(v).startsWith('NC') ? 'warn' : 'teal') }, { k: 'numero', label: 'Número' }, { k: 'cliente', label: 'Cliente' }, { k: 'pedido', label: 'Pedido' }, { k: 'total', label: 'Total', fmt: money, num: true }, { k: 'cae', label: 'CAE', fmt: (v, r) => (v ? `<code class="k">${esc(v)}</code>${r.ambiente === 'homologacion' ? ' ' + badge('prueba', 'warn') : ''}` : '<span class="muted small">sin CAE</span>') }, { k: 'estado', label: 'Estado', fmt: (v, r) => (v === 'anulada' ? badge('Anulada por NC ' + (r.anulada_por || ''), 'err') : tb(v)) }],
    footer: totalFoot(['total']),
    toolbar: () => [{ label: '📝 Factura manual', primary: true, onClick: () => VG.facturaManualNueva(() => ctx.reload()) }],
    rowActions: (r, c) => [
      ...(r.cae ? [{ label: 'Imprimir', onClick: () => imprimirFactura(r.id) }] : []),
      ...(r.cae && r.estado === 'emitida' && !/^N[CD] /.test(String(r.tipo)) ? [{ label: r.nc_parcial ? 'NC (resto)' : 'Anular (NC)', tone: 'danger', onClick: () => VG.notaCredito(r, () => c.reload()) }] : []),
    ],
  });
  function facturaManual() {
    const f = [{ k: 'cliente', label: 'Cliente / razón social', required: true }, { k: 'cond_iva_receptor', label: 'Condición frente al IVA', type: 'select', options: COND_IVA.map((x) => [CODIGO_COND[x], x]) }, { k: 'cuit', label: 'CUIT o DNI (obligatorio para A)' }, { k: 'domicilio', label: 'Domicilio' }, { k: 'alicuota', label: 'Alícuota IVA', type: 'select', options: [['21', '21%'], ['10.5', '10,5%']] }, { k: 'items', label: 'Detalle (precios con IVA incluido)', type: 'items' }];
    const e = VG.form(f, { cond_iva_receptor: 5 });
    VG.modal({ title: 'Factura manual', body: e, wide: true, saveLabel: 'Emitir en ARCA', onSave: async () => { const r = await VG.post('/api/arca/factura-manual', VG.readForm(e, f)); VG.toast(`Factura ${r.tipo} ${r.numero} emitida · CAE ${r.cae}`); ctx.reload(); imprimirFactura(r.id); } });
  }
}

async function renderArca(el) {
  const e = await VG.get('/api/arca/estado');
  const paso = (n, titulo, hecho, cuerpo) => `<div class="card" style="margin-bottom:12px;${hecho ? 'border-left:3px solid var(--ok)' : ''}"><h3>${hecho ? '✅' : n + '.'} ${titulo}</h3>${cuerpo}</div>`;
  const datosOk = e.cuit && e.razon_social && e.punto_venta;
  const homo = e.ambiente === 'homologacion';
  el.innerHTML = `
    <div class="note">Para facturar con CAE, Vixan se conecta con ARCA usando un <b>certificado digital</b> a nombre de tu CUIT. Se hace una sola vez. ${homo ? 'Empezá en <b>modo de prueba</b> (homologación): los comprobantes no tienen validez fiscal.' : ''}</div>
    <div class="card" style="margin-bottom:12px"><h3>Ambiente</h3><div class="toolbar" style="margin:0">
      <select data-amb><option value="homologacion" ${homo ? 'selected' : ''}>Prueba (homologación)</option><option value="produccion" ${!homo ? 'selected' : ''}>Producción (facturas reales)</option></select>
      ${homo ? badge('Modo prueba', 'warn') : badge('Producción', 'ok')}<span class="small muted">El certificado de prueba y el de producción son distintos: al cambiar de ambiente, repetí los pasos 2 y 3.</span></div></div>
    ${paso(1, 'Datos fiscales', datosOk, datosOk ? `<div class="small">${esc(e.razon_social)} · CUIT ${esc(e.cuit)} · ${esc(e.condicion_iva || 'Responsable Inscripto')} · Punto de venta ${esc(e.punto_venta)}</div>` : '<div class="small">Completá razón social, CUIT y punto de venta en la pestaña <b>Datos de facturación</b>.</div>')}
    ${paso(2, 'Pedido de certificado', e.tiene_clave, `<p class="small" style="margin-top:0">Vixan genera una clave privada (queda guardada en Vixan y nunca se muestra) y un archivo de pedido (.csr) para subir a ARCA.</p><button class="btn ${e.tiene_clave ? '' : 'primary'}" data-csr ${datosOk ? '' : 'disabled'}>${e.tiene_clave ? 'Generar uno nuevo' : 'Generar pedido de certificado'}</button> ${e.csr ? '<button class="btn" data-dlcsr>Descargar .csr otra vez</button>' : ''}
      <ol class="small" style="margin-bottom:0">${homo
        ? '<li>Entrá a arca.gob.ar con tu clave fiscal y abrí <b>WSASS – Autogestión Certificados Homologación</b> (si no lo ves, adherilo en "Administrador de Relaciones").</li><li>Elegí <b>Nuevo certificado</b>, poné un nombre (ej. vixan) y pegá el contenido del .csr.</li><li>Copiá el certificado que te devuelve y pegalo en el paso 3. En el mismo WSASS, creá la autorización para el servicio <b>wsfe</b>.</li>'
        : '<li>Entrá a arca.gob.ar con tu clave fiscal y abrí <b>Administración de Certificados Digitales</b>.</li><li>Agregá un alias (ej. vixan), subí el .csr y descargá el certificado (.crt).</li>'}</ol>`)}
    ${paso(3, 'Certificado de ARCA', e.tiene_cert, `${e.tiene_cert ? `<div class="small">Certificado "${esc(e.cert_cn)}" cargado · vence el ${date(e.cert_vence)}</div>` : ''}<div class="toolbar" style="margin-top:8px"><input type="file" data-crtfile accept=".crt,.pem,.cer,.txt" ${e.tiene_clave ? '' : 'disabled'}><span class="small muted">o pegalo:</span></div><textarea data-crt rows="3" placeholder="-----BEGIN CERTIFICATE-----" style="width:100%;font-family:monospace;font-size:11px;padding:8px;border:1px solid var(--border);border-radius:8px" ${e.tiene_clave ? '' : 'disabled'}></textarea><div class="toolbar" style="margin-top:6px"><button class="btn primary" data-savecrt ${e.tiene_clave ? '' : 'disabled'}>Guardar certificado</button></div>`)}
    ${homo ? '' : paso(4, 'Autorizar el certificado y el punto de venta', false, '<ol class="small" style="margin:0"><li>En ARCA, <b>Administrador de Relaciones de Clave Fiscal → Nueva relación</b> → ARCA → WebServices → <b>Facturación Electrónica</b>. Como representante elegí el certificado (alias) que creaste.</li><li>En <b>Administración de puntos de venta y domicilios</b>, creá un punto de venta del tipo <b>"Factura Electrónica – Web Services"</b> y cargá ese número en Datos de facturación.</li></ol>')}
    ${paso(homo ? 4 : 5, 'Probar la conexión', false, `<button class="btn primary" data-probar ${e.tiene_cert ? '' : 'disabled'}>Probar conexión con ARCA</button><div data-res class="small" style="margin-top:8px"></div>`)}`;
  const q = (s) => el.querySelector(s);
  const bajar = (csr) => VG.download(`vixan-${String(e.cuit).replace(/\D/g, '')}.csr`, csr, 'application/pkcs10');
  q('[data-amb]').onchange = async (ev) => { if (ev.target.value === 'produccion' && !VG.confirm('En producción las facturas son reales y tienen validez fiscal. ¿Cambiar a producción?')) { ev.target.value = 'homologacion'; return; } await VG.post('/api/arca/ambiente', { ambiente: ev.target.value }); renderArca(el); };
  q('[data-csr]').onclick = async () => { if (e.tiene_cert && !VG.confirm('Generar un pedido nuevo reemplaza la clave actual: el certificado cargado deja de servir hasta que cargues el nuevo. ¿Seguir?')) return; try { const r = await VG.post('/api/arca/generar-csr', {}); bajar(r.csr); VG.toast('Pedido de certificado descargado'); renderArca(el); } catch (x) { VG.toast(x.message, true); } };
  if (q('[data-dlcsr]')) q('[data-dlcsr]').onclick = () => bajar(e.csr);
  q('[data-crtfile]').onchange = async (ev) => { const f = ev.target.files[0]; if (f) q('[data-crt]').value = await f.text(); };
  q('[data-savecrt]').onclick = async () => { try { const r = await VG.post('/api/arca/certificado', { pem: q('[data-crt]').value }); VG.toast(`Certificado guardado · vence ${date(r.vence)}`); renderArca(el); } catch (x) { VG.toast(x.message, true); } };
  q('[data-probar]').onclick = async () => { const res = q('[data-res]'); res.textContent = 'Conectando con ARCA…'; try { const r = await VG.post('/api/arca/probar'); res.innerHTML = `${badge('Conexión OK', 'ok')} Servidores de ARCA: ${esc(r.servidor.app)} · Punto de venta ${r.punto_venta} · Último número autorizado: ${Object.entries(r.ultimos).map(([k, v]) => `${k}: ${v}`).join(' · ')}`; } catch (x) { res.innerHTML = `<span style="color:var(--err)">${esc(x.message)}</span>`; } };
}

// ═════════════ Configuración ═════════════
function settingsForm(key, fields, intro) {
  return async (el) => {
    const s = await getSettings();
    const f = VG.form(fields, s[key] || {});
    el.innerHTML = intro ? `<div class="note">${intro}</div>` : '';
    const c = VG.h('<div class="card"></div>'); c.appendChild(f);
    const b = VG.h('<div class="toolbar" style="margin-top:12px"><button class="btn primary">Guardar</button></div>');
    b.querySelector('button').onclick = async () => { try { const v = VG.readForm(f, fields); await VG.put('/api/settings', { [key]: v }); settingsCache.v = null; VG.toast('Configuración guardada'); } catch (e) { VG.toast(e.message, true); } };
    c.appendChild(b); el.appendChild(c);
  };
}
async function renderUsuarios(el) {
  const ctx = VG.crud(el, {
    load: () => VG.get('/api/users'), canDelete: false, canEdit: false,
    columns: [{ k: 'nombre', label: 'Nombre' }, { k: 'email', label: 'Email' }, { k: 'rol', label: 'Rol', fmt: (v) => badge(v, v === 'admin' ? 'teal' : '') }, { k: 'activo', label: 'Estado', fmt: (v) => (v ? badge('Activo', 'ok') : badge('Inactivo', 'err')) }, { k: 'created_at', label: 'Alta', fmt: date }],
    toolbar: () => [{ label: '+ Nuevo usuario', primary: true, onClick: () => { const f = [{ k: 'nombre', label: 'Nombre' }, { k: 'email', label: 'Email', type: 'email', required: true }, { k: 'rol', label: 'Rol', type: 'select', options: [['operador', 'Operador'], ['admin', 'Administrador']] }, { k: 'password', label: 'Contraseña inicial (mín. 8)', type: 'password', required: true }]; const e = VG.form(f); VG.modal({ title: 'Nuevo usuario', body: e, onSave: async () => { await VG.post('/api/users', VG.readForm(e, f)); VG.toast('Usuario creado'); ctx.reload(); } }); } }],
    rowActions: (r, c) => [{ label: r.activo ? 'Desactivar' : 'Activar', onClick: async () => { await VG.put(`/api/users/${r.id}`, { activo: !r.activo }); c.reload(); } }, { label: 'Cambiar clave', onClick: () => { const f = [{ k: 'password', label: 'Nueva contraseña (mín. 8)', type: 'password', required: true }]; const e = VG.form(f); VG.modal({ title: `Clave de ${r.email}`, body: e, onSave: async () => { await VG.put(`/api/users/${r.id}`, VG.readForm(e, f)); VG.toast('Clave actualizada'); } }); } }],
  });
}
async function renderApi(el) {
  el.innerHTML = `<div class="note">API de Vixan: autenticá con el encabezado <code class="k">X-Api-Key</code>. Ej.: <code class="k">GET /api/r/pedidos</code>, <code class="k">POST /api/pedidos</code>, <code class="k">GET /api/stats/stock</code>.</div><h3 style="margin-bottom:8px">Claves de acceso</h3><div data-k></div><h3 style="margin:18px 0 8px">Webhooks salientes</h3><div data-w></div><h3 style="margin:18px 0 8px">Últimos eventos</h3><div data-e></div>`;
  const kctx = VG.crud(el.querySelector('[data-k]'), { load: () => VG.get('/api/api-keys'), search: false, canEdit: false, canDelete: false,
    columns: [{ k: 'nombre', label: 'Nombre' }, { k: 'prefijo', label: 'Clave', fmt: (v) => `<code class="k">${esc(v)}…</code>` }, { k: 'created_at', label: 'Creada', fmt: date }],
    toolbar: () => [{ label: 'Crear clave', primary: true, onClick: async () => { const nombre = prompt('Nombre de la clave (ej: ERP)'); if (!nombre) return; const r = await VG.post('/api/api-keys', { nombre }); VG.modal({ title: 'Clave creada', body: `<p>Copiala ahora: no se vuelve a mostrar.</p><code class="k" style="font-size:14px">${esc(r.key)}</code>` }); kctx.reload(); } }],
    rowActions: (r, c) => [{ label: 'Revocar', tone: 'danger', onClick: async () => { if (!VG.confirm('¿Revocar clave?')) return; await VG.del(`/api/api-keys/${r.id}`); c.reload(); } }] });
  VG.crud(el.querySelector('[data-w]'), { entity: 'webhooks', search: false, columns: [{ k: 'evento', label: 'Evento' }, { k: 'url', label: 'URL' }, { k: 'activo', label: 'Estado', fmt: (v) => (v ? badge('Activo', 'ok') : badge('Pausado')) }], form: [{ k: 'evento', label: 'Evento', type: 'select', options: ['pedido.creado', 'pedido.estado', 'stock.cambio'] }, { k: 'url', label: 'URL', full: true }, { k: 'activo', label: 'Activo', type: 'checkbox', default: true }], newLabel: 'Crear webhook' });
  VG.crud(el.querySelector('[data-e]'), { load: () => VG.get('/api/eventos'), canCreate: false, canEdit: false, canDelete: false, columns: [{ k: 'created_at', label: 'Fecha', fmt: datetime }, { k: 'tipo', label: 'Evento' }, { k: 'detalle', label: 'Detalle' }] });
}

// ═════════════ Tienda online (Vixan Market / Vixan Tienda) ═════════════
async function tiendaConfig(el) {
  const [s, est] = await Promise.all([getSettings(), VG.get('/api/tienda/estado')]);
  const cfgT = s.tienda || {};
  const fields = [
    { k: 'nombre', label: 'Nombre de la tienda' },
    { k: 'lista', label: 'Lista de precios de la tienda', type: 'select', options: est.listas.map((l) => [String(l.id), l.nombre]) },
    { k: 'dominio', label: 'Dirección de la tienda', placeholder: 'https://tutiendaconia.com.ar' },
    { k: 'ocultos', label: 'SKUs que no se muestran en la tienda', type: 'textarea', full: true, placeholder: 'VG-1001, VG-1002' },
  ];
  const valorLista = est.listas.find((l) => String(l.id) === String(cfgT.lista) || l.nombre === cfgT.lista)?.id ?? 'general';
  const cuando = (f) => (f ? datetime(f) : 'nunca');
  el.innerHTML = `<div class="note">Tu tienda online muestra los productos marcados con <b>Publicar en la tienda</b> en el catálogo, con el precio de la lista que elijas acá y el stock disponible. Los productos sin precio en esa lista no se muestran.</div>
  <div class="grid g4" style="margin-bottom:14px">${VG.kpi({ label: 'Productos en la tienda', value: est.publicados, tone: 'teal' })}${VG.kpi({ label: 'Marcados para publicar', value: est.marcados })}${VG.kpi({ label: 'Lista de precios', value: esc(est.lista) })}${VG.kpi({ label: 'Última conexión de la tienda', value: est.conexion ? datetime(est.conexion.ultima) : 'nunca', tone: est.conexion ? 'ok' : 'warn' })}</div>
  <div class="grid g2"><div class="card" data-cfg><h3>Datos de la tienda</h3></div>
  <div class="card"><h3>🔗 Conexión con Vixan Tienda</h3>
    <p class="muted">La tienda se conecta a Vixan con una <b>clave de tienda</b>: solo puede leer el catálogo publicado, no ve pedidos, clientes ni nada más de tu cuenta.</p>
    <div style="margin:8px 0">Estado: ${est.clave ? badge(`Clave ${est.clave.prefijo}… creada el ${date(est.clave.created_at)}`, 'ok') : badge('Sin clave', 'err')}</div>
    <div class="small muted">Última vez que la tienda leyó el catálogo: <b>${cuando(est.conexion?.ultima)}</b></div>
    <div class="small" style="margin:10px 0 4px">Dirección de Vixan para la configuración de la tienda:</div><code class="k">${esc(est.urlApi)}</code>
    <div class="toolbar" style="margin-top:12px"><button class="btn primary" data-clave>${est.clave ? 'Generar clave nueva' : 'Generar clave de la tienda'}</button>${est.clave ? '<button class="btn" data-revocar>Desconectar</button>' : ''}<button class="btn" data-ver>Ver qué publica</button></div>
  </div></div>`;
  const f = VG.form(fields, { ...cfgT, lista: String(valorLista) });
  const box = el.querySelector('[data-cfg]'); box.appendChild(f);
  const b = VG.h('<div class="toolbar" style="margin-top:12px"><button class="btn primary">Guardar</button></div>'); box.appendChild(b);
  b.querySelector('button').onclick = async () => { try { await VG.put('/api/settings', { tienda: { ...cfgT, ...VG.readForm(f, fields) } }); settingsCache.v = null; VG.toast('Configuración de la tienda guardada'); tiendaConfig(el); } catch (e) { VG.toast(e.message, true); } };
  el.querySelector('[data-clave]').onclick = async () => {
    if (est.clave && !VG.confirm('La clave anterior deja de funcionar: vas a tener que cargar la nueva en la tienda. ¿Seguimos?')) return;
    try {
      const r = await VG.post('/api/tienda/clave');
      VG.modal({ title: 'Clave de la tienda', body: `<p>Copiala ahora: no se vuelve a mostrar.</p><code class="k" style="font-size:14px;word-break:break-all">${esc(r.key)}</code><p class="small muted" style="margin-top:10px">En la tienda va en la variable <code class="k">VIXAN_TIENDA_CLAVE</code> (o en config.json → vixan → clave).</p>` });
      tiendaConfig(el);
    } catch (e) { VG.toast(e.message, true); }
  };
  el.querySelector('[data-revocar]')?.addEventListener('click', async () => { if (!VG.confirm('La tienda deja de recibir el catálogo. ¿Desconectar?')) return; await VG.del('/api/tienda/clave'); VG.toast('Tienda desconectada'); tiendaConfig(el); });
  el.querySelector('[data-ver]').onclick = async () => {
    const d = await VG.get('/api/tienda/vista-previa');
    VG.modal({ title: `Lo que ve la tienda (${d.productos.length} productos)`, wide: true, body: d.productos.length
      ? `<table class="t"><thead><tr><th>SKU</th><th>Producto</th><th>Categoría</th><th class="num">Precio</th><th class="num">Stock</th><th class="num">Fotos</th></tr></thead><tbody>${d.productos.map((p) => `<tr><td><code class="k">${esc(p.sku)}</code></td><td>${esc(p.nombre)}</td><td>${esc([p.categoria, p.subcategoria].filter(Boolean).join(' › ') || '—')}</td><td class="num">${money(p.precio)}</td><td class="num">${VG.n(p.stock)}</td><td class="num">${p.imagenes.length}</td></tr>`).join('')}</tbody></table>`
      : '<p>Todavía no hay productos para la tienda. En Catálogo, editá cada producto y marcá <b>Publicar en la tienda</b>; tiene que tener precio en la lista elegida.</p>' });
  };
}

// ═════════════ WhatsApp ═════════════
async function renderWhatsapp(el) {
  const convs = (await VG.get('/api/r/wa_conversaciones')).sort(byDateDesc());
  el.innerHTML = `<div class="note warn">Para enviar mensajes reales hace falta conectar WhatsApp Cloud API (Meta) con el número de tu marca. Mientras tanto la bandeja funciona con los datos guardados.</div><div class="chat"><div class="card chat-list" style="padding:0;overflow:auto;max-height:560px"></div><div class="card" data-v><div class="empty-state">Elegí una conversación.</div></div></div>`;
  const list = el.querySelector('.chat-list');
  list.innerHTML = convs.map((c) => `<div class="it" data-id="${c.id}"><div style="display:flex;justify-content:space-between"><b>${esc(c.contacto)}</b><span class="small muted">${datetime(c.fecha)}</span></div><div class="small muted">${esc(c.ultimo_mensaje)}</div>${tb(c.estado)}</div>`).join('');
  list.querySelectorAll('.it').forEach((it) => it.onclick = () => {
    const c = convs.find((x) => x.id == it.dataset.id);
    const v = el.querySelector('[data-v]');
    const msgs = c.mensajes || [{ dir: 'in', txt: c.ultimo_mensaje }];
    v.innerHTML = `<h3>${esc(c.contacto)} <span class="muted small">${esc(c.telefono)}</span></h3><div data-m style="min-height:300px">${msgs.map((m) => `<div class="bubble ${m.dir}">${esc(m.txt)}</div>`).join('')}</div><div class="toolbar"><input data-txt placeholder="Escribí un mensaje…" style="flex:1;padding:9px;border:1px solid var(--border);border-radius:8px"><button class="btn primary" data-s>Enviar</button></div>`;
    v.querySelector('[data-s]').onclick = async () => { const txt = v.querySelector('[data-txt]').value.trim(); if (!txt) return; msgs.push({ dir: 'out', txt }); await VG.put(`/api/r/wa_conversaciones/${c.id}`, { mensajes: msgs, estado: 'Respondido', fecha: new Date().toISOString() }); c.mensajes = msgs; it.click(); };
  });
}

// ═════════════ Panel Vixan (superadmin) ═════════════
async function renderAdmin(el) {
  const sis = VG.h('<div class="card" style="margin-bottom:14px"><h3>Servidor</h3><div data-s class="small">Cargando…</div></div>');
  el.appendChild(sis);
  const lista = VG.h('<div></div>'); el.appendChild(lista);
  VG.get('/api/admin/sistema').then((s) => {
    const gb = (n) => (n / 1073741824).toFixed(1) + ' GB';
    const pctD = s.disco ? 1 - s.disco.libre / s.disco.total : 0;
    const pctM = 1 - s.memoria.libre / s.memoria.total;
    const barra = (p) => `<div class="progress" style="margin:4px 0 8px"><div style="width:${Math.round(p * 100)}%;${p > 0.85 ? 'background:#ef4444' : ''}"></div></div>`;
    sis.querySelector('[data-s]').innerHTML = `<div class="grid g3">
      <div>Disco: <b>${s.disco ? gb(s.disco.total - s.disco.libre) + ' de ' + gb(s.disco.total) : '—'}</b>${s.disco ? barra(pctD) : ''}${pctD > 0.85 ? '<span style="color:var(--err)">Queda poco espacio: borrá copias viejas o pasá a un plan más grande.</span>' : ''}</div>
      <div>Memoria: <b>${gb(s.memoria.total - s.memoria.libre)} de ${gb(s.memoria.total)}</b>${barra(pctM)}</div>
      <div>Base de datos: <b>${(s.base / 1048576).toFixed(1)} MB</b><br>Vixan <b>${esc(s.version)}</b> · Node ${esc(s.node)} · encendido hace ${Math.round(s.uptime / 3600)} h</div></div>
      <div class="toolbar" style="margin:6px 0 0"><a class="btn" href="/api/admin/copia">⬇ Descargar copia de seguridad</a><span class="muted">Guardala en tu computadora o en la nube, fuera del servidor. Conviene hacerlo una vez por semana.</span></div>`;
  }).catch((e) => { sis.querySelector('[data-s]').textContent = e.message; });
  el = lista;
  const ctx = VG.crud(el, {
    load: () => VG.get('/api/admin/tenants'), canEdit: false, canDelete: false,
    note: 'Tus clientes de Vixan. Cada uno tiene sus datos separados, sus usuarios y su propia URL de webhook. Desde el selector de arriba podés entrar a la cuenta de cualquiera para dar soporte.',
    columns: [{ k: 'nombre', label: 'Cliente' }, { k: 'plan', label: 'Plan', fmt: (v) => badge(v, 'teal') }, { k: 'usuarios', label: 'Usuarios', num: true }, { k: 'pedidos', label: 'Pedidos', num: true }, { k: 'activo', label: 'Estado', fmt: (v) => (v ? badge('Activo', 'ok') : badge('Suspendido', 'err')) }, { k: 'created_at', label: 'Alta', fmt: date }],
    toolbar: () => [{ label: '+ Nuevo cliente', primary: true, onClick: () => { const f = [{ k: 'nombre', label: 'Nombre del negocio', required: true }, { k: 'plan', label: 'Plan', type: 'select', options: ['basico', 'estandar', 'pro'] }, { k: 'nombreUsuario', label: 'Nombre del usuario' }, { k: 'email', label: 'Email de acceso', type: 'email', required: true }, { k: 'password', label: 'Contraseña inicial (mín. 8)', type: 'password', required: true }]; const e = VG.form(f, { plan: 'estandar' }); VG.modal({ title: 'Nuevo cliente', body: e, onSave: async () => { await VG.post('/api/admin/tenants', VG.readForm(e, f)); VG.toast('Cliente creado'); ctx.reload(); } }); } }],
    rowActions: (r, c) => [{ label: r.activo ? 'Suspender' : 'Reactivar', onClick: async () => { await VG.put(`/api/admin/tenants/${r.id}`, { activo: !r.activo }); c.reload(); } }, { label: 'Entrar', onClick: async () => { await VG.post('/api/auth/switch-tenant', { tenantId: r.id }); location.hash = '#dashboard'; location.reload(); } }],
  });
}

// ═════════════ Definición del menú ═════════════
const prodOptions = () => (VG.cache.productos || []).map((p) => [p.sku, `${p.sku} — ${p.nombre}`]);
VG.MODULES = [
  { id: 'dashboard', label: 'Inicio', icon: '🏠', group: 'General', title: 'Inicio', desc: 'Resumen de operaciones en tiempo real', render: renderDashboard },
  { id: 'pedidos', label: 'Pedidos', icon: '📦', group: 'General', title: 'Gestión de pedidos', desc: 'Gestioná, imprimí y despachá todos tus pedidos de todos los canales.', tabs: [{ label: 'Pedidos', crud: pedidosCrud }] },
  { id: 'transporte', label: 'Transporte', icon: '🚚', group: 'General', title: 'Transporte y entregas', desc: 'Seguimiento de despachos, transportistas y comprobantes de entrega.', tabs: [
    { label: '⚡ Despacho Flex', crud: despachos(true) }, { label: '📦 Otros despachos', crud: despachos(false) },
    { label: '📋 Comprobantes', crud: { entity: 'comprobantes', sort: byDateDesc(), filters: [{ k: 'estado', label: 'Estado' }, { k: 'transportista', label: 'Transportista' }, { k: 'usuario', label: 'Usuario' }], columns: [{ k: 'fecha', label: 'Fecha', fmt: date }, { k: 'pedido', label: 'Pedido' }, { k: 'cliente', label: 'Cliente' }, { k: 'estado', label: 'Estado', fmt: tb }, { k: 'transportista', label: 'Transportista' }, { k: 'recibio', label: 'Recibió' }, { k: 'dni', label: 'DNI' }, { k: 'usuario', label: 'Usuario' }], form: [{ k: 'pedido', label: 'Pedido' }, { k: 'cliente', label: 'Cliente' }, { k: 'fecha', label: 'Fecha', type: 'date' }, { k: 'estado', label: 'Estado', type: 'select', options: ['Entregado', 'Pendiente', 'En camino', 'Cancelado'] }, { k: 'transportista', label: 'Transportista' }, { k: 'recibio', label: 'Recibió' }, { k: 'dni', label: 'DNI' }, { k: 'usuario', label: 'Usuario' }] } },
    { label: '📮 Cotizador de envíos', render: renderCotizador },
    { label: '📡 Seguimiento', crud: { entity: 'pedidos', canCreate: false, canEdit: false, canDelete: false, sort: byDateDesc(), load: async () => (await VG.get('/api/r/pedidos')).filter((p) => p.estado !== 'cancelado').slice(0, 300), chips: { k: 'estado', options: Object.entries(VG.ESTADOS).filter(([k]) => k !== 'cancelado').map(([k, [l]]) => [k, l]) }, columns: [{ k: 'numero', label: 'Pedido' }, { k: 'fecha', label: 'Fecha', fmt: datetime }, { k: 'plataforma', label: 'Canal' }, { k: 'tipo_envio', label: 'Envío' }, { k: 'cliente', label: 'Cliente' }, { k: 'localidad', label: 'Destino' }, { k: 'estado', label: 'Estado', fmt: VG.estadoBadge }, { k: 'tracking', label: 'Traza', fmt: (v) => (v ? `<code class="k">${esc(v)}</code>` : '—') }], onRow: verPedido } },
  ] },
  { id: 'presupuestos', label: 'Presupuestos', icon: '🧾', group: 'General', title: 'Presupuestos', tabs: [{ label: 'Presupuestos', crud: { entity: 'presupuestos', singular: 'presupuesto', newLabel: '+ Nuevo presupuesto', sort: byDateDesc(), filters: [{ k: 'estado', label: 'Estado' }],
    defaults: () => ({ fecha: VG.today(), estado: 'Borrador' }), beforeSave: (d) => ({ ...d, total: (d.items || []).reduce((a, i) => a + i.cantidad * i.precio, 0) }),
    columns: [{ k: 'numero', label: 'Nro' }, { k: 'fecha', label: 'Fecha', fmt: date }, { k: 'cliente', label: 'Cliente' }, { k: 'items', label: 'Detalle', fmt: (v) => `<span class="small">${esc(itemsTxt(v))}</span>` }, { k: 'total', label: 'Total', fmt: money, num: true }, { k: 'estado', label: 'Estado', fmt: tb }],
    form: [{ k: 'numero', label: 'Número' }, { k: 'fecha', label: 'Fecha', type: 'date' }, { k: 'cliente', label: 'Cliente', required: true }, { k: 'estado', label: 'Estado', type: 'select', options: ['Borrador', 'Enviado', 'Aceptado', 'Vencido', 'Convertido'] }, { k: 'items', label: 'Productos', type: 'items' }],
    rowActions: (r, ctx) => (r.estado === 'Convertido' ? [] : [{ label: '→ Pedido', onClick: async () => { const p = await VG.post(`/api/presupuestos/${r.id}/convertir`); VG.toast(`Pedido ${p.numero} creado`); ctx.reload(); } }]) } }] },

  { id: 'reventa', label: 'Venta entre sellers', icon: '🤝', group: 'Ventas', title: 'Venta entre sellers', desc: 'Vendé productos de otros clientes de Vixan sin tener stock, o dejá que otros vendan los tuyos. El stock siempre es del dueño y a fin de mes se liquida al precio mayorista.', tabs: [
    { label: 'Ofrezco mis productos', crud: { entity: 'reventa_ofertas', columns: [{ k: 'sku', label: 'SKU' }, { k: 'producto', label: 'Producto' }, { k: 'precio_mayorista', label: 'Precio mayorista', fmt: money, num: true }, { k: 'stock', label: 'Stock ofrecido', num: true }, { k: 'vendido_mes', label: 'Vendido este mes', num: true }, { k: 'ofrecido', label: 'Estado', fmt: (v) => (v ? badge('Ofrecido', 'ok') : badge('Pausado')) }], form: [{ k: 'sku', label: 'SKU', type: 'select', options: prodOptions }, { k: 'producto', label: 'Producto' }, { k: 'precio_mayorista', label: 'Precio mayorista', type: 'number' }, { k: 'stock', label: 'Stock ofrecido', type: 'number' }, { k: 'ofrecido', label: 'Ofrecer', type: 'checkbox', default: true }], newLabel: '+ Ofrecer producto' } },
    { label: 'Liquidaciones', crud: { entity: 'reventa_liquidaciones', columns: [{ k: 'periodo', label: 'Período' }, { k: 'seller', label: 'Seller' }, { k: 'unidades', label: 'Unidades', num: true }, { k: 'monto', label: 'Monto', fmt: money, num: true }, { k: 'estado', label: 'Estado', fmt: tb }], form: [{ k: 'periodo', label: 'Período', type: 'month' }, { k: 'seller', label: 'Seller' }, { k: 'unidades', label: 'Unidades', type: 'number' }, { k: 'monto', label: 'Monto', type: 'number' }, { k: 'estado', label: 'Estado', type: 'select', options: ['Pendiente', 'Pagada'] }] } },
  ] },
  { id: 'mi-tienda', label: 'Vixan Market', icon: '🛍️', group: 'Ventas', title: 'Vixan Market', desc: 'Tu tienda online de venta directa.', tabs: [
    { label: 'Pedidos', crud: { entity: 'pedidos', canCreate: false, load: async () => (await VG.get('/api/r/pedidos')).filter((p) => ['Vixan Market', 'Venta directa'].includes(p.plataforma)), sort: byDateDesc(), chips: { k: 'pago', options: [['Pendiente', 'Sin pagar'], ['Pagado', 'Pagados']] }, columns: pedidosCrud.columns, onRow: verPedido } },
    { label: 'Mi tienda', render: tiendaConfig },
    { label: 'Promociones', crud: { entity: 'tienda_promos', columns: [{ k: 'sku', label: 'SKU' }, { k: 'tipo', label: 'Tipo' }, { k: 'valor', label: 'Valor', num: true }, { k: 'desde', label: 'Desde', fmt: date }, { k: 'hasta', label: 'Hasta', fmt: date }, { k: 'etiqueta', label: 'Etiqueta' }, { k: 'activa', label: 'Vigente', get: (r) => (r.activa && VG.today() >= r.desde && VG.today() <= r.hasta ? 'Vigente' : 'No vigente'), fmt: tb }], form: [{ k: 'sku', label: 'SKU', type: 'select', options: prodOptions }, { k: 'tipo', label: 'Tipo', type: 'select', options: ['Porcentaje', 'Monto fijo', '2x1'] }, { k: 'valor', label: 'Valor', type: 'number' }, { k: 'etiqueta', label: 'Etiqueta' }, { k: 'desde', label: 'Desde', type: 'date' }, { k: 'hasta', label: 'Hasta', type: 'date' }, { k: 'activa', label: 'Activa', type: 'checkbox', default: true }], newLabel: '+ Nueva promoción' } },
  ] },
  { id: 'whatsapp', label: 'WhatsApp', icon: '💬', group: 'Ventas', title: 'WhatsApp', desc: 'Conversaciones con tus compradores y envíos masivos.', tabs: [
    { label: 'Conversaciones', render: renderWhatsapp },
    { label: 'Envíos masivos', crud: { entity: 'wa_envios', sort: byDateDesc(), columns: [{ k: 'fecha', label: 'Fecha', fmt: date }, { k: 'nombre', label: 'Envío' }, { k: 'audiencia', label: 'Audiencia' }, { k: 'enviados', label: 'Enviados', num: true }, { k: 'respuestas', label: 'Respuestas', num: true }, { k: 'estado', label: 'Estado', fmt: tb }], form: [{ k: 'nombre', label: 'Nombre' }, { k: 'audiencia', label: 'Audiencia', type: 'select', options: ['Todos', 'Mayorista', 'Minorista', 'Gastronomía', 'VIP'] }, { k: 'mensaje', label: 'Mensaje', type: 'textarea', full: true }, { k: 'estado', label: 'Estado', type: 'select', options: ['Borrador', 'Programado', 'Enviado'] }, { k: 'fecha', label: 'Fecha', type: 'date' }], newLabel: '+ Nuevo envío' } },
    { label: 'Anuncios', crud: { entity: 'wa_anuncios', columns: [{ k: 'nombre', label: 'Anuncio' }, { k: 'inversion', label: 'Inversión', fmt: money, num: true }, { k: 'conversaciones', label: 'Conversaciones', num: true }, { k: 'estado', label: 'Estado', fmt: tb }], form: [{ k: 'nombre', label: 'Nombre' }, { k: 'inversion', label: 'Inversión', type: 'number' }, { k: 'conversaciones', label: 'Conversaciones', type: 'number' }, { k: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Pausado'] }], empty: 'Sin anuncios de Meta (clic a WhatsApp) cargados.' } },
  ] },
  { id: 'mailing', label: 'Mails masivos', icon: '✉️', group: 'Ventas', title: 'Mails masivos', desc: 'Campañas de mail a tus compradores y listas. Cada mail lleva el link para darse de baja.', tabs: [
    { label: 'Campañas', crud: { entity: 'mail_campanas', columns: [{ k: 'asunto', label: 'Asunto' }, { k: 'audiencia', label: 'Audiencia' }, { k: 'enviados', label: 'Enviados', num: true }, { k: 'aperturas', label: 'Aperturas', num: true, fmt: (v, r) => `${v || 0} <span class="muted small">${r.enviados ? VG.pct(v / r.enviados) : ''}</span>` }, { k: 'clics', label: 'Clics', num: true }, { k: 'bajas', label: 'Bajas', num: true }, { k: 'estado', label: 'Estado', fmt: tb }, { k: 'fecha', label: 'Fecha', fmt: date }], form: [{ k: 'asunto', label: 'Asunto', full: true, required: true }, { k: 'audiencia', label: 'Audiencia' }, { k: 'estado', label: 'Estado', type: 'select', options: ['Borrador', 'Programada', 'Enviada'] }, { k: 'cuerpo', label: 'Contenido', type: 'textarea', full: true }], newLabel: '+ Nueva campaña' } },
    { label: 'Audiencias', crud: { entity: 'mail_audiencias', columns: [{ k: 'nombre', label: 'Audiencia' }, { k: 'contactos', label: 'Contactos', num: true }, { k: 'origen', label: 'Origen' }], form: [{ k: 'nombre', label: 'Nombre' }, { k: 'contactos', label: 'Contactos', type: 'number' }, { k: 'origen', label: 'Origen' }], newLabel: '+ Nueva audiencia' } },
  ] },

  { id: 'catalogo', label: 'Catálogo y precios', icon: '🏷️', group: 'Productos y stock', title: 'Catálogo y precios', tabs: VG.catalogoTabs },
  { id: 'listas-precio', label: 'Listas de precios', icon: '📋', group: 'Productos y stock', title: 'Listas de precios', tabs: VG.listasTabs },
  { id: 'inventario', label: 'Inventario y lotes', icon: '📊', group: 'Productos y stock', title: 'Inventario y lotes', tabs: [
    { label: 'Stock actual', crud: { load: () => VG.get('/api/stats/stock'), canCreate: false, canEdit: false, canDelete: false, filters: [{ k: 'marca', label: 'Marca' }], sort: (a, b) => a.disponible - b.disponible, columns: [{ k: 'sku', label: 'SKU' }, { k: 'producto', label: 'Producto' }, { k: 'enLotes', label: 'En lotes', num: true }, { k: 'reservado', label: 'Reservado', num: true }, { k: 'total', label: 'Total', num: true }, { k: 'disponible', label: 'Disponible', num: true, fmt: (v, r) => (v <= 0 ? badge(v, 'err') : v < r.stock_minimo ? badge(v, 'warn') : `<b>${v}</b>`) }] } },
    { label: 'Gestión de lotes', crud: { entity: 'lotes', singular: 'lote', newLabel: '+ Nuevo lote', filters: [{ k: 'deposito', label: 'Depósito' }], sort: byDateDesc('ingreso'), defaults: () => ({ ingreso: VG.today(), origen: 'Compra', deposito: 'Central' }),
      beforeSave: (d) => { const p = (VG.cache.productos || []).find((x) => x.sku === d.sku); return { ...d, producto: p?.nombre || d.producto }; },
      columns: [{ k: 'lote', label: 'Lote' }, { k: 'producto', label: 'Producto' }, { k: 'ingreso', label: 'Ingreso', fmt: date }, { k: 'vencimiento', label: 'Vencimiento', fmt: (v) => (v && v < VG.today() ? badge(date(v), 'err') : date(v)) }, { k: 'cantidad', label: 'Cantidad', num: true }, { k: 'costo_unit', label: 'Costo unit.', fmt: money, num: true }, { k: 'origen', label: 'Origen' }, { k: 'deposito', label: 'Depósito' }],
      form: [{ k: 'lote', label: 'Código de lote', required: true }, { k: 'sku', label: 'Producto', type: 'select', options: prodOptions }, { k: 'ingreso', label: 'Ingreso', type: 'date' }, { k: 'vencimiento', label: 'Vencimiento', type: 'date' }, { k: 'cantidad', label: 'Cantidad', type: 'number' }, { k: 'costo_unit', label: 'Costo unitario', type: 'number' }, { k: 'origen', label: 'Origen' }, { k: 'deposito', label: 'Depósito' }],
      rowActions: (r, ctx) => [{ label: '⇄ Traspaso', onClick: () => { const f = [{ k: 'deposito_destino', label: 'Depósito destino', required: true }, { k: 'cantidad', label: `Cantidad (máx. ${r.cantidad})`, type: 'number', required: true }]; const e = VG.form(f); VG.modal({ title: `Traspasar lote ${r.lote}`, body: e, onSave: async () => { await VG.post('/api/inventario/traspaso', { lote_id: r.id, ...VG.readForm(e, f) }); VG.toast('Traspaso realizado'); ctx.reload(); } }); } }] } },
    { label: 'Movimientos', crud: { entity: 'movimientos_stock', canCreate: false, canEdit: false, sort: byDateDesc(), filters: [{ k: 'tipo', label: 'Tipo' }], columns: [{ k: 'fecha', label: 'Fecha', fmt: datetime }, { k: 'tipo', label: 'Tipo' }, { k: 'producto', label: 'Producto' }, { k: 'deposito', label: 'Depósito' }, { k: 'lote', label: 'Lote' }, { k: 'cantidad', label: 'Cantidad', num: true, fmt: (v) => `<b style="color:${v < 0 ? 'var(--err)' : 'var(--ok)'}">${v > 0 ? '+' : ''}${v}</b>` }, { k: 'nota', label: 'Nota' }], empty: 'Los movimientos aparecen al despachar pedidos, traspasar o aprobar reingresos.' } },
    { label: 'Fulfillment', crud: { entity: 'envios_full', sort: byDateDesc(), note: 'Pasá stock del depósito propio al de Fulfillment (Mercado Libre Full). Registrá cada envío y sus unidades.', columns: [{ k: 'fecha', label: 'Fecha', fmt: date }, { k: 'envio', label: 'Envío' }, { k: 'skus', label: 'SKUs' }, { k: 'unidades', label: 'Unidades', num: true }, { k: 'estado', label: 'Estado', fmt: tb }], form: [{ k: 'fecha', label: 'Fecha', type: 'date' }, { k: 'envio', label: 'N° de envío ML' }, { k: 'skus', label: 'SKUs', full: true }, { k: 'unidades', label: 'Unidades', type: 'number' }, { k: 'estado', label: 'Estado', type: 'select', options: ['Armando', 'Enviado', 'Recibido en Full', 'Cancelado'] }], newLabel: '+ Armar envío a Full' } },
  ] },
  { id: 'depositos', label: 'Depósitos', icon: '🏭', group: 'Productos y stock', title: 'Depósitos', tabs: [{ label: 'Depósitos', crud: { entity: 'depositos', load: async () => { const [d, l] = await Promise.all([VG.get('/api/r/depositos'), VG.get('/api/r/lotes')]); return d.map((x) => ({ ...x, lotes: l.filter((y) => y.deposito === x.nombre && y.cantidad > 0).length, unidades: sumBy(l.filter((y) => y.deposito === x.nombre), 'cantidad') })); }, columns: [{ k: 'nombre', label: 'Depósito' }, { k: 'dentro_de', label: 'Dentro de' }, { k: 'para', label: 'Para' }, { k: 'se_vende', label: '¿Se vende?', fmt: (v) => (v ? 'Sí' : 'No') }, { k: 'lotes', label: 'Lotes', num: true }, { k: 'unidades', label: 'Unidades', num: true }, { k: 'estado', label: 'Estado', fmt: tb }], form: [{ k: 'nombre', label: 'Nombre', required: true }, { k: 'dentro_de', label: 'Dentro de' }, { k: 'para', label: 'Para', type: 'select', options: ['Venta', 'Full', 'Cuarentena', 'Reserva'] }, { k: 'se_vende', label: 'El stock se vende', type: 'checkbox' }, { k: 'estado', label: 'Estado', type: 'select', options: ['Abierto', 'Cerrado'] }], newLabel: '+ Nuevo depósito' } }] },
  { id: 'proyecciones', label: 'Proyecciones', icon: '📈', group: 'Productos y stock', title: 'Proyecciones de ventas y reposición', desc: 'Qué se vendió, a qué ritmo y cuánto conviene reponer, por producto, marca y fabricante. Los números salen de tus pedidos reales, sin cancelados.', tabs: [
    { label: '📊 Panorama', render: renderPanorama }, { label: 'Análisis de ventas', render: renderAnalisisVentas }, { label: 'Sugerencia de reposición', render: renderReposicion },
    { label: 'Configurar stock mínimo', crud: { entity: 'productos', canCreate: false, canDelete: false, columns: [{ k: 'sku', label: 'SKU' }, { k: 'nombre', label: 'Producto' }, { k: 'stock_minimo', label: 'Stock mínimo', num: true }], form: [{ k: 'stock_minimo', label: 'Stock mínimo', type: 'number' }] } },
  ] },
  { id: 'reabastecimiento', label: 'Reabastecimiento', icon: '🔁', group: 'Compras', title: 'Reabastecimiento', tabs: [
    { label: 'Órdenes de compra', crud: { entity: 'ordenes_reabastecimiento', sort: byDateDesc(), filters: [{ k: 'estado', label: 'Estado' }, { k: 'proveedor', label: 'Proveedor' }], defaults: () => ({ fecha: VG.today(), estado: 'Borrador' }), beforeSave: (d) => ({ ...d, total: (d.items || []).reduce((a, i) => a + i.cantidad * i.precio, 0) || d.total }),
      columns: [{ k: 'numero', label: 'N° OC' }, { k: 'fecha', label: 'Fecha', fmt: date }, { k: 'proveedor', label: 'Proveedor' }, { k: 'items', label: 'Ítems', get: (r) => (r.items || []).length, num: true }, { k: 'total', label: 'Total estimado', fmt: money, num: true }, { k: 'estado', label: 'Estado', fmt: tb }, { k: 'entrega', label: 'Entrega est.', fmt: date }],
      form: [{ k: 'numero', label: 'N° OC' }, { k: 'fecha', label: 'Fecha', type: 'date' }, { k: 'proveedor', label: 'Proveedor' }, { k: 'estado', label: 'Estado', type: 'select', options: ['Borrador', 'Enviada', 'Parcial', 'Recibida', 'Cancelada'] }, { k: 'entrega', label: 'Entrega estimada', type: 'date' }, { k: 'items', label: 'Productos', type: 'items' }], newLabel: '+ Nueva orden de compra' } },
    { label: 'Compras recibidas (facturas)', crud: { entity: 'ordenes_compra', sort: byDateDesc(), filters: [{ k: 'proveedor', label: 'Proveedor' }], columns: [{ k: 'fecha', label: 'Fecha', fmt: date }, { k: 'nro_factura', label: 'N° factura' }, { k: 'proveedor', label: 'Proveedor' }, { k: 'total', label: 'Total a pagar', fmt: money, num: true }, { k: 'deposito', label: 'Depósito' }, { k: 'estado', label: 'Estado', fmt: tb }, { k: 'vencimiento', label: 'Vencimiento', fmt: date }], form: [{ k: 'fecha', label: 'Fecha', type: 'date' }, { k: 'nro_factura', label: 'N° factura' }, { k: 'proveedor', label: 'Proveedor' }, { k: 'total', label: 'Total', type: 'number' }, { k: 'deposito', label: 'Depósito' }, { k: 'estado', label: 'Estado', type: 'select', options: ['Recibida', 'Parcial', 'Pendiente'] }, { k: 'vencimiento', label: 'Vencimiento', type: 'date' },
        { k: 'cbte_tipo', label: 'Datos de factura (Libro IVA Compras) · Tipo de comprobante', type: 'select', options: [['', 'Sin datos de factura (no entra al libro)'], ['A', 'Factura A'], ['B', 'Factura B'], ['C', 'Factura C'], ['M', 'Factura M'], ['NC A', 'Nota de crédito A'], ['NC B', 'Nota de crédito B'], ['NC C', 'Nota de crédito C'], ['ND A', 'Nota de débito A'], ['X', 'X (no fiscal)']], full: true },
        { k: 'fecha_factura', label: 'Fecha de la factura', type: 'date' }, { k: 'punto_venta_factura', label: 'Punto de venta', type: 'number' }, { k: 'nro_comprobante', label: 'Número', type: 'number' }, { k: 'cuit_proveedor', label: 'CUIT del proveedor' },
        { k: 'neto_21', label: 'Neto gravado 21%', type: 'number', step: '0.01' }, { k: 'neto_105', label: 'Neto gravado 10,5%', type: 'number', step: '0.01' }, { k: 'neto_27', label: 'Neto gravado 27%', type: 'number', step: '0.01' }, { k: 'exento', label: 'Exento / no gravado', type: 'number', step: '0.01' },
        { k: 'percep_iva', label: 'Percepción de IVA', type: 'number', step: '0.01' }, { k: 'percep_iibb', label: 'Percepción de IIBB', type: 'number', step: '0.01' }, { k: 'jurisdiccion_iibb', label: 'Jurisdicción IIBB' }, { k: 'otros_tributos', label: 'Otros tributos / imp. internos', type: 'number', step: '0.01' }], newLabel: '+ Cargar compra', footer: totalFoot(['total']) } },
  ] },
  { id: 'proveedores', label: 'Proveedores', icon: '🏢', group: 'Compras', title: 'Proveedores, marcas y fabricantes', desc: 'Identificá qué marca y qué fabricante tiene cada producto, y a qué proveedor le comprás cada marca. Proyecciones usa esta cadena para armar las órdenes de compra.', tabs: [
    { label: 'Proveedores', crud: { entity: 'proveedores', singular: 'proveedor', newLabel: '+ Nuevo proveedor', columns: [{ k: 'nombre_fantasia', label: 'Nombre fantasía', fmt: (v) => `<b>${esc(v)}</b>` }, { k: 'razon_social', label: 'Razón social' }, { k: 'cuit', label: 'CUIT' }, { k: 'contacto', label: 'Contacto', get: (r) => [r.contacto_nombre, r.contacto_tel, r.contacto_email].filter(Boolean).join(' · ') }, { k: 'condiciones_pago', label: 'Cond. pago' }, { k: 'activo', label: 'Estado', fmt: (v) => (v !== false ? badge('Activo', 'ok') : badge('Inactivo')) }],
      form: [{ k: 'nombre_fantasia', label: 'Nombre fantasía', required: true, full: true }, { k: 'razon_social', label: 'Razón social' }, { k: 'cuit', label: 'CUIT' }, { k: 'contacto_nombre', label: 'Contacto' }, { k: 'contacto_tel', label: 'Teléfono' }, { k: 'contacto_email', label: 'Email', full: true }, { k: 'direccion', label: 'Dirección', full: true }, { k: 'cbu', label: 'CBU' }, { k: 'alias_cbu', label: 'Alias CBU' }, { k: 'condiciones_pago', label: 'Condiciones de pago' }, { k: 'plazo_pago_dias', label: 'Plazo de pago (días)', type: 'number' }, { k: 'activo', label: 'Activo', type: 'checkbox', default: true }, { k: 'notas', label: 'Notas', type: 'textarea', full: true }] } },
    { label: 'Marcas', crud: { entity: 'marcas', singular: 'marca', newLabel: '+ Nueva marca', columns: [{ k: 'nombre', label: 'Marca', fmt: (v) => `<b>${esc(v)}</b>` }, { k: 'fabricante', label: 'Fabricante' }, { k: 'proveedor', label: 'Proveedor default' }, { k: 'productos', label: 'Productos', num: true, get: (r) => (VG.cache.productos || []).filter((p) => p.marca === r.nombre).length }, { k: 'activo', label: 'Estado', fmt: (v) => (v !== false ? badge('Activo', 'ok') : badge('Inactivo')) }],
      form: () => [{ k: 'nombre', label: 'Nombre', required: true, full: true }, { k: 'fabricante', label: 'Fabricante' }, { k: 'proveedor', label: 'Proveedor default' }, { k: 'proveedor_id', label: 'ID proveedor (para OC automáticas)', type: 'number' }, { k: 'activo', label: 'Activa', type: 'checkbox', default: true }] } },
    { label: 'Fabricantes', crud: { entity: 'fabricantes', singular: 'fabricante', newLabel: '+ Nuevo fabricante', columns: [{ k: 'nombre', label: 'Nombre', fmt: (v) => `<b>${esc(v)}</b>` }, { k: 'pais', label: 'País' }, { k: 'activo', label: 'Estado', fmt: (v) => (v !== false ? badge('Activo', 'ok') : badge('Inactivo')) }], form: [{ k: 'nombre', label: 'Nombre', required: true }, { k: 'pais', label: 'País' }, { k: 'activo', label: 'Activo', type: 'checkbox', default: true }] } },
  ] },
  { id: 'proveedores-cc', label: 'CC proveedores', icon: '💳', group: 'Compras', title: 'Cuenta corriente de proveedores', tabs: [{ label: 'Cuentas', render: renderCCProveedores }, { label: '📅 Calendario de pagos', render: renderCalendario }] },

  { id: 'facturacion', label: 'Facturación', icon: '🧮', group: 'Finanzas', title: 'Facturación electrónica', desc: 'Facturas A, B y C con CAE de ARCA. La letra sale sola según tu condición y la del cliente.', tabs: [
    ...VG.facturacionTabs,
    { label: 'Comprobantes emitidos', render: renderComprobantes },
  ] },
  { id: 'resultados', label: 'Resultados', icon: '💹', group: 'Finanzas', title: 'Resultados', desc: 'Cuánto ganás de verdad en cada venta: ingresos menos todos los costos (comisión, envío, impuestos, mercadería y logística).', render: (v) => { const el = VG.h('<div></div>'); v.appendChild(el); renderResultados(el); } },
  { id: 'cuenta-corriente', label: 'Cuenta corriente', icon: '📒', group: 'Finanzas', title: 'Cuenta corriente', desc: 'Servicios logísticos a facturar y cobranzas en efectivo a rendir.', render: (v) => { const el = VG.h('<div></div>'); v.appendChild(el); renderCuentaCorriente(el); } },
  { id: 'cashflow', label: 'Flujo de caja', icon: '💸', group: 'Finanzas', title: 'Flujo de caja', desc: 'Todo lo que entra y sale de tus cuentas: gastos, aportes, retiros, préstamos y ventas sin pedido. Los cobros de pedidos se ven en la pestaña Pedidos (cobranza).', tabs: [
    { label: 'Movimientos', crud: { entity: 'caja_movimientos', sort: byDateDesc(), dateFilter: 'fecha', filters: [{ k: 'tipo', label: 'Tipo' }, { k: 'metodo', label: 'Método' }], kpis: (r) => [{ label: 'Ingresos', value: money(sumBy(r.filter((x) => x.monto > 0), 'monto')) }, { label: 'Egresos', value: money(-sumBy(r.filter((x) => x.monto < 0), 'monto')), tone: 'err' }, { label: 'Neto', value: money(sumBy(r, 'monto')), tone: 'info' }, { label: 'Movimientos', value: r.length }],
      columns: [{ k: 'fecha', label: 'Fecha', fmt: date }, { k: 'tipo', label: 'Tipo', fmt: tb }, { k: 'categoria', label: 'Categoría' }, { k: 'concepto', label: 'Concepto' }, { k: 'monto', label: 'Monto', num: true, fmt: (v) => `<b style="color:${v < 0 ? 'var(--err)' : 'var(--ok)'}">${money(v)}</b>` }, { k: 'metodo', label: 'Método' }, { k: 'origen', label: 'Origen' }],
      form: [{ k: 'fecha', label: 'Fecha', type: 'date' }, { k: 'tipo', label: 'Tipo', type: 'select', options: ['Gasto', 'Ingreso', 'Aporte de socio', 'Retiro de socio', 'Préstamo', 'Transferencia'] }, { k: 'categoria', label: 'Cuenta contable' }, { k: 'concepto', label: 'Concepto', full: true }, { k: 'monto', label: 'Monto (negativo = egreso)', type: 'number' }, { k: 'metodo', label: 'Método', type: 'select', options: ['Transferencia', 'Mercado Pago', 'Efectivo', 'Tarjeta'] }], defaults: () => ({ fecha: VG.today(), origen: 'Manual' }), newLabel: '+ Nuevo movimiento' } },
    { label: 'Pagos a proveedores', render: renderCalendario },
    { label: 'Pedidos (cobranza)', crud: { entity: 'pedidos', canCreate: false, canDelete: false, sort: byDateDesc(), chips: { k: 'pago', options: [['Pendiente', 'Por cobrar'], ['Pagado', 'Cobrados']] }, filters: [{ k: 'metodo_pago', label: 'Método' }], columns: [{ k: 'numero', label: 'Pedido' }, { k: 'fecha', label: 'Fecha', fmt: date }, { k: 'cliente', label: 'Cliente' }, { k: 'total', label: 'Monto', fmt: money, num: true }, { k: 'metodo_pago', label: 'Método' }, { k: 'plataforma', label: 'Origen' }, { k: 'pago', label: 'Estado', fmt: tb }], form: [{ k: 'pago', label: 'Estado del cobro', type: 'select', options: ['Pendiente', 'Pagado'] }, { k: 'metodo_pago', label: 'Método', type: 'select', options: ['Transferencia', 'Mercado Pago', 'Efectivo contra entrega', 'Tarjeta'] }], footer: totalFoot(['total']) } },
    { label: 'Deudores', crud: { canCreate: false, canEdit: false, canDelete: false, load: async () => Object.values((await VG.get('/api/r/pedidos')).filter((p) => p.pago === 'Pendiente' && p.estado !== 'cancelado').reduce((o, p) => { const r = (o[p.cliente] ||= { id: p.cliente, cliente: p.cliente, pedidos: 0, deuda: 0, desde: p.fecha }); r.pedidos++; r.deuda += p.total; if (p.fecha < r.desde) r.desde = p.fecha; return o; }, {})).sort((a, b) => b.deuda - a.deuda), columns: [{ k: 'cliente', label: 'Cliente' }, { k: 'pedidos', label: 'Pedidos', num: true }, { k: 'deuda', label: 'Deuda', fmt: money, num: true }, { k: 'desde', label: 'Desde', fmt: date }], footer: totalFoot(['deuda']) } },
    { label: 'Bancos y Mercado Pago', crud: { entity: 'bancos', columns: [{ k: 'nombre', label: 'Nombre' }, { k: 'tipo', label: 'Tipo' }, { k: 'alias', label: 'Alias / CBU' }, { k: 'notas', label: 'Notas' }], form: [{ k: 'nombre', label: 'Nombre' }, { k: 'tipo', label: 'Tipo', type: 'select', options: ['Banco', 'Billetera', 'Efectivo'] }, { k: 'alias', label: 'Alias / CBU' }, { k: 'notas', label: 'Notas' }], newLabel: '+ Nuevo banco' } },
  ] },
  { id: 'impuestos', label: 'Impuestos', icon: '🏛️', group: 'Finanzas', title: 'Impuestos', tabs: [
    { label: 'Retenciones y percepciones', render: (el) => { const box = VG.h('<div><div class="card" data-r style="margin-bottom:14px"></div><div data-t></div></div>'); el.appendChild(box); VG.get('/api/r/retenciones').then((rows) => { const g = {}; for (const r of rows) { const k = r.tipo + '|' + r.jurisdiccion; (g[k] ||= { tipo: r.tipo, jur: r.jurisdiccion, n: 0, m: 0 }); g[k].n++; g[k].m += r.monto; } box.querySelector('[data-r]').innerHTML = `<h3>Resumen por tipo y jurisdicción</h3><table class="t"><thead><tr><th>Tipo</th><th>Jurisdicción</th><th class="num">Cantidad</th><th class="num">Monto</th></tr></thead><tbody>${Object.values(g).sort((a, b) => b.m - a.m).map((x) => `<tr><td>${esc(x.tipo)}</td><td>${esc(x.jur)}</td><td class="num">${x.n}</td><td class="num">${money(x.m)}</td></tr>`).join('')}</tbody></table>`; }); VG.crud(box.querySelector('[data-t]'), { entity: 'retenciones', sort: byDateDesc(), dateFilter: 'fecha', filters: [{ k: 'tipo', label: 'Tipo' }, { k: 'jurisdiccion', label: 'Jurisdicción' }], columns: [{ k: 'fecha', label: 'Fecha', fmt: date }, { k: 'tipo', label: 'Tipo' }, { k: 'jurisdiccion', label: 'Jurisdicción' }, { k: 'pedido', label: 'Pedido' }, { k: 'payment_id', label: 'Payment ID' }, { k: 'monto', label: 'Monto', fmt: money, num: true }], form: [{ k: 'fecha', label: 'Fecha', type: 'date' }, { k: 'tipo', label: 'Tipo' }, { k: 'jurisdiccion', label: 'Jurisdicción' }, { k: 'pedido', label: 'Pedido' }, { k: 'payment_id', label: 'Payment ID' }, { k: 'monto', label: 'Monto', type: 'number' }], footer: totalFoot(['monto']) }); } },
    { label: 'IVA', render: (el) => VG.contabilidadTabs[1].render(el) },
  ] },
  { id: 'contabilidad', label: 'Contabilidad', icon: '📚', group: 'Finanzas', title: 'Contabilidad', tabs: VG.contabilidadTabs },
  { id: 'auditoria', label: 'Auditoría', icon: '🔍', group: 'Finanzas', title: 'Control de reingresos de stock', desc: 'Pedidos cancelados después de despachados. Ningún cambio de stock se aplica solo: revisá y aprobá o rechazá cada caso.', tabs: [
    { label: '⏳ Pendientes', crud: { entity: 'auditoria', canCreate: false, canEdit: false, canDelete: false, load: async () => (await VG.get('/api/r/auditoria')).filter((a) => a.estado === 'pendiente'), columns: [{ k: 'pedido', label: 'Pedido' }, { k: 'fecha', label: 'Fecha', fmt: date }, { k: 'cliente', label: 'Cliente' }, { k: 'plataforma', label: 'Plataforma' }, { k: 'productos', label: 'Productos' }, { k: 'total', label: 'Total', fmt: money, num: true }], rowActions: (r, ctx) => [{ label: 'Aprobar', onClick: async () => { await VG.post(`/api/auditoria/${r.id}/resolver`, { accion: 'aprobar' }); VG.toast('Reingreso aprobado: stock devuelto a Central'); ctx.reload(); } }, { label: 'Rechazar', tone: 'danger', onClick: async () => { const nota = prompt('Motivo del rechazo') || ''; await VG.post(`/api/auditoria/${r.id}/resolver`, { accion: 'rechazar', nota }); ctx.reload(); } }], empty: 'Sin reingresos pendientes.' } },
    { label: 'Historial', crud: { entity: 'auditoria', canCreate: false, canEdit: false, canDelete: false, load: async () => (await VG.get('/api/r/auditoria')).filter((a) => a.estado !== 'pendiente'), columns: [{ k: 'resuelto_at', label: 'Fecha', fmt: datetime }, { k: 'pedido', label: 'Pedido' }, { k: 'estado', label: 'Resultado', fmt: tb }, { k: 'resuelto_por', label: 'Aprobado por' }, { k: 'nota', label: 'Nota' }] } },
  ] },

  { id: 'clientes', label: 'Clientes', icon: '🧑‍💼', group: 'Clientes y canales', title: 'Clientes', desc: 'Quién te compra, cada cuánto y cuánto. Etiquetalos para entender tu cartera.', tabs: [
    { label: 'Cartera', crud: { canCreate: false, canDelete: false, canEdit: false, load: async () => { const [c, p] = await Promise.all([VG.get('/api/r/clientes'), VG.get('/api/r/pedidos')]); const pv = p.filter((x) => x.estado !== 'cancelado'); return c.map((cl) => { const mine = pv.filter((x) => x.cliente === cl.nombre).sort(byDateDesc()); const fact = sumBy(mine, 'total'); const deuda = sumBy(mine.filter((x) => x.pago === 'Pendiente'), 'total'); const primera = mine.length ? mine[mine.length - 1].fecha : null; const sem = primera ? Math.max(1, (Date.now() - new Date(primera)) / 6048e5) : 1; return { ...cl, compras: mine.length, facturado: fact, ticket: mine.length ? fact / mine.length : 0, deuda, ultima: mine[0]?.fecha, unid_sem: Math.round(sumBy(mine, (x) => (x.items || []).reduce((a, i) => a + i.cantidad, 0)) / sem * 10) / 10, frecuencia: mine.length > 1 ? Math.round(sem * 7 / mine.length) : null }; }).sort((a, b) => b.facturado - a.facturado); },
      filters: [{ k: 'canal', label: 'Canal' }, { k: 'vendedor', label: 'Vendedor' }], columns: [{ k: 'nombre', label: 'Cliente', fmt: (v) => `<b>${esc(v)}</b>` }, { k: 'cuit', label: 'Identificación' }, { k: 'compras', label: 'Compras', num: true }, { k: 'facturado', label: 'Facturado', fmt: money, num: true }, { k: 'ticket', label: 'Ticket', fmt: money, num: true }, { k: 'deuda', label: 'Cuenta corriente', num: true, fmt: (v) => (v ? `<b style="color:var(--err)">${money(v)}</b>` : '—') }, { k: 'ultima', label: 'Última compra', fmt: date }, { k: 'unid_sem', label: 'Unid./semana', num: true }, { k: 'frecuencia', label: 'Frecuencia', num: true, fmt: (v) => (v ? `cada ${v} días` : '—') }, { k: 'vendedor', label: 'Vendedor' }, { k: 'canal', label: 'Canal' }, { k: 'etiquetas', label: 'Etiquetas', fmt: (v) => (v || []).map((e) => badge(e, 'teal')).join(' ') }],
      footer: totalFoot(['facturado', 'deuda']) } },
    { label: 'Datos de clientes', crud: { entity: 'clientes', singular: 'cliente', newLabel: '+ Agregar cliente', filters: [{ k: 'zona', label: 'Zona' }, { k: 'condicion_iva', label: 'Cond. IVA' }, { k: 'origen', label: 'Origen' }], columns: [{ k: 'nombre', label: 'Nombre' }, { k: 'razon_social', label: 'Razón social' }, { k: 'cuit', label: 'CUIT/DNI' }, { k: 'condicion_iva', label: 'Cond. IVA', fmt: (v) => esc(v || 'Consumidor Final') }, { k: 'direccion', label: 'Dirección' }, { k: 'zona', label: 'Zona / Prov.' }, { k: 'telefono', label: 'Teléfono' }, { k: 'email', label: 'Email' }],
      form: [{ k: 'nombre', label: 'Nombre', required: true }, { k: 'razon_social', label: 'Razón social' }, { k: 'cuit', label: 'CUIT/DNI' }, { k: 'condicion_iva', label: 'Condición frente al IVA', type: 'select', options: COND_IVA }, { k: 'telefono', label: 'Teléfono' }, { k: 'email', label: 'Email' }, { k: 'direccion', label: 'Dirección' }, { k: 'localidad', label: 'Localidad' }, { k: 'cp', label: 'CP' }, { k: 'zona', label: 'Zona / Provincia' }, { k: 'canal', label: 'Canal', type: 'select', options: ['Minorista', 'Mayorista', 'Gastronomía'] }, { k: 'vendedor', label: 'Vendedor' }, { k: 'etiquetas', label: 'Etiquetas', type: 'tags' }] } },
    { label: 'Canales', crud: { entity: 'canales', columns: [{ k: 'nombre', label: 'Canal' }], form: [{ k: 'nombre', label: 'Nombre' }], newLabel: '+ Nuevo canal' } },
  ] },
  { id: 'integraciones', label: 'Integraciones', icon: '🔌', group: 'Clientes y canales', title: 'Integraciones', desc: 'Tus tiendas y marketplaces conectados. Las ventas entran solas como pedidos.', render: (v) => { const el = VG.h('<div></div>'); v.appendChild(el); renderIntegraciones(el); } },
  { id: 'publicaciones-ml', label: 'Gestión de integraciones', icon: '🔄', group: 'Clientes y canales', title: 'Gestión de integraciones', desc: 'Publicaciones por canal: qué está vinculado a tu catálogo y si sincroniza stock y precio.', tabs: [
    { label: 'Mercado Libre · Publicaciones', crud: { entity: 'publicaciones', selectable: true, filters: [{ k: 'estado', label: 'Estado' }], load: async () => { const [p, s] = await Promise.all([VG.get('/api/r/publicaciones'), VG.get('/api/stats/stock')]); const m = Object.fromEntries(s.map((x) => [x.sku, x.disponible])); return p.map((x) => ({ ...x, stock_real: m[x.sku] ?? 0 })); },
      columns: [{ k: 'item_id', label: 'Publicación', fmt: (v) => `<code class="k">${esc(v)}</code>` }, { k: 'titulo', label: 'Título' }, { k: 'sku', label: 'SKU vinculado' }, { k: 'precio', label: 'Precio', fmt: money, num: true }, { k: 'stock_publicado', label: 'Stock publicado', num: true }, { k: 'stock_real', label: 'Stock real', num: true, fmt: (v, r) => (v !== r.stock_publicado ? badge(v, 'warn') : v) }, { k: 'sync', label: 'Sync', fmt: (v) => (v ? badge('Activo', 'ok') : badge('Pausado')) }, { k: 'estado', label: 'Estado', fmt: tb }],
      form: [{ k: 'item_id', label: 'ID de publicación' }, { k: 'titulo', label: 'Título', full: true }, { k: 'sku', label: 'SKU', type: 'select', options: prodOptions }, { k: 'precio', label: 'Precio', type: 'number' }, { k: 'stock_publicado', label: 'Stock publicado', type: 'number' }, { k: 'sync', label: 'Sincronizar', type: 'checkbox' }, { k: 'estado', label: 'Estado', type: 'select', options: ['Activa', 'Pausada'] }],
      toolbar: (ctx) => [{ label: 'Forzar stock', onClick: async () => { for (const r of ctx.rows.filter((x) => ctx.sel.has(x.id))) await VG.put(`/api/r/publicaciones/${r.id}`, { stock_publicado: Math.max(0, r.stock_real) }); VG.toast('Stock igualado (se envía a ML cuando la cuenta está conectada)'); ctx.reload(); } }], newLabel: '+ Vincular publicación' } },
  ] },

  { id: 'cuentas', label: 'Análisis por cuenta', icon: '🧭', group: 'Cuenta', title: 'Análisis por cuenta', desc: 'Ventas, ticket y margen por cada cuenta conectada.', render: async (v) => { const el = VG.h('<div></div>'); v.appendChild(el); const r = await VG.get('/api/stats/resultados'); const p = await VG.get('/api/r/pedidos'); const cuenta = Object.fromEntries(p.map((x) => [x.id, x.cuenta || x.plataforma])); const g = {}; for (const f of r.filas) { const k = cuenta[f.id]; const o = (g[k] ||= { id: k, cuenta: k, pedidos: 0, ventas: 0, ganancia: 0 }); o.pedidos++; o.ventas += f.total; o.ganancia += f.ganancia; } VG.crud(el, { load: async () => Object.values(g), canCreate: false, canEdit: false, canDelete: false, columns: [{ k: 'cuenta', label: 'Cuenta' }, { k: 'pedidos', label: 'Pedidos', num: true }, { k: 'ventas', label: 'Ventas', fmt: money, num: true }, { k: 'ticket', label: 'Ticket', num: true, get: (x) => x.ventas / x.pedidos, fmt: money }, { k: 'ganancia', label: 'Ganancia', fmt: money, num: true }, { k: 'mg', label: 'Margen', num: true, get: (x) => (x.ventas ? x.ganancia / x.ventas : 0), fmt: VG.pct }], footer: totalFoot(['ventas', 'ganancia']) }); } },
  { id: 'configuracion', label: 'Configuración', icon: '⚙️', group: 'Cuenta', title: 'Configuración', desc: 'Datos de facturación, usuarios, costos, integraciones por API y apariencia.', tabs: [
    { label: '📋 Datos de facturación', render: settingsForm('facturacion', [{ k: 'razon_social', label: 'Razón social', required: true }, { k: 'cuit', label: 'CUIT', required: true, placeholder: '30-12345678-9' }, { k: 'condicion_iva', label: 'Condición IVA', type: 'select', options: ['Responsable Inscripto', 'Monotributo', 'Exento'] }, { k: 'punto_venta', label: 'Punto de venta (Web Services)', type: 'number', required: true }, { k: 'domicilio', label: 'Domicilio fiscal', full: true }, { k: 'iibb', label: 'N° IIBB' }, { k: 'inicio_act', label: 'Inicio de actividades', type: 'date' }, { k: 'alicuota_default', label: 'Alícuota de IVA de tus ventas', type: 'select', options: [['21', '21%'], ['10.5', '10,5%']] }], 'Estos datos salen impresos en cada factura y se usan para pedir el CAE a ARCA.') },
    { label: '🧾 Facturación electrónica (ARCA)', render: renderArca },
    { label: '💸 Cobro por transferencia', render: settingsForm('transferencia', [{ k: 'banco', label: 'Banco' }, { k: 'titular', label: 'Titular' }, { k: 'cbu', label: 'CBU / CVU' }, { k: 'alias', label: 'Alias' }, { k: 'mensaje', label: 'Mensaje al comprador', type: 'textarea', full: true }]) },
    { label: '👥 Usuarios', render: renderUsuarios },
    { label: 'Descuentos por pago', render: async (el) => { const s = await getSettings(); const rows = s.descuentos_pago || []; el.innerHTML = '<div class="note">Reglas por método de pago. Se aplican al total del pedido (ej.: Efectivo −10%, Transferencia −5%). Un valor negativo es un recargo.</div>'; const c = VG.h('<div class="card"><table class="t"><thead><tr><th>Método</th><th>Tipo</th><th>Valor</th><th></th></tr></thead><tbody></tbody></table><div class="toolbar" style="margin-top:10px"><button class="btn" data-a>+ Agregar regla</button><button class="btn primary" data-s>Guardar descuentos</button></div></div>'); el.appendChild(c); const tbody = c.querySelector('tbody'); const add = (r = { metodo: '', tipo: '%', valor: 0 }) => { const tr = VG.h(`<tr><td><input value="${esc(r.metodo)}" data-m></td><td><select data-t><option ${r.tipo === '%' ? 'selected' : ''}>%</option><option ${r.tipo === '$' ? 'selected' : ''}>$</option></select></td><td><input type="number" value="${r.valor}" data-v></td><td><button class="btn small ghost">✕</button></td></tr>`); tr.querySelector('button').onclick = () => tr.remove(); tbody.appendChild(tr); }; rows.forEach(add); c.querySelector('[data-a]').onclick = () => add(); c.querySelector('[data-s]').onclick = async () => { const v = [...tbody.children].map((tr) => ({ metodo: tr.querySelector('[data-m]').value, tipo: tr.querySelector('[data-t]').value, valor: Number(tr.querySelector('[data-v]').value) })); await VG.put('/api/settings', { descuentos_pago: v }); settingsCache.v = null; VG.toast('Descuentos guardados'); }; } },
    { label: 'Costos', render: async (el) => { const s = await getSettings(); const f = [{ k: 'costo_logistico_pedido', label: 'Costo logístico por pedido ($)', type: 'number' }, { k: 'porcentaje_facturacion', label: 'Comisión sobre facturación (%)', type: 'number', step: '0.1' }, { k: 'dolar', label: 'Dólar del día (costos en USD)', type: 'number' }, { k: 'oca_base', label: 'OCA: base por bulto ($)', type: 'number' }, { k: 'oca_kg', label: 'OCA: por kg ($)', type: 'number' }, { k: 'andreani_base', label: 'Andreani: base por bulto ($)', type: 'number' }, { k: 'andreani_kg', label: 'Andreani: por kg ($)', type: 'number' }, { k: 't_caba', label: 'Flota propia CABA ($)', type: 'number' }, { k: 't_gba1', label: 'Flota propia GBA 1 ($)', type: 'number' }, { k: 't_gba2', label: 'Flota propia GBA 2 ($)', type: 'number' }]; const tp = s.tarifas_propias || { CABA: 4200, 'GBA 1': 5600, 'GBA 2': 7300 }; const e = VG.form(f, { ...s, t_caba: tp.CABA, t_gba1: tp['GBA 1'], t_gba2: tp['GBA 2'], oca_base: s.oca_base ?? 6900, oca_kg: s.oca_kg ?? 950, andreani_base: s.andreani_base ?? 7400, andreani_kg: s.andreani_kg ?? 880 }); const c = VG.h('<div class="card"></div>'); c.appendChild(e); const b = VG.h('<div class="toolbar" style="margin-top:12px"><button class="btn primary">Guardar</button></div>'); b.querySelector('button').onclick = async () => { const v = VG.readForm(e, f); const { t_caba, t_gba1, t_gba2, ...rest } = v; await VG.put('/api/settings', { ...rest, tarifas_propias: { CABA: t_caba, 'GBA 1': t_gba1, 'GBA 2': t_gba2 } }); settingsCache.v = null; VG.toast('Costos guardados'); }; c.appendChild(b); el.appendChild(c); } },
    { label: 'Mails a compradores', render: settingsForm('mails', [{ k: 'remitente', label: 'Nombre del remitente' }, { k: 'responder_a', label: 'Responder a (email)' }, { k: 'aviso_despacho', label: 'Avisar cuando se despacha', type: 'checkbox' }, { k: 'aviso_entrega', label: 'Avisar cuando se entrega', type: 'checkbox' }, { k: 'firma', label: 'Firma', type: 'textarea', full: true }]) },
    { label: 'API / Integraciones', render: renderApi },
    { label: 'Apariencia', render: settingsForm('apariencia', [{ k: 'tema', label: 'Tema del panel', type: 'select', options: ['Claro', 'Oscuro (próximamente)'] }, { k: 'logo', label: 'URL del logo en remitos', full: true }]) },
  ] },
  { id: 'soporte', label: 'Soporte', icon: '🛟', group: 'Cuenta', title: 'Centro de soporte', desc: '¿Necesitás ayuda? Escribinos por nuestros canales oficiales o abrí un ticket.', tabs: [{ label: 'Mis tickets', crud: { entity: 'tickets_soporte', sort: byDateDesc(), defaults: () => ({ fecha: VG.today(), estado: 'Abierto', prioridad: 'Media' }), columns: [{ k: 'fecha', label: 'Fecha', fmt: date }, { k: 'asunto', label: 'Asunto' }, { k: 'prioridad', label: 'Prioridad', fmt: tb }, { k: 'estado', label: 'Estado', fmt: tb }], form: [{ k: 'asunto', label: 'Asunto', full: true, required: true }, { k: 'prioridad', label: 'Prioridad', type: 'select', options: ['Baja', 'Media', 'Alta'] }, { k: 'estado', label: 'Estado', type: 'select', options: ['Abierto', 'En curso', 'Resuelto'] }, { k: 'detalle', label: 'Detalle', type: 'textarea', full: true }], newLabel: '+ Nuevo ticket' } }] },

  { id: 'admin', label: 'Panel Vixan', icon: '🛡️', group: 'Plataforma', role: ['superadmin'], title: 'Panel Vixan — clientes de la plataforma', render: (v) => { const el = VG.h('<div></div>'); v.appendChild(el); renderAdmin(el); } },
];
})();
