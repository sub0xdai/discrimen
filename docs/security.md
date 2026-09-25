# Jev in the harness - audit response for a security engineer

This is the audit response written for the original build, kept because the asks in
section 6 are the checklist anyone doing this work needs. Paths have been moved to this
repository's layout: `bin/` for the scripts, `adapters/pi/` for the extension.

Scope: the standing audit brief applied to what physically runs on this machine as of 2026-09-23.
Status: on 2026-09-23 the four security findings (S1 egress, S1 cache at rest, S2 argv, S3 retention) were fixed and the data was purged. Asks 1 to 4 and 9 are done; 5 to 8 and 10 are open. See `design-sieve.md` for what changed.
Subject files: `adapters/pi/jev-sieve.ts` (working tree), `bin/jev.sh`, `bin/jev_sieve_report.sh`, and `vox_jev.sh`, which stayed with the vox skill.
Evidence: source read at HEAD and in the working tree, `~/.cache/jev/{sieve,vox}.jsonl` read as data, cache directory inspected. No Jev call was made for this audit.

## 1. What actually runs

| Decision point | Surface | Ask | Acting on it |
|---|---|---|---|
| jev-sieve | `pi.on("tool_result")`, tools `read,bash,grep,ffgrep,fffind`, result >= 1500 chars and >= 2 blocks | one `Noul` per 25-line block | in `on` mode, a block at or below the 0.10 hide line is replaced by a stub; today nothing is replaced |
| vox gaps | `vox_jev.sh gaps`, one per delta Scenario | `Noul`: is this behavior already in the code | advisory table row only |
| vox slices | `vox_jev.sh slices`, one per checkpoint | `Choice{vertical,horizontal}` | advisory table row only |
| vox coverage | `vox_jev.sh coverage <CP>`, one per Scenario | `Noul`: does this CP's test exercise it | advisory table row only |

Not shipped: the router classifier swap, the guardrail second gate, the skill picker.
The litmus test in `agent/lattice.md` is respected: one script speaks HTTP, the sieve owns a hook because `tool_result` is a real lifecycle event, and `vox_jev.sh` is a plain CLI.
That placement is correct and is not the problem.

Current state of the evidence, read from the log rather than from the assessment's table:

- 469 log lines: 350 decisions (291 `sieve.noul.v1`, 60 `sieve.noul.v2`), 119 pre-`kind` entries the gate cannot see, plus recall lines.
- Every recorded mode is `shadow`. `on` has never run, so no context has ever been mutated by a judgment.
- `sieve.noul.v2` separates where v1 did not: 60 documents, 287 blocks, 4 hide candidates (1.3%).
- `jev_sieve_report.sh` says `NOT READY - 4 cached candidates, want 100`, exit 1. The gate is doing its job.

## 2. The ten dangers, scored

| # | Danger | Verdict | Evidence or gap |
|---|---|---|---|
| 1 | Closed-world stuffing | Partial | A `Noul` has no option set, so it cannot stuff a label, but it also has no way to say "not judgeable". `vox.slices.choice.v2` is a closed `{vertical, horizontal}` with no `other`. A doc-only or spike checkpoint gets forced into one of the two. |
| 2 | Silent semantic failure | Partial | Parser success is not treated as decision success: the report gate and the shadow log exist, and `verdictFor` returns null rather than a default. But the log records no outcome, no state hash, no question text, no model. |
| 3 | Confidence is not a guarantee | Pass | The sieve reads raw `noul` and bands locally at its own 0.30/0.20 rather than trusting the envelope's band, which the design record states outright. The script's 0.70/0.10 default never leaks into the hook. The threshold itself is winnow's, not a local replay, which is the one gap. |
| 4 | Criteria are the policy | Partial | Question ids are versioned and logged, and v1 to v2 was a real correction. Nothing enforces the bump, there is no owner named, and the instruction text for `vox.gaps.noul.v1` is unrecoverable from `vox.jsonl` because only the id was logged. |
| 5 | Missing and overlapping branches | Gap | No precedence rule where two labels could both apply. No test for out-of-taxonomy input. No class for content the instrument cannot judge: binary, minified, base64, non-English prose. |
| 6 | Question independence | Partial | v1 asked every sibling question identically because the question id names the block and ids are not sent to the model. That is documented and fixed in v2, and it is the best evidence in the repo that the danger is real. No paraphrase or negation probe exists against the live instrument. |
| 7 | Known weak spots | Pass | Counting, dates, money, and path matching are in code: `targetNamedInTask`, `bandFor`, the vox audits. Nothing asks Jev to compute. Adversarial text in state is unhandled, covered in section 4. |
| 8 | Cheap-call sprawl | Gap | Three vox gates landed inside the week that the assessment's own step 5 gated them behind "only if steps 2 and 3 show the judgments are worth trusting". None has an owner, a kill switch, or a labeling plan. |
| 9 | Generator-after-Jev laundering | Pass | No LLM writes the decision record. Stub text is built in `stubFor`, the vox table prints the raw value, and `vox/SKILL.md` tells the agent to quote the table and then fill the gap analysis from what it reads. |
| 10 | Imagination ceiling | Gap | Nothing reviews low-confidence or near-miss volume. The `Noul` has no `other`, and no counter tracks "the map is wrong". |

