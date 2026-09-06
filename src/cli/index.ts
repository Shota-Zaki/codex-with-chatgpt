import { Command, InvalidArgumentError } from "commander";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startBridge } from "../bridge/server.js";
import { findBridgeObservation, findLiveBridge, type RuntimeState } from "../bridge/runtime.js";
import { adminFetch, ensureBridge, stopBridge } from "../process/daemon.js";
import { Workspace } from "../workspace/manager.js";
import { AuthStore } from "../auth/store.js";
import { detectTunnelBinaries } from "../tunnel/detect.js";
import {
  chooseQuickTunnel,
  hasCloudflaredCert,
  ProcessCloudflaredAccount,
  provisionNamedTunnel,
} from "../tunnel/named-provision.js";
import { parseZoneInput, suggestedNamedHostname } from "../tunnel/hostname.js";
import {
  isNamedTunnelReady,
  NAMED_LOGIN_PROMPT,
  NAMED_REPAIR_MESSAGE,
  needsTunnelChoice,
  readTunnelState,
  TUNNEL_CHOICE_PROMPT,
} from "../tunnel/state.js";
import { Logger } from "../logger/index.js";
import { getStateDir } from "../config/paths.js";
import { ensureSandboxAllowlist, getCodexConfigPath, isStateDirAllowlisted } from "../config/sandbox-allow.js";
import { mergeUiPrefs, readUiPrefs, SETUP_MODES, type SetupMode } from "../config/ui-prefs.js";
import {
  CHATGPT_CREATE_CONNECTOR_URL,
  CHATGPT_DEVELOPER_MODE_URL,
  CHATGPT_PLUGINS_URL,
  connectorAction,
  connectorNameFor,
  mcpUrlFromPublic,
  normalizePublicUrl,
  readLastEndpoint,
  reclaimUserMessage,
  writeLastEndpoint,
  type LastEndpoint,
} from "../config/endpoint.js";
import { PRODUCT_NAME, VERSION } from "../version.js";
import {
  clearChatPointer,
  mergeSession,
  readSession,
  resolveConversation,
  writeSession,
  PROTOCOL_STATES,
  WAITING_FOR,
  type ConversationMode,
  type ProtocolState,
  type WaitingFor,
} from "../session/state.js";
import { appendExecutionRecord } from "../execution/records.js";
import { saveExecutionOutput } from "../execution/output.js";

const program = new Command();

const say = (msg: string): void => {
  process.stdout.write(msg + "\n");
};
const check = (msg: string): void => say(`✓ ${msg}`);
const cross = (msg: string): void => say(`✗ ${msg}`);

function resolveWorkspace(option?: string): string {
  return path.resolve(option ?? process.cwd());
}

function parseInteger(value: string): number {
  const normalized = value.trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw new InvalidArgumentError("must be an integer");
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) throw new InvalidArgumentError("must be a safe integer");
  return parsed;
}

function parseNonNegativeInteger(value: string): number {
  const parsed = parseInteger(value);
  if (parsed < 0) throw new InvalidArgumentError("must be a non-negative integer");
  return parsed;
}

function parseChangedFiles(value: string): string[] | number {
  const normalized = value.trim();
  if (/^-?\d+$/.test(normalized)) {
    const count = parseInteger(normalized);
    if (count < 0) {
      throw new InvalidArgumentError("changed-files count must be a non-negative safe integer");
    }
    return count;
  }
  return value.split(",").map((file) => file.trim()).filter(Boolean);
}

/** Local harness output only. Never pasted into ChatGPT. */
const MAX_RECORD_OUTPUT_READ = 256 * 1024;

function readCappedUtf8(filePath: string, maxBytes: number): string {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(maxBytes);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

function persistWorkspaceEndpoint(opts: {
  workspaceId: string;
  workspaceName: string;
  port: number;
  publicUrl: string | null;
  mcpUrl: string;
  previous?: LastEndpoint | null;
}): string {
  const previous = opts.previous ?? readLastEndpoint(opts.workspaceId);
  const connectorName = connectorNameFor({
    workspaceName: opts.workspaceName,
    workspaceId: opts.workspaceId,
    previousName: previous?.connectorName,
    hadEndpointBefore: Boolean(previous),
  });
  writeLastEndpoint({
    workspaceId: opts.workspaceId,
    port: opts.port,
    publicUrl: opts.publicUrl,
    mcpUrl: opts.mcpUrl,
    connectorName,
  });
  return connectorName;
}

function tunnelChoicePayload(workspace: Workspace, zoneHint?: string): Record<string, unknown> {
  const state = readTunnelState(workspace.id);
  const zone = parseZoneInput(zoneHint ?? "") ?? state.zone ?? null;
  return {
    ok: true,
    needsChoice: needsTunnelChoice(state),
    preference: state.preference,
    loggedIn: hasCloudflaredCert(),
    namedReady: isNamedTunnelReady(state),
    zone,
    hostname: state.hostname ?? null,
    suggestedHostname: zone ? suggestedNamedHostname(zone, workspace.name, workspace.id) : null,
    userPrompt: needsTunnelChoice(state) ? TUNNEL_CHOICE_PROMPT : undefined,
    loginPrompt: NAMED_LOGIN_PROMPT,
    fallbackReason: state.fallbackReason,
  };
}

function trySandboxAllow():
  | { ok: true; added: boolean; alreadyAllowed: boolean; stateDir: string; configPath: string }
  | { ok: false; added: false; alreadyAllowed: false; error: string } {
  try {
    const result = ensureSandboxAllowlist();
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, added: false, alreadyAllowed: false, error: (error as Error).message };
  }
}

interface TunnelStartResponse {
  url?: string;
  error?: string;
  message?: string;
}

interface PairingResponse {
  code: string;
  expiresAt: number;
}

interface AdminInfo {
  workspaceId: string;
  workspaceName: string;
  workspaceRoot: string;
  port: number;
  publicUrl: string | null;
  tunnel: { running: boolean; url: string | null; provider: string };
  tokenCount: number;
  pairingActive: boolean;
  pid: number;
  startedAt: string;
}

