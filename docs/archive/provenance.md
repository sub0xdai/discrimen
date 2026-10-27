# Provenance

Where each file came from, what changed, and what was left behind.

This repository is a copy, not a move.
The originals remain at their original paths and the machine they run on is unaffected.
Nothing was deleted to create this repository.

The files were lifted on 2026-09-25 from a working integration, then the checks were
re-run against the copies.

## Sources

| Here | Came from | Change |
| --- | --- | --- |
| `bin/jev.sh` | `~/dotfiles/scripts/jev.sh` | None, byte-identical. |
| `bin/jev_sieve_report.sh` | `~/dotfiles/scripts/jev_sieve_report.sh` | None, byte-identical. |
| `bin/check-argv.sh` | `~/dotfiles/scripts/__check_jev_argv.sh` | Renamed, made portable. |
| `adapters/pi/jev-sieve.ts` | `~/.pi/agent/extensions/jev-sieve.ts` | Transport default. |
| `adapters/pi/check.ts` | `~/.pi/jev-sieve.check.ts` | Sibling import. |
| `adapters/pi/e2e.check.ts` | `~/.pi/jev-sieve.e2e.check.ts` | Sibling import. |
| `docs/design-sieve.md` | `~/.pi/jev-sieve.md` | Paths, one reference dropped. |
| `docs/security.md` | `~/.pi/jev-security-feedback.md` | Paths, subject-file list. |
| `docs/instrument.md` | `~/.pi/jev-tip.md` | Paste artifacts removed. |
| `scrub.py` | `~/.pi/scrub.py` | Comments moved to the README. |
| `hooks/pre-commit` | `~/.pi/.git/hooks/pre-commit` | Moved out of `.git/`, comments moved. |
| Everything else | New | Written for this repository. |

## Notable changes

- **Commit hook.** Versioned as `hooks/pre-commit` instead of `.git/hooks/`, enabled
  with `git config core.hooksPath hooks`.
  Git ignores `.git/`, so a hook left there is never cloned.
- **`bin/check-argv.sh`.** Defaults to its sibling transport instead of
  `$HOME/dotfiles/scripts/jev.sh`.
  It exits `2` when `nc`, `pgrep`, or `/proc` is missing, rather than reporting a pass
  it did not earn.
- **`adapters/pi/jev-sieve.ts`.** Defaults its transport to `jev.sh` on `PATH`.
  This is the only behavioral change in the lifted code.
- **`docs/instrument.md`.** Nine lines reading `Image` were left over from a paste and
  are removed.
- **Docs preambles.** `docs/security.md` and `docs/design-sieve.md` gained a short
  preamble naming this layout.
  `docs/design-sieve.md` also lost one cross-reference to a document that stayed
  behind.
- **Scrub hook comments.** Two comments moved into the README because the repository
  bans comments in code.
  Both carried a fact worth keeping: why the Presidio recognisers are allowlisted, and
  why the hook runs without `set -e`.
  The logic is unchanged; `scrub.py` and `hooks/pre-commit` differ from the originals
  only in whitespace and comments.
- **Byte-identical scripts.** `bin/jev.sh` and `bin/jev_sieve_report.sh` keep their
  original comment headers.
  Removing them would change the artifacts, and this document records what changed
  rather than rewriting the record.

## Left behind

| Item | Why |
| --- | --- |
| `vox_jev.sh` | Bound to a spec workflow's `.specify/` layout and named five times by its skill. |
| `typesafe-jev-assessment.md` | Mostly a survey of other projects; the method is in `CONTRACT.md`. |
| `~/.cache/jev/**` | Runtime state: log, block cache, rate-limit breaker. |
| Harness session logs | Real paths and tool output from unrelated work. |

The `fixtures/` logs are synthetic and hand-written.
No live decision log was copied, which is also why the numbers in
`docs/design-sieve.md` cannot be reproduced from anything here.

## Verification after the lift

Run on 2026-09-25 against the copies, on Linux, node 26.9.0.

| Check | Result |
| --- | --- |
| `conformance/run.sh` | 10 vectors, 0 failed |
| `conformance/run.sh` against a mutated threshold | 7 of 10 vectors fail, as intended |
| `node adapters/pi/check.ts` | Pass |
| `node adapters/pi/e2e.check.ts` | Pass |
| `bin/check-argv.sh` | Pass; the credential is absent from curl's argv |
| `run.sh` | 17 checks, 0 failed |

The mutated-threshold run matters: a conformance corpus that has never failed has not
been shown to be capable of failing.

## Line width

Documents in this repository use one sentence per line and stay under 100 columns.
Table rows are the exception because they cannot wrap.

## References

- The transport default in `adapters/pi/jev-sieve.ts` is the only behavioral change.
- `CONTRACT.md` section 8 records the gaps this lift did not close.
