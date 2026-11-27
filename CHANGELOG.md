# Cambios de Vixan

Cada versión nueva va arriba. El número sigue el formato MAYOR.MENOR.ARREGLO:
cambia el MENOR cuando se agregan funciones y el ARREGLO cuando solo se corrigen errores.
La versión instalada se ve en **Panel Vixan → Servidor**.

## 1.10.1 — 27/11/2026
- Emails: si no se cargó "Nombre del remitente" en Correo para avisos, se usa el nombre de la tienda (antes el correo mostraba solo la parte del email antes de la @).

## 1.10.0 + Vixan Tienda 0.6.0 — 27/11/2026
**Compra online en la tienda (carrito, checkout y Mercado Pago)**:
- **Finalizar compra** para clientes con cuenta: entrega (retiro en depósito o envío a coordinar con dirección), forma de pago (Mercado Pago, transferencia o a coordinar), notas y resumen. Precios, descuento por volumen, IVA y stock se calculan en Vixan con la lista del cliente; si algo cambió (sin stock, sin precio, múltiplo) se muestra y "Ajustar mi pedido" lo corrige.
- El pedido entra a Vixan Market → Pedidos como **VT-…**, pendiente, **reserva stock**, con CUIT y condición de IVA para facturar, y renglones a precio final.
- **Mercado Pago (Checkout Pro)**: preferencia con vencimiento, vuelta a la tienda, notificaciones verificadas consultando el pago en Mercado Pago, pedido Pagado → Para armar automático, reintento de pago desde el detalle y cancelación automática de los impagos (48 h por defecto) que libera el stock.
- **Mis pedidos** y detalle del pedido en Mi cuenta, con datos para transferir o de retiro.
- Emails: pedido recibido (cliente y vendedor) y pago acreditado.
- **Mi tienda → Cobros y envíos**: formas de pago, Access Token de Mercado Pago (se valida al guardar y no viaja en la configuración general), datos de transferencia, retiro y condiciones de compra (mínimo, descuento, IVA) que se publican con el catálogo.
- Tienda: "Finalizar compra" en Mi pedido (WhatsApp queda como consulta), vuelta automática al checkout después de ingresar.

## Vixan Tienda 0.5.1 — 27/11/2026
- Los estilos y el comportamiento de la tienda llevan su versión en la dirección: después de publicar, el navegador y Cloudflare toman los archivos nuevos sin tener que apretar Ctrl + F5.

## 1.9.0 + Vixan Tienda 0.5.0 — 27/11/2026
**Cuentas de compradores en la tienda**:
- **Registro con aprobación**: el comercio se registra en la tienda con razón social, CUIT (se valida el dígito verificador), condición de IVA, contacto y dirección. Queda pendiente y se vincula con el cliente existente (por CUIT o email) o crea uno nuevo con la etiqueta Tienda.
- **Vixan Market → Compradores**: aprobar eligiendo la lista de precios, cambiar la lista, rechazar, bloquear, generar contraseña nueva y borrar la cuenta.
- **Precio según la lista del cliente**: al ingresar, la tienda reemplaza los precios de todas las páginas, la ficha, la búsqueda y el pedido guardado por los de su lista; lo que no tiene precio en su lista aparece como "Consultar precio". El pedido por WhatsApp incluye la razón social y el CUIT.
- **Mi cuenta** en la tienda: ingresar, crear cuenta, recuperar contraseña por email (enlace de 1 hora), cambiar contraseña y salir.
- **Correo para avisos** (Mi tienda): envío de emails por SMTP con la casilla de la cuenta (SSL 465 o STARTTLS 587), sin dependencias nuevas, con email de prueba. Avisa de cuentas nuevas, confirma la aprobación y envía los enlaces de contraseña. La contraseña del correo no viaja en la configuración general.
- Seguridad: la tienda habla con Vixan desde el navegador con un ID público y solo desde la dirección cargada en Mi tienda (CORS); sesión por token de 30 días; límite de intentos por IP; la recuperación no revela qué emails tienen cuenta.

