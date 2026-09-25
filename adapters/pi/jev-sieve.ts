
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn } from "node:child_process";
import { appendFile, chmod, mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

function envStr(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw === "" ? fallback : raw;
}

function envNum(name: string, fallback: number): number {
  const parsed = Number(envStr(name, String(fallback)));
  return Number.isFinite(parsed) ? parsed : fallback;
}

const HOME = homedir();
const JEV_SH = envStr("JEV_SH", "jev.sh");
const CACHE_DIR = envStr("JEV_CACHE_DIR", join(HOME, ".cache/jev"));
const BLOCK_CACHE = join(CACHE_DIR, "blocks");
const LOG_FILE = join(CACHE_DIR, "sieve.jsonl");

export const DEFAULT_MODE = "off";
const MODE = envStr("JEV_SIEVE", DEFAULT_MODE);
const MIN_CHARS = envNum("JEV_SIEVE_MIN_CHARS", 1500);
const BLOCK_LINES = envNum("JEV_SIEVE_BLOCK_LINES", 25);
const THRESHOLD = envNum("JEV_SIEVE_THRESHOLD", 0.3);
const MARGIN = envNum("JEV_SIEVE_MARGIN", 0.2);
const TASK_CHARS = envNum("JEV_SIEVE_TASK_CHARS", 4000);
const MAX_BATCH_CHARS = envNum("JEV_SIEVE_MAX_BATCH_CHARS", 100_000);
const MAX_QUEUE = envNum("JEV_SIEVE_QUEUE", 8);
const RETENTION_DAYS = envNum("JEV_SIEVE_RETENTION_DAYS", 14);
const EXTRA_DENY = envStr("JEV_SIEVE_DENY", "");

const SCAFFOLD_CHARS = 2000;
const BLOCK_OVERHEAD_CHARS = 320;
const TOOLS = envStr("JEV_SIEVE_TOOLS", "read,bash,grep,ffgrep,fffind")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);

const JEV_TIMEOUT_MS = 20_000;

export const STATE_SCHEMA = "sieve.state.v2";
export const QUESTION_ID = "sieve.noul.v2";

export const MODEL = envStr("JEV_SIEVE_MODEL", "jev-1.13.0");

export type Band = "yes" | "no" | "uncertain";
export type SieveMode = "off" | "shadow" | "on";

export interface Block {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly text: string;
}

export interface Judged {
  readonly block: Block;
  readonly noul: number;
  readonly band: Band;
}

export type Action =
  | { readonly kind: "hide"; readonly judged: Judged }
  | { readonly kind: "keep"; readonly judged: Judged; readonly why: "needed" | "uncertain" };

export type Envelope =
  | {
      readonly status: "ok";
      readonly model?: string;
      readonly verdicts: Record<string, { band?: string; noul?: number }>;
    }
  | { readonly status: "disabled" }
  | { readonly status: "error"; readonly reason: string };

export function envelopeFor(envelope: Envelope): Envelope {
  if (envelope.status !== "ok") return envelope;
  if (envelope.model === MODEL) return envelope;
  return { status: "error", reason: `model-mismatch:${envelope.model ?? "absent"}` };
}

export function splitBlocks(text: string, linesPerBlock: number): Block[] {
  if (!Number.isFinite(linesPerBlock) || linesPerBlock < 1) return [];
  const lines = text.split("\n");
  const blocks: Block[] = [];
  for (let start = 0; start < lines.length; start += linesPerBlock) {
    const slice = lines.slice(start, start + linesPerBlock);
    if (slice.join("").trim() === "") continue;
    blocks.push({
      id: `b${blocks.length}`,
      from: start + 1,
      to: start + slice.length,
      text: slice.join("\n"),
    });
  }
  return blocks;
}

export function decide(judged: Judged): Action {
  if (judged.band === "no") return { kind: "hide", judged };
  if (judged.band === "uncertain") return { kind: "keep", judged, why: "uncertain" };
  return { kind: "keep", judged, why: "needed" };
}

const BOUNDARY_EPSILON = 1e-9;

