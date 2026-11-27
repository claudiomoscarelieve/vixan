// Fuente de datos de la tienda.
// "demo": catálogo de ejemplo. "vixan": catálogo publicado del cliente, desde /api/v1/tienda/catalogo con la clave de la tienda.
// Las vistas solo usan las funciones exportadas, así que cambiar de fuente no toca la plantilla.

const fs = require('fs');
const path = require('path');

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// ---------- Catálogo de ejemplo ----------
const ARBOL = {
  'Bazar': ['Vasos', 'Copas', 'Platos', 'Fuentes', 'Jarras', 'Tazas', 'Cubiertos', 'Bowls'],
  'Cocina': ['Utensilios', 'Tablas', 'Frascos', 'Dispensers', 'Especieros'],
  'Deco': ['Velas', 'Floreros', 'Portarretratos', 'Espejos', 'Bandejas', 'Canastos'],
  'Textil': ['Manteles', 'Individuales', 'Servilletas', 'Repasadores', 'Almohadones'],
  'Iluminación': ['Velas LED', 'Guirnaldas', 'Faroles'],
  'Organización': ['Cajas', 'Percheros', 'Ganchos', 'Organizadores'],
};
const MATERIALES = ['Vidrio', 'Cerámica', 'Acero inoxidable', 'Madera', 'Algodón', 'Lino', 'Metal', 'Fibra natural'];
const COLORES = ['Blanco', 'Natural', 'Negro', 'Bronce', 'Verde salvia', 'Terracota', 'Gris'];
const SINGULAR = { Almohadones: 'Almohadón', Faroles: 'Farol', Individuales: 'Individual', Organizadores: 'Organizador', 'Velas LED': 'Vela LED' };
const ADJ = ['Clásico', 'Nórdico', 'Rústico', 'Liso', 'Texturado', 'Natural', 'Mini', 'Grande', 'Línea Blanca', 'Bicolor'];

function generarDemo() {
  const categorias = [];
  const productos = [];
  let n = 0;
  for (const [cat, subs] of Object.entries(ARBOL)) {
    const c = { nombre: cat, slug: slug(cat), subcategorias: [] };
    for (const sub of subs) {
      c.subcategorias.push({ nombre: sub, slug: slug(sub), categoria: c.slug });
      for (let i = 0; i < 4; i++) {
        n++;
        const nombre = `${SINGULAR[sub] || sub.replace(/s$/, '')} ${ADJ[(n * 7 + i) % ADJ.length]}`;
        const precio = Math.round((1800 + ((n * 7919) % 46000)) / 50) * 50;
        const oferta = n % 6 === 0;
        productos.push({
          id: n,
          sku: `DEMO-${String(n).padStart(4, '0')}`,
          slug: `${slug(nombre)}-${n}`,
          nombre,
          categoria: c.slug,
          subcategoria: slug(sub),
          precio: oferta ? Math.round(precio * 0.85 / 50) * 50 : precio,
          precioAnterior: oferta ? precio : null,
          stock: (n * 13) % 9 === 0 ? 0 : 6 + ((n * 37) % 120),
          multiplo: [1, 3, 6, 12][n % 4],
          nuevo: n % 9 === 1,
          masPedido: n % 5 === 2,
          imagenes: (n % 3 ? [1, 2, 3] : [1]).map((k) => `/ph/${encodeURIComponent(k === 1 ? nombre : `${nombre} ${k}`)}.svg`),
          descripcion: `${nombre} seleccionado de nuestro catálogo mayorista, ideal para decoración, bazar y uso comercial. Producto de ejemplo: la descripción real llega desde el catálogo de Vixan.`,
          caracteristicas: [
            ['Material', MATERIALES[n % MATERIALES.length]],
            ['Color', COLORES[(n * 3) % COLORES.length]],
            ['Medidas', `${8 + (n % 20)} × ${6 + (n % 12)} cm`],
            ['Peso', `${120 + (n * 17) % 800} g`],
          ],
        });
      }
    }
    categorias.push(c);
  }
  return { categorias, productos };
}

