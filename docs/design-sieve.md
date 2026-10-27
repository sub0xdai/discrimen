# jev-sieve design record

Design record for `adapters/pi/jev-sieve.ts`.
The decisions that lived in source comments are documented here, because the repository
bans comments in code.
Paths use this repository's layout.

## Behavior

Every large `read`, `bash`, `grep`, `ffgrep`, or `fffind` result is judged block by
block before it enters the model's context.
A block the judge is confident is irrelevant is replaced by a short stub naming a file
that holds the full text.
Nothing is lost: the agent can read the file back, including with an offset and limit.

Rules:

- Shadow first: log the decision, change nothing, calibrate later.
- Bounded action: hide a block, never drop the result or refuse the tool.
- Fail open: no key, timeout, or parse failure leaves the result untouched.
- Never resolve uncertainty: an uncertain block is kept verbatim.
- An error result is never altered.

The last two are not configurable.

## Modes

`JEV_SIEVE`:

| Value | Effect |
| --- | --- |
| `off` | Does nothing. Default since 2026-09-23. |
| `shadow` | Judges and logs without modifying. |
| `on` | Replaces confident-irrelevant blocks with a stub. |

Shadow sends the same bytes as `on`, so it is not an egress-safe mode.

## Configuration

All settings are environment variables.
An empty value counts as unset, because `Number("")` is `0`, which would silently select
the most aggressive value.

| Variable | Default | Effect |
| --- | --- | --- |
| `JEV_SIEVE` | `off` | `off`, `shadow`, or `on` |
| `JEV_SIEVE_MODEL` | `jev-1.13.0` | Pinned model, and what the response is checked against |
| `JEV_SIEVE_THRESHOLD` | `0.3` | Below `threshold - margin`, a block is hidden |
| `JEV_SIEVE_MARGIN` | `0.2` | Width of the uncertain band on each side |
| `JEV_SIEVE_MIN_CHARS` | `1500` | Results smaller than this are left alone |
| `JEV_SIEVE_BLOCK_LINES` | `25` | Lines per judged block |
| `JEV_SIEVE_TOOLS` | `read,bash,grep,ffgrep,fffind` | Which tools are judged |
| `JEV_SIEVE_MAX_BATCH_CHARS` | `100000` | Request budget, split into passes when exceeded |
| `JEV_SIEVE_QUEUE` | `8` | How many results may wait for a judgment |
| `JEV_SIEVE_TASK_CHARS` | `4000` | Recent user text sent as the task |
| `JEV_SIEVE_DENY` | empty | Extra comma-separated regexes that stop egress |
| `JEV_SIEVE_RETENTION_DAYS` | `14` | Cached block lifetime, `0` keeps forever |
| `JEV_SH` | `jev.sh` | Transport to spawn |
| `JEV_CACHE_DIR` | `~/.cache/jev` | Log and block cache |

## Decision log

`$JEV_CACHE_DIR/sieve.jsonl` has two entry kinds:

- `decision`: one per judgment, carrying the instrument versions that produced it.
- `recall`: the agent reading a replaced block back out of the cache.

A recall is the one free ground-truth label available inside the harness: it means the
hide was wrong.
Both modes write the block text for every block the band marked `no`, so shadow builds
the dataset used to calibrate the threshold.
Only `on` writes a stub, so only `on` can produce a recall.
A shadow sample must be labeled by hand.

`bin/jev_sieve_report.sh` reads the samples and labels and prints a verdict.

## Queue and batching

Parallel results are queued, not dropped.
pi runs sibling tool calls from one assistant message concurrently, so two large reads
can land at once.
Jobs run in arrival order, one Jev call at a time.
The queue is bounded by `JEV_SIEVE_QUEUE`.
Overflow is logged as queue-full rather than lost.
Both arms release the slot, so a failing job cannot wedge the queue.

The batch budget leaves room for the task, the source, the question wrappers, and JSON
punctuation.

A document too large for one request is judged in several passes.
A block that alone exceeds the budget is sliced by lines.
Every block survives into exactly one batch, so nothing goes unjudged.
Passes run in order and are merged by id.
A single line longer than the budget cannot be sliced without losing its line range in
the stub; it travels alone and fails open.
Ids are reassigned in document order within each batch.

The child may exit before reading all stdin, which raises `EPIPE` on write.
The write error is swallowed and `close` decides the outcome.

## Banding

The default band is winnow's calibrated drop point: a block is hidden only when the
probability it is needed is 0.10 or below.
Everything from there to 0.50 is kept as uncertain.

A verdict and a decision are tagged unions; no booleans gate their fields.
The script's envelope is parsed at the boundary into a closed set.

Banding is derived locally from the probability and never taken from the envelope's
`band` field.
The script's 0.70/0.10 banding is not this extension's policy.
Letting the envelope win previously hid blocks with a 55% chance of being needed.

Decimal probabilities meet a decimal threshold, so boundary tests allow for float
representation error.
In binary floating point, `0.3 - 0.2` is `0.09999999999999998`, which would push a
`noul` of exactly 0.10 out of the hide band.

`verdictFor` returns a usable verdict or null when the envelope carries no probability.
The envelope's band is ignored.

## Instrument pinning

The instrument is `(model, state representation, question)`.
All three are pinned.
Any change to the state shape, question text, or model is a deliberate bump, so
readings from before and after are not averaged.

Question history:

- v1 named the block by question key.
  That key is the caller's handle and is never sent to the model, so every sibling
  question arrived identical and so did the answers.
- v2 names the block path.

