// Vixan — datos iniciales: usuario superadmin + un cliente demo con datos de ejemplo.
const crypto = require('crypto');
const store = require('./db');

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => Math.floor(a + rnd() * (b - a + 1));
const DAY = 86400000;
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
// CUIT con dígito verificador correcto (los datos de ejemplo tienen que pasar la validación de ARCA)
function cuitDemo(pref) {
  for (;;) {
    const base = `${pref}${int(10000000, 79999999)}`;
    const suma = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2].reduce((a, p, i) => a + p * Number(base[i]), 0);
    let v = 11 - (suma % 11); if (v === 11) v = 0; if (v === 10) continue;
    return `${pref}-${base.slice(2)}-${v}`;
  }
}

function seedDemo(t) {
  const C = (e, d) => store.create(t, e, d);

  const fabricantes = [['Alimentos Andina', 'Argentina'], ['Molinos del Sur', 'Argentina'], ['Lácteos Pradera', 'Argentina'], ['Cremar SA', 'Uruguay'], ['Frutalia Foods', 'Chile'], ['Envases Patagonia', 'Argentina']]
    .map(([nombre, pais]) => C('fabricantes', { nombre, pais, activo: true }));
  const proveedores = [
    ['Distribuidora Central', 'Distribuidora Central SRL', cuitDemo('30'), 'Laura Pérez', '11 4555-1020', 30],
    ['Mayorista Norte', 'Mayorista Norte SA', cuitDemo('30'), 'Diego Ruiz', '11 4789-2211', 15],
    ['Insumos del Plata', 'Insumos del Plata SRL', cuitDemo('30'), 'Carla Gómez', '11 5263-8890', 45],
    ['Packaging Express', 'Packaging Express SA', cuitDemo('30'), 'Martín Sosa', '11 4022-7781', 0],
  ].map(([nombre_fantasia, razon_social, cuit, contacto_nombre, contacto_tel, plazo]) => C('proveedores', { nombre_fantasia, razon_social, cuit, contacto_nombre, contacto_tel, contacto_email: `ventas@${nombre_fantasia.toLowerCase().replace(/\s/g, '')}.com.ar`, condiciones_pago: plazo ? `${plazo} días` : 'Contado', plazo_pago_dias: plazo, activo: true }));
  const marcasDef = [['Andina', 0, 0], ['Dulcor', 0, 1], ['Molisur', 1, 0], ['Pradera', 2, 2], ['Cremar', 3, 2], ['Frutalia', 4, 1], ['EcoPack', 5, 3]];
  const marcas = marcasDef.map(([nombre, f, p]) => C('marcas', { nombre, fabricante_id: fabricantes[f].id, fabricante: fabricantes[f].nombre, proveedor_id: proveedores[p].id, proveedor: proveedores[p].nombre_fantasia, activo: true }));

  const catalogo = [
    ['Harina 000 x 25 kg', 'Molisur', 'Harinas', 21500, 15800], ['Harina 0000 x 25 kg', 'Molisur', 'Harinas', 23900, 17400], ['Azúcar común x 10 kg', 'Dulcor', 'Endulzantes', 12900, 9300],
    ['Azúcar impalpable x 5 kg', 'Dulcor', 'Endulzantes', 9800, 6900], ['Dulce de leche repostero x 10 kg', 'Pradera', 'Lácteos', 38500, 27200], ['Crema de leche x 5 l', 'Pradera', 'Lácteos', 24900, 18100],
    ['Manteca x 5 kg', 'Pradera', 'Lácteos', 41200, 30500], ['Chocolate cobertura semiamargo x 5 kg', 'Cremar', 'Chocolates', 52900, 38800], ['Chocolate cobertura blanco x 5 kg', 'Cremar', 'Chocolates', 55400, 40100],
    ['Cacao amargo x 1 kg', 'Cremar', 'Chocolates', 14300, 9900], ['Mermelada de frutilla x 5 kg', 'Frutalia', 'Rellenos', 16900, 11700], ['Relleno de membrillo x 5 kg', 'Frutalia', 'Rellenos', 13200, 8900],
    ['Esencia de vainilla x 1 l', 'Andina', 'Aditivos', 6400, 3900], ['Polvo de hornear x 1 kg', 'Andina', 'Aditivos', 5200, 3300], ['Levadura seca x 500 g', 'Andina', 'Aditivos', 4800, 3100],
    ['Aceite de girasol x 5 l', 'Andina', 'Aceites', 11900, 8600], ['Fécula de maíz x 5 kg', 'Molisur', 'Harinas', 10800, 7400], ['Coco rallado x 1 kg', 'Frutalia', 'Frutos secos', 8900, 6100],
    ['Nueces mariposa x 1 kg', 'Frutalia', 'Frutos secos', 18900, 13600], ['Almendras peladas x 1 kg', 'Frutalia', 'Frutos secos', 21900, 15900], ['Caja torta 30x30 x 50 u', 'EcoPack', 'Packaging', 15600, 10400],
    ['Bandeja cartón N°3 x 100 u', 'EcoPack', 'Packaging', 7900, 5100], ['Bolsa kraft con manija x 100 u', 'EcoPack', 'Packaging', 11200, 7300], ['Pirotines N°10 x 1000 u', 'EcoPack', 'Packaging', 6300, 3900],
    ['Glucosa x 5 kg', 'Dulcor', 'Endulzantes', 12400, 8700], ['Fondant blanco x 1 kg', 'Dulcor', 'Decoración', 7400, 4900], ['Colorante en gel x 6 u', 'Andina', 'Decoración', 9300, 5800],
    ['Granas de colores x 1 kg', 'Dulcor', 'Decoración', 6900, 4400], ['Leche en polvo entera x 1 kg', 'Pradera', 'Lácteos', 12900, 9400], ['Queso crema x 3,6 kg', 'Pradera', 'Lácteos', 27800, 20400],
  ];
  const marcaByNombre = Object.fromEntries(marcas.map((m) => [m.nombre, m]));
  const productos = catalogo.map(([nombre, marca, categoria, precio, costo], i) => C('productos', {
    sku: `VG-${String(1001 + i)}`, nombre, marca, fabricante: marcaByNombre[marca].fabricante, categoria, precio, costo, stock_minimo: int(8, 30), market: rnd() > 0.3, peso_kg: int(1, 25), activo: true,
  }));
  for (const c of [...new Set(catalogo.map((c) => c[2]))]) C('categorias', { nombre: c });

  for (const [nombre, dentro_de, para] of [['Central', '', 'Venta'], ['Estantería A', 'Central', 'Venta'], ['Fulfillment ML', '', 'Full'], ['Devoluciones', 'Central', 'Cuarentena']])
    C('depositos', { nombre, dentro_de, para, se_vende: para === 'Venta' || para === 'Full', estado: 'Abierto' });

  const hoy = Date.now();
  for (const p of productos) {
    const lotes = int(1, 3);
    for (let k = 0; k < lotes; k++) {
      const ingreso = hoy - int(5, 80) * DAY;
      C('lotes', { lote: `L${ymd(ingreso).replace(/-/g, '').slice(2)}-${int(10, 99)}`, sku: p.sku, producto: p.nombre, ingreso: ymd(ingreso), vencimiento: ymd(ingreso + int(90, 400) * DAY), cantidad: rnd() < 0.08 ? 0 : int(40, 220), costo_unit: p.costo, origen: 'Compra', deposito: k === 2 ? 'Fulfillment ML' : 'Central', imp_int: 0 });
    }
  }

  const nombres = ['Panadería La Espiga', 'Confitería Del Centro', 'Café Martínez Norte', 'Pastelería Dulce Hogar', 'Rotisería San Juan', 'Heladería Polo Sur', 'Bar El Faro', 'Panificadora Avellaneda', 'Lucía Fernández', 'Martín Acosta', 'Sofía Romero', 'Joaquín Benítez', 'Valentina Ríos', 'Tomás Herrera', 'Camila Medina', 'Mateo Castro', 'Pastelería Bonafide', 'Catering Eventos BA', 'Restaurante Lo de Pepe', 'Brunch Palermo', 'Florencia Ortiz', 'Nicolás Molina', 'Julieta Suárez', 'Franco Navarro', 'Pizzería Don Nicola', 'Granja La Vaquita', 'Almacén Natural', 'Dietética Vida Sana'];
  const zonas = [['CABA', 'C1414', 'Palermo'], ['CABA', 'C1406', 'Caballito'], ['GBA Norte', 'B1636', 'Olivos'], ['GBA Oeste', 'B1708', 'Morón'], ['GBA Sur', 'B1870', 'Avellaneda'], ['Córdoba', 'X5000', 'Córdoba'], ['Santa Fe', 'S2000', 'Rosario'], ['Mendoza', 'M5500', 'Mendoza']];
  const canales = ['Mayorista', 'Minorista', 'Gastronomía'].map((nombre) => C('canales', { nombre }));
  const clientes = nombres.map((nombre, i) => {
    const z = pick(zonas); const empresa = /[A-Z][a-z]+ [A-Z]/.test(nombre) && !/(Panader|Confiter|Caf|Paster|Rotiser|Helader|Bar|Panific|Catering|Restaurante|Brunch|Pizzer|Granja|Almac|Diet)/.test(nombre);
    return C('clientes', { nombre, razon_social: empresa ? '' : `${nombre} SRL`, cuit: empresa ? `${int(20, 40)}.${int(100, 999)}.${int(100, 999)}` : cuitDemo('30'), direccion: `${pick(['Av. Rivadavia', 'Corrientes', 'Av. Mitre', 'Belgrano', 'San Martín', 'Av. Cabildo'])} ${int(100, 5900)}`, zona: z[0], localidad: z[2], cp: z[1], telefono: `11 ${int(3000, 6999)}-${int(1000, 9999)}`, email: `${nombre.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '').slice(0, 14)}@mail.com`, canal: empresa ? 'Minorista' : pick(['Mayorista', 'Gastronomía']), condicion_iva: empresa ? 'Consumidor Final' : 'Responsable Inscripto', etiquetas: rnd() > 0.7 ? ['VIP'] : [], vendedor: pick(['Ana', 'Bruno', '—']) });
  });

  const plataformas = [['Mercado Libre', 0.5], ['WooCommerce', 0.25], ['Venta directa', 0.15], ['Tienda Nube', 0.1]];
  const pickPlat = () => { let r = rnd(); for (const [p, w] of plataformas) { if ((r -= w) < 0) return p; } return 'Mercado Libre'; };
  const envios = { 'Mercado Libre': ['Flex', 'Colecta', 'Full'], 'WooCommerce': ['Vixan 24 h', 'OCA', 'Andreani'], 'Venta directa': ['Retiro en depósito', 'Vixan 24 h'], 'Tienda Nube': ['Vixan 24 h', 'Andreani'] };
  const transportistas = [['Ezequiel (moto)', '11 5521-3344'], ['Ramiro (utilitario)', '11 6612-0098'], ['OCA', '0800-999-7700'], ['Andreani', '0810-122-1111']];
  const N = 1100;
  for (let i = 0; i < N; i++) {
    const diasAtras = Math.floor(Math.pow(rnd(), 1.12) * 400);
    const fecha = new Date(hoy - diasAtras * DAY - int(0, 36000) * 1000);
    const plat = pickPlat();
    const cli = pick(clientes);
    const items = Array.from({ length: int(1, 4) }, () => { const p = pick(productos); return { sku: p.sku, nombre: p.nombre, cantidad: int(1, cli.canal === 'Mayorista' ? 12 : 3), precio: p.precio }; });
    const total = items.reduce((a, it) => a + it.cantidad * it.precio, 0);
    let estado;
    if (diasAtras > 6) estado = rnd() < 0.05 ? 'cancelado' : 'entregado';
    else if (diasAtras > 3) estado = pick(['enviado', 'entregado', 'entregado']);
    else if (diasAtras > 1) estado = pick(['para_despachar', 'enviado', 'para_armar']);
    else estado = pick(['pendiente', 'para_armar', 'para_despachar']);
    const tipo = pick(envios[plat]);
    const tr = tipo === 'OCA' ? transportistas[2] : tipo === 'Andreani' ? transportistas[3] : pick(transportistas.slice(0, 2));
    C('pedidos', {
      numero: plat === 'Mercado Libre' ? `ML-2000${int(10000000, 99999999)}` : plat === 'WooCommerce' ? `WC-${5200 + i}` : `VG-${1001 + i}`,
      fecha: fecha.toISOString(), plataforma: plat, cuenta: plat === 'Mercado Libre' ? 'INSUMOSDEMO' : plat, tipo_envio: tipo, cliente: cli.nombre, cliente_id: cli.id,
      items, total, deposito: tipo === 'Full' ? 'Fulfillment ML' : 'Central', pago: estado === 'pendiente' && rnd() > 0.5 ? 'Pendiente' : 'Pagado',
      metodo_pago: plat === 'Mercado Libre' ? 'Mercado Pago' : pick(['Transferencia', 'Mercado Pago', 'Efectivo contra entrega']),
      estado, tracking: ['enviado', 'entregado'].includes(estado) && rnd() > 0.04 ? `VG${String(100000 + i)}` : '',
      direccion: cli.direccion, localidad: cli.localidad, cp: cli.cp, telefono: cli.telefono, transportista: tr[0], tel_transportista: tr[1],
      eta: ymd(fecha.getTime() + int(1, 4) * DAY), comision: plat === 'Mercado Libre' ? Math.round(total * 0.14) : plat === 'Tienda Nube' ? Math.round(total * 0.03) : 0,
      costo_envio: tipo === 'Flex' || tipo === 'Vixan 24 h' ? 4200 : tipo === 'Retiro en depósito' ? 0 : int(5500, 9500), impuestos: Math.round(total * 0.03),
    });
  }

  const pedidosEntregados = store.list(t, 'pedidos').filter((p) => p.estado === 'entregado').slice(0, 60);
  for (const p of pedidosEntregados) C('comprobantes', { pedido: p.numero, cliente: p.cliente, estado: 'Entregado', transportista: p.transportista, usuario: 'Ana', fecha: p.eta, recibio: p.cliente.split(' ')[0], dni: `${int(20, 45)}.${int(100, 999)}.${int(100, 999)}` });
  for (const p of store.list(t, 'pedidos').filter((p) => p.estado === 'entregado').slice(0, 150)) C('facturas', { pedido: p.numero, pedido_id: p.id, fecha: ymd(p.fecha), cliente: p.cliente, plataforma: p.plataforma, tipo: 'B', numero: `0003-${String(int(1, 99999)).padStart(8, '0')}`, total: p.total, alicuota: 21, estado: 'emitida' });

  // Auditoría de reingresos
  for (const p of store.list(t, 'pedidos').filter((p) => p.estado === 'cancelado').slice(0, 6)) C('auditoria', { pedido: p.numero, pedido_id: p.id, fecha: p.fecha, cliente: p.cliente, plataforma: p.plataforma, productos: p.items.map((i) => `${i.cantidad}× ${i.sku}`).join(', '), total: p.total, estado: 'pendiente' });

  // Compras, CC proveedores, OCs
  proveedores.forEach((prov, pi) => {
    for (let k = 0; k < 6; k++) {
      const f = hoy - int(2, 120) * DAY;
      const monto = int(250, 1800) * 1000;
      const nro = `${String(int(1, 9)).padStart(4, '0')}-${String(int(1000, 99999)).padStart(8, '0')}`;
      C('cc_proveedores', { proveedor_id: prov.id, fecha: ymd(f), tipo_factura: 'A', nro_factura: nro, concepto: 'Compra de mercadería', debito: monto, credito: 0 });
      C('ordenes_compra', { fecha: ymd(f), nro_factura: nro, proveedor: prov.nombre_fantasia, proveedor_id: prov.id, total: monto, deposito: 'Central', estado: 'Recibida', vencimiento: ymd(f + (prov.plazo_pago_dias || 0) * DAY) });
      if (rnd() > 0.45) C('cc_proveedores', { proveedor_id: prov.id, fecha: ymd(f + int(5, 40) * DAY), concepto: 'Pago por transferencia', debito: 0, credito: monto });
    }
    C('ordenes_reabastecimiento', { numero: `OC-0000${pi + 1}`, fecha: ymd(hoy - int(1, 10) * DAY), proveedor: prov.nombre_fantasia, proveedor_id: prov.id, items: [], total: int(300, 900) * 1000, estado: pick(['Borrador', 'Enviada', 'Parcial']), entrega: ymd(hoy + int(2, 15) * DAY) });
  });

  // Caja, bancos, retenciones
  for (const [nombre, tipo, alias] of [['Banco Galicia', 'Banco', 'INSUMOS.DEMO.GALICIA'], ['Mercado Pago', 'Billetera', 'insumos.demo.mp'], ['Caja chica', 'Efectivo', '—']]) C('bancos', { nombre, tipo, alias, notas: '' });
  const cats = [['Gasto', 'Alquiler depósito', -850000], ['Gasto', 'Sueldos', -2400000], ['Gasto', 'Servicios (luz, internet)', -145000], ['Ingreso', 'Aporte de socio', 1500000], ['Gasto', 'Combustible', -96000], ['Ingreso', 'Venta sin pedido', 230000], ['Gasto', 'Publicidad Meta', -310000]];
  for (let m = 0; m < 3; m++) for (const [tipo, concepto, monto] of cats) C('caja_movimientos', { fecha: ymd(hoy - (m * 30 + int(0, 25)) * DAY), tipo, categoria: tipo === 'Gasto' ? 'Gastos operativos' : 'Otros ingresos', concepto, monto: Math.round(monto * (0.85 + rnd() * 0.3)), metodo: pick(['Transferencia', 'Mercado Pago', 'Efectivo']), origen: 'Manual', confirmado: true });
  for (let k = 0; k < 25; k++) C('retenciones', { fecha: ymd(hoy - int(0, 90) * DAY), tipo: pick(['Percepción IIBB', 'Retención IIBB', 'Retención Ganancias', 'Percepción IVA']), jurisdiccion: pick(['CABA', 'Buenos Aires', 'Córdoba', 'Nacional']), pedido: `ML-2000${int(10000000, 99999999)}`, payment_id: String(int(10000000000, 99999999999)), monto: int(800, 15000) });

  // Presupuestos, listas, combos
  for (let k = 0; k < 8; k++) { const cli = pick(clientes); const items = [pick(productos), pick(productos)].map((p) => ({ sku: p.sku, nombre: p.nombre, cantidad: int(2, 10), precio: p.precio })); C('presupuestos', { numero: `P-${String(k + 1).padStart(4, '0')}`, fecha: ymd(hoy - int(0, 30) * DAY), cliente: cli.nombre, items, total: items.reduce((a, i) => a + i.cantidad * i.precio, 0), estado: pick(['Enviado', 'Aceptado', 'Borrador', 'Vencido']) }); }
  for (const [nombre, tipo, markup, uso] of [['Minorista', 'Markup sobre costo', 45, 'Mercado Libre, Tienda'], ['Mayorista', 'Markup sobre costo', 25, 'Venta directa'], ['Gastronomía', 'Markup sobre costo', 32, 'Venta directa'], ['Reventa sellers', 'Markup sobre costo', 15, 'Venta entre sellers']]) C('listas_precio', { nombre, tipo, markup, uso, estado: 'Activa' });
  C('productos', { sku: 'CB-001', nombre: 'Kit pastelero inicial', tipo: 'combo', componentes: [{ sku: 'VG-1001', cantidad: 1 }, { sku: 'VG-1003', cantidad: 1 }, { sku: 'VG-1013', cantidad: 1 }], costo: 28000, markup: 45 });
  C('productos', { sku: 'CB-002', nombre: 'Kit chocolatería', tipo: 'combo', componentes: [{ sku: 'VG-1008', cantidad: 1 }, { sku: 'VG-1010', cantidad: 2 }], costo: 58600, markup: 45 });
  C('productos', { sku: 'CJ-6', nombre: 'Caja x6 dulce de leche 10 kg', tipo: 'caja', componentes: [{ sku: 'VG-1005', cantidad: 6 }], costo: 163200, markup: 25 });

  // Integraciones, comunicación, tienda
  for (const [canal, cuenta, estado] of [['Mercado Libre', 'INSUMOSDEMO', 'Conectada'], ['WooCommerce', 'tienda-demo.com.ar', 'Conectada'], ['Tienda Nube', 'insumosdemo.mitiendanube.com', 'Para revisar'], ['Shopify', '—', 'Sin conectar'], ['VTEX', '—', 'Sin conectar']]) C('integraciones', { canal, cuenta, estado, ultima_sync: estado === 'Conectada' ? new Date(hoy - int(1, 50) * 60000).toISOString() : '' });
  for (const p of productos.slice(0, 18)) C('publicaciones', { canal: 'Mercado Libre', item_id: `MLA${int(1000000000, 1999999999)}`, sku: p.sku, titulo: p.nombre, precio: Math.round(p.precio * 1.18), stock_publicado: int(0, 40), sync: rnd() > 0.2, estado: rnd() > 0.15 ? 'Activa' : 'Pausada' });
  for (const cli of clientes.slice(0, 10)) C('wa_conversaciones', { contacto: cli.nombre, telefono: cli.telefono, ultimo_mensaje: pick(['¿Tienen stock de cobertura blanca?', 'Gracias, llegó perfecto', '¿Hacen envíos a Morón?', '¿Me pasan el CBU?', 'Necesito factura A']), fecha: new Date(hoy - int(1, 4000) * 60000).toISOString(), estado: pick(['No leído', 'Sin responder', 'Respondido', 'Cerrada']) });
  C('wa_envios', { nombre: 'Promo cobertura noviembre', audiencia: 'Gastronomía', enviados: 214, respuestas: 31, estado: 'Enviado', fecha: ymd(hoy - 6 * DAY) });
  C('mail_campanas', { asunto: 'Nuevos precios mayoristas', audiencia: 'Mayoristas', enviados: 412, aperturas: 188, clics: 47, bajas: 2, estado: 'Enviada', fecha: ymd(hoy - 12 * DAY) });
  C('mail_campanas', { asunto: 'Kit navideño 2026', audiencia: 'Todos los compradores', enviados: 0, aperturas: 0, clics: 0, bajas: 0, estado: 'Borrador', fecha: '' });
  C('mail_audiencias', { nombre: 'Mayoristas', contactos: 412, origen: 'Clientes (canal Mayorista)' });
  C('mail_audiencias', { nombre: 'Todos los compradores', contactos: 1923, origen: 'Pedidos' });
  C('tienda_promos', { sku: 'VG-1008', tipo: 'Porcentaje', valor: 10, desde: ymd(hoy - 5 * DAY), hasta: ymd(hoy + 10 * DAY), etiqueta: 'Semana del chocolate', activa: true });
  for (const p of productos.slice(0, 6)) C('reventa_ofertas', { sku: p.sku, producto: p.nombre, precio_mayorista: Math.round(p.costo * 1.15), stock: int(10, 80), ofrecido: true, vendido_mes: int(0, 20) });
  C('reventa_liquidaciones', { periodo: '2026-10', seller: 'Almacén Natural (seller)', unidades: 34, monto: 612000, estado: 'Pagada' });
  C('tickets_soporte', { asunto: 'No sincroniza stock con ML', estado: 'Resuelto', fecha: ymd(hoy - 9 * DAY), prioridad: 'Media' });
  for (const c of ['Ventas', 'Costo de mercadería', 'Comisiones de plataforma', 'Envíos', 'Sueldos', 'Alquileres', 'Servicios', 'Publicidad', 'Impuestos', 'Aportes de socios']) C('cuentas_contables', { nombre: c, tipo: ['Ventas', 'Aportes de socios'].includes(c) ? 'Ingreso' : 'Egreso' });
  store.setSetting(t, `objetivo_${ymd(hoy).slice(0, 7)}`, 45000000);
  store.setSetting(t, 'facturacion', { razon_social: 'Insumos Demo SRL', cuit: '30-71888999-1', condicion_iva: 'Responsable Inscripto', punto_venta: 3, domicilio: 'Av. Siempreviva 742, CABA', inicio_act: '2020-03-01', alicuota_default: '21' });
  store.setSetting(t, 'descuentos_pago', [{ metodo: 'Efectivo', tipo: '%', valor: 10 }, { metodo: 'Transferencia', tipo: '%', valor: 5 }]);
  store.setSetting(t, 'costo_logistico_pedido', 1500);
  store.setSetting(t, 'porcentaje_facturacion', 2);
}

