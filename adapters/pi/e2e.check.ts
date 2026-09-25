import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "jev-sieve-e2e-"));
const cacheDir = join(root, "cache");
const stub = join(root, "jev-stub.sh");

writeFileSync(
  stub,
  `#!/bin/sh
read -r body
model=jev-1.13.0
case "$body" in *WRONG_MODEL*) model=jev-latest;; esac
q=$(printf '%s' "$body" | jq -c '
  [.questions | keys[] | {key: ., value: {type: "noul", noul: 0.05}}]
  | from_entries')
printf '{"schema_version":"1","status":"ok","model":"%s","answers":%s,"verdicts":%s}' \
  "$model" "$q" "$q"
`,
);
chmodSync(stub, 0o755);

process.env.JEV_CACHE_DIR = cacheDir;
process.env.JEV_SIEVE_LOG = join(cacheDir, "sieve.jsonl");
process.env.JEV_SH = stub;
process.env.JEV_SIEVE = "shadow";
process.env.JEV_SIEVE_MIN_CHARS = "50";
process.env.JEV_SIEVE_QUEUE = "1";

const mod = await import("./jev-sieve.ts");

let handler: ((event: unknown, ctx: unknown) => Promise<unknown>) | undefined;
mod.default({ on: (name: string, fn: never) => {
  if (name === "tool_result") handler = fn as never;
} });
assert.ok(handler, "the extension registers a tool_result handler");

const text = Array.from({ length: 60 }, (_, i) => `line ${i} of the result`).join("\n");
const event = {
  toolName: "read",
  isError: false,
  input: { file_path: "/repo/src/exchange_api.rs" },
  content: [{ type: "text", text }],
};
const ctx = {
  sessionManager: {
    getSessionId: () => "s1",
    getBranch: () => [
      { type: "message", message: { role: "user", content: "fix exchange_api.rs" } },
    ],
  },
};

const returned = await handler(event, ctx);

assert.equal(returned, undefined, "shadow must not modify the tool result");
assert.equal(
  (event.content[0] as { text: string }).text,
  text,
  "shadow leaves the content in place",
);

const cached = readdirSync(join(cacheDir, "blocks"));
assert.equal(cached.length, 3, "every hide candidate is cached, one file per block");

const entry = JSON.parse(readFileSync(process.env.JEV_SIEVE_LOG, "utf8").trim());
assert.equal(entry.mode, "shadow");
assert.equal(entry.question, mod.QUESTION_ID, "the log records the instrument version");
assert.equal(entry.hidden, 3, "hidden counts the candidates, and shadow replaces none");
assert.equal(entry.verdicts.length, 3);
assert.ok(
  entry.verdicts.every((v: { band: string }) => v.band === "no"),
  "the stub judge put every block in the hide band",
);

const denied = {
  toolName: "bash",
  isError: false,
  input: { command: "cat /repo/.env" },
  content: [{ type: "text", text }],
};
assert.equal(await handler(denied, ctx), undefined, "a denied result is never modified");

const logText = readFileSync(process.env.JEV_SIEVE_LOG, "utf8");
const lines = logText.trim().split("\n");
const skip = JSON.parse(lines[lines.length - 1]);
assert.equal(skip.result, "egress-denied", "the denial is logged as its own outcome");
assert.equal(skip.reason, "env-file", "the log names the rule that fired");
assert.equal(readdirSync(join(cacheDir, "blocks")).length, 3, "a denied result caches nothing");
assert.ok(!logText.includes("exchange_api.rs"), "the log carries no path or command line");

const drifted = {
  toolName: "read",
  isError: false,
  input: { file_path: "/repo/src/exchange_api.rs" },
  content: [{ type: "text", text: `${text}\nWRONG_MODEL` }],
};
assert.equal(await handler(drifted, ctx), undefined, "a drifted reading never modifies the result");
assert.equal(
  readdirSync(join(cacheDir, "blocks")).length,
  3,
  "a drifted reading caches nothing, so the log cannot attribute it",
);
const drift = JSON.parse(readFileSync(process.env.JEV_SIEVE_LOG, "utf8").trim().split("\n").at(-1));
assert.equal(drift.result, "no-judgment", "a drifted reading judges nothing");
assert.equal(drift.reason, "model-mismatch:jev-latest", "the log names the model that answered");

const first = readFileSync(join(cacheDir, "blocks", cached[0]), "utf8");
assert.ok(first.startsWith("line "), "the cached text is the block text");
assert.equal(
  statSync(join(cacheDir, "blocks")).mode & 0o777,
  0o700,
  "the block cache directory is private",
);
assert.equal(
  statSync(join(cacheDir, "blocks", cached[0])).mode & 0o777,
  0o600,
  "cached block text is private",
);

rmSync(root, { recursive: true, force: true });
console.log("jev-sieve e2e: checks pass");
