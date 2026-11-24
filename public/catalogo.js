// Vixan — Catálogo y precios: Catálogo, Costos, Listas de precios, Combos, Fraccionados y Cajas
(() => {
const { money, esc, badge } = VG;
const n = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
const pct = (v) => (v == null ? '—' : `${VG.n(v)} %`);
const TIPO_LABEL = { unidad: 'Producto x unidad', combo: 'Combo', caja: 'Caja', presentacion: 'Presentación' };
const UNIDADES = ['g', 'kg', 'ml', 'l', 'cm', 'm', 'u'];

// ── Datos compartidos por las pestañas ──
const C = { data: null };
async function cargar() {
  C.data = await VG.get('/api/catalogo');
  C.bySku = new Map(C.data.productos.map((p) => [String(p.sku), p]));
  VG.cache.productos = C.data.productos;
  return C.data;
}
const productos = async () => (await cargar()).productos;
const listaNombre = (id) => (id === 'general' ? 'Precio general' : C.data?.listas.find((l) => String(l.id) === String(id))?.nombre || '—');

// Filtros comunes de las pestañas (como en el portal de referencia)
const filtros = [
  { k: 'fabricante', label: 'Fabricante' }, { k: 'marca', label: 'Marca' }, { k: 'categoria', label: 'Categoría' },
];
const filtroMostrar = { k: 'tipo', label: 'Mostrar', options: [['unidad', 'Unidades'], ['combo', 'Combos'], ['caja', 'Cajas'], ['presentacion', 'Presentaciones (fraccionados)']] };

// Selector de productos con búsqueda (para combos, cajas y fraccionados)
function selectorProducto(placeholder, filtro = () => true) {
  const id = 'dl-' + Math.random().toString(36).slice(2);
  const el = VG.h(`<span style="display:contents"><input list="${id}" placeholder="${esc(placeholder)}" style="flex:1;min-width:240px"><datalist id="${id}"></datalist></span>`);
  el.querySelector('datalist').innerHTML = C.data.productos.filter(filtro).slice(0, 5000).map((p) => `<option value="${esc(p.sku)}">${esc(p.nombre)}</option>`).join('');
  el.input = el.querySelector('input');
  el.valor = () => C.bySku.get(el.input.value.trim()) || null;
  return el;
}

// ═════════════ Detalle de un producto ═════════════
function detalle(p, ctx) {
  const lineas = (pares) => pares.map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:3px 0;border-bottom:1px solid #f1f5f9"><span class="muted">${esc(k)}</span><b>${v}</b></div>`).join('');
  const precios = [['Precio general', money(p.precio_general)], ...C.data.listas.map((l) => [l.nombre, p.precios_lista[l.id] == null ? '<span class="muted">sin precio</span>' : money(p.precios_lista[l.id])])];
  const body = VG.h(`<div>
    <div class="muted small" style="margin-bottom:10px">SKU <code class="k">${esc(p.sku)}</code> · ${esc(TIPO_LABEL[p.tipo])}${p.ean ? ' · EAN ' + esc(p.ean) : ''}</div>
    <div class="grid g3">
      <div class="card"><h3>Información general</h3>${lineas([['Fabricante', esc(p.fabricante || '—')], ['Marca', esc(p.marca || '—')], ['Categoría', esc(p.categoria || '—')], ['SKU del proveedor', esc(p.sku_proveedor || '—')], ['Peso', p.peso_kg ? VG.n(p.peso_kg) + ' kg' : '—'], ['Medidas', p.largo ? `${VG.n(p.largo)} × ${VG.n(p.ancho)} × ${VG.n(p.alto)} cm` : '—'], ['Publicado en la tienda', p.market ? 'Sí' : 'No']])}</div>
      <div class="card"><h3>Stock y costos</h3>${lineas([['Stock disponible', VG.n(p.stock)], ['Stock mínimo', p.stock_minimo ? VG.n(p.stock_minimo) : '—'], ['Costo en dólares', p.costo_usd ? 'US$ ' + VG.n(p.costo_usd) : '—'], ['Costo proveedor', money(p.costo_base)], ['Costos internos', p.tipo === 'unidad' ? pct(p.costos_internos ?? C.data.config.costos_internos_general) : '—'], ['Costo final', money(p.costo_final)], ['Margen', p.margen == null ? '—' : pct(p.margen)]])}</div>
      <div class="card"><h3>Precios de venta</h3>${lineas(precios)}</div>
    </div>
    ${p.detalle_componentes ? `<div class="card" style="margin-top:12px"><h3>Componentes</h3>${tablaComponentes(p)}</div>` : ''}
    ${p.tipo === 'presentacion' ? `<div class="note" style="margin-top:12px">Es una presentación de <b>${esc(p.fraccion_de)}</b>: ${p.partes} partes por venta. Su stock sale del producto entero.</div>` : ''}
  </div>`);
  const m = VG.modal({ title: p.nombre, body, wide: true, footer: false });
  const pie = VG.h('<div class="modal-f"></div>');
  const btn = (label, fn, tone = '') => { const b = VG.h(`<button class="btn ${tone}">${esc(label)}</button>`); b.onclick = fn; pie.appendChild(b); };
  btn('Eliminar', async () => { if (!VG.confirm(`¿Eliminar ${p.sku} del catálogo?`)) return; await VG.del(`/api/r/productos/${p.id}`); m.close(); VG.toast('Producto eliminado'); ctx?.reload(); }, 'danger');
  if (p.tipo === 'combo' || p.tipo === 'caja') btn('Editar componentes', () => { m.close(); editorArmado(p.tipo, p, ctx); });
  btn('Editar', () => { m.close(); ctx?.openForm(p); });
  btn('Cerrar', () => m.close(), 'primary');
  m.el.querySelector('.modal').appendChild(pie);
}
const tablaComponentes = (p) => `<table class="t"><thead><tr><th>SKU</th><th>Producto</th><th class="num">Cantidad</th><th class="num">Costo unitario</th><th class="num">Subtotal</th><th class="num">Disponible</th></tr></thead><tbody>${p.detalle_componentes.map((c) => `<tr><td><code class="k">${esc(c.sku)}</code></td><td>${c.existe ? esc(c.nombre) : badge('No está en el catálogo', 'err')}</td><td class="num">${VG.n(c.cantidad)}</td><td class="num">${money(c.costo_unitario)}</td><td class="num">${money(c.subtotal)}</td><td class="num">${VG.n(c.disponible)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="4"><b>Suma de los componentes</b></td><td class="num"><b>${money(p.suma_componentes)}</b></td><td></td></tr></tfoot></table>`;

// ═════════════ Pestaña Catálogo ═════════════
const formProducto = (row) => [
  { k: 'sku', label: 'SKU', required: true }, { k: 'nombre', label: 'Nombre del producto', required: true },
  { k: 'fabricante', label: 'Fabricante' }, { k: 'marca', label: 'Marca' },
  { k: 'categoria', label: 'Categoría', type: 'select', options: () => ['', ...new Set([...(C.data?.categorias || []), row?.categoria].filter((x) => x !== undefined))].map((c) => [c, c || 'Sin categoría']) },
  ...(row?.tipo === 'presentacion' ? [] : [{ k: 'tipo', label: 'Tipo de ítem', type: 'select', options: [['unidad', 'Producto x unidad'], ['combo', 'Combo (los componentes se cargan en Combos)'], ['caja', 'Caja (los componentes se cargan en Cajas)']], default: 'unidad' }]),
  { k: 'costo', label: 'Costo proveedor ($)', type: 'number', step: '0.01' }, { k: 'precio', label: 'Precio de venta (si no usa markup)', type: 'number', step: '0.01' },
  { k: 'stock_minimo', label: 'Stock mínimo', type: 'number' }, { k: 'ean', label: 'Código de barras (EAN)' },
  { k: 'sku_proveedor', label: 'SKU del proveedor', placeholder: 'el código con el que lo pide el proveedor' },
  { k: 'peso_kg', label: 'Peso (kg)', type: 'number', step: '0.01' }, { k: 'largo', label: 'Largo (cm)', type: 'number', step: '0.1' },
  { k: 'ancho', label: 'Ancho (cm)', type: 'number', step: '0.1' }, { k: 'alto', label: 'Alto (cm)', type: 'number', step: '0.1' },
  { k: 'litros', label: 'Litros por unidad', type: 'number', step: '0.01' },
  { k: 'market', label: 'Publicar en la tienda', type: 'checkbox' },
  { k: 'subcategoria', label: 'Subcategoría en la tienda', placeholder: 'ej.: Vasos' },
  { k: 'venta_multiplo', label: 'Se vende por bulto de (unidades)', type: 'number', placeholder: '1' },
  { k: 'precio_anterior', label: 'Precio anterior (para mostrar oferta)', type: 'number', step: '0.01' },
  { k: 'nuevo', label: 'Marcar como novedad', type: 'checkbox' },
  { k: 'descripcion', label: 'Descripción para la tienda', type: 'textarea', full: true },
  { k: 'imagenes', label: 'Fotos (una dirección https por línea)', type: 'textarea', full: true, placeholder: 'https://…/foto1.jpg' },
];
function tabCatalogo(el) {
  VG.crud(el, {
    entity: 'productos', singular: 'producto', newLabel: '+ Crear producto', title: 'Catálogo',
    load: productos, sort: (a, b) => String(a.sku).localeCompare(String(b.sku), 'es', { numeric: true }),
    filters: [...filtros, filtroMostrar],
    columns: [
      { k: 'sku', label: 'SKU', fmt: (v) => `<code class="k">${esc(v)}</code>` },
      { k: 'nombre', label: 'Producto', fmt: (v, r) => `${esc(v)}${r.tipo !== 'unidad' ? ' ' + badge(TIPO_LABEL[r.tipo], 'info') : ''}${r.fraccion ? ' ' + badge('Fraccionado', 'teal') : ''}` },
      { k: 'fabricante', label: 'Fabricante' }, { k: 'marca', label: 'Marca' }, { k: 'categoria', label: 'Categoría' },
      { k: 'precio_general', label: 'Precio', fmt: (v) => (v == null ? '<span class="muted">sin precio</span>' : money(v)), num: true },
      { k: 'stock', label: 'Stock', num: true, fmt: (v) => (v <= 0 ? badge(VG.n(v), 'err') : VG.n(v)) },
      { k: 'market', label: 'Tienda', fmt: (v) => (v ? badge('En la tienda', 'ok') : '—') },
      { k: 'woo_id', label: 'Woo', fmt: (v) => (v ? '🟣' : '—') },
    ],
    rowActions: (r, ctx) => [{ label: 'Detalles', onClick: () => detalle(r, ctx) }],
    form: formProducto,
    beforeSave: (d, row) => { if (!row && d.tipo !== 'unidad') d.componentes = []; return d; },
    toolbar: (ctx) => [
      { label: '🔄 Recalcular precios', onClick: async () => { if (!VG.confirm('Recalcula todos los precios que siguen al markup (costo final × markup) y le pone a cada combo y caja la suma de sus componentes. Los productos con precio fijo quedan igual. ¿Seguimos?')) return; const r = await VG.post('/api/catalogo/recalcular'); VG.toast(`Listo: ${r.precios} precios y ${r.combos} combos/cajas actualizados`); ctx.reload(); } },
      { label: '📥 Importar desde Excel/CSV', onClick: () => modalImportar(ctx) },
      { label: '🏷️ Categorías', onClick: () => modalCategorias(ctx) },
      { label: 'Exportar por lista de precios', onClick: () => modalExportar(ctx) },
    ],
  });
}

// ═════════════ Importar productos desde Excel / CSV ═════════════
const PLANTILLA = [
  { label: 'SKU', ej: 'BZ-0001' }, { label: 'Nombre', ej: 'Vaso nórdico 350 ml' }, { label: 'Categoría', ej: 'Bazar' }, { label: 'Subcategoría', ej: 'Vasos' },
  { label: 'Precio', ej: '9700' }, { label: 'Precio anterior', ej: '' }, { label: 'Se vende por bulto de', ej: '6' }, { label: 'Novedad', ej: 'Sí' },
  { label: 'Stock', ej: '120' }, { label: 'Costo', ej: '5200' }, { label: 'Marca', ej: '' }, { label: 'Descripción', ej: 'Vaso de vidrio templado, apto lavavajillas.' },
  { label: 'Fotos', ej: 'https://misitio.com/fotos/vaso1.jpg' },
];
function modalImportar(ctx) {
  const body = VG.h(`<div>
    <p>Subí un Excel (.xlsx) o un CSV con <b>una fila por producto</b> y los títulos en la primera fila. Solo el <b>SKU</b> es obligatorio (y el nombre, si el producto es nuevo). Las columnas que reconoce: ${PLANTILLA.map((c) => `<code class="k" style="white-space:nowrap">${esc(c.label)}</code>`).join(' ')}. <a href="#" data-plantilla>Descargar plantilla</a></p>
    <label class="full" style="display:block;margin:12px 0"><input type="file" accept=".xlsx,.csv,.txt,.xls" data-archivo></label>
    <div class="form">
      <label class="check full"><input type="checkbox" data-publicar checked><span>Marcar los productos para <b>publicar en la tienda</b></span></label>
      <label class="check full"><input type="checkbox" data-stock checked><span>Cargar la columna Stock como <b>stock inicial</b> (solo en productos nuevos)</span></label>
      <label class="check full"><input type="checkbox" data-actualizar checked><span>Si el SKU ya existe, <b>actualizar</b> el producto con los datos del archivo (las celdas vacías no borran nada)</span></label>
      <label>Depósito del stock inicial<select data-deposito><option>Central</option></select></label>
    </div>
    <div data-resultado style="margin-top:14px"></div>
  </div>`);
  const q = (x) => body.querySelector(x);
  VG.get('/api/r/depositos').then((ds) => { const nombres = [...new Set(['Central', ...ds.map((d) => d.nombre).filter(Boolean)])]; q('[data-deposito]').innerHTML = nombres.map((n) => `<option>${esc(n)}</option>`).join(''); }).catch(() => {});
  q('[data-plantilla]').onclick = (e) => { e.preventDefault(); VG.exportCSV('plantilla-productos-vixan', PLANTILLA.map((c, i) => ({ label: c.label, k: String(i) })), [Object.fromEntries(PLANTILLA.map((c, i) => [String(i), c.ej]))]); };
  let archivo = null; let revisado = null;
  const opciones = () => ({ publicar: q('[data-publicar]').checked, stockInicial: q('[data-stock]').checked, actualizar: q('[data-actualizar]').checked, deposito: q('[data-deposito]').value });
  const leer = (f) => new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => mal(new Error('No se pudo leer el archivo')); r.readAsDataURL(f); });
  body.appendChild(VG.h('<div class="toolbar" style="margin-top:14px;justify-content:flex-end"><button class="btn" data-cerrar>Cancelar</button><button class="btn primary" data-ok>Revisar archivo</button></div>'));
  const m = VG.modal({ title: 'Importar productos', body, wide: true, footer: false });
  const btn = q('[data-ok]');
  q('[data-cerrar]').onclick = () => m.close();
  const reiniciar = () => { revisado = null; btn.disabled = false; btn.textContent = 'Revisar archivo'; q('[data-resultado]').innerHTML = ''; };
  btn.onclick = async () => {
    if (!archivo) return VG.toast('Elegí un archivo', true);
    const texto = btn.textContent; btn.disabled = true;
    try {
      if (!revisado) {
        btn.textContent = 'Revisando…';
        revisado = await VG.post('/api/catalogo/importar', { nombre: archivo.nombre, contenido: archivo.contenido, probar: true, ...opciones() });
        mostrar(revisado);
        return;
      }
      btn.textContent = 'Importando…';
      const r = await VG.post('/api/catalogo/importar', { nombre: archivo.nombre, contenido: archivo.contenido, probar: false, ...opciones() });
      VG.toast(`Importados: ${r.nuevos} nuevos, ${r.actualizados} actualizados${r.conStock ? `, stock inicial en ${r.conStock}` : ''}`);
      VG.cache.productos = await VG.get('/api/r/productos');
      m.close(); ctx.reload();
    } catch (e) { VG.toast(e.message, true); btn.disabled = false; btn.textContent = texto; }
  };
  q('[data-archivo]').onchange = async (e) => { const f = e.target.files[0]; reiniciar(); archivo = f ? { nombre: f.name, contenido: await leer(f) } : null; };
  body.querySelectorAll('input[type=checkbox], select').forEach((x) => x.addEventListener('change', reiniciar));
  function mostrar(r) {
    const total = r.nuevos + r.actualizados;
    q('[data-resultado]').innerHTML = `<div class="grid g4" style="margin-bottom:10px">${VG.kpi({ label: 'Nuevos', value: r.nuevos, tone: 'teal' })}${VG.kpi({ label: 'Se actualizan', value: r.actualizados })}${VG.kpi({ label: 'Con stock inicial', value: r.conStock, sub: r.stockTotal ? `${VG.n(r.stockTotal)} unidades` : '' })}${VG.kpi({ label: 'Con errores', value: r.errores.length, tone: r.errores.length ? 'err' : '' })}</div>
      ${r.ignoradas.length ? `<div class="note">Columnas que no se usan: ${r.ignoradas.map((x) => `<code class="k">${esc(x)}</code>`).join(' ')}</div>` : ''}
      ${r.errores.length ? `<div class="note warn"><b>Filas que no se importan:</b><br>${r.errores.slice(0, 30).map((e) => `Fila ${e.fila}${e.sku ? ` (${esc(e.sku)})` : ''}: ${esc(e.error)}`).join('<br>')}${r.errores.length > 30 ? `<br>… y ${r.errores.length - 30} más` : ''}</div>` : ''}
      ${r.avisos.length ? `<div class="note">${r.avisos.slice(0, 10).map((a) => `${a.fila ? `Fila ${a.fila} (${esc(a.sku)}): ` : ''}${esc(a.aviso)}`).join('<br>')}${r.avisos.length > 10 ? `<br>… y ${r.avisos.length - 10} avisos más` : ''}</div>` : ''}
      ${r.ejemplos.length ? `<table class="t"><thead><tr><th>Fila</th><th>SKU</th><th>Producto</th><th>Categoría</th><th class="num">Precio</th><th class="num">Stock inicial</th><th></th></tr></thead><tbody>${r.ejemplos.map((x) => `<tr><td>${x.fila}</td><td><code class="k">${esc(x.sku)}</code></td><td>${esc(x.nombre || '')}</td><td>${esc(x.categoria || '—')}</td><td class="num">${x.precio == null ? '—' : money(x.precio)}</td><td class="num">${x.stock == null ? '—' : VG.n(x.stock)}</td><td>${badge(x.accion, x.accion === 'Nuevo' ? 'ok' : 'info')}</td></tr>`).join('')}</tbody></table><div class="small muted" style="margin-top:4px">Primeras ${r.ejemplos.length} filas de ${total}.</div>` : ''}`;
    btn.disabled = !total; btn.textContent = total ? `Importar ${total} producto${total === 1 ? '' : 's'}` : 'Nada para importar';
  }
}

function modalCategorias(ctx) {
  const cats = C.data.categorias;
  const marcas = [...new Set(C.data.productos.map((p) => p.marca).filter(Boolean))].sort();
  const fabs = [...new Set(C.data.productos.map((p) => p.fabricante).filter(Boolean))].sort();
  const sinCat = C.data.productos.filter((p) => !p.categoria).length;
  const body = VG.h(`<div>
    <h3 style="margin-top:0">Mis categorías (${cats.length})</h3>
    <div data-lista style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${cats.map((c) => `<span class="badge">${esc(c)} · ${C.data.productos.filter((p) => p.categoria === c).length}</span>`).join('') || '<span class="muted">Todavía no creaste ninguna.</span>'}</div>
    <div class="toolbar"><input data-nueva placeholder="Nueva categoría"><button class="btn" data-crear>Crear</button></div>
    <h3>Asignar en masa</h3>
    <div class="form grid" style="grid-template-columns:1fr 1fr">
      <label>Categoría<select data-cat><option value="">— sacar la categoría —</option>${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
      <label>A los productos de<select data-a><option value="tabla">lo que se ve en la tabla (${ctx.filtered.length})</option><option value="marca">una marca</option><option value="fabricante">un fabricante</option><option value="sin">los que no tienen categoría (${sinCat})</option></select></label>
      <label data-cual style="display:none">Cuál<select data-v></select></label>
    </div>
    <p class="muted small" data-cuantos></p>
  </div>`);
  const $ = (s) => body.querySelector(s);
  const elegidos = () => {
    const a = $('[data-a]').value, v = $('[data-v]').value;
    if (a === 'tabla') return ctx.filtered;
    if (a === 'sin') return C.data.productos.filter((p) => !p.categoria);
    return C.data.productos.filter((p) => p[a] === v);
  };
  const refrescar = () => {
    const a = $('[data-a]').value;
    $('[data-cual]').style.display = a === 'marca' || a === 'fabricante' ? '' : 'none';
    if (a === 'marca' || a === 'fabricante') { const prev = $('[data-v]').value; $('[data-v]').innerHTML = (a === 'marca' ? marcas : fabs).map((x) => `<option>${esc(x)}</option>`).join(''); if (prev) $('[data-v]').value = prev; }
    $('[data-cuantos]').textContent = `${elegidos().length} productos quedan con esta categoría.`;
  };
  $('[data-a]').onchange = refrescar; $('[data-v]').onchange = refrescar; refrescar();
  $('[data-crear]').onclick = async () => { const nombre = $('[data-nueva]').value.trim(); if (!nombre) return; await VG.post('/api/r/categorias', { nombre }); await cargar(); m.close(); modalCategorias(ctx); VG.toast('Categoría creada'); };
  const m = VG.modal({ title: 'Categorías de productos', body, saveLabel: 'Asignar', onSave: async () => {
    const ids = elegidos().map((p) => p.id);
    if (!ids.length) throw new Error('No hay productos para asignar');
    const r = await VG.post('/api/catalogo/categorias/asignar', { categoria: $('[data-cat]').value, ids });
    VG.toast(`${r.actualizados} productos actualizados`); ctx.reload();
  } });
}

function modalExportar(ctx) {
  const listas = [['general', 'Precio general'], ...C.data.listas.map((l) => [l.id, l.nombre])];
  const body = VG.h(`<div><p class="muted small">Marcá las listas que querés incluir. Se exportan los productos que se ven en la tabla (${ctx.filtered.length}).</p>
    <div class="form grid" style="grid-template-columns:1fr">
      <label>Formato<select data-f><option value="xls">Excel (una columna de precios por lista)</option><option value="pdf">PDF (una columna por lista)</option></select></label>
      <div>${listas.map(([id, nom]) => `<label class="check"><input type="checkbox" data-l="${esc(id)}" checked> ${esc(nom)}</label>`).join('')}</div>
      <label class="check"><input type="checkbox" data-s> Sólo productos con stock</label>
    </div></div>`);
  VG.modal({ title: 'Exportar catálogo por lista de precios', body, saveLabel: 'Exportar', onSave: async () => {
    const ids = [...body.querySelectorAll('[data-l]:checked')].map((c) => c.dataset.l);
    if (!ids.length) throw new Error('Elegí al menos una lista');
    let rows = ctx.filtered;
    if (body.querySelector('[data-s]').checked) rows = rows.filter((r) => r.stock > 0);
    const cols = [{ label: 'SKU', get: (r) => r.sku }, { label: 'Producto', get: (r) => r.nombre }, { label: 'Marca', get: (r) => r.marca || '' }, { label: 'Stock', get: (r) => r.stock },
      ...ids.map((id) => ({ label: listaNombre(id), get: (r) => { const v = id === 'general' ? r.precio_general : r.precios_lista[id]; return v == null ? '' : body.querySelector('[data-f]').value === 'pdf' ? money(v) : v; } }))];
    if (body.querySelector('[data-f]').value === 'pdf') VG.exportPDF('Lista de precios', cols, rows); else VG.exportExcel('lista-de-precios', cols, rows);
  } });
}

// ═════════════ Tabla con celdas editables (Costos y Listas) ═════════════
// Guarda lo que se escribe en "cambios" hasta que se toca Guardar; al cambiar de página no se pierde.
function editable(el, cambios, onInput) {
  el.addEventListener('input', (e) => {
    const i = e.target.closest('input[data-id]');
    if (!i) return;
    const c = cambios.get(i.dataset.id) || {};
    c[i.dataset.k] = i.value;
    cambios.set(i.dataset.id, c);
    i.classList.add('dirty');
    onInput?.(i, c);
    el.dispatchEvent(new CustomEvent('cambios'));
  });
}
const celda = (r, k, valor, cambios, { ancho = 90, placeholder = '', paso = '0.01', titulo = '' } = {}) => {
  const c = cambios.get(String(r.id));
  const v = c && k in c ? c[k] : valor ?? '';
  return `<input type="number" step="${paso}" data-id="${r.id}" data-k="${k}" value="${esc(v)}" placeholder="${esc(placeholder)}" title="${esc(titulo)}" class="${c && k in c ? 'dirty' : ''}" style="width:${ancho}px;text-align:right">`;
};

// ═════════════ Pestaña Costos ═════════════
function tabCostos(el) {
  const cambios = new Map();
  const cab = VG.h('<div></div>'); const tabla = VG.h('<div></div>');
  el.appendChild(cab); el.appendChild(tabla);
  editable(tabla, cambios);
  let ctxT;
  const pintarCab = () => {
    const d = C.data.dolar; const cfg = C.data.config;
    const bajo = C.data.productos.filter((p) => p.bajo_piso && p.tipo === 'unidad').length;
    cab.innerHTML = `<div class="card" style="margin-bottom:12px;display:flex;gap:14px;flex-wrap:wrap;align-items:center">
      <div><b>Dólar de hoy:</b> ${d ? `${money(d.valor)} <span class="muted small">(${esc(d.fuente)}, ${VG.date(d.fecha)})</span>` : '<span class="muted">sin cargar</span>'}
        <button class="btn small" data-dolar>Cambiar</button></div>
      <div style="display:flex;gap:6px;align-items:center"><b>Costos internos general (%)</b><input type="number" step="0.01" data-ci value="${cfg.costos_internos_general}" style="width:80px"><button class="btn small" data-ci-todos title="Pone este porcentaje a todos los productos (los que tenían uno propio pasan a usar el general)">Aplicar a todos</button></div>
      <div style="margin-left:auto">${bajo ? `<span class="badge warn" title="Precio de venta menor que costo × ${1 + cfg.piso_margen / 100}">${bajo} productos bajo el piso de margen (${cfg.piso_margen} %)</span>` : badge('Ningún producto bajo el piso de margen', 'ok')} <button class="btn small" data-piso>Piso</button></div>
    </div>`;
    cab.querySelector('[data-dolar]').onclick = modalDolar;
    cab.querySelector('[data-ci-todos]').onclick = async () => { await VG.post('/api/catalogo/costos', { costos_internos_general: cab.querySelector('[data-ci]').value, aplicar_a_todos: true }); VG.toast('Costos internos aplicados a todos'); refrescar(); };
    cab.querySelector('[data-ci]').onchange = async (e) => { await VG.post('/api/catalogo/costos', { costos_internos_general: e.target.value }); VG.toast('Costos internos general guardado'); refrescar(); };
    cab.querySelector('[data-piso]').onclick = async () => { const v = prompt('Piso de margen: markup mínimo sobre el costo final (%)', cfg.piso_margen); if (v === null) return; await VG.post('/api/catalogo/config', { piso_margen: v }); refrescar(); };
  };
  const modalDolar = () => {
    const d = C.data.dolar;
    const body = VG.h(`<div class="form grid" style="grid-template-columns:1fr"><p class="muted small" style="margin:0">Vixan toma solo el dólar oficial (Banco Nación, venta) y lo actualiza varias veces por día. Si cargás uno a mano, queda fijo hasta que vuelvas a automático.</p>
      <label>Valor del dólar ($)<input type="number" step="0.01" data-v value="${d?.valor || ''}"></label></div>`);
    const m = VG.modal({ title: 'Dólar del día', body, saveLabel: 'Usar este valor', onSave: async () => { await VG.post('/api/catalogo/dolar', { valor: body.querySelector('[data-v]').value }); VG.toast('Dólar guardado'); refrescar(); } });
    const auto = VG.h('<button class="btn">Volver a automático</button>');
    auto.onclick = async () => { try { await VG.post('/api/catalogo/dolar', { automatico: true }); m.close(); VG.toast('Dólar oficial actualizado'); refrescar(); } catch (e) { VG.toast(e.message, true); } };
    m.el.querySelector('.modal-f').prepend(auto);
  };
  const refrescar = async () => { await cargar(); pintarCab(); ctxT?.reload(); };
  ctxT = VG.crud(tabla, {
    entity: 'productos', title: 'Costos', canCreate: false, canDelete: false, canEdit: false,
    load: async () => { const p = await productos(); pintarCab(); return p.filter((x) => x.tipo === 'unidad'); },
    sort: (a, b) => String(a.sku).localeCompare(String(b.sku), 'es', { numeric: true }),
    filters: filtros, chips: { options: [['bajo', 'Bajo el piso de margen'], ['sincosto', 'Sin costo'], ['usd', 'En dólares']], match: (r, v) => (v === 'bajo' ? r.bajo_piso : v === 'sincosto' ? !r.costo_final : !!r.costo_usd) },
    columns: [
      { k: 'sku', label: 'SKU', fmt: (v) => `<code class="k">${esc(v)}</code>` }, { k: 'nombre', label: 'Producto' },
      { k: 'costo_usd', label: 'Costo USD', num: true, render: (r) => celda(r, 'costo_usd', r.costo_usd, cambios, { ancho: 80, placeholder: 'US$', titulo: 'Costo en dólares: el costo en pesos sale de multiplicarlo por el dólar del día' }) },
      { k: 'costo', label: 'Costo proveedor', num: true, render: (r) => r.costo_usd && !(cambios.get(String(r.id))?.costo_usd === '') ? `<span title="US$ ${VG.n(r.costo_usd)} × ${money(C.data.dolar?.valor)}">${money(r.costo_base)}</span> <button class="btn small" data-pesos="${r.id}" title="Quita el costo en dólares: el costo en pesos queda como está">Pasar a pesos</button>` : celda(r, 'costo', r.costo, cambios, { ancho: 100 }) },
      { k: 'costos_internos', label: 'Costos internos (%)', num: true, render: (r) => celda(r, 'costos_internos', r.costos_internos, cambios, { ancho: 70, placeholder: String(C.data.config.costos_internos_general), titulo: 'Vacío = usa el general' }) },
      { k: 'costo_final', label: 'Costo final', num: true, fmt: money },
      { k: 'marca', label: 'Marca' },
    ],
    toolbar: () => [{ label: `Guardar cambios${cambios.size ? ` (${cambios.size})` : ''}`, primary: true, disabled: !cambios.size, onClick: async () => {
      const lista = [...cambios].map(([id, c]) => ({ id, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v === '' ? null : Number(v)])) }));
      await VG.post('/api/catalogo/costos', { cambios: lista }); cambios.clear(); VG.toast('Costos guardados'); refrescar();
    } }, { label: 'Descartar', disabled: !cambios.size, onClick: () => { cambios.clear(); ctxT.reload(); } }],
  });
  tabla.addEventListener('cambios', () => ctxT?.refreshToolbar?.());
  tabla.addEventListener('click', async (e) => { const b = e.target.closest('[data-pesos]'); if (!b) return; await VG.post('/api/catalogo/costos', { cambios: [{ id: b.dataset.pesos, pasar_a_pesos: true }] }); VG.toast('Pasado a pesos'); refrescar(); });
}

// ═════════════ Pestaña Listas de precios ═════════════
function tabListas(el) {
  let listaId = 'general';
  const cambios = new Map();
  const cab = VG.h('<div></div>'); const tabla = VG.h('<div></div>');
  el.appendChild(cab); el.appendChild(tabla);
  let ctxT;
  const lista = () => C.data.listas.find((l) => String(l.id) === String(listaId)) || null;
  const editableLista = () => listaId === 'general' || lista()?.modo === 'propio';
  // Al escribir el markup se ve el precio que daría; al escribir el precio se borra el markup (queda fijo)
  editable(tabla, cambios, (i, c) => {
    if (listaId !== 'general') return;
    const fila = C.data.productos.find((p) => String(p.id) === i.dataset.id);
    const tr = i.closest('tr');
    if (i.dataset.k === 'markup') {
      const pr = tr.querySelector('[data-k=precio]');
      if (pr) pr.value = i.value === '' ? '' : Math.round(fila.costo_final * (1 + Number(i.value) / 100) * 100) / 100;
      delete c.precio;
    } else if (i.dataset.k === 'precio') { const mk = tr.querySelector('[data-k=markup]'); if (mk) mk.value = ''; c.markup = ''; }
  });
  const pintarCab = () => {
    const l = lista();
    const opciones = [['general', 'Precio general (el de la ficha)'], ...C.data.listas.map((x) => [x.id, `${x.nombre} · ${x.modo === 'propio' ? 'precio propio' : 'calculada'}`])];
    const explica = listaId === 'general'
      ? 'Lista del sistema: cada producto tiene un precio fijo o un markup sobre el costo final. Si escribís el markup, el precio sigue al costo.'
      : l.modo === 'propio' ? 'Precio propio por producto: lo escribís vos. El costo aparece al lado para ver el margen. Los productos sin precio en esta lista no se pueden vender con ella.'
        : `Se calcula sola desde ${l.base === 'costo' ? 'el costo final' : listaNombre(l.base)} ${n(l.porcentaje) >= 0 ? '+' : ''}${VG.n(l.porcentaje)} %${l.redondeo && l.redondeo !== 'ninguno' ? ', ' + C.data.redondeos[l.redondeo].toLowerCase() : ''}. Para cambiarla, tocá Administrar listas.`;
    cab.innerHTML = `<div class="card" style="margin-bottom:12px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><b>Lista de precios</b><select data-l>${opciones.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(listaId) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <button class="btn small" data-admin>Administrar listas</button>
        ${listaId === 'general' ? `<span style="margin-left:auto;display:flex;gap:6px;align-items:center"><b>Markup general (%)</b><input type="number" step="0.01" data-mg style="width:80px"><button class="btn small" data-mg-todos>Aplicar a todos</button></span>` : ''}</div>
      <p class="muted small" style="margin:8px 0 0">${esc(explica)}</p></div>`;
    cab.querySelector('[data-l]').onchange = (e) => { if (cambios.size && !VG.confirm('Tenés cambios sin guardar. ¿Descartarlos?')) { e.target.value = listaId; return; } cambios.clear(); listaId = e.target.value; armar(); };
    cab.querySelector('[data-admin]').onclick = () => { location.hash = '#listas-precio'; };
    const mt = cab.querySelector('[data-mg-todos]');
    if (mt) mt.onclick = async () => { const v = cab.querySelector('[data-mg]').value; if (v === '') return VG.toast('Escribí el markup general', true); if (!VG.confirm(`Todos los productos pasan a tener markup ${v} % y su precio sigue al costo. ¿Seguimos?`)) return; await VG.post('/api/catalogo/precios', { lista: 'general', markup_general: v }); VG.toast('Markup aplicado'); await cargar(); armar(); };
  };
  const margenTxt = (precio, costo) => (precio && costo ? `<div class="small muted" title="Margen sobre el precio de venta: (precio − costo final) / precio">equivale a ${VG.n(Math.round((precio / costo - 1) * 1000) / 10)} % · margen ${VG.n(Math.round(((precio - costo) / precio) * 1000) / 10)} %</div>` : !costo ? '<div class="small muted">Margen: sin costo</div>' : '<div class="small muted">Margen: sin precio</div>');
  const armar = () => {
    pintarCab();
    tabla.innerHTML = '';
    const general = listaId === 'general';
    const columnas = [
      { k: 'sku', label: 'SKU', fmt: (v) => `<code class="k">${esc(v)}</code>` }, { k: 'nombre', label: 'Producto' }, { k: 'marca', label: 'Marca' },
      { k: 'regla', label: 'Regla', get: (r) => (general ? (r.tipo === 'presentacion' && n(r.markup) == null ? 'Proporcional + recargo' : n(r.markup) != null ? 'Markup' : 'Precio fijo') : lista().modo === 'propio' ? 'Precio propio' : 'Calculada') },
      { k: 'costo_final', label: 'Costo final', num: true, fmt: money },
    ];
    if (general) columnas.push({ k: 'markup', label: 'Markup (%)', num: true, render: (r) => celda(r, 'markup', r.markup, cambios, { ancho: 75, titulo: 'Porcentaje: 189 se escribe 189, no 1,89. Si escribís el markup, el precio sigue al costo.' }) });
    columnas.push({ k: 'precio_lista', label: 'Precio venta', num: true, get: (r) => (general ? r.precio_general : r.precios_lista[listaId]), render: (r) => {
      const v = general ? (n(r.markup) != null ? r.precio_general : r.precio) : r.precios_lista[listaId];
      const campo = editableLista() ? celda(r, 'precio', v, cambios, { ancho: 110 }) : (v == null ? '<span class="muted">sin precio</span>' : `<b>${money(v)}</b>`);
      return campo + margenTxt(general ? r.precio_general : r.precios_lista[listaId], r.costo_final);
    } });
    ctxT = VG.crud(tabla, {
      entity: 'productos', title: `Lista ${listaNombre(listaId)}`, canCreate: false, canDelete: false, canEdit: false,
      load: async () => C.data.productos,
      sort: (a, b) => String(a.sku).localeCompare(String(b.sku), 'es', { numeric: true }),
      filters: [...filtros, filtroMostrar],
      chips: { options: [['sinprecio', 'Sin precio'], ['bajo', 'Bajo el piso de margen']], match: (r, v) => (v === 'sinprecio' ? (general ? r.precio_general : r.precios_lista[listaId]) == null : r.bajo_piso) },
      columns: columnas,
      toolbar: () => (editableLista() ? [{ label: `Guardar cambios${cambios.size ? ` (${cambios.size})` : ''}`, primary: true, disabled: !cambios.size, onClick: async () => {
        const lista = [...cambios].map(([id, c]) => { const o = { id }; if ('markup' in c && c.markup !== '') o.markup = Number(c.markup); else if ('precio' in c) { o.precio = c.precio === '' ? null : Number(c.precio); } else if ('markup' in c) o.markup = null; return o; });
        await VG.post('/api/catalogo/precios', { lista: listaId, cambios: lista }); cambios.clear(); VG.toast('Precios guardados'); await cargar(); armar();
      } }, { label: 'Descartar', disabled: !cambios.size, onClick: () => { cambios.clear(); ctxT.reload(); } }] : []),
    });
  };
  tabla.addEventListener('cambios', () => ctxT?.refreshToolbar?.());
  cargar().then(armar).catch((e) => { el.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; });
}

// ═════════════ Combos y Cajas ═════════════
function tabArmados(el, tipo) {
  const nombre = tipo === 'combo' ? 'combo' : 'caja';
  el.appendChild(VG.h(`<div class="note">${tipo === 'combo'
    ? 'Un combo es un producto que se arma con otros (por ejemplo un pack x5 o un kit). No tiene stock propio: se puede vender mientras haya de todos sus componentes, y al despacharlo se descuentan los componentes.'
    : 'Una caja es un bulto cerrado de varias unidades (por ejemplo, caja x12 para mayoristas). Igual que un combo, su stock sale de las unidades sueltas y al despacharla se descuentan.'}
    “Revisar” avisa cuando el costo guardado no coincide con la suma de los componentes: “Guardar y reparar” lo corrige.</div>`));
  const box = VG.h('<div></div>'); el.appendChild(box);
  VG.crud(box, {
    entity: 'productos', title: tipo === 'combo' ? 'Combos' : 'Cajas', canCreate: false, canEdit: false,
    load: async () => (await productos()).filter((p) => p.tipo === tipo),
    sort: (a, b) => String(a.sku).localeCompare(String(b.sku), 'es', { numeric: true }),
    chips: { options: [['revisar', 'Sólo los que hay que revisar']], match: (r) => r.revisar },
    columns: [
      { k: 'sku', label: 'SKU', fmt: (v) => `<code class="k">${esc(v)}</code>` }, { k: 'nombre', label: 'Descripción' },
      { k: 'n', label: 'Componentes', num: true, get: (r) => (r.componentes || []).length },
      { k: 'costo_guardado', label: 'Costo', num: true, fmt: money },
      { k: 'suma_componentes', label: 'Suma de componentes', num: true, fmt: (v, r) => `${money(v)}${r.revisar && (r.componentes || []).length ? `<div class="small muted">dif. ${money(Math.abs(v - r.costo_guardado))}</div>` : ''}` },
      { k: 'revisar', label: 'Revisar', fmt: (v, r) => (!(r.componentes || []).length ? badge('Sin componentes', 'err') : v ? badge('No coincide', 'warn') : badge('OK', 'ok')) },
      { k: 'precio_general', label: 'Precio', num: true, fmt: (v) => (v == null ? '—' : money(v)) },
      { k: 'stock', label: 'Se pueden vender', num: true, fmt: (v) => (v <= 0 ? badge(VG.n(v), 'err') : VG.n(v)) },
    ],
    rowActions: (r, ctx) => [{ label: 'Detalles', onClick: () => detalleArmado(r, ctx) }],
    toolbar: (ctx) => [{ label: `+ Nuev${tipo === 'combo' ? 'o combo' : 'a caja'}`, primary: true, onClick: () => editorArmado(tipo, null, ctx) }],
    empty: `No hay ${nombre}s todavía.`,
  });
}
function detalleArmado(p, ctx) {
  const dif = p.suma_componentes - p.costo_guardado;
  const body = VG.h(`<div>
    <div style="display:flex;gap:24px;margin-bottom:10px"><div><div class="muted small">SKU</div><code class="k">${esc(p.sku)}</code></div><div><div class="muted small">Costo del ${p.tipo}</div><b>${money(p.costo_guardado)}</b></div><div><div class="muted small">Precio</div><b>${p.precio_general == null ? '—' : money(p.precio_general)}</b></div><div><div class="muted small">Se pueden vender</div><b>${VG.n(p.stock)}</b></div></div>
    ${tablaComponentes(p)}
    ${p.revisar && (p.componentes || []).length ? `<div class="note warn" style="margin-top:10px">El costo guardado es ${money(p.costo_guardado)} y la suma de los componentes da ${money(p.suma_componentes)}: el guardado está ${money(Math.abs(dif))} ${dif > 0 ? 'por debajo' : 'por encima'}. “Guardar y reparar” (en Editar) le pone la suma como costo y recalcula su precio si sigue al markup.</div>` : ''}
  </div>`);
  const m = VG.modal({ title: `${p.tipo === 'combo' ? 'Combo' : 'Caja'}: ${p.nombre}`, body, wide: true, footer: false });
  const pie = VG.h('<div class="modal-f"></div>');
  const btn = (label, fn, tone = '') => { const b = VG.h(`<button class="btn ${tone}">${esc(label)}</button>`); b.onclick = fn; pie.appendChild(b); };
  btn('Eliminar', async () => { if (!VG.confirm(`¿Eliminar ${p.sku}? Los componentes no se tocan.`)) return; await VG.del(`/api/r/productos/${p.id}`); m.close(); VG.toast('Eliminado'); ctx.reload(); }, 'danger');
  btn(`Convertir a ${p.tipo === 'combo' ? 'caja' : 'combo'}`, async () => { await VG.post(`/api/catalogo/armado/${p.id}/convertir`); m.close(); VG.toast('Convertido'); ctx.reload(); });
  btn('Editar', () => { m.close(); editorArmado(p.tipo, p, ctx); });
  btn('Cerrar', () => m.close(), 'primary');
  m.el.querySelector('.modal').appendChild(pie);
}
function editorArmado(tipo, p, ctx) {
  const comps = (p?.componentes || []).map((c) => ({ ...c }));
  const body = VG.h(`<div>
    <div class="form grid" style="grid-template-columns:2fr 1fr"><label>Nombre del ${tipo === 'combo' ? 'combo' : 'caja'}<input data-nombre value="${esc(p?.nombre || '')}"></label><label>SKU<input data-sku value="${esc(p?.sku || '')}"></label></div>
    <h3>Añadir componente</h3><div class="toolbar" data-add></div>
    <h3>Componentes</h3><div data-comps></div>
    <h3>Precio</h3>
    <div class="form grid" style="grid-template-columns:1fr 1fr 1fr"><label>Costo total (suma)<input data-costo disabled></label><label>Markup (%)<input type="number" step="0.01" data-mk value="${esc(p?.markup ?? '')}" placeholder="vacío = precio fijo"></label><label>Precio general<input data-precio disabled></label></div>
    <p class="muted small" data-listas></p>
  </div>`);
  const $ = (s) => body.querySelector(s);
  const sel = selectorProducto('Buscar producto por SKU o nombre…', (x) => String(x.sku) !== String(p?.sku));
  const cant = VG.h('<input type="number" value="1" min="1" style="width:80px" title="Cantidad">');
  const add = VG.h('<button class="btn">Añadir</button>');
  $('[data-add]').append(sel, cant, add);
  const costoDe = (sku) => C.bySku.get(String(sku))?.costo_final || 0;
  const pintar = () => {
    $('[data-comps]').innerHTML = comps.length ? `<table class="t"><thead><tr><th>SKU</th><th>Producto</th><th class="num">Cantidad</th><th class="num">Costo unit.</th><th class="num">Subtotal</th><th></th></tr></thead><tbody>${comps.map((c, i) => `<tr><td><code class="k">${esc(c.sku)}</code></td><td>${esc(C.bySku.get(String(c.sku))?.nombre || '(no está en el catálogo)')}</td><td class="num"><input type="number" min="1" data-q="${i}" value="${c.cantidad}" style="width:70px;text-align:right"></td><td class="num">${money(costoDe(c.sku))}</td><td class="num">${money(costoDe(c.sku) * c.cantidad)}</td><td><button class="btn small danger" data-x="${i}">✕</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Todavía no agregaste componentes.</p>';
    const suma = comps.reduce((a, c) => a + costoDe(c.sku) * c.cantidad, 0);
    $('[data-costo]').value = money(suma);
    const mk = n($('[data-mk]').value);
    $('[data-precio]').value = mk == null ? (p?.precio != null ? money(p.precio) + ' (fijo)' : 'sin precio') : money(suma * (1 + mk / 100));
    $('[data-listas]').textContent = C.data.listas.length ? 'Las listas calculadas toman el precio o el costo de este producto como de cualquier otro.' : '';
    body.querySelectorAll('[data-q]').forEach((i) => i.oninput = () => { comps[i.dataset.q].cantidad = Math.max(1, Number(i.value) || 1); pintarCostos(); });
    body.querySelectorAll('[data-x]').forEach((b) => b.onclick = () => { comps.splice(Number(b.dataset.x), 1); pintar(); });
  };
  const pintarCostos = () => { const suma = comps.reduce((a, c) => a + costoDe(c.sku) * c.cantidad, 0); $('[data-costo]').value = money(suma); const mk = n($('[data-mk]').value); $('[data-precio]').value = mk == null ? (p?.precio != null ? money(p.precio) + ' (fijo)' : 'sin precio') : money(suma * (1 + mk / 100)); };
  $('[data-mk]').oninput = pintarCostos;
  add.onclick = () => {
    const q = sel.valor();
    if (!q) return VG.toast('Elegí un producto de la lista', true);
    const ya = comps.find((c) => String(c.sku) === String(q.sku));
    if (ya) ya.cantidad += Math.max(1, Number(cant.value) || 1); else comps.push({ sku: q.sku, cantidad: Math.max(1, Number(cant.value) || 1) });
    sel.input.value = ''; cant.value = 1; pintar();
  };
  pintar();
  const guardar = async (reparar) => {
    const datos = { id: p?.id, tipo, nombre: $('[data-nombre]').value, sku: $('[data-sku]').value, componentes: comps, markup: $('[data-mk]').value === '' ? null : Number($('[data-mk]').value) };
    if (reparar || !p) datos.reparar = true; else datos.costo = p.costo_guardado;
    await VG.post('/api/catalogo/armado', datos);
    VG.toast(p ? 'Guardado' : `${tipo === 'combo' ? 'Combo creado' : 'Caja creada'}`); ctx?.reload();
  };
  const m = VG.modal({ title: p ? `Editar ${p.sku}` : tipo === 'combo' ? 'Crear nuevo combo' : 'Crear nueva caja', body, wide: true, saveLabel: p ? 'Guardar' : tipo === 'combo' ? 'Crear combo' : 'Crear caja', onSave: () => guardar(false) });
  if (p) {
    const rep = VG.h('<button class="btn" title="Le pone al costo la suma de los componentes">Guardar y reparar</button>');
    rep.onclick = async () => { try { await guardar(true); m.close(); } catch (e) { VG.toast(e.message, true); } };
    m.el.querySelector('.modal-f').prepend(rep);
  }
}

// ═════════════ Fraccionados ═════════════
function tabFraccionados(el) {
  el.appendChild(VG.h('<div class="note">Un fraccionado es un producto que se compra entero (la bolsa, el rollo, el frasco) y se vende también en partes. Cada presentación es un producto con su SKU: se puede publicar en la tienda, y al venderla se descuenta su parte del producto entero. El recargo va sobre el precio proporcional.</div>'));
  const box = VG.h('<div></div>'); el.appendChild(box);
  VG.crud(box, {
    entity: 'productos', title: 'Fraccionados', canCreate: false, canEdit: false, canDelete: false,
    load: async () => (await productos()).filter((p) => p.fraccion),
    sort: (a, b) => String(a.sku).localeCompare(String(b.sku), 'es', { numeric: true }),
    columns: [
      { k: 'sku', label: 'SKU', fmt: (v) => `<code class="k">${esc(v)}</code>` }, { k: 'nombre', label: 'Descripción' },
      { k: 'trae', label: 'Trae', get: (r) => `${VG.n(r.fraccion.trae)} ${r.fraccion.unidad} en partes de ${VG.n(r.fraccion.parte)} ${r.fraccion.unidad}` },
      { k: 'pres', label: 'Presentaciones', get: (r) => `${r.presentaciones.length} (${r.presentaciones.map((x) => VG.n(x.partes * r.fraccion.parte)).join(', ')} ${r.fraccion.unidad})` },
      { k: 'stock', label: 'Stock', num: true, fmt: (v) => (v > 0 ? VG.n(v) : badge('sin stock', 'err')) },
    ],
    rowActions: (r, ctx) => [{ label: 'Detalles', onClick: () => detalleFraccionado(r, ctx) }],
    toolbar: (ctx) => [{ label: '+ Nuevo fraccionado', primary: true, onClick: () => editorFraccionado(null, ctx) }],
    empty: 'Todavía no hay productos fraccionados.',
  });
}
function detalleFraccionado(p, ctx) {
  const f = p.fraccion;
  const filas = [{ presentacion: `Entera · ${VG.n(f.trae)} ${f.unidad}`, sku: p.sku, partes: f.partes_por_unidad, recargo: null, precio: p.precio_general, se_pueden_vender: p.stock }, ...p.presentaciones];
  const body = VG.h(`<div><p><b>${esc(p.nombre)}</b><br><span class="muted">${esc(p.sku)} · trae ${VG.n(f.trae)} ${esc(f.unidad)} · se vende en partes de ${VG.n(f.parte)} ${esc(f.unidad)} (${f.partes_por_unidad} por unidad) · stock: ${p.stock > 0 ? VG.n(p.stock) : 'sin stock'}</span></p>
    ${p.precio_general == null ? '<div class="note warn">El producto entero no tiene precio cargado. Cuando lo tenga, acá vas a ver el precio proporcional más el recargo de cada presentación.</div>' : ''}
    <table class="t"><thead><tr><th>Presentación</th><th>SKU</th><th class="num">Partes</th><th class="num">Recargo</th><th class="num">Precio</th><th class="num">Se pueden vender</th></tr></thead><tbody>
    ${filas.map((x) => `<tr><td>${esc(x.presentacion || x.nombre)}</td><td><code class="k">${esc(x.sku)}</code></td><td class="num">${x.partes}</td><td class="num">${x.recargo == null ? '—' : '+' + VG.n(x.recargo) + ' %'}</td><td class="num">${x.precio == null ? '—' : money(x.precio)}</td><td class="num">${VG.n(x.se_pueden_vender)}</td></tr>`).join('')}</tbody></table></div>`);
  const m = VG.modal({ title: `Fraccionado: ${p.sku}`, body, wide: true, footer: false });
  const pie = VG.h('<div class="modal-f"></div>');
  const btn = (label, fn, tone = '') => { const b = VG.h(`<button class="btn ${tone}">${esc(label)}</button>`); b.onclick = fn; pie.appendChild(b); };
  btn('Dejar de fraccionar', async () => { if (!VG.confirm('Las presentaciones vuelven a ser productos sueltos (sin stock propio). ¿Seguimos?')) return; await VG.del(`/api/catalogo/fraccionado/${p.id}`); m.close(); VG.toast('Listo'); ctx.reload(); }, 'danger');
  btn('Agregar o cambiar presentaciones', () => { m.close(); editorFraccionado(p, ctx); });
  btn('Cerrar', () => m.close(), 'primary');
  m.el.querySelector('.modal').appendChild(pie);
}
function editorFraccionado(p, ctx) {
  const f = p?.fraccion || { unidad: 'g', trae: '', parte: '' };
  const pres = (p?.presentaciones || []).map((x) => ({ sku: x.sku, partes: x.partes, recargo: x.recargo }));
  const body = VG.h(`<div>
    <div class="form grid" style="grid-template-columns:2fr 1fr 1fr 1fr">
      <label>Producto entero (la bolsa, el rollo, el frasco)<span data-base style="display:flex"></span></label>
      <label>Unidad<select data-u>${UNIDADES.map((u) => `<option ${u === f.unidad ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
      <label>Cuánto trae la unidad entera<input type="number" step="any" data-trae value="${esc(f.trae)}"></label>
      <label>Porción más chica que se vende<input type="number" step="any" data-parte value="${esc(f.parte)}"></label>
    </div>
    <h3 style="display:flex;align-items:center;gap:8px">Presentaciones <button class="btn small" data-mas>+ Agregar presentación</button><button class="btn small" data-sug>Sugerir las habituales</button></h3>
    <div data-pres></div>
    <p class="muted small">El recargo va sobre el precio proporcional: la mitad de la bolsa sale la mitad del precio más el recargo. Vacío usa el habitual (mitad +10 %, un quinto +15 %, un décimo +30 %, un veinteavo +50 %).<br>Si la presentación ya existe en tu catálogo, poné su SKU: conserva su ficha y su vínculo con la tienda, y el stock que tenga pasa al producto entero.</p>
  </div>`);
  const $ = (s) => body.querySelector(s);
  const sel = selectorProducto('Buscá por SKU o nombre', (x) => x.tipo === 'unidad');
  if (p) { sel.input.value = p.sku; sel.input.disabled = true; }
  $('[data-base]').appendChild(sel);
  const total = () => { const t = Number($('[data-trae]').value), pa = Number($('[data-parte]').value); return t > 0 && pa > 0 ? t / pa : 0; };
  const pintar = () => {
    const u = $('[data-u]').value, pa = Number($('[data-parte]').value) || 0, base = sel.valor();
    $('[data-pres]').innerHTML = pres.length ? `<table class="t"><thead><tr><th>SKU de la presentación</th><th class="num">Partes</th><th>Equivale a</th><th class="num">Recargo (%)</th><th class="num">Precio</th><th></th></tr></thead><tbody>${pres.map((x, i) => {
      const tot = total(); const prop = base?.precio_general && tot ? base.precio_general * x.partes / tot : null;
      const rec = x.recargo === '' || x.recargo == null ? (x.partes / tot >= 0.5 ? 10 : x.partes / tot >= 0.2 ? 15 : x.partes / tot >= 0.1 ? 30 : 50) : Number(x.recargo);
      return `<tr><td><input data-i="${i}" data-c="sku" value="${esc(x.sku)}" placeholder="${esc((base?.sku || 'SKU') + '-' + (x.partes * pa || ''))}"></td><td class="num"><input type="number" min="1" data-i="${i}" data-c="partes" value="${x.partes}" style="width:70px;text-align:right"></td><td>${pa ? VG.n(x.partes * pa) + ' ' + esc(u) : '—'}</td><td class="num"><input type="number" step="0.01" data-i="${i}" data-c="recargo" value="${x.recargo ?? ''}" placeholder="${rec}" style="width:70px;text-align:right"></td><td class="num">${prop ? money(prop * (1 + rec / 100)) : '—'}</td><td><button class="btn small danger" data-x="${i}">✕</button></td></tr>`;
    }).join('')}</tbody></table>` : '<p class="muted">Todavía no agregaste ninguna.</p>';
    body.querySelectorAll('[data-i]').forEach((i) => i.onchange = () => { const x = pres[i.dataset.i]; x[i.dataset.c] = i.dataset.c === 'sku' ? i.value.trim() : i.value === '' ? '' : Number(i.value); pintar(); });
    body.querySelectorAll('[data-x]').forEach((b) => b.onclick = () => { pres.splice(Number(b.dataset.x), 1); pintar(); });
  };
  $('[data-mas]').onclick = () => { pres.push({ sku: '', partes: 1, recargo: '' }); pintar(); };
  $('[data-sug]').onclick = () => {
    const tot = total(); const base = sel.valor();
    if (!tot || !base) return VG.toast('Elegí el producto y completá cuánto trae y la porción más chica', true);
    const pa = Number($('[data-parte]').value), u = $('[data-u]').value;
    for (const fr of [2, 5, 10, 20]) { const partes = tot / fr; if (Number.isInteger(partes) && partes >= 1 && partes < tot && !pres.some((x) => x.partes === partes)) pres.push({ sku: `${base.sku}-${+(partes * pa).toFixed(4)}${u.toUpperCase()}`, partes, recargo: '' }); }
    if (!pres.some((x) => x.partes === 1) && tot > 1) pres.push({ sku: `${base.sku}-${+pa.toFixed(4)}${u.toUpperCase()}`, partes: 1, recargo: '' });
    pres.sort((a, b) => b.partes - a.partes); pintar();
  };
  ['[data-trae]', '[data-parte]', '[data-u]'].forEach((s) => $(s).addEventListener('input', pintar));
  sel.input.addEventListener('change', pintar);
  pintar();
  VG.modal({ title: p ? `Presentaciones de ${p.sku}` : 'Nuevo fraccionado', body, wide: true, saveLabel: 'Guardar', onSave: async () => {
    const base = sel.valor();
    if (!base) throw new Error('Elegí el producto entero de la lista');
    const r = await VG.post('/api/catalogo/fraccionado', { base_id: base.id, unidad: $('[data-u]').value, trae: $('[data-trae]').value, parte: $('[data-parte]').value, presentaciones: pres.map((x) => ({ sku: x.sku, partes: x.partes, recargo: x.recargo === '' ? null : x.recargo })) });
    VG.toast(`Listo: ${r.creadas} presentaciones nuevas, ${r.actualizadas} actualizadas${r.stockPasado.length ? `; pasó al producto entero el stock de ${r.stockPasado.map((s) => s.sku).join(', ')}` : ''}`);
    ctx?.reload();
  } });
}

// ═════════════ Administrar listas (módulo Listas de precios) ═════════════
const formLista = (row) => [
  { k: 'nombre', label: 'Nombre', required: true, placeholder: 'Ej: Mayorista' },
  { k: 'modo', label: 'Cómo se arma', type: 'select', options: [['propio', 'Precio propio por producto (lo edito yo)'], ['calculada', 'Se calcula sola desde otra lista o desde el costo']], default: 'calculada' },
  { k: 'base', label: 'Calculada desde', type: 'select', options: () => [['costo', 'Costo final'], ['general', 'Precio general'], ...(C.data?.listas || []).filter((l) => String(l.id) !== String(row?.id)).map((l) => [String(l.id), l.nombre])], default: 'costo' },
  { k: 'porcentaje', label: 'Porcentaje (+ recargo, − descuento)', type: 'number', step: '0.01', placeholder: 'Ej: 45 o -10' },
  { k: 'redondeo', label: 'Redondeo', type: 'select', options: () => Object.entries(C.data?.redondeos || { ninguno: 'Sin redondear' }), default: 'ninguno' },
  { k: 'uso', label: 'Se usa en', placeholder: 'Ej: Venta directa, Mayoristas' },
  { k: 'archivada', label: 'Archivada (no aparece para elegir)', type: 'checkbox' },
];
function tabAdministrarListas(el) {
  el.appendChild(VG.h('<div class="note">Acá se crean las listas y se les cambia el nombre. Hay dos clases: <b>precio propio</b>, donde escribís el precio de cada producto (en Catálogo y precios → Listas de precios, con el costo al lado para ver el margen), o <b>calculada</b>, que sale sola del costo final, del precio general o de otra lista, más un porcentaje. El “precio general” es el de la ficha de cada producto.</div>'));
  const box = VG.h('<div></div>'); el.appendChild(box);
  cargar().then(() => VG.crud(box, {
    entity: 'listas_precio', singular: 'lista', newLabel: '+ Nueva lista', title: 'Listas de precios',
    load: async () => { const d = await cargar(); const todas = await VG.get('/api/r/listas_precio'); return todas.map((l) => ({ ...l, ...(d.listas.find((x) => x.id === l.id) || {}), con_precio: d.productos.filter((p) => p.precios_lista[l.id] != null).length })); },
    columns: [
      { k: 'nombre', label: 'Lista', fmt: (v) => `<b>${esc(v)}</b>` },
      { k: 'modo', label: 'Tipo', get: (r) => (r.modo === 'propio' ? 'Precio propio' : `Calculada: ${r.base === 'costo' ? 'costo final' : listaNombre(r.base)} ${n(r.porcentaje) >= 0 ? '+' : ''}${VG.n(r.porcentaje || 0)} %`) },
      { k: 'redondeo', label: 'Redondeo', get: (r) => C.data.redondeos[r.redondeo || 'ninguno'] || 'Sin redondear' },
      { k: 'con_precio', label: 'Con precio', num: true, fmt: (v) => `${VG.n(v)} / ${VG.n(C.data.productos.length)}` },
      { k: 'uso', label: 'Se usa en' },
      { k: 'archivada', label: 'Estado', fmt: (v) => (v ? badge('Archivada') : badge('Activa', 'ok')) },
    ],
    form: formLista,
    beforeSave: (d) => { if (d.modo === 'propio') { d.base = null; d.porcentaje = null; } d.porcentaje = d.porcentaje == null ? null : Number(d.porcentaje); return d; },
    toolbar: () => [{ label: 'Cargar precios →', onClick: () => { location.hash = '#catalogo'; } }],
  }));
}

VG.catalogoTabs = [
  { label: 'Catálogo', render: tabCatalogo },
  { label: 'Costos', render: tabCostos },
  { label: 'Listas de precios', render: tabListas },
  { label: 'Combos', render: (el) => tabArmados(el, 'combo') },
  { label: 'Fraccionados', render: tabFraccionados },
  { label: 'Cajas', render: (el) => tabArmados(el, 'caja') },
];
VG.listasTabs = [{ label: 'Listas', render: tabAdministrarListas }];
})();
