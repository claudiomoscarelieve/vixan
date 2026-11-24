# Vixan Tienda

Vidriera de e-commerce de cada cliente de Vixan. Se instala en el **servidor propio del cliente** y toma catálogo, precios y stock de Vixan (servidor central multicliente).

> Versión 0.1.0: plantilla base con catálogo de ejemplo. La conexión con la API de Vixan, el checkout con Mercado Pago y las cuentas de clientes llegan en las próximas etapas.

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
| `tienda` | Nombre, logo (URL de imagen), eslogan, etiqueta del carrito, si los precios incluyen IVA, compra mínima inicial y descuento por volumen |
| `tema` | Colores (primario, acento, fondos, texto), tipografía y redondeo de bordes |
| `avisos` | Mensajes de la barra superior que se desplaza |
| `banners` | Los dos banners de la home (título, texto, enlace e imagen opcional) |
| `bloquesOfertas` | Bloques de productos de la home con su banner de campaña |
| `contacto` | WhatsApp (solo números, con código de país), mensaje inicial, email, dirección y horario |
| `paginas.mayoristas` | Texto de la página "Cómo comprar" |
| `fuente` / `vixan` | `demo` por ahora; `vixan` con la URL y la clave cuando exista la API pública |

## Estructura de la plantilla

- **Barra de avisos** con las condiciones comerciales.
- **Cabecera**: menú de categorías y buscador a la izquierda, logo al centro, ingreso, favoritos y carrito a la derecha.
- **Barra de categorías** con Ofertas y Mayoristas.
- **Home**: dos banners, una sección por categoría con la grilla de subcategorías, dos bloques de productos con banner de campaña, bloque de marca y pie en tres columnas.
- **Páginas**: categoría y subcategoría con orden, ficha de producto con venta por bulto, búsqueda, ofertas, novedades, lo más pedido, catálogo completo, mayoristas y cuenta.
- **Paneles**: "Mi pedido" con aviso de compra mínima, descuento por volumen e IVA, y envío del pedido por WhatsApp; "Mis favoritos"; botón flotante de WhatsApp.

## Archivos

- `server.js`: rutas.
- `src/vistas.js`: la plantilla (páginas generadas en el servidor, sin dependencias).
- `src/datos.js`: fuente de datos. Las vistas solo usan sus funciones, así que pasar del catálogo de ejemplo a la API de Vixan no toca la plantilla.
- `public/tienda.css` y `public/tienda.js`: estilos y comportamiento en el navegador.
