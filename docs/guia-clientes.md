# Vixan — Guía para clientes

## Qué es Vixan

Vixan reúne en un solo lugar tus pedidos de Mercado Libre, WooCommerce y otros canales, y te deja despacharlos, controlar el stock, manejar compras y ver cuánto ganás. Tu cuenta es privada: nadie más ve tus datos.

Hay dos tipos de usuario en tu cuenta:

| Rol | Qué puede hacer |
| --- | --- |
| Admin | Todo: usar los módulos, crear usuarios y cambiar la configuración |
| Operador | El trabajo diario (pedidos, despachos, stock), sin tocar usuarios ni configuración |

## Ingresar

1. Abrí en Chrome o Edge el link de Vixan que te pasamos.
2. Escribí tu email y la contraseña inicial que te enviamos.
3. Tocá **Ingresar**. Ves el Inicio con el resumen de tu operación.

La sesión queda abierta 14 días en esa computadora. Para salir, tocá **Cerrar sesión** abajo a la izquierda. Si usás una computadora compartida, cerrá sesión siempre al terminar.

Para cambiar tu contraseña, tocá **Cambiar contraseña** abajo a la izquierda. Pide la actual y una nueva de al menos 10 caracteres, y cierra tus sesiones abiertas en otros equipos.

## Usuarios de tu cuenta

Si sos admin, manejás los usuarios desde **Configuración → Usuarios**.

- **Crear:** + Nuevo usuario → nombre, email, rol y contraseña inicial (mínimo 8 caracteres).
- **Cambiar la clave:** botón Cambiar clave en la fila del usuario.
- **Dar de baja:** Desactivar. El usuario no puede entrar, pero su historial queda. Activar lo devuelve.

Usá **Operador** para quien solo carga y despacha pedidos, y **Admin** para quien maneja la cuenta.

## Tareas del día a día

**Despachar pedidos**

Cada pedido pasa por estos estados: Pendiente → Para armar → Para despachar → Enviado → Entregado. Cuando un pedido pasa a Enviado, el sistema descuenta el stock solo.

1. En **Pedidos**, tocá el chip del estado que querés ver (por ejemplo, Para armar).
2. Tocá un pedido para ver su detalle y cambiarle el estado, o tildá varios y usá **→ Pasar a…** para moverlos juntos.

**Imprimir etiquetas y remitos**

1. En **Pedidos**, tildá los pedidos.
2. Elegí el formato: **A4** (remito con precios), **A4 sin precios** (para el transporte) o **Ticket 10x15** (etiqueta de envío).
3. Se abre una ventana para imprimir. Si no aparece, permití las ventanas emergentes en el navegador.

**Cargar mercadería que entra**

1. En **Inventario y lotes → Gestión de lotes**, tocá **+ Nuevo lote**.
2. Elegí el producto y completá cantidad, costo, vencimiento y depósito.

**Si se cancela un pedido ya despachado:** el stock no vuelve solo. Aparece en **Auditoría**, donde un admin aprueba el reingreso cuando la mercadería vuelve al depósito.

## Conectar tu tienda WooCommerce

Lo que une un producto de tu tienda con uno de Vixan es el **SKU**: tiene que ser idéntico en los dos lados. Revisá que cada producto, y cada variante, tenga SKU en WooCommerce.

1. En WordPress, andá a **WooCommerce → Ajustes → Avanzado → API REST → Añadir clave**. Elegí un usuario administrador y permisos **Lectura/Escritura**. Copiá la consumer key y la consumer secret: la secret se muestra una sola vez.
2. En Vixan, andá a **Integraciones → WooCommerce**, cargá la URL de tu tienda y las dos claves, marcá las dos opciones y tocá **Guardar**.
3. **1. Productos:** tocá **Importar productos**. Si querés, Vixan toma como stock inicial la cantidad que tiene cada producto en la tienda.
4. **2. Pedidos:** tocá **Sincronizar pedidos**. La primera vez trae todo el historial.
5. **3. Clientes:** si tu checkout pide DNI/CUIT o condición de IVA (por ejemplo, con Checkout Field Editor), tocá **detectar / cambiar**, revisá que Vixan haya elegido bien esos campos y tocá **Guardar**. Después tocá **Importar clientes**: trae a todos los compradores, con o sin cuenta, sin duplicarlos (los reconoce por email).
6. Completá costo, marca y proveedor de cada producto en **Catálogo y precios**.

