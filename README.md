# discrimen

[![ci][ci-badge]][ci]

Ask a model for a judgment from a fixed list of answers, then check the answer before
acting on it.

## How it works

1. The program defines the possible answers and gives each one a name it can act on.
2. The model receives the state and the list, and returns one name, or reports that it
   cannot choose.
3. The program checks the returned name against the prepared list, the current state,
   and its permission rules. Only then does it act.

Example: a message must go to support, billing, or neither.
The program prepares those three options.
The model answers `billing`.
The program confirms that `billing` was offered and that the queue still exists, then
routes the message.
Any other answer uses a fallback chosen before the call.

This removes dependence on model wording.
The model picks from a list the program controls.

## Usage

Each call returns one JSON envelope.
The `--stub` flag runs the same path offline, with no credential and no network call:

```sh
jev.sh --stub --noul 'Does the passage support the claim?' --state 'a claim and a passage'
```

```json
{
  "schema_version": "1",
  "status": "ok",
  "stub": true,
  "model": "jev-1.13.0",
  "answers": { "q1": { "type": "noul", "noul": 0.8 } },
  "verdicts": { "q1": { "type": "noul", "noul": 0.8,
                        "threshold": 0.70, "margin": 0.10, "band": "yes" } },
  "usage": null
}
```

A selection names its options instead of numbering them:

```sh
jev.sh --stub --choice 'Which queue?' \
  --option billing='An invoice' --option support='A bug' --state 'a message'
```

```json
{
  "schema_version": "1",
  "status": "ok",
  "stub": true,
  "model": "jev-1.13.0",
  "answers": { "q1": { "type": "choice", "choice": "billing",
                       "probabilities": { "billing": 1, "support": 0 },
                       "confidence": 1 } },
  "verdicts": { "q1": { "type": "choice", "choice": "billing",
                        "probability": 1, "confidence": 1 } },
  "usage": null
}
```

Drop `--stub` to call the real model, which needs the credential from the install step.
`--score` takes positional levels with `--level`.
Repeat a question flag to send several questions in one request, which costs one round
trip instead of one per question.

## Measurement

Judgments cost money and can be wrong.
The rest of this repository measures them.
A decision log records every judgment, the options that were available, and what the
program did next.
`jev_sieve_report.sh` reads that log and reports whether the answers are good enough to
act on.

A model that answers plausibly is not necessarily correct.
Keeping records is the only way to tell.

The model is TypeSafe's System One, pinned at `jev-1.13.0`.
Nothing in this repository is official or endorsed by the provider.

## Layout

| Path | Purpose |
| --- | --- |
| `CONTRACT.md` | Wire shape, question types, pinning rules, policy. |
| `bin/jev.sh` | Transport. Typed questions in, one tagged envelope out. |
| `bin/jev_sieve_report.sh` | Calibration gate. Reads a decision log, prints a verdict. |
| `bin/check-argv.sh` | Tests that the credential never reaches curl's argv. |
| `conformance/` | Offline vectors, and a runner for any implementation. |
| `fixtures/` | Four synthetic decision logs, which also document the log schema. |
| `adapters/pi/` | Worked adapter: a hook that hides irrelevant blocks in tool results. |
| `docs/instrument.md` | What to pin, and how to validate a judgment. |
| `docs/security.md` | The audit, and the ten asks it produced. |
| `docs/design-sieve.md` | Design record for the worked adapter. |
| `run.sh` | The offline self-test. |
| `install.sh` | Copies the three scripts to `~/.local/bin`. |

## Install

1. Run `./install.sh`.
   It copies the three scripts to `~/.local/bin`.
   Set `PREFIX` to change the target.
2. Write a `chmod 600` file at `~/.config/typesafe/credentials.env` containing
   `TYPESAFE_API_KEY=...`.
   Override the path with `JEV_CRED_FILE`.
3. For the pi adapter, read `adapters/pi/INSTALL.md`.
4. Run `./run.sh`.
   It needs no credential and makes no network calls.

`jev.sh` reads the credential from that file and passes it to curl through a `0600`
`--config` file, so it never appears in the process list.
`check-argv.sh` asserts this by running curl against a local listener and reading its
argv.
It needs Linux and GNU netcat because it inspects `/proc`.

Environment overrides: `JEV_SH` points the adapter at a transport, and `JEV_CRED_FILE`
sets the credential file.

## Offline verification

`jev.sh --stub` is a deterministic offline judge.
It derives each answer from the length of the question text, so it needs no credential
and touches no network.

`run.sh` is therefore a real self-test.
It runs the conformance vectors, syntax-checks the scripts, runs the credential
invariant, runs the adapter's own checks, and gates a fixture decision log.
A new clone can run the whole thing and see it pass.

The stub exercises envelope assembly, banding, and parsing.
It cannot judge judgment quality, because it never looks at the state.

## Limits

- No semantic accuracy is measured in this repository.
  The one setup with local data has too few readings to gate, and its gate says so.
- The retry policy, the pacing floor, and every threshold are choices, not results.
  None is calibrated against a labelled replay.
- The provider's published rate limit is not verified here.
  One caller has a choke point, and it is per process.
- The adapter ships off by default.
  Sending a tool result to a hosted model should be an explicit choice.

## Development

Commits are checked by a Presidio hook at `hooks/pre-commit`.
Enable it per clone with `git config core.hooksPath hooks` after one `uv sync`.
It scans staged `.rs`, `.ts`, `.tsx`, `.js`, and `.jsx` files and redacts credentials
and personal data before they can be committed.

Its recognisers are allowlisted in `scrub.py` because Presidio's defaults fire on
ordinary source code: `process.st` reads as a URL, `Date.now` as a person, and `i3` as a
licence number.
Left unfiltered, it rewrites the file it is meant to protect.

The hook deliberately runs without `set -e`.
`scrub.py` exits `2` to mean "I changed files", and under `set -e` that exit aborts the
hook before it can re-stage the redacted file.
The original secret would stay in the index while the working tree looks clean.
The hook therefore uses an explicit status check instead.

The first run downloads a spaCy model, about 600 MB.
It lands in `.venv`, which is not committed.

## Licence

MIT. See `LICENSE`.

## Related

- The provider: <https://typesafe.ai/blog/introducing-system-one-models-and-jev>
- A macOS coding app that applies the same split to route and tool choices:
  <https://github.com/codejunkie99/keel>

[ci]: https://github.com/sub0xdai/discrimen/actions/workflows/ci.yml
[ci-badge]: https://github.com/sub0xdai/discrimen/actions/workflows/ci.yml/badge.svg
