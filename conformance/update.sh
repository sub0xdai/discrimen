#!/usr/bin/env bash
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
vectors="$here/vectors"

impl="${1:-${JEV_SH:-}}"
if [[ -z "$impl" ]]; then
  if [[ -x "$here/../bin/jev.sh" ]]; then
    impl="$here/../bin/jev.sh"
  else
    impl=$(command -v jev.sh || true)
  fi
fi
if [[ -z "$impl" || ! -x "$impl" ]]; then
  printf 'conformance: no implementation to regenerate from\n' >&2
  printf '  pass one as an argument, set JEV_SH, or put jev.sh on PATH\n' >&2
  exit 2
fi

updated=0
for req in "$vectors"/*.request.json; do
  name=$(basename "$req" .request.json)
  if [[ -f "$vectors/$name.expected-exit" ]]; then
    continue
  fi
  "$impl" --spec - --stub --no-pace < <(jq -S -c . "$req") |
    jq -S . >"$vectors/$name.expected.json"
  printf 'updated %s\n' "$name"
  updated=$((updated + 1))
done
printf '\n%s expected envelopes written\n' "$updated"
