// Plantilla de Vixan Tienda. Páginas generadas en el servidor (mejor para SEO) con template literals, sin dependencias.

// Versión de los archivos de estilo y comportamiento: cambia cuando cambia su contenido,
// así el navegador y Cloudflare no siguen usando una copia vieja después de publicar.
const VERSION_RECURSOS = (() => {
  const h = require('crypto').createHash('sha1');
  for (const f of ['tienda.css', 'tienda.js']) { try { h.update(require('fs').readFileSync(require('path').join(__dirname, '..', 'public', f))); } catch { /* sin archivo */ } }
  return h.digest('hex').slice(0, 10);
})();

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pesos = (n) => '$' + Math.round(n).toLocaleString('es-AR');
const img = (p) => p.imagenes?.[0] || `/ph/${encodeURIComponent(p.nombre)}.svg`;
const imgSub = (s) => s.imagen || `/ph/${encodeURIComponent(s.nombre)}.svg`;

const ICON = {
  menu: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  buscar: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  usuario: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  corazon: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9-9a4.8 4.8 0 0 1 9-3 4.8 4.8 0 0 1 9 3c-2 4.6-9 9-9 9Z"/></svg>',
  carrito: '<svg viewBox="0 0 24 24"><path d="M3 4h2l2.4 11h11l2-8H6.2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>',
  cerrar: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  flecha: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  whatsapp: '<svg viewBox="0 0 32 32"><path fill="currentColor" stroke="none" d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3Zm0 23.7c-2 0-4-.6-5.7-1.6l-.4-.2-3.9 1 1-3.8-.3-.4A10.7 10.7 0 1 1 16 26.7Zm5.9-8c-.3-.2-1.9-1-2.2-1-.3-.1-.5-.2-.7.1l-1 1.2c-.2.2-.4.3-.7.1a8.8 8.8 0 0 1-4.4-3.8c-.3-.6.3-.5 1-1.7.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.1 1.1-1.1 2.7s1.2 3.2 1.3 3.4c.2.2 2.3 3.5 5.6 4.9 2.1.9 2.9 1 4 .8.6-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5l-.6-.6Z"/></svg>',
};

function cssTema(t = {}) {
  return `:root{--primario:${t.primario || '#0F253C'};--acento:${t.acento || '#1FB1A4'};--fondo:${t.fondo || '#fff'};--fondo-suave:${t.fondoSuave || '#f4f6f8'};--texto:${t.texto || '#0f172a'};--radio:${t.radio || '10px'};--tipo:${t.tipografia || 'Inter, system-ui, sans-serif'}}`
    .replace(/[<>]/g, '');
}

// ID público de la tienda en Vixan: config.json → vixan.tienda, o la variable VIXAN_TIENDA_ID
const idTienda = (cfg) => cfg.vixan?.tienda || process.env.VIXAN_TIENDA_ID || '';

function etiquetaIva(cfg) { return cfg.tienda.precioConIva ? 'IVA incluido' : '+ IVA'; }

// ---------- Componentes ----------
function tarjeta(p, cfg) {
  const descuento = p.precioAnterior ? Math.round((1 - p.precio / p.precioAnterior) * 100) : 0;
  const datos = esc(JSON.stringify({ id: p.id, nombre: p.nombre, sku: p.sku, precio: p.precio, multiplo: p.multiplo, imagen: img(p), slug: p.slug }));
  return `<article class="prod${p.stock ? '' : ' agotado'}" data-prod="${datos}">
  <a class="prod-img" href="/p/${esc(p.slug)}"><img src="${esc(img(p))}" alt="${esc(p.nombre)}" loading="lazy"></a>
  <div class="prod-badges">${descuento ? `<span class="badge oferta">-${descuento}%</span>` : ''}${p.nuevo ? '<span class="badge nuevo">Nuevo</span>' : ''}${p.stock ? '' : '<span class="badge sin">Sin stock</span>'}</div>
  <button class="fav" type="button" aria-label="Agregar a favoritos" data-fav="${p.id}">${ICON.corazon}</button>
  <div class="prod-info">
    <a class="prod-nombre" href="/p/${esc(p.slug)}">${esc(p.nombre)}</a>
    <span class="prod-sku">${esc(p.sku)}${p.multiplo > 1 ? ` · x${p.multiplo} u.` : ''}</span>
    <div class="prod-precio">${p.precioAnterior ? `<s>${pesos(p.precioAnterior)}</s>` : ''}<b>${pesos(p.precio)}</b><small>${etiquetaIva(cfg)}</small></div>
    ${p.stock ? `<div class="prod-comprar"><div class="cant"><button type="button" data-menos>−</button><input type="number" value="${p.multiplo}" min="${p.multiplo}" step="${p.multiplo}" aria-label="Cantidad"><button type="button" data-mas>+</button></div><button class="btn btn-agregar" type="button" data-agregar>Agregar</button></div>` : '<div class="prod-comprar"><button class="btn btn-sec" type="button" disabled>Sin stock</button></div>'}
  </div>
</article>`;
}

