#!/usr/bin/env bash
#
# Publica (o actualiza) un único comentario "sticky" de diagnóstico en el issue que disparó
# el workflow. Si ya existe un comentario con el marcador, lo reescribe; si no, crea uno nuevo.
#
# Uso: ./scripts/upsert-issue-comment.sh path/al/comentario.md
#
# El número de issue y el repo se leen del entorno del workflow, no de argumentos, para que el
# llamador no pueda apuntar a un issue distinto del que disparó la corrida.
#

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Error: usage: $0 <path-to-markdown-file>" >&2
  exit 1
fi

BODY_FILE="$1"
if [[ ! -f "$BODY_FILE" ]]; then
  echo "Error: file not found: $BODY_FILE" >&2
  exit 1
fi

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY not set}"

ISSUE=$(jq -r '.issue.number // empty' "${GITHUB_EVENT_PATH:?GITHUB_EVENT_PATH not set}")
if ! [[ "$ISSUE" =~ ^[0-9]+$ ]]; then
  echo "Error: no issue number in event payload" >&2
  exit 1
fi

MARKER="<!-- claude-triage -->"

TMP_BODY=$(mktemp)
trap 'rm -f "$TMP_BODY"' EXIT
{
  echo "$MARKER"
  cat "$BODY_FILE"
} > "$TMP_BODY"

EXISTING_ID=$(gh api "repos/${GITHUB_REPOSITORY}/issues/${ISSUE}/comments" --paginate \
  --jq "[.[] | select(.body | startswith(\"${MARKER}\")) | .id] | first // empty")

if [[ -n "$EXISTING_ID" ]]; then
  gh api --method PATCH "repos/${GITHUB_REPOSITORY}/issues/comments/${EXISTING_ID}" \
    -f body=@"$TMP_BODY" >/dev/null
  echo "Updated existing triage comment (id $EXISTING_ID) on issue #$ISSUE"
else
  gh api --method POST "repos/${GITHUB_REPOSITORY}/issues/${ISSUE}/comments" \
    -f body=@"$TMP_BODY" >/dev/null
  echo "Created new triage comment on issue #$ISSUE"
fi