Desde ahí, Vixan trae los pedidos nuevos cada 5 minutos, crea o vincula el cliente de cada uno con el DNI/CUIT del checkout y le actualiza el stock a tu tienda cada vez que cambia. **El stock se maneja en Vixan:** si lo cambiás a mano en WooCommerce, Vixan lo vuelve a pisar.

## Catálogo y precios

En **Productos y stock → Catálogo y precios** hay seis pestañas. Arriba de cada tabla podés filtrar por fabricante, marca y categoría, y con **Mostrar** ver solo unidades, combos, cajas o presentaciones.

**Catálogo.** La lista de todos tus productos con su precio y el stock que se puede vender. **Detalles** muestra la ficha completa: costos, margen y el precio en cada lista. Los botones de arriba:

- **+ Crear producto**: SKU, nombre, fabricante, marca, categoría, costo, peso y medidas (sirven para cotizar envíos).
- **🔄 Recalcular precios**: vuelve a calcular el precio de todo lo que tiene markup y le pone a cada combo y caja la suma de sus componentes. Los precios fijos no se tocan.
- **🏷️ Categorías**: crear categorías y asignarlas en masa a lo que se ve en la tabla, a una marca, a un fabricante o a los que no tienen.
- **Exportar por lista de precios**: un Excel o PDF con una columna de precios por cada lista que marques.

**Costos.** El costo de cada producto puede ir en pesos o en **dólares**: Vixan lo multiplica por el dólar oficial del día (Banco Nación, venta), que se actualiza solo, o por uno que cargues a mano con **Cambiar**. **Pasar a pesos** deja fijo el costo en pesos de hoy. Los **costos internos (%)** suman lo que te cuesta cada producto además del proveedor (embalaje, flete, etc.); si dejás la celda vacía usa el **general**. Escribí en las celdas y tocá **Guardar cambios**. El aviso **bajo el piso de margen** marca los productos cuyo precio no cubre el costo final más el markup mínimo que elijas con **Piso**.

**Listas de precios.** Elegí la lista arriba:

- **Precio general** (el de la ficha): cada producto tiene un **precio fijo** o un **markup** sobre el costo final. Si escribís el markup, el precio sigue al costo cuando éste cambia. **Markup general → Aplicar a todos** pone el mismo a todo el catálogo.
- **Listas de precio propio**: escribís el precio de cada producto; al lado ves el costo y el margen.
- **Listas calculadas**: salen solas del costo, del precio general o de otra lista, más un porcentaje (o menos, si es descuento) y con el redondeo que elijas (por ejemplo, terminación 99). Se crean y cambian en **Administrar listas**.

Porcentajes: 45 se escribe 45, no 0,45. Al lado de cada precio ves a qué markup equivale y el margen sobre la venta.

**Combos.** Un combo se arma con otros productos (un pack x5, un kit). **+ Nuevo combo**: nombre, SKU, buscás cada componente y su cantidad, y opcionalmente un markup. No tiene stock propio: se puede vender mientras haya de todos sus componentes, y al despacharlo se descuentan los componentes. **Revisar** avisa si el costo guardado no coincide con la suma de los componentes; en **Detalles → Editar → Guardar y reparar** se corrige.

**Cajas.** Funcionan igual que los combos, pensadas para bultos cerrados (caja x12 para mayoristas). Un combo se puede convertir en caja y al revés desde **Detalles**.

**Fraccionados.** Para lo que comprás entero y vendés también por partes (una bolsa de 500 g que se vende en 250, 100 y 25 g). **+ Nuevo fraccionado**: elegís el producto entero, cuánto trae y la porción más chica; **Sugerir las habituales** arma las presentaciones (mitad, quinto, décimo…). Cada presentación es un producto con su SKU que podés publicar en la tienda. Su precio es la parte proporcional del entero más un **recargo** (vacío = el habitual: mitad +10 %, quinto +15 %, décimo +30 %, veinteavo +50 %). Al venderla se descuenta su parte del producto entero, así que el stock del entero puede quedar con decimales (por ejemplo 19,5 bolsas). Si una presentación ya existía como producto suelto con stock, ese stock pasa al entero.