const grilla = (lista, cfg) => lista.length
  ? `<div class="grilla">${lista.map((p) => tarjeta(p, cfg)).join('')}</div>`
  : '<p class="vacio">No encontramos productos.</p>';

function banner(b, extra = '') {
  const fondo = b.imagen ? ` style="background-image:url('${esc(b.imagen)}')"` : '';
  return `<a class="banner${b.imagen ? ' con-img' : ''} ${extra}" href="${esc(b.enlace || '#')}"${fondo}>
  <div><strong>${esc(b.titulo)}</strong>${b.texto ? `<span>${esc(b.texto)}</span>` : ''}</div><i>${ICON.flecha}</i></a>`;
}

const migas = (items) => `<nav class="migas"><a href="/">Inicio</a>${items.map(([t, h]) => h ? ` / <a href="${esc(h)}">${esc(t)}</a>` : ` / <span>${esc(t)}</span>`).join('')}</nav>`;

// ---------- Estructura común ----------
function layout(cfg, fuente, { titulo, descripcion, cuerpo, actual = '', cabeza = '' }) {
  const t = cfg.tienda;
  const cats = fuente.categorias();
  const avisos = (cfg.avisos || []).map((a) => `<span>${esc(a)}</span>`).join('');
  const logo = t.logo ? `<img src="${esc(t.logo)}" alt="${esc(t.nombre)}">` : `<span class="logo-txt">${esc(t.nombre)}</span>`;
  const wa = cfg.contacto?.whatsapp;
  const publico = {
    whatsapp: wa || '', mensajeWhatsapp: cfg.contacto?.mensajeWhatsapp || '', nombre: t.nombre,
    precioConIva: !!t.precioConIva, compraMinimaInicial: t.compraMinimaInicial || 0, descuentoPorVolumen: t.descuentoPorVolumen || null,
    // Cuentas de compradores: la tienda habla con Vixan desde el navegador (ID público, no es secreto)
    cuentas: cfg.vixan?.url && idTienda(cfg) ? `${String(cfg.vixan.url).replace(/\/$/, '')}/api/v1/tienda/publico/${encodeURIComponent(idTienda(cfg))}` : '',
  };
  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo ? `${titulo} · ${t.nombre}` : t.nombre)}</title>
<meta name="description" content="${esc(descripcion || t.eslogan || '')}">
${t.favicon ? `<link rel="icon" href="${esc(t.favicon)}">` : ''}${t.iconoApple ? `<link rel="apple-touch-icon" href="${esc(t.iconoApple)}">` : ''}<meta name="theme-color" content="${esc(cfg.tema?.primario || '#0F253C')}">
${cabeza}<style>${cssTema(cfg.tema)}</style><link rel="stylesheet" href="/tienda.css?v=${VERSION_RECURSOS}">
</head><body>
<a class="saltar" href="#contenido">Ir al contenido</a>
${avisos ? `<div class="avisos"><div class="avisos-pista">${avisos}${avisos}</div></div>` : ''}
<header class="cabecera">
  <div class="cab-izq">
    <button class="cab-btn" type="button" data-abrir="menu">${ICON.menu}<span>Categorías</span></button>
    <form class="buscador" action="/buscar" role="search"><input name="q" type="search" placeholder="Buscar productos" aria-label="Buscar"><button aria-label="Buscar">${ICON.buscar}</button></form>
  </div>
  <a class="logo" href="/">${logo}</a>
  <div class="cab-der">
    <a class="cab-btn" href="/cuenta">${ICON.usuario}<span>Ingresar</span></a>
    <button class="cab-btn" type="button" data-abrir="favoritos" aria-label="Favoritos">${ICON.corazon}<em class="contador" data-cont="favoritos">0</em></button>
    <button class="cab-btn carrito" type="button" data-abrir="pedido">${ICON.carrito}<span>Carrito${t.etiquetaCarrito ? `<small>${esc(t.etiquetaCarrito)}</small>` : ''}</span><em class="contador" data-cont="pedido">0</em></button>
  </div>
</header>
<nav class="nav-cats"><div class="nav-pista">
  ${cats.map((c) => `<a href="/c/${c.slug}"${actual === c.slug ? ' class="activo"' : ''}>${esc(c.nombre)}</a>`).join('')}
  <a href="/ofertas" class="destacado${actual === 'ofertas' ? ' activo' : ''}">Ofertas</a>
  <a href="/mayoristas"${actual === 'mayoristas' ? ' class="activo"' : ''}>Mayoristas</a>
</div></nav>

<main id="contenido">${cuerpo}</main>

<section class="marca"><div class="envoltura">
  <div class="logo">${logo}</div>
  ${t.eslogan ? `<p>${esc(t.eslogan)}</p>` : ''}
  <div class="marca-links"><a href="/catalogo">Catálogo completo</a><a href="/novedades">Novedades</a><a href="/ofertas">Ofertas</a><a href="/mayoristas">Cómo comprar</a></div>
