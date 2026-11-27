// Vixan — utilidades y componentes de interfaz reutilizables
const VG = {};

VG.api = async (method, path, body) => {
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: body ? JSON.stringify(body) : undefined });
  let j = {};
  try { j = await r.json(); } catch {}
  if (r.status === 401 && !path.includes('/auth/')) { VG.showLogin(); throw new Error('Sesión vencida'); }
  if (!r.ok || j.ok === false) throw new Error(j.error || `Error ${r.status}`);
  return j.data;
};
VG.get = (p) => VG.api('GET', p);
VG.post = (p, b) => VG.api('POST', p, b);
VG.put = (p, b) => VG.api('PUT', p, b);
VG.del = (p) => VG.api('DELETE', p);

// ── Formatos ──
const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
VG.money = (n) => '$ ' + nf0.format(Math.round(Number(n) || 0));
VG.moneyShort = (n) => { n = Number(n) || 0; const a = Math.abs(n); return a >= 1e6 ? '$' + nf2.format(Math.round(n / 1e5) / 10) + 'M' : a >= 1e3 ? '$' + nf0.format(Math.round(n / 1e3)) + 'k' : '$' + nf0.format(n); };
VG.n = (n) => nf2.format(Number(n) || 0);
VG.pct = (n) => (n == null ? '—' : nf2.format(Math.round(n * 1000) / 10) + '%');
VG.date = (s) => { if (!s) return '—'; const t = String(s); const d = t.slice(0, 10).split('-'); return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : t; };
VG.datetime = (s) => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? s : d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); };
VG.today = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
VG.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
VG.h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
VG.badge = (txt, tone = '') => `<span class="badge ${tone}">${VG.esc(txt)}</span>`;

VG.ESTADOS = {
  pendiente: ['Pendiente', 'warn'], para_armar: ['Para armar', 'info'], para_despachar: ['Para despachar', 'teal'],
  enviado: ['Enviado', 'info'], entregado: ['Entregado', 'ok'], cancelado: ['Cancelado', 'err'],
};
VG.estadoBadge = (e) => { const x = VG.ESTADOS[e] || [e || '—', '']; return VG.badge(x[0], x[1]); };
VG.toneFor = (txt) => {
  const t = String(txt || '').toLowerCase();
  if (/(activ|conectad|ok|pagad|entregad|aprobad|recibid|emitid|enviada|resuelto|abierto|acept|respondido|vigente)/.test(t)) return 'ok';
  if (/(pend|borrador|revisar|parcial|sin responder|crític|bajo|no leído|por agotarse|en camino)/.test(t)) return 'warn';
  if (/(sin stock|cancel|rechaz|vencid|inactiv|sin conectar|error|cerrad|pausad)/.test(t)) return 'err';
  return '';
};

VG.toast = (msg, err) => {
  const el = VG.h(`<div class="toast ${err ? 'err' : ''}">${VG.esc(msg)}</div>`);
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3800);
};

// ── Modal ──
VG.modal = ({ title, body, wide, onSave, saveLabel = 'Guardar', footer = true }) => {
  const bg = VG.h(`<div class="modal-bg"><div class="modal ${wide ? 'wide' : ''}">
    <div class="modal-h"><h3>${VG.esc(title)}</h3><button class="icon-btn" data-x>✕</button></div>
    <div class="modal-b"></div>
    ${footer ? `<div class="modal-f"><button class="btn" data-x>${onSave ? 'Cancelar' : 'Cerrar'}</button>${onSave ? `<button class="btn primary" data-save>${saveLabel}</button>` : ''}</div>` : ''}
  </div></div>`);
  const b = bg.querySelector('.modal-b');
  if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
  const close = () => bg.remove();
  bg.querySelectorAll('[data-x]').forEach((x) => x.onclick = close);
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  const sv = bg.querySelector('[data-save]');
  if (sv) sv.onclick = async () => {
    sv.disabled = true; sv.textContent = 'Guardando…';
    try { await onSave(b); close(); } catch (e) { VG.toast(e.message, true); sv.disabled = false; sv.textContent = saveLabel; }
  };
  document.body.appendChild(bg);
  return { el: bg, body: b, close };
};
VG.confirm = (msg) => window.confirm(msg);

