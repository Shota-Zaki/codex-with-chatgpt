import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ensureDir, getStateDir } from "../config/paths.js";

/**
 * Lightweight execution records written by the Codex harness after each
 * iteration (via `c2c record`). ChatGPT reads them through the
 * `execution_summary` and `test_status` MCP tools.
 */
export const executionRecordSchema = z.object({
  taskId: z.string(),
  iteration: z.number().int().nonnegative(),
  changedFiles: z.union([z.array(z.string()), z.number().int().nonnegative()]),
  tests: z.string().nullable(),
  exitStatus: z.string(),
  timestamp: z.string(),
  notes: z.string().optional(),
  outputId: z.number().int().positive().optional(),
  outputAvailable: z.boolean().optional(),
  repositoryId: z.string().regex(/^[a-f0-9]{12}$/i).optional(),
  repositoryRoot: z.string().max(1024).optional(),
});

export type ExecutionRecord = z.infer<typeof executionRecordSchema>;

function recordsFile(workspaceId: string): string {
  const dir = ensureDir(path.join(getStateDir(), "executions"));
  return path.join(dir, `${workspaceId}.jsonl`);
}

function repositoryMetadata(): Pick<ExecutionRecord, "repositoryId" | "repositoryRoot"> {
  const id = process.env.C2C_RECORD_REPOSITORY_ID?.trim();
  const root = process.env.C2C_RECORD_REPOSITORY_ROOT?.trim();
  return {
    repositoryId: id && /^[a-f0-9]{12}$/i.test(id) ? id.toLowerCase() : undefined,
    repositoryRoot: root ? root.slice(0, 1024) : undefined,
  };
}

export function appendExecutionRecord(workspaceId: string, record: ExecutionRecord): void {
  const file = recordsFile(workspaceId);
  const metadata = repositoryMetadata();
  const next = executionRecordSchema.parse({
    ...record,
    repositoryId: record.repositoryId ?? metadata.repositoryId,
    repositoryRoot: record.repositoryRoot ?? metadata.repositoryRoot,
  });
  fs.appendFileSync(file, JSON.stringify(next) + "\n", { mode: 0o600 });
}

export function readExecutionRecords(
  workspaceId: string,
  limit = 10,
  repositoryId?: string
): ExecutionRecord[] {
  const file = recordsFile(workspaceId);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
  const records: ExecutionRecord[] = [];
  const requestedLimit = Math.max(1, Math.floor(limit));
  for (let index = lines.length - 1; index >= 0 && records.length < requestedLimit; index--) {
    try {
      const parsed = executionRecordSchema.safeParse(JSON.parse(lines[index]));
      if (!parsed.success) continue;
      const record = parsed.data;
      if (repositoryId) {
        const legacyStandaloneRecord = !record.repositoryId && workspaceId === repositoryId;
        if (record.repositoryId !== repositoryId && !legacyStandaloneRecord) continue;
      }
      records.push(record);
    } catch {
      // skip corrupt lines
    }
  }
  return records.reverse();
}

export function readRepositoryExecutionRecords(
  workspaceId: string,
  repositoryId: string,
  limit = 10
): ExecutionRecord[] {
  const requestedLimit = Math.max(1, Math.floor(limit));
  const current = readExecutionRecords(workspaceId, requestedLimit, repositoryId);
  if (workspaceId === repositoryId) return current;

  // A repository used as a standalone Workspace historically stored records
  // under its repository/Workspace id. Keep that history visible after the
  // repository is attached to a parent multi-repository Workspace.
  const legacy = readExecutionRecords(repositoryId, requestedLimit, repositoryId);
  return [...legacy, ...current]
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .slice(-requestedLimit);
}

export function latestExecutionRecord(workspaceId: string): ExecutionRecord | null {
  const records = readExecutionRecords(workspaceId, 1);
  return records[records.length - 1] ?? null;
}

export function latestRepositoryExecutionRecord(
  workspaceId: string,
  repositoryId: string
): ExecutionRecord | null {
  const records = readRepositoryExecutionRecords(workspaceId, repositoryId, 1);
  return records[records.length - 1] ?? null;
}