async function ensureBridgeAndTunnel(
  workspaceRoot: string,
  opts: { tunnel: boolean }
): Promise<{ runtime: RuntimeState; info: AdminInfo; mcpUrl: string | null }> {
  const { runtime } = await ensureBridge(workspaceRoot);
  let info = await adminFetch<AdminInfo>(runtime, "GET", "/admin/info");
  let mcpUrl: string | null = info.publicUrl ? `${info.publicUrl}/mcp` : null;
  if (opts.tunnel && !info.publicUrl) {
    const binaries = detectTunnelBinaries();
    if (!binaries.cloudflared) {
      throw new Error(
        "NEED_CLOUDFLARED: cloudflared is not installed. Install it first (macOS: brew install cloudflared)."
      );
    }
    const result = await adminFetch<TunnelStartResponse>(runtime, "POST", "/admin/tunnel/start", 90_000);
    if (!result.url) throw new Error(result.message ?? "Tunnel start failed");
    info = await adminFetch<AdminInfo>(runtime, "GET", "/admin/info");
    mcpUrl = `${result.url}/mcp`;
  }
  return { runtime, info, mcpUrl };
}

program
  .name("c2c")
  .description(`${PRODUCT_NAME} — ChatGPT thinks. Codex works.`)
  .version(VERSION, "-v, --version")
  .configureHelp({ sortSubcommands: true });

// ---------------------------------------------------------------- serve (internal)