export function bandFor(noul: number, threshold: number, margin: number): Band {
  if (noul <= threshold - margin + BOUNDARY_EPSILON) return "no";
  if (noul >= threshold + margin - BOUNDARY_EPSILON) return "yes";
  return "uncertain";
}

export function verdictFor(
  envelope: Envelope,
  blockId: string,
): { band: Band; noul: number } | null {
  if (envelope.status !== "ok") return null;
  const v = envelope.verdicts[blockId];
  if (!v) return null;
  const noul = typeof v.noul === "number" && Number.isFinite(v.noul) ? v.noul : null;
  if (noul === null) return null;
  return { band: bandFor(noul, THRESHOLD, MARGIN), noul };
}

export type Egress =
  | { readonly kind: "allow" }
  | { readonly kind: "deny"; readonly reason: string };

const DENY_PATH: readonly (readonly [string, RegExp])[] = [
  ["env-file", /\.env/i],
  ["credential", /credential|secret|\.netrc|\.npmrc|\.pypirc|\.git-credentials|htpasswd/i],
  ["private-key", /id_rsa|id_ed25519|id_ecdsa|\.pem|\.key|\.p12|\.pfx|\.p8|private[_-]?key/i],
  ["keystore", /keystore|\.kdbx|\.jks|\.asc\b/i],
  ["cloud", /\.aws|\.ssh|\.gnupg|kubeconfig|\.tfstate|\.tfvars|service[_-]?account/i],
  ["wallet", /wallet|mnemonic|seed[_-]?phrase/i],
  ["docker-config", /\.docker[/\\]config/i],
];

