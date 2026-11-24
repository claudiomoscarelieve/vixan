#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Vixan — instalación en un servidor Ubuntu 24.04 (DonWeb Cloud Server u otro VPS)
#
# Uso (como root, desde la carpeta donde descomprimiste vixan.zip):
#   bash vixan/deploy/instalar.sh app.vixan.com.ar tu@email.com
#
# Si subiste la carpeta "data" de tu computadora a /root/vixan-data, la usa
# (conservás clientes, pedidos, conexiones y usuarios). Si no, arranca vacío.
# Se puede volver a correr sin romper nada.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMINIO="${1:-}"
EMAIL="${2:-}"
DESTINO=/opt/vixan
DATOS_MIGRADOS=/root/vixan-data
ORIGEN="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

verde() { printf '\033[1;32m%s\033[0m\n' "$*"; }
rojo()  { printf '\033[1;31m%s\033[0m\n' "$*"; }
paso()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { rojo "Corré este script como root."; exit 1; }
[ -n "$DOMINIO" ] && [ -n "$EMAIL" ] || { rojo "Uso: bash $0 app.vixan.com.ar tu@email.com"; exit 1; }
[ -f "$ORIGEN/server/index.js" ] || { rojo "No encuentro Vixan en $ORIGEN (¿descomprimiste el zip?)"; exit 1; }
grep -qi ubuntu /etc/os-release || rojo "Aviso: este script está probado en Ubuntu; sigo igual."

paso "1/9 Memoria de respaldo (swap de 2 GB)"
if swapon --show | grep -q .; then
  echo "Ya hay swap configurada."
else
  { fallocate -l 2G /swapfile 2>/dev/null && [ -s /swapfile ]; } || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  if chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile; then
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    sysctl -w vm.swappiness=10 >/dev/null && echo 'vm.swappiness=10' > /etc/sysctl.d/99-vixan.conf
    echo "Swap activada."
  else
    rojo "No se pudo activar la swap (sigo igual; Vixan funciona, pero npm puede ir más lento)."
  fi
fi

paso "2/9 Paquetes del sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg rsync unzip sqlite3 ufw iproute2 psmisc debian-keyring debian-archive-keyring apt-transport-https >/dev/null
echo "Listo."

paso "3/9 Node.js (hace falta 22.9 o más nuevo)"
node_ok() { command -v node >/dev/null && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=9)?0:1)'; }
if node_ok; then
  echo "Node $(node -v) ya instalado."
else
  echo "Instalando Node.js 22 (NodeSource)…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
  node_ok || { rojo "No se pudo instalar Node 22.9+"; exit 1; }
  echo "Node $(node -v) instalado."
fi
NODE_BIN="$(command -v node)"

paso "4/9 Usuario y archivos de Vixan en $DESTINO"
id vixan >/dev/null 2>&1 || useradd --system --home-dir "$DESTINO" --shell /usr/sbin/nologin vixan
mkdir -p "$DESTINO/data"
# El código se reemplaza; la carpeta data y el archivo .env NUNCA se tocan
rsync -a --delete --exclude 'data/' --exclude 'node_modules/' --exclude '.env' --exclude '.npm/' --exclude '.git/' "$ORIGEN/" "$DESTINO/"
MIGRO=no
if [ ! -f "$DESTINO/data/vixan.db" ] && [ -d "$DATOS_MIGRADOS" ]; then
  if [ -f "$DATOS_MIGRADOS/vixan.db" ]; then
    cp -a "$DATOS_MIGRADOS"/. "$DESTINO/data/"; MIGRO=si
  elif [ -f "$DATOS_MIGRADOS/viciago.db" ]; then  # base de una versión anterior al cambio de nombre
    for f in "$DATOS_MIGRADOS"/viciago.db*; do cp -a "$f" "$DESTINO/data/$(basename "$f" | sed 's/viciago/vixan/')"; done; MIGRO=si
  fi
fi
[ "$MIGRO" = si ] && verde "Se copiaron tus datos desde $DATOS_MIGRADOS."
chown -R vixan:vixan "$DESTINO"

paso "5/9 Dependencias de Vixan"
runuser -u vixan -- env HOME="$DESTINO" bash -c "cd '$DESTINO' && npm ci --omit=dev --no-audit --no-fund --cache '$DESTINO/.npm'" >/dev/null
echo "Listo."

paso "6/9 Configuración (.env)"
CLAVE_NUEVA=""
if [ ! -f "$DESTINO/.env" ]; then
  CLAVE_NUEVA="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
  cat > "$DESTINO/.env" <<EOF
# Vixan — configuración del servidor
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
PUBLIC_URL=https://$DOMINIO
VIXAN_DB=$DESTINO/data/vixan.db
VIXAN_DEMO=0
ADMIN_EMAIL=$EMAIL
ADMIN_PASSWORD=$CLAVE_NUEVA
# Mercado Libre (cuando crees la app en developers.mercadolibre.com.ar)
ML_CLIENT_ID=
ML_CLIENT_SECRET=
EOF
else
  sed -i "s#^PUBLIC_URL=.*#PUBLIC_URL=https://$DOMINIO#" "$DESTINO/.env"
  echo "Ya existía: solo se actualizó PUBLIC_URL."