program
  .command("serve", { hidden: true })
  .description("Run the bridge in the foreground (internal)")
  .requiredOption("--workspace <path>")
  .option("--port <port>", "preferred port")
  .action(async (opts: { workspace: string; port?: string }) => {
    const logger = new Logger({ name: "bridge", console: true });
    const bridge = await startBridge({
      workspaceRoot: resolveWorkspace(opts.workspace),
      port: opts.port ? parseInt(opts.port, 10) : undefined,
      logger,
    });
    const shutdown = (): void => {
      void bridge.close().then(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    say(`bridge ready on ${bridge.localBaseUrl()} (workspace ${bridge.workspace.name})`);
  });

// ---------------------------------------------------------------- start

program
  .command("start")
  .description("Start (or reuse) the bridge for this workspace")
  .option("-w, --workspace <path>", "workspace root (defaults to current directory)")
  .option("--tunnel", "also establish the secure public connection", false)
  .option("--json", "machine-readable output", false)
  .action(async (opts: { workspace?: string; tunnel: boolean; json: boolean }) => {
    const root = resolveWorkspace(opts.workspace);
    try {
      const { runtime, info, mcpUrl } = await ensureBridgeAndTunnel(root, { tunnel: opts.tunnel });
      const connectorName = mcpUrl
        ? persistWorkspaceEndpoint({
            workspaceId: info.workspaceId,
            workspaceName: info.workspaceName,
            port: runtime.port,
            publicUrl: info.publicUrl,
            mcpUrl,
          })
        : readLastEndpoint(info.workspaceId)?.connectorName;
      if (opts.json) {
        say(JSON.stringify({ ok: true, port: runtime.port, workspaceId: info.workspaceId, mcpUrl, connectorName }));
        return;
      }
      check(`現在のプロジェクトを確認（${info.workspaceName}）`);
      check("Workspace Bridgeを起動");
      if (mcpUrl) check("安全な接続を確立");
    } catch (error) {
      handleCliError(error, opts.json);
    }
  });

// ---------------------------------------------------------------- setup

program
  .command("setup")
  .description("First-time setup: bridge + secure connection + pairing code")
  .option("-w, --workspace <path>")
  .option("--no-tunnel", "local-only setup (development)")
  .option("--json", "machine-readable output", false)
  .action(async (opts: { workspace?: string; tunnel: boolean; json: boolean }) => {
    const root = resolveWorkspace(opts.workspace);
    try {
      if (!opts.json) {
        say(PRODUCT_NAME);
        say("");
        say("ChatGPTへ接続しています…");
        say("");
      }
      const sandbox = trySandboxAllow();
      const { runtime, info, mcpUrl } = await ensureBridgeAndTunnel(root, { tunnel: opts.tunnel });
      const connectorName = mcpUrl
        ? persistWorkspaceEndpoint({
            workspaceId: info.workspaceId,
            workspaceName: info.workspaceName,
            port: runtime.port,
            publicUrl: info.publicUrl,
            mcpUrl,
          })
        : connectorNameFor({
            workspaceName: info.workspaceName,
            workspaceId: info.workspaceId,
            previousName: readLastEndpoint(info.workspaceId)?.connectorName,
            hadEndpointBefore: Boolean(readLastEndpoint(info.workspaceId)),
          });
      const pairingResult = await adminFetch<PairingResponse>(runtime, "POST", "/admin/pairing");
      const tunnelState = readTunnelState(info.workspaceId);
      if (opts.json) {
        say(
          JSON.stringify({
            ok: true,
            workspaceId: info.workspaceId,
            workspaceName: info.workspaceName,
            connectorName,
            mcpUrl: mcpUrl ?? `http://127.0.0.1:${runtime.port}/mcp`,
            local: mcpUrl === null,
            pairingCode: pairingResult.code,
            pairingExpiresAt: pairingResult.expiresAt,
            sandbox,
            tunnel: {
              mode: isNamedTunnelReady(tunnelState) ? "named" : "quick",
              hostname: tunnelState.hostname ?? null,
              fallback: Boolean(tunnelState.fallbackReason),
            },
          })
        );
        return;
      }
      check(`現在のプロジェクトを確認（${info.workspaceName}）`);
      check("Workspace Bridgeを起動");
      if (mcpUrl) check("安全な接続を確立");
      say("");
      say(`接続先：${mcpUrl ?? `http://127.0.0.1:${runtime.port}/mcp`}`);
      say(`ペアリングコード：${pairingResult.code}（${Math.round((pairingResult.expiresAt - Date.now()) / 60000)}分間有効）`);
      say("");
      say("次の手順：ChatGPTのコネクタ設定に上記の接続先をOAuthとして追加し、認証画面でペアリングコードを入力してください。");
      say("Codex Skillを使用している場合、この手順は自動で実行されます。");
    } catch (error) {
      handleCliError(error, opts.json);
    }
  });

// ---------------------------------------------------------------- stop / restart

program
  .command("stop")
  .description("Stop the bridge for this workspace")
  .option("-w, --workspace <path>")
  .action(async (opts: { workspace?: string }) => {
    const stopped = await stopBridge(resolveWorkspace(opts.workspace));
    if (stopped) check("Bridgeを停止しました");
    else say("実行中のBridgeはありません。");
  });

program
  .command("restart")
  .description("Restart the bridge for this workspace")
  .option("-w, --workspace <path>")
  .option("--tunnel", "re-establish the secure public connection", false)
  .action(async (opts: { workspace?: string; tunnel: boolean }) => {
    const root = resolveWorkspace(opts.workspace);
    await stopBridge(root);
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const { info, mcpUrl } = await ensureBridgeAndTunnel(root, { tunnel: opts.tunnel });
      check(`Bridgeを再起動（${info.workspaceName}）`);
      if (mcpUrl) check("安全な接続を確立");
    } catch (error) {
      handleCliError(error, false);
    }
  });

// ---------------------------------------------------------------- status

program
  .command("status")
  .description("Show bridge status for this workspace")
  .option("-w, --workspace <path>")
  .option("--json", "machine-readable output", false)
  .action(async (opts: { workspace?: string; json: boolean }) => {
    const root = resolveWorkspace(opts.workspace);
    const workspace = new Workspace(root);
    const observation = await findBridgeObservation(workspace.id);
    if (observation.state === "unknown") {
      if (opts.json) {
        say(JSON.stringify({ ok: false, running: null, state: "unknown", reason: observation.reason }));
      } else {
        cross(`Bridgeの状態を確認できません（${observation.reason}）。停止中とは判断しません。`);
      }
      return;
    }
    if (observation.state === "stopped") {
      if (opts.json) say(JSON.stringify({ ok: false, running: false }));
      else say("Bridgeは実行されていません。`c2c start` で起動できます。");
      return;
    }
    const runtime = observation.runtime;
    const info = await adminFetch<AdminInfo>(runtime, "GET", "/admin/info");
    if (opts.json) {
      say(JSON.stringify({ ok: true, running: true, ...info }));
      return;
    }
    say(PRODUCT_NAME);
    say("");
    check(`Workspace：${info.workspaceName}`);
    check(`Bridge：実行中（ポート ${info.port}）`);
    if (info.tunnel.running && info.tunnel.url) check(`安全な接続：${info.tunnel.url}/mcp`);
    else say("· 安全な接続：無効（ローカルモード）");
    say(`· 認証済み接続：${info.tokenCount > 0 ? "あり" : "なし"}`);
  });

// ---------------------------------------------------------------- doctor

program
  .command("doctor")
  .description("Diagnose and auto-repair the connection")
  .option("-w, --workspace <path>")
  .option("--no-fix", "diagnose only, do not repair")
  .option("--json", "machine-readable output", false)
  .action(async (opts: { workspace?: string; fix: boolean; json: boolean }) => {
    const root = resolveWorkspace(opts.workspace);
    const report: Record<string, { ok: boolean; detail?: string }> = {};
    const results: string[] = [];

    // Node
    const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
    report.node = { ok: nodeMajor >= 20, detail: `v${process.versions.node}` };

    // Codex sandbox writable_roots (so later chats do not need elevation)
    if (opts.fix) {
      const sandbox = trySandboxAllow();
      if (sandbox.ok) {
        report.sandbox = { ok: true, detail: sandbox.alreadyAllowed ? "許可リスト登録済み" : "許可リストへ追加済み" };
        if (sandbox.added) results.push("ローカル設定ディレクトリをCodex sandboxの許可リストへ追加しました");
      } else {
        report.sandbox = { ok: false, detail: sandbox.error };
      }
    } else {
      try {
        const configPath = getCodexConfigPath();
        const allowed =
          fs.existsSync(configPath) && isStateDirAllowlisted(fs.readFileSync(configPath, "utf8"), getStateDir());
        report.sandbox = allowed ? { ok: true, detail: "許可リスト登録済み" } : { ok: false, detail: "許可リスト未登録" };
      } catch (error) {
        report.sandbox = { ok: false, detail: (error as Error).message };
      }
    }

    // Workspace
    let workspace: Workspace | null = null;
    try {
      workspace = new Workspace(root);
      report.workspace = { ok: true, detail: workspace.name };
    } catch (error) {
      report.workspace = { ok: false, detail: (error as Error).message };
    }

    // Bridge
    let runtime: RuntimeState | null = null;
    let bridgeUnknown = false;
    if (workspace) {
      const observation = await findBridgeObservation(workspace.id);
      if (observation.state === "healthy") {
        runtime = observation.runtime;
      } else if (observation.state === "unknown") {
        bridgeUnknown = true;
        report.bridge = { ok: false, detail: `状態を確認できません（${observation.reason}）。自動修復は実行していません` };
      } else if (opts.fix) {
        try {
          runtime = (await ensureBridge(root)).runtime;
          results.push("Bridgeを自動起動しました");
        } catch (error) {
          report.bridge = { ok: false, detail: (error as Error).message };
        }
      }
      if (runtime) report.bridge = { ok: true, detail: `ポート ${runtime.port}` };
      else report.bridge = report.bridge ?? { ok: false, detail: "未実行" };
    }

    // MCP local reachability (401 without token means MCP + auth both work)
    if (runtime) {
      try {
        const response = await fetch(`http://127.0.0.1:${runtime.port}/mcp`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
        });
        report.mcp = { ok: response.status === 401, detail: `未認証リクエストの応答 ${response.status}` };
        report.oauth = { ok: response.status === 401 };
      } catch (error) {
        report.mcp = { ok: false, detail: (error as Error).message };
      }
    }

    // Tunnel + remote reachability. If this workspace once had a public URL,
    // a full quit reclaims it — restore a tunnel and tell the Skill to update
    // the existing ChatGPT connector (never treat that as "local mode").
    const lastEndpoint = workspace ? readLastEndpoint(workspace.id) : null;
    const connectorName = workspace
      ? connectorNameFor({
          workspaceName: workspace.name,
          workspaceId: workspace.id,
          previousName: lastEndpoint?.connectorName,
          hadEndpointBefore: Boolean(lastEndpoint),
        })
      : "Codex with ChatGPT";
    const tunnelState = workspace ? readTunnelState(workspace.id) : null;
    const namedReady = tunnelState ? isNamedTunnelReady(tunnelState) : false;
    let namedRepair: { needed: boolean; userMessage?: string } = { needed: false };
    let chatgptRepair: {
      needed: boolean;
      reason?: string;
      connectorAction: "none" | "create" | "update";
      connectorName: string;
      userMessage?: string;
      mcpUrl: string | null;
      previousMcpUrl: string | null;
      pairingCode?: string;
      pairingExpiresAt?: number;
      pages: {
        developerMode: string;
        plugins: string;
        createConnector: string;
      };
    } = {
      needed: false,
      connectorAction: "none",
      connectorName,
      mcpUrl: lastEndpoint?.mcpUrl ?? null,
      previousMcpUrl: lastEndpoint?.mcpUrl ?? null,
      pages: {
        developerMode: CHATGPT_DEVELOPER_MODE_URL,
        plugins: CHATGPT_PLUGINS_URL,
        createConnector: CHATGPT_CREATE_CONNECTOR_URL,
      },
    };

    if (runtime) {
      let info = await adminFetch<AdminInfo>(runtime, "GET", "/admin/info");
      if (namedReady && opts.fix && info.tunnel.provider !== "cloudflare-named") {
        await stopBridge(root);
        await new Promise((resolve) => setTimeout(resolve, 400));
        try {
          runtime = (await ensureBridge(root)).runtime;
          info = await adminFetch<AdminInfo>(runtime, "GET", "/admin/info");
          results.push("固定ドメイン接続へ切り替えました");
        } catch (error) {
          report.tunnel = { ok: false, detail: (error as Error).message };
        }
      }
      const expectedPublic = Boolean(lastEndpoint?.publicUrl) || namedReady;
      let currentUrl = info.publicUrl ?? info.tunnel.url;
      let healthy = false;
      if (currentUrl) {
        try {
          const response = await fetch(`${currentUrl}/health`, { signal: AbortSignal.timeout(8000) });
          healthy = response.ok;
        } catch {
          healthy = false;
        }
      }

      if ((!currentUrl || !healthy) && opts.fix && (expectedPublic || info.tunnel.running)) {
        try {
          const binaries = detectTunnelBinaries();
          if (!binaries.cloudflared) {
            report.tunnel = { ok: false, detail: "NEED_CLOUDFLARED" };
          } else {
            const started = await adminFetch<TunnelStartResponse>(runtime, "POST", "/admin/tunnel/start", 90_000);
            if (started.url) {
              const previousUrl = lastEndpoint?.publicUrl;
              currentUrl = started.url;
              healthy = true;
              info = await adminFetch<AdminInfo>(runtime, "GET", "/admin/info");
              const sameAddress =
                previousUrl && normalizePublicUrl(previousUrl) === normalizePublicUrl(started.url);
              results.push(sameAddress ? "安全な接続を再確立しました" : "安全な接続を再確立しました（接続先が変更されました）");
            }
          }
        } catch (error) {
          report.tunnel = { ok: false, detail: (error as Error).message };
        }
      }

      if (currentUrl && healthy) {
        report.tunnel = { ok: true, detail: currentUrl };
        const nextMcp = mcpUrlFromPublic(currentUrl);
        const action = connectorAction(lastEndpoint?.mcpUrl, nextMcp);
        const boundName = nextMcp
          ? persistWorkspaceEndpoint({
              workspaceId: info.workspaceId,
              workspaceName: info.workspaceName,
              port: runtime.port,
              publicUrl: currentUrl,
              mcpUrl: nextMcp,
              previous: lastEndpoint,
            })
          : connectorName;
        chatgptRepair = {
          ...chatgptRepair,
          needed: action === "update",
          reason: action === "update" ? "address_reclaimed" : undefined,
          connectorAction: action,
          connectorName: boundName,
          userMessage: action === "update" ? reclaimUserMessage(boundName) : undefined,
          mcpUrl: nextMcp,
          previousMcpUrl: lastEndpoint?.mcpUrl ?? null,
        };
        if (action === "update") {
          try {
            const pairing = await adminFetch<PairingResponse>(runtime, "POST", "/admin/pairing");
            chatgptRepair.pairingCode = pairing.code;
            chatgptRepair.pairingExpiresAt = pairing.expiresAt;
            results.push(`新しいペアリングコードを生成しました。「${boundName}」の更新が必要です`);
          } catch (error) {
            report.oauth = { ok: false, detail: (error as Error).message };
          }
        }
      } else if (namedReady) {
        report.tunnel = report.tunnel ?? { ok: false, detail: "NAMED_TUNNEL_DOWN" };
        namedRepair = { needed: true, userMessage: NAMED_REPAIR_MESSAGE };
      } else if (expectedPublic) {
        report.tunnel = report.tunnel ?? { ok: false, detail: "安全な接続を復旧できません" };
        chatgptRepair = {
          ...chatgptRepair,
          needed: true,
          reason: "address_reclaimed",
          connectorAction: "update",
          connectorName,
          userMessage: reclaimUserMessage(connectorName),
          mcpUrl: null,
        };
      } else if (!currentUrl) {
        report.tunnel = { ok: true, detail: "無効（ローカルモード）" };
      } else {
        report.tunnel = { ok: false, detail: "公開アドレスへ接続できません" };
      }
    } else if (bridgeUnknown) {
      report.tunnel = report.tunnel ?? { ok: false, detail: "Bridgeの状態を確認できないため、コネクタ修復は実行していません" };
    } else if (namedReady) {
      report.tunnel = { ok: false, detail: "NAMED_TUNNEL_DOWN" };
      namedRepair = { needed: true, userMessage: NAMED_REPAIR_MESSAGE };
    } else if (lastEndpoint?.publicUrl) {
      report.tunnel = { ok: false, detail: "安全な接続は実行されていません" };
      chatgptRepair = {
        ...chatgptRepair,
        needed: true,
        reason: "address_reclaimed",
        connectorAction: "update",
        connectorName,
        userMessage: reclaimUserMessage(connectorName),
      };
    }

    if (opts.json) {
      say(JSON.stringify({ report, repairs: results, chatgptRepair, namedRepair }));
      return;
    }
    say(`${PRODUCT_NAME} Doctor`);
    say("");
    const labels: Record<string, string> = {
      node: "Node.js",
      sandbox: "Sandbox",
      workspace: "Workspace",
      bridge: "Bridge",
      mcp: "MCP",
      oauth: "OAuth",
      tunnel: "Tunnel",
    };
    let allOk = true;
    for (const [key, value] of Object.entries(report)) {
      const label = labels[key] ?? key;
      if (value.ok) check(`${label}${value.detail ? `（${value.detail}）` : ""}`);
      else {
        cross(`${label}${value.detail ? `：${value.detail}` : ""}`);
        allOk = false;
      }
    }
    for (const repair of results) say(`· ${repair}`);
    say("");
    if (namedRepair.needed && namedRepair.userMessage) {
      say(namedRepair.userMessage);
      say("");
    }
    if (chatgptRepair.needed && chatgptRepair.userMessage) {
      say(chatgptRepair.userMessage);
      if (chatgptRepair.mcpUrl) say(`新しい接続先：${chatgptRepair.mcpUrl}`);
      if (chatgptRepair.pairingCode) say(`ペアリングコード：${chatgptRepair.pairingCode}`);
      say("");
    }
    say(
      allOk && !chatgptRepair.needed && !namedRepair.needed
        ? "Everything looks good."
        : chatgptRepair.needed
          ? "ローカル側の準備は完了しています。ChatGPTで対象コネクタを削除し、再追加する必要があります。"
          : namedRepair.needed
            ? "固定ドメインへ接続できていません。先にCloudflareへログインしてください。"
            : "未解決の問題があります。`c2c restart --tunnel` を試してください。"
    );
    if (!allOk || namedRepair.needed) process.exitCode = 1;
  });

// ---------------------------------------------------------------- pair / unpair

program
  .command("pair")
  .description("Generate a fresh pairing code")
  .option("-w, --workspace <path>")
  .option("--json", "machine-readable output", false)
  .action(async (opts: { workspace?: string; json: boolean }) => {
    try {
      const { runtime } = await ensureBridge(resolveWorkspace(opts.workspace));
      const pairing = await adminFetch<PairingResponse>(runtime, "POST", "/admin/pairing");
      if (opts.json) say(JSON.stringify({ ok: true, pairingCode: pairing.code, expiresAt: pairing.expiresAt }));
      else {
        say(`ペアリングコード：${pairing.code}`);
        say(`（${Math.round((pairing.expiresAt - Date.now()) / 60000)}分間有効・1回のみ使用可能）`);
      }
    } catch (error) {
      handleCliError(error, opts.json);
    }
  });

program
  .command("unpair")
  .description("Revoke ChatGPT's access to this workspace immediately")
  .option("-w, --workspace <path>")
  .action(async (opts: { workspace?: string }) => {
    const root = resolveWorkspace(opts.workspace);
    const workspace = new Workspace(root);
    const runtime = await findLiveBridge(workspace.id);
    if (runtime) {
      await adminFetch(runtime, "POST", "/admin/revoke-all");
    } else {
      // bridge not running: revoke directly in the persisted store
      new AuthStore(workspace.id).revokeAll();
    }
    check("現在のプロジェクトに対するChatGPTのアクセスを解除しました（すべてのTokenを失効）");
  });

// ---------------------------------------------------------------- logs / workspace / record

program
  .command("logs")
  .description("Show recent bridge logs")
  .option("-w, --workspace <path>")
  .option("-n, --lines <n>", "number of lines", "50")
  .option("--verbose", "include debug detail", false)
  .action((opts: { workspace?: string; lines: string; verbose: boolean }) => {
    const workspace = new Workspace(resolveWorkspace(opts.workspace));
    const candidates = [
      path.join(getStateDir(), "logs", "bridge.log"),
      path.join(getStateDir(), "logs", `bridge-${workspace.id}.out.log`),
    ];
    let shown = false;
    for (const file of candidates) {
      if (!fs.existsSync(file)) continue;
      const lines = fs.readFileSync(file, "utf8").trim().split("\n");
      const filtered = opts.verbose ? lines : lines.filter((line) => !line.includes(" DEBUG "));
      say(filtered.slice(-parseInt(opts.lines, 10)).join("\n"));
      shown = true;
    }
    if (!shown) say("ログはまだありません。");
  });

program
  .command("workspace")
  .description("Show workspace identity and project info")
  .option("-w, --workspace <path>")
  .option("--json", "machine-readable output", false)
  .action((opts: { workspace?: string; json: boolean }) => {
    const workspace = new Workspace(resolveWorkspace(opts.workspace));
    const project = workspace.detectProject();
    const data = { workspaceId: workspace.id, name: workspace.name, root: workspace.root, ...project };
    if (opts.json) say(JSON.stringify(data));
    else {
      say(`Workspace：${data.name}（${data.workspaceId}）`);
      say(`種類：${data.projectType}  言語：${data.languages.join(", ") || "-"}`);
      say(`パス：${data.root}`);
    }
  });

// ---------------------------------------------------------------- sandbox-allow (Codex writable_roots, macOS + Windows)

program
  .command("sandbox-allow")
  .description("Add the local settings directory to the Codex sandbox allowlist")
  .option("--json", "machine-readable output", false)
  .action((opts: { json: boolean }) => {
    const result = trySandboxAllow();
    if (opts.json) {
      say(JSON.stringify(result));
      if (!result.ok) process.exitCode = 1;
      return;
    }
    if (!result.ok) {
      cross(`Codex sandboxの許可リストへ書き込めません：${result.error}`);
      process.exitCode = 1;
      return;
    }
    if (result.alreadyAllowed) check("sandbox許可リストは設定済みです。以後の会話で追加権限は不要です");
    else check("ローカル設定ディレクトリをCodex sandboxの許可リストへ追加しました（以後の会話で追加権限は不要です）");
  });

// ---------------------------------------------------------------- update-check (once per local day)

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function runGit(args: string[]): { ok: boolean; stdout: string } {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 8000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return { ok: result.status === 0, stdout: (result.stdout ?? "").trim() };
}

program
  .command("update-check")
  .description("Check GitHub for a newer version (real check at most once per local day)")
  .option("--force", "check even if already checked today", false)
  .option("--json", "machine-readable output", false)
  .action((opts: { force: boolean; json: boolean }) => {
    const file = path.join(getStateDir(), "update-check.json");
    const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local tz
    let last: { date?: string; updateAvailable?: boolean } = {};
    try {
      last = JSON.parse(fs.readFileSync(file, "utf8")) as typeof last;
    } catch {
      /* first run */
    }

    const emit = (data: {
      checked: boolean;
      updateAvailable: boolean;
      localCommit?: string;
      remoteCommit?: string;
      note?: string;
    }): void => {
      if (opts.json) say(JSON.stringify({ ok: true, version: VERSION, ...data }));
      else if (data.updateAvailable) say(`新しいバージョンがあります（ローカル ${data.localCommit?.slice(0, 7)} → リモート ${data.remoteCommit?.slice(0, 7)}）。`);
      else say(data.note ?? "最新バージョンです。");
    };

    if (!opts.force && last.date === today) {
      emit({ checked: false, updateAvailable: last.updateAvailable ?? false, note: "本日はすでに更新を確認済みです。" });
      return;
    }

    const local = runGit(["rev-parse", "HEAD"]);
    const remote = runGit(["ls-remote", "origin", "HEAD"]);
    if (!local.ok || !remote.ok || !remote.stdout) {
      // Offline or not a git checkout: skip quietly and retry tomorrow-ish (do not
      // record the date so a transient failure does not suppress the daily check).
      emit({ checked: false, updateAvailable: false, note: "更新を確認できませんでした（オフライン、またはgit checkoutではありません）。今回はスキップします。" });
      return;
    }
    const remoteCommit = remote.stdout.split(/\s/)[0];
    const updateAvailable = remoteCommit !== local.stdout;
    fs.mkdirSync(getStateDir(), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ date: today, updateAvailable, remoteCommit }), { mode: 0o600 });
    emit({ checked: true, updateAvailable, localCommit: local.stdout, remoteCommit });
  });