// ── Formularios declarativos ──
// field: {k,label,type:text|number|date|select|textarea|checkbox|items|tags, options, full, required, placeholder}
VG.form = (fields, data = {}) => {
  const f = VG.h('<div class="form"></div>');
  for (const fd of fields) {
    const v = data[fd.k] ?? fd.default ?? '';
    let html;
    if (fd.type === 'select') {
      const opts = typeof fd.options === 'function' ? fd.options() : fd.options || [];
      html = `<select name="${fd.k}">${opts.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${VG.esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${VG.esc(lab)}</option>`; }).join('')}</select>`;
    } else if (fd.type === 'textarea') html = `<textarea name="${fd.k}" rows="3" placeholder="${VG.esc(fd.placeholder || '')}">${VG.esc(v)}</textarea>`;
    else if (fd.type === 'checkbox') { f.appendChild(VG.h(`<label class="check ${fd.full ? 'full' : ''}"><input type="checkbox" name="${fd.k}" ${v ? 'checked' : ''}> ${VG.esc(fd.label)}</label>`)); continue; }
    else if (fd.type === 'items') { f.appendChild(VG.itemsEditor(fd, v || [])); continue; }
    else if (fd.type === 'tags') html = `<input name="${fd.k}" value="${VG.esc((v || []).join(', '))}" placeholder="separadas por coma">`;
    else html = `<input name="${fd.k}" type="${fd.type || 'text'}" value="${VG.esc(fd.type === 'date' ? String(v).slice(0, 10) : v)}" placeholder="${VG.esc(fd.placeholder || '')}" ${fd.step ? `step="${fd.step}"` : ''}>`;
    f.appendChild(VG.h(`<label class="${fd.full ? 'full' : ''}">${VG.esc(fd.label)}${fd.required ? ' *' : ''}${html}</label>`));
  }
  return f;
};
VG.readForm = (root, fields) => {
  const out = {};
  for (const fd of fields) {
    if (fd.type === 'items') { out[fd.k] = root.querySelector(`[data-items="${fd.k}"]`)._read(); continue; }
    const el = root.querySelector(`[name="${fd.k}"]`);
    if (!el) continue;
    if (fd.type === 'checkbox') out[fd.k] = el.checked;
    else if (fd.type === 'number') out[fd.k] = el.value === '' ? null : Number(el.value);
    else if (fd.type === 'tags') out[fd.k] = el.value.split(',').map((s) => s.trim()).filter(Boolean);
    else out[fd.k] = el.value;
    if (fd.required && (out[fd.k] === '' || out[fd.k] == null)) throw new Error(`Falta completar: ${fd.label}`);
  }
  return out;
};
// Editor de renglones (SKU, producto, cantidad, precio) con autocompletado del catálogo
VG.itemsEditor = (fd, items) => {
  const wrap = VG.h(`<div class="full items-ed" data-items="${fd.k}"><label style="font-size:12px;font-weight:700;color:#475569">${VG.esc(fd.label || 'Productos')}</label>
    <table><thead><tr class="small muted"><td>SKU</td><td style="width:45%">Producto</td><td style="width:80px">Cant.</td><td style="width:110px">Precio</td><td></td></tr></thead><tbody></tbody></table>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px"><button type="button" class="btn small">+ Agregar renglón</button><b data-tot></b></div>
    <datalist id="dl-sku"></datalist></div>`);
  const tb = wrap.querySelector('tbody');
  const dl = wrap.querySelector('datalist');
  const cat = VG.cache.productos || [];
  dl.innerHTML = cat.map((p) => `<option value="${VG.esc(p.sku)}">${VG.esc(p.nombre)}</option>`).join('');
  const tot = () => { wrap.querySelector('[data-tot]').textContent = 'Total ' + VG.money(wrap._read().reduce((a, i) => a + i.cantidad * i.precio, 0)); };
  const add = (it = {}) => {
    const tr = VG.h(`<tr><td><input list="dl-sku" data-f="sku" value="${VG.esc(it.sku || '')}"></td><td><input data-f="nombre" value="${VG.esc(it.nombre || '')}"></td><td><input type="number" data-f="cantidad" value="${it.cantidad ?? 1}"></td><td><input type="number" data-f="precio" value="${it.precio ?? 0}"></td><td><button type="button" class="btn small ghost">✕</button></td></tr>`);
    tr.querySelector('[data-f=sku]').addEventListener('change', (e) => { const p = cat.find((x) => x.sku === e.target.value); if (p) { tr.querySelector('[data-f=nombre]').value = p.nombre; tr.querySelector('[data-f=precio]').value = p.precio; tot(); } });
    tr.querySelectorAll('input').forEach((i) => i.addEventListener('input', tot));
    tr.querySelector('button').onclick = () => { tr.remove(); tot(); };
    tb.appendChild(tr);
  };
  wrap._read = () => [...tb.querySelectorAll('tr')].map((tr) => ({ sku: tr.querySelector('[data-f=sku]').value, nombre: tr.querySelector('[data-f=nombre]').value, cantidad: Number(tr.querySelector('[data-f=cantidad]').value) || 0, precio: Number(tr.querySelector('[data-f=precio]').value) || 0 })).filter((i) => i.sku || i.nombre);
  wrap.querySelector('.btn').onclick = () => add();
  (items.length ? items : [{}]).forEach(add);
  setTimeout(tot);
  return wrap;
};

// ── Exportaciones ──
VG.cellText = (col, row) => { const v = col.get ? col.get(row) : row[col.k]; return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); };
VG.exportCSV = (name, cols, rows) => {
  const lines = [cols.map((c) => c.label), ...rows.map((r) => cols.map((c) => VG.cellText(c, r)))];
  const csv = '﻿' + lines.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\n');
  VG.download(`${name}.csv`, csv, 'text/csv');
};
VG.exportExcel = (name, cols, rows) => {
  const html = `<html><head><meta charset="utf-8"></head><body><table border="1"><tr>${cols.map((c) => `<th>${VG.esc(c.label)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${cols.map((c) => `<td>${VG.esc(VG.cellText(c, r))}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
  VG.download(`${name}.xls`, html, 'application/vnd.ms-excel');
};
VG.exportPDF = (title, cols, rows) => {
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>${VG.esc(title)}</title><style>body{font-family:system-ui;font-size:11px;padding:20px}h2{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border-bottom:1px solid #ddd;padding:5px;text-align:left}th{background:#f1f5f9}</style></head><body>
    <h2>${VG.esc(title)}</h2><div>${VG.esc(VG.app.tenant?.nombre || '')} · ${new Date().toLocaleString('es-AR')}</div>
    <table><tr>${cols.map((c) => `<th>${VG.esc(c.label)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${cols.map((c) => `<td>${VG.esc(VG.cellText(c, r))}</td>`).join('')}</tr>`).join('')}</table>
    <script>onload=()=>print()<\/script></body></html>`);
  w.document.close();
};
VG.download = (filename, content, type) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

// ── Tabla CRUD declarativa ──
// cfg: {entity, columns:[{k,label,fmt,render,get,num}], form, search, filters:[{k,label,options}], chips:{k, options:[[val,label]]},
//       dateFilter, sort, selectable, rowActions(row,ctx)->[{label,onClick,tone}], toolbar(ctx)->[{label,onClick,primary}],
//       newLabel, canCreate, canEdit, canDelete, defaults, footer(rows), kpis(rows), pageSize, onRow}
VG.crud = (el, cfg) => {
  const ctx = { rows: [], filtered: [], sel: new Set(), page: 0, sortK: null, sortDir: 1, chip: 'todos', reload: null };
  const pageSize = cfg.pageSize || 50;
  el.innerHTML = '';
  if (cfg.note) el.appendChild(VG.h(`<div class="note ${cfg.noteTone || ''}">${cfg.note}</div>`));
  const kpiBox = VG.h('<div class="grid g4" style="margin-bottom:14px"></div>');
  if (cfg.kpis) el.appendChild(kpiBox);
  const chipBox = VG.h('<div class="chips"></div>');
  if (cfg.chips) el.appendChild(chipBox);
  const bar = VG.h('<div class="toolbar"></div>');
  el.appendChild(bar);
  const tw = VG.h('<div class="table-wrap"><table class="t"><thead></thead><tbody></tbody><tfoot></tfoot></table></div>');
  el.appendChild(tw);
  const pager = VG.h('<div class="pager"></div>');
  el.appendChild(pager);

  const cols = cfg.columns;
  const search = VG.h('<input type="search" placeholder="Buscar…">');
  if (cfg.search !== false) bar.appendChild(search);
  const filterEls = (cfg.filters || []).map((f) => {
    const s = VG.h(`<select title="${VG.esc(f.label)}"><option value="todos">${VG.esc(f.label)}: todos</option></select>`);
    s._f = f; bar.appendChild(s); return s;
  });
  let dDesde, dHasta;
  if (cfg.dateFilter) {
    dDesde = VG.h('<input type="date" title="Desde">'); dHasta = VG.h('<input type="date" title="Hasta">');
    bar.appendChild(dDesde); bar.appendChild(dHasta);
  }
  const right = VG.h('<div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap"></div>');
  bar.appendChild(right);

  const openForm = (row) => {
    const fields = typeof cfg.form === 'function' ? cfg.form(row) : cfg.form;
    const formEl = VG.form(fields, row || cfg.defaults?.() || {});
    try { cfg.onFormOpen?.(formEl, row); } catch (e) { console.error(e); }
    VG.modal({ title: row ? `Editar ${cfg.singular || ''}` : (cfg.newLabel || 'Nuevo').replace(/^\+\s*/, ''), body: formEl, wide: fields.some((f) => f.type === 'items'), onSave: async () => {
      let data = VG.readForm(formEl, fields);
      if (cfg.beforeSave) data = cfg.beforeSave(data, row) || data;
      if (row) await VG.put(`/api/r/${cfg.entity}/${row.id}`, data);
      else if (cfg.createPath) await VG.post(cfg.createPath, data);
      else await VG.post(`/api/r/${cfg.entity}`, data);
      VG.toast('Guardado'); await load();
    } });
  };
  ctx.openForm = openForm;

  const renderToolbar = () => {
    right.innerHTML = '';
    const btns = [];
    if (cfg.toolbar) btns.push(...cfg.toolbar(ctx));
    if (cfg.selectable && cfg.canDelete !== false) btns.push({ label: `🗑 Eliminar (${ctx.sel.size})`, disabled: !ctx.sel.size, onClick: async () => { if (!VG.confirm(`¿Eliminar ${ctx.sel.size} registros?`)) return; await VG.post(`/api/r/${cfg.entity}/bulk-delete`, { ids: [...ctx.sel] }); ctx.sel.clear(); VG.toast('Eliminados'); load(); } });
    btns.push({ label: 'Excel', onClick: () => VG.exportExcel(cfg.entity, exportCols(), ctx.filtered) });
    btns.push({ label: 'PDF', onClick: () => VG.exportPDF(cfg.title || cfg.entity, exportCols(), ctx.filtered) });
    if (cfg.form && cfg.canCreate !== false) btns.push({ label: cfg.newLabel || '+ Nuevo', primary: true, onClick: () => openForm(null) });
    for (const b of btns) {
      const e = VG.h(`<button class="btn ${b.primary ? 'primary' : ''} ${b.small ? 'small' : ''}">${VG.esc(b.label)}</button>`);
      e.disabled = !!b.disabled; e.onclick = () => b.onClick(ctx); right.appendChild(e);
    }
  };
  const exportCols = () => cols.filter((c) => c.label && c.export !== false).map((c) => ({ label: c.label, get: c.get || ((r) => (c.fmt ? stripHtml(c.fmt(r[c.k], r)) : r[c.k])) }));
  const stripHtml = (s) => String(s ?? '').replace(/<[^>]+>/g, '');

  const apply = () => {
    const q = search.value.toLowerCase().trim();
    let rows = ctx.rows;
    if (q) rows = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
    for (const s of filterEls) if (s.value !== 'todos') rows = rows.filter((r) => String((s._f.get ? s._f.get(r) : r[s._f.k]) ?? '') === s.value);
    if (cfg.chips && ctx.chip !== 'todos') rows = rows.filter((r) => cfg.chips.match ? cfg.chips.match(r, ctx.chip) : String(r[cfg.chips.k]) === ctx.chip);
    if (dDesde?.value) rows = rows.filter((r) => String(r[cfg.dateFilter] || '').slice(0, 10) >= dDesde.value);
    if (dHasta?.value) rows = rows.filter((r) => String(r[cfg.dateFilter] || '').slice(0, 10) <= dHasta.value);
    if (ctx.sortK) { const c = cols.find((x) => x.k === ctx.sortK); const g = c?.get || ((r) => r[ctx.sortK]); rows = [...rows].sort((a, b) => { const x = g(a), y = g(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'es', { numeric: true })) * ctx.sortDir; }); }
    ctx.filtered = rows;
    renderBody();
  };
  const renderHead = () => {
    tw.querySelector('thead').innerHTML = `<tr>${cfg.selectable ? '<th style="width:28px"><input type="checkbox" data-all></th>' : ''}${cols.map((c) => `<th data-k="${c.k}" class="${c.num ? 'num' : ''}">${VG.esc(c.label)}${ctx.sortK === c.k ? (ctx.sortDir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}<th></th></tr>`;
    tw.querySelectorAll('th[data-k]').forEach((th) => th.onclick = () => { const k = th.dataset.k; ctx.sortDir = ctx.sortK === k ? -ctx.sortDir : 1; ctx.sortK = k; renderHead(); apply(); });
    const all = tw.querySelector('[data-all]');
    if (all) all.onchange = () => { ctx.filtered.slice(ctx.page * pageSize, (ctx.page + 1) * pageSize).forEach((r) => all.checked ? ctx.sel.add(r.id) : ctx.sel.delete(r.id)); renderBody(); };
  };
  const renderBody = () => {
    const tb = tw.querySelector('tbody');
    const pages = Math.max(1, Math.ceil(ctx.filtered.length / pageSize));
    if (ctx.page >= pages) ctx.page = pages - 1;
    const slice = ctx.filtered.slice(ctx.page * pageSize, (ctx.page + 1) * pageSize);
    tb.innerHTML = slice.length ? '' : `<tr><td class="empty" colspan="${cols.length + 2}">${cfg.empty || 'Sin registros todavía.'}</td></tr>`;
    for (const r of slice) {
      const tr = document.createElement('tr');
      tr.innerHTML = (cfg.selectable ? `<td><input type="checkbox" ${ctx.sel.has(r.id) ? 'checked' : ''}></td>` : '') + cols.map((c) => {
        const v = c.get ? c.get(r) : r[c.k];
        const html = c.render ? c.render(r) : c.fmt ? c.fmt(v, r) : VG.esc(v ?? '—');
        return `<td class="${c.num ? 'num' : ''}">${html}</td>`;
      }).join('') + '<td style="white-space:nowrap;text-align:right"></td>';
      if (cfg.selectable) tr.querySelector('input').onchange = (e) => { e.target.checked ? ctx.sel.add(r.id) : ctx.sel.delete(r.id); renderToolbar(); };
      const act = tr.lastElementChild;
      const acts = [...(cfg.rowActions ? cfg.rowActions(r, ctx) : [])];
      if (cfg.form && cfg.canEdit !== false) acts.push({ label: 'Editar', onClick: () => openForm(r) });
      if (cfg.canDelete !== false && !cfg.selectable) acts.push({ label: '✕', tone: 'danger', onClick: async () => { if (!VG.confirm('¿Eliminar este registro?')) return; await VG.del(`/api/r/${cfg.entity}/${r.id}`); VG.toast('Eliminado'); load(); } });
      for (const a of acts) { const b = VG.h(`<button class="btn small ${a.tone || ''}" style="margin-left:4px">${VG.esc(a.label)}</button>`); b.onclick = (e) => { e.stopPropagation(); a.onClick(r, ctx); }; act.appendChild(b); }
      if (cfg.onRow) { tr.style.cursor = 'pointer'; tr.onclick = (e) => { if (!e.target.closest('button,input')) cfg.onRow(r, ctx); }; }
      tb.appendChild(tr);
    }
    tw.querySelector('tfoot').innerHTML = cfg.footer ? cfg.footer(ctx.filtered, cols, !!cfg.selectable) : '';
    pager.innerHTML = `<span>${ctx.filtered.length} registros${ctx.sel.size ? ` · ${ctx.sel.size} seleccionados` : ''}</span><span>${pages > 1 ? `<button class="btn small" data-p="-1">‹</button> ${ctx.page + 1} / ${pages} <button class="btn small" data-p="1">›</button>` : ''}</span>`;
    pager.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { ctx.page = Math.min(pages - 1, Math.max(0, ctx.page + Number(b.dataset.p))); renderBody(); });
    if (cfg.kpis) kpiBox.innerHTML = cfg.kpis(ctx.filtered, ctx.rows).map(VG.kpi).join('');
    renderToolbar();
  };
  const renderChips = () => {
    if (!cfg.chips) return;
    const opts = [['todos', 'Todos'], ...cfg.chips.options];
    chipBox.innerHTML = opts.map(([v, l]) => { const n = v === 'todos' ? ctx.rows.length : ctx.rows.filter((r) => cfg.chips.match ? cfg.chips.match(r, v) : String(r[cfg.chips.k]) === v).length; return `<button class="chip ${ctx.chip === v ? 'active' : ''}" data-v="${v}">${VG.esc(l)}<b>${n}</b></button>`; }).join('');
    chipBox.querySelectorAll('.chip').forEach((b) => b.onclick = () => { ctx.chip = b.dataset.v; ctx.page = 0; renderChips(); apply(); });
  };
  async function load() {
    try {
      let rows = cfg.load ? await cfg.load() : await VG.get(`/api/r/${cfg.entity}`);
      if (cfg.sort) rows.sort(cfg.sort);
      ctx.rows = rows;
      for (const s of filterEls) {
        const opts = s._f.options ? (typeof s._f.options === 'function' ? s._f.options() : s._f.options) : [...new Set(rows.map((r) => s._f.get ? s._f.get(r) : r[s._f.k]).filter((x) => x !== '' && x != null))].sort();
        const cur = s.value;
        s.innerHTML = `<option value="todos">${VG.esc(s._f.label)}: todos</option>` + opts.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${VG.esc(v)}">${VG.esc(l)}</option>`; }).join('');
        s.value = cur || 'todos';
      }
      renderChips(); apply();
    } catch (e) { tw.querySelector('tbody').innerHTML = `<tr><td class="empty" colspan="${cols.length + 2}">${VG.esc(e.message)}</td></tr>`; }
  }
  ctx.reload = load;
  ctx.refreshToolbar = renderToolbar;
  search.addEventListener('input', () => { ctx.page = 0; apply(); });
  filterEls.forEach((s) => s.onchange = () => { ctx.page = 0; apply(); });
  dDesde?.addEventListener('change', apply); dHasta?.addEventListener('change', apply);
  renderHead();
  tw.querySelector('tbody').innerHTML = `<tr><td class="empty" colspan="${cols.length + 2}">Cargando…</td></tr>`;
  load();
  return ctx;
};

VG.kpi = (k) => `<div class="card kpi ${k.tone || ''}"><div class="l">${VG.esc(k.label)}</div><div class="v">${k.value}</div><div class="s">${k.sub || ''}</div></div>`;

// ── Gráficos SVG livianos ──
VG.lineChart = (points, { height = 220, fmt = VG.moneyShort } = {}) => {
  const W = 800, H = height, P = { l: 56, r: 12, t: 12, b: 26 };
  const max = Math.max(1, ...points.map((p) => p.y));
  const x = (i) => P.l + (i * (W - P.l - P.r)) / Math.max(1, points.length - 1);
  const y = (v) => H - P.b - (v / max) * (H - P.t - P.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join('');
  const area = `${path}L${x(points.length - 1)},${H - P.b}L${x(0)},${H - P.b}Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(max * f)}" y2="${y(max * f)}" stroke="#eef2f6"/><text x="${P.l - 6}" y="${y(max * f) + 4}" font-size="11" text-anchor="end" fill="#94a3b8">${fmt(max * f)}</text>`).join('');
  const step = Math.ceil(points.length / 10);
  const labels = points.map((p, i) => (i % step === 0 ? `<text x="${x(i)}" y="${H - 6}" font-size="11" text-anchor="middle" fill="#94a3b8">${VG.esc(p.x)}</text>` : '')).join('');
  const dots = points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.y)}" r="3" fill="#137a71"><title>${VG.esc(p.x)}: ${fmt(p.y)}</title></circle>`).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}">${ticks}<path d="${area}" fill="#1FB1A4" opacity=".12"/><path d="${path}" fill="none" stroke="#1FB1A4" stroke-width="2.4"/>${dots}${labels}</svg></div>`;
};
VG.bars = (rows, { label = 'nombre', value = 'facturacion', fmt = VG.moneyShort, extra } = {}) => {
  const max = Math.max(1, ...rows.map((r) => r[value]));
  return rows.length ? rows.map((r) => `<div class="bar-row"><span title="${VG.esc(r[label])}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${VG.esc(r[label])}</span><div class="bar-track"><div class="bar" style="width:${(r[value] / max) * 100}%"></div></div><b class="num">${fmt(r[value])}${extra ? ' ' + extra(r) : ''}</b></div>`).join('') : '<div class="muted">Sin datos en el período.</div>';
};
VG.cache = {};
