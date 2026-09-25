import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_MODE,
  MODEL,
  STATE_SCHEMA,
  QUESTION_ID,
  bandFor,
  buildBatches,
  buildSpec,
  decide,
  envelopeFor,
  egressFor,
  applySieve,
  recallPath,
  splitBlocks,
  splitToFit,
  targetNamedInTask,
  type Block,
  type Judged,
  type Request,
} from "./jev-sieve.ts";

const blocks = splitBlocks("a\nb\nc\nd\ne", 2);
assert.deepEqual(
  blocks.map((b) => [b.id, b.from, b.to]),
  [["b0", 1, 2], ["b1", 3, 4], ["b2", 5, 5]],
);
assert.deepEqual(
  splitBlocks("a\n\n\n\n\nb", 2).map((b) => [b.from, b.to]),
  [[1, 2], [5, 6]],
  "a whitespace-only block is dropped",
);
assert.equal(splitBlocks("a\nb", 0).length, 0, "a zero block size is not a crash");

assert.equal(bandFor(0.09, 0.3, 0.2), "no");
assert.equal(bandFor(0.1, 0.3, 0.2), "no", "0.3 - 0.2 is 0.09999999999999998");
assert.equal(bandFor(0.2, 0.3, 0.2), "uncertain");
assert.equal(bandFor(0.5, 0.3, 0.2), "yes");

assert.equal(decide({ block: blocks[0], noul: 0.2, band: "uncertain" }).kind, "keep");
assert.equal(decide({ block: blocks[0], noul: 0.5, band: "yes" }).kind, "keep");
assert.equal(decide({ block: blocks[0], noul: 0.1, band: "no" }).kind, "hide");

assert.equal(
  targetNamedInTask("sed -n '1,5p' crates/router/src/exchange_api.rs", "fix exchange_api.rs"),
  true,
);
assert.equal(targetNamedInTask("/repo/src/journal_service.rs", "read the spec"), false);
assert.equal(targetNamedInTask("", "fix anything"), false, "an empty target names nothing");

const blockCache = join(homedir(), ".cache/jev/blocks");
assert.equal(recallPath(join(blockCache, "s1-b0-1-25.txt")), "s1-b0-1-25.txt");
assert.equal(recallPath(`cat ${join(blockCache, "s1-b0-1-25.txt")}`), "s1-b0-1-25.txt");
assert.equal(recallPath(join(homedir(), ".cache/jev/sieve.jsonl")), null);
assert.equal(recallPath("/tmp/unrelated.txt"), null);

const request: Request = { tool: "read", target: "/repo/exchange_api.rs", namedInTask: true };
const spec = JSON.parse(buildSpec("fix exchange_api.rs", blocks, request));
assert.equal(spec.state.schema, STATE_SCHEMA);
assert.equal(spec.state.question, QUESTION_ID);
assert.equal(spec.model, MODEL, "the model version is pinned, not jev-latest");
assert.equal(spec.state.request.namedInTask, true);
assert.deepEqual(Object.keys(spec.questions), ["b0", "b1", "b2"]);
assert.equal(spec.questions.b0.type, "noul");
assert.ok(
  spec.questions.b0.instructions.includes("`blocks[0].text`"),
  "question 0 names block 0",
);
assert.ok(
  spec.questions.b2.instructions.includes("`blocks[2].text`"),
  "question 2 names block 2",
);
assert.notEqual(
  spec.questions.b0.instructions,
  spec.questions.b2.instructions,
  "each question names its own block",
);
assert.equal(
  spec.questions.b0.instructions.split("blocks[")[0],
  spec.questions.b2.instructions.split("blocks[")[0],
  "every block is asked the same template",
);
assert.ok(
  !spec.questions.b0.instructions.includes("fix exchange_api.rs"),
  "no task text in the question",
);