// ---------------------------------------------------------------- session (ChatGPT conversation / Project memory)

const session = program
  .command("session")
  .description("Remember the ChatGPT Project and conversation for this workspace");

session
  .command("get", { isDefault: true })
  .description("Show the saved ChatGPT conversation / Project for this workspace")
  .option("-w, --workspace <path>")
  .option("--json", "machine-readable output", false)
  .action((opts: { workspace?: string; json: boolean }) => {
    const workspace = new Workspace(resolveWorkspace(opts.workspace));
    const saved = readSession(workspace.id);
    const conversation = resolveConversation(saved);
    if (opts.json) say(JSON.stringify({ ok: true, session: saved, conversation }));
    else if (!saved) {
      say("ChatGPTの会話はまだ保存されていません。新しいRepositoryではProjectを既定で使用します。");
    } else {
      say(`モード：${conversation.mode === "project" ? "Project" : "長いチャット"}`);
      if (conversation.projectUrl) say(`Project：${conversation.projectUrl}`);
      if (saved.title) say(`会話名：${saved.title}`);
      if (saved.url) say(`チャット：${saved.url}`);
      if (saved.connectorName) say(`コネクタ：${saved.connectorName}`);
      if (saved.taskId) say(`タスク：${saved.taskId}（${saved.iteration ?? 0}回目、${saved.lastState ?? "?"}）`);
      if (saved.checkpoint) {
        say(
          `チェックポイント：${saved.checkpoint.protocolState} / 待機先 ${saved.checkpoint.waitingFor}（${saved.checkpoint.iteration}回目）`
        );
      }
    }
  });

