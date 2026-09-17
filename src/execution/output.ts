import fs from "node:fs";
import path from "node:path";
import { ensureDir, getStateDir, readJsonIfExists, writeSecureJson } from "../config/paths.js";
import { redact } from "../logger/index.js";
import { sanitizeExecutionOutput } from "./sanitize.js";

export const MAX_OUTPUT_RECORDS = 40;

export interface ExecutionOutputMeta {
  id: number;
  command: string;
  exitCode: number | null;
  timestamp: string;
  taskId?: string;
  iteration?: number;
  repositoryId?: string;
  repositoryRoot?: string;
  allowed: boolean;
  restrictedReason?: string;
  truncated: boolean;
  sizeBytes: number;
}

interface OutputIndex {
  nextId: number;
  items: ExecutionOutputMeta[];
}

function outputDir(workspaceId: string): string {
  return ensureDir(path.join(getStateDir(), "execution-outputs", workspaceId));
}

function indexFile(workspaceId: string): string {
  return path.join(outputDir(workspaceId), "index.json");
}

function bodyFile(workspaceId: string, id: number): string {
  return path.join(outputDir(workspaceId), "bodies", `${id}.txt`);
}

function readIndex(workspaceId: string): OutputIndex {
  return (
    readJsonIfExists<OutputIndex>(indexFile(workspaceId)) ?? {
      nextId: 1,
      items: [],
    }
  );
}

function writeIndex(workspaceId: string, index: OutputIndex): void {
  writeSecureJson(indexFile(workspaceId), index);
}

export interface SaveOutputInput {
  command: string;
  raw: string;
  exitCode?: number | null;
  taskId?: string;
  iteration?: number;
  repositoryId?: string;
  repositoryRoot?: string;
}

function repositoryMetadata(): Pick<ExecutionOutputMeta, "repositoryId" | "repositoryRoot"> {
  const id = process.env.C2C_RECORD_REPOSITORY_ID?.trim();
  const root = process.env.C2C_RECORD_REPOSITORY_ROOT?.trim();
  return {
    repositoryId: id && /^[a-f0-9]{12}$/i.test(id) ? id.toLowerCase() : undefined,
    repositoryRoot: root ? root.slice(0, 1024) : undefined,
  };
}

export function saveExecutionOutput(workspaceId: string, input: SaveOutputInput): ExecutionOutputMeta {
  const sanitized = sanitizeExecutionOutput(input.raw);
  const index = readIndex(workspaceId);
  const id = index.nextId;
  const timestamp = new Date().toISOString();
  const allowed = sanitized.allowed;
  const text = allowed ? sanitized.text : "";
  const truncated = allowed ? sanitized.truncated : false;
  const repository = repositoryMetadata();
  const meta: ExecutionOutputMeta = {
    id,
    command: redact(input.command).slice(0, 200),
    exitCode: input.exitCode ?? null,
    timestamp,
    taskId: input.taskId,
    iteration: input.iteration,
    repositoryId: input.repositoryId ?? repository.repositoryId,
    repositoryRoot: input.repositoryRoot ?? repository.repositoryRoot,
    allowed,
    restrictedReason: allowed ? undefined : sanitized.reason,
    truncated,
    sizeBytes: Buffer.byteLength(text, "utf8"),
  };
  if (allowed && text) {
    const file = bodyFile(workspaceId, id);
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, text, { mode: 0o600 });
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      /* ignore */
    }
  }
  index.nextId = id + 1;
  index.items.push(meta);
  while (index.items.length > MAX_OUTPUT_RECORDS) {
    const dropped = index.items.shift();
    if (dropped) fs.rmSync(bodyFile(workspaceId, dropped.id), { force: true });
  }
  writeIndex(workspaceId, index);
  return meta;
}

export function listExecutionOutputs(
  workspaceId: string,
  limit = 20,
  repositoryId?: string
): ExecutionOutputMeta[] {
  const items = readIndex(workspaceId).items.filter((item) => {
    if (!repositoryId) return true;
    const legacyStandaloneItem = !item.repositoryId && workspaceId === repositoryId;
    return item.repositoryId === repositoryId || legacyStandaloneItem;
  });
  return items.slice(-Math.max(1, Math.min(50, limit)));
}

export function readExecutionOutput(
  workspaceId: string,
  id: number,
  repositoryId?: string
):
  | { ok: true; meta: ExecutionOutputMeta; text: string }
  | { ok: false; error: "NOT_FOUND" | "OUTPUT_RESTRICTED" } {
  const meta = readIndex(workspaceId).items.find((item) => item.id === id);
  if (!meta) return { ok: false, error: "NOT_FOUND" };
  if (repositoryId) {
    const legacyStandaloneItem = !meta.repositoryId && workspaceId === repositoryId;
    if (meta.repositoryId !== repositoryId && !legacyStandaloneItem) {
      return { ok: false, error: "NOT_FOUND" };
    }
  }
  if (!meta.allowed) return { ok: false, error: "OUTPUT_RESTRICTED" };
  const file = bodyFile(workspaceId, id);
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  return { ok: true, meta, text };
}
