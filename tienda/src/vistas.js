// Plantilla de Vixan Tienda. Páginas generadas en el servidor (mejor para SEO) con template literals, sin dependencias.

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
function layout(cfg, fuente, { titulo, descripcion, cuerpo, actual = '' }) {
  const t = cfg.tienda;
  const cats = fuente.categorias();
  const avisos = (cfg.avisos || []).map((a) => `<span>${esc(a)}</span>`).join('');
  const logo = t.logo ? `<img src="${esc(t.logo)}" alt="${esc(t.nombre)}">` : `<span class="logo-txt">${esc(t.nombre)}</span>`;
  const wa = cfg.contacto?.whatsapp;
  const publico = {
    whatsapp: wa || '', mensajeWhatsapp: cfg.contacto?.mensajeWhatsapp || '', nombre: t.nombre,
    precioConIva: !!t.precioConIva, compraMinimaInicial: t.compraMinimaInicial || 0, descuentoPorVolumen: t.descuentoPorVolumen || null,
  };
  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo ? `${titulo} · ${t.nombre}` : t.nombre)}</title>
<meta name="description" content="${esc(descripcion || t.eslogan || '')}">
<style>${cssTema(cfg.tema)}</style><link rel="stylesheet" href="/tienda.css">
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
<script>window.TIENDA=${JSON.stringify(publico).replace(/</g, '\\u003c')}</script><script src="/tienda.js"></script>
</body></html>`;
}

// ---------- Páginas ----------
function inicio(cfg, fuente) {
  const cats = fuente.categorias();
  const banners = (cfg.banners || []).map((b, i) => banner(b, `b${i}`)).join('');
  const secciones = cats.map((c) => `<section class="seccion envoltura">
  <div class="seccion-cab"><div><h2>${esc(c.nombre)}</h2><p>Detalles para tu negocio</p></div><a class="ver-todo" href="/c/${c.slug}">Ver toda la colección ${ICON.flecha}</a></div>
  <div class="mosaicos">${c.subcategorias.map((s) => `<a class="mosaico" href="/c/${c.slug}/${s.slug}"><img src="${esc(imgSub(s))}" alt="" loading="lazy"><span>${esc(s.nombre)}</span></a>`).join('')}</div>
</section>`).join('');
  const ofertas = (cfg.bloquesOfertas || []).map((b, i) => {
    const lista = fuente.productos({ categoria: b.categoria || undefined, ofertas: i === 0, masPedidos: i === 1, limite: 4 });
    return `<section class="seccion envoltura bloque-ofertas${i % 2 ? ' invertido' : ''}">
  ${b.banner ? banner(b.banner, 'banner-alto') : ''}
  <div><div class="seccion-cab"><div><h2>${esc(b.titulo)}</h2>${b.texto ? `<p>${esc(b.texto)}</p>` : ''}</div><a class="ver-todo" href="${i === 0 ? '/ofertas' : '/mas-pedidos'}">Ver más ${ICON.flecha}</a></div>${grilla(lista, cfg)}</div>
