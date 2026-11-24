// Vixan Tienda — servidor de la vidriera de un cliente.
// Se instala en el servidor del cliente y toma los datos de Vixan (por ahora, catálogo de ejemplo).
const express = require('express');
const fs = require('fs');
const path = require('path');
const { crearFuente } = require('./src/datos');
const v = require('./src/vistas');

const { cargarConfig } = require('./src/config');
const cfg = cargarConfig();
const fuente = crearFuente(cfg);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback'); // detrás de Caddy
app.use((_req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
if (cfg._recursos) app.use(express.static(cfg._recursos, { maxAge: '1h' })); // logo, favicon y banners del cliente

const html = (res, cuerpo, codigo = 200) => res.status(codigo).type('html').send(cuerpo);
const orden = (req) => (['precio-asc', 'precio-desc', 'nombre'].includes(req.query.orden) ? req.query.orden : '');

app.get('/', (_req, res) => html(res, v.inicio(cfg, fuente)));

app.get('/c/:cat/:sub?', (req, res) => {
  const cat = fuente.categoria(req.params.cat);
  const sub = req.params.sub ? cat?.subcategorias.find((s) => s.slug === req.params.sub) : null;
  if (!cat || (req.params.sub && !sub)) return html(res, v.noEncontrado(cfg, fuente), 404);
  html(res, v.categoria(cfg, fuente, cat, sub, orden(req)));
});

app.get('/p/:slug', (req, res) => {
  const p = fuente.producto(req.params.slug);
  if (!p) return html(res, v.noEncontrado(cfg, fuente), 404);
  const base = (cfg.tienda.url || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  html(res, v.producto(cfg, fuente, p, `${base}/p/${p.slug}`));
});

app.get('/buscar', (req, res) => {
  const q = String(req.query.q || '').slice(0, 80);
  html(res, v.listado(cfg, fuente, { titulo: q ? `Resultados para “${q}”` : 'Buscar', items: [['Buscar']], filtros: { q, orden: orden(req) }, q }));
});

const listas = {
  '/catalogo': ['Catálogo completo', {}, ''],
  '/ofertas': ['Ofertas', { ofertas: true }, 'ofertas'],
  '/novedades': ['Novedades', { nuevos: true }, ''],
  '/mas-pedidos': ['Lo más pedido', { masPedidos: true }, ''],
};
for (const [ruta, [titulo, filtros, actual]] of Object.entries(listas)) {
  app.get(ruta, (req, res) => html(res, v.listado(cfg, fuente, { titulo, items: [[titulo]], filtros: { ...filtros, orden: orden(req) }, actual })));
}

app.get('/mayoristas', (_req, res) => html(res, v.mayoristas(cfg, fuente)));
app.get('/cuenta', (_req, res) => html(res, v.cuenta(cfg, fuente)));

app.get('/ph/:texto.svg', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400').type('image/svg+xml').send(v.placeholder(String(req.params.texto).slice(0, 60)));
});

app.use((_req, res) => html(res, v.noEncontrado(cfg, fuente), 404));

const PORT = Number(process.env.PORT || cfg.puerto || 3100);
app.listen(PORT, process.env.HOST || '127.0.0.1', () => console.log(`Vixan Tienda (${cfg.tienda.nombre}) en http://localhost:${PORT}`));
