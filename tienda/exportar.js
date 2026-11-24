// Vixan Tienda — exportación estática para hostings compartidos (PHP / FTP).
// Genera todas las páginas como archivos HTML en una carpeta, listas para subir por FTP.
//
// Uso:  node exportar.js [carpeta] [--config archivo.json]     (carpeta por defecto: dist)
//
// La búsqueda y el orden de los listados funcionan en el navegador; el pedido, los favoritos
// y WhatsApp funcionan igual que en la versión Node.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { crearFuente, slug } = require('./src/datos');
const v = require('./src/vistas');
const { cargarConfig, archivosDe } = require('./src/config');


function exportar(destino = path.join(__dirname, 'dist'), cfg = cargarConfig()) {
  cfg = { ...cfg, _estatico: true };
  const fuente = crearFuente(cfg);
  const base = (cfg.tienda.url || '').replace(/\/$/, '');
  const archivos = new Map(); // ruta relativa → contenido

  const pagina = (ruta, html) => archivos.set(ruta === '/' ? 'index.html' : `${ruta.replace(/^\//, '')}/index.html`, html);
  // Las imágenes provisorias se guardan con nombres seguros para FTP (sin espacios ni acentos).
  const imagenes = new Map(); // nombre de archivo → texto
  const juntarImagenes = (html) => html.replace(/\/ph\/([^"'\\)]+?)\.svg/g, (_m, enc) => {
    const texto = decodeURIComponent(enc);
    const archivo = `${slug(texto) || 'img'}-${crypto.createHash('sha1').update(texto).digest('hex').slice(0, 6)}`;
    imagenes.set(archivo, texto);
    return `/ph/${archivo}.svg`;
  });

  // Páginas
  pagina('/', juntarImagenes(v.inicio(cfg, fuente)));
  for (const c of fuente.categorias()) {
    pagina(`/c/${c.slug}`, juntarImagenes(v.categoria(cfg, fuente, c, null, '')));
    for (const s of c.subcategorias) pagina(`/c/${c.slug}/${s.slug}`, juntarImagenes(v.categoria(cfg, fuente, c, s, '')));
  }
  for (const p of fuente.productos()) pagina(`/p/${p.slug}`, juntarImagenes(v.producto(cfg, fuente, p, `${base}/p/${p.slug}`)));
  const listas = { catalogo: ['Catálogo completo', {}, ''], ofertas: ['Ofertas', { ofertas: true }, 'ofertas'], novedades: ['Novedades', { nuevos: true }, ''], 'mas-pedidos': ['Lo más pedido', { masPedidos: true }, ''] };
  for (const [ruta, [titulo, filtros, actual]] of Object.entries(listas)) {
    pagina(`/${ruta}`, juntarImagenes(v.listado(cfg, fuente, { titulo, items: [[titulo]], filtros: { ...filtros, orden: '' }, actual })));
  }
  pagina('/buscar', v.listado(cfg, fuente, { titulo: 'Buscar', items: [['Buscar']], filtros: { orden: '' }, buscarEnNavegador: true }));
  pagina('/mayoristas', v.mayoristas(cfg, fuente));
  pagina('/cuenta', v.cuenta(cfg, fuente));
  archivos.set('404.html', v.noEncontrado(cfg, fuente));

  // Índice de búsqueda: texto para buscar + la tarjeta ya armada (misma plantilla que el resto)
  const indice = fuente.productos().map((p) => ({
    t: `${p.nombre} ${p.sku} ${p.categoria} ${p.subcategoria}`, precio: p.precio, nombre: p.nombre, html: juntarImagenes(v.tarjeta(p, cfg)),
  }));
  archivos.set('datos/buscar.json', JSON.stringify(indice));

  // Imágenes provisorias de los productos de ejemplo
  for (const [archivo, texto] of imagenes) archivos.set(`ph/${archivo}.svg`, v.placeholder(texto));

  // Recursos y configuración del servidor web (Apache, el de casi todos los hostings PHP)
  for (const [rel, abs] of archivosDe(path.join(__dirname, 'public'))) archivos.set(rel, fs.readFileSync(abs));
  for (const [rel, abs] of archivosDe(cfg._recursos)) archivos.set(rel, fs.readFileSync(abs)); // logo, favicon y banners del cliente
  archivos.set('.htaccess', `# Vixan Tienda (estática)
DirectoryIndex index.html
ErrorDocument 404 /404.html
Options -Indexes
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTPS} off
  RewriteCond %{HTTP:X-Forwarded-Proto} !https
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
  RewriteCond %{HTTP_HOST} ^www\\.(.+)$ [NC]
  RewriteRule ^ https://%1%{REQUEST_URI} [L,R=301]
</IfModule>
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml
</IfModule>
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/html "access plus 5 minutes"
  ExpiresByType application/json "access plus 5 minutes"
  ExpiresByType text/css "access plus 1 hour"
  ExpiresByType application/javascript "access plus 1 hour"
  ExpiresByType image/svg+xml "access plus 1 day"
</IfModule>
<Files "vixan-manifiesto.json">
  Require all denied
</Files>
`);
  archivos.set('robots.txt', `User-agent: *\nAllow: /\n${base ? `Sitemap: ${base}/sitemap.xml\n` : ''}`);
  if (base) {
    const urls = [...archivos.keys()].filter((r) => r.endsWith('index.html') && !r.startsWith('buscar/') && !r.startsWith('cuenta/'))
      .map((r) => `${base}/${r.replace(/index\.html$/, '')}`);
    archivos.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`);
  }

  // Escribir y armar el manifiesto (hash de cada archivo: sirve para subir solo lo que cambió)
  fs.rmSync(destino, { recursive: true, force: true });
  const manifiesto = {};
  for (const [rel, contenido] of archivos) {
    const abs = path.join(destino, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contenido);
    manifiesto[rel] = crypto.createHash('sha1').update(contenido).digest('hex');
  }
  return { destino, manifiesto, paginas: [...archivos.keys()].filter((r) => r.endsWith('.html')).length, total: archivos.size };
}

module.exports = { exportar, cargarConfig };

if (require.main === module) {
  const args = process.argv.slice(2).filter((a, i, l) => a !== '--config' && l[i - 1] !== '--config');
  const destino = path.resolve(args[0] || path.join(__dirname, 'dist'));
  const r = exportar(destino);
  console.log(`Tienda exportada en ${r.destino}: ${r.paginas} páginas, ${r.total} archivos.`);
}
