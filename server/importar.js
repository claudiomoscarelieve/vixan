// Vixan — importar productos desde Excel (.xlsx), CSV o la planilla .xls que exporta Vixan.
// Sin dependencias: el .xlsx es un zip con XML adentro y se lee con zlib.
const zlib = require('zlib');
const store = require('./db');

// ───────────── Lectura de archivos ─────────────
const entidades = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');

// Lee las entradas de un zip (solo lo necesario para un .xlsx)
function leerZip(buf) {
  let fin = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error('El archivo no es un Excel válido');
  const total = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const archivos = new Map();
  for (let k = 0; k < total; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(p + 10);
    const comprimido = buf.readUInt32LE(p + 20);
    const largoNombre = buf.readUInt16LE(p + 28);
    const largoExtra = buf.readUInt16LE(p + 30);
    const largoComent = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nombre = buf.toString('utf8', p + 46, p + 46 + largoNombre);
    archivos.set(nombre, () => {
      const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const datos = buf.subarray(ini, ini + comprimido);
      return (metodo === 0 ? datos : zlib.inflateRawSync(datos)).toString('utf8');
    });
    p += 46 + largoNombre + largoExtra + largoComent;
  }
  return archivos;
}

const columnaIndice = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

function leerXlsx(buf) {
  const zip = leerZip(buf);
  const leer = (n) => (zip.has(n) ? zip.get(n)() : null);
  const compartidos = [];
  const ss = leer('xl/sharedStrings.xml');
  if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) compartidos.push(entidades([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')));
  // Primera hoja del libro
  let hoja = 'xl/worksheets/sheet1.xml';
  const libro = leer('xl/workbook.xml'); const rels = leer('xl/_rels/workbook.xml.rels');
  const rid = libro?.match(/<sheet\b[^>]*r:id="([^"]+)"/)?.[1];
  const destino = rid && rels?.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1]
    || rid && rels?.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`))?.[1];
  if (destino) hoja = destino.startsWith('/') ? destino.slice(1) : `xl/${destino.replace(/^\.\//, '')}`;
  const xml = leer(hoja);
  if (!xml) throw new Error('No encontré la primera hoja del Excel');
  const filas = [];
  for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const fila = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]; const cuerpo = c[2] || '';
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      const tipo = attrs.match(/\bt="([^"]+)"/)?.[1];
      const v = cuerpo.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let valor = '';
      if (tipo === 's') valor = compartidos[Number(v)] ?? '';
      else if (tipo === 'inlineStr') valor = entidades([...cuerpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
      else if (tipo === 'b') valor = v === '1';
      else if (v !== undefined) valor = tipo === 'str' || tipo === 'e' ? entidades(v) : Number(v);
      fila[ref ? columnaIndice(ref) : fila.length] = valor;
    }
    filas.push(Array.from(fila, (x) => (x === undefined ? '' : x)));
  }
  return filas;
}

