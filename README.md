# discrimen

Tools for letting a program ask a model for a judgment, and then check the answer.

The name is Latin for the dividing line, and for the decisive moment. It is the root
of *discrimination*, which in its technical sense means telling things apart. It also
names the line this project draws: the one between a model deciding and a program
acting.

## The problem

Software regularly needs a judgment that no rule can express. Which of three queues
should this message go to. Does this passage support this claim. Is this change
risky.

The usual method is to ask a model in free text and then try to parse the reply. That
is brittle. The reply may be worded unexpectedly, may name something that does not
exist, or may state something plausible that the program cannot act on.

This repository takes a narrower approach.

1. The program writes down the possible answers in advance, and gives each one a
   name it knows how to act on.
2. The model receives that list and the state it needs, and returns one name, or
   reports that it cannot choose.
3. The program checks the returned name against the list it prepared, against the
   current state, and against its own permission rules. Only then does it act.

An example. A message arrives and must reach one of three queues: support, billing,
or neither. The program prepares those three options. The model answers `billing`.
The program confirms that `billing` was one of the three it offered and that the
queue still exists, then routes the message. Had the answer been anything else, the
program would have used a fallback it chose before it asked.

Nothing in that sequence depends on the model's wording. The model picks from a
list. The program holds the list, the rules, and the ability to act.

## What a call looks like

A question, some state, and one envelope back. Run it with `--stub` to see the shape
without a credential and without a network call:

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

A selection works the same way, and its options are named rather than numbered:

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

Drop `--stub` and the same command asks the real model, which needs the credential
from the install step. `--score` takes positional levels with `--level`. Repeat any
of the three flags to put several questions in one request, which costs one round
trip rather than one per question.

## Why there is a second half

Judgments cost money and can be wrong, so the rest of this repository exists to
measure them. One log records every judgment, the options that were available, and
what the program did next. A separate program reads that log and reports whether the
model's answers are good enough to act on.

This is the part that is usually missing. A model that answers plausibly is not the
same as a model whose answers are worth trusting, and the only way to tell the
difference is to keep records and inspect them.

The model used here is TypeSafe's System One, pinned at `jev-1.13.0`. Nothing in
this repository is official or endorsed by the provider.

## What is here

| Path | What it does |
| --- | --- |
| `CONTRACT.md` | Wire shape, question types, pinning rules, policy. |
| `bin/jev.sh` | Transport. Typed questions in, one tagged envelope out. |
| `bin/jev_sieve_report.sh` | Calibration gate. Reads a decision log, prints a verdict. |
| `bin/check-argv.sh` | Tests that the credential never reaches curl's argv. |
| `conformance/` | Offline vectors, and a runner that tests any implementation. |
| `fixtures/` | Three synthetic decision logs, which also document the log schema. |
| `adapters/pi/` | A worked adapter: a hook that hides irrelevant blocks in tool results. |
| `docs/instrument.md` | Why the model, the state, and the question must all be pinned. |
| `docs/security.md` | The audit, and the ten asks it produced. |
| `docs/design-sieve.md` | The design record for the worked adapter. |
| `run.sh` | The whole offline self-test. |
| `install.sh` | Copies the three scripts to `~/.local/bin`. |

## Install

1. Run `./install.sh`, which copies the three scripts to `~/.local/bin`. Change
   the target with `PREFIX`. Write a `chmod 600` file holding `TYPESAFE_API_KEY`
   at `~/.config/typesafe/credentials.env`. Both paths can be overridden with
   `JEV_SH` and `JEV_CRED_FILE`.
2. For the pi adapter, read `adapters/pi/INSTALL.md`.
3. Run `./run.sh`. It needs no credential and makes no network calls.

`jev.sh` reads the credential from that file and hands it to curl through a `0600`
`--config` file, so it never appears in the process list. `check-argv.sh` asserts
this by running curl against a local listener and reading its argv, which needs
Linux and GNU netcat because it inspects `/proc`.

## Verifying without a key

`jev.sh --stub` is a deterministic offline judge. It derives each answer from the
length of the question text, so it needs no credential and touches no network.

That makes `run.sh` a real self-test. It runs the conformance vectors, syntax-checks
the scripts, runs the credential invariant, runs the adapter's own checks, and gates
a fixture decision log. A new clone can run the whole thing and see it pass.

The limit is worth stating. The stub exercises envelope assembly, banding, and
parsing. It cannot say whether a judgment is any good, because it never looks at the
state.

## What this does not claim

- No semantic accuracy is measured anywhere in this repository. The one instrument
  with local data has too few readings to gate, and its gate says so.
- The retry policy, the pacing floor, and every threshold are choices, not results.
  None of them is calibrated against a labelled replay.
- The provider's published rate limit is not verified here. One caller has a choke
  point, and it is per process.
- The adapter ships off by default, because sending a tool result to a hosted model
  should be a deliberate act.

## Working on this repository

Commits are checked by a Presidio hook at `hooks/pre-commit`, enabled per clone with
`git config core.hooksPath hooks` after one `uv sync`. It scans staged `.rs`, `.ts`,
`.tsx`, `.js`, and `.jsx` files and redacts credentials and personal data before they
can be committed.

Its recognisers are allowlisted in `scrub.py`, because Presidio's defaults fire on
ordinary source code: `process.st` reads as a URL, `Date.now` as a person, `i3` as a
licence number. Left unfiltered it rewrites the file it is meant to protect.

The hook deliberately runs without `set -e`, because `scrub.py` exits `2` to mean "I
changed files". Under `set -e` that exit aborts the hook before it can re-stage the
redacted file, so the original secret stays in the index while the working tree looks
clean. Hence no `-e`, and an explicit status instead.

The first run downloads a spaCy model, roughly 600 MB. It lands in `.venv`, which is
not committed, so a fresh clone pays for that once.

## Licence

MIT. See `LICENSE`.

## Related

- The provider: <https://typesafe.ai/blog/introducing-system-one-models-and-jev>
- A macOS coding app that applies the same split to route and tool choices:
  <https://github.com/codejunkie99/keel>
