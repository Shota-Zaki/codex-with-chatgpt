import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDir, getStateDir } from "../config/paths.js";
import { findBridgeObservation, findLiveBridge, readRuntimeState, type RuntimeState } from "../bridge/runtime.js";
import { Workspace } from "../workspace/manager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** daemonからの起動をプライバシー初期化付きの共通エントリーへ統一する。 */
function cliEntry(): { cmd: string; args: string[] } {
  return { cmd: process.execPath, args: [path.resolve(__dirname, "..", "..", "bin", "c2c.js")] };
}

export interface EnsureBridgeResult {
  runtime: RuntimeState;
  spawned: boolean;
}

export async function ensureBridge(workspaceRoot: string, opts: { port?: number } = {}): Promise<EnsureBridgeResult> {
  const workspace = new Workspace(workspaceRoot);
  const observation = await findBridgeObservation(workspace.id);
  if (observation.state === "healthy") return { runtime: observation.runtime, spawned: false };
  if (observation.state === "unknown") {
    throw new Error(`接続サービスの状態を確認できません（${observation.reason}）。重複起動を停止しました。`);
  }

  const logDir = ensureDir(path.join(getStateDir(), "logs"));
  const logFile = path.join(logDir, `bridge-${workspace.id}.out.log`);
  const out = fs.openSync(logFile, "a", 0o600);
  try {
    fs.chmodSync(logFile, 0o600);
  } catch {
    /* 権限モデルが異なるOSでは既存仕様を維持。 */
  }

  const { cmd, args } = cliEntry();
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(
      cmd,
      [...args, "serve", "--workspace", workspace.root, ...(opts.port ? ["--port", String(opts.port)] : [])],
      {
        detached: true,
        stdio: ["ignore", out, out],
        env: { ...process.env },
        windowsHide: true,
      }
    );
  } finally {
    fs.closeSync(out);
  }

  let spawnError: Error | null = null;
  child.on("error", error => {
    spawnError = error;
  });
  child.unref();

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 300));
    if (spawnError) throw new Error("接続サービスのプロセスを起動できません。");
    const runtime = await findLiveBridge(workspace.id);
    if (runtime) return { runtime, spawned: true };
    if (child.exitCode !== null && child.exitCode !== 0) {
      throw new Error(`接続サービスが終了しました（終了コード ${child.exitCode}）。ログを確認してください。`);
    }
  }

  throw new Error(`接続サービスの起動確認がタイムアウトしました。ログ: ${logFile}`);
}

export async function adminFetch<T = unknown>(
  runtime: RuntimeState,
  method: "GET" | "POST",
  route: string,
  timeoutMs = 60_000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://127.0.0.1:${runtime.port}${route}`, {
      method,
      headers: { Authorization: `Bearer ${runtime.adminToken}` },
      signal: controller.signal,
      redirect: "error",
    });
    const body = (await response.json().catch(() => ({}))) as T & { message?: string };
    if (!response.ok) {
      throw new Error(body.message ?? `管理要求に失敗しました（HTTP ${response.status}）。`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export async function stopBridge(workspaceRoot: string): Promise<boolean> {
  const workspace = new Workspace(workspaceRoot);
  const runtime = readRuntimeState(workspace.id);
  if (!runtime) return false;

  const observation = await findBridgeObservation(workspace.id);
  if (observation.state === "healthy") {
    try {
      await adminFetch(runtime, "POST", "/admin/shutdown", 5000);
      return true;
    } catch {
      return false;
    }
  }

  // 保存されたPIDだけでは現在の所有者を確認できない。別プロセスを終了させない。
  return false;
}