## 1.8.0 — 27/11/2026
**Configuración**:
- **Logo como archivo** (Datos de facturación → Subir logo): se achica solo y sale en facturas, notas de crédito/débito y remitos. El remito usa la razón social de la cuenta.
- **Email CC** (copias al cliente) en Datos de facturación.
- Pestaña nueva **Percepción y deuda**:
  - **Percepción de IVA** (Tributo Id 6) en facturas A: alícuota general y reducida para lo gravado al 10,5 %, mínimo de percepción, mínimo de venta (sobre neto o total), desde una fecha, sólo a Responsables Inscriptos, excluir Mercado Libre, sólo productos comestibles. En la factura manual se tilda sola y se puede destildar. Las notas de crédito devuelven la percepción en proporción. Entra al Libro IVA Ventas, al archivo de IVA Simple, al diario ("Percepciones de IVA a depositar") y a la posición mensual.
  - **Aviso de deuda** al cargar un pedido, con los canales que cuentan (Mercado Libre nunca).
  - **Nota de crédito automática** al cancelar una venta facturada.
- Guardar Datos de facturación ya no borra otras opciones del mismo grupo.

## 1.7.1 — 27/11/2026
- Vista previa del enlace (WhatsApp, redes, buscadores): título "Vixan — Plataforma integral para e-commerce", descripción e imagen del logo.

## 1.7.0 — 27/11/2026
**Facturación** (Finanzas → Facturación):
- Panel por período con seis tarjetas (sin facturar, facturado, facturable, notas de crédito, cancelados y emitido según ARCA), filtros y "Facturar seleccionadas / Facturar todo".
- Factura manual con renglones a precio neto, varias alícuotas (21, 10,5, 27, 5, 2,5 y 0 %) e impuestos internos; notas de débito y notas de crédito manuales con comprobante asociado.
- Notas de crédito parciales (repartidas por alícuota) y "NC (resto)"; la factura queda anulada cuando se cubre el total.
- Comprobantes faltantes (huecos y autorizados en ARCA que no están en Vixan) y "Traer de ARCA" (FECompConsultar).
- Pedidos cancelados con factura: NC en lote y NC automática al cancelar.
- Exportar facturas: resumen por comprobante (netos e IVA por alícuota) o detalle por producto, en Excel, PDF o texto.
- Una factura B a un Responsable Inscripto o Monotributista se rechaza antes de ir a ARCA.

**Contabilidad** (Finanzas → Contabilidad), 14 pestañas:
- Resumen con tareas pendientes y reporte para el contador; posición mensual de IVA con saldo técnico y de libre disponibilidad que pasan de mes, IIBB e impuestos internos.
- Libros IVA Compras y Ventas que combinan lo de Vixan con "Mis Comprobantes" de ARCA (CSV o Excel, formato viejo y nuevo) y archivos del Libro IVA Digital (RG 4597) para IVA Simple.
- Libro diario con asientos automáticos y manuales, mayor y saldos, balance.
- Bienes de uso con cuenta propia y amortización anual o mensual; bancos con extracto y conciliación sugerida; cheques recibidos y emitidos; préstamos (francés o alemán, IVA sobre intereses).
- Ingresos Brutos por provincia (Convenio Multilateral) con alícuotas propias.
- Plan de cuentas modelo editable e imputación de los asientos automáticos por concepto, categoría de gasto y proveedor.
- Compras recibidas: nuevos datos de factura (tipo, número, CUIT, netos por alícuota, percepciones) para el Libro IVA Compras.
- Los pedidos de WooCommerce y Mercado Libre guardan la provincia.

## 1.6.0 — 24/11/2026
**Importar productos desde Excel o CSV** (Catálogo → 📥 Importar desde Excel/CSV):
- Lee .xlsx, .csv (separado por punto y coma, coma o tabulación) y la planilla .xls que exporta Vixan. Sin dependencias nuevas.
- Reconoce las columnas por su título: SKU, Nombre, Categoría, Subcategoría, Precio, Precio anterior, Se vende por bulto de, Novedad, Stock, Costo, Marca, Fabricante, Código de barras, Peso, Descripción y Fotos. Acepta precios con formato argentino.
- Primero revisa y muestra nuevos, actualizados, stock inicial, columnas ignoradas y errores por fila; recién después importa.
- Opciones: marcar para la tienda, cargar el stock inicial como lote (solo en productos nuevos) en el depósito elegido, y actualizar los productos que ya existen sin borrar datos con celdas vacías.
- Crea las categorías que falten, registra el movimiento de stock y avisa a WooCommerce si está conectado.
- Plantilla descargable.

