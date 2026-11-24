// Vixan Tienda — publicar la tienda estática en un hosting compartido por FTP.
//
// Uso:
//   node publicar.js            exporta la tienda y sube solo lo que cambió
//   node publicar.js --probar   muestra qué subiría y qué borraría, sin tocar nada
//   node publicar.js --forzar   publica aunque la carpeta del hosting tenga otro sitio
//
// Datos de FTP en config.json → "ftp". La contraseña va en la variable de entorno
// VIXAN_FTP_CLAVE (recomendado) o en config.json → ftp.clave.
//
// Seguridad: solo borra archivos que la propia tienda subió antes (los que figuran en
// vixan-manifiesto.json). Nunca toca otros archivos del hosting.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Client } = require('basic-ftp');
const { exportar, cargarConfig } = require('./exportar');

const MANIFIESTO = 'vixan-manifiesto.json';
const IGNORAR_EN_RAIZ = new Set(['.', '..', 'cgi-bin', '.well-known', '.ftpquota', 'error_log', '.htaccess.vixan-respaldo', MANIFIESTO]);

async function publicar({ probar = false, forzar = false, log = console.log } = {}) {
  const cfg = cargarConfig();
  const ftp = cfg.ftp || {};
  const clave = process.env.VIXAN_FTP_CLAVE || ftp.clave;
  if (!ftp.host || !ftp.usuario || !clave) throw new Error('Faltan datos de FTP: config.json → ftp.host y ftp.usuario, y la contraseña en VIXAN_FTP_CLAVE.');
  const carpeta = (ftp.carpeta || '/public_html').replace(/\/$/, '') || '/';

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vixan-tienda-'));
  try {
    const { manifiesto, total } = exportar(tmp, cfg);
    log(`Tienda exportada: ${total} archivos.`);

    const cliente = new Client(30000);
    try {
      await cliente.access({
        host: ftp.host, port: ftp.puerto || 21, user: ftp.usuario, password: clave,
        secure: ftp.seguro === false ? false : true, // FTPS (TLS explícito) por defecto
        secureOptions: ftp.ignorarCertificado ? { rejectUnauthorized: false } : undefined,
      });
      await cliente.ensureDir(carpeta);
      await cliente.cd(carpeta);

      // Manifiesto anterior (lo que la tienda subió la última vez)
      let anterior = null;
      const lista = await cliente.list();
      if (lista.some((f) => f.name === MANIFIESTO)) {
        const archivo = path.join(tmp, '..', `${path.basename(tmp)}-anterior.json`);
        await cliente.downloadTo(archivo, MANIFIESTO);
        try { anterior = JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch { anterior = null; }
        fs.rmSync(archivo, { force: true });
      }

      // Primera publicación: comprobar que la carpeta no tenga otro sitio (por ejemplo, un WordPress)
      if (!anterior) {
        const ajenos = lista.map((f) => f.name).filter((n) => !IGNORAR_EN_RAIZ.has(n) && !(n in manifiesto) && !manifiesto[`${n}/index.html`]);
        const pisaria = lista.map((f) => f.name).filter((n) => n in manifiesto);
        if ((ajenos.length || pisaria.length) && !forzar) {
          throw new Error(`La carpeta ${carpeta} del hosting ya tiene archivos (${[...pisaria, ...ajenos].slice(0, 8).join(', ')}${ajenos.length + pisaria.length > 8 ? '…' : ''}).\n` +
            'Para no romper otro sitio, usá una carpeta vacía (por ejemplo la de un subdominio) o, si estás seguro, corré con --forzar.');
        }
      }

      const viejo = anterior?.archivos || {};
      const subir = Object.keys(manifiesto).filter((r) => viejo[r] !== manifiesto[r]);
      const borrar = Object.keys(viejo).filter((r) => !(r in manifiesto));
      // Orden: recursos y datos primero, páginas después, la home al final (así nadie ve una página sin su estilo)
      const peso = (r) => (r === 'index.html' ? 3 : r.endsWith('.html') ? 2 : r === '.htaccess' ? 0 : 1);
      subir.sort((a, b) => peso(a) - peso(b) || a.localeCompare(b));

      log(`${subir.length} archivo(s) para subir, ${borrar.length} para borrar.`);
      if (probar) {
        subir.slice(0, 40).forEach((r) => log(`  + ${r}`));
        if (subir.length > 40) log(`  … y ${subir.length - 40} más`);
        borrar.forEach((r) => log(`  − ${r}`));
        return { subidos: 0, borrados: 0, probar: true, pendientes: subir.length + borrar.length };
      }

      // Si había un .htaccess que no era de la tienda, se guarda una copia antes de reemplazarlo
      if (!anterior && lista.some((f) => f.name === '.htaccess')) {
        await cliente.rename('.htaccess', '.htaccess.vixan-respaldo');
        log('Había un .htaccess: se guardó como .htaccess.vixan-respaldo');
      }

      let hechos = 0;
      let dirActual = null;
      for (const rel of subir) {
        const dir = path.posix.dirname(rel);
        if (dir !== dirActual) {
          await cliente.cd(carpeta);
          if (dir !== '.') await cliente.ensureDir(dir); // ensureDir deja parado en esa carpeta
          dirActual = dir;
        }
        await cliente.uploadFrom(path.join(tmp, rel), path.posix.basename(rel));
        hechos++;
        if (hechos % 50 === 0) log(`  subidos ${hechos}/${subir.length}…`);
      }
      await cliente.cd(carpeta);
      for (const rel of borrar) {
        try { await cliente.remove(rel); } catch { /* ya no estaba */ }
      }
      // El manifiesto va al final: si algo falla a mitad de camino, la próxima vez se reintenta todo lo pendiente
      const archivoManifiesto = path.join(tmp, MANIFIESTO);
      fs.writeFileSync(archivoManifiesto, JSON.stringify({ version: require('./package.json').version, fecha: new Date().toISOString(), archivos: manifiesto }));
      await cliente.uploadFrom(archivoManifiesto, MANIFIESTO);
      log(`Listo: ${hechos} subido(s), ${borrar.length} borrado(s).`);
      return { subidos: hechos, borrados: borrar.length };
    } finally {
      cliente.close();
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { publicar };

if (require.main === module) {
  const args = new Set(process.argv.slice(2));
  publicar({ probar: args.has('--probar'), forzar: args.has('--forzar') })
    .catch((e) => { console.error(`Error: ${e.message}`); process.exit(1); });
}
