// Fuente de datos de la tienda.
// Hoy: "demo" (catálogo de ejemplo). Más adelante: "vixan" (API pública /api/v1 de Vixan con la clave del cliente).
// Las vistas solo usan las funciones exportadas, así que cambiar de fuente no toca la plantilla.

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
        const nombre = `${sub.replace(/s$/, '')} ${ADJ[(n * 7 + i) % ADJ.length]}`;
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

// ---------- Fuente ----------
let cache = null;

function crearFuente(config) {
  if (config.fuente === 'vixan') {
    // Etapa 1 del plan: la API pública de Vixan todavía no existe.
    // Cuando esté, acá se pide /api/v1/catalogo con la clave y se guarda en caché local.
    console.warn('[tienda] fuente "vixan" todavía no disponible; se usa el catálogo de ejemplo.');
  }
  cache = generarDemo();
  return {
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
