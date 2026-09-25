#!/usr/bin/env bash
set -uo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
fixtures="$here/fixtures"
tmp=$(mktemp -d) || exit 2
total=0
failed=0
skipped=0

cleanup() {
  rm -rf "$tmp"
  return 0
}
trap cleanup EXIT

ok() { total=$((total + 1)); printf 'ok    %s\n' "$1"; }
bad() { total=$((total + 1)); failed=$((failed + 1)); printf 'FAIL  %s\n' "$1"; }
skip() { total=$((total + 1)); skipped=$((skipped + 1)); printf 'SKIP  %s (%s)\n' "$1" "$2"; }

printf '== syntax\n'
for script in "$here/run.sh" "$here/install.sh" "$here"/bin/*.sh "$here"/conformance/*.sh; do
  name=${script#"$here"/}
  if bash -n "$script" 2>"$tmp/err"; then
    ok "$name parses"
  else
    bad "$name parses"
    sed 's/^/      /' "$tmp/err"
  fi
done

printf '\n== conformance vectors\n'
if out=$("$here/conformance/run.sh" "$here/bin/jev.sh" 2>&1); then
  ok "envelope contract"
else
  bad "envelope contract"
  printf '%s\n' "$out" | sed 's/^/      /'
fi

printf '\n== calibration gate\n'
blocks="$tmp/blocks"
mkdir -p "$blocks"
for i in $(seq 0 99); do : >"$blocks/s1-b$i-$i-$i.txt"; done

gate() {
  local name="$1" log="$2" pattern="$3" want="$4" bar="${5:-}"
  local out rc
  if [[ -n "$bar" ]]; then
    out=$(JEV_SIEVE_LOG="$log" JEV_SIEVE_BLOCKS="$blocks" JEV_SIEVE_MAX_FN_PCT="$bar" \
      "$here/bin/jev_sieve_report.sh" 2>&1)
  else
    out=$(JEV_SIEVE_LOG="$log" JEV_SIEVE_BLOCKS="$blocks" \
      "$here/bin/jev_sieve_report.sh" 2>&1)
  fi
  rc=$?
  if [[ "$rc" != "$want" ]]; then
    bad "gate: $name (exit $rc, wanted $want)"
    printf '%s\n' "$out" | sed 's/^/      /'
  elif [[ "$out" != *"$pattern"* ]]; then
    bad "gate: $name (no \"$pattern\" in the verdict)"
    printf '%s\n' "$out" | sed 's/^/      /'
  else
    ok "gate: $name"
  fi
}

gate "too few readings" "$fixtures/sieve-readings.jsonl" "Too few to tell a" 1
gate "flat instrument" "$fixtures/sieve-flat.jsonl" "The instrument is flat" 1
gate "instrument separates" "$fixtures/sieve-separated.jsonl" "the instrument separates" 1
gate "unjudged blocks are named" "$fixtures/sieve-separated.jsonl" "came back unjudged" 1
gate "read-back bound fails the bar" "$fixtures/sieve-live.jsonl" "NOT QUALIFIED" 1
gate "read-back bound passes a wider bar" "$fixtures/sieve-live.jsonl" "QUALIFIED" 0 5

printf '\n== harness adapter\n'
node_bin=$(command -v node || true)
if [[ -z "$node_bin" ]]; then
  skip "adapter checks" "node not found"
else
  major=$("$node_bin" --version | sed 's/^v//' | cut -d. -f1)
  if ((major < 22)); then
    skip "adapter checks" "node $major cannot strip types"
  else
    flag=""
    ((major < 24)) && flag="--experimental-strip-types"
    for check in check.ts e2e.check.ts; do
      if out=$("$node_bin" $flag "$here/adapters/pi/$check" 2>&1); then
        ok "adapter: $check"
      else
        bad "adapter: $check"
        printf '%s\n' "$out" | tail -6 | sed 's/^/      /'
      fi
    done
  fi
fi

printf '\n== credential handling\n'
if [[ -r /proc/self/cmdline ]] && command -v nc >/dev/null 2>&1 &&
  command -v pgrep >/dev/null 2>&1; then
  if out=$("$here/bin/check-argv.sh" 2>&1); then
    ok "the credential stays out of argv"
  else
    rc=$?
    if ((rc == 2)); then
      skip "the credential stays out of argv" "$(printf '%s' "$out" | tail -1)"
    else
      bad "the credential stays out of argv"
      printf '%s\n' "$out" | sed 's/^/      /'
    fi
  fi
else
  skip "the credential stays out of argv" "needs Linux /proc and GNU netcat"
fi

printf '\n%s checks, %s failed, %s skipped\n' "$total" "$failed" "$skipped"
if ((failed > 0)); then
  exit 1
fi
exit 0
