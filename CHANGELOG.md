# Cambios de Vixan

Cada versión nueva va arriba. El número sigue el formato MAYOR.MENOR.ARREGLO:
cambia el MENOR cuando se agregan funciones y el ARREGLO cuando solo se corrigen errores.
La versión instalada se ve en **Panel Vixan → Servidor**.

## 1.5.0 — 19/11/2026
**API para la tienda online (Vixan Market).** Primer paso de la tienda pública de cada cliente, que es una app aparte (repositorio `vixan-tienda`):
- API `/api/tienda/v1` con una clave propia (`VIXAN_TIENDA_KEY`) que solo abre estas rutas: no puede leer facturas, clientes ni proveedores.
- Cada tienda se reconoce por su link (`mitienda.vixan.com.ar`) o por su dominio propio. Link y dominio no se pueden repetir entre clientes.
- Catálogo público: productos publicados con precio de la lista elegida, promociones vigentes, stock disponible, fotos y descripción. Sin costos ni márgenes.
- Pedidos: Vixan calcula precios, envío y descuento por transferencia (no confía en lo que manda la tienda), controla stock y no duplica si la tienda reintenta. Crea o vincula el cliente por email o DNI/CUIT.
- Pago confirmado (controla que el monto coincida) y cancelación de pedidos impagos, que libera el stock.
- Fotos de productos (hasta 8, JPG/PNG/WebP de hasta 3 MB) y descripción para la tienda; logo de la tienda.
- "Mi tienda" elige entre las listas de precios reales y suma datos de transferencia y contacto.
- Aviso firmado a la tienda cuando cambian stock, precios, productos, promociones o configuración.
- Caddy puede preguntar a `/api/tienda/v1/dominio-ok` antes de sacar el certificado de un dominio propio.
- Primeras pruebas automáticas: `npm test`.

## 1.4.0 — 19/11/2026
**Catálogo y precios**, con las seis pestañas como en OnBox:
- **Catálogo**: filtros por fabricante, marca, categoría y tipo; ficha de cada producto con costos, margen y precio en cada lista; recalcular precios; categorías en masa; exportar por lista de precios (Excel o PDF).
- **Costos**: costo en pesos o en dólares (dólar oficial del día o cargado a mano), costos internos por producto o general, aviso de productos bajo el piso de margen.
- **Listas de precios**: precio general con precio fijo o markup; listas de precio propio y listas calculadas desde el costo, el precio general u otra lista, con redondeo.
- **Combos** y **Cajas**: se arman con otros productos, su stock se calcula con el de sus componentes y al despacharlos se descuentan los componentes. Aviso cuando el costo no coincide con la suma.
- **Fraccionados**: un producto entero que se vende también por partes, con recargo por presentación.
- Proyecciones y reposición cuentan lo vendido en combos y presentaciones como venta de sus componentes.
- Los combos y cajas de la versión anterior se pasan solos al catálogo.
- El código pasa a un repositorio de GitHub con control de versiones; las guías de ayuda viven en `docs/`.
- El servidor se actualiza con `git pull` (sin zip) y el Panel Vixan muestra la versión instalada.
- `deploy/volver.sh` vuelve el servidor a una versión anterior.
- `deploy/clave-superadmin.sh` pone una contraseña nueva al superadmin si se pierde.

## 1.3.1 — 19/11/2026
- Botón **Cambiar contraseña** abajo del menú.
- La contraseña del superadmin ya no queda escrita en el registro del servidor.
- Arreglo del **Error 524**: la sincronización con WooCommerce de tiendas grandes congelaba el sistema. Ahora 10.000 pedidos se procesan en un segundo y el sistema sigue respondiendo mientras tanto.

## 1.3.0 — 17/11/2026
- Instalación en servidor (DonWeb + Cloudflare) con `deploy/instalar.sh` y actualización con `deploy/actualizar.sh`.
- Copia de seguridad diaria en el servidor y descarga de copia desde el Panel Vixan.
- Logo definitivo de Vixan.
- Texto del ingreso: "Gestión integral para tu e-commerce".

## 1.2.0 — 15/11/2026
- Facturación electrónica con ARCA: facturas A, B y C con CAE, notas de crédito, comprobante con QR.
- Clientes de WooCommerce: importación, vinculación sin duplicados y DNI/CUIT del checkout.

## 1.1.0 — 12/11/2026
- Integración con WooCommerce: productos, pedidos, stock y sincronización automática.
- Cambio de nombre de Viciago a Vixan.

## 1.0.0 — 11/11/2026
- Primera versión: los 29 módulos, multicliente con roles.