## 3. The required implementation pattern, per decision point

| Item | jev-sieve | vox gaps / coverage | vox slices |
|---|---|---|---|
| 1. Named rule with version and owner | question id `sieve.noul.v2`, state `sieve.state.v2`, owner unnamed | ids at v2, v1 text lost, owner unnamed | id at v2, closed option set, owner unnamed |
| 2. Exhaustiveness statement | absent | absent | absent, and the set is not exhaustive |
| 3. Held-out checks | pure logic and stub e2e only, no live instrument probe | none | none |
| 4. Fallback | strong: fail open, uncertain kept, error results untouched, queue full drops the judgment and logs it | prints "Proceed without the judgment" | same, plus a `confidence < 0.2` note that reads as no signal |
| 5. Immutable log | append-only, per-block `noul` and band, session, tool, target. Missing model, threshold, margin, question text, state hash, outcome | envelope logged whole; the change name is logged only inside the envelope path, not as a field | same |
| 6. Non-Jev work outside | banding, block splitting, path matching, recall detection all in code | the audits are mechanical and separate | separate |

Two items carry the weight: fallback is real, and the log cannot be joined to the reading that produced it.
A verdict recorded under threshold 0.30 and a verdict recorded under 0.50 are indistinguishable in `sieve.jsonl`, and the report recomputes `band == "no"` from the stored band, so a threshold change rewrites the calibration set retroactively in interpretation while leaving the data untouched.

## 4. The security axis the brief does not carry

The brief is about decision quality. Mounted in a harness, the same Jev call is also a data pipeline, and that is where the material findings are.

**S1. Tool output leaves the machine by default, unclassified and unredacted.**
`jev-sieve` is enabled by default (`JEV_SIEVE` defaults to `shadow`) and ships the full text of `read`, `bash`, `grep`, `ffgrep`, and `fffind` results to `api.typesafe.ai` whenever the result clears 1500 chars.
`bash` is in the default tool list, so `cat` of anything is in scope.
Shadow mode is not a privacy-safe mode: it sends the same bytes and additionally writes every hide candidate to disk.
The recent task text goes too, so a pasted credential in a user message is egress as well.
This repo already ships a Presidio scrubber at `scrub.py` and `.git/hooks/pre-commit` for exactly this content class, and none of it is applied to the outbound request or to the cache.

**S1. The block cache is a permanent plaintext copy outside the repo.**
`~/.cache/jev` and `~/.cache/jev/blocks` are 0755 and every file inside is 0644.
Traversal into the home directory is closed to other users by its mode, so the live exposure is this account, root, and the `libvirt-qemu` ACL entry that already holds execute on the home directory - which is to say every VM on this box.
The cache is never pruned, by design (`ponytail: samples never pruned`).
It holds the text of content the judge itself deemed irrelevant, which is exactly the material nobody audits.
`~/.cache/jev/sieve.jsonl` records the 300-char `target`, which is the literal command, so command lines land in a world-readable log forever.
In the current log one of them reads `sed -n '30,110p' $A2/src/private_key.rs`, which is the failure mode stated as evidence rather than as theory.