session
  .command("set")
  .description("Save the ChatGPT Project and/or conversation for this workspace")
  .option("-w, --workspace <path>")
  .option("--url <url>", "ChatGPT conversation URL from the address bar")
  .option("--title <title>")
  .option("--task <id>")
  .option("--iteration <n>")
  .option("--state <state>", "last protocol state, e.g. EXECUTED")
  .option("--mode <mode>", "long-chat or project")
  .option("--project-url <url>", "ChatGPT Project collection URL (…/g/g-p-…/project)")
  .option("--connector-name <name>", "exact connector title for this workspace")
  .option("--protocol-state <state>", "checkpoint protocol state, e.g. EXECUTED_SENT")
  .option("--waiting-for <who>", "none | GPT_PLAN | GPT_REVIEW | USER")
  .option("--goal <text>", "original task goal for resume / HANDOFF")
  .option("--completed-subtasks <text>")
  .option("--known-issues <text>")
  .option("--next-step <text>")
  .option("--clear-checkpoint", "drop the active checkpoint (task DONE)", false)
  .action(
    (opts: {
      workspace?: string;
      url?: string;
      title?: string;
      task?: string;
      iteration?: string;
      state?: string;
      mode?: string;
      projectUrl?: string;
      connectorName?: string;
      protocolState?: string;
      waitingFor?: string;
      goal?: string;
      completedSubtasks?: string;
      knownIssues?: string;
      nextStep?: string;
      clearCheckpoint: boolean;
    }) => {
      const workspace = new Workspace(resolveWorkspace(opts.workspace));
      const modeRaw = opts.mode?.trim().toLowerCase();
      if (modeRaw && modeRaw !== "long-chat" && modeRaw !== "project") {
        throw new Error("mode must be long-chat or project");
      }
      const protocolRaw = opts.protocolState?.trim().toUpperCase();
      if (protocolRaw && !PROTOCOL_STATES.includes(protocolRaw as ProtocolState)) {
        throw new Error(`protocol-state must be one of ${PROTOCOL_STATES.join(", ")}`);
      }
      const waitingRaw = opts.waitingFor?.trim();
      const waitingNorm = waitingRaw
        ? waitingRaw.toLowerCase() === "none"
          ? "none"
          : waitingRaw.toUpperCase()
        : undefined;
      if (waitingNorm && !WAITING_FOR.includes(waitingNorm as WaitingFor)) {
        throw new Error(`waiting-for must be one of ${WAITING_FOR.join(", ")}`);
      }
      const saved = mergeSession(readSession(workspace.id), {
        url: opts.url,
        title: opts.title,
        taskId: opts.task,
        iteration: opts.iteration ? parseInt(opts.iteration, 10) : undefined,
        lastState: opts.state,
        conversationMode: modeRaw as ConversationMode | undefined,
        projectUrl: opts.projectUrl,
        connectorName: opts.connectorName,
        clearCheckpoint: opts.clearCheckpoint,
        checkpoint: protocolRaw
          ? {
              protocolState: protocolRaw as ProtocolState,
              waitingFor: (waitingNorm as WaitingFor | undefined) ?? undefined,
              originalGoal: opts.goal,
              completedSubtasks: opts.completedSubtasks,
              knownIssues: opts.knownIssues,
              nextExpectedStep: opts.nextStep,
            }
          : undefined,
      });
      writeSession(workspace.id, saved);
      if (saved.projectUrl && saved.conversationMode === "project") {
        check("ChatGPT Projectを保存しました。以後はProjectページから新規チャットを作成または再利用します");
      } else {
        check("ChatGPTの会話を保存しました。以後のタスクで再利用します");
      }
    }
  );