const DENY_CONTENT: readonly (readonly [string, RegExp])[] = [
  ["private-key-block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["aws-key", /\b(A3T[A-Z0-9]|AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/],
  ["slack-token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["provider-key", /\bsk-[A-Za-z0-9_-]{20,}/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./],
  ["bearer", /authorization:\s*bearer\s+\S+/i],
  ["assigned-secret",
   /(password|passwd|api[_-]?key|secret|token)\s*[:=]\s*["']?[A-Za-z0-9_+/.=-]{8,}/i],
  ["conn-string", /\b(mongodb|postgres(ql)?|mysql|redis|amqp):\/\/[^\s'"]*:[^\s'"]*@/],
  ["basic-auth-url", /https?:\/\/[^\s:/@]+:[^\s/@]+@/],
];

let extraCache: readonly (readonly [string, RegExp])[] | null = null;

function extraDenies(): readonly (readonly [string, RegExp])[] {
  if (extraCache) return extraCache;
  const out: (readonly [string, RegExp])[] = [];
  for (const raw of EXTRA_DENY.split(",").map((s) => s.trim()).filter(Boolean)) {
    try {
      out.push([raw, new RegExp(raw, "i")]);
    } catch {
      process.stderr.write(`jev-sieve: ignoring invalid JEV_SIEVE_DENY pattern: ${raw}\n`);
    }
  }
  extraCache = out;
  return extraCache;
}

export function egressFor(target: string, text: string, task: string): Egress {
  const inPath = DENY_PATH.find(([, re]) => re.test(target));
  if (inPath) return { kind: "deny", reason: inPath[0] };
  const inText = DENY_CONTENT.find(([, re]) => re.test(text));
  if (inText) return { kind: "deny", reason: inText[0] };
  const inTask = DENY_CONTENT.find(([, re]) => re.test(task));
  if (inTask) return { kind: "deny", reason: `task:${inTask[0]}` };
  const custom = extraDenies().find(
    ([, re]) => re.test(target) || re.test(text) || re.test(task),
  );
  if (custom) return { kind: "deny", reason: `custom:${custom[0]}` };
  return { kind: "allow" };
}

export interface Request {
  readonly tool: string;
  readonly target: string;
  readonly namedInTask: boolean;
}

// ponytail: substring test on basenames; loosen only if the recall labels show it missing.
export function targetNamedInTask(target: string, task: string): boolean {
  const hay = task.toLowerCase();
  return target
    .split(/[\s'"`;|&()[\]{}]+/)
    .map((token) => token.replace(/[.,:]+$/, ""))
    .filter((token) => token.includes("/") || /\.[A-Za-z]\w{0,6}$/.test(token))
    .map((token) => (token.split("/").pop() ?? token).toLowerCase())
    .some((base) => base.length > 2 && hay.includes(base));
}

export function instructionFor(index: number): string {
  return (
    "The agent is working on the task in `task`. Is the content of " +
    `\`blocks[${index}].text\` needed to complete that task? ` +
    "Answer yes only if it carries information the task depends on."
  );
}

export function buildSpec(
  task: string,
  blocks: readonly Block[],
  source: Request,
): string {
  const questions: Record<string, unknown> = {};
  blocks.forEach((b, index) => {
    questions[b.id] = { type: "noul", instructions: instructionFor(index) };
  });
  return JSON.stringify({
    state: {
      schema: STATE_SCHEMA,
      question: QUESTION_ID,
      task,
      request: source,
      blocks: blocks.map((b) => ({ id: b.id, text: b.text })),
    },
    model: MODEL,
    questions,
  });
}

export interface Batch {
  readonly blocks: readonly Block[];
  readonly spec: string;
}

export function splitToFit(block: Block, maxChars: number): Block[] {
  if (block.text.length <= maxChars) return [block];
  const lines = block.text.split("\n");
  if (lines.length < 2) return [block];
  const mid = Math.ceil(lines.length / 2);
  const head: Block = {
    id: block.id,
    from: block.from,
    to: block.from + mid - 1,
    text: lines.slice(0, mid).join("\n"),
  };
  const tail: Block = {
    id: block.id,
    from: block.from + mid,
    to: block.to,
    text: lines.slice(mid).join("\n"),
  };
  return [...splitToFit(head, maxChars), ...splitToFit(tail, maxChars)];
}

export function reindex(blocks: readonly Block[]): Block[] {
  return blocks.map((b, index) => ({ ...b, id: `b${index}` }));
}

export function buildBatches(
  task: string,
  blocks: readonly Block[],
  source: Request,
  maxBatchChars: number,
): Batch[] {
  const budget = maxBatchChars - SCAFFOLD_CHARS - task.length - source.target.length;
  if (budget <= 0) return [];
  const expanded: Block[] = [];
  for (const block of blocks) expanded.push(...splitToFit(block, budget));
  const ordered = reindex(expanded);
  const batches: Batch[] = [];
  let current: Block[] = [];
  let used = 0;
  for (const block of ordered) {
    const cost = block.text.length + BLOCK_OVERHEAD_CHARS;
    if (current.length > 0 && used + cost > budget) {
      batches.push({ blocks: current, spec: buildSpec(task, current, source) });
      current = [];
      used = 0;
    }
    current.push(block);
    used += cost;
  }
  if (current.length > 0) {
    batches.push({ blocks: current, spec: buildSpec(task, current, source) });
  }
  return batches;
}

export function stubFor(block: Block, path: string, noul: number, source: string): string {
  const lines = block.to - block.from + 1;
  return (
    `[jev-sieve] ${source} lines ${block.from}-${block.to} (${lines} lines) hidden: ` +
    `judged unlikely to matter for the current task (needed ${noul.toFixed(2)}).\n` +
    `[jev-sieve] full text: read ${path} with offset=${block.from} limit=${lines}`
  );
}

export function applySieve(
  text: string,
  actions: readonly Action[],
  paths: ReadonlyMap<string, string>,
  source: string,
): string {
  const lines = text.split("\n");
  const hidden = new Map<number, { action: Action & { kind: "hide" }; path: string }>();
  for (const action of actions) {
    if (action.kind !== "hide") continue;
    const path = paths.get(action.judged.block.id);
    if (!path) continue;
    hidden.set(action.judged.block.from, { action, path });
  }
  const out: string[] = [];
  for (let n = 1; n <= lines.length; n++) {
    const hit = hidden.get(n);
    if (!hit) {
      out.push(lines[n - 1]);
      continue;
    }
    const { judged } = hit.action;
    out.push(stubFor(judged.block, hit.path, judged.noul, source));
    n = judged.block.to;
  }
  return out.join("\n");
}

function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { status?: unknown };
  if (v.status === "disabled") return true;
  if (v.status === "error") return true;
  return v.status === "ok" && typeof (value as { verdicts?: unknown }).verdicts === "object";
}

export async function runJev(body: string): Promise<Envelope | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: Envelope | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(JEV_SH, ["--spec", "-"], { stdio: ["pipe", "pipe", "ignore"] });
    } catch {
      done(null);
      return;
    }
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      done(null);
    }, JEV_TIMEOUT_MS);
    const { stdin, stdout } = child;
    if (!stdin || !stdout) {
      clearTimeout(timer);
      done(null);
      return;
    }
    let out = "";
    stdin.on("error", () => {});
    stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.on("error", () => {
      clearTimeout(timer);
      done(null);
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const parsed: unknown = JSON.parse(out);
        done(isEnvelope(parsed) ? envelopeFor(parsed) : null);
      } catch {
        done(null);
      }
    });
    try {
      stdin.end(body);
    } catch {}
  });
}

