#!/usr/bin/env bash
#
# Crea (o actualiza) las labels de área y prioridad usadas por el triage automático de issues.
# Se corre una sola vez a mano, con permisos de administración sobre el repo:
#
#   bash scripts/setup-labels.sh
#
# Requiere `gh` autenticado (gh auth login) con acceso de escritura al repo.
# Es idempotente: se puede volver a correr sin problema (usa --force para actualizar
# color/descripción si la label ya existe).
#

set -euo pipefail

create_label() {
  local name="$1" color="$2" description="$3"
  gh label create "$name" --color "$color" --description "$description" --force
}

# Área del juego afectada
create_label "area:gameplay" "1d76db" "Lógica de juego: piezas, colisiones, rotación, drop"
create_label "area:render"   "5319e7" "Canvas, dibujado, ghost piece, grilla"
create_label "area:input"    "0e8a16" "Teclado, controles, pausa"
create_label "area:scoring"  "fbca04" "Puntaje, líneas, niveles, velocidad"
create_label "area:ui"       "c2e0c6" "HTML/CSS, layout, overlays"

# Prioridad (principalmente para bugs)
create_label "P1" "b60205" "Rompe el juego o bloquea jugar"
create_label "P2" "d93f0b" "Molesto pero hay workaround"
create_label "P3" "fef2c0" "Menor / nice to have"

echo "Labels de área y prioridad creadas/actualizadas."