session
  .command("clear")
  .description("Forget the current ChatGPT chat (Project binding is kept)")
  .option("-w, --workspace <path>")
  .action((opts: { workspace?: string }) => {
    const workspace = new Workspace(resolveWorkspace(opts.workspace));
    const result = clearChatPointer(workspace.id);
    if (!result.cleared) say("ChatGPTの会話はまだ保存されていません。");
    else if (result.keptProject) check("現在のチャットをクリアしました。Projectとの紐付けは保持しています");
    else check("会話記録をクリアしました。次回タスクでは新しいChatGPTチャットを作成します");
  });

const prefsCmd = program
  .command("prefs")
  .description("Remember ChatGPT developer mode and setup choice for this machine");

prefsCmd
  .command("get", { isDefault: true })
  .description("Show remembered ChatGPT setup choices (not per workspace)")
  .option("--json", "machine-readable output", false)
  .action((opts: { json: boolean }) => {
    const prefs = readUiPrefs();
    if (opts.json) {
      say(JSON.stringify({ ok: true, ...prefs }));
      return;
    }
    say(prefs.developerModeEnabled ? "開発者モード：有効として保存済み" : "開発者モード：未確認");
    if (prefs.setupMode === "auto") say("設定方法：AIによる自動設定（プレビュー）");
    else if (prefs.setupMode === "manual") say("設定方法：手動ガイド設定");
    else say("設定方法：未選択");
  });

