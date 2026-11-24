# Vixan — Guía del dueño

## Qué es Vixan

Vixan es un portal para que tus clientes gestionen sus pedidos de Mercado Libre, WooCommerce y otros canales en un solo lugar: despacho, stock, compras, finanzas y reportes. Cada cliente ve solo sus propios datos.

Hay tres tipos de usuario:

| Rol | Quién es | Qué puede hacer |
| --- | --- | --- |
| Superadmin | Vos, el dueño de Vixan | Crear y suspender clientes, entrar a la cuenta de cualquiera, todo lo demás |
| Admin | El responsable de cada cliente | Usar todos los módulos de su cuenta, crear usuarios, cambiar la configuración |
| Operador | Un empleado del cliente | Usar los módulos del día a día, sin tocar usuarios ni configuración |

## Dónde está cada cosa

| Qué | Dónde |
| --- | --- |
| El sistema funcionando | **https://app.vixan.com.ar** (Cloud Server de DonWeb, IP 201.32.133.236, con Cloudflare adelante) |
| El código y su historial | Repositorio privado **github.com/claudiomoscarelieve/vixan** |
| Qué cambió en cada versión | `CHANGELOG.md` en el repositorio. La versión instalada se ve en **Panel Vixan → Servidor** |
| Estas guías | Carpeta `docs/` del repositorio |
| Los datos (clientes, pedidos, conexiones) | Solo en el servidor, en `/opt/vixan/data`. Nunca se suben a GitHub |

## Actualizar Vixan en el servidor

Cada versión nueva se publica en GitHub. Para instalarla:

1. En tu PC abrí **cmd** y conectate al servidor:

```
ssh root@201.32.133.236
```

2. Ya en el servidor (la línea empieza con `[root@vps…]#`), pegá:

```
cd /root/vixan && git pull && bash deploy/actualizar.sh
```

Hace una copia de la base, reemplaza solo el código y reinicia. Al final dice **"Vixan 1.x.x actualizado y funcionando"**. Tus datos no se tocan.

Si una versión nueva sale mal, volvé a la anterior con `bash /root/vixan/deploy/volver.sh 1.4.0` (cambiando el número; sin número te muestra las que hay). Para volver a la última: `bash /root/vixan/deploy/volver.sh ultima`.

### Conectar el servidor con GitHub (una sola vez)

El repositorio es privado, así que el servidor necesita una **clave de despliegue** de solo lectura:

1. En el servidor, generá la clave y mostrala:

```
ssh-keygen -t ed25519 -N "" -f /root/.ssh/vixan_github -C "servidor-vixan" && cat /root/.ssh/vixan_github.pub
```

2. Copiá la línea que empieza con `ssh-ed25519`.
3. En GitHub, en el repositorio **vixan → Settings → Deploy keys → Add deploy key**: título `Servidor DonWeb`, pegá la línea, dejá **sin marcar** "Allow write access" y tocá **Add key**.
4. En el servidor, decile a git que use esa clave y bajá el repositorio:

```
printf 'Host github.com\n  IdentityFile /root/.ssh/vixan_github\n  IdentitiesOnly yes\n' >> /root/.ssh/config && ssh-keyscan github.com >> /root/.ssh/known_hosts 2>/dev/null && rm -rf /root/vixan && git clone git@github.com:claudiomoscarelieve/vixan.git /root/vixan
```

Desde ahí, actualizar es el comando de arriba.

## Instalar Vixan en un servidor nuevo

Sirve si algún día cambiás de servidor o de plan. Lleva unos 30 minutos.

1. **Dominio:** en Cloudflare, el registro **A** `app` apunta a la IP del servidor, con **Proxy desactivado (nube gris)** hasta que el certificado HTTPS esté listo.
2. **Firewall de DonWeb:** permitidos los puertos 22, 80 y 443.
3. **Código:** conectá el servidor con GitHub como dice arriba (queda en `/root/vixan`).
4. **Datos:** si traés una base de otro lado, dejá la carpeta `data` en `/root/vixan-data`. Desde Windows usá **cmd** (no PowerShell) y `scp -O`:

```
scp -O -r C:\ruta\a\data root@IP-DEL-SERVIDOR:/root/vixan-data
```

5. **Instalar** (cambiando `tu@email.com` por tu email, que usa el certificado HTTPS):

```
bash /root/vixan/deploy/instalar.sh app.vixan.com.ar tu@email.com
```

6. Al final dice **"Vixan responde en el servidor"** y muestra el usuario y la contraseña del superadmin. Guardalos en un gestor de contraseñas.
7. Cuando **https://app.vixan.com.ar** abra bien, en Cloudflare pasá el registro `app` a **nube naranja** y en **SSL/TLS** elegí **Completo (estricto)**. No actives "Usar siempre HTTPS".

El instalador apaga la app de ejemplo que trae DonWeb en el puerto 3000 (la que corre con PM2) y Nginx, porque chocarían con Vixan.

## Primer ingreso y contraseñas

- El superadmin es el email que pusiste al instalar. La contraseña inicial quedó en el servidor: `grep ADMIN_ /opt/vixan/.env`.
- Cambiala desde Vixan con **Cambiar contraseña** (abajo del menú). Después de cambiarla, la del archivo `.env` ya no sirve.
- Si la perdés, en el servidor corré `bash /root/vixan/deploy/clave-superadmin.sh`: pone una nueva y te la muestra. No se borra nada.
- La contraseña de **root del servidor** cambiala con `passwd` estando conectado. No la pegues en ningún chat.

