#!/usr/bin/env bash
# Pone una contraseña nueva al superadmin de Vixan y la muestra una sola vez.
# Uso (en el servidor, como root):  bash /root/vixan/deploy/clave-superadmin.sh
set -euo pipefail
DESTINO=/opt/vixan
[ "$(id -u)" = 0 ] || { echo "Correlo como root"; exit 1; }
[ -f "$DESTINO/server/db.js" ] || { echo "No encuentro Vixan en $DESTINO"; exit 1; }
cd "$DESTINO"
runuser -u vixan -- env VIXAN_DB="$DESTINO/data/vixan.db" node -e '
const crypto = require("crypto");
const store = require("./server/db");
const u = store.db.prepare("SELECT id, email FROM users WHERE rol = ? ORDER BY id LIMIT 1").get("superadmin");
if (!u) { console.error("No hay superadmin en la base"); process.exit(1); }
const clave = crypto.randomBytes(12).toString("base64url");
store.db.prepare("UPDATE users SET pass_hash = ?, activo = 1 WHERE id = ?").run(store.hashPassword(clave), u.id);
store.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(u.id);
console.log("");
console.log(" Superadmin: " + u.email);
console.log(" Contraseña nueva: " + clave);
console.log(" Guardala en un gestor de contraseñas y cambiala desde Vixan si querés.");
console.log("");
' 2>/dev/null