</section>`;
  }).join('');
  return layout(cfg, fuente, {
    cuerpo: `${banners ? `<section class="banners envoltura">${banners}</section>` : ''}${secciones}${ofertas}`,
  });
}

function listado(cfg, fuente, { titulo, bajada, items, filtros, actual, q }) {
  const ordenes = [['', 'Destacados'], ['precio-asc', 'Menor precio'], ['precio-desc', 'Mayor precio'], ['nombre', 'Nombre A-Z']];
  const lista = fuente.productos(filtros);
  return layout(cfg, fuente, {
    titulo, actual,
    cuerpo: `<div class="envoltura pagina">${migas(items)}
  <div class="pagina-cab"><div><h1>${esc(titulo)}</h1>${bajada || ''}</div>
  <form class="orden">${q ? `<input type="hidden" name="q" value="${esc(q)}">` : ''}<span>${lista.length} producto${lista.length === 1 ? '' : 's'}</span>
    <select name="orden" onchange="this.form.submit()" aria-label="Ordenar">${ordenes.map(([v, t]) => `<option value="${v}"${filtros.orden === v ? ' selected' : ''}>${t}</option>`).join('')}</select></form></div>
  ${grilla(lista, cfg)}</div>`,
  });
}

function categoria(cfg, fuente, cat, sub, orden) {
  const chips = `<div class="chips"><a href="/c/${cat.slug}"${sub ? '' : ' class="activo"'}>Todo</a>${cat.subcategorias.map((s) => `<a href="/c/${cat.slug}/${s.slug}"${sub?.slug === s.slug ? ' class="activo"' : ''}>${esc(s.nombre)}</a>`).join('')}</div>`;
  return listado(cfg, fuente, {
    titulo: sub ? sub.nombre : cat.nombre,
    bajada: chips,
    items: sub ? [[cat.nombre, `/c/${cat.slug}`], [sub.nombre]] : [[cat.nombre]],
    filtros: { categoria: cat.slug, subcategoria: sub?.slug, orden },
    actual: cat.slug,
  });
}

function producto(cfg, fuente, p) {
  const cat = fuente.categoria(p.categoria);
  const sub = cat?.subcategorias.find((s) => s.slug === p.subcategoria);
  const relacionados = fuente.productos({ subcategoria: p.subcategoria }).filter((x) => x.id !== p.id).slice(0, 4);
  const imgs = p.imagenes?.length ? p.imagenes : [img(p)];
  const datos = esc(JSON.stringify({ id: p.id, nombre: p.nombre, sku: p.sku, precio: p.precio, multiplo: p.multiplo, imagen: img(p), slug: p.slug }));
  const wa = cfg.contacto?.whatsapp;
  return layout(cfg, fuente, {
    titulo: p.nombre, descripcion: p.descripcion, actual: p.categoria,
    cuerpo: `<div class="envoltura pagina">${migas([[cat?.nombre, `/c/${cat?.slug}`], ...(sub ? [[sub.nombre, `/c/${cat.slug}/${sub.slug}`]] : []), [p.nombre]])}
  <div class="ficha" data-prod="${datos}">
    <div class="ficha-galeria"><img class="ficha-img" src="${esc(imgs[0])}" alt="${esc(p.nombre)}">${imgs.length > 1 ? `<div class="miniaturas">${imgs.map((u) => `<img src="${esc(u)}" alt="" data-ver>`).join('')}</div>` : ''}</div>
    <div class="ficha-info">
      <span class="prod-sku">SKU ${esc(p.sku)}</span>
      <h1>${esc(p.nombre)}</h1>
      <div class="prod-precio grande">${p.precioAnterior ? `<s>${pesos(p.precioAnterior)}</s>` : ''}<b>${pesos(p.precio)}</b><small>${etiquetaIva(cfg)}</small></div>
      <ul class="ficha-datos">
        <li><span>Venta por</span><b>${p.multiplo > 1 ? `bulto de ${p.multiplo} unidades` : 'unidad'}</b></li>
        <li><span>Disponibilidad</span><b class="${p.stock ? 'ok' : 'sin'}">${p.stock ? 'En stock' : 'Sin stock'}</b></li>
      </ul>
      ${p.stock ? `<div class="prod-comprar"><div class="cant"><button type="button" data-menos>−</button><input type="number" value="${p.multiplo}" min="${p.multiplo}" step="${p.multiplo}" aria-label="Cantidad"><button type="button" data-mas>+</button></div><button class="btn btn-agregar" type="button" data-agregar>Agregar al pedido</button></div>` : ''}
      <div class="ficha-acciones"><button class="btn btn-sec" type="button" data-fav="${p.id}">${ICON.corazon} Favorito</button>${wa ? `<a class="btn btn-sec" target="_blank" rel="noopener" href="https://wa.me/${esc(wa)}?text=${encodeURIComponent(`Hola, quiero consultar por ${p.nombre} (${p.sku}).`)}">${ICON.whatsapp} Consultar</a>` : ''}</div>
      <div class="ficha-desc"><h3>Descripción</h3><p>${esc(p.descripcion)}</p></div>
    </div>
  </div>
  ${relacionados.length ? `<section class="seccion"><div class="seccion-cab"><h2>También te puede interesar</h2></div>${grilla(relacionados, cfg)}</section>` : ''}
</div>`,
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
  <a class="btn" href="/catalogo">Ver el catálogo</a></div>`,
  });
}

function cuenta(cfg, fuente) {
  return layout(cfg, fuente, {
    titulo: 'Ingresar',
    cuerpo: `<div class="envoltura pagina angosta">${migas([['Mi cuenta']])}<h1>Ingresar</h1>
  <form class="form-cuenta" onsubmit="return false"><label>Email<input type="email" autocomplete="email" disabled></label><label>Contraseña<input type="password" autocomplete="current-password" disabled></label>
  <button class="btn" disabled>Ingresar</button><p class="nota">Las cuentas de clientes se conectan con Vixan en una próxima etapa. Mientras tanto, podés armar tu pedido y enviarlo por WhatsApp.</p></form></div>`,
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

module.exports = { inicio, listado, categoria, producto, mayoristas, cuenta, noEncontrado, placeholder };
