// Vixan — arranque, sesión, menú y navegación
VG.app = { user: null, tenant: null, current: null };

VG.showLogin = () => {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login').classList.remove('hidden');
};

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const err = document.getElementById('login-err');
  err.textContent = '';
  try {
    await VG.post('/api/auth/login', { email: fd.get('email'), password: fd.get('password') });
    await boot();
  } catch (ex) { err.textContent = ex.message; }
});
document.getElementById('cambiar-clave').onclick = () => {
  VG.modal({
    title: 'Cambiar contraseña',
    saveLabel: 'Cambiar',
    body: `<div class="form grid" style="grid-template-columns:1fr;max-width:380px">
      <label>Contraseña actual<input type="password" name="actual" autocomplete="current-password"></label>
      <label>Nueva contraseña (mínimo 10 caracteres)<input type="password" name="nueva" autocomplete="new-password"></label>
      <label>Repetir la nueva<input type="password" name="repetir" autocomplete="new-password"></label>
      <p class="muted small">Al cambiarla se cierran tus sesiones abiertas en otros equipos.</p></div>`,
    onSave: async (b) => {
      const v = (n) => b.querySelector(`[name=${n}]`).value;
      if (v('nueva') !== v('repetir')) throw new Error('Las contraseñas nuevas no coinciden');
      await VG.post('/api/auth/password', { actual: v('actual'), nueva: v('nueva') });
      VG.toast('Contraseña cambiada');
    },
  });
};
document.getElementById('logout').onclick = async () => { await VG.post('/api/auth/logout'); location.hash = ''; VG.showLogin(); };
document.getElementById('toggle-side').onclick = () => document.getElementById('side').classList.toggle('closed');
document.getElementById('side-search').addEventListener('input', (e) => renderNav(e.target.value));

function visibleModules() {
  return VG.MODULES.filter((m) => !m.role || m.role.includes(VG.app.user.rol));
}
function renderNav(filter = '') {
  const nav = document.getElementById('nav');
  const q = filter.toLowerCase();
  let html = '', group = null;
  for (const m of visibleModules()) {
    if (q && !(m.label + ' ' + (m.title || '')).toLowerCase().includes(q)) continue;
    if (m.group !== group) { group = m.group; html += `<div class="nav-group">${VG.esc(group)}</div>`; }
    html += `<a class="nav-item ${VG.app.current === m.id ? 'active' : ''}" href="#${m.id}"><span class="ic">${m.icon}</span>${VG.esc(m.label)}</a>`;
  }
  nav.innerHTML = html;
}

async function route() {
  const id = (location.hash || '#dashboard').slice(1).split('?')[0];
  const mod = visibleModules().find((m) => m.id === id) || VG.MODULES[0];
  VG.app.current = mod.id;
  renderNav(document.getElementById('side-search').value);
  document.getElementById('crumbs').textContent = `${mod.group} · ${mod.label}`;
  const view = document.getElementById('view');
  view.innerHTML = '';
  const head = VG.h(`<div class="page-head"><div><h1>${VG.esc(mod.title || mod.label)}</h1>${mod.desc ? `<p>${mod.desc}</p>` : ''}</div><div class="head-actions"></div></div>`);
  view.appendChild(head);
  if (window.innerWidth < 700) document.getElementById('side').classList.add('closed');
  if (mod.render) return mod.render(view, head.querySelector('.head-actions'));
  const tabs = mod.tabs || [];
  const tabBar = VG.h('<div class="tabs"></div>');
  const body = VG.h('<div></div>');
  if (tabs.length > 1) view.appendChild(tabBar);
  view.appendChild(body);
  const show = (i) => {
    tabBar.querySelectorAll('.tab').forEach((b, j) => b.classList.toggle('active', i === j));
    body.innerHTML = '';
    const t = tabs[i];
    if (t.crud) VG.crud(body, { title: `${mod.label} — ${t.label}`, ...t.crud });
    else if (t.render) t.render(body);
  };
  tabBar.innerHTML = tabs.map((t) => `<button class="tab">${VG.esc(t.label)}</button>`).join('');
  tabBar.querySelectorAll('.tab').forEach((b, i) => b.onclick = () => show(i));
  if (tabs.length) show(0);
}
window.addEventListener('hashchange', route);

async function boot() {
  try {
    const me = await VG.get('/api/auth/me');
    VG.app.user = me.user; VG.app.tenant = me.tenant;
  } catch { return VG.showLogin(); }
  document.getElementById('login').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('tenant-name').textContent = VG.app.tenant?.nombre || '';
  document.getElementById('user-name').textContent = VG.app.user.nombre || VG.app.user.email;
  const sw = document.getElementById('tenant-switch');
  if (VG.app.user.rol === 'superadmin') {
    const ts = await VG.get('/api/admin/tenants');
    sw.innerHTML = ts.map((t) => `<option value="${t.id}" ${t.id === VG.app.tenant?.id ? 'selected' : ''}>${VG.esc(t.nombre)}</option>`).join('');
    sw.classList.remove('hidden');
    sw.onchange = async () => { await VG.post('/api/auth/switch-tenant', { tenantId: sw.value }); location.reload(); };
  }
  VG.get('/api/r/productos').then((p) => { VG.cache.productos = p; }).catch(() => {});
  route();
}
boot();
