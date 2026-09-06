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
  return (
    readJsonIfExists<TunnelState>(tunnelStateFile(workspaceId)) ?? {
      workspaceId,
      preference: "unset",
    }
  );
}

export function writeTunnelState(state: TunnelState): TunnelState {
  writeSecureJson(tunnelStateFile(state.workspaceId), state);
  return state;
}

export function needsTunnelChoice(state: TunnelState): boolean {
  return state.preference === "unset" || !state.askedAt;
}

export function isNamedTunnelReady(state: TunnelState): boolean {
  return (
    state.preference === "named" &&
    Boolean(state.tunnelName?.trim()) &&
    Boolean(state.hostname?.trim())
  );
}

export function namedTunnelBinding(state: TunnelState): { tunnelName: string; hostname: string } | null {
  if (!isNamedTunnelReady(state) || !state.tunnelName || !state.hostname) return null;
  return { tunnelName: state.tunnelName, hostname: state.hostname };
}

export const TUNNEL_CHOICE_PROMPT = `ChatGPTへ接続する前に、接続方法を一度だけ選択してください。
Cloudflareアカウントがあり、Cloudflareに登録済みのドメインを持っていますか？
- ある：固定ドメインを使用できます。最初に一度だけCloudflareへログインし、ドメイン配下にサブドメインを追加します。通常はPCを再起動してもChatGPT側の接続設定を変更する必要がありません。
- ない：一時アドレスを使用します。登録不要で機能は同じですが、PC再起動後などにアドレスが変わることがあります。その場合は、このプロジェクトの接続だけを新しいアドレスで作り直します。
Cloudflareアカウントがなくても利用できます。どちらにしますか？ドメインがある場合は example.com のように入力してください。`;

export const NAMED_LOGIN_PROMPT =
  "ブラウザが開きます。Cloudflareへログインして対象ドメインを選択し、完了したら「完了」と伝えてください。";

export const NAMED_FALLBACK_MESSAGE =
  "今回は一時アドレスを使用します。機能は同じです。固定ドメインへ切り替えたい場合は、後から変更できます。";

export const NAMED_REPAIR_MESSAGE =
  "固定ドメインへ現在接続できません。これから開く画面でCloudflareへログインして対象ドメインを選択し、完了したら「完了」と伝えてください。";