The question template is fixed except for the block path.
The path follows TypeSafe's fan-out example (`items[i]`) and their guidance to identify
relevant state by name.
Measured cost of not naming the path, over 1,278 judged blocks: within-document
standard deviation 0.008, range 0.12-0.55, and no block reached the hide band.

The model is pinned.
`JEV_SIEVE_MODEL` overrides it only for a deliberate model-rollover A/B.
`jev-latest` moves under the log, and the model is the one tuple member a floating alias
leaves unpinned.

## namedInTask

`namedInTask` is true when the request names something the task also names.
It is a substring test on basenames, the deterministic half of "was this asked for on
purpose".
The model still decides what to do with it.
This closed the case where a deliberately targeted read produced confident "not needed"
answers on source the agent had explicitly asked for.

`recallPath` finds a replaced block being read back, by `read` or by `bash`.
The cache filename carries session, block id, and line range, so a recall joins back to
the decision that produced it.
Re-running the command also recovers the text, unlabeled; that case is not detected.

## Egress denylist

Egress, data at rest, and credential handling changed after the 2026-09-23 security
review.
The sieve logic did not need those changes.

`egressFor` runs before any request is built and returns a tagged `allow` or `deny`
carrying the rule that fired.
A denied result is never sent, never cached, and never modified.
It is logged once as `result: egress-denied` with the reason.

Rules run over the path, then the content, then the task text:

- Paths: dotenv, credential, private-key, keystore, cloud, wallet, Docker config.
- Content: private-key blocks, AWS, GitHub, Slack and provider keys, JWTs, bearer
  headers, assigned secrets, connection strings, basic-auth URLs.
- Task text: the same content rules, because the task travels as state.

`JEV_SIEVE_DENY` appends comma-separated regexes and warns once on an invalid one.
Over-broad is the safe direction: a false deny costs context savings, a false allow
leaks.

## Data at rest

The cache directory and cached block files are created 0700 and 0600.
`pruneBlocks` re-tightens the directory and deletes block text older than
`JEV_SIEVE_RETENTION_DAYS` once per process.
A decision logs the tool, `namedInTask`, size, block count, and the verdict vector, not
the command or path.
The log is metadata; the cached block is content, so only the content is pruned.

`ponytail: samples never pruned` was the original behavior: a superseded instrument's
samples sat beside the current one.

## Credential handling

`jev.sh` writes the bearer header into a 0600 `mktemp` file and passes it to curl with
`--config`.
The key is therefore not in the process list.
A key containing a quote or newline is rejected as `invalid` rather than mangled by the
config format.

## Checks

The pure logic is in `adapters/pi/check.ts`; the impure half is in
`adapters/pi/e2e.check.ts`.
Both sit outside the extension directory so pi does not load them as extensions.

The e2e test exists for one invariant: shadow must cache the block text of every hide
candidate while leaving the content alone.
If that breaks, shadow silently stops producing a dataset and the gate blames a flat
instrument instead of a broken cache write.
It also covers a denied result (cache nothing, log the rule), the 0700 and 0600 modes,
and a drifted model (cache nothing, log `model-mismatch:jev-latest`).
`JEV_SH` points at a stub, so the test uses no network and no API key.
Everything lives in a temporary directory.

The pure check pins:

- Versioned state, a pinned model, and one question per block naming its own path.
- Banding keeps the uncertain middle and holds the 0.10 boundary against float error.
- `splitBlocks` numbers from line 1 and drops blank blocks.
- `namedInTask` and `recallPath`.
- Every block survives into exactly one pass; an unsliceable line travels alone.
- A question's named path is its position in that pass's own state array.
- A hidden block becomes a stub naming the exact range to read back.
- `egressFor` cases.

The split fixture is chosen to split, because a multi-pass split is where path indexing
can drift.

## Gate diagnosis, 2026-09-25

The extension now reads the envelope's `model` and compares it with the pinned model
before using any verdict.
The request pinned the model; the response never was.
`jev.sh` already put the served model in the envelope and the extension discarded it, so
a reading served by `jev-latest` was logged as `jev-1.13.0` evidence.
The comparison happens in `envelopeFor`; a mismatch, including a missing model, becomes
an error envelope with `model-mismatch:<served>`.
Downstream treats that as no verdict, the same fail-open path as a timeout.

`no-judgment` now carries a `reason` from the first failed envelope.
Before, a whole document rejected by a drifted model logged a bare `no-judgment`.

`jev_sieve_report.sh` now reads the whole verdict vector, not only the hide band, and
reports readings, distinct values, and range beside the candidate count.

- Zero candidates with fewer than `JEV_SIEVE_MIN_READINGS` readings: too few to tell.
- At or above the floor, distinct values at or below one fiftieth of the readings: flat
  instrument.
- Otherwise: the instrument separates but has not reached the band.

The gate also prints offered blocks that came back unjudged, so a partial response
cannot hide in a smaller denominator.

Two pre-existing bugs surfaced in the path that runs only when the sieve hides
something:

- `[($cand[] | select(.live) | .f) | unique[]]` applied `unique` to each string instead
  of the array.
  The gate died with `cannot be sorted, as it is not an array` as soon as a block
  reached the hide band.
- The failure left `ROWS` empty, which printed `no decisions logged yet. Nothing to
  gate.` and exited 0.
  An instrument with a live hide looked like an empty log, with the exit code ask 6
  would wire into `on`.

The live set is built with `map`, and an unreadable log now exits 2 instead of 0.

`check.ts` pins the boundary parse.
`e2e.check.ts` points the stub at a drifting model and asserts that nothing is
cached and the log names `model-mismatch:jev-latest`.
Both fail against the previous extension, which cached the drifted reading as a fourth
candidate.
