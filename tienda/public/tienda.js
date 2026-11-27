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
    const iva = T.precioConIva ? 0 : neto * 0.21;
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
      ${t.iva ? `<div class="linea"><span>IVA 21%</span><span>${pesos(t.iva)}</span></div>` : ''}
      <div class="linea total"><span>Total</span><span>${pesos(t.total)}</span></div>
      ${T.whatsapp ? '<button class="btn btn-agregar" type="button" data-enviar>Enviar pedido por WhatsApp</button>' : ''}
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
  let cuenta = null; let preciosCliente = null; let listaCliente = '';
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
      guardarSesion(r.token); aplicarSesion(r); mostrarCuenta();
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
    cargarSesion().then(() => { if (cuenta && !restablecer) mostrarCuenta(); else rutear(); });
  } else {
    cargarSesion();
  }

  pintar();
})();
