#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Vixan — actualizar a una versión nueva SIN tocar los datos
#
# Uso (como root):
#   cd /root && rm -rf vixan && unzip -q vixan.zip && bash vixan/deploy/actualizar.sh
#
# Hace una copia de la base antes de empezar, reemplaza solo el código y
# reinicia. La carpeta data y el archivo .env no se tocan.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
DESTINO=/opt/vixan
ORIGEN="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
verde() { printf '\033[1;32m%s\033[0m\n' "$*"; }
rojo()  { printf '\033[1;31m%s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { rojo "Corré este script como root."; exit 1; }
[ -f "$DESTINO/.env" ] || { rojo "Vixan no está instalado en $DESTINO: usá instalar.sh"; exit 1; }
[ -f "$ORIGEN/server/index.js" ] || { rojo "No encuentro la versión nueva en $ORIGEN"; exit 1; }
[ "$ORIGEN" != "$DESTINO" ] || { rojo "Descomprimí el zip nuevo en otra carpeta (por ejemplo /root/vixan)"; exit 1; }

COPIA=/var/backups/vixan/antes-de-actualizar-$(date +%F-%H%M).db
mkdir -p /var/backups/vixan && chmod 700 /var/backups/vixan
echo "1/4 Copia de seguridad de la base…"
T=$(mktemp -u /tmp/vixan-copia-XXXXXX.db)
runuser -u vixan -- sqlite3 "$DESTINO/data/vixan.db" ".backup '$T'" && mv "$T" "$COPIA" && gzip -f "$COPIA"
echo "    Guardada en $COPIA.gz"

echo "2/4 Reemplazando el código (sin tocar data ni .env)…"
rsync -a --delete --exclude 'data/' --exclude 'node_modules/' --exclude '.env' --exclude '.npm/' --exclude '.git/' "$ORIGEN/" "$DESTINO/"
chown -R vixan:vixan "$DESTINO"

echo "3/4 Instalando dependencias…"
runuser -u vixan -- env HOME="$DESTINO" bash -c "cd '$DESTINO' && npm ci --omit=dev --no-audit --no-fund --cache '$DESTINO/.npm'" >/dev/null

echo "4/4 Reiniciando Vixan…"
systemctl restart vixan
sleep 4
if curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/auth/me | grep -q 401; then
  verde "✔ Vixan $(node -p "require('$DESTINO/package.json').version" 2>/dev/null) actualizado y funcionando."
else
  rojo "✘ Vixan no arrancó. Mirá el error con: journalctl -u vixan -n 50"
  rojo "  Tus datos están intactos y hay copia en $COPIA.gz"
  exit 1
fi
