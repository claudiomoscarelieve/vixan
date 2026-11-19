#!/usr/bin/env bash
# Vuelve el servidor a una versión anterior de Vixan (o a la última).
# Uso:  bash /root/vixan/deploy/volver.sh 1.4.0     → instala la versión 1.4.0
#       bash /root/vixan/deploy/volver.sh ultima    → vuelve a la última versión
# Cada versión es el commit de GitHub cuyo mensaje empieza con "Vixan X.Y.Z".
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# git checkout cambia este mismo archivo: se corre desde una copia para no cortarse a mitad de camino
if [ -z "${VIXAN_VOLVER_COPIA:-}" ]; then
  T="$(mktemp /tmp/vixan-volver-XXXXXX.sh)"; cp "${BASH_SOURCE[0]}" "$T"
  VIXAN_VOLVER_COPIA=1 VIXAN_REPO="$REPO" exec bash "$T" "$@"
fi
cd "${VIXAN_REPO:-$REPO}"
V="${1:-}"
[ -n "$V" ] || { echo "Decime la versión, por ejemplo: bash deploy/volver.sh 1.4.0  (o 'ultima')"; git log main --format='  %s' | grep -E '^  Vixan [0-9]' | head -10; exit 1; }
git fetch -q origin main
if [ "$V" = ultima ]; then
  git checkout -q main && git merge -q --ff-only origin/main
else
  C="$(git log origin/main --format='%h %s' | grep -E "^[0-9a-f]+ Vixan ${V//./\\.}[: ]" | head -1 | cut -d' ' -f1 || true)"
  [ -n "$C" ] || { echo "No encuentro la versión $V. Estas son las que hay:"; git log origin/main --format='  %s' | grep -E '^  Vixan [0-9]' | head -10; exit 1; }
  git checkout -q "$C"
fi
echo "Instalando $(node -p "require('./package.json').version")…"
bash deploy/actualizar.sh
