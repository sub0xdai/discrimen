# The contract

**The host prepares the options. The model classifies. The host checks the classification.**

That split is the whole design. A model may say which prepared option applies.
It may not invent an option, execute anything, or grant itself permission.

Everything a second implementation has to match lives here: the wire shape, the
question types, the pinning rules, and the policy. Four consumers implement it in
three languages today. This is the only place that records which of their
differences are deliberate.

## 1. The request

`POST <base>/v1/systemone` with a bearer credential, and a JSON body.

```json
{
  "model": "jev-1.13.0",
  "state": { "schema": "example.state.v1", "task": "...", "context": "..." },
  "questions": { "q0": { "type": "noul", "instructions": "..." } }
}
```

Rules that hold in every implementation:

- `state` is data. Instructions belong in `criteria`, never in `state`.
- The question key is the caller's handle and carries no meaning to the model, so a
  question about its own subject has to name that subject in its text.
- One request may carry many questions. They are evaluated independently, so no
  question may depend on the answer to a sibling in the same request.
- Pin `model` to a version. A floating alias moves underneath a log that records it.

## 2. Question types

| Type | Returns | Use when |
| --- | --- | --- |
| `noul` | one probability in [0,1] | a yes/no property judged against evidence |
| `choice` | a chosen id, per-id probabilities, a confidence | selecting from a closed set |
| `score` | the probability-weighted level | an ordered descriptive rubric |

- A `choice` carries a `criteria` map keyed by option id, and the caller must be able
  to run every option it offers.
- A `score` carries positional levels. The API returns 422 if its criteria is a map.
- Give a `choice` a no-match route, or ask a separate applicability question.
  Without one, a perfectly valid answer is still the least-wrong option available.
- Confidence describes the answer distribution. It is not an independent check, and
  a high value is not evidence that the classification is right.
- Add a second question over the same state only when it measures a different
  property. Two questions that test the same thing manufacture false certainty.

## 3. What the host owns

- **The candidate set.** Filtered to what the host can actually run before the model
  sees it. A model cannot choose an option that was left out, so a missing candidate
  is a host defect rather than a judgment error. Record the candidate list that
  existed at decision time, not the one that exists when the trace is read.
- **Banding.** The caller derives yes, no, or uncertain from the returned probability
  using its own constants, and never adopts the envelope's band as policy.
- **Permission.** A selection never grants it. The existing approval path applies
  unchanged, and a confidence value changes nothing.
- **Fallback.** Declared before the call, recorded when it fires, and never counted
  as a successful classification.
- **Egress.** The caller decides what may leave the machine. See section 6.
- **Freshness.** A result is bound to the state it was judged against. Recheck the
  state and the target before applying either.

## 4. The envelope

`jev.sh` emits one JSON object on stdout, and exits 0 for every judgment outcome
including failure, so a caller never has to tell "no verdict" from "broken script".
Bad arguments are the exception and exit 2, because that is a programmer error
rather than a judgment.

Every envelope carries `schema_version: "1"` alongside `status`.

| `status` | Other fields | Meaning |
| --- | --- | --- |
| `ok` | `model`, `answers`, `verdicts`, `usage` | a judgment arrived |
| `disabled` | none | no credential, so nothing was sent |
| `error` | `reason` | the request was attempted and failed, or was refused |

`reason` is one of `timeout`, `transport`, `unauthorized`, `invalid`,
`rate_limited`, `overloaded`, or `error`. `verdicts` adds local banding on top of
the raw `answers`. `--stub` adds `stub: true` and needs no network.

The shape is a tagged union. No implementation here uses a boolean gate or an
optional error string sitting beside a success payload.

## 5. Pinning

A judgment is only as good as the instrument that produced it, and the instrument is
the tuple `(model, state representation, question text)`.

- Pin the model to a version rather than an alias.
- Bump the question id whenever the question text changes. A reading taken under old
  wording is not comparable with one taken under new wording, and an id that did not
  move silently averages them.
- Keep the state schema fixed within one instrument version.
- Verify the served model in the response before using any verdict. This is the one
  that gets skipped, in two languages independently. See section 8.

## 6. Egress

Only the harness adapter filters state before sending. `jev.sh` and the Rust client
send the state they are given, and neither scrubs it.

If you call either directly, you own the rules. An env file, a credential file, a
private key, a keystore, a wallet, a cloud config, and their content shapes are all
things a caller should refuse before the request is built. Over-broad is the safe
direction here: a false deny costs context savings, a false allow leaks.

## 7. Divergence

Four consumers implement this contract. The differences below are real, and this
table exists so a reader can tell a decision from an accident.

| | jev.sh | pi adapter | vox | Rust |
| --- | --- | --- | --- | --- |
| Model | pinned, env override | pinned, verifies response | inherits | pinned, alias defined |
| Types | noul, choice, score | noul only | noul, choice | noul, choice, score |
| Banding | 0.70 / 0.10 in-script | 0.30 / 0.20 host-side | consumes script bands | none, raw |
| Retry | never, one POST | n/a | n/a | per call site, 1 or 4 |
| Pacing | 2s choke point | queue depth 8 | inherits | 60s sweep floor |
| Egress filter | none | denylist pre-request | none | none |
| Decision log | none | sieve.jsonl | vox.jsonl | journal + tracing |
| Offline mode | --stub | stub via JEV_SH | inherits | wiremock |
| Lives in | this repo | this repo | dotfiles | testudo |

Two rows deserve spelling out.

**Retry.** `jev.sh` never retries: one judgment is one POST, so a retry cannot
double a spend. The Rust client retries transient failures, on the stated grounds
that an evaluation has no side effects and so cannot duplicate work. Both are
defensible, and neither is written down as the house rule. A 401 and a 422 are never
retried anywhere, because a rejected credential does not fix itself and a retry
turns one bad key into a request storm.

**Pacing.** Only `jev.sh` has a choke point, and it is per process. Two callers
sharing one key do not coordinate, and the provider's real quota is unpublished.
Treat the published figure as unusable until you have measured it.

## 8. Known gaps

Recorded here so a reader does not have to find them.

1. The served model is checked in exactly one consumer. The pi adapter refuses a
   mismatch as of 2026-09-25. The Rust client reads `response.model` for logging
   only, and asserts it in a mock test rather than in production code.
2. No implementation here has measured semantic accuracy. The one instrument with
   local data has too few readings to gate, and the gate reports that.
3. Every threshold in shipping code is an uncalibrated placeholder: 0.70 and 0.10 in
   `jev.sh`, 0.30 and 0.20 in the adapter, and 0.60 in the Rust client, whose own
   test is named `threshold_is_the_documented_placeholder`.
4. Nothing coordinates rate limits across implementations. The aggregate request
   rate against one key is unmanaged.
5. The offline stub derives answers from the length of the question text. It proves
   envelope assembly, banding, and parsing. It says nothing about judgment quality.

## References

- <https://typesafe.ai/blog/introducing-system-one-models-and-jev>
- `docs/instrument.md` for qualifying the tuple in section 5
- `docs/security.md` for the review behind section 6
- `docs/design-sieve.md` for the measured instrument and what it failed to show
