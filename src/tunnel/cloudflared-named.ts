import { spawn, type ChildProcess } from "node:child_process";
import readline from "node:readline";
import type { Logger } from "../logger/index.js";
import { nullLogger } from "../logger/index.js";
import { findBinary } from "./detect.js";
import { tunnelProtocolArgs } from "./protocol.js";
import type { TunnelDoctorReport, TunnelProvider, TunnelStatus } from "./provider.js";

const CONNECTED_RE = /registered tunnel connection/i;
const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export interface CloudflaredNamedTunnelOptions {
  tunnelName: string;
  hostname: string;
  logger?: Logger;
  binaryOverride?: string;
  startTimeoutMs?: number;
}

export function normalizeNamedTunnelHostname(hostname: string): string {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!HOSTNAME_RE.test(normalized)) {
    throw new Error(`固定Tunnelのホスト名が無効です: ${hostname}`);
  }
  return normalized;
}

/**
 * Locally-managed Cloudflare named tunnel.
 *
 * The tunnel object and its DNS route are provisioned once with cloudflared.
 * This provider only starts and monitors the connector process, so the public
 * URL remains stable across bridge restarts.
 */
export class CloudflaredNamedTunnel implements TunnelProvider {
  readonly name = "cloudflare-named";
  private readonly tunnelName: string;
  private readonly hostname: string;
  private readonly logger: Logger;
  private readonly binaryOverride?: string;
  private readonly startTimeoutMs: number;
  private child: ChildProcess | null = null;
  private connected = false;
  private lastError: string | null = null;

  constructor(opts: CloudflaredNamedTunnelOptions) {
    const tunnelName = opts.tunnelName.trim();
    if (!tunnelName || tunnelName.length > 128) {
      throw new Error("固定Tunnel名は1～128文字で指定してください");
    }
    this.tunnelName = tunnelName;
    this.hostname = normalizeNamedTunnelHostname(opts.hostname);
    this.logger = opts.logger ?? nullLogger;
    this.binaryOverride = opts.binaryOverride;
    this.startTimeoutMs = opts.startTimeoutMs ?? 45_000;
  }

  private binary(): string | null {
    return this.binaryOverride ?? findBinary("cloudflared");
  }

  private publicUrl(): string {
    return `https://${this.hostname}`;
  }

  async start(localPort: number): Promise<string> {
    if (this.child && this.connected) return this.publicUrl();
    const bin = this.binary();
    if (!bin) {
      throw new Error(
        "cloudflaredがインストールされていません。`brew install cloudflared`などで導入してから再試行してください。"
      );
    }

    return new Promise<string>((resolve, reject) => {
      const child = spawn(
        bin,
        [
          "tunnel",
          "--no-autoupdate",
          "--url",
          `http://127.0.0.1:${localPort}`,
          ...tunnelProtocolArgs(),
          "run",
          this.tunnelName,
        ],
        { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
      );
      this.child = child;
      this.connected = false;
      this.lastError = null;
      let settled = false;

      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        fn();
      };
      const timeout = setTimeout(() => {
        if (!this.connected) {
          this.lastError = "固定Tunnelの起動がタイムアウトしました";
          child.kill("SIGTERM");
          finish(() => reject(new Error(this.lastError ?? "固定Tunnelの起動がタイムアウトしました")));
        }
      }, this.startTimeoutMs);

      const scan = (stream: NodeJS.ReadableStream): void => {
        const rl = readline.createInterface({ input: stream });
        rl.on("line", (line) => {
          if (CONNECTED_RE.test(line) && !this.connected) {
            this.connected = true;
            const url = this.publicUrl();
            this.logger.info(`固定Tunnelを確立しました: ${url}`);
            finish(() => resolve(url));
          }
          if (/\b(error|failed|fatal)\b/i.test(line)) {
            this.lastError = "cloudflaredがエラーを報告しました";
            this.logger.debug(this.lastError);
          }
        });
      };
      if (child.stdout) scan(child.stdout);
      if (child.stderr) scan(child.stderr);

      child.on("error", (error) => {
        this.child = null;
        this.connected = false;
        finish(() => reject(error));
      });
      child.on("exit", (code) => {
        const wasStarting = !this.connected;
        this.logger.warn(`固定Tunnelのcloudflaredが終了しました（終了コード ${code}）`);
        this.child = null;
        this.connected = false;
        if (wasStarting) {
          finish(() =>
            reject(
              new Error(
                `固定Tunnel確立前にcloudflaredが終了しました（終了コード ${code}）${
                  this.lastError ? `: ${this.lastError}` : ""
                }`
              )
            )
          );
        }
      });
    });
  }

  async stop(): Promise<void> {
    if (this.child) {
      this.child.kill("SIGTERM");
      this.child = null;
    }
    this.connected = false;
  }

  async restart(localPort: number): Promise<string> {
    await this.stop();
    return this.start(localPort);
  }

  status(): TunnelStatus {
    return {
      running: this.child !== null && this.connected,
      url: this.connected ? this.publicUrl() : null,
      provider: this.name,
      detail: this.lastError ?? undefined,
    };
  }

  getPublicUrl(): string | null {
    return this.connected ? this.publicUrl() : null;
  }

  async doctor(): Promise<TunnelDoctorReport> {
    const bin = this.binary();
    const problems: string[] = [];
    if (!bin) problems.push("cloudflared実行ファイルが見つかりません");
    if (bin && !this.child) problems.push("固定Tunnelプロセスが停止しています");
    if (this.child && !this.connected) problems.push("固定Tunnelはまだ接続されていません");
    return {
      provider: this.name,
      binaryFound: bin !== null,
      binaryPath: bin,
      running: this.child !== null && this.connected,
      url: this.connected ? this.publicUrl() : null,
      problems,
    };
  }
}
