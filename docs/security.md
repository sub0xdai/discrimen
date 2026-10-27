# Jev in the harness: security audit

Audit response written for the original build.
Section 6 is the checklist for anyone doing this work.
Paths use this repository's layout: `bin/` for the scripts, `adapters/pi/` for the
extension.

- **Scope:** the standing audit brief, applied to what runs on this machine as of
  2026-09-23.
- **Status:** the four security findings were fixed and the data purged on 2026-09-23:
  S1 egress, S1 cache at rest, S2 argv, S3 retention.
  Asks 1 to 4 and 9 are done; asks 5 to 8 and 10 are open.
- **Subject files:** `adapters/pi/jev-sieve.ts`, `bin/jev.sh`,
  `bin/jev_sieve_report.sh`, and `vox_jev.sh` (stayed with the vox skill).
- **Evidence:** source at HEAD and in the working tree, `~/.cache/jev/{sieve,vox}.jsonl`
  read as data, cache directory inspected.
  No Jev call was made for this audit.

## 1. What runs

| Decision point | Surface | Ask | Effect |
| --- | --- | --- | --- |
| jev-sieve | `pi.on("tool_result")`, tools `read,bash,grep,ffgrep,fffind`, result >= 1500 chars and >= 2 blocks | One `Noul` per 25-line block | In `on` mode, a block at or below the 0.10 hide line is replaced by a stub. Nothing was replaced at audit time. |
| vox gaps | `vox_jev.sh gaps`, one per delta Scenario | `Noul`: is this behavior already in the code | Advisory table row only. |
| vox slices | `vox_jev.sh slices`, one per checkpoint | `Choice{vertical,horizontal}` | Advisory table row only. |
| vox coverage | `vox_jev.sh coverage <CP>`, one per Scenario | `Noul`: does this CP's test exercise it | Advisory table row only. |

Not shipped: the router classifier swap, the guardrail second gate, the skill picker.

Placement follows the litmus test in `agent/lattice.md`: one script speaks HTTP, the
sieve owns a hook because `tool_result` is a real lifecycle event, and `vox_jev.sh` is a
plain CLI.
That placement is correct.

Evidence from the log at audit time:

- 469 log lines: 350 decisions (291 `sieve.noul.v1`, 60 `sieve.noul.v2`), 119 pre-`kind`
  entries the gate cannot see, plus recall lines.
- Every recorded mode was `shadow`.
  `on` had never run, so no context had been mutated by a judgment.
- `sieve.noul.v2` separated where v1 did not: 60 documents, 287 blocks, 4 hide
  candidates (1.3%).
- `jev_sieve_report.sh` printed `NOT READY - 4 cached candidates, want 100` and exited
  1.
  The gate worked.

## 2. Ten dangers

| # | Danger | Verdict | Evidence or gap |
| --- | --- | --- | --- |
| 1 | Closed-world stuffing | Partial | A `Noul` has no option set, so it cannot stuff a label, but it cannot say "not judgeable". `vox.slices.choice.v2` is a closed `{vertical, horizontal}` with no `other`; a doc-only or spike checkpoint is forced into one. |
| 2 | Silent semantic failure | Partial | Parser success is not decision success: the report gate and shadow log exist, and `verdictFor` returns null rather than a default. But the log records no outcome, state hash, question text, or model. |
| 3 | Confidence is not a guarantee | Pass | The sieve reads raw `noul` and bands locally at 0.30/0.20. The script's 0.70/0.10 never leaks into the hook. The threshold is winnow's, not a local replay. |
| 4 | Criteria are the policy | Partial | Question ids are versioned and logged; v1 to v2 was a real correction. Nothing enforces a bump, no owner is named, and `vox.gaps.noul.v1` instructions are unrecoverable because only the id was logged. |
| 5 | Missing and overlapping branches | Gap | No precedence rule when two labels apply. No out-of-taxonomy test. No class for binary, minified, base64, or non-English prose. |
| 6 | Question independence | Partial | v1 asked every sibling question identically because the question id names the block and ids are not sent to the model. Fixed in v2. No paraphrase or negation probe exists. |
| 7 | Known weak spots | Pass | Counting, dates, money, and path matching are code: `targetNamedInTask`, `bandFor`, the vox audits. Adversarial text in state is unhandled (section 4). |
| 8 | Cheap-call sprawl | Gap | Three vox gates landed inside the week that step 5 gated them behind "only if steps 2 and 3 show the judgments are trustworthy". None has an owner, kill switch, or labeling plan. |
| 9 | Generator-after-Jev laundering | Pass | No LLM writes the decision record. Stub text is built in `stubFor`, the vox table prints the raw value, and `vox/SKILL.md` requires quoting the table. |
| 10 | Imagination ceiling | Gap | Nothing reviews low-confidence or near-miss volume. A `Noul` has no `other`, and no counter tracks "the map is wrong". |

## 3. Required pattern per decision point

| Item | jev-sieve | vox gaps / coverage | vox slices |
| --- | --- | --- | --- |
| 1. Named rule with version and owner | Question id `sieve.noul.v2`, state `sieve.state.v2`, owner unnamed | Ids at v2, v1 text lost, owner unnamed | Id at v2, closed option set, owner unnamed |
| 2. Exhaustiveness statement | Absent | Absent | Absent; the set is not exhaustive |
| 3. Held-out checks | Pure logic and stub e2e only, no live probe | None | None |
| 4. Fallback | Strong: fail open, uncertain kept, error results untouched, queue full drops the judgment and logs it | Prints "Proceed without the judgment" | Same, plus a `confidence < 0.2` note |
| 5. Immutable log | Append-only, per-block `noul` and band, session, tool, target. Missing model, threshold, margin, question text, state hash, outcome | Envelope logged whole; the change name is only inside the envelope path | Same |
| 6. Non-Jev work outside | Banding, block splitting, path matching, recall detection | Audits are mechanical and separate | Separate |

