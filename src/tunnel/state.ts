import path from "node:path";
import { getStateDir, readJsonIfExists, writeSecureJson } from "../config/paths.js";

export type TunnelPreference = "unset" | "quick" | "named";
export interface TunnelState {
  workspaceId: string;
  preference: TunnelPreference;
  askedAt?: string;
  provider?: "cloudflare-quick" | "cloudflare-named";
  tunnelName?: string;
  tunnelId?: string;
  hostname?: string;
  zone?: string;
  configuredAt?: string;
  fallbackReason?: string;
}
export function tunnelStateFile(workspaceId: string): string {
  return path.join(getStateDir(), "tunnels", `${workspaceId}.json`);
}
export function readTunnelState(workspaceId: string): TunnelState {
  return readJsonIfExists<TunnelState>(tunnelStateFile(workspaceId)) ?? { workspaceId, preference: "unset" };
}
export function writeTunnelState(state: TunnelState): TunnelState {
  writeSecureJson(tunnelStateFile(state.workspaceId), state); return state;
}
export function needsTunnelChoice(state: TunnelState): boolean { return state.preference === "unset" || !state.askedAt; }
export function isNamedTunnelReady(state: TunnelState): boolean {
  return state.preference === "named" && Boolean(state.tunnelName?.trim()) && Boolean(state.hostname?.trim());
}
export function namedTunnelBinding(state: TunnelState): { tunnelName: string; hostname: string } | null {
  if (!isNamedTunnelReady(state) || !state.tunnelName || !state.hostname) return null;
  return { tunnelName: state.tunnelName, hostname: state.hostname };
}
export const TUNNEL_CHOICE_PROMPT = `ChatGPTへの接続方式を確認します。
Cloudflareに登録済みのドメインがある場合は、固定ドメインを使用できます。
このforkのプライバシー設定とMac常駐サービスは、固定トンネルを前提にしています。
固定ドメインを設定するには、Cloudflareへのログインと対象ドメインの選択が必要です。
使用するドメインを指定してください（例：example.com）。`;
export const NAMED_LOGIN_PROMPT = "ブラウザーでCloudflareにログインし、使用するドメインを選択してください。";
export const NAMED_FALLBACK_MESSAGE = "固定ドメインの設定を完了できませんでした。一時アドレスへの切替状態を確認し、固定ドメインを修復してください。Mac常駐サービスは固定ドメインが整うまで起動しません。";
export const NAMED_REPAIR_MESSAGE = "固定ドメインに接続できません。Cloudflareのログイン状態と対象ドメインを確認してください。";
