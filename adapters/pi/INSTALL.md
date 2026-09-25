# The pi adapter

A worked example of the loop in `../../CONTRACT.md`, applied to one harness.

It hooks `tool_result`, before a tool's output enters the model's context. Large
results are split into blocks and judged one block at a time. A block the judge is
confident is irrelevant to the current task is replaced with a short stub naming a
file that holds the full text, so the agent can read it back.

Nothing is dropped. A block judged uncertain is kept verbatim, and a result flagged
as an error is never touched at all.

## What it needs

| Requirement | Why |
| --- | --- |
| pi, with extension support | it registers a `tool_result` handler |
| node 22.6 or newer | the source is TypeScript and is loaded without a build step |
| `jq`, `curl`, `bash` | `jev.sh` uses all three |
| `jev.sh` on `PATH`, or `JEV_SH` | this extension spawns it, one judgment per call |
| a credential | `~/.config/typesafe/credentials.env`, mode `600` |

Put the transport on `PATH` with `../../install.sh` first. This extension will not
run without it, and it fails open when the transport is missing: the tool result is
left exactly as it was.

## Install

```sh
mkdir -p ~/.pi/agent/extensions
cp jev-sieve.ts ~/.pi/agent/extensions/jev-sieve.ts
```

Then set a mode. `off` is the default, and it is the default on purpose: sending a
tool result to a hosted model should be a deliberate act.

```sh
export JEV_SIEVE=shadow   # judge and log, change nothing
export JEV_SIEVE=on       # judge and replace
```

Start with `shadow`. It writes the same records as `on` and modifies nothing, which
is what makes it worth running before you trust the judge.

## Checking it

Both checks run offline, with no credential, and no network call.

```sh
node check.ts        # the pure half: block splitting, banding, egress, pinning
node e2e.check.ts    # the impure half: a stub transport in a temp directory
```

`../../run.sh` runs both. The e2e check points `JEV_SH` at a stub, so it exercises
the cache write, the egress refusal, the drifted-model refusal, and the file modes
without touching the real cache.

## Settings

Every setting is an environment variable. An empty value counts as unset, which
matters because `Number("")` is `0` and would silently pick the most aggressive
setting available.

| Variable | Default | Effect |
| --- | --- | --- |
| `JEV_SIEVE` | `off` | `off`, `shadow`, or `on` |
| `JEV_SIEVE_MODEL` | `jev-1.13.0` | the pinned model, and what the response is checked against |
| `JEV_SIEVE_THRESHOLD` | `0.3` | below `threshold - margin`, a block is hidden |
| `JEV_SIEVE_MARGIN` | `0.2` | the width of the uncertain band on each side |
| `JEV_SIEVE_MIN_CHARS` | `1500` | results smaller than this are left alone |
| `JEV_SIEVE_BLOCK_LINES` | `25` | lines per judged block |
| `JEV_SIEVE_TOOLS` | `read,bash,grep,ffgrep,fffind` | which pi tools are judged |
| `JEV_SIEVE_MAX_BATCH_CHARS` | `100000` | request budget, split into passes when exceeded |
| `JEV_SIEVE_QUEUE` | `8` | how many results may wait for a judgment |
| `JEV_SIEVE_TASK_CHARS` | `4000` | how much recent user text travels as the task |
| `JEV_SIEVE_DENY` | empty | extra comma-separated regexes that stop a result leaving |
| `JEV_SIEVE_RETENTION_DAYS` | `14` | how long cached block text is kept, `0` for ever |
| `JEV_SH` | `jev.sh` | the transport to spawn |
| `JEV_CACHE_DIR` | `~/.cache/jev` | the log and the block cache |

The threshold default is this adapter's own, not the transport's. The transport
bands at `0.70` with a margin of `0.10`; this extension ignores the band in the
envelope and derives its own from the probability, because the band is policy and
policy belongs to the caller. See `../../CONTRACT.md` section 3.

## What leaves the machine

Only the block text, the recent task text, and the tool name and target. Before any
request is built, a denylist runs over the path, the content, and the task. A result
that trips it is never sent, never cached, and never modified, and the decision log
records which rule fired.

The rules cover dotenv, credential, private-key, keystore, cloud, wallet, and
Docker-config paths; private-key blocks, AWS, GitHub, Slack and provider keys, JWTs,
bearer headers, assigned secrets, connection strings, and basic-auth URLs in content.
The content rules are also applied to the task text, because the task travels too.

Over-broad is the safe direction. A false deny costs a little context; a false allow
leaks a credential.

## Before you turn it on

Run the calibration gate against your own log first:

```sh
../../bin/jev_sieve_report.sh
```

It reads the decisions the extension recorded and prints a verdict. If it says
`NOT READY`, the judge has not yet shown that it separates relevant blocks from
irrelevant ones, and `on` mode will either hide nothing or hide on no evidence. In
this repository's own measurement it said `NOT READY` on five readings.