export function recentTask(entries: readonly unknown[], maxChars: number): string {
  const parts: string[] = [];
  for (let i = entries.length - 1; i >= 0 && parts.join(" ").length < maxChars; i--) {
    const entry = entries[i] as {
      type?: string;
      message?: { role?: string; content?: unknown };
    };
    if (entry?.type !== "message" || entry.message?.role !== "user") continue;
    const content = entry.message.content;
    if (typeof content === "string") {
      parts.push(content);
      continue;
    }
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      const text = (item as { type?: string; text?: string })?.text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.reverse().join("\n").slice(-maxChars);
}

export function singleText(content: unknown): { text: string; index: number } | null {
  if (!Array.isArray(content)) return null;
  const texts: number[] = [];
  content.forEach((item, index) => {
    if ((item as { type?: string })?.type === "text") texts.push(index);
  });
  if (texts.length !== 1) return null;
  const index = texts[0];
  const text = (content[index] as { text?: string })?.text;
  if (typeof text !== "string") return null;
  return { text, index };
}

// ponytail: re-running the command also recovers the text, unlabeled; add if recall looks low.
export function recallPath(target: string): string | null {
  const escaped = BLOCK_CACHE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = target.match(new RegExp(`${escaped}/([\\w.-]+\\.txt)`));
  return match ? match[1] : null;
}

async function cacheBlocks(
  sessionId: string,
  actions: readonly Action[],
): Promise<Map<string, string>> {
  const paths = new Map<string, string>();
  const hidden = actions.filter((a): a is Action & { kind: "hide" } => a.kind === "hide");
  if (hidden.length === 0) return paths;
  await mkdir(BLOCK_CACHE, { recursive: true, mode: 0o700 });
  for (const action of hidden) {
    const { block } = action.judged;
    const path = join(BLOCK_CACHE, `${sessionId}-${block.id}-${block.from}-${block.to}.txt`);
    await writeFile(path, block.text, { encoding: "utf8", mode: 0o600 });
    paths.set(block.id, path);
  }
  return paths;
}

async function pruneBlocks(): Promise<void> {
  try {
    await chmod(CACHE_DIR, 0o700);
    await chmod(BLOCK_CACHE, 0o700);
  } catch {}
  if (RETENTION_DAYS <= 0) return;
  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
  let names: string[];
  try {
    names = await readdir(BLOCK_CACHE);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.endsWith(".txt")) continue;
    const path = join(BLOCK_CACHE, name);
    try {
      const info = await stat(path);
      if (info.mtimeMs < cutoff) await unlink(path);
    } catch {}
  }
}

async function log(entry: Record<string, unknown>): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {}
}

const MODES: readonly string[] = ["off", "shadow", "on"];
export const mode: SieveMode = (MODES.includes(MODE) ? MODE : "off") as SieveMode;

export interface Queue {
  readonly depth: () => number;
  run<T>(job: () => Promise<T>): Promise<T> | null;
}

export function createQueue(limit: number): Queue {
  let depth = 0;
  let tail: Promise<void> = Promise.resolve();
  return {
    depth: () => depth,
    run<T>(job: () => Promise<T>): Promise<T> | null {
      if (depth >= limit) return null;
      depth += 1;
      const settled = tail.then(job, job);
      tail = settled.then(
        () => {
          depth -= 1;
        },
        () => {
          depth -= 1;
        },
      );
      return settled;
    },
  };
}

