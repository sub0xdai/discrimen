# Provenance

Where each file came from, what changed on the way in, and what was left behind.

This repository is a copy, not a move. The original files are still at their original
paths and the machine they run on is unaffected. Nothing was deleted to create this.

Lifted on 2026-09-25 from a working integration, then the checks were re-run against
the copies. The results are near the bottom.

## Where each file came from

| Here | Came from | Change |
| --- | --- | --- |
| `bin/jev.sh` | `~/dotfiles/scripts/jev.sh` | none, byte-identical |
| `bin/jev_sieve_report.sh` | `~/dotfiles/scripts/jev_sieve_report.sh` | none, byte-identical |
| `bin/check-argv.sh` | `~/dotfiles/scripts/__check_jev_argv.sh` | renamed, made portable |
| `adapters/pi/jev-sieve.ts` | `~/.pi/agent/extensions/jev-sieve.ts` | transport default |
| `adapters/pi/check.ts` | `~/.pi/jev-sieve.check.ts` | sibling import |
| `adapters/pi/e2e.check.ts` | `~/.pi/jev-sieve.e2e.check.ts` | sibling import |
| `docs/design-sieve.md` | `~/.pi/jev-sieve.md` | paths, one reference dropped |
| `docs/security.md` | `~/.pi/jev-security-feedback.md` | paths, subject-file list |
| `docs/instrument.md` | `~/.pi/jev-tip.md` | paste artifacts removed |
| `scrub.py` | `~/.pi/scrub.py` | comments moved to the README |
| `hooks/pre-commit` | `~/.pi/.git/hooks/pre-commit` | moved out of `.git/`, comments moved |
| everything else | new | written for this repository |

Three of those changes need a word.

The commit hook is versioned here as `hooks/pre-commit` rather than left in `.git/hooks/`,
and enabled with `git config core.hooksPath hooks`. Git ignores `.git/` contents, so a
hook left there is a hook no clone ever gets.

`bin/check-argv.sh` gained a default that points at its sibling transport instead of
`$HOME/dotfiles/scripts/jev.sh`, and a guard that exits `2` when `nc`, `pgrep`, or
`/proc` is missing, rather than reporting a pass it did not earn.

`adapters/pi/jev-sieve.ts` now defaults its transport to `jev.sh` on `PATH`. This is
the only behavioural change in the lifted code. Everything else in `bin/` and
`adapters/` is the original logic.

`docs/instrument.md` had nine lines reading `Image`, left over from a paste. They are
gone. The other two docs each gained a short preamble naming this layout, and
`docs/design-sieve.md` lost one cross-reference to a document that stayed behind.

The scrub hook's two comments moved into the README, because the rule here bans
comments in code and both of them carried a fact worth keeping: why the Presidio
recognisers are allowlisted, and why the hook runs without `set -e`. The logic is
otherwise unchanged, so `scrub.py` and `hooks/pre-commit` differ from the originals
only in whitespace and comments.

The two byte-identical scripts carry their original comment headers. Under this tree's
rule against comments in code, only `@waiver`, `@anchor`, `ponytail`, and toolchain
tokens are allowed. They are here untouched because removing them would change the
artifacts, and this document exists to record what changed, not to rewrite the record.

## What stayed behind

| Left out | Why |
| --- | --- |
| `vox_jev.sh` | bound to a spec workflow's `.specify/` layout and named five times by its skill |
| `typesafe-jev-assessment.md` | mostly a survey of other projects; the method is in `CONTRACT.md` |
| `~/.cache/jev/**` | runtime state: a log, a block cache, a rate-limit breaker |
| harness session logs | real paths and tool output from unrelated work |

The `fixtures/` logs are synthetic and hand-written. No live decision log was copied
into this repository, which is also why the numbers in `docs/design-sieve.md` cannot be
reproduced from anything here.

## Verification after the lift

Run on 2026-09-25 against the copies in this repository, on Linux, node 26.9.0.

| Check | Result |
| --- | --- |
| `conformance/run.sh` | 10 vectors, 0 failed |
| `conformance/run.sh` against a mutated threshold | 7 of 10 vectors fail, as intended |
| `node adapters/pi/check.ts` | pass |
| `node adapters/pi/e2e.check.ts` | pass |
| `bin/check-argv.sh` | pass, the credential is absent from curl's argv |
| `run.sh` | 17 checks, 0 failed |

The mutated-threshold run is worth keeping in mind. A conformance corpus that has never
failed is a corpus nobody has proved can fail.

## Line width

The three lifted documents contain long prose lines, because the tree they came from
puts one sentence on each physical line. They are left as they were. The documents
written for this repository are all under 100 columns.

## References

- The transport default in `adapters/pi/jev-sieve.ts` is the only behavioural change.
- `CONTRACT.md` section 8 records the gaps this lift did not close.