## Importar productos desde Excel o CSV

En **Catálogo → 📥 Importar desde Excel/CSV** cargás muchos productos de una vez.

1. Armá un Excel (.xlsx) o CSV con **una fila por producto** y los títulos en la primera fila. Con **Descargar plantilla** bajás uno de ejemplo.
2. Columnas que reconoce: SKU, Nombre, Categoría, Subcategoría, Precio, Precio anterior, Se vende por bulto de, Novedad, Stock, Costo, Marca, Fabricante, Código de barras, Peso, Descripción y Fotos (direcciones https separadas por espacio). Solo el **SKU** es obligatorio, y el **nombre** si el producto es nuevo. Los precios pueden ir como `12900`, `12.900` o `12.900,50`.
3. Elegí el archivo y tocá **Revisar archivo**: muestra cuántos productos son nuevos, cuáles se actualizan, el stock inicial y las filas con errores (con el número de fila del Excel), **sin cambiar nada todavía**.
4. Si está bien, tocá **Importar**.

Opciones:
- **Publicar en la tienda**: marca todos los productos del archivo para la tienda online.
- **Stock inicial**: la columna Stock entra como un lote en el depósito elegido, **solo en productos nuevos** (si el SKU ya existía no se suma, para no duplicar stock).
- **Actualizar existentes**: si el SKU ya está en Vixan, se actualiza con los datos del archivo. Las celdas vacías no borran nada.

Sirve también para actualizar precios en masa: exportá el catálogo, cambiá los precios en Excel y volvé a importarlo. Los archivos .xls muy antiguos hay que guardarlos antes como .xlsx o CSV.

## Tu tienda online

Si tenés tienda online de Vixan, muestra los productos que marcás para publicar, con el precio de la lista que elijas y el stock disponible.

- **Qué productos se ven**: en **Catálogo**, editá el producto y marcá **Publicar en la tienda**. Los productos sin precio en la lista de la tienda no se muestran.
- **Datos para la tienda** (en la misma ficha): subcategoría, venta por bulto (por ejemplo de a 6 unidades), precio anterior para mostrarlo como oferta, novedad, descripción y fotos (una dirección https por línea).
- **Lista de precios**: en **Vixan Market → Mi tienda**. Ahí también ves cuántos productos están publicados y **Ver qué publica** muestra la lista exacta.
- **Ocultar productos** sin desmarcarlos: cargá sus SKU en **SKUs que no se muestran en la tienda**.

## Facturar con ARCA

Vixan emite facturas A, B o C con CAE a nombre de tu CUIT. La conexión se configura una sola vez, en **Configuración → Facturación electrónica (ARCA)**, y conviene empezar en **modo prueba**, donde las facturas no tienen validez fiscal.

**Configurar la conexión (una vez por ambiente):**

1. En **Datos de facturación**, cargá razón social, CUIT, condición frente al IVA y un punto de venta habilitado para "Web Services" en ARCA.
2. Seguí los pasos A a F de abajo para crear el certificado de prueba. Después, para facturar en serio, los de producción.

### Certificado de prueba (homologación), paso a paso

WSASS, el servicio de ARCA para certificados de prueba, no se puede delegar: hay que entrar con la **clave fiscal de persona física**, no con la de una empresa. Si facturás como empresa, entrá con tu CUIT personal y en el paso E indicás que representás a la empresa.

**A. Agregar WSASS a tu cuenta de ARCA (una sola vez)**

1. Entrá a arca.gob.ar con tu CUIT personal y tu clave fiscal.
2. Abrí **Administrador de Relaciones de Clave Fiscal**.
3. Tocá **Adherir servicio** y elegí **ARCA → Servicios interactivos → WSASS - Autogestión Certificados Homologación**. Confirmá.
4. Cerrá sesión y volvé a entrar: WSASS aparece en tus servicios.

**B. Generar el pedido en Vixan**

1. En Vixan, andá a **Configuración → Facturación electrónica (ARCA)** y dejá el ambiente en **Prueba (homologación)**.
2. Tocá **Generar pedido de certificado**. Se descarga un archivo `vixan-XXXXXXXXXXX.csr`.
3. Buscalo en Descargas, clic derecho → **Abrir con → Bloc de notas**, y copiá **todo** el texto, incluidas las líneas `-----BEGIN CERTIFICATE REQUEST-----` y `-----END CERTIFICATE REQUEST-----`.