fi
chown vixan:vixan "$DESTINO/.env" && chmod 600 "$DESTINO/.env"

paso "7/9 Servicio que mantiene Vixan siempre prendido"
# La imagen de DonWeb trae una app de ejemplo con PM2 en el puerto 3000 (el mismo que usa Vixan)
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete all >/dev/null 2>&1 || true
  pm2 save --force >/dev/null 2>&1 || true
  systemctl disable --now pm2-root >/dev/null 2>&1 || true
  echo "Se apagó la app de ejemplo de PM2."
fi
# Si algo más ocupa el puerto 3000, se libera (antes de que arranque Vixan)
if ! systemctl is-active --quiet vixan 2>/dev/null; then
  if fuser -k -n tcp 3000 >/dev/null 2>&1; then sleep 1; echo "Se liberó el puerto 3000."; fi
fi
cat > /etc/systemd/system/vixan.service <<EOF
[Unit]
Description=Vixan
After=network-online.target
Wants=network-online.target

[Service]
User=vixan
WorkingDirectory=$DESTINO
ExecStart=$NODE_BIN --env-file=$DESTINO/.env server/index.js
Restart=always
RestartSec=5
Environment=NODE_OPTIONS=--max-old-space-size=512
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$DESTINO/data /tmp

[Install]
WantedBy=multi-user.target
EOF
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=200M\n' > /etc/systemd/journald.conf.d/vixan.conf
systemctl restart systemd-journald
systemctl daemon-reload
systemctl enable vixan >/dev/null 2>&1
systemctl restart vixan
echo "Servicio vixan activo."

paso "8/9 HTTPS con Caddy para $DOMINIO"
# Si la imagen del servidor trae Nginx o Apache ocupando el puerto 80, se apagan
for svc in nginx apache2; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then systemctl disable --now "$svc" >/dev/null 2>&1 && echo "Se apagó $svc (ocupaba el puerto 80)."; fi
done
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi
mkdir -p /var/log/caddy && { chown caddy:caddy /var/log/caddy 2>/dev/null || true; }
mkdir -p /etc/caddy/sitios
cat > /etc/caddy/Caddyfile <<EOF
{
	email $EMAIL
}

$DOMINIO {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
	log {
		output file /var/log/caddy/vixan.log {
			roll_size 10mb
			roll_keep 3
		}
	}
}

# Tiendas de Vixan Tienda instaladas en este mismo servidor
import sitios/*.caddy
EOF
systemctl enable caddy >/dev/null 2>&1
systemctl restart caddy
echo "Caddy configurado."

paso "9/9 Firewall y copia de seguridad diaria"
ufw allow OpenSSH >/dev/null && ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
echo "Firewall: abiertos solo SSH (22), 80 y 443."
mkdir -p /var/backups/vixan && chmod 700 /var/backups/vixan
cat > /etc/cron.daily/vixan-copia <<EOF
#!/bin/sh
# Copia diaria de la base de Vixan (se guardan los últimos 7 días).
# Se hace con el usuario vixan para no dejar archivos de la base en manos de root.
DB=$DESTINO/data/vixan.db
[ -f "\$DB" ] || exit 0
T=\$(mktemp -u /tmp/vixan-copia-XXXXXX.db)
F=/var/backups/vixan/vixan-\$(date +%F).db
runuser -u vixan -- sqlite3 "\$DB" ".backup '\$T'" && mv "\$T" "\$F" && gzip -f "\$F"
find /var/backups/vixan -name 'vixan-*.db.gz' -mtime +7 -delete
EOF
chmod +x /etc/cron.daily/vixan-copia
echo "Copias en /var/backups/vixan (7 días). Además, descargá una copia semanal desde el Panel Vixan."

# ── Verificación final (espera hasta 30 s a que Vixan arranque) ──
OK=no
for _ in $(seq 1 30); do
  if curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/auth/me | grep -q 401; then OK=si; break; fi
  sleep 1
done
if [ "$OK" = si ]; then
  verde "✔ Vixan responde en el servidor."
  /etc/cron.daily/vixan-copia || true   # primera copia, ya con la base creada por Vixan
else
  rojo "✘ Vixan no responde. Revisá con: journalctl -u vixan -n 50"
fi
echo
verde "════════════════════════════════════════════════════"
verde " Instalación terminada"
verde "════════════════════════════════════════════════════"
echo " Dirección: https://$DOMINIO"
if [ "$MIGRO" = si ]; then
  echo " Entrá con tus mismos usuarios y contraseñas de siempre."
  echo " IMPORTANTE: si tu base tiene el cliente de prueba (demo@vixan.com / demo1234),"
  echo " suspendelo desde el Panel Vixan: ahora el sistema está en internet."
elif [ -n "$CLAVE_NUEVA" ]; then
  echo " Superadmin: $EMAIL"
  echo " Contraseña: $CLAVE_NUEVA   ← anotala ahora"
fi
echo " Si el navegador todavía no abre con https, esperá unos minutos:"
echo " el certificado se obtiene cuando el dominio ya apunta a este servidor."
echo " Ver el registro de Vixan:  journalctl -u vixan -f"