function ensureSeed() {
  const hay = store.db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (hay) return;
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@vixan.com';
  const adminPass = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  // Si la clave viene del .env no se imprime: quedaría guardada en el registro del servidor
  const claveVisible = process.env.ADMIN_PASSWORD ? '(la de ADMIN_PASSWORD en el archivo .env)' : adminPass;
  store.db.prepare('INSERT INTO users (tenant_id, email, nombre, rol, pass_hash) VALUES (NULL,?,?,?,?)').run(adminEmail, 'Administrador Vixan', 'superadmin', store.hashPassword(adminPass));
  // En un servidor público no se crea el cliente demo (su clave demo1234 sería un riesgo): VIXAN_DEMO=0
  if (process.env.VIXAN_DEMO === '0') {
    const t = store.db.prepare('INSERT INTO tenants (nombre, slug, plan, webhook_key) VALUES (?,?,?,?)').run(process.env.VIXAN_PRIMER_CLIENTE || 'Cuenta principal', 'cuenta-principal', 'pro', crypto.randomBytes(16).toString('hex'));
    store.create(Number(t.lastInsertRowid), 'depositos', { nombre: 'Central', dentro_de: '', para: 'Venta', se_vende: true, estado: 'Abierto' });
    console.log('──────────────────────────────────────────────');
    console.log(' Base creada vacía (sin datos de ejemplo).');
    console.log(` Superadmin: ${adminEmail} / ${claveVisible}`);
    console.log('──────────────────────────────────────────────');
    return;
  }
  const t = store.db.prepare('INSERT INTO tenants (nombre, slug, plan, webhook_key) VALUES (?,?,?,?)').run('Insumos Demo', 'insumos-demo', 'pro', crypto.randomBytes(16).toString('hex'));
  const tid = Number(t.lastInsertRowid);
  store.db.prepare('INSERT INTO users (tenant_id, email, nombre, rol, pass_hash) VALUES (?,?,?,?,?)').run(tid, 'demo@vixan.com', 'Insumos', 'admin', store.hashPassword('demo1234'));
  seedDemo(tid);
  console.log('──────────────────────────────────────────────');
  console.log(' Base creada con datos de ejemplo.');
  console.log(` Superadmin: ${adminEmail} / ${claveVisible}`);
  console.log(' Cliente demo: demo@vixan.com / demo1234');
  console.log('──────────────────────────────────────────────');
}

module.exports = { ensureSeed, seedDemo };