const many: Block[] = Array.from({ length: 20 }, (_, i) => ({
  id: `b${i}`,
  from: i * 25 + 1,
  to: i * 25 + 25,
  text: "x".repeat(500),
}));
const passes = buildBatches("t", many, request, 4000);
const ids = passes.flatMap((p) => p.blocks.map((b) => b.id));
assert.equal(new Set(ids).size, ids.length, "no block is judged twice");
assert.equal(ids.length, many.length, "every block is judged");
assert.equal(splitToFit({ id: "b0", from: 1, to: 1, text: "y".repeat(5000) }, 1000).length, 1);
assert.ok(passes.length > 1, "this fixture splits into several passes");

const drift = passes.flatMap((pass) => {
  const parsed = JSON.parse(pass.spec);
  return pass.blocks.flatMap((block, index) => {
    const named = parsed.questions[block.id].instructions.includes(`\`blocks[${index}].text\``);
    return named && parsed.state.blocks[index].id === block.id ? [] : [block.id];
  });
});
assert.deepEqual(drift, [], "each pass's questions name their own positions in that pass");

const judged: Judged = {
  block: { id: "b0", from: 1, to: 2, text: "l1\nl2" },
  noul: 0.05,
  band: "no",
};
const sieved = applySieve(
  "l1\nl2\nl3",
  [decide(judged)],
  new Map([["b0", "/cache/x.txt"]]),
  "bash foo",
);
assert.ok(sieved.includes("offset=1 limit=2"), "the stub names the line range");
assert.ok(sieved.includes("l3") && !sieved.includes("l2"), "only the hidden range is replaced");

assert.equal(DEFAULT_MODE, "off", "the sieve sends nothing until it is switched on");
const fakeKey = "api" + "_key = " + '"abcdef1234567890"';
const fakeDsn = "postgres" + "://user:pw@host/db";
assert.equal(egressFor("/repo/.env", "x", "t").kind, "deny", "a dotenv path never leaves");
assert.equal(egressFor("cat ~/.ssh/id_rsa", "x", "t").kind, "deny");
assert.equal(egressFor("sed -n '1,9p' key.pem", "x", "t").kind, "deny");
assert.equal(egressFor("/repo/wallet-notes.md", "x", "t").kind, "deny");
assert.equal(
  egressFor("/repo/src/main.rs", "-----BEGIN OPENSSH PRIVATE KEY-----", "t").kind,
  "deny",
);
assert.equal(egressFor("/repo/src/main.rs", "aws AKIAIOSFODNN7EXAMPLE here", "t").kind, "deny");
assert.equal(egressFor("/repo/src/main.rs", fakeKey, "t").kind, "deny");
assert.equal(egressFor("/repo/src/main.rs", fakeDsn, "t").kind, "deny");
assert.equal(
  egressFor("/repo/src/main.rs", "let x = 1;", "ghp_abcdefghijklmnopqrstuvwxyz12").kind,
  "deny",
  "a secret in the task text is denied too, because the task travels as state",
);
assert.equal(egressFor("/repo/src/main.rs", "let x = 1;", "fix the router").kind, "allow");
assert.equal(egressFor("README.md", "# hi\nplain text", "read the readme").kind, "allow");
const denied = egressFor("/repo/.env", "x", "t");
assert.ok(denied.kind === "deny" && denied.reason.length > 0, "a denial names its rule");

assert.equal(
  envelopeFor({ status: "ok", model: MODEL, verdicts: {} }).status,
  "ok",
  "a reading from the pinned model is usable",
);
const drifted = envelopeFor({ status: "ok", model: "jev-latest", verdicts: {} });
assert.equal(drifted.status, "error", "a floating alias is not this instrument");
assert.ok(
  drifted.status === "error" && drifted.reason.includes("jev-latest"),
  "the rejection names the model that answered",
);
assert.equal(
  envelopeFor({ status: "ok", verdicts: {} }).status,
  "error",
  "an envelope naming no model is not evidence of the pinned one",
);
assert.equal(
  envelopeFor({ status: "disabled" }).status,
  "disabled",
  "the boundary parse leaves other statuses alone",
);

console.log("jev-sieve: pure checks pass");
