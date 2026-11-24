#!/usr/bin/env bash
# Vixan Tienda — actualizar una tienda ya instalada con el código de esta carpeta.
# Uso (como root, desde la carpeta de la tienda con el código nuevo):
#   bash deploy/actualizar.sh tutiendaconia.com.ar
# No toca config.json.
set -euo pipefail
DOMINIO="${1:-}"; DOMINIO="${DOMINIO#www.}"
ORIGEN="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NOMBRE="tienda-$(echo "$DOMINIO" | tr '.' '-')"
DESTINO="/opt/$NOMBRE"
[ "$(id -u)" -eq 0 ] || { echo "Corré este script como root."; exit 1; }
[ -n "$DOMINIO" ] || { echo "Uso: bash $0 tutiendaconia.com.ar"; exit 1; }
[ -f "$DESTINO/config.json" ] || { echo "No hay una tienda instalada para $DOMINIO (usá deploy/instalar.sh)."; exit 1; }
rsync -a --delete --exclude 'node_modules/' --exclude 'config.json' --exclude '.npm/' --exclude '.git/' "$ORIGEN/" "$DESTINO/"
chown -R vixantienda:vixantienda "$DESTINO"
runuser -u vixantienda -- env HOME="$DESTINO" bash -c "cd '$DESTINO' && npm ci --omit=dev --no-audit --no-fund --cache '$DESTINO/.npm'" >/dev/null
systemctl restart "$NOMBRE"
sleep 2
if systemctl is-active --quiet "$NOMBRE"; then
  printf '\033[1;32m✔ Tienda %s actualizada a la versión %s\033[0m\n' "$DOMINIO" "$(node -p "require('$DESTINO/package.json').version")"
else
  printf '\033[1;31m✘ La tienda no arrancó. Revisá con: journalctl -u %s -n 50\033[0m\n' "$NOMBRE"; exit 1
fi
