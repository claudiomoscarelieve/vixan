// Vixan — conexión con Vixan Tienda (la vidriera de cada cliente).
// La tienda pide el catálogo con una clave de alcance "tienda", que solo puede leer /api/v1/tienda/*.
const express = require('express');
const crypto = require('crypto');
const store = require('./db');
const catalogo = require('./catalogo');

const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Configuración de la tienda (la misma de Vixan Market → Mi tienda)
function configTienda(t) {
  const s = store.getSettings(t).tienda || {};
  return { ...s, lista: s.lista || 'general' };
}

// Busca la lista elegida; las versiones anteriores guardaban el nombre en lugar del id
function listaElegida(ctx, valor) {
  if (!valor || valor === 'general') return { id: 'general', nombre: 'Precio general' };
  const l = ctx.listas.find((x) => String(x.id) === String(valor)) || ctx.listas.find((x) => x.nombre === valor);
  return l ? { id: l.id, nombre: l.nombre } : { id: 'general', nombre: 'Precio general' };
}

function catalogoParaTienda(t) {
  const cfg = configTienda(t);
  const ctx = catalogo.contexto(t);
  const lista = listaElegida(ctx, cfg.lista);
  const ocultos = new Set(String(cfg.ocultos || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean));
  const productos = [];
  for (const p of ctx.productos) {
    if (!p.market || p.activo === false || ocultos.has(String(p.sku))) continue;
    const precio = catalogo.precioEnLista(p, lista.id, ctx);
    if (!precio || precio <= 0) continue; // sin precio en la lista elegida: no se publica
    const medidas = p.largo ? `${n0(p.largo)} × ${n0(p.ancho)} × ${n0(p.alto)} cm` : '';
    productos.push({
      id: p.id,
      sku: String(p.sku),
      slug: `${slug(p.nombre) || 'producto'}-${p.id}`,
      nombre: p.nombre,
      categoria: p.categoria || '',
      subcategoria: p.subcategoria || '',
      precio,
      precioAnterior: n0(p.precio_anterior) > precio ? n0(p.precio_anterior) : null,
      stock: Math.max(0, Math.floor(catalogo.disponible(p, ctx))),
      multiplo: Math.max(1, Math.floor(n0(p.venta_multiplo) || 1)),
      nuevo: !!p.nuevo,
      destacado: !!p.destacado,
      descripcion: p.descripcion || '',
      imagenes: String(p.imagenes || '').split(/\s+/).filter((u) => /^https?:\/\//i.test(u)),
      caracteristicas: [['Marca', p.marca], ['Fabricante', p.fabricante], ['Medidas', medidas], ['Peso', p.peso_kg ? `${n0(p.peso_kg)} kg` : ''], ['Código de barras', p.ean]]
        .filter(([, v]) => v),
      actualizado: p._updated,
    });
  }
  return {
    tienda: { nombre: cfg.nombre || '', lista: lista.nombre },
    generado: new Date().toISOString(),
    productos,
  };
}

// ───────────── Rutas para la tienda (/api/v1/tienda, con X-Api-Key) ─────────────
const publicRouter = express.Router();
publicRouter.get('/catalogo', (req, res) => {
  try {
    store.setSetting(req.tenantId, 'tienda_conexion', { ultima: new Date().toISOString(), ip: String(req.headers['cf-connecting-ip'] || req.ip || '') });
    res.json({ ok: true, data: catalogoParaTienda(req.tenantId) });
  } catch (e) {
    console.error('tienda/catalogo', e);
    res.status(500).json({ ok: false, error: 'No se pudo armar el catálogo' });
  }
});

// ───────────── Rutas del panel (/api/tienda, con sesión) ─────────────
const router = express.Router();
const wrap = (fn) => (req, res) => { try { res.json({ ok: true, data: fn(req) }); } catch (e) { res.status(400).json({ ok: false, error: e.message }); } };
const soloAdmin = (req, res, next) => (['superadmin', 'admin'].includes(req.user.rol) ? next() : res.status(403).json({ ok: false, error: 'Sin permiso' }));

router.get('/estado', wrap((req) => {
  const t = req.tenantId;
  const clave = store.db.prepare("SELECT prefijo, created_at FROM api_keys WHERE tenant_id=? AND alcance='tienda' ORDER BY id DESC LIMIT 1").get(t) || null;
  const cat = catalogoParaTienda(t);
  const ctx = catalogo.contexto(t, { stock: false });
  return {
    clave,
    conexion: store.getSettings(t).tienda_conexion || null,
    publicados: cat.productos.length,
    marcados: ctx.productos.filter((p) => p.market).length,
    lista: cat.tienda.lista,
    listas: [{ id: 'general', nombre: 'Precio general' }, ...ctx.listas.filter((l) => !l.archivada).map((l) => ({ id: l.id, nombre: l.nombre }))],
    idPublico: require('./cuentas').idPublico(t),
    urlApi: `${(process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')}`,
  };
}));

// Genera la clave de la tienda. Reemplaza la anterior (la tienda vieja deja de conectarse).
router.post('/clave', soloAdmin, wrap((req) => {
  const t = req.tenantId;
  const key = 'vt_' + crypto.randomBytes(24).toString('hex');
  store.enTransaccion(() => {
    store.db.prepare("DELETE FROM api_keys WHERE tenant_id=? AND alcance='tienda'").run(t);
    store.db.prepare("INSERT INTO api_keys (tenant_id, nombre, key_hash, prefijo, alcance) VALUES (?,?,?,?, 'tienda')").run(t, 'Vixan Tienda', store.sha256(key), key.slice(0, 10));
  });
  store.logEvent(t, req.user.id, 'tienda_clave', 'Nueva clave de Vixan Tienda');
  return { key }; // se muestra una sola vez
}));

router.delete('/clave', soloAdmin, wrap((req) => {
  const n = store.db.prepare("DELETE FROM api_keys WHERE tenant_id=? AND alcance='tienda'").run(req.tenantId).changes;
  store.logEvent(req.tenantId, req.user.id, 'tienda_clave', 'Clave de Vixan Tienda revocada');
  return n > 0;
}));

router.get('/vista-previa', wrap((req) => catalogoParaTienda(req.tenantId)));

module.exports = { router, publicRouter, catalogoParaTienda };