prefsCmd
  .command("set")
  .description("Save a ChatGPT setup choice for this machine")
  .option("--developer-mode", "remember that ChatGPT developer mode is on", false)
  .option("--setup-mode <mode>", "auto (preview) or manual")
  .option("--json", "machine-readable output", false)
  .action((opts: { developerMode: boolean; setupMode?: string; json: boolean }) => {
    try {
      const modeRaw = opts.setupMode?.trim().toLowerCase();
      if (modeRaw && !SETUP_MODES.includes(modeRaw as SetupMode)) {
        throw new Error(`setup-mode must be one of ${SETUP_MODES.join(", ")}`);
      }
      if (!opts.developerMode && !modeRaw) {
        throw new Error("nothing to save: pass --developer-mode and/or --setup-mode");
      }
      const prefs = mergeUiPrefs({
        developerModeEnabled: opts.developerMode ? true : undefined,
        setupMode: modeRaw as SetupMode | undefined,
      });
      if (opts.json) {
        say(JSON.stringify({ ok: true, ...prefs }));
        return;
      }
      if (opts.developerMode) check("開発者モードが有効であることを保存しました");
      if (modeRaw === "auto") check("設定方法を保存しました：AIによる自動設定（プレビュー）");
      if (modeRaw === "manual") check("設定方法を保存しました：手動ガイド設定");
    } catch (error) {
      handleCliError(error, opts.json);
    }
  });

