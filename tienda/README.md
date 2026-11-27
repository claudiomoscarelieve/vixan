# Vixan Tienda

Vidriera de e-commerce de cada cliente de Vixan. Se instala en el **servidor propio del cliente** y toma catálogo, precios y stock de Vixan (servidor central multicliente).

> Versión 0.5.0: plantilla completa conectada al catálogo de Vixan, con cuentas de compradores (registro con aprobación y precio según la lista de cada cliente). El checkout con Mercado Pago llega en una próxima etapa.

## Probarla

```bash
cd tienda
npm install
npm start          # http://localhost:3100
```

## Personalizar para un cliente

Copiá `config.ejemplo.json` como `config.json` (no se sube al repositorio porque lleva la clave de API) y cambiá:

| Sección | Qué define |
|---|---|
| `tienda` | Nombre, URL pública, logo (URL de imagen), eslogan, etiqueta del carrito, si los precios incluyen IVA, si se ocultan a visitantes (`preciosSoloClientes`), compra mínima inicial y descuento por volumen |
| `tema` | Colores (primario, acento, fondos, texto), tipografía y redondeo de bordes |
| `avisos` | Mensajes de la barra superior que se desplaza |
| `banners` | Los dos banners de la home (título, texto, enlace e imagen opcional) |
| `bloquesOfertas` | Bloques de productos de la home con su banner de campaña |
| `compra` | Textos de la ficha de producto: modalidad, disponibilidad, aviso de últimas unidades, pagos, envíos y despacho, devolución y términos |
| `contacto` | WhatsApp (solo números, con código de país), mensaje inicial, email, dirección y horario |
| `paginas.mayoristas` | Texto de la página "Cómo comprar" |
| `fuente` / `vixan` | `demo` (catálogo de ejemplo) o `vixan` (catálogo publicado del cliente). Con `vixan`, la URL de Vixan va en `vixan.url`, el ID público de la tienda (Mi tienda) en `vixan.tienda` o en la variable `VIXAN_TIENDA_ID` para habilitar las cuentas de compradores, y la clave de la tienda en la variable `VIXAN_TIENDA_CLAVE` |

## Estructura de la plantilla

- **Barra de avisos** con las condiciones comerciales.
- **Cabecera**: menú de categorías y buscador a la izquierda, logo al centro, ingreso, favoritos y carrito a la derecha.
- **Barra de categorías** con Ofertas y Mayoristas.
- **Home**: dos banners, una sección por categoría con la grilla de subcategorías, dos bloques de productos con banner de campaña, bloque de marca y pie en tres columnas.
- **Páginas**: categoría y subcategoría con orden, ficha de producto (galería con zoom, precio por unidad y bulto, meta de compra inicial, pago y envío, compartir, características, relacionados y vistos recientemente), búsqueda, ofertas, novedades, lo más pedido, catálogo completo, mayoristas y cuenta.
- **Paneles**: "Mi pedido" con aviso de compra mínima, descuento por volumen e IVA, y envío del pedido por WhatsApp; "Mis favoritos"; botón flotante de WhatsApp.

## Archivos

- `server.js`: rutas.
- `src/vistas.js`: la plantilla (páginas generadas en el servidor, sin dependencias).
- `src/datos.js`: fuente de datos. Las vistas solo usan sus funciones, así que pasar del catálogo de ejemplo a la API de Vixan no toca la plantilla.
- `public/tienda.css` y `public/tienda.js`: estilos y comportamiento en el navegador.

## Una configuración por cliente

Cada cliente tiene su carpeta en `clientes/<cliente>/` con su `config.json` y una carpeta `recursos/` (logo, favicon, banners) que se publica en la raíz de la tienda. Los comandos la usan con `--config`:

```bash
node server.js   --config clientes/tutiendaconia/config.json
node exportar.js --config clientes/tutiendaconia/config.json
node publicar.js --config clientes/tutiendaconia/config.json
```

Sin `--config` se usa `config.json` de esta carpeta (o `config.ejemplo.json`). La configuración no guarda contraseñas.

## Dos formas de publicar

| | Hosting compartido (PHP, por FTP) | Servidor con Node (VPS) |
|---|---|---|
| Costo | El más barato | Más caro |
| Precios y stock | Se actualizan cada vez que se publica | Al instante |
| Mantenimiento | Ninguno en el hosting | Hay que cuidar el servidor |
| Comando | `node publicar.js` | `bash deploy/instalar.sh` |

La plantilla es la misma en los dos casos.

## Hosting compartido (PHP, por FTP)

La tienda se genera como páginas HTML y se sube por FTP. Sirve cualquier hosting con Apache (el de casi todos los planes PHP). La búsqueda y el orden de los listados funcionan en el navegador; el pedido, los favoritos y WhatsApp funcionan igual.

1. En `config.json` → `ftp`, completá servidor, puerto, usuario y carpeta (normalmente `/public_html`, o la carpeta del subdominio). `seguro: true` usa FTPS; si el hosting no lo soporta, poné `false`.
2. Publicá, con la contraseña en una variable (no queda guardada en ningún archivo):

```bash
# Linux / Mac
VIXAN_FTP_CLAVE='la-contraseña' node publicar.js --probar   # muestra qué va a subir, sin tocar nada
VIXAN_FTP_CLAVE='la-contraseña' node publicar.js

# Windows (cmd)
set VIXAN_FTP_CLAVE=la-contraseña
node publicar.js
```

- Solo sube los archivos que cambiaron desde la última vez y borra solo los que la tienda subió antes (lista en `vixan-manifiesto.json`, que no es visible desde la web).
- Si la carpeta ya tiene otro sitio (por ejemplo, un WordPress), se detiene y avisa. Con `--forzar` publica igual; el `.htaccess` anterior se guarda como `.htaccess.vixan-respaldo`.
- `node exportar.js` genera la tienda en la carpeta `dist/` sin subirla, por si querés subirla a mano con FileZilla.
- En Cloudflare, el dominio apunta a la IP del hosting (registros A de `@` y `www`). El `.htaccess` fuerza https y redirige `www` al dominio.

## Instalar en un servidor con Node

Servidor Ubuntu 24.04 con acceso root. Primero, en Cloudflare, crear dos registros **A** (`@` y `www`) que apunten a la IP del servidor, con la nube en **gris** (solo DNS) hasta que la tienda abra con https.

```bash
# desde la carpeta de la tienda, como root
bash deploy/instalar.sh tutiendaconia.com.ar tu@email.com
nano /opt/tienda-tutiendaconia-com-ar/config.json      # datos de la tienda
systemctl restart tienda-tutiendaconia-com-ar
```

Actualizar con código nuevo: `bash deploy/actualizar.sh tutiendaconia.com.ar` (no toca `config.json`).

Puede convivir con Vixan u otras tiendas en el mismo servidor: cada una usa su puerto (tercer parámetro, 3100 por defecto) y su archivo en `/etc/caddy/sitios/`.