// ---------- Catálogo desde Vixan ----------
// Pide /api/v1/tienda/catalogo con la clave de la tienda. Guarda una copia local: si Vixan no responde,
// la tienda sigue mostrando el último catálogo que recibió.
async function leerDeVixan(config) {
  const url = String(config.vixan?.url || '').replace(/\/$/, '');
  const clave = process.env.VIXAN_TIENDA_CLAVE || config.vixan?.clave;
  if (!url || !clave) throw new Error('Falta la conexión con Vixan: config.json → vixan.url y la clave en VIXAN_TIENDA_CLAVE.');
  const copia = config._archivo ? path.join(path.dirname(config._archivo), '.catalogo-vixan.json') : null;
  try {
    const r = await fetch(`${url}/api/v1/tienda/catalogo`, { headers: { 'X-Api-Key': clave, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `Vixan respondió ${r.status}`);
    if (copia) { try { fs.writeFileSync(copia, JSON.stringify(j.data)); } catch { /* sin permiso de escritura: se sigue igual */ } }
    return j.data;
  } catch (e) {
    if (copia && fs.existsSync(copia)) {
      console.warn(`[tienda] No se pudo leer el catálogo de Vixan (${e.message}). Se usa la última copia guardada.`);
      return JSON.parse(fs.readFileSync(copia, 'utf8'));
    }
    throw new Error(`No se pudo leer el catálogo de Vixan: ${e.message}`);
  }
}

// Arma categorías y subcategorías a partir de los productos que manda Vixan
function desdeVixan(data) {
  const cats = new Map();
  const productos = (data.productos || []).map((p) => {
    const catNombre = String(p.categoria || '').trim() || 'Otros';
    const subNombre = String(p.subcategoria || '').trim();
    const cs = slug(catNombre) || 'otros';
    if (!cats.has(cs)) cats.set(cs, { nombre: catNombre, slug: cs, subcategorias: new Map() });
    let ss = null;
    if (subNombre) { ss = slug(subNombre); const c = cats.get(cs); if (!c.subcategorias.has(ss)) c.subcategorias.set(ss, { nombre: subNombre, slug: ss, categoria: cs }); }
    return {
      ...p, categoria: cs, subcategoria: ss, imagenes: p.imagenes || [], caracteristicas: p.caracteristicas || [],
      multiplo: Math.max(1, Number(p.multiplo) || 1), precioAnterior: p.precioAnterior || null, masPedido: !!p.destacado,
    };
  });
  const orden = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
  const categorias = [...cats.values()].map((c) => ({ ...c, subcategorias: [...c.subcategorias.values()].sort(orden) })).sort(orden);
  return { categorias, productos };
}

// ---------- Fuente ----------
// Las condiciones de compra configuradas en Vixan (mínimo, descuento, IVA) mandan sobre config.json,
// así la tienda muestra lo mismo que después calcula el checkout.
function aplicarCondiciones(config, data) {
  const c = data?.tienda?.condiciones;
  if (!c) return;
  config.tienda = { ...config.tienda, compraMinimaInicial: c.compraMinimaInicial || 0, descuentoPorVolumen: c.descuentoPorVolumen || null, precioConIva: !!c.precioConIva, ivaPct: c.ivaPct || 21 };
}

async function crearFuente(config) {
  const cargar = async () => { const data = await leerDeVixan(config); aplicarCondiciones(config, data); return desdeVixan(data); };
  let cache = config.fuente === 'vixan' ? await cargar() : generarDemo();
  return {
    origen: config.fuente === 'vixan' ? 'vixan' : 'demo',
    async recargar() { if (config.fuente === 'vixan') cache = await cargar(); },
    categorias: () => cache.categorias,
    categoria: (s) => cache.categorias.find((c) => c.slug === s) || null,
    producto: (s) => cache.productos.find((p) => p.slug === s) || null,
    productosPorId: (ids) => cache.productos.filter((p) => ids.includes(p.id)),
    productos({ categoria, subcategoria, q, ofertas, nuevos, masPedidos, orden, limite } = {}) {
      let r = cache.productos;
      if (categoria) r = r.filter((p) => p.categoria === categoria);
      if (subcategoria) r = r.filter((p) => p.subcategoria === subcategoria);
      if (ofertas) r = r.filter((p) => p.precioAnterior);
      if (nuevos) r = r.filter((p) => p.nuevo);
      if (masPedidos) r = r.filter((p) => p.masPedido);
      if (q) {
        const t = slug(q).split('-').filter(Boolean);
        r = r.filter((p) => { const s = slug(`${p.nombre} ${p.sku} ${p.categoria} ${p.subcategoria}`); return t.every((x) => s.includes(x)); });
      }
      if (orden === 'precio-asc') r = [...r].sort((a, b) => a.precio - b.precio);
      else if (orden === 'precio-desc') r = [...r].sort((a, b) => b.precio - a.precio);
      else if (orden === 'nombre') r = [...r].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      return limite ? r.slice(0, limite) : r;
    },
  };
}

module.exports = { crearFuente, slug };