function leerCsv(texto) {
  texto = texto.replace(/^﻿/, '');
  const primera = texto.split(/\r?\n/, 1)[0];
  const sep = [';', ',', '\t'].map((s) => [s, primera.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const filas = []; let fila = []; let campo = ''; let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') comillas = false; else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && texto[i + 1] === '\n') i++; fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else campo += ch;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

// La planilla "Excel" que exporta Vixan es una tabla HTML con extensión .xls
function leerTablaHtml(texto) {
  return [...texto.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => [...r[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => entidades(c[1].replace(/<[^>]+>/g, '')).trim()));
}

function leerArchivo(nombre, base64) {
  const buf = Buffer.from(String(base64 || ''), 'base64');
  if (!buf.length) throw new Error('El archivo está vacío');
  if (buf.length > 3.5 * 1024 * 1024) throw new Error('El archivo es muy grande (máximo 3,5 MB). Dividilo en dos.');
  if (buf[0] === 0x50 && buf[1] === 0x4b) return leerXlsx(buf); // zip → .xlsx
  if (buf[0] === 0xd0 && buf[1] === 0xcf) throw new Error('Es un Excel antiguo (.xls). Abrilo en Excel y guardalo como .xlsx o .csv.');
  const texto = buf.toString('utf8');
  if (/<table/i.test(texto.slice(0, 5000))) return leerTablaHtml(texto);
  return leerCsv(texto);
}

// ───────────── Columnas ─────────────
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const COLUMNAS = {
  sku: ['sku', 'codigo', 'cod', 'codigo sku', 'referencia'],
  nombre: ['nombre', 'producto', 'nombre del producto', 'titulo'],
  categoria: ['categoria', 'rubro'],
  subcategoria: ['subcategoria', 'sub categoria', 'subcategoria en la tienda'],
  precio: ['precio', 'precio de venta', 'precio venta', 'precio general'],
  precio_anterior: ['precio anterior', 'precio antes', 'precio tachado'],
  venta_multiplo: ['se vende por bulto de', 'bulto', 'venta por bulto', 'multiplo', 'unidades por bulto', 'se vende por bulto de unidades'],
  nuevo: ['novedad', 'nuevo'],
  stock: ['stock', 'stock inicial', 'cantidad'],
  descripcion: ['descripcion', 'descripcion para la tienda', 'detalle'],
  costo: ['costo', 'costo proveedor'],
  marca: ['marca'], fabricante: ['fabricante'],
  ean: ['ean', 'codigo de barras', 'codigo de barras ean'],
  imagenes: ['fotos', 'imagenes', 'imagen', 'foto', 'fotos una direccion https por linea'],
  peso_kg: ['peso', 'peso kg'],
};
const ALIAS = new Map(Object.entries(COLUMNAS).flatMap(([k, l]) => l.map((a) => [a, k])));

// Números con formato argentino ("12.900,50") o internacional ("12900.5")
function numero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v ?? '').replace(/[$\s]/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
const siNo = (v) => (typeof v === 'boolean' ? v : ['si', 's', 'x', '1', 'true', 'yes', 'verdadero'].includes(norm(v)));

// ───────────── Importación ─────────────
// probar=true: solo revisa y devuelve qué haría.
function importar(t, { nombre, contenido, probar = true, publicar = true, stockInicial = true, actualizar = true, deposito = 'Central' } = {}) {
  const filas = leerArchivo(nombre, contenido).filter((f) => f.some((x) => String(x).trim() !== ''));
  if (filas.length < 2) throw new Error('El archivo no tiene productos (la primera fila tiene que ser la de los títulos)');
  const titulos = filas[0].map((x) => ALIAS.get(norm(x)) || null);
  if (!titulos.includes('sku')) throw new Error('Falta la columna SKU');
  const usadas = [...new Set(titulos.filter(Boolean))];
  const ignoradas = filas[0].filter((x, i) => String(x).trim() && !titulos[i]).map(String);

  const existentes = new Map(store.list(t, 'productos').map((p) => [String(p.sku).trim().toLowerCase(), p]));
  const vistos = new Set();
  const res = { filas: filas.length - 1, nuevos: 0, actualizados: 0, salteados: 0, conStock: 0, stockTotal: 0, sinPrecio: 0, errores: [], avisos: [], columnas: usadas, ignoradas, ejemplos: [] };
  const operaciones = [];

  filas.slice(1).forEach((f, i) => {
    const n = i + 2; // número de fila como en Excel
    const d = {};
    titulos.forEach((k, j) => { if (k && d[k] === undefined) d[k] = f[j] ?? ''; });
    const sku = String(d.sku ?? '').trim();
    if (!sku) { res.errores.push({ fila: n, error: 'Sin SKU' }); return; }
    const clave = sku.toLowerCase();
    if (vistos.has(clave)) { res.errores.push({ fila: n, sku, error: 'SKU repetido en el archivo' }); return; }
    vistos.add(clave);
    const prev = existentes.get(clave);
    if (prev && !actualizar) { res.salteados++; return; }
    const nombreP = String(d.nombre ?? '').trim();
    if (!prev && !nombreP) { res.errores.push({ fila: n, sku, error: 'Producto nuevo sin nombre' }); return; }

    const datos = {};
    const texto = (k) => { if (d[k] !== undefined && String(d[k]).trim() !== '') datos[k] = String(d[k]).trim(); };
    ['nombre', 'categoria', 'subcategoria', 'descripcion', 'marca', 'fabricante', 'ean'].forEach(texto);
    for (const k of ['precio', 'precio_anterior', 'costo', 'peso_kg', 'venta_multiplo']) {
      if (d[k] === undefined || String(d[k]).trim() === '') continue;
      const v = numero(d[k]);
      if (Number.isNaN(v) || v < 0) { res.errores.push({ fila: n, sku, error: `${k.replace('_', ' ')} no es un número: "${d[k]}"` }); return; }
      datos[k] = k === 'venta_multiplo' ? Math.max(1, Math.round(v)) : v;
    }
    if (d.nuevo !== undefined && String(d.nuevo).trim() !== '') datos.nuevo = siNo(d.nuevo);
    if (d.imagenes !== undefined && String(d.imagenes).trim()) datos.imagenes = String(d.imagenes).split(/[\s,;|]+/).filter((u) => /^https?:\/\//i.test(u)).join('\n');
    if (publicar) datos.market = true;

    let stock = 0;
    if (d.stock !== undefined && String(d.stock).trim() !== '') {
      const v = numero(d.stock);
      if (Number.isNaN(v) || v < 0) { res.errores.push({ fila: n, sku, error: `stock no es un número: "${d.stock}"` }); return; }
      stock = v;
    }
    if (!prev && datos.precio === undefined) res.sinPrecio++;
    if (prev && stock > 0 && stockInicial) res.stockNoCargado = (res.stockNoCargado || 0) + 1;
    const cargaStock = !prev && stockInicial && stock > 0;
    if (cargaStock) { res.conStock++; res.stockTotal += stock; }
    if (prev) res.actualizados++; else res.nuevos++;
    operaciones.push({ prev, sku, datos, stock: cargaStock ? stock : 0 });
    if (res.ejemplos.length < 8) res.ejemplos.push({ fila: n, sku, nombre: datos.nombre || prev?.nombre, categoria: [datos.categoria ?? prev?.categoria, datos.subcategoria ?? prev?.subcategoria].filter(Boolean).join(' › '), precio: datos.precio ?? prev?.precio ?? null, stock: cargaStock ? stock : null, accion: prev ? 'Actualiza' : 'Nuevo' });
  });
  if (res.stockNoCargado) res.avisos.push({ aviso: `${res.stockNoCargado} producto(s) ya existían: su columna Stock no se carga, para no sumar stock dos veces. Para agregar stock usá un ingreso en Inventario.` });
  if (res.sinPrecio) res.avisos.push({ aviso: `${res.sinPrecio} producto(s) nuevo(s) sin precio: no se van a ver en la tienda hasta que tengan precio` });
  if (probar) return res;

  const hoy = new Date().toISOString().slice(0, 10);
  const categorias = new Set(store.list(t, 'categorias').map((c) => c.nombre));
  store.enTransaccion(() => {
    for (const op of operaciones) {
      if (op.datos.categoria && !categorias.has(op.datos.categoria)) { store.create(t, 'categorias', { nombre: op.datos.categoria }); categorias.add(op.datos.categoria); }
      if (op.prev) store.update(t, 'productos', op.prev.id, op.datos);
      else store.create(t, 'productos', { marca: '', fabricante: '', categoria: '', costo: 0, stock_minimo: 0, market: false, activo: true, tipo: 'unidad', ...op.datos, sku: op.sku });
      if (op.stock > 0) {
        const nombreP = op.datos.nombre || op.prev?.nombre || op.sku;
        store.create(t, 'lotes', { lote: `INICIAL-${hoy.replace(/-/g, '')}`, sku: op.sku, producto: nombreP, ingreso: hoy, vencimiento: '', cantidad: op.stock, costo_unit: op.datos.costo || 0, origen: 'Stock inicial (importación)', deposito });
        store.create(t, 'movimientos_stock', { fecha: new Date().toISOString(), tipo: 'Stock inicial', sku: op.sku, producto: nombreP, deposito, lote: `INICIAL-${hoy.replace(/-/g, '')}`, cantidad: op.stock, nota: `Importado de ${nombre || 'archivo'}` });
      }
    }
  });
  return res;
}

module.exports = { importar, leerArchivo, numero };
