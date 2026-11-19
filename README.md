# Vixan — plataforma de logística y gestión para e-commerce

Portal multicliente (SaaS) para ofrecer a tus clientes: pedidos de Mercado Libre, WooCommerce y otros canales en un solo lugar, despacho y etiquetas, stock por lotes y depósitos, compras y proveedores, finanzas y reportes.

## Documentación

- [Guía del dueño](docs/guia-dueno.md): servidor, actualizaciones, clientes y copias de seguridad.
- [Guía para clientes](docs/guia-clientes.md): uso diario, WooCommerce, catálogo y precios, ARCA.
- [CHANGELOG.md](CHANGELOG.md): qué cambió en cada versión.

## Actualizar el servidor

```
cd /root/vixan && git pull && bash deploy/actualizar.sh
```

## Qué incluye

**29 módulos navegables**, agrupados en el menú:

| Grupo | Módulos |
|---|---|
| General | Inicio (tablero), Pedidos, Transporte (Flex, otros despachos, comprobantes, cotizador, seguimiento), Presupuestos |
| Ventas | Venta entre sellers, Vixan Market (tienda propia), WhatsApp, Mails masivos |
| Productos y stock | Catálogo y precios, Listas de precios, Inventario y lotes, Depósitos, Proyecciones |
| Compras | Reabastecimiento, Proveedores/marcas/fabricantes, Cuenta corriente de proveedores (con calendario de pagos) |
| Finanzas | Facturación, Resultados, Cuenta corriente, Flujo de caja, Impuestos, Contabilidad (libros IVA), Auditoría de reingresos |
| Clientes y canales | Clientes (cartera + datos), Integraciones, Gestión de integraciones (publicaciones ML) |
| Cuenta | Análisis por cuenta, Configuración (facturación, usuarios, descuentos, costos, API, etc.), Soporte |
| Plataforma | **Panel Vixan** (solo superadmin): alta y suspensión de clientes, entrar a la cuenta de cada uno |

### Funciona de verdad
- Login con sesiones seguras (cookie HttpOnly, contraseñas con scrypt, límite de intentos).
- Multicliente: cada cliente ve solo sus datos. Roles: superadmin, admin, operador.
- Pedidos: alta, edición, cambio de estado individual y masivo, impresión A4 / A4 sin precios / ticket 10x15, exportación Excel, CSV y PDF.
- Stock por lotes: al despachar se descuenta por FIFO de vencimiento; al cancelar un pedido ya despachado se crea un reingreso que se aprueba en Auditoría.
- Traspasos entre depósitos con historial de movimientos.
- Proyecciones: velocidad de venta, días de cobertura y cantidad sugerida a comprar, con creación de órdenes de compra en borrador agrupadas por proveedor.
- Cuenta corriente de proveedores con imputación FIFO de pagos, vencimientos según plazo y calendario de pagos.
- Resultados por pedido y por plataforma, libros IVA, retenciones y flujo de caja.
- Cotizador de envíos: flota propia por zona (CABA / GBA 1 / GBA 2) y estimación de OCA y Andreani, con tarifas editables en Configuración → Costos.
- API con claves (`X-Api-Key`) para que tus clientes conecten su ERP.

### Integraciones
- **WooCommerce**: importación de productos y variantes por SKU, sincronización completa y automática de pedidos, envío del stock a la tienda y webhook "Pedido creado" con firma HMAC.
- **Mercado Libre**: OAuth 2.0, renovación automática del token e importación de órdenes por notificación (`orders_v2`). Detecta Flex, Colecta y Full.
- Tienda Nube, Shopify y VTEX: pantalla lista y estado por cuenta. El conector sigue el mismo patrón que WooCommerce.

### Lo que queda simulado o pendiente
- **WhatsApp y mails masivos**: la bandeja y las campañas se guardan, pero no salen mensajes reales. Para enviarlos hay que conectar WhatsApp Cloud API (Meta) y un proveedor SMTP o de envío (por ejemplo Amazon SES o Brevo).
- **OCA y Andreani**: el cotizador usa tarifas configurables. Para cotizar y generar etiquetas reales hacen falta las credenciales de sus APIs.
- **Venta entre sellers y Vixan Market**: la gestión interna y la API para la tienda online están (`/api/tienda/v1`, ver CHANGELOG 1.5.0); la vidriera pública es la app `vixan-tienda`.

## Instalación

Requisitos: **Node.js 22.5 o superior** (usa el SQLite que trae Node; no hay que instalar ninguna base de datos).

```bash
npm install
cp .env.example .env      # editá los valores
npm start                 # http://localhost:3000
```