**C. Crear el certificado en WSASS**

1. En ARCA, abrí **WSASS** y en el menú elegí **Nuevo Certificado**.
2. En el nombre simbólico escribí `vixan`.
3. En el campo de la solicitud de certificado (formato PKCS#10), pegá el texto que copiaste.
4. Tocá el botón para crear el certificado.
5. Copiá **todo** el certificado que te muestra, desde `-----BEGIN CERTIFICATE-----` hasta `-----END CERTIFICATE-----`.

**D. Cargarlo en Vixan**

1. En Vixan, en el **paso 3 (Certificado de ARCA)**, pegá el texto en el recuadro.
2. Tocá **Guardar certificado**. Tiene que aparecer la fecha de vencimiento.

**E. Autorizar el certificado para facturar**

1. En WSASS, andá a **Crear autorización a servicio**.
2. En el nombre del certificado elegí `vixan`.
3. En **CUIT representada** poné el mismo CUIT que cargaste en Vixan en Datos de facturación.
4. En **Servicio al que desea acceder**, elegí **wsfe** (Facturación Electrónica).
5. Tocá **Crear autorización de acceso**. Para confirmar que quedó creada, entrá en **Autorizaciones**.

**F. Probar**

En Vixan, tocá **Probar conexión con ARCA**. Si dice "Conexión OK", ya podés emitir facturas de prueba.

### Certificado de producción (facturas reales)

Los certificados de WSASS no sirven para producción. Cuando las facturas de prueba salgan bien:

1. En Vixan, cambiá el ambiente a **Producción** y tocá **Generar pedido de certificado** otra vez.
2. En ARCA, abrí **Administración de Certificados Digitales**, agregá un alias (por ejemplo `vixan`), subí el `.csr` y descargá el certificado.
3. Cargalo en Vixan, en el paso 3.
4. En **Administrador de Relaciones de Clave Fiscal → Nueva relación → ARCA → WebServices → Facturación Electrónica**, elegí como representante el certificado `vixan`.
5. En **Administración de puntos de venta y domicilios**, creá un punto de venta del tipo **Factura Electrónica – Web Services** y cargá ese número en Datos de facturación.
6. Tocá **Probar conexión con ARCA**.

### Si da error al probar

- **"600 ValidacionDeToken"**: el certificado no representa a ese CUIT. Revisá que la CUIT representada (paso E) sea la misma que la de Datos de facturación.
- **"Este certificado no corresponde a la clave generada en Vixan"**: generaste un pedido nuevo después de crear el certificado. Usá el `.csr` más reciente y repetí los pasos C y D.
- **"El certificado no está autorizado para facturar"**: falta el paso E (prueba) o la relación del paso 4 (producción).

Más información en el [manual de WSASS de ARCA](https://www.afip.gob.ar/ws/WSASS/html/introduccion.html).

### Logo, percepción de IVA y aviso de deuda

- **Logo:** en **Configuración → Datos de facturación**, tocá **Subir logo** y elegí una imagen PNG o JPG de tu computadora. Sale en facturas, notas de crédito y débito, y remitos. Ahí mismo está **Email CC**, el correo que va en copia cuando Vixan mande comprobantes por mail.
- **Percepción de IVA:** en **Configuración → Percepción y deuda**, activala y cargá la alícuota (y la reducida para lo gravado al 10,5 %), el mínimo de percepción, el mínimo de venta y desde qué fecha. Se aplica a facturas A (por defecto sólo a Responsables Inscriptos), se suma al total y entra a los libros. En la factura manual aparece la casilla **Percepción de IVA**: se tilda sola cuando corresponde y se puede destildar. Confirmá la alícuota con tu contador.
- **Aviso de deuda:** en la misma pestaña, activá **Avisar cuando un cliente tiene deuda** y elegí qué canales cuentan. Al cargar un pedido aparece un cartel si el cliente tiene pedidos impagos (no impide tomarlo). Mercado Libre nunca cuenta.
- **Nota de crédito automática:** también se prende desde esa pestaña.

### Facturar

1. Revisá que cada cliente tenga su **condición frente al IVA** y su CUIT o DNI. Los pedidos de WooCommerce los traen solos del checkout; los de otros canales se cargan en **Clientes → Datos de clientes**. Si un cliente no tiene datos, se lo factura como Consumidor Final.
2. En **Facturación → Facturación**, elegí el período (o tocá **‹ Mes / Este mes / Mes ›**). Arriba hay seis tarjetas: sin facturar, facturado (con el % de lo facturable), facturable del período, notas de crédito, cancelados y lo emitido según ARCA. Tocar una tarjeta filtra la tabla.
3. Tildá los pedidos y tocá **Facturar seleccionadas**, o **Facturar todo** para los pendientes del filtro. También podés usar **Emitir factura** en cada fila. La letra se elige sola: si sos Responsable Inscripto, A para Responsables Inscriptos y Monotributistas y B para el resto; si sos Monotributista o Exento, C.
4. En **Comprobantes emitidos**, tocá **Imprimir** para ver la factura con el QR y guardarla como PDF.

### Factura manual, notas de crédito y de débito

**Factura manual** (para una venta sin pedido): elegí el tipo de comprobante (factura con letra automática, nota de crédito o nota de débito), el cliente y los renglones. Cada renglón lleva **precio neto** (sin IVA), su **alícuota** (21 %, 10,5 %, 27 %, 5 %, 2,5 % o 0 %) e **impuestos internos** si corresponde. Los totales se calculan solos. No toca el stock.

- Una **nota de débito** (por ejemplo, intereses por pago fuera de término) o una nota de crédito manual piden el **comprobante asociado** como punto de venta y número, por ejemplo `5-123`.
- **Anular (NC)** en Comprobantes emitidos acepta un **importe**: si es menor al total, es una nota de crédito parcial (se reparte entre las alícuotas de la factura). Con **NC (resto)** se anula lo que falta. Cuando las notas de crédito cubren el total, la factura queda anulada.
- **Manuales emitidas** lista las facturas manuales. **Traer de ARCA** recupera un comprobante que ARCA autorizó pero no quedó en Vixan (por ejemplo, si se cortó la conexión).
- **Buscar comprobantes faltantes** revisa la numeración: huecos y números que ARCA autorizó después del último que tiene Vixan. Cada uno se puede traer con un clic.

### Pedidos cancelados que ya tenían factura

**Canceladas con factura** muestra los pedidos cancelados con factura vigente. Tildalos y tocá **Emitir NC** para anularlas. Si activás **Nota de crédito automática**, Vixan la emite sola cada vez que un pedido facturado pasa a cancelado.

### Exportar facturas

**Exportar facturas** baja lo emitido del mes o de un rango, en Excel, PDF o texto:
- **Resumen**: un renglón por comprobante con neto e IVA al 21 %, 10,5 %, 27 % y otras alícuotas, no gravado, impuestos internos y total. Las notas de crédito van en negativo.
- **Detalle**: un renglón por producto de cada comprobante.

## Contabilidad

**Finanzas → Contabilidad** arma los libros a partir de lo que ya está en Vixan: facturas, compras, Flujo de caja, cheques, préstamos y bienes de uso. Casi todas las pestañas tienen arriba el período (desde, hasta y los botones **‹ Mes / Este mes / Mes ›**) y se exportan a Excel o CSV. Revisá todo con tu contador antes de presentar una declaración jurada.

**Lo primero: subir los datos de ARCA.** Cada mes, en ARCA → **Mis Comprobantes**, bajá **Emitidos** y **Recibidos** (CSV o Excel). Subilos en **Libro IVA Ventas** y **Libro IVA Compras** con el botón **Subir Mis Comprobantes**. Así entran las ventas que no pasaron por Vixan y las facturas de proveedores que no cargaste. Subir el mismo archivo dos veces no duplica nada.

| Pestaña | Qué muestra y qué se hace |
| --- | --- |
| Resumen | IVA del mes, créditos de IIBB, ventas sin factura y si están cargados los datos de ARCA. **Lo que hay que hacer** lista los pendientes. **Reporte para el contador** arma una hoja para imprimir o guardar como PDF |
| Posición mensual | Mes por mes: débito, crédito, saldo técnico y de libre disponibilidad que pasan al mes siguiente, percepciones y retenciones, IVA a pagar, impuestos internos e Ingresos Brutos |
| Libro IVA Compras | Las órdenes de compra con datos de factura y lo que sólo está en ARCA. Por defecto el IVA se computa sólo con factura A, M o despacho (se cambia en Tipos de impuesto) |
| Libro IVA Ventas | Las facturas de Vixan y las que sólo están en ARCA, con numeración y faltantes. Las facturas de prueba (homologación) no entran |
| Libro diario | Los asientos automáticos (ventas, compras, gastos, cheques, préstamos, bienes de uso) y los **asientos manuales** (sueldos, pago de impuestos, apertura, ajustes) |
| Mayor y saldos | Sumas y saldos de cada cuenta. Tocá una cuenta para ver su mayor con saldo inicial y final |
| Balance | Activo, pasivo, patrimonio y resultado a una fecha, y si la ecuación contable cuadra |
| Bienes de uso | Alta de cada bien (con su cuenta propia en el plan), amortización anual o mensual, venta o baja |
| Bancos | Subí el extracto del home banking; Vixan sugiere con qué coincide cada movimiento y concilia de una vez los de coincidencia alta |
| Cheques | Recibidos (en cartera, depositados, endosados, cobrados, rechazados) y emitidos; vencimientos de la semana y del mes |
| Préstamos | Simulación de cuotas (sistema francés o alemán, IVA sobre intereses, otros cargos), deuda de corto y largo plazo y pago de cada cuota |
| Provincias | Ventas por provincia para Ingresos Brutos (Convenio Multilateral). Cargá la alícuota de cada provincia para ver el estimado |
| Plan de cuentas | El plan modelo de Vixan o el tuyo: crear, renombrar o desactivar cuentas, y elegir a qué cuenta va cada asiento automático, cada categoría de gasto y cada proveedor que sólo está en ARCA |
| Tipos de impuesto | Cómo se trata cada impuesto y en qué mes entra una factura de compra |

**Para que las compras entren al Libro IVA Compras**, completá los datos de la factura en **Reabastecimiento → Compras recibidas**: tipo de comprobante, fecha, punto de venta, número, CUIT del proveedor, netos por alícuota, exento, percepciones y otros tributos. Una orden sin esos datos no entra al libro ni al diario (el Resumen avisa cuántas faltan).

**Archivos para IVA Simple**: en cualquiera de los dos libros, **Archivos para IVA Simple** baja un .zip con los cuatro archivos del Libro IVA Digital del mes (comprobantes y alícuotas de ventas y de compras) para importar en ARCA.

## Módulos del menú

Los módulos están agrupados como en el menú de la izquierda; con el buscador de arriba del menú encontrás cualquiera por nombre. Casi todas las tablas se pueden buscar, filtrar, ordenar tocando el título de la columna y exportar a Excel o PDF.

| Grupo | Módulo | Para qué sirve |
| --- | --- | --- |
| General | Inicio | Ventas del mes, pedidos por estado, objetivo, margen, alertas de stock |
| General | Pedidos | Todos los pedidos de todos los canales: detalle, cambio de estado, etiquetas y remitos |
| General | Transporte | Despachos Flex y otros, comprobantes de entrega, cotizador de envíos y seguimiento |
| General | Presupuestos | Presupuestos a clientes; el botón "→ Pedido" lo convierte en pedido |
| Ventas | Venta entre sellers | Productos que ofrecés para que otros vendedores revendan, y liquidaciones |
| Ventas | Vixan Market | Tu tienda online propia, sus pedidos y promociones |
| Ventas | WhatsApp | Conversaciones y envíos masivos |
| Ventas | Mails masivos | Campañas y audiencias |
| Productos y stock | Catálogo y precios | Productos, costos (en pesos o dólares), precios por lista, combos, fraccionados y cajas |
| Productos y stock | Listas de precios | Crear y administrar listas de precio propio o calculadas |
| Productos y stock | Inventario y lotes | Stock disponible, lotes con vencimiento, traspasos entre depósitos, movimientos y envíos a Full |
| Productos y stock | Depósitos | Depósitos y cuántas unidades hay en cada uno |
| Productos y stock | Proyecciones | Ritmo de venta, días de stock y cuánto reponer; crea órdenes de compra en borrador |
| Compras | Reabastecimiento | Órdenes de compra y facturas de compra recibidas |
| Compras | Proveedores | Proveedores, marcas y fabricantes, y qué proveedor abastece cada marca |
| Compras | CC proveedores | Cuánto le debés a cada proveedor, vencimientos y calendario de pagos |
| Finanzas | Facturación | Facturas A, B y C con CAE de ARCA, factura manual con varias alícuotas, notas de crédito y débito, faltantes, exportación e impresión con QR |
| Finanzas | Resultados | Ganancia real por pedido y por plataforma, descontando todos los costos |
| Finanzas | Cuenta corriente | Servicios logísticos a facturar y cobros en efectivo a rendir |
| Finanzas | Flujo de caja | Gastos, ingresos, cobranzas, deudores y cuentas bancarias |
| Finanzas | Impuestos | Retenciones, percepciones e IVA |
| Finanzas | Contabilidad | Posición de IVA, libros IVA con datos de ARCA, libro diario, mayor, balance, bienes de uso, bancos, cheques, préstamos, IIBB por provincia y plan de cuentas |
| Finanzas | Auditoría | Pedidos cancelados después de despachados: aprobar devuelve el stock |
| Clientes y canales | Clientes | Cartera (cuánto y cada cuánto compra cada uno) y datos de contacto |
| Clientes y canales | Integraciones | Conexión con Mercado Libre y WooCommerce: productos, pedidos, clientes y stock |
| Clientes y canales | Gestión de integraciones | Publicaciones de Mercado Libre y si su stock coincide con el real |
| Cuenta | Análisis por cuenta | Ventas y margen por cada cuenta conectada |
| Cuenta | Configuración | Datos de facturación, conexión con ARCA, usuarios, descuentos por pago, costos y API |
| Cuenta | Soporte | Tickets de ayuda a Vixan |

## Problemas frecuentes

| Qué pasa | Qué hacer |
| --- | --- |
| "Usuario o contraseña incorrectos" | Revisá mayúsculas y espacios. Si no recordás la clave, pedísela al admin de tu cuenta |
| "Demasiados intentos" | Por seguridad se bloquea 15 minutos después de 10 intentos fallidos. Esperá y probá de nuevo |
| "La cuenta está suspendida" | Contactá a Vixan |
| Las etiquetas o el PDF no se abren | El navegador bloqueó la ventana emergente: permitila para el sitio de Vixan |
| Un pedido de Mercado Libre o WooCommerce no aparece | Revisá en Integraciones que la cuenta figure como Conectada. Si lo está, abrí un ticket en Soporte |
| "Sin permiso" al guardar algo | Tu usuario es Operador; pedíle a un admin que lo haga |
| "Las claves no tienen permiso de escritura" (WooCommerce) | En WordPress, editá la clave de la API y cambiá los permisos a Lectura/Escritura. Revisá también que el usuario de la clave sea Administrador o Gestor de tienda |
| "Ya hay una sincronización con WooCommerce en curso" | La sincronización automática está trabajando. Esperá unos minutos y probá de nuevo |
| Los clientes de WooCommerce entran sin DNI/CUIT | En Integraciones → WooCommerce → 3. Clientes, tocá "detectar / cambiar", elegí el campo correcto y volvé a importar clientes |
| "El CUIT … no es válido" o "Para factura A el cliente tiene que tener CUIT" | Corregí el CUIT en la ficha del cliente (11 números) y volvé a facturar |
| "Desde $10.000.000 hay que identificar al consumidor final" | Cargale DNI o CUIT al cliente: ARCA lo exige en ventas de ese monto o más |
| "El certificado no está autorizado para facturar" | En ARCA, Administrador de Relaciones → Nueva relación → Facturación Electrónica, eligiendo el certificado de Vixan |
| "ARCA no respondió a tiempo" o "No se pudo conectar con ARCA" | Los servidores de ARCA a veces se caen. Esperá unos minutos y volvé a facturar: los pedidos que fallaron siguen como Pendiente |

Para cualquier otra cosa, abrí un ticket en **Soporte**.