export default function (pi: ExtensionAPI) {
  const queue = createQueue(MAX_QUEUE);
  void pruneBlocks();

  pi.on("tool_result", async (event, ctx) => {
    if (mode === "off") return;
    if (event.isError) return;

    const session = ctx.sessionManager.getSessionId();
    const target = String(
      (event.input as { file_path?: string; path?: string; command?: string })?.file_path ??
        (event.input as { path?: string })?.path ??
        (event.input as { command?: string })?.command ??
        "",
    ).slice(0, 300);

    const recalled = recallPath(target);
    if (recalled) await log({ ts: Date.now(), kind: "recall", session, file: recalled });

    if (!TOOLS.includes(event.toolName)) return;

    const found = singleText(event.content);
    if (!found || found.text.length < MIN_CHARS) return;

    const blocks = splitBlocks(found.text, BLOCK_LINES);
    if (blocks.length < 2) return;

    const task = recentTask(ctx.sessionManager.getBranch(), TASK_CHARS);

    const egress = egressFor(target, found.text, task);
    if (egress.kind === "deny") {
      await log({
        ts: Date.now(),
        kind: "decision",
        session,
        mode,
        tool: event.toolName,
        chars: found.text.length,
        blocks: blocks.length,
        result: "egress-denied",
        reason: egress.reason,
      });
      return;
    }

    const request: Request = {
      tool: event.toolName,
      target,
      namedInTask: targetNamedInTask(target, task),
    };

    const batches = buildBatches(task, blocks, request, MAX_BATCH_CHARS);
    if (batches.length === 0) {
      const result = "no-budget";
      await log({
        ts: Date.now(),
        kind: "decision",
        session,
        mode,
        result,
        tool: event.toolName,
      });
      return;
    }

    let failure: string | undefined;
    const judged = await queue.run(async () => {
      const out: Judged[] = [];
      for (const batch of batches) {
        const envelope = await runJev(batch.spec);
        if (!envelope) {
          failure ??= "no-envelope";
          continue;
        }
        if (envelope.status !== "ok") {
          failure ??= envelope.status === "error" ? envelope.reason : envelope.status;
          continue;
        }
        for (const block of batch.blocks) {
          const verdict = verdictFor(envelope, block.id);
          if (verdict) out.push({ block, noul: verdict.noul, band: verdict.band });
        }
      }
      return out;
    });

    if (judged === null) {
      await log({
        ts: Date.now(),
        kind: "decision",
        session,
        mode,
        tool: event.toolName,
        result: "queue-full",
        pending: queue.depth(),
        blocks: blocks.length,
      });
      return;
    }
    if (judged.length === 0) {
      const result = "no-judgment";
      await log({
        ts: Date.now(),
        kind: "decision",
        session,
        mode,
        result,
        reason: failure,
        tool: event.toolName,
      });
      return;
    }

    const actions: Action[] = judged.map(decide);
    const hides = actions.filter((a) => a.kind === "hide").length;
    await log({
      ts: Date.now(),
      kind: "decision",
      schema: STATE_SCHEMA,
      question: QUESTION_ID,
      namedInTask: request.namedInTask,
      session,
      mode,
      tool: event.toolName,
      chars: found.text.length,
      blocks: blocks.length,
      passes: batches.length,
      hidden: hides,
      verdicts: actions.map((a) => ({
        id: a.judged.block.id,
        from: a.judged.block.from,
        to: a.judged.block.to,
        noul: Number(a.judged.noul.toFixed(3)),
        band: a.judged.band,
      })),
    });

    if (hides === 0) return;

    // ponytail: samples never pruned; a superseded instrument's samples sit beside the current one.
    let paths: Map<string, string>;
    try {
      paths = await cacheBlocks(session, actions);
    } catch {
      return;
    }
    if (mode !== "on") return;
    const source = `${event.toolName}${target ? ` ${target}` : ""}`;
    const next = applySieve(found.text, actions, paths, source);
    if (next === found.text) return;

    const content = [...event.content];
    content[found.index] = { type: "text", text: next };
    return { content };
  });
}