## Crear un cliente nuevo

Los clientes se crean desde el **Panel Vixan**, que solo ve el superadmin. Cada cliente nuevo arranca vacío, con un depósito "Central" y su usuario administrador.

1. Entrá con tu usuario de superadmin.
2. En el menú de la izquierda, al final, abrí **Panel Vixan** (grupo Plataforma).
3. Tocá **+ Nuevo cliente**.
4. Completá:
   - **Nombre del negocio**: cómo se va a ver en el sistema.
   - **Plan**: básico, estándar o pro. Por ahora es solo una etiqueta, no limita nada.
   - **Nombre del usuario**: la persona que va a entrar.
   - **Email de acceso** y **contraseña inicial** (mínimo 8 caracteres).
5. Tocá **Guardar**. Pasale a tu cliente el email y la contraseña.

**Otras acciones en la lista de clientes:**

- **Entrar**: abre la cuenta de ese cliente para revisar o darle soporte. También podés cambiar de cliente con el selector de arriba a la derecha.
- **Suspender**: le corta el acceso sin borrar sus datos. **Reactivar** lo devuelve.

## Conectar la tienda de un cliente (Vixan Tienda)

Vixan Tienda es la tienda online de cada cliente (carpeta `tienda/` del repositorio). Muestra los productos que el cliente marca para publicar, con su precio y stock de Vixan.

1. Entrá a la cuenta del cliente (Panel Vixan → **Entrar**).
2. En **Catálogo**, editá los productos que van a la tienda y marcá **Publicar en la tienda**. Ahí mismo se cargan la subcategoría, la venta por bulto, la descripción y las fotos (una dirección https por línea).
3. En **Vixan Market → Mi tienda**, elegí la **lista de precios** de la tienda y tocá **Generar clave de la tienda**. Copiá la clave: no se vuelve a mostrar.
4. En la configuración de la tienda (`tienda/clientes/<cliente>/config.json`): `"fuente": "vixan"` y `"vixan": { "url": "https://app.vixan.com.ar" }`.
5. Publicá con la clave en una variable (no se guarda en ningún archivo). Desde Windows, en **cmd**:

```
cd ruta\al\repositorio\vixan\tienda
set VIXAN_TIENDA_CLAVE=vt_...
set VIXAN_FTP_CLAVE=contraseña-del-ftp
node publicar.js --config clientes/<cliente>/config.json
```

La clave de la tienda solo puede leer el catálogo publicado: no ve pedidos, clientes ni nada más de la cuenta. En **Mi tienda** se ve cuándo se conectó la tienda por última vez, y **Ver qué publica** muestra la lista exacta. **Generar clave nueva** o **Desconectar** dejan sin acceso a la clave anterior.

Cada vez que cambian precios o stock hay que volver a publicar (el comando sube solo lo que cambió). La tienda en servidor con Node lee el catálogo sola cada 5 minutos.

## Copias de seguridad

- El servidor guarda una copia diaria de la base en `/var/backups/vixan` (últimos 7 días) y otra antes de cada actualización.
- En **Panel Vixan → Servidor** descargá una copia una vez por semana y guardala fuera del servidor.
- En ese mismo panel ves la versión instalada, el disco y la memoria.

## Guía para tus clientes

El uso diario (usuarios de cada cuenta, despachos, etiquetas, stock, catálogo y precios, WooCommerce, ARCA y la lista de módulos) está en `docs/guia-clientes.md`. Esa guía no menciona el servidor ni el Panel Vixan, así que podés compartirla con ellos.

## Probar Vixan en tu computadora (opcional)

Sirve para mirar una versión nueva sin tocar el servidor. Necesitás Node.js 22.9 o más nuevo (nodejs.org).

1. Bajá el código: en GitHub, **Code → Download ZIP**, y descomprimilo.
2. Abrí **cmd** en la carpeta que tiene `package.json`.
3. `npm.cmd install` y después `npm.cmd start`. Usá `npm.cmd` y no `npm`: PowerShell bloquea `npm`.
4. Abrí **http://localhost:3000**. Entrás con `demo@vixan.com` / `demo1234` (datos inventados).

No lo dejes prendido mientras usás el servidor con WooCommerce conectado a la misma tienda: sincronizarían dos veces.

## Si algo falla

| Qué pasa | Qué hacer |
| --- | --- |
| Error 524 de Cloudflare | Vixan tardó más de 100 segundos. Corré `journalctl -u vixan -n 50 --no-pager` y mandame lo que aparece |
| Error 525 o 526 de Cloudflare | Poné el registro `app` en nube gris, esperá unos minutos, probá la página y volvé a nube naranja |
| "ERR_SSL_PROTOCOL_ERROR" al abrir la página | El certificado todavía no está: `systemctl restart caddy`, esperá un minuto y recargá |
| `ssh` o `scp` dicen "Connection refused" o "Connection closed" | Revisá el puerto 22 en el Firewall de DonWeb; para `scp` usá `-O` |
| "Host key verification failed" al usar `scp` | Lo estás escribiendo adentro del servidor: escribí `exit` y corrélo en tu PC |
| `git pull` dice "Permission denied (publickey)" | Falta la clave de despliegue: repetí "Conectar el servidor con GitHub" |
| "Vixan no responde" al instalar o actualizar | `journalctl -u vixan -n 50 --no-pager` y mandame lo que aparece |
| Necesitás reiniciar Vixan | `systemctl restart vixan` |
| Ver qué ocupa la memoria | `ps aux --sort=-rss \| head -8` |
