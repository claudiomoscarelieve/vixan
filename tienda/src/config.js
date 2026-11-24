// Carga la configuración de la tienda.
// Orden: --config <archivo>  →  variable VIXAN_TIENDA_CONFIG  →  config.json  →  config.ejemplo.json
// Si la configuración tiene "recursos" (carpeta con logo, favicon, banners), la ruta es relativa al archivo de configuración.
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

function rutaConfig(argv = process.argv) {
  const i = argv.indexOf('--config');
  if (i !== -1 && argv[i + 1]) return path.resolve(argv[i + 1]);
  if (process.env.VIXAN_TIENDA_CONFIG) return path.resolve(process.env.VIXAN_TIENDA_CONFIG);
  const propio = path.join(RAIZ, 'config.json');
  return fs.existsSync(propio) ? propio : path.join(RAIZ, 'config.ejemplo.json');
}

function cargarConfig(ruta = rutaConfig()) {
  const cfg = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  cfg._archivo = ruta;
  if (cfg.recursos) cfg._recursos = path.resolve(path.dirname(ruta), cfg.recursos);
  return cfg;
}

// Lista recursiva de archivos de una carpeta: [rutaRelativa con "/", rutaAbsoluta]
function archivosDe(dir, prefijo = '') {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const abs = path.join(dir, e.name); const rel = prefijo ? `${prefijo}/${e.name}` : e.name;
    return e.isDirectory() ? archivosDe(abs, rel) : [[rel, abs]];
  });
}

module.exports = { cargarConfig, archivosDe, RAIZ };