</div></section>
<footer class="pie"><div class="envoltura pie-cols">
  <div><h4>Explorá ${esc(t.nombre)}</h4><a href="/catalogo">Catálogo</a><a href="/novedades">Novedades</a>${cats.slice(0, 3).map((c) => `<a href="/c/${c.slug}">${esc(c.nombre)}</a>`).join('')}</div>
  <div><h4>Tu negocio</h4><a href="/cuenta">Mi cuenta</a><a href="/cuenta#pedidos">Mis pedidos</a><a href="#" data-abrir="favoritos">Favoritos</a><a href="#" data-abrir="pedido">Pedir presupuesto</a></div>
  <div><h4>Atención mayorista</h4>${wa ? `<a href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">WhatsApp +${esc(wa)}</a>` : ''}${cfg.contacto?.email ? `<a href="mailto:${esc(cfg.contacto.email)}">${esc(cfg.contacto.email)}</a>` : ''}${cfg.contacto?.direccion ? `<span>${esc(cfg.contacto.direccion)}</span>` : ''}${cfg.contacto?.horario ? `<span>${esc(cfg.contacto.horario)}</span>` : ''}</div>
</div><div class="envoltura pie-legal"><span>© ${new Date().getFullYear()} ${esc(t.nombre)}. Todos los derechos reservados.</span><span>Tienda creada con <b>Vixan</b></span></div></footer>

<div class="velo" data-cerrar></div>
<aside class="panel panel-izq" id="panel-menu" aria-label="Categorías"><header><h3>Categorías</h3><button type="button" data-cerrar>${ICON.cerrar}</button></header>
  <div class="panel-cuerpo menu-cats">${cats.map((c) => `<details><summary>${esc(c.nombre)}</summary><a href="/c/${c.slug}"><b>Ver todo</b></a>${c.subcategorias.map((s) => `<a href="/c/${c.slug}/${s.slug}">${esc(s.nombre)}</a>`).join('')}</details>`).join('')}
  <a class="menu-extra" href="/ofertas">Ofertas</a><a class="menu-extra" href="/mayoristas">Mayoristas</a></div></aside>
<aside class="panel" id="panel-pedido" aria-label="Mi pedido"><header><h3>Mi pedido</h3><button type="button" data-cerrar>${ICON.cerrar}</button></header><div class="panel-cuerpo" data-lista="pedido"></div><footer data-pie="pedido"></footer></aside>
<aside class="panel" id="panel-favoritos" aria-label="Mis favoritos"><header><h3>Mis favoritos</h3><button type="button" data-cerrar>${ICON.cerrar}</button></header><div class="panel-cuerpo" data-lista="favoritos"></div></aside>
${wa ? `<a class="wa-flotante" href="https://wa.me/${esc(wa)}?text=${encodeURIComponent(cfg.contacto.mensajeWhatsapp || '')}" target="_blank" rel="noopener">${ICON.whatsapp}<span>¿Te ayudamos?</span></a>` : ''}
<div class="aviso-flotante" role="status" aria-live="polite"></div>
<script>window.TIENDA=${JSON.stringify(publico).replace(/</g, '\\u003c')}</script><script src="/tienda.js?v=${VERSION_RECURSOS}"></script>
</body></html>`;
}

// ---------- Páginas ----------
function inicio(cfg, fuente) {
  const cats = fuente.categorias();
  const banners = (cfg.banners || []).map((b, i) => banner(b, `b${i}`)).join('');
  const secciones = cats.map((c) => `<section class="seccion envoltura">
  <div class="seccion-cab"><div><h2>${esc(c.nombre)}</h2><p>Detalles para tu negocio</p></div><a class="ver-todo" href="/c/${c.slug}">Ver toda la colección ${ICON.flecha}</a></div>
  ${c.subcategorias.length
    ? `<div class="mosaicos">${c.subcategorias.map((s) => `<a class="mosaico" href="/c/${c.slug}/${s.slug}"><img src="${esc(imgSub(s))}" alt="" loading="lazy"><span>${esc(s.nombre)}</span></a>`).join('')}</div>`
    : grilla(fuente.productos({ categoria: c.slug, limite: 8 }), cfg)}
</section>`).join('');
  const ofertas = (cfg.bloquesOfertas || []).map((b, i) => {
    let lista = fuente.productos({ categoria: b.categoria || undefined, ofertas: i === 0, masPedidos: i === 1, limite: 4 });
    if (!lista.length) lista = fuente.productos({ categoria: b.categoria || undefined, nuevos: i === 0 }).slice(0, 4);
    if (!lista.length) lista = fuente.productos({ categoria: b.categoria || undefined }).slice(i * 4, i * 4 + 4);
    if (!lista.length) return '';
    return `<section class="seccion envoltura bloque-ofertas${i % 2 ? ' invertido' : ''}">
  ${b.banner ? banner(b.banner, 'banner-alto') : ''}
  <div><div class="seccion-cab"><div><h2>${esc(b.titulo)}</h2>${b.texto ? `<p>${esc(b.texto)}</p>` : ''}</div><a class="ver-todo" href="${i === 0 ? '/ofertas' : '/mas-pedidos'}">Ver más ${ICON.flecha}</a></div>${grilla(lista, cfg)}</div>