En el primer arranque se crea la base `data/vixan.db` con:
- El **superadmin** (`ADMIN_EMAIL` / `ADMIN_PASSWORD` del `.env`; si no hay contraseña, se genera una y se muestra en la consola).
- Un cliente de ejemplo con datos de muestra: `demo@vixan.com` / `demo1234`. **Borralo o cambiale la clave antes de ir a producción.**

Para empezar de cero, borrá la carpeta `data/`.

### En un servidor Ubuntu (DonWeb Cloud Server u otro VPS)
Hay dos scripts en `deploy/`, probados en Ubuntu 24.04:

```bash
# Instalar (como root). Si subiste tu carpeta data a /root/vixan-data, la usa.
cd /root && unzip -q vixan.zip && bash vixan/deploy/instalar.sh app.vixan.com.ar tu@email.com

# Actualizar a una versión nueva sin tocar los datos
cd /root && rm -rf vixan && unzip -q vixan.zip && bash vixan/deploy/actualizar.sh
```

`instalar.sh` deja: swap de 2 GB, Node 22, usuario `vixan`, código en `/opt/vixan`, servicio `systemd` con reinicio automático, HTTPS con Caddy (Let's Encrypt), firewall (22, 80, 443), Vixan escuchando solo en 127.0.0.1, sin cliente demo (`VIXAN_DEMO=0`) y copia diaria de la base en `/var/backups/vixan` (7 días). `actualizar.sh` copia la base antes de empezar y reemplaza solo el código.

Desde el **Panel Vixan** (superadmin) se ve el uso de disco y memoria y se descarga una copia de la base para guardarla fuera del servidor.

### Con Docker
```bash
docker build -t vixan .
docker run -d -p 3000:3000 -v vixan-data:/app/data --env-file .env vixan
```

### En producción
- Poné el servidor detrás de HTTPS (Nginx, Caddy o el proxy de tu hosting) y definí `NODE_ENV=production` para que la cookie sea `Secure`.
- `PUBLIC_URL` tiene que ser la URL pública (ej.: `https://app.vixan.com`), porque con ella se arman las URLs de webhooks y de OAuth.
- Hacé copias de seguridad de `data/vixan.db`.

## Conectar Mercado Libre
1. Creá una aplicación en https://developers.mercadolibre.com.ar/devcenter.
2. URI de redirect: `{PUBLIC_URL}/api/hooks/ml/callback`.
3. URL de notificaciones: `{PUBLIC_URL}/api/hooks/mercadolibre`, con el tópico **orders_v2**.
4. Cargá `ML_CLIENT_ID` y `ML_CLIENT_SECRET` en el `.env` y reiniciá.
5. Cada cliente entra a **Integraciones → Mercado Libre → Conectar cuenta**.

## Conectar WooCommerce (por cliente)
El vínculo entre un producto de la tienda y uno de Vixan es el **SKU**: tiene que ser idéntico en los dos lados.

1. En WordPress: WooCommerce → Ajustes → Avanzado → API REST → Añadir clave, con permisos **Lectura/Escritura** (con solo Lectura no se puede enviar el stock).
2. En Vixan: **Integraciones → WooCommerce**, cargá la URL de la tienda y las dos claves, marcá las opciones y tocá Guardar.
3. **Importar productos**: trae todos los productos y variantes con SKU. Si el SKU ya existe en Vixan, solo lo vincula sin pisar costo ni stock. Opcionalmente carga como stock inicial la cantidad que tiene la tienda. Los productos sin SKU se listan para que los completes.
4. **Sincronizar pedidos**: la primera vez trae todos; después, solo los nuevos o modificados. Un pedido cancelado en la tienda que todavía no salió se cancela en Vixan y libera la reserva.
5. **Importar clientes**: trae los clientes con cuenta y los que compraron sin cuenta (desde los pedidos), vinculados por email (o DNI/CUIT), sin duplicar. Los pedidos nuevos crean o vinculan su cliente solos.
   - **DNI/CUIT y condición de IVA del checkout**: si la tienda los pide con *Checkout Field Editor* (u otro plugin que los guarde en el pedido), Vixan detecta el campo solo. Se puede elegir a mano en "detectar / cambiar". La condición se interpreta: "Responsable Inscripto"/"Factura A", "Monotributo", "Exento", "Consumidor final"/"Factura B".
   - Al facturar, manda lo que el comprador declaró en el checkout de ese pedido; si no declaró nada, se usa la ficha del cliente.
6. **Enviar stock**: manda a la tienda el stock disponible (en lotes menos reservado) de cada producto vinculado, solo los que cambiaron.

Con "Traer pedidos nuevos solos" activado, Vixan sincroniza pedidos y stock cada 5 minutos (cambialo con `WOO_SYNC_MINUTOS`). Con "Enviar el stock" activado, además manda el stock unos segundos después de cada cambio (despacho, lote nuevo, traspaso, reingreso).

**Tiempo real (opcional, requiere Vixan en un servidor público):** en WooCommerce → Ajustes → Avanzado → Webhooks, creá uno con tema *Pedido creado* y la URL que muestra Integraciones; cargá el mismo secreto en Vixan.

## Facturación electrónica (ARCA)
Cada cliente factura con su propio CUIT y su propio certificado. Todo se configura desde **Configuración → Facturación electrónica (ARCA)**:

1. **Datos de facturación:** razón social, CUIT, condición frente al IVA, punto de venta (tiene que ser del tipo "Web Services" en ARCA), domicilio, IIBB e inicio de actividades.
2. **Pedido de certificado:** Vixan genera la clave privada (RSA 2048, queda guardada en Vixan y nunca se muestra) y descarga el `.csr`.
3. **Certificado:** se sube el `.csr` a ARCA (homologación: *WSASS*; producción: *Administración de Certificados Digitales*) y se carga en Vixan el certificado que devuelve. Vixan verifica que corresponda a su clave.
4. **Autorización (producción):** en ARCA, *Administrador de Relaciones* → nueva relación con el servicio *Facturación Electrónica* para ese certificado.
5. **Probar conexión:** consulta el estado de ARCA, hace el login y muestra el último número autorizado.

Qué hace:
- Factura los pedidos seleccionados y elige la letra sola: emisor Responsable Inscripto → **A** a Responsables Inscriptos y Monotributistas, **B** al resto; emisor Monotributista o Exento → **C**.
- Informa siempre la **condición frente al IVA del receptor** (`CondicionIVAReceptorId`, RG 5616), que ARCA rechaza si falta a partir del 1/12/2026. Se carga en cada cliente.
- Valida antes de enviar: CUIT con dígito verificador, factura A solo con CUIT, identificación del consumidor final desde $10.000.000 (RG 5700/2025; configurable con `ARCA_UMBRAL_CF`).
- Factura manual, **nota de crédito** para anular (con el comprobante asociado) y comprobante imprimible con el **QR de ARCA** y las leyendas obligatorias.
- Las facturas con CAE no se pueden editar ni borrar.
- Reutiliza la sesión de ARCA (dura 12 horas) para no chocar con el error "ya posee un TA válido".

Empezá siempre en **homologación** (prueba, sin validez fiscal) y pasá a producción cuando esté probado. El certificado de prueba y el de producción son distintos.

> Esta integración se probó contra un simulador de ARCA que verifica la firma del certificado con OpenSSL, el orden de los campos, la condición de IVA del receptor, los importes, la letra y la numeración. Falta probarla contra los servidores reales de homologación de ARCA.

## API para tus clientes
Se autentica con el encabezado `X-Api-Key` (las claves se crean en Configuración → API / Integraciones).

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/r/pedidos` | Lista de pedidos (filtros: `q`, `f_estado`, `desde`, `hasta`) |
| POST | `/api/pedidos` | Crear un pedido |
| POST | `/api/pedidos/:id/estado` | Cambiar estado (`pendiente`, `para_armar`, `para_despachar`, `enviado`, `entregado`, `cancelado`) |
| GET | `/api/stats/stock` | Stock disponible por SKU |
| GET | `/api/r/productos` | Catálogo |

## Estructura
```
server/
  index.js         rutas HTTP, sesiones, permisos, CRUD
  db.js            SQLite, usuarios, registros por cliente, configuración
  logic.js         stock, tablero, resultados, proyecciones, CC proveedores, IVA, cotizador
  integrations.js  Mercado Libre y WooCommerce (webhooks y OAuth)
  woo.js           sincronización con WooCommerce (productos, pedidos, stock)
  arca.js          facturación electrónica: certificado, WSAA y WSFEv1
  factura-html.js  comprobante imprimible con QR
  seed.js          superadmin y cliente de ejemplo
public/
  index.html, styles.css
  core.js          API, tablas, formularios, exportaciones y gráficos
  modules.js       definición de los 29 módulos
  app.js           login, menú y navegación
```

Agregar un módulo nuevo: sumá la entidad a `ENTITIES` en `server/index.js` y una entrada en `VG.MODULES` (`public/modules.js`) con sus columnas y su formulario.
