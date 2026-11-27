// Vixan Tienda — comportamiento del navegador: pedido (carrito), favoritos, paneles y avisos.
(() => {
  const T = window.TIENDA || {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const pesos = (n) => '$' + Math.round(n).toLocaleString('es-AR');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Guardado en el navegador (puede no estar disponible: modo privado, vistas previas).
  const memoria = {};
  const leer = (k) => { try { return JSON.parse(localStorage.getItem('vt_' + k)) || []; } catch { return memoria[k] || []; } };
  const guardar = (k, v) => { memoria[k] = v; try { localStorage.setItem('vt_' + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

  let pedido = leer('pedido');
  let favoritos = leer('favoritos');

  const aviso = (txt) => {
    const el = $('.aviso-flotante'); el.textContent = txt; el.classList.add('ver');
    clearTimeout(aviso.t); aviso.t = setTimeout(() => el.classList.remove('ver'), 2200);
  };

  // ---------- Paneles ----------
  const abrir = (cual) => {
    cerrar();
    const p = $('#panel-' + cual); if (!p) return;
    p.classList.add('abierto'); document.body.classList.add('con-panel');
  };
  const cerrar = () => { $$('.panel.abierto').forEach((p) => p.classList.remove('abierto')); document.body.classList.remove('con-panel'); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });

  // ---------- Pedido ----------
  const unidades = () => pedido.reduce((a, i) => a + i.cant, 0);
  const subtotal = () => pedido.reduce((a, i) => a + i.precio * i.cant, 0);
  const normalizar = (cant, mult) => Math.max(mult, Math.round(cant / mult) * mult || mult);

  function agregar(prod, cant) {
    cant = normalizar(cant, prod.multiplo || 1);
    const ya = pedido.find((i) => i.id === prod.id);
    if (ya) ya.cant += cant; else pedido.push({ ...prod, cant });
    guardar('pedido', pedido); pintar();
    aviso(`Agregaste ${cant} × ${prod.nombre}`);
  }

  function totales() {
    const sub = subtotal();
    const d = T.descuentoPorVolumen;
    const desc = d && sub >= d.desde ? sub * d.porcentaje / 100 : 0;
    const neto = sub - desc;
    const iva = T.precioConIva ? 0 : neto * (T.ivaPct || 21) / 100;
    return { sub, desc, iva, total: neto + iva };
  }

  function pintarPedido() {
    const lista = $('[data-lista="pedido"]'), pie = $('[data-pie="pedido"]');
    if (!pedido.length) {
      lista.innerHTML = '<div class="panel-vacio"><svg viewBox="0 0 24 24"><path d="M3 4h2l2.4 11h11l2-8H6.2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>Tu pedido está vacío.<br>Agregá productos para armarlo.</div>';
      pie.innerHTML = ''; return;
    }
    lista.innerHTML = pedido.map((i) => `<div class="item" data-id="${i.id}">
      <a href="/p/${esc(i.slug)}"><img src="${esc(i.imagen)}" alt=""></a>
      <div><a class="item-nombre" href="/p/${esc(i.slug)}">${esc(i.nombre)}</a><div class="item-sub">${pesos(i.precio)} c/u${i.multiplo > 1 ? ` · x${i.multiplo}` : ''}</div>
        <div class="cant" style="margin-top:6px;width:max-content"><button type="button" data-item-menos>−</button><input type="number" value="${i.cant}" step="${i.multiplo}" min="${i.multiplo}" aria-label="Cantidad" data-item-cant><button type="button" data-item-mas>+</button></div></div>
      <div class="item-der">${pesos(i.precio * i.cant)}<button class="quitar" type="button" data-quitar>Quitar</button></div></div>`).join('');
    const t = totales();
    const d = T.descuentoPorVolumen;
    let progreso = '';
    if (T.compraMinimaInicial && t.sub < T.compraMinimaInicial) {
      progreso = `<div class="progreso">Primera compra: mínimo ${pesos(T.compraMinimaInicial)}${T.precioConIva ? '' : ' + IVA'}. Te faltan ${pesos(T.compraMinimaInicial - t.sub)} (si ya sos cliente, reponé sin mínimo).<i><b style="width:${Math.min(100, t.sub / T.compraMinimaInicial * 100)}%"></b></i></div>`;
    } else if (d && t.sub < d.desde) {
      progreso = `<div class="progreso">Sumá ${pesos(d.desde - t.sub)} más y obtené ${d.porcentaje}% OFF.<i><b style="width:${Math.min(100, t.sub / d.desde * 100)}%"></b></i></div>`;
    }
    pie.innerHTML = `${progreso}
      <div class="linea"><span>Subtotal (${unidades()} u.)</span><span>${pesos(t.sub)}</span></div>
      ${t.desc ? `<div class="linea desc"><span>Descuento ${d.porcentaje}%</span><span>−${pesos(t.desc)}</span></div>` : ''}
      ${t.iva ? `<div class="linea"><span>IVA ${T.ivaPct || 21}%</span><span>${pesos(t.iva)}</span></div>` : ''}
      <div class="linea total"><span>Total</span><span>${pesos(t.total)}</span></div>
      ${T.cuentas ? '<a class="btn btn-agregar" href="/checkout">Finalizar compra</a>' : ''}
      ${T.whatsapp ? `<button class="btn ${T.cuentas ? 'btn-sec' : 'btn-agregar'}" type="button" data-enviar>${T.cuentas ? 'Consultar por WhatsApp' : 'Enviar pedido por WhatsApp'}</button>` : ''}
      <button class="btn btn-sec" type="button" data-vaciar>Vaciar pedido</button>`;
  }

  function enviarWhatsapp() {
    const t = totales();
    const lineas = pedido.map((i) => `• ${i.cant} × ${i.nombre} (${i.sku}) — ${pesos(i.precio * i.cant)}`);
    const cli = cuenta ? [`Cliente: ${cuenta.razon_social} · CUIT ${cuenta.cuit}`, ''] : [];
    const txt = [`Hola ${T.nombre}, quiero hacer este pedido:`, '', ...cli, ...lineas, '', `Subtotal: ${pesos(t.sub)}`,
      ...(t.desc ? [`Descuento: −${pesos(t.desc)}`] : []), ...(t.iva ? [`IVA: ${pesos(t.iva)}`] : []), `Total: ${pesos(t.total)}`].join('\n');
    window.open(`https://wa.me/${T.whatsapp}?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
  }

  // ---------- Favoritos ----------
  const esFav = (id) => favoritos.some((f) => f.id === id);
  function alternarFav(prod) {
    if (esFav(prod.id)) { favoritos = favoritos.filter((f) => f.id !== prod.id); aviso('Quitado de favoritos'); }
    else { favoritos.push(prod); aviso('Guardado en favoritos'); }
    guardar('favoritos', favoritos); pintar();
  }
  function pintarFavoritos() {
    const lista = $('[data-lista="favoritos"]');
    lista.innerHTML = favoritos.length ? favoritos.map((f) => `<div class="item" data-id="${f.id}">
      <a href="/p/${esc(f.slug)}"><img src="${esc(f.imagen)}" alt=""></a>
      <div><a class="item-nombre" href="/p/${esc(f.slug)}">${esc(f.nombre)}</a><div class="item-sub">${pesos(f.precio)}${f.multiplo > 1 ? ` · x${f.multiplo}` : ''}</div></div>
      <div class="item-der"><button class="btn btn-agregar" style="padding:7px 12px;font-size:13px" type="button" data-fav-agregar>Agregar</button><button class="quitar" type="button" data-fav-quitar>Quitar</button></div></div>`).join('')
      : '<div class="panel-vacio"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9-9a4.8 4.8 0 0 1 9-3 4.8 4.8 0 0 1 9 3c-2 4.6-9 9-9 9Z"/></svg>Todavía no guardaste favoritos.</div>';
  }

  function pintar() {
    aplicarPrecios();
    const c1 = $('[data-cont="pedido"]'), c2 = $('[data-cont="favoritos"]');
    c1.textContent = c1.dataset.n = pedido.length; c2.textContent = c2.dataset.n = favoritos.length;
    $$('[data-fav]').forEach((b) => b.classList.toggle('activo', esFav(Number(b.dataset.fav))));
    $$('[data-fav-txt]').forEach((t) => { t.textContent = esFav(Number(t.closest('[data-fav]').dataset.fav)) ? 'En tu lista de deseos' : 'Agregar a la lista de deseos'; });
    pintarPedido(); pintarFavoritos(); pintarMeta();
  }

  // Meta de compra inicial en la ficha de producto
  function pintarMeta() {
    const m = $('[data-meta-minimo]'); if (!m) return;
    const min = Number(m.dataset.metaMinimo); const sub = subtotal(); const falta = Math.max(0, min - sub);
    $('[data-meta-barra]', m).style.width = Math.min(100, sub / min * 100) + '%';
    $('[data-meta-texto]', m).textContent = falta ? `Faltan ${pesos(falta)} para alcanzar el mínimo.` : '¡Alcanzaste el mínimo de compra inicial!';
    m.classList.toggle('lograda', !falta);
  }

  // ---------- Eventos ----------
  const datosProd = (el) => { const c = el.closest('[data-prod]'); return c ? JSON.parse(c.dataset.prod) : null; };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('button, a[data-abrir]'); if (!b) return;
    if (b.dataset.abrir) { e.preventDefault(); abrir(b.dataset.abrir); return; }
    if (b.hasAttribute('data-cerrar') || e.target.classList.contains('velo')) { cerrar(); return; }

    // Cantidad en tarjetas y ficha
    if (b.hasAttribute('data-mas') || b.hasAttribute('data-menos')) {
      const inp = b.parentElement.querySelector('input'); const paso = Number(inp.step) || 1;
      inp.value = Math.max(paso, Number(inp.value) + (b.hasAttribute('data-mas') ? paso : -paso)); return;
    }
    if (b.hasAttribute('data-agregar')) {
      const p = datosProd(b); const inp = b.closest('.prod-comprar').querySelector('input');
      agregar(p, Number(inp.value) || p.multiplo); return;
    }
    if (b.dataset.fav) { const p = datosProd(b); if (p) alternarFav(p); return; }

    // Dentro del panel de pedido
    const item = b.closest('.item');
    if (item && b.closest('#panel-pedido')) {
      const i = pedido.find((x) => x.id === Number(item.dataset.id));
      if (b.hasAttribute('data-quitar')) pedido = pedido.filter((x) => x !== i);
      if (b.hasAttribute('data-item-mas')) i.cant += i.multiplo;
      if (b.hasAttribute('data-item-menos')) i.cant = Math.max(i.multiplo, i.cant - i.multiplo);
      guardar('pedido', pedido); pintar(); return;
    }
    if (item && b.closest('#panel-favoritos')) {
      const f = favoritos.find((x) => x.id === Number(item.dataset.id));
      if (b.hasAttribute('data-fav-agregar')) agregar(f, f.multiplo);
      if (b.hasAttribute('data-fav-quitar')) { favoritos = favoritos.filter((x) => x !== f); guardar('favoritos', favoritos); pintar(); }
      return;
    }
    if (b.hasAttribute('data-vaciar')) { pedido = []; guardar('pedido', pedido); pintar(); return; }
    if (b.hasAttribute('data-enviar')) enviarWhatsapp();
  });
  $('.velo').addEventListener('click', cerrar);

  document.addEventListener('change', (e) => {
    const inp = e.target;
    if (inp.matches('[data-item-cant]')) {
      const i = pedido.find((x) => x.id === Number(inp.closest('.item').dataset.id));
      i.cant = normalizar(Number(inp.value), i.multiplo); guardar('pedido', pedido); pintar();
    } else if (inp.matches('.cant input')) {
      const paso = Number(inp.step) || 1; inp.value = normalizar(Number(inp.value), paso);
    }
  });

  // ---------- Ficha de producto ----------
  const galeria = $('[data-galeria]');
  if (galeria) {
    const imgs = JSON.parse($('[data-imagenes]', galeria).textContent);
    const principal = $('.galeria-principal', galeria), foto = $('.ficha-img', galeria);
    let actual = 0;
    const ver = (i) => {
      actual = (i + imgs.length) % imgs.length; foto.src = imgs[actual];
      const c = $('[data-gal-actual]', galeria); if (c) c.textContent = actual + 1;
      $$('[data-ver]', galeria).forEach((b, k) => b.classList.toggle('activa', k === actual));
    };
    galeria.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ver],[data-gal],[data-ampliar]');
      if (b?.dataset.ver) return ver(Number(b.dataset.ver));
      if (b?.dataset.gal) return ver(actual + Number(b.dataset.gal));
      if (b?.hasAttribute('data-ampliar')) return abrirVisor();
    });
    // Zoom al pasar el mouse (solo con puntero fino)
    if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
      principal.addEventListener('mousemove', (e) => {
        if (e.target.closest('button')) { principal.classList.remove('zoom'); return; }
        const r = principal.getBoundingClientRect();
        foto.style.transformOrigin = `${(e.clientX - r.left) / r.width * 100}% ${(e.clientY - r.top) / r.height * 100}%`;
        principal.classList.add('zoom');
      });
      principal.addEventListener('mouseleave', () => principal.classList.remove('zoom'));
    }
    principal.addEventListener('click', (e) => { if (!e.target.closest('button')) abrirVisor(); });
    const visor = $('[data-visor]');
    function abrirVisor() { $('img', visor).src = imgs[actual]; visor.hidden = false; }
    visor.addEventListener('click', (e) => { if (e.target === visor || e.target.closest('[data-visor-cerrar]')) visor.hidden = true; });
    document.addEventListener('keydown', (e) => {
      if (visor.hidden) return;
      if (e.key === 'Escape') visor.hidden = true;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { ver(actual + (e.key === 'ArrowRight' ? 1 : -1)); $('img', visor).src = imgs[actual]; }
    });

    // Barra fija en celulares: usa la cantidad elegida en la ficha
    const barra = $('[data-agregar-barra]');
    if (barra) barra.addEventListener('click', () => $('.ficha [data-agregar]').click());

    // Vistos recientemente
    const prod = JSON.parse($('.ficha').dataset.prod);
    let vistos = leer('vistos').filter((v) => v.id !== prod.id);
    if (vistos.length) {
      $('[data-vistos-lista]').innerHTML = vistos.slice(0, 6).map((v) => `<a class="mini" href="/p/${esc(v.slug)}"><img src="${esc(v.imagen)}" alt="" loading="lazy">${esc(v.nombre)}<small>${esc(v.sku)}</small></a>`).join('');
      $('[data-vistos]').hidden = false;
    }
    guardar('vistos', [prod, ...vistos].slice(0, 12));
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copiar]'); if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copiar); aviso('Enlace copiado'); } catch { aviso(b.dataset.copiar); }
  });

  // ---------- Tienda estática (hosting PHP/FTP): orden y búsqueda en el navegador ----------
  const selOrden = $('[data-orden-local]');
  if (selOrden) {
    const grillaEl = () => $('.pagina .grilla');
    const g0 = grillaEl();
    if (g0) [...g0.children].forEach((c, i) => { c.dataset.pos = i; });
    selOrden.addEventListener('change', () => {
      const g = grillaEl(); if (!g) return;
      const dato = (el) => JSON.parse(el.dataset.prod);
      const cmp = {
        'precio-asc': (a, b) => dato(a).precio - dato(b).precio,
        'precio-desc': (a, b) => dato(b).precio - dato(a).precio,
        nombre: (a, b) => dato(a).nombre.localeCompare(dato(b).nombre, 'es'),
      }[selOrden.value] || ((a, b) => a.dataset.pos - b.dataset.pos);
      [...g.children].sort(cmp).forEach((c) => g.appendChild(c));
    });
  }

  const cajaBuscar = $('[data-buscar-estatico]');
  if (cajaBuscar) {
    const q = new URLSearchParams(location.search).get('q') || '';
    const normal = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const terminos = normal(q).split(/[^a-z0-9]+/).filter(Boolean);
    const inp = $('.buscador input'); if (inp) inp.value = q;
    if (q) { $('[data-titulo]').textContent = `Resultados para “${q}”`; document.title = `${q} · ${T.nombre}`; }
    fetch('/datos/buscar.json').then((r) => r.json()).then((indice) => {
      const r = terminos.length ? indice.filter((p) => { const t = normal(p.t); return terminos.every((x) => t.includes(x)); }) : [];
      cajaBuscar.innerHTML = r.map((p) => p.html).join('');
      [...cajaBuscar.children].forEach((c, i) => { c.dataset.pos = i; });
      $('[data-cantidad]').textContent = `${r.length} producto${r.length === 1 ? '' : 's'}`;
      $('[data-sin-resultados]').hidden = r.length > 0;
      pintar();
    }).catch(() => { $('[data-sin-resultados]').hidden = false; });
  }


  // ---------- Cuentas de compradores (login con Vixan) ----------
  // La sesión es un token guardado en este navegador. Con la sesión, la tienda pide a Vixan los precios
  // de la lista del cliente y los reemplaza en todas las páginas y en el pedido.
  let cuenta = null; let preciosCliente = null; let listaCliente = ''; let sesionLista = Promise.resolve();
  const SESION = 'vt_sesion';
  const leerSesion = () => { try { return localStorage.getItem(SESION) || ''; } catch { return memoria.sesion || ''; } };
  const guardarSesion = (v) => { memoria.sesion = v; try { v ? localStorage.setItem(SESION, v) : localStorage.removeItem(SESION); sessionStorage.removeItem('vt_yo'); } catch { /* sin almacenamiento */ } };

  async function api(ruta, datos) {
    const token = leerSesion();
    const r = await fetch(T.cuentas + ruta, {
      method: datos ? 'POST' : 'GET',
      headers: { ...(datos ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: datos ? JSON.stringify(datos) : undefined,
    });
    const j = await r.json().catch(() => ({ ok: false, error: 'No pudimos conectarnos. Probá de nuevo.' }));
    if (!j.ok) throw Object.assign(new Error(j.error || 'Ocurrió un error'), { status: r.status, codigo: j.codigo });
    return j.data;
  }

  function aplicarSesion(d) {
    cuenta = d.cuenta; preciosCliente = d.precios || {}; listaCliente = d.lista || '';
    try { sessionStorage.setItem('vt_yo', JSON.stringify({ t: Date.now(), d })); } catch { /* sin almacenamiento */ }
    const btn = $('.cab-der a[href="/cuenta"] span');
    if (btn) btn.textContent = (cuenta.nombre || 'Mi cuenta').split(' ')[0];
    // El pedido guardado pasa a los precios del cliente
    let cambio = false;
    pedido.forEach((i) => { const p = preciosCliente[i.id]; if (p && p !== i.precio) { i.precio = p; cambio = true; } });
    if (cambio) guardar('pedido', pedido);
    document.documentElement.classList.add('con-cuenta');
    pintar();
  }

  // Reemplaza los precios visibles por los de la lista del cliente
  function aplicarPrecios() {
    if (!preciosCliente) return;
    $$('[data-prod]').forEach((el) => {
      if (el.dataset.precioCliente) return;
      const d = JSON.parse(el.dataset.prod); const p = preciosCliente[d.id];
      el.dataset.precioCliente = '1';
      const caja = el.querySelector('.prod-precio');
      if (!p) { // el producto no tiene precio en la lista del cliente
        if (caja) caja.innerHTML = '<b class="consultar">Consultar precio</b>';
        el.querySelectorAll('[data-agregar]').forEach((b) => { b.disabled = true; b.textContent = 'Consultar'; });
        return;
      }
      d.precio = p; el.dataset.prod = JSON.stringify(d);
      if (caja) {
        const b = caja.querySelector('b'); if (b) b.textContent = pesos(p);
        const tachado = caja.querySelector('s');
        if (tachado) { const ant = Number(tachado.textContent.replace(/\D/g, '')); if (ant <= p) tachado.remove(); }
      }
      const oferta = el.querySelector('.badge.oferta'); const t2 = caja?.querySelector('s');
      if (oferta) { if (t2) oferta.textContent = `-${Math.round((1 - p / Number(t2.textContent.replace(/\D/g, ''))) * 100)}%`; else oferta.remove(); }
      const bulto = el.querySelector('.precio-bulto b'); if (bulto) bulto.textContent = pesos(p * (d.multiplo || 1));
    });
    const barra = $('[data-barra-compra] b'); const ficha = $('.ficha[data-prod]');
    if (barra && ficha) { const p = preciosCliente[JSON.parse(ficha.dataset.prod).id]; barra.textContent = p ? pesos(p) : 'Consultar'; }
  }

  async function cargarSesion() {
    if (!T.cuentas || !leerSesion()) return;
    try {
      const guardada = JSON.parse(sessionStorage.getItem('vt_yo') || 'null');
      if (guardada && Date.now() - guardada.t < 5 * 60000) return aplicarSesion(guardada.d);
    } catch { /* sin copia */ }
    try { aplicarSesion(await api('/yo')); } catch (e) { if (e.status === 401) guardarSesion(''); }
  }

  // ---------- Página Mi cuenta ----------
  const app = $('[data-cuenta-app]');
  if (app && T.cuentas) {
    const vistas = $$('[data-vista]', app);
    const ver = (v) => { vistas.forEach((s) => { s.hidden = s.dataset.vista !== v; }); window.scrollTo(0, 0); };
    const params = new URLSearchParams(location.search);
    const restablecer = params.get('restablecer');
    // Después de ingresar, vuelve a la página desde la que vino (por ejemplo el checkout)
    const volver = /^\/(?!\/)[\w\-/?=&.%]*$/.test(params.get('volver') || '') ? params.get('volver') : '';
    const rutear = () => {
      if (restablecer) return ver('restablecer');
      const h = location.hash.slice(1);
      if (cuenta) return ver('mi-cuenta');
      ver(['registro', 'olvide'].includes(h) ? h : 'ingresar');
    };
    window.addEventListener('hashchange', rutear);

    const mostrarCuenta = () => {
      $$('[data-dato]', app).forEach((x) => { x.textContent = x.dataset.dato === 'lista' ? listaCliente : (cuenta[x.dataset.dato] || ''); });
      if (x0) x0.textContent = (cuenta.nombre || '').split(' ')[0];
      ver('mi-cuenta');
      api('/pedidos').then((ps) => {
        $('[data-mis-pedidos]', app).innerHTML = ps.length ? `<div class="tabla-scroll"><table class="tabla-pedidos"><thead><tr><th>Pedido</th><th>Fecha</th><th class="num">Total</th><th>Estado</th><th>Pago</th></tr></thead><tbody>${ps.map((p) => `<tr><td><a href="/cuenta/pedido/?n=${encodeURIComponent(p.numero)}">${esc(p.numero)}</a></td><td>${new Date(p.fecha).toLocaleDateString('es-AR')}</td><td class="num">${pesos(p.total)}</td><td>${esc(p.estado_txt)}</td><td>${p.pago === 'Pagado' ? '<span class="chip ok">Pagado</span>' : p.estado === 'cancelado' ? '—' : `<span class="chip pend">Pendiente</span> <small>${esc(p.metodo_pago)}</small>`}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Todavía no hiciste pedidos desde la tienda.</p>';
      }).catch(() => { $('[data-mis-pedidos]', app).innerHTML = '<p class="muted">No pudimos cargar tus pedidos.</p>'; });
    };
    const x0 = $('[data-dato="nombre"]', app);

    const enviarForm = (nombre, accion) => {
      const f = $(`[data-form="${nombre}"]`, app); if (!f) return;
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = $('[data-error]', f); const ok = $('[data-ok]', f); const btn = $('button', f);
        err.hidden = true; if (ok) ok.hidden = true;
        const datos = Object.fromEntries(new FormData(f));
        const texto = btn.textContent; btn.disabled = true; btn.textContent = 'Un momento…';
        try { await accion(datos, f, ok); } catch (ex) { err.textContent = ex.message; err.hidden = false; }
        btn.disabled = false; btn.textContent = texto;
      });
    };
    enviarForm('ingresar', async (d) => {
      const r = await api('/ingreso', { email: d.email, password: d.password });
      guardarSesion(r.token); aplicarSesion(r);
      if (volver) { location.href = volver; return; }
      mostrarCuenta();
      aviso(`¡Hola, ${(r.cuenta.nombre || '').split(' ')[0]}! Ya ves tus precios.`);
    });
    enviarForm('registro', async (d) => {
      if (d.password !== d.password2) throw new Error('Las contraseñas no coinciden');
      delete d.password2;
      await api('/registro', d);
      ver('registrada');
    });
    enviarForm('olvide', async (d, f, ok) => {
      await api('/olvide', { email: d.email });
      ok.textContent = 'Si el email tiene una cuenta, te llega un enlace en unos minutos. Revisá también el correo no deseado.'; ok.hidden = false;
    });
    enviarForm('restablecer', async (d, f, ok) => {
      if (d.password !== d.password2) throw new Error('Las contraseñas no coinciden');
      await api('/restablecer', { token: restablecer, password: d.password });
      history.replaceState(null, '', '/cuenta/#ingresar');
      ok.textContent = 'Listo: ya podés ingresar con tu contraseña nueva.'; ok.hidden = false;
      setTimeout(() => location.reload(), 1800);
    });
    enviarForm('clave', async (d, f, ok) => {
      await api('/clave', { actual: d.actual, nueva: d.nueva });
      f.reset(); ok.textContent = 'Contraseña cambiada.'; ok.hidden = false;
    });
    $('[data-salir]', app).addEventListener('click', async () => {
      try { await api('/salir', {}); } catch { /* igual se cierra */ }
      guardarSesion(''); location.href = '/';
    });
    sesionLista = cargarSesion().then(() => { if (cuenta && volver) location.href = volver; else if (cuenta && !restablecer) mostrarCuenta(); else rutear(); });
  } else {
    sesionLista = cargarSesion();
  }


  // ---------- Checkout ----------
  const co = $('[data-checkout]');
  if (co && T.cuentas) {
    const estado = $('[data-co-estado]', co); const main = $('[data-co]', co);
    let opciones = null; let cotizacion = null; let recotizando = null;
    const items = () => pedido.map((i) => ({ id: i.id, cantidad: i.cant }));
    const mostrarEstado = (html) => { estado.innerHTML = html; estado.hidden = false; main.hidden = true; };
    const radio = (grupo, o, sel) => `<label class="co-opcion"><input type="radio" name="${grupo}" value="${esc(o.id)}"${sel ? ' checked' : ''}><span><b>${esc(o.nombre)}</b><small>${esc(o.detalle || '')}</small></span></label>`;

    function pintarCotizacion() {
      const q = cotizacion; if (!q) return;
      $('[data-co-items]', co).innerHTML = q.lineas.map((l) => `<div class="co-item"><span class="co-cant">${l.cantidad}×</span><span class="co-nombre">${esc(l.nombre)}<small>${esc(l.sku)} · ${pesos(l.precio)} c/u</small></span><b>${pesos(l.importe)}</b></div>`).join('') || '<p class="muted">No hay productos disponibles en tu pedido.</p>';
      $('[data-co-problemas]', co).innerHTML = q.problemas.length ? `<div class="co-problemas"><b>Hay cambios en tu pedido:</b>${q.problemas.map((p) => `<div>${esc(p.nombre)}: ${esc(p.motivo)}</div>`).join('')}<button class="btn btn-sec" type="button" data-co-ajustar>Ajustar mi pedido</button></div>` : '';
      $('[data-co-totales]', co).innerHTML = `<div class="linea"><span>Subtotal</span><span>${pesos(q.subtotal)}</span></div>
        ${q.descuento ? `<div class="linea desc"><span>Descuento ${q.descuentoPct}%</span><span>−${pesos(q.descuento)}</span></div>` : ''}
        ${q.iva ? `<div class="linea"><span>IVA ${q.ivaPct}%</span><span>${pesos(q.iva)}</span></div>` : ''}
        <div class="linea"><span>Envío</span><span>${$('[name=envio]:checked', co)?.value === 'coordinar' ? 'A coordinar' : 'Sin cargo'}</span></div>
        <div class="linea total"><span>Total</span><span>${pesos(q.total)}</span></div>`;
      const m = $('[data-co-minimo]', co); m.textContent = q.avisoMinimo || ''; m.hidden = !q.avisoMinimo;
      const btn = $('[data-co-confirmar]', co); btn.disabled = !q.lineas.length || q.problemas.length > 0;
      const pagoSel = $('[name=pago]:checked', co)?.value;
      btn.textContent = pagoSel === 'mp' ? `Pagar ${pesos(q.total)} con Mercado Pago` : 'Confirmar pedido';
    }
    async function recotizar() {
      if (!pedido.length) return mostrarEstado('<p>Tu pedido está vacío.</p><a class="btn" href="/catalogo">Ver el catálogo</a>');
      try { cotizacion = await api('/cotizar', { items: items() }); main.hidden = false; estado.hidden = true; pintarCotizacion(); }
      catch (e) { mostrarEstado(`<p class="form-error">${esc(e.message)}</p>`); }
    }
    // Si el comprador cambia el pedido desde el panel, se vuelve a calcular
    const pintarOriginal = pintar;
    pintar = function () { pintarOriginal(); if (opciones) { clearTimeout(recotizando); recotizando = setTimeout(recotizar, 400); } };

    co.addEventListener('change', (e) => {
      if (e.target.name === 'envio') $('[data-co-direccion]', co).hidden = e.target.value !== 'coordinar';
      if (['envio', 'pago'].includes(e.target.name)) pintarCotizacion();
    });
    co.addEventListener('click', (e) => {
      if (!e.target.closest('[data-co-ajustar]')) return;
      for (const p of cotizacion.problemas) {
        const i = pedido.find((x) => x.id === p.id); if (!i) continue;
        const mult = i.multiplo || 1; const q = Math.floor((p.disponible || 0) / mult) * mult;
        if (q > 0) i.cant = q; else pedido = pedido.filter((x) => x !== i);
      }
      guardar('pedido', pedido); pintar(); recotizar();
    });
    $('[data-co-confirmar]', co).addEventListener('click', async (e) => {
      const btn = e.target; const err = $('[data-co-error]', co); err.hidden = true;
      const envio = $('[name=envio]:checked', co)?.value; const pago = $('[name=pago]:checked', co)?.value;
      if (!envio || !pago) { err.textContent = 'Elegí cómo recibir el pedido y cómo pagarlo.'; err.hidden = false; return; }
      const val = (n) => $(`[name=${n}]`, co)?.value || '';
      const texto = btn.textContent; btn.disabled = true; btn.textContent = 'Confirmando…';
      try {
        const r = await api('/pedido', { items: items(), envio, pago, notas: val('notas'), direccion: val('direccion'), localidad: val('localidad'), provincia: val('provincia'), cp: val('cp') });
        pedido = []; guardar('pedido', pedido);
        if (r.url) { btn.textContent = 'Abriendo Mercado Pago…'; location.href = r.url; return; }
        location.href = `/cuenta/pedido/?n=${encodeURIComponent(r.numero)}&nuevo=1${r.error ? '&mp=error' : ''}`;
      } catch (ex) {
        err.textContent = ex.message; err.hidden = false; btn.disabled = false; btn.textContent = texto;
        if (ex.status === 409) recotizar();
      }
    });

    sesionLista.then(async () => {
      if (!cuenta) return mostrarEstado(`<div class="co-ingresar"><h2>Ingresá para finalizar tu compra</h2><p>La compra online es para clientes con cuenta aprobada. Tu pedido queda guardado.</p><a class="btn" href="/cuenta/?volver=/checkout/">Ingresar</a> <a class="btn btn-sec" href="/cuenta/?volver=/checkout/#registro">Crear cuenta</a></div>`);
      try { opciones = await api('/checkout'); } catch (e) { return mostrarEstado(`<p class="form-error">${esc(e.message)}</p>`); }
      if (!opciones.pagos.length || !opciones.envios.length) return mostrarEstado('<p>La compra online todavía no está activa. Podés enviar tu pedido por WhatsApp desde Mi pedido.</p>');
      const c = opciones.cuenta;
      $('[data-co-cliente]', co).innerHTML = `<b>${esc(c.razon_social)}</b><span>CUIT ${esc(c.cuit)} · ${esc(c.email)}</span>`;
      $('[data-co-envios]', co).innerHTML = opciones.envios.map((o, i) => radio('envio', o, i === 0)).join('');
      $('[data-co-pagos]', co).innerHTML = opciones.pagos.map((o, i) => radio('pago', o, i === 0)).join('');
      for (const k of ['direccion', 'localidad', 'provincia', 'cp']) { const inp = $(`[name=${k}]`, co); if (inp && !inp.value) inp.value = c[k] || ''; }
      $('[data-co-direccion]', co).hidden = opciones.envios[0]?.id !== 'coordinar';
      await recotizar();
    });
  }

  // ---------- Detalle de un pedido (también es la vuelta desde Mercado Pago) ----------
  const pc = $('[data-pedido-cliente]');
  if (pc && T.cuentas) {
    const caja = $('[data-pc]', pc);
    const q = new URLSearchParams(location.search);
    const numero = q.get('n') || '';
    const estadoMP = q.get('collection_status') || q.get('status') || '';
    const pagoMP = q.get('payment_id') || q.get('collection_id') || '';
    const pintarPedido2 = (p) => {
      const msg = q.get('mp') === 'error' ? ['err', 'Tu pedido quedó registrado, pero no pudimos abrir Mercado Pago. Probá con el botón de abajo.']
        : p.pago === 'Pagado' ? ['ok', q.get('nuevo') || estadoMP ? '¡Listo! Recibimos el pago de tu pedido.' : 'Pedido pagado.']
        : estadoMP === 'approved' ? ['ok', 'Mercado Pago aprobó tu pago: en unos minutos se refleja en el pedido.']
        : ['pending', 'in_process'].includes(estadoMP) ? ['pend', 'Tu pago está en proceso. Te avisamos por email cuando se acredite.']
        : ['rejected', 'null', 'failure', 'cancelled'].includes(estadoMP) ? ['err', 'El pago no se completó. Podés intentar de nuevo.']
        : q.get('nuevo') ? ['ok', '¡Gracias! Recibimos tu pedido.'] : null;
      caja.innerHTML = `${msg ? `<div class="pc-aviso ${msg[0]}">${esc(msg[1])}</div>` : ''}
        <h1>Pedido ${esc(p.numero)}</h1>
        <p class="muted">${new Date(p.fecha).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' })}</p>
        <div class="cuenta-resumen"><div><span>Estado</span><b>${esc(p.estado_txt)}</b></div><div><span>Pago</span><b>${p.pago === 'Pagado' ? 'Pagado' : 'Pendiente'} · ${esc(p.metodo_pago)}</b></div><div><span>Entrega</span><b>${esc(p.tipo_envio)}</b></div></div>
        ${p.instrucciones ? `<div class="pc-instrucciones"><b>${p.metodo_pago === 'Transferencia' && p.pago !== 'Pagado' ? 'Datos para transferir' : p.metodo_pago === 'A coordinar' && p.pago !== 'Pagado' ? 'Pago' : 'Retiro'}</b><div>${esc(p.instrucciones)}</div></div>` : ''}
        ${p.puedePagar ? '<button class="btn btn-agregar" type="button" data-pagar>Pagar con Mercado Pago</button>' : ''}
        <h2 class="sub">Productos</h2>
        <div class="tabla-scroll"><table class="tabla-pedidos"><thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Importe</th></tr></thead><tbody>${p.items.map((i) => `<tr><td>${esc(i.nombre)}<br><small class="muted">${esc(i.sku)}</small></td><td class="num">${i.cantidad}</td><td class="num">${pesos(i.precio)}</td><td class="num">${pesos(i.importe)}</td></tr>`).join('')}</tbody></table></div>
        <div class="pc-totales"><div class="linea"><span>Subtotal</span><span>${pesos(p.subtotal)}</span></div>${p.descuento ? `<div class="linea desc"><span>Descuento</span><span>−${pesos(p.descuento)}</span></div>` : ''}${p.iva ? `<div class="linea"><span>IVA</span><span>${pesos(p.iva)}</span></div>` : ''}<div class="linea total"><span>Total</span><span>${pesos(p.total)}</span></div></div>
        ${p.direccion ? `<p><b>Envío a:</b> ${esc(p.direccion)}</p>` : ''}${p.notas ? `<p><b>Notas:</b> ${esc(p.notas)}</p>` : ''}
        <p><a href="/cuenta">← Mis pedidos</a></p>`;
      $('[data-pagar]', caja)?.addEventListener('click', async (e) => {
        e.target.disabled = true; e.target.textContent = 'Abriendo Mercado Pago…';
        try { const r = await api(`/pedidos/${encodeURIComponent(p.numero)}/pagar`, {}); location.href = r.url; }
        catch (ex) { aviso(ex.message); e.target.disabled = false; e.target.textContent = 'Pagar con Mercado Pago'; }
      });
    };
    sesionLista.then(async () => {
      if (!cuenta) { caja.innerHTML = `<h1>Mi pedido</h1><p>Ingresá con tu cuenta para ver este pedido.</p><a class="btn" href="/cuenta/?volver=${encodeURIComponent(location.pathname + location.search)}">Ingresar</a>`; return; }
      try {
        const p = pagoMP ? await api(`/pedidos/${encodeURIComponent(numero)}/verificar`, { pago: pagoMP }) : await api(`/pedidos/${encodeURIComponent(numero)}`);
        pintarPedido2(p);
      } catch (e) { caja.innerHTML = `<h1>Mi pedido</h1><p class="form-error">${esc(e.message)}</p><p><a href="/cuenta">← Mi cuenta</a></p>`; }
    });
  }

  pintar();
})();
