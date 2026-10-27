# Conformance vectors

Request and expected-envelope pairs.
Each vector pins one part of the contract in `../CONTRACT.md`, so an implementation can
be checked without a credential and without a network call.

## Running

```sh
./run.sh                    # finds ../bin/jev.sh, then jev.sh on PATH
./run.sh /path/to/jev.sh    # or name one
JEV_SH=/path/to/jev.sh ./run.sh
```

Exit codes: `0` when every vector matches, `1` when one differs, `2` when there is no
implementation to test or `jq` is missing.

## File convention

| File | Meaning |
| --- | --- |
| `<name>.request.json` | Request body passed to `--spec -`. Required. |
| `<name>.expected.json` | Expect exit `0` and this envelope. |
| `<name>.expected-exit` | Expect this exit code instead, with no envelope. |

A vector with neither an expected envelope nor an expected exit fails, so a half-written
fixture cannot pass by accident.

The runner feeds each request through `jq -S -c` before the implementation sees it, and
compares envelopes through `jq -S`.
Key order and formatting are therefore irrelevant on both sides, and reformatting a
request file does not invalidate its expected envelope.

## Regenerating

`./update.sh` rewrites every expected envelope from a given implementation.
It skips vectors that carry an expected exit code.
Run it when the reference implementation's stub or banding changes on purpose, then read
the diff.
A regenerated expectation is worthless as a check unless a human agrees with it.

## Coverage

| Vector | Pins |
| --- | --- |
| `noul-band-no` | A reading at the floor, `0.0`, lands in `no`. |
| `noul-band-boundary` | A reading of exactly `0.6` lands in `no`, at `threshold - margin`. |
| `noul-band-uncertain` | A reading of `0.7` stays `uncertain` and is not resolved. |
| `noul-band-yes` | A reading of exactly `0.8` lands in `yes`, at `threshold + margin`. |
| `choice-closed-set` | A `choice` with a criteria map, including a no-match option. |
| `score-levels` | A `score` whose criteria is a positional list, not a map. |
| `batch-mixed` | All three question types in one request, each answered separately. |
| `state-empty` | An empty state object is accepted rather than rejected. |
| `question-unicode` | Multibyte instructions, see below. |
| `malformed-json` | A malformed body exits `2` with no envelope. |

`question-unicode` is chosen so that instruction length in codepoints and in bytes give
different answers.
An implementation that measures a UTF-8 string in bytes, as Rust's `str::len()` does, or
in UTF-16 units, as JavaScript's `.length` does, fails this vector while agreeing on
every other one.
That divergence is real, and this is the cheapest place to catch it.

## Limits

The stub is a deterministic judge, not a model.
It never looks at the state.
It derives each answer from the length of the question text, and it picks the first
criteria key for a `choice`.

The corpus therefore proves envelope assembly, banding, parsing, and error handling.
It says nothing about whether a judgment is any good.
Validating judgment quality is the job of `../bin/jev_sieve_report.sh`.

It also cannot cover provider failures.
A `401`, `422`, `429`, or `529` requires a request to leave the machine.
Those paths are covered by `../bin/check-argv.sh`, which points the transport at a local
listener and asserts what it receives.

## Testing another implementation

Anything that accepts `--spec - --stub --no-pace` on stdin and emits the envelope in
`../CONTRACT.md` section 4 can be passed to `run.sh`.
That is why the corpus is separate from the transport.

An implementation that cannot run offline can still use the requests: capture the body
it would send and compare it with `<name>.request.json` through `jq -S`.
The request side of the contract is testable without a provider.