**S2. The API key is placed in the child's argv.**
`jev.sh` posts with `curl -H "Authorization: Bearer $key"`.
`/proc` here is mounted without `hidepid`, and `/proc/<pid>/cmdline` is mode 0444 with no ownership check on read, so the key is exposed to every local account for the life of the request.
The script header claims "A key is never taken from argv", which is true of input and false of what it does with the key.
The fix is small: write the header into the existing 0600 `mktemp` file and pass `curl --config`, or use `-K /dev/fd/3` with the string on fd 3.

**S2. Adversarial state, with a stub that echoes attacker-influenced text.**
File content is untrusted input to the judge, and the brief already names this. Two harness-specific consequences:
A hostile file can steer the judge toward `no`, which turns the sieve into an evidence-hiding primitive, or toward `yes`, which is a context denial.
Less obviously, the stub text interpolates `source`, which is `toolName` plus the 300-char `target`, unescaped and newline-preserving. A command string containing hostile text is therefore re-emitted into context wearing the extension's authority.

**S3. The gate is a convention, not an interlock.**
`on` mode reads `JEV_SIEVE` and nothing else. The report script prints `NOT READY` and exits 1, and nothing consumes that exit code.
The report also passes when the log is missing or empty, so a broken cache reads as a clean gate.
The log is the calibration ground truth and is not tamper-evident; anyone who can append to it can manufacture a `QUALIFIED`.

**S3. No retention, rotation, or per-decision-point kill switch on record.**
`JEV_SIEVE=off` exists and `JEV_SH` missing yields `disabled`, so the mechanism is there. What is missing is the written owner, the review date, and the egress allowlist.
There is no path denylist, so no rule stops a future `read` of a dotenv or a keystore from being judged and cached.

**One pattern note for the brief itself, not for the code.**
Fail-open is correct here and would be wrong one layer up. For a context filter, a dead judge must degrade to "keep everything". For a security control mounted on `tool_call`, the same default is an allow-all. The brief's fallback item should say which side of that line a decision point sits on, because the doctrine is currently copied around as a single rule and it is not one.

## 5. Corrections to our own documents

- The original assessment's section 9 is one instrument generation stale. `sieve.noul.v2` now has 60 documents, 287 blocks, and 4 blocks at the hide line, so "0 blocks at or below the 0.10 hide line" describes the superseded question-key generation, which is what the section says, but the current numbers are worth carrying beside it.
- The jev.sh header's "A key is never taken from argv" needs to become "the credential is read from a 0600 file and never passed as an argument", or the transport needs the fix above.
- The 119 pre-`kind` log entries are invisible to `jev_sieve_report.sh`. That is acceptable for superseded data and is a silent-sample-loss risk if the shape ever changes again.

## 6. Ordered asks

1. Default `JEV_SIEVE=off` and require an explicit opt-in per project. Egress should be the deliberate act, not shadow mode.
2. Put an egress filter in front of `buildSpec`: reuse `scrub.py` on the outbound state, and add a denylist of path and content shapes that are never judged, kept verbatim instead.
3. Tighten the cache: mode 0700 on `~/.cache/jev` and `blocks`, 0600 on files, a retention window, and no command line in the log beyond what the calibration join needs.
4. Move the key out of argv.
5. Log the whole instrument tuple per reading: model, threshold, margin, a hash of the question text, a hash of the state. Add a check that fails when the question text changes while the id does not.
6. Make `on` refuse to start unless `jev_sieve_report.sh` exits 0, with one deliberate override for A/B work.
7. Add `other` to `vox.slices.choice.v2` and define precedence where two labels can both apply.
8. Write the criteria registry: one table, one row per decision point, carrying question id, owner, threshold, fallback, kill switch, and review date. The ids are already there; the owner and the review date are not.
9. Label the 4 cached candidates by hand, then keep sampling until the gate reaches 100. Do not raise the threshold to manufacture candidates, and do not run `on` before the gate opens.
10. Add the held-out probes the brief asks for: paraphrase, negation, out-of-taxonomy, empty state, and a hostile-content case with the block text as state. Record them under the instrument version they were run against.

The last line of the brief is the right one to end on, with one addition for a harness: if the right action is not a listed option, Jev will pick a listed option, and if the listed options are the whole world, the second failure is that the content left the machine before anyone asked whether it should.
