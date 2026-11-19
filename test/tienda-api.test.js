// Pruebas de la API de la tienda online (Vixan Market). Corren sobre una base temporal con los datos demo.
// npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vixan-test-'));
process.env.VIXAN_DB = path.join(dir, 'vixan.db');
process.env.VIXAN_TIENDA_KEY = 'k'.repeat(40);
process.env.ADMIN_PASSWORD = 'clave-de-prueba-123';
delete process.env.VIXAN_DEMO;

const store = require('../server/db');
require('../server/seed').ensureSeed();
const app = require('../server/index');
const T = store.db.prepare("SELECT id FROM tenants WHERE slug='insumos-demo'").get().id;

let srv, base;
const HOST = 'demo.vixan.com.ar';
const api = async (method, p, body, headers = {}) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', 'x-tienda-key': process.env.VIXAN_TIENDA_KEY, 'x-tienda-host': HOST, ...headers }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  return { status: r.status, ...j };
};

before(async () => {
  store.setSetting(T, 'tienda', { abierta: true, nombre: 'Insumos Demo', slug: 'demo', lista: 'general', pago_mp: true, pago_transf: true });
  srv = app.listen(0);
  await new Promise((ok) => srv.once('listening', ok));
  base = `http://127.0.0.1:${srv.address().port}/api/tienda/v1`;
});
after(() => { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('sin clave o con clave equivocada no entra', async () => {
  assert.equal((await api('GET', '/config', null, { 'x-tienda-key': '' })).status, 401);
  assert.equal((await api('GET', '/config', null, { 'x-tienda-key': 'x'.repeat(40) })).status, 401);
});

test('la clave de tienda no abre el resto de la API', async () => {
  const r = await fetch(base.replace('/tienda/v1', '/r/clientes'), { headers: { 'x-tienda-key': process.env.VIXAN_TIENDA_KEY, 'x-api-key': process.env.VIXAN_TIENDA_KEY } });
  assert.equal(r.status, 401);
});

test('un dominio que no es de ninguna tienda da 404', async () => {
  assert.equal((await api('GET', '/config', null, { 'x-tienda-host': 'otra.vixan.com.ar' })).status, 404);
  assert.equal((await api('GET', '/config', null, { 'x-tienda-host': 'app.vixan.com.ar' })).status, 404);
});

test('config pública sin secretos', async () => {
  const r = await api('GET', '/config');
  assert.equal(r.ok, true);
  assert.equal(r.data.nombre, 'Insumos Demo');
  assert.equal(r.data.pagos.mercadopago, true);
});

test('el catálogo muestra solo lo publicado, sin costos', async () => {
  const r = await api('GET', '/productos');
  assert.equal(r.ok, true);
  const publicados = store.list(T, 'productos').filter((p) => p.market).length;
  assert.ok(r.data.length > 0 && r.data.length <= publicados);
  for (const p of r.data) {
    assert.equal(p.costo, undefined);
    assert.equal(p.costo_final, undefined);
    assert.ok(p.precio > 0);
  }
});

test('las promociones bajan el precio', async () => {
  const p = (await api('GET', '/productos')).data.find((x) => x.stock > 2);
  const hoy = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const promo = store.create(T, 'tienda_promos', { sku: p.sku, tipo: 'Porcentaje', valor: 20, desde: hoy, hasta: hoy, etiqueta: 'Prueba', activa: true });
  const con = (await api('GET', `/productos/${encodeURIComponent(p.sku)}`)).data;
  assert.equal(con.precio, Math.round(con.precio_lista * 0.8 * 100) / 100);
  assert.equal(con.promo.etiqueta, 'Prueba');
  store.remove(T, 'tienda_promos', promo.id);
});

test('crear pedido: precios del servidor, reserva stock, no duplica', async () => {
  const p = (await api('GET', '/productos')).data.find((x) => x.stock >= 2 && x.tipo === 'unidad');
  const body = {
    referencia: 'ref-1', items: [{ sku: p.sku, cantidad: 2, precio: 1 }],
    cliente: { nombre: 'Ana Compradora', email: 'ana@example.com', doc: '20-12345678-6' },
    envio: { entrega: 'retiro' }, metodo_pago: 'transferencia',
  };
  const r = await api('POST', '/pedidos', body);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.items[0].precio, p.precio); // el precio que mandó la tienda (1) se ignora
  assert.equal(r.data.total, Math.round((p.precio * 2 - Math.round(p.precio * 2 * 0.05 * 100) / 100) * 100) / 100);
  const despues = (await api('GET', `/productos/${encodeURIComponent(p.sku)}`)).data;
  assert.equal(despues.stock, p.stock - 2);
  const otra = await api('POST', '/pedidos', body);
  assert.equal(otra.data.numero, r.data.numero);
  const ped = store.porExterno(T, 'pedidos', 'market:ref-1')[0];
  assert.equal(ped.plataforma, 'Vixan Market');
  assert.ok(store.get(T, 'clientes', ped.cliente_id));
});

test('sin stock suficiente rechaza el pedido', async () => {
  const p = (await api('GET', '/productos')).data.find((x) => x.tipo === 'unidad');
  const r = await api('POST', '/pedidos', { referencia: 'ref-2', items: [{ sku: p.sku, cantidad: p.stock + 1 }], cliente: { nombre: 'B', email: 'b@example.com' }, envio: { entrega: 'retiro' }, metodo_pago: 'mercadopago' });
  assert.equal(r.status, 409);
});

test('un producto no publicado no se puede comprar', async () => {
  const oculto = store.list(T, 'productos').find((p) => !p.market);
  const r = await api('POST', '/pedidos', { referencia: 'ref-3', items: [{ sku: oculto.sku, cantidad: 1 }], cliente: { nombre: 'C', email: 'c@example.com' }, envio: { entrega: 'retiro' }, metodo_pago: 'mercadopago' });
  assert.equal(r.ok, false);
});

test('cotiza envío y lo cobra en el pedido', async () => {
  const p = (await api('GET', '/productos')).data.find((x) => x.stock >= 1 && x.tipo === 'unidad');
  const ops = await api('POST', '/cotizar-envio', { cp: '1414', entrega: 'domicilio', items: [{ sku: p.sku, cantidad: 1 }] });
  assert.ok(ops.data.length >= 1);
  const op = ops.data[0];
  const r = await api('POST', '/pedidos', { referencia: 'ref-4', items: [{ sku: p.sku, cantidad: 1 }], cliente: { nombre: 'D', email: 'd@example.com' }, envio: { entrega: 'domicilio', opcion: op.id, cp: '1414', direccion: 'Calle 123' }, metodo_pago: 'mercadopago' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.costo_envio, op.precio);
  assert.equal(r.data.total, Math.round((p.precio + op.precio) * 100) / 100);
});

test('pago: el monto tiene que coincidir; cancelar libera stock', async () => {
  const mal = await api('POST', '/pedidos/ref-4/pago', { monto: 1 });
  assert.equal(mal.ok, false);
  const ped = (await api('GET', '/pedidos/ref-4')).data;
  const ok = await api('POST', '/pedidos/ref-4/pago', { monto: ped.total, referencia_pago: 'mp-1' });
  assert.equal(ok.data.pago, 'Pagado');
  assert.equal((await api('POST', '/pedidos/ref-4/cancelar')).ok, false); // pagado: se cancela desde Vixan

  const sku = ped.items[0].sku;
  const antes = (await api('GET', `/productos/${encodeURIComponent(sku)}`)).data.stock;
  const c = await api('POST', '/pedidos/ref-1/cancelar');
  assert.equal(c.data.estado, 'cancelado');
  const p1 = store.porExterno(T, 'pedidos', 'market:ref-1')[0];
  if (p1.items[0].sku === sku) assert.equal((await api('GET', `/productos/${encodeURIComponent(sku)}`)).data.stock, antes + 2);
});

test('Caddy: dominio-ok solo para tiendas abiertas', async () => {
  const ask = (d) => fetch(`${base}/dominio-ok?domain=${d}`).then((r) => r.status);
  assert.equal(await ask('demo.vixan.com.ar'), 200);
  assert.equal(await ask('cualquiera.com'), 404);
});
