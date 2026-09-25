#!/usr/bin/env bash
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
prefix="${PREFIX:-$HOME/.local}"
target="$prefix/bin"

mkdir -p "$target"
for script in jev.sh jev_sieve_report.sh check-argv.sh; do
  install -m 755 "$here/bin/$script" "$target/$script"
  printf 'installed %s\n' "$target/$script"
done

case ":${PATH}:" in
  *":$target:"*) ;;
  *) printf '\nnote: %s is not on PATH\n' "$target" ;;
esac