## 1.5.0 + Vixan Tienda 0.4.0 — 24/11/2026
**Conexión de Vixan con Vixan Tienda**:
- **Clave de tienda**: se genera en **Vixan Market → Mi tienda** y solo puede leer el catálogo publicado (no ve pedidos, clientes ni el resto de la cuenta). Generar una nueva o desconectar anula la anterior.
- **Mi tienda**: lista de precios real (general o cualquiera de tus listas), dirección de la tienda, SKUs ocultos, cantidad de productos publicados, última conexión y "Ver qué publica".
- **Ficha de producto**: "Publicar en la tienda" (antes "Publicar en Vixan Market"), subcategoría, venta por bulto, precio anterior, novedad, descripción y fotos.
- Catálogo para la tienda en `GET /api/v1/tienda/catalogo` con precio de la lista elegida, stock disponible (combos, cajas y fraccionados calculados) y características.
- Las claves de API de una cuenta suspendida dejan de funcionar.
- **Vixan Tienda** lee el catálogo de Vixan (`"fuente": "vixan"`, clave en `VIXAN_TIENDA_CLAVE`), guarda una copia por si Vixan no responde, y en servidor con Node lo vuelve a leer cada 5 minutos. Categorías sin subcategorías muestran sus productos en la home.

## Vixan Tienda 0.3.1 — 24/11/2026
- Configuración por cliente en `tienda/clientes/<cliente>/` (`--config` en server, exportar y publicar) con carpeta de recursos propia (logo, favicon, banners).
- Favicon, ícono para celulares y color del navegador configurables.
- Primera tienda: **tutiendaconia.com.ar** (demostración con la identidad de Vixan, hosting DonWeb/Ferozo por FTP).

## Vixan Tienda 0.3.0 — 24/11/2026
**Versión estática para hostings compartidos (PHP, por FTP)**:
- `node exportar.js` genera toda la tienda como páginas HTML (home, categorías, productos, listados, mayoristas, 404, sitemap y `.htaccess`).
- `node publicar.js` la sube por FTP o FTPS y solo manda los archivos que cambiaron. `--probar` muestra qué haría sin tocar nada.
- Protección: si la carpeta del hosting tiene otro sitio, se detiene; nunca borra archivos que no subió la tienda.
- Búsqueda y orden de los listados en el navegador.

## Vixan Tienda 0.2.1 — 24/11/2026
- Instalador `tienda/deploy/instalar.sh` (Node 22, servicio propio, HTTPS con Caddy para el dominio y www, firewall) y `tienda/deploy/actualizar.sh`.
- Varias tiendas, y también Vixan, pueden convivir en el mismo servidor: cada tienda tiene su puerto y su archivo en `/etc/caddy/sitios/`. El instalador de Vixan ahora incluye esos archivos.

## Vixan Tienda 0.2.0 — 24/11/2026
**Página de producto** completa:
- Galería con contador, flechas, miniaturas, zoom al pasar el mouse y visor a pantalla completa.
- Código y modalidad, precio por unidad y por bulto, venta en múltiplos, stock con aviso de últimas unidades.
- Meta de compra inicial que avanza con el pedido y aviso de descuento por volumen.
- "Lo que tenés que saber", pago, envío, garantía y términos (textos editables en `config.json` → `compra`).
- Compartir en Facebook, X, LinkedIn, WhatsApp, Pinterest, email y copiar enlace.
- Descripción, tabla de características, ayuda por WhatsApp, productos relacionados y vistos recientemente.
- Opción `preciosSoloClientes` para ocultar precios a visitantes, barra fija de compra en celulares y datos para Google (schema.org).

## Vixan Tienda 0.1.0 — 24/11/2026
Primera versión de **Vixan Tienda** (carpeta `tienda/`), la vidriera que se instala en el servidor de cada cliente:
- Plantilla base con estilo neutro de Vixan, personalizable por cliente desde `config.json` (logo, colores, tipografía, avisos, banners, contacto, condiciones mayoristas).
- Home con barra de avisos, categorías con grilla de subcategorías, banners y bloques de ofertas; páginas de categoría, producto, búsqueda, ofertas, novedades, lo más pedido y mayoristas.
- Pedido con venta por bulto, compra mínima inicial, descuento por volumen e IVA, y envío por WhatsApp; favoritos; botón flotante de WhatsApp.
- Usa un catálogo de ejemplo hasta que exista la API pública de Vixan.

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
