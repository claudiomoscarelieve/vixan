// Vixan Market — avisa a la tienda online cuando cambia algo que muestra (stock, precios, productos,
// promociones o configuración), para que actualice su caché. Se agrupan los cambios de unos segundos
// en un solo aviso, firmado con HMAC-SHA256 (encabezado X-Vixan-Firma) usando VIXAN_TIENDA_KEY.
const crypto = require('crypto');
const store = require('./db');

const pendientes = new Map();
const espera = () => Number(process.env.TIENDA_AVISO_MS) || 3000;

function destino() {
  const url = process.env.TIENDA_WEBHOOK_URL || '';
  const key = process.env.VIXAN_TIENDA_KEY || '';
  return url && key.length >= 32 ? { url, key } : null;
}

async function enviar(t) {
  const d = destino();
  if (!d) return;
  const cfg = store.getSettings(t).tienda || {};
  if (!cfg.slug && !cfg.dominio) return;
  const body = JSON.stringify({ evento: 'catalogo.cambio', tienda: { slug: cfg.slug || null, dominio: cfg.dominio || null }, fecha: new Date().toISOString() });
  const firma = crypto.createHmac('sha256', d.key).update(body).digest('hex');
  try {
    const r = await fetch(d.url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-vixan-firma': firma }, body, signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
  } catch (e) {
    // La tienda igual refresca su caché cada pocos minutos: un aviso perdido no rompe nada
    console.error('aviso a la tienda', t, e.message);
  }
}

function avisarCambio(t) {
  if (!t || !destino()) return;
  clearTimeout(pendientes.get(t));
  const h = setTimeout(() => { pendientes.delete(t); enviar(t); }, espera());
  h.unref?.();
  pendientes.set(t, h);
}

module.exports = { avisarCambio };
