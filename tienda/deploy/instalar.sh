#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Vixan Tienda — instalación en un servidor Ubuntu 24.04 (DonWeb Cloud Server u otro VPS)
#
# Uso (como root, desde la carpeta de la tienda):
#   bash deploy/instalar.sh tutiendaconia.com.ar tu@email.com [puerto]
#
# - Sirve el dominio y también www.<dominio> (que redirige al dominio).
# - Puede convivir con Vixan u otras tiendas en el mismo servidor: cada tienda
#   usa su propio puerto (3100 por defecto) y su propio archivo de Caddy.
# - config.json se crea la primera vez y NUNCA se pisa al reinstalar.
# Se puede volver a correr sin romper nada.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMINIO="${1:-}"
EMAIL="${2:-}"
PUERTO="${3:-3100}"
ORIGEN="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NOMBRE="tienda-$(echo "$DOMINIO" | tr '.' '-')"
DESTINO="/opt/$NOMBRE"

verde() { printf '\033[1;32m%s\033[0m\n' "$*"; }
rojo()  { printf '\033[1;31m%s\033[0m\n' "$*"; }
paso()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { rojo "Corré este script como root."; exit 1; }
[ -n "$DOMINIO" ] && [ -n "$EMAIL" ] || { rojo "Uso: bash $0 tutiendaconia.com.ar tu@email.com [puerto]"; exit 1; }
[ -f "$ORIGEN/server.js" ] && [ -f "$ORIGEN/src/vistas.js" ] || { rojo "No encuentro Vixan Tienda en $ORIGEN"; exit 1; }
DOMINIO="${DOMINIO#www.}"

paso "1/7 Memoria de respaldo y paquetes"
if ! swapon --show | grep -q .; then
  { fallocate -l 1G /swapfile 2>/dev/null && [ -s /swapfile ]; } || dd if=/dev/zero of=/swapfile bs=1M count=1024 status=none
  chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile && { grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab; } || true
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg rsync ufw psmisc debian-keyring debian-archive-keyring apt-transport-https >/dev/null
echo "Listo."

paso "2/7 Node.js 22"
node_ok() { command -v node >/dev/null && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=9)?0:1)'; }
if ! node_ok; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
  node_ok || { rojo "No se pudo instalar Node 22.9+"; exit 1; }
fi
NODE_BIN="$(command -v node)"
echo "Node $(node -v)."

paso "3/7 Archivos de la tienda en $DESTINO"
id vixantienda >/dev/null 2>&1 || useradd --system --home-dir /opt --shell /usr/sbin/nologin vixantienda
mkdir -p "$DESTINO"
rsync -a --delete --exclude 'node_modules/' --exclude 'config.json' --exclude '.npm/' --exclude '.git/' "$ORIGEN/" "$DESTINO/"
chown -R vixantienda:vixantienda "$DESTINO"
runuser -u vixantienda -- env HOME="$DESTINO" bash -c "cd '$DESTINO' && npm ci --omit=dev --no-audit --no-fund --cache '$DESTINO/.npm'" >/dev/null
echo "Listo."

paso "4/7 Configuración (config.json)"
if [ ! -f "$DESTINO/config.json" ]; then
  runuser -u vixantienda -- "$NODE_BIN" -e '
    const fs = require("fs"); const [dir, dominio, puerto] = process.argv.slice(1);
    const c = JSON.parse(fs.readFileSync(dir + "/config.ejemplo.json", "utf8"));
    delete c._ayuda; c.puerto = Number(puerto); c.tienda.url = "https://" + dominio;
    fs.writeFileSync(dir + "/config.json", JSON.stringify(c, null, 2) + "\n");' "$DESTINO" "$DOMINIO" "$PUERTO"
  chmod 600 "$DESTINO/config.json"
  echo "Se creó config.json con los valores de ejemplo: editalo con  nano $DESTINO/config.json"
else
  echo "config.json ya existía: no se tocó."
fi

paso "5/7 Servicio $NOMBRE (puerto $PUERTO)"
if ! systemctl is-active --quiet "$NOMBRE" 2>/dev/null && fuser -n tcp "$PUERTO" >/dev/null 2>&1; then
  rojo "El puerto $PUERTO está ocupado por otro programa. Volvé a correr el script con otro puerto, por ejemplo: bash $0 $DOMINIO $EMAIL 3101"; exit 1
fi
cat > "/etc/systemd/system/$NOMBRE.service" <<EOF
[Unit]
Description=Vixan Tienda ($DOMINIO)
After=network-online.target
Wants=network-online.target

[Service]
User=vixantienda
WorkingDirectory=$DESTINO
Environment=NODE_ENV=production PORT=$PUERTO HOST=127.0.0.1 NODE_OPTIONS=--max-old-space-size=256
ExecStart=$NODE_BIN server.js
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$NOMBRE" >/dev/null 2>&1
systemctl restart "$NOMBRE"
echo "Servicio activo."

paso "6/7 HTTPS con Caddy para $DOMINIO y www.$DOMINIO"
for svc in nginx apache2; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then systemctl disable --now "$svc" >/dev/null 2>&1 && echo "Se apagó $svc (ocupaba el puerto 80)."; fi
done
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi
mkdir -p /etc/caddy/sitios /var/log/caddy && { chown caddy:caddy /var/log/caddy 2>/dev/null || true; }
# Si no hay Caddyfile (servidor nuevo), se crea uno mínimo. Si ya existe (por ejemplo, el de Vixan),
# solo se le agrega la línea que incluye los sitios de las tiendas.
if [ ! -s /etc/caddy/Caddyfile ] || grep -q 'Caddy configuration file' /etc/caddy/Caddyfile; then
  printf '{\n\temail %s\n}\n\n' "$EMAIL" > /etc/caddy/Caddyfile
fi
grep -q 'import sitios/\*.caddy' /etc/caddy/Caddyfile || printf '\nimport sitios/*.caddy\n' >> /etc/caddy/Caddyfile
cat > "/etc/caddy/sitios/$NOMBRE.caddy" <<EOF
www.$DOMINIO {
	redir https://$DOMINIO{uri} permanent
}

$DOMINIO {
	encode zstd gzip
	reverse_proxy 127.0.0.1:$PUERTO
	log {
		output file /var/log/caddy/$NOMBRE.log {
			roll_size 10mb
			roll_keep 3
		}
	}
}
EOF
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || { rojo "La configuración de Caddy tiene un error: caddy validate --config /etc/caddy/Caddyfile"; exit 1; }
systemctl enable caddy >/dev/null 2>&1
systemctl reload caddy 2>/dev/null || systemctl restart caddy
echo "Caddy configurado."

paso "7/7 Firewall"
ufw allow OpenSSH >/dev/null && ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
echo "Abiertos solo SSH (22), 80 y 443."

OK=no
for _ in $(seq 1 20); do
  if curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PUERTO/" | grep -q 200; then OK=si; break; fi
  sleep 1
done
echo
if [ "$OK" = si ]; then verde "✔ La tienda responde en el servidor."; else rojo "✘ La tienda no responde. Revisá con: journalctl -u $NOMBRE -n 50"; fi
verde "════════════════════════════════════════════════════"
verde " Vixan Tienda instalada"
verde "════════════════════════════════════════════════════"
echo " Dirección:      https://$DOMINIO"
echo " Configuración:  nano $DESTINO/config.json   (después: systemctl restart $NOMBRE)"
echo " Registro:       journalctl -u $NOMBRE -f"
echo " Si https todavía no abre, esperá unos minutos: el certificado se pide"
echo " cuando el dominio ya apunta a este servidor (Cloudflare en gris al principio)."