Two items carry the weight: fallback is real, and the log cannot be joined to the
reading that produced it.
A verdict recorded under threshold 0.30 and one under 0.50 are indistinguishable in
`sieve.jsonl`.
The report recomputes `band == "no"` from the stored band, so a threshold change
rewrites the calibration set in interpretation while leaving the data unchanged.

## 4. Security findings

**S1. Tool output leaves the machine by default, unclassified and unredacted.**
`jev-sieve` was enabled by default (`JEV_SIEVE` defaulted to `shadow`) and sent the full
text of `read`, `bash`, `grep`, `ffgrep`, and `fffind` results to `api.typesafe.ai`
whenever the result cleared 1500 chars.
`bash` was in the default tool list, so `cat` of anything was in scope.
Shadow mode was not privacy-safe: it sent the same bytes and wrote every hide candidate
to disk.
Recent task text was sent too, so a pasted credential in a user message was egress.
The repository already had a Presidio scrubber at `scrub.py` and `.git/hooks/pre-commit`
for this content class; neither was applied to the outbound request or the cache.

**S1. The block cache was a permanent plaintext copy outside the repo.**
`~/.cache/jev` and `~/.cache/jev/blocks` were 0755, and every file inside was 0644.
The home directory mode blocks other users, but this account, root, and the
`libvirt-qemu` ACL entry on the home directory could read it, which means every VM on
this box.
The cache was never pruned (`ponytail: samples never pruned`).
It held text the judge had deemed irrelevant, which is material nobody audits.
`~/.cache/jev/sieve.jsonl` recorded the 300-char `target`, meaning the literal command.
One entry read `sed -n '30,110p' $A2/src/private_key.rs`.

**S2. The API key was placed in the child's argv.**
`jev.sh` posted with `curl -H "Authorization: Bearer $key"`.
`/proc` here is mounted without `hidepid`, and `/proc/<pid>/cmdline` is 0444 with no
ownership check on read, so the key was exposed to every local account for the life of
the request.
The script header claimed "A key is never taken from argv", which was true of input and
false of use.

**S2. Adversarial state, with a stub that echoed attacker-influenced text.**
File content is untrusted input to the judge.
A hostile file could steer the judge toward `no`, turning the sieve into an
evidence-hiding primitive, or toward `yes`, causing context denial.
The stub text interpolated `source`, which is `toolName` plus the 300-char `target`,
unescaped and newline-preserving.
A command string containing hostile text was re-emitted into context with the
extension's authority.

**S3. The gate was a convention, not an interlock.**
`on` mode read `JEV_SIEVE` and nothing else.
The report script printed `NOT READY` and exited 1, and nothing consumed that exit code.
The report also passed when the log was missing or empty, so a broken cache read as a
clean gate.
The log is the calibration ground truth and is not tamper-evident.
Anyone who can append to it can manufacture a `QUALIFIED`.

**S3. No retention, rotation, or per-decision-point kill switch on record.**
`JEV_SIEVE=off` existed, and a missing `JEV_SH` yielded `disabled`.
What was missing: a written owner, a review date, an egress allowlist, and a path
denylist.
No rule stopped a future `read` of a dotenv or keystore from being judged and cached.

**Fail-open depends on the surface.**
For a context filter, a dead judge must degrade to "keep everything".
For a security control mounted on `tool_call`, the same default is allow-all.
A fallback rule must say which side of that line the decision point sits on.

## 5. Corrections to our own documents

- The original assessment's section 9 is one instrument generation stale.
  `sieve.noul.v2` has 60 documents, 287 blocks, and 4 blocks at the hide line.
  "0 blocks at or below the 0.10 hide line" describes the superseded generation.
- The `jev.sh` header "A key is never taken from argv" must say "the credential is read
  from a 0600 file and never passed as an argument", or the transport needs the argv
  fix.
- The 119 pre-`kind` log entries are invisible to `jev_sieve_report.sh`.
  That is acceptable for superseded data, and a silent-sample-loss risk if the shape
  changes again.

## 6. Ordered asks

1. Default `JEV_SIEVE=off` and require explicit opt-in per project.
   Egress should be an explicit choice, not a side effect of shadow mode. (Done.)
2. Put an egress filter in front of `buildSpec`: reuse `scrub.py` on the outbound
   state, and add a denylist of path and content shapes that are never judged. (Done.)
3. Tighten the cache: 0700 on `~/.cache/jev` and `blocks`, 0600 on files, a retention
   window, and no command line in the log beyond what the calibration join needs.
   (Done.)
4. Move the key out of argv. (Done.)
5. Log the whole instrument tuple per reading: model, threshold, margin, a hash of the
   question text, and a hash of the state.
   Add a check that fails when the question text changes while the id does not. (Open.)
6. Make `on` refuse to start unless `jev_sieve_report.sh` exits 0, with one deliberate
   override for A/B work. (Open.)
7. Add `other` to `vox.slices.choice.v2` and define precedence when two labels apply.
   (Open.)
8. Write the criteria registry: one table, one row per decision point, carrying
   question id, owner, threshold, fallback, kill switch, and review date. (Open.)
9. Label the 4 cached candidates by hand, then keep sampling until the gate reaches
   100.
   Do not raise the threshold to manufacture candidates, and do not run `on` before
   the gate opens. (Done.)
10. Add held-out probes: paraphrase, negation, out-of-taxonomy, empty state, and a
    hostile-content case with the block text as state.
    Record them under the instrument version they were run against. (Open.)

If the right action is not a listed option, Jev will pick a listed option.
If the listed options are the whole world, the second failure is that the content left
the machine before anyone asked whether it should.