</section>`;
  }).join('');
  return layout(cfg, fuente, {
    cuerpo: `${banners ? `<section class="banners envoltura">${banners}</section>` : ''}${secciones}${ofertas}`,
  });
}

function listado(cfg, fuente, { titulo, bajada, items, filtros, actual, q, buscarEnNavegador = false }) {
  const ordenes = [['', 'Destacados'], ['precio-asc', 'Menor precio'], ['precio-desc', 'Mayor precio'], ['nombre', 'Nombre A-Z']];
  const lista = buscarEnNavegador ? [] : fuente.productos(filtros);
  const cantidad = `<span data-cantidad>${buscarEnNavegador ? '' : `${lista.length} producto${lista.length === 1 ? '' : 's'}`}</span>`;
  const opciones = ordenes.map(([v, t]) => `<option value="${v}"${filtros.orden === v ? ' selected' : ''}>${t}</option>`).join('');
  // En la tienda estática (hosting PHP/FTP) el orden se aplica en el navegador.
  const orden = cfg._estatico
    ? `<div class="orden">${cantidad}<select data-orden-local aria-label="Ordenar">${opciones}</select></div>`
    : `<form class="orden">${q ? `<input type="hidden" name="q" value="${esc(q)}">` : ''}${cantidad}<select name="orden" onchange="this.form.submit()" aria-label="Ordenar">${opciones}</select></form>`;
  return layout(cfg, fuente, {
    titulo, actual,
    cuerpo: `<div class="envoltura pagina">${migas(items)}
  <div class="pagina-cab"><div><h1 data-titulo>${esc(titulo)}</h1>${bajada || ''}</div>${orden}</div>
  ${buscarEnNavegador ? '<div class="grilla" data-buscar-estatico></div><p class="vacio" data-sin-resultados hidden>No encontramos productos.</p>' : grilla(lista, cfg)}</div>`,
  });
}

function categoria(cfg, fuente, cat, sub, orden) {
  const chips = cat.subcategorias.length ? `<div class="chips"><a href="/c/${cat.slug}"${sub ? '' : ' class="activo"'}>Todo</a>${cat.subcategorias.map((s) => `<a href="/c/${cat.slug}/${s.slug}"${sub?.slug === s.slug ? ' class="activo"' : ''}>${esc(s.nombre)}</a>`).join('')}</div>` : '';
  return listado(cfg, fuente, {
    titulo: sub ? sub.nombre : cat.nombre,
    bajada: chips,
    items: sub ? [[cat.nombre, `/c/${cat.slug}`], [sub.nombre]] : [[cat.nombre]],
    filtros: { categoria: cat.slug, subcategoria: sub?.slug, orden },
    actual: cat.slug,
  });
}

function producto(cfg, fuente, p, urlAbsoluta = '') {
  const t = cfg.tienda;
  const compra = cfg.compra || {};
  const cat = fuente.categoria(p.categoria);
  const sub = cat?.subcategorias.find((s) => s.slug === p.subcategoria);
  const relacionados = fuente.productos(p.subcategoria ? { subcategoria: p.subcategoria, categoria: p.categoria } : { categoria: p.categoria }).filter((x) => x.id !== p.id).slice(0, 4);
  const imgs = p.imagenes?.length ? p.imagenes : [img(p)];
  const datos = esc(JSON.stringify({ id: p.id, nombre: p.nombre, sku: p.sku, precio: p.precio, multiplo: p.multiplo, imagen: img(p), slug: p.slug }));
  const wa = cfg.contacto?.whatsapp;
  const ocultarPrecio = !!t.preciosSoloClientes; // hasta que existan las cuentas, se ve el botón de ingreso
  const coleccion = sub?.nombre || cat?.nombre || '';
  const modalidad = compra.modalidad || 'Venta mayorista';
  const pocas = p.stock > 0 && p.stock <= (compra.avisoPocasUnidades || 10);
  const d = t.descuentoPorVolumen;
  const caracteristicas = [['Producto', p.nombre], ['Referencia', p.sku], ['Colección', coleccion], ...(p.caracteristicas || []),
    ['Venta por', p.multiplo > 1 ? `Bulto de ${p.multiplo} unidades` : 'Unidad'], ['Modalidad', modalidad]];
  const u = encodeURIComponent(urlAbsoluta);
  const txt = encodeURIComponent(p.nombre);
  const compartir = [
    ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${u}`, 'M14 8h3V4h-3c-2.8 0-4 1.7-4 4.3V10H7v4h3v7h4v-7h3l1-4h-4V8.6c0-.4.3-.6.7-.6Z'],
    ['X', `https://twitter.com/intent/tweet?url=${u}&text=${txt}`, 'M4 4l16 16M20 4 4 20'],
    ['LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${u}`, 'M6 9v11M6 5v.01M10 20v-6a3 3 0 0 1 6 0v6M10 10v10'],
    ['WhatsApp', `https://wa.me/?text=${txt}%20${u}`, 'M4 20l1.3-4A8 8 0 1 1 8 18.7Z'],
    ['Pinterest', `https://pinterest.com/pin/create/button/?url=${u}&description=${txt}`, 'M12 3a9 9 0 0 0-3.3 17.4M10 21l2.2-8.6M9.5 13.5c.6 1.5 4.5 1.8 5.5-1.5 1-3.4-1.3-6-4.5-5.5'],
    ['Email', `mailto:?subject=${txt}&body=${u}`, 'M3 6h18v12H3zM3 7l9 6 9-6'],
  ];
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: p.nombre, sku: p.sku, description: p.descripcion, image: imgs,
    ...(ocultarPrecio ? {} : { offers: { '@type': 'Offer', priceCurrency: 'ARS', price: p.precio, availability: `https://schema.org/${p.stock ? 'InStock' : 'OutOfStock'}`, url: urlAbsoluta } }) };

  const bloquePrecio = ocultarPrecio
    ? `<div class="precio-oculto"><b>Precios exclusivos para mayoristas</b><span>Ingresá para ver el precio y armar tu pedido.</span><a class="btn" href="/cuenta">Ingresar para comprar</a></div>`
    : `<div class="prod-precio grande">${p.precioAnterior ? `<s>${pesos(p.precioAnterior)}</s>` : ''}<b>${pesos(p.precio)}</b><small>${etiquetaIva(cfg)} · por unidad</small></div>
      ${p.multiplo > 1 ? `<p class="precio-bulto">Bulto x${p.multiplo}: <b>${pesos(p.precio * p.multiplo)}</b> ${etiquetaIva(cfg)}</p>` : ''}`;

  const bloqueCompra = ocultarPrecio || !p.stock ? '' : `<div class="prod-comprar"><div class="cant"><button type="button" data-menos aria-label="Menos">−</button><input type="number" value="${p.multiplo}" min="${p.multiplo}" step="${p.multiplo}" aria-label="Cantidad"><button type="button" data-mas aria-label="Más">+</button></div><button class="btn btn-agregar" type="button" data-agregar>Agregar al pedido</button></div>
      ${p.multiplo > 1 ? `<p class="nota-mult">Se vende en múltiplos de ${p.multiplo} unidades.</p>` : ''}`;

  return layout(cfg, fuente, {
    titulo: p.nombre, descripcion: p.descripcion, actual: p.categoria,
    cabeza: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>${imgs[0] ? `<meta property="og:image" content="${esc(imgs[0])}">` : ''}<meta property="og:title" content="${esc(p.nombre)}">`,
    cuerpo: `<div class="envoltura pagina">
  <div class="migas-fila">${migas([['Tienda', '/catalogo'], [cat?.nombre, `/c/${cat?.slug}`], ...(sub ? [[sub.nombre, `/c/${cat.slug}/${sub.slug}`]] : []), [p.nombre]])}
    ${sub || cat ? `<a class="ver-todo" href="/c/${cat.slug}${sub ? `/${sub.slug}` : ''}">Ver más de ${esc(coleccion)} ${ICON.flecha}</a>` : ''}</div>
  <div class="ficha" data-prod="${datos}">
    <div class="ficha-galeria" data-galeria>
      <div class="galeria-principal">
        <img class="ficha-img" src="${esc(imgs[0])}" alt="${esc(p.nombre)}" data-zoom>
        ${imgs.length > 1 ? `<button class="gal-flecha izq" type="button" data-gal="-1" aria-label="Anterior">${ICON.flecha}</button><button class="gal-flecha der" type="button" data-gal="1" aria-label="Siguiente">${ICON.flecha}</button>` : ''}
        <span class="gal-contador"><b data-gal-actual>1</b> / ${imgs.length}</span>
        <button class="gal-ampliar" type="button" data-ampliar aria-label="Ampliar imagen"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
      </div>
      ${imgs.length > 1 ? `<div class="miniaturas">${imgs.map((src, i) => `<button type="button" class="${i ? '' : 'activa'}" data-ver="${i}"><img src="${esc(src)}" alt="Imagen ${i + 1}"></button>`).join('')}</div>` : ''}
      <script type="application/json" data-imagenes>${JSON.stringify(imgs).replace(/</g, '\\u003c')}</script>
    </div>

    <div class="ficha-info">
      <h1>${esc(p.nombre)}</h1>
      <span class="ficha-ref">Cód. ${esc(p.sku)} · ${esc(modalidad)}</span>
      ${bloquePrecio}
      <div class="ficha-stock ${p.stock ? (pocas ? 'pocas' : 'ok') : 'sin'}"><i></i><div><b>${p.stock ? (pocas ? `Últimas ${p.stock} unidades` : 'Stock disponible') : 'Sin stock'}</b><span>${p.stock ? (compra.disponibilidad || 'Disponibilidad mayorista inmediata') : 'Consultanos por la próxima reposición'}</span></div></div>
      ${bloqueCompra}
      <div class="ficha-acciones">
        <button class="btn btn-sec" type="button" data-fav="${p.id}">${ICON.corazon}<span data-fav-txt>Agregar a la lista de deseos</span></button>
        ${wa ? `<a class="btn btn-sec" target="_blank" rel="noopener" href="https://wa.me/${esc(wa)}?text=${encodeURIComponent(`Hola, quiero consultar por ${p.nombre} (Cód. ${p.sku}).`)}">${ICON.whatsapp} Consultar</a>` : ''}
      </div>

      ${t.compraMinimaInicial ? `<div class="meta-compra" data-meta-minimo="${t.compraMinimaInicial}">
        <div class="meta-cab"><span>Te falta para tu compra inicial</span><b>${pesos(t.compraMinimaInicial)}${t.precioConIva ? '' : ' + IVA'}</b></div>
        <i><b data-meta-barra style="width:0%"></b></i><small data-meta-texto>Faltan ${pesos(t.compraMinimaInicial)} para alcanzar el mínimo.</small>
        ${d ? `<div class="meta-desc">${ICON.flecha}<span><b>${d.porcentaje}% OFF por volumen</b> en compras desde ${pesos(d.desde)}${t.precioConIva ? '' : ' + IVA'}</span></div>` : ''}
      </div>` : ''}

      <div class="saber"><h3>Lo que tenés que saber</h3>
        <dl><dt>Colección</dt><dd>${esc(coleccion)}</dd><dt>Código</dt><dd>${esc(p.sku)}</dd><dt>Modalidad</dt><dd>${esc(compra.modalidadDetalle || 'Venta exclusiva a comercios y revendedores mayoristas')}</dd></dl>
        <a class="ver-todo" href="#caracteristicas">Ver todas las características ${ICON.flecha}</a>
      </div>

      <ul class="ficha-servicios">
        <li><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/></svg><div><b>${esc(compra.pagos || 'Pago con Mercado Pago o transferencia')}</b><a href="/mayoristas#pagos">Ver información de pago</a></div></li>
        <li><svg viewBox="0 0 24 24"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg><div><b>${esc(compra.envios || 'Envíos a todo el país')}</b><span>${esc(compra.despacho || 'Despachamos al acreditarse el pago; el costo del envío se coordina con la tienda.')}</span></div></li>
        ${compra.devolucion !== '' ? `<li><svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6Z"/><path d="m9 12 2 2 4-4"/></svg><div><b>${esc(compra.devolucion || 'Garantía de devolución de 30 días')}</b><a href="${esc(compra.terminos || '/mayoristas#terminos')}">Términos y condiciones</a></div></li>` : ''}
      </ul>

      <div class="compartir"><span>Compartir</span>${compartir.map(([n, href, d]) => `<a href="${esc(href)}" target="_blank" rel="noopener" aria-label="Compartir en ${n}" title="${n}"><svg viewBox="0 0 24 24"><path d="${d}"/></svg></a>`).join('')}<button type="button" data-copiar="${esc(urlAbsoluta)}" aria-label="Copiar enlace" title="Copiar enlace"><svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg></button></div>
    </div>
  </div>

  <div class="ficha-detalle">
    <section class="ficha-desc"><h2>Descripción</h2><p>${esc(p.descripcion)}</p></section>
    <section id="caracteristicas"><h2>Características del producto</h2>
      <table class="tabla-car">${caracteristicas.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table></section>
    ${wa ? `<aside class="ayuda-wa">${ICON.whatsapp}<div><b>¿Te ayudamos con tu pedido?</b><span>Atención mayorista ${esc(t.nombre)}${cfg.contacto?.horario ? ` · ${esc(cfg.contacto.horario)}` : ''}</span></div><a class="btn" target="_blank" rel="noopener" href="https://wa.me/${esc(wa)}?text=${encodeURIComponent(`Hola, necesito ayuda con mi pedido. Estoy viendo ${p.nombre} (Cód. ${p.sku}).`)}">Escribinos</a></aside>` : ''}
  </div>

  ${relacionados.length ? `<section class="seccion"><div class="seccion-cab"><div><h2>También te puede interesar</h2><p>Más de ${esc(coleccion)}</p></div><a class="ver-todo" href="/c/${cat.slug}${sub ? `/${sub.slug}` : ''}">Ver todo ${ICON.flecha}</a></div>${grilla(relacionados, cfg)}</section>` : ''}
  <section class="seccion" data-vistos hidden><div class="seccion-cab"><h2>Vistos recientemente</h2></div><div class="grilla-mini" data-vistos-lista></div></section>
</div>
${bloqueCompra ? `<div class="barra-compra" data-barra-compra><div><b>${pesos(p.precio)}</b><small>${etiquetaIva(cfg)}${p.multiplo > 1 ? ` · x${p.multiplo}` : ''}</small></div><button class="btn btn-agregar" type="button" data-agregar-barra>Agregar al pedido</button></div>` : ''}
<div class="visor" data-visor hidden><button type="button" class="visor-cerrar" data-visor-cerrar aria-label="Cerrar">${ICON.cerrar}</button><img alt="${esc(p.nombre)}"></div>`,
  });
}

function mayoristas(cfg, fuente) {
  const t = cfg.tienda;
  const d = t.descuentoPorVolumen;
  return layout(cfg, fuente, {
    titulo: 'Mayoristas', actual: 'mayoristas',
    cuerpo: `<div class="envoltura pagina angosta">${migas([['Mayoristas']])}<h1>Cómo comprar</h1>
  <p>${esc(cfg.paginas?.mayoristas || '')}</p>
  <div class="condiciones">
    ${t.compraMinimaInicial ? `<div><b>${pesos(t.compraMinimaInicial)}${t.precioConIva ? '' : ' + IVA'}</b><span>Compra mínima inicial</span></div>` : ''}
    <div><b>Sin mínimo</b><span>Para reponer</span></div>
    ${d ? `<div><b>${d.porcentaje}% OFF</b><span>En compras desde ${pesos(d.desde)}</span></div>` : ''}
    <div><b>Todo el país</b><span>Envíos</span></div>
  </div>
  ${cfg.compra?.infoPagos ? `<h2 id="pagos">Formas de pago</h2><p>${esc(cfg.compra.infoPagos)}</p>` : ''}
  ${cfg.compra?.despacho ? `<h2 id="envios">Envíos</h2><p>${esc(cfg.compra.envios || '')}. ${esc(cfg.compra.despacho)}</p>` : ''}
  ${cfg.compra?.textoTerminos ? `<h2 id="terminos">Términos y condiciones</h2><p>${esc(cfg.compra.textoTerminos)}</p>` : ''}
  <a class="btn" href="/catalogo">Ver el catálogo</a></div>`,
  });
}

function cuenta(cfg, fuente) {
  const wa = cfg.contacto?.whatsapp;
  const conectada = cfg.vixan?.url && idTienda(cfg);
  const provincias = ['Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán'];
  const campo = (nombre, etiqueta, attrs = '', ancho = '') => `<label class="${ancho}">${etiqueta}<input name="${nombre}" ${attrs}></label>`;
  return layout(cfg, fuente, {
    titulo: 'Mi cuenta',
    cuerpo: `<div class="envoltura pagina angosta cuenta-app" data-cuenta-app>${migas([['Mi cuenta']])}
  ${conectada ? '' : '<p class="nota">Las cuentas de clientes todavía no están activas en esta tienda. Mientras tanto, podés armar tu pedido y enviarlo por WhatsApp.</p>'}
  <section data-vista="ingresar"${conectada ? '' : ' hidden'}>
    <h1>Ingresar</h1><p class="bajada">Ingresá para ver tus precios y armar tu pedido.</p>
    <form class="form-cuenta" data-form="ingresar">
      ${campo('email', 'Email', 'type="email" autocomplete="email" required')}
      ${campo('password', 'Contraseña', 'type="password" autocomplete="current-password" required')}
      <button class="btn">Ingresar</button><p class="form-error" data-error hidden></p>
      <p class="enlaces"><a href="#olvide">¿Olvidaste tu contraseña?</a></p>
    </form>
    <div class="caja-registro"><b>¿Todavía no tenés cuenta?</b><span>Registrá tu comercio: revisamos los datos y te avisamos por email cuando esté aprobada.</span><a class="btn btn-sec" href="#registro">Crear cuenta</a></div>
  </section>

  <section data-vista="registro" hidden>
    <h1>Crear cuenta</h1><p class="bajada">Venta exclusiva a comercios. Completá los datos de tu negocio: la cuenta queda pendiente hasta que la aprobemos.</p>
    <form class="form-cuenta ancho" data-form="registro">
      <fieldset><legend>Tu comercio</legend><div class="form-grilla">
        ${campo('razon_social', 'Razón social o nombre del comercio', 'required autocomplete="organization"', 'doble')}
        ${campo('cuit', 'CUIT', 'required inputmode="numeric" placeholder="20-12345678-9"')}
        <label>Condición frente al IVA<select name="condicion_iva"><option>Responsable Inscripto</option><option>Monotributista</option><option>Exento</option><option>Consumidor Final</option></select></label>
        ${campo('rubro', 'Rubro (opcional)', 'placeholder="Bazar, regalería, ferretería…"', 'doble')}
      </div></fieldset>
      <fieldset><legend>Contacto</legend><div class="form-grilla">
        ${campo('nombre', 'Tu nombre y apellido', 'required autocomplete="name"')}
        ${campo('telefono', 'Teléfono / WhatsApp', 'required type="tel" autocomplete="tel"')}
        ${campo('email', 'Email', 'required type="email" autocomplete="email"', 'doble')}
      </div></fieldset>
      <fieldset><legend>Dirección</legend><div class="form-grilla">
        ${campo('direccion', 'Calle y número', 'autocomplete="street-address"', 'doble')}
        ${campo('localidad', 'Localidad', 'autocomplete="address-level2"')}
        <label>Provincia<select name="provincia"><option value="">Elegí</option>${provincias.map((p) => `<option>${p}</option>`).join('')}</select></label>
        ${campo('cp', 'Código postal', 'autocomplete="postal-code" inputmode="numeric"')}
      </div></fieldset>
      <fieldset><legend>Contraseña</legend><div class="form-grilla">
        ${campo('password', 'Contraseña (mínimo 8 caracteres)', 'required type="password" minlength="8" autocomplete="new-password"')}
        ${campo('password2', 'Repetí la contraseña', 'required type="password" minlength="8" autocomplete="new-password"')}
      </div></fieldset>
      <button class="btn">Crear cuenta</button><p class="form-error" data-error hidden></p>
      <p class="enlaces"><a href="#ingresar">Ya tengo cuenta</a></p>
    </form>
  </section>

  <section data-vista="registrada" hidden>
    <h1>¡Gracias por registrarte!</h1>
    <p>Recibimos los datos de tu comercio. Tu cuenta queda <b>pendiente de aprobación</b>: te avisamos por email cuando esté lista para ingresar.</p>
    ${wa ? `<p>¿Necesitás algo antes? <a href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">Escribinos por WhatsApp</a>.</p>` : ''}
    <a class="btn" href="/catalogo">Ver el catálogo</a>
  </section>

  <section data-vista="olvide" hidden>
    <h1>Recuperar contraseña</h1><p class="bajada">Te enviamos un enlace por email para elegir una contraseña nueva.</p>
    <form class="form-cuenta" data-form="olvide">
      ${campo('email', 'Email de tu cuenta', 'type="email" autocomplete="email" required')}
      <button class="btn">Enviar enlace</button><p class="form-error" data-error hidden></p><p class="form-ok" data-ok hidden></p>
      <p class="enlaces"><a href="#ingresar">Volver a ingresar</a></p>
    </form>
  </section>

  <section data-vista="restablecer" hidden>
    <h1>Elegí una contraseña nueva</h1>
    <form class="form-cuenta" data-form="restablecer">
      ${campo('password', 'Contraseña nueva (mínimo 8 caracteres)', 'type="password" minlength="8" autocomplete="new-password" required')}
      ${campo('password2', 'Repetila', 'type="password" minlength="8" autocomplete="new-password" required')}
      <button class="btn">Guardar contraseña</button><p class="form-error" data-error hidden></p><p class="form-ok" data-ok hidden></p>
    </form>
  </section>

  <section data-vista="mi-cuenta" hidden>
    <h1>Hola, <span data-dato="nombre"></span></h1>
    <div class="cuenta-resumen">
      <div><span>Comercio</span><b data-dato="razon_social"></b></div>
      <div><span>CUIT</span><b data-dato="cuit"></b></div>
      <div><span>Email</span><b data-dato="email"></b></div>
      <div><span>Tus precios</span><b data-dato="lista"></b></div>
    </div>
    <p>Ya ves tus precios en toda la tienda. Armá tu pedido y envialo desde <a href="#" data-abrir="pedido">Mi pedido</a>.</p>
    <details class="cambiar-clave"><summary>Cambiar contraseña</summary>
      <form class="form-cuenta" data-form="clave">
        ${campo('actual', 'Contraseña actual', 'type="password" autocomplete="current-password" required')}
        ${campo('nueva', 'Contraseña nueva (mínimo 8 caracteres)', 'type="password" minlength="8" autocomplete="new-password" required')}
        <button class="btn btn-sec">Cambiar contraseña</button><p class="form-error" data-error hidden></p><p class="form-ok" data-ok hidden></p>
      </form>
    </details>
    <div class="toolbar-cuenta"><a class="btn" href="/catalogo">Ver el catálogo</a><button class="btn btn-sec" type="button" data-salir>Salir</button></div>
  </section>
</div>`,
  });
}

function noEncontrado(cfg, fuente) {
  return layout(cfg, fuente, { titulo: 'Página no encontrada', cuerpo: '<div class="envoltura pagina angosta"><h1>No encontramos esta página</h1><p>Puede que el producto ya no esté disponible.</p><a class="btn" href="/">Volver al inicio</a></div>' });
}

// Imagen provisoria para productos y subcategorías sin foto.
function placeholder(texto) {
  let h = 0; for (const c of texto) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const tono = h % 360;
  const inicial = esc((texto.trim()[0] || '?').toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="hsl(${tono} 30% 94%)"/><circle cx="200" cy="185" r="92" fill="hsl(${tono} 32% 86%)"/><rect x="128" y="292" width="144" height="14" rx="7" fill="hsl(${tono} 25% 84%)"/><text x="200" y="215" text-anchor="middle" font-family="system-ui,sans-serif" font-size="88" font-weight="600" fill="hsl(${tono} 28% 48%)">${inicial}</text></svg>`;
}

module.exports = { tarjeta, inicio, listado, categoria, producto, mayoristas, cuenta, noEncontrado, placeholder };
