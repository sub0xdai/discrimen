#!/usr/bin/env bash
set -uo pipefail

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
  printf 'conformance: no implementation to test\n' >&2
  printf '  pass one as an argument, set JEV_SH, or put jev.sh on PATH\n' >&2
  exit 2
fi
if ! command -v jq >/dev/null 2>&1; then
  printf 'conformance: jq is required\n' >&2
  exit 2
fi

total=0
failed=0

for req in "$vectors"/*.request.json; do
  name=$(basename "$req" .request.json)
  expected="$vectors/$name.expected.json"
  expected_exit="$vectors/$name.expected-exit"
  total=$((total + 1))

  if [[ -f "$expected" ]]; then
    actual=$("$impl" --spec - --stub --no-pace < <(jq -S -c . "$req") 2>/dev/null)
    rc=$?
    if ((rc != 0)); then
      printf 'FAIL  %s: exit %s, wanted 0\n' "$name" "$rc"
      failed=$((failed + 1))
      continue
    fi
    if diff <(jq -S . "$expected") <(jq -S . <<<"$actual") >/dev/null 2>&1; then
      printf 'ok    %s\n' "$name"
    else
      printf 'FAIL  %s: envelope differs\n' "$name"
      diff <(jq -S . "$expected") <(jq -S . <<<"$actual") 2>/dev/null | head -20
      failed=$((failed + 1))
    fi
  elif [[ -f "$expected_exit" ]]; then
    want=$(tr -d '[:space:]' <"$expected_exit")
    "$impl" --spec - --stub --no-pace <"$req" >/dev/null 2>&1
    rc=$?
    if ((rc == want)); then
      printf 'ok    %s (exit %s)\n' "$name" "$rc"
    else
      printf 'FAIL  %s: exit %s, wanted %s\n' "$name" "$rc" "$want"
      failed=$((failed + 1))
    fi
  else
    printf 'FAIL  %s: no expected envelope and no expected exit\n' "$name"
    failed=$((failed + 1))
  fi
done

printf '\n%s vectors, %s failed\n' "$total" "$failed"
if ((failed > 0)); then
  exit 1
fi
exit 0