program
  .command("record", { hidden: true })
  .description("Record a Codex execution summary (used by the Skill)")
  .option("-w, --workspace <path>")
  .requiredOption("--task <id>")
  .requiredOption("--iteration <n>", "non-negative execution iteration", parseNonNegativeInteger)
  .option("--changed-files <filesOrCount>", "comma-separated files or a count", "0")
  .option("--tests <summary>", "e.g. '27 passed'")
  .option("--exit-status <status>", "ok | failed | blocked", "ok")
  .option("--notes <text>")
  .option("--command <text>", "command whose output may be offered to ChatGPT")
  .option("--output <text>", "command output (prefer --output-file for long logs)")
  .option("--output-file <path>", "read command output from a local file")
  .option("--exit-code <n>", "numeric exit code of that command", parseInteger)
  .action(
    (opts: {
      workspace?: string;
      task: string;
      iteration: number;
      changedFiles: string;
      tests?: string;
      exitStatus: string;
      notes?: string;
      command?: string;
      output?: string;
      outputFile?: string;
      exitCode?: number;
    }) => {
      const workspace = new Workspace(resolveWorkspace(opts.workspace));
      const changed = parseChangedFiles(opts.changedFiles);
      let outputId: number | undefined;
      let outputAvailable = false;
      const rawOutput =
        opts.outputFile !== undefined
          ? readCappedUtf8(path.resolve(opts.outputFile), MAX_RECORD_OUTPUT_READ)
          : opts.output;
      if (opts.command && rawOutput !== undefined) {
        const savedOutput = saveExecutionOutput(workspace.id, {
          command: opts.command,
          raw: rawOutput,
          exitCode: opts.exitCode ?? null,
          taskId: opts.task,
          iteration: opts.iteration,
        });
        outputId = savedOutput.id;
        outputAvailable = savedOutput.allowed;
      }
      appendExecutionRecord(workspace.id, {
        taskId: opts.task,
        iteration: opts.iteration,
        changedFiles: changed,
        tests: opts.tests ?? null,
        exitStatus: opts.exitStatus,
        timestamp: new Date().toISOString(),
        notes: opts.notes?.slice(0, 400),
        outputId,
        outputAvailable,
      });
      if (outputId !== undefined && !outputAvailable) check("実行概要を保存しました（出力はChatGPTへ公開していません）");
      else if (outputId !== undefined) check("実行概要と出力を保存しました");
      else check("実行概要を保存しました");
    }
  );

const tunnelCmd = program.command("tunnel").description("Choose or inspect the public connection for this workspace");

tunnelCmd
  .command("status", { isDefault: true })
  .description("Show whether this workspace still needs a one-time connection choice")
  .option("-w, --workspace <path>")
  .option("--zone <domain>", "optional domain, used to preview the stable hostname")
  .option("--json", "machine-readable output", false)
  .action((opts: { workspace?: string; zone?: string; json: boolean }) => {
    try {
      const workspace = new Workspace(resolveWorkspace(opts.workspace));
      const payload = tunnelChoicePayload(workspace, opts.zone);
      if (opts.json) {
        say(JSON.stringify(payload));
        return;
      }
      if (payload.needsChoice) say(TUNNEL_CHOICE_PROMPT);
      else if (payload.namedReady) check(`固定ドメイン：${payload.hostname}`);
      else say("現在は一時アドレスを使用しています。");
    } catch (error) {
      handleCliError(error, opts.json);
    }
  });

tunnelCmd
  .command("choose")
  .description("Remember quick vs named, and provision a named hostname when asked")
  .requiredOption("--mode <mode>", "quick or named")
  .option("-w, --workspace <path>")
  .option("--zone <domain>", "Cloudflare domain for a named hostname")
  .option("--hostname <hostname>", "override the default c2c-<project>.<zone>")
  .option("--json", "machine-readable output", false)
  .action(async (opts: { mode: string; workspace?: string; zone?: string; hostname?: string; json: boolean }) => {
    const root = resolveWorkspace(opts.workspace);
    try {
      const workspace = new Workspace(root);
      const mode = opts.mode.trim().toLowerCase();
      const previous = readTunnelState(workspace.id);
      if (mode === "quick") {
        const state = chooseQuickTunnel(workspace.id);
        if (await findLiveBridge(workspace.id)) {
          if (previous.preference === "named") await stopBridge(root);
        }
        const payload = { ...tunnelChoicePayload(workspace), state };
        if (opts.json) say(JSON.stringify(payload));
        else check("一時アドレスを使用する設定にしました");
        return;
      }
      if (mode !== "named") {
        throw new Error("mode must be quick or named");
      }
      const zone = parseZoneInput(opts.zone ?? "");
      if (!zone) {
        const payload = {
          ok: false,
          need: "zone",
          userMessage: "Cloudflareへ登録済みのドメインを入力してください（例：example.com）",
          loginPrompt: NAMED_LOGIN_PROMPT,
        };
        if (opts.json) {
          say(JSON.stringify(payload));
          return;
        }
        say(payload.userMessage);
        return;
      }
      if (!opts.json) say(NAMED_LOGIN_PROMPT);
      const result = await provisionNamedTunnel({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        zone,
        hostname: opts.hostname,
      });
      if (await findLiveBridge(workspace.id)) await stopBridge(root);
      const payload = {
        ...tunnelChoicePayload(workspace),
        ok: true,
        fallback: result.fallback,
        userMessage: result.userMessage,
        error: result.error,
        state: result.state,
      };
      if (opts.json) {
        say(JSON.stringify(payload));
        return;
      }
      if (result.fallback) say(result.userMessage ?? "");
      else check(`固定ドメインの準備が完了しました：${result.state.hostname}`);
    } catch (error) {
      handleCliError(error, opts.json);
    }
  });

tunnelCmd
  .command("login")
  .description("Open the Cloudflare login window used by a named hostname")
  .option("--json", "machine-readable output", false)
  .action(async (opts: { json: boolean }) => {
    try {
      if (!opts.json) say(NAMED_LOGIN_PROMPT);
      const account = new ProcessCloudflaredAccount();
      await account.login();
      const payload = { ok: true, loggedIn: hasCloudflaredCert() };
      if (opts.json) say(JSON.stringify(payload));
      else check("Cloudflareへログインしました");
    } catch (error) {
      handleCliError(error, opts.json);
    }
  });

function handleCliError(error: unknown, json: boolean): void {
  const message = error instanceof Error ? error.message : String(error);
  if (json) {
    say(JSON.stringify({ ok: false, error: message }));
  } else if (message.startsWith("NEED_CLOUDFLARED")) {
    say("次の1操作が必要です：");
    say("");
    say("安全な接続に必要なcloudflaredがインストールされていません。");
    say("macOSでは次を実行できます：brew install cloudflared");
    say("インストール後、もう一度実行してください。");
  } else {
    cross(message);
  }
  process.exitCode = 1;
}

program.parseAsync(process.argv).catch((error: Error) => {
  cross(error.message);
  process.exit(1);
});
