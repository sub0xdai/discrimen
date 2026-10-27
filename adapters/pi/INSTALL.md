# pi adapter

Worked example of the loop in `../../CONTRACT.md`, applied to one harness.

The adapter hooks `tool_result` before a tool result enters the model's context.
Large results are split into blocks and judged one block at a time.
A block the judge is confident is irrelevant is replaced with a short stub naming a
file that holds the full text, so the agent can read it back.

Nothing is dropped.
An uncertain block is kept verbatim, and an error result is never touched.

## Requirements

| Requirement | Why |
| --- | --- |
| pi, with extension support | It registers a `tool_result` handler. |
| node 22.6 or newer | The source is TypeScript and loads without a build step. |
| `jq`, `curl`, `bash` | `jev.sh` uses all three. |
| `jev.sh` on `PATH`, or `JEV_SH` | The extension spawns it, one judgment per call. |
| A credential | `~/.config/typesafe/credentials.env`, mode `600`. |

Run `../../install.sh` first to put the transport on `PATH`.
The extension fails open when the transport is missing: the tool result is left as it
was.

## Install

```sh
mkdir -p ~/.pi/agent/extensions
cp jev-sieve.ts ~/.pi/agent/extensions/jev-sieve.ts
```

Set a mode.
`off` is the default, on purpose: sending a tool result to a hosted model should be an
explicit choice.

```sh
export JEV_SIEVE=shadow   # judge and log, change nothing
export JEV_SIEVE=on       # judge and replace
```

Start with `shadow`.
It writes the same records as `on` and modifies nothing.

## Checks

Both checks run offline, with no credential and no network call.

```sh
node check.ts        # pure half: block splitting, banding, egress, pinning
node e2e.check.ts    # impure half: a stub transport in a temp directory
```

`../../run.sh` runs both.
The e2e check points `JEV_SH` at a stub, so it exercises the cache write, the egress
refusal, the drifted-model refusal, and the file modes without touching the real cache.

## Settings

Every setting is an environment variable.
An empty value counts as unset, because `Number("")` is `0` and would silently select the
most aggressive value.

| Variable | Default | Effect |
| --- | --- | --- |
| `JEV_SIEVE` | `off` | `off`, `shadow`, or `on` |
| `JEV_SIEVE_MODEL` | `jev-1.13.0` | Pinned model, and what the response is checked against |
| `JEV_SIEVE_THRESHOLD` | `0.3` | Below `threshold - margin`, a block is hidden |
| `JEV_SIEVE_MARGIN` | `0.2` | Width of the uncertain band on each side |
| `JEV_SIEVE_MIN_CHARS` | `1500` | Results smaller than this are left alone |
| `JEV_SIEVE_BLOCK_LINES` | `25` | Lines per judged block |
| `JEV_SIEVE_TOOLS` | `read,bash,grep,ffgrep,fffind` | Which pi tools are judged |
| `JEV_SIEVE_MAX_BATCH_CHARS` | `100000` | Request budget, split into passes when exceeded |
| `JEV_SIEVE_QUEUE` | `8` | How many results may wait for a judgment |
| `JEV_SIEVE_TASK_CHARS` | `4000` | Recent user text sent as the task |
| `JEV_SIEVE_DENY` | empty | Extra comma-separated regexes that stop a result leaving |
| `JEV_SIEVE_RETENTION_DAYS` | `14` | Cached block lifetime, `0` keeps forever |
| `JEV_SH` | `jev.sh` | Transport to spawn |
| `JEV_CACHE_DIR` | `~/.cache/jev` | Log and block cache |

The threshold default belongs to this adapter, not the transport.
The transport bands at `0.70` with a margin of `0.10`.
The extension ignores the envelope's band and derives its own from the probability,
because banding is policy and policy belongs to the caller.
See `../../CONTRACT.md` section 3.

## Egress

Only the block text, the recent task text, and the tool name and target leave the
machine.
Before any request is built, a denylist runs over the path, the content, and the task.
A result that trips it is never sent, never cached, and never modified, and the decision
log records which rule fired.

The rules cover dotenv, credential, private-key, keystore, cloud, wallet, and
Docker-config paths; private-key blocks, AWS, GitHub, Slack and provider keys, JWTs,
bearer headers, assigned secrets, connection strings, and basic-auth URLs in content.
The content rules also apply to the task text, because the task travels too.

Over-broad is the safe direction.
A false deny costs a little context; a false allow leaks a credential.

## Before enabling

Run the calibration gate against the local log first:

```sh
../../bin/jev_sieve_report.sh
```

It reads the recorded decisions and prints a verdict.
If it says `NOT READY`, the judge has not shown that it separates relevant blocks from
irrelevant ones.
`on` would then either hide nothing or hide on no evidence.
In this repository's own measurement it said `NOT READY` on five readings.
