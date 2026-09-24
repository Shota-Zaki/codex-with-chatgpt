import path from "node:path";
import { getStateDir, readJsonIfExists, writeSecureJson } from "./paths.js";

export type SetupMode = "auto" | "manual";
export const SETUP_MODES: readonly SetupMode[] = ["auto", "manual"];
export const SETUP_CHOICE_PROMPT = [
  "ChatGPTへ初めて接続する前に、設定方法を選択してください。選択後は同じ方法を使用します。",
  "",
  "**1. AIによる自動設定（プレビュー）**",
  "内蔵ブラウザーで設定を進めます。ログイン・認証コード・追加確認が必要な場面では操作してください。",
  "利点：手動での画面操作を減らせます。",
  "注意：同じ設定手順で2回連続して失敗した場合は、手動ガイド設定へ切り替えます。",
  "",
  "**2. 手動ガイド設定**",
  "開くページと入力項目を順番に案内します。ブラウザー操作は利用者が行います。",
  "利点：設定内容を確認しながら進められます。",
  "注意：案内に沿った画面操作が必要です。",
  "",
  "「1」または「2」を選択してください。",
].join("\n");

interface StoredUiPrefs { developerModeEnabled?: boolean; setupMode?: SetupMode; updatedAt: string }
export interface UiPrefsView {
  developerModeEnabled: boolean;
  setupMode: SetupMode | null;
  setupChoicePrompt: string;
  remembered: { developerMode: boolean; setupMode: boolean };
}
export function prefsFile(): string { return path.join(getStateDir(), "prefs.json"); }
function readStored(): StoredUiPrefs | null {
  const raw = readJsonIfExists<StoredUiPrefs>(prefsFile());
  if (!raw || typeof raw !== "object") return null;
  const setupMode = raw.setupMode === "auto" || raw.setupMode === "manual" ? raw.setupMode : undefined;
  return { developerModeEnabled: raw.developerModeEnabled === true, setupMode,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString() };
}
export function readUiPrefs(): UiPrefsView {
  const stored = readStored();
  const developerModeEnabled = stored?.developerModeEnabled === true;
  const setupMode = stored?.setupMode ?? null;
  return { developerModeEnabled, setupMode, setupChoicePrompt: SETUP_CHOICE_PROMPT,
    remembered: { developerMode: developerModeEnabled, setupMode: setupMode !== null } };
}
export interface UiPrefsPatch { developerModeEnabled?: true; setupMode?: SetupMode }
export function mergeUiPrefs(patch: UiPrefsPatch): UiPrefsView {
  if (patch.setupMode !== undefined && !SETUP_MODES.includes(patch.setupMode)) {
    throw new Error(`setup-modeには ${SETUP_MODES.join(", ")} のいずれかを指定してください。`);
  }
  const previous = readStored();
  const setupMode = patch.setupMode ?? previous?.setupMode;
  const stored: StoredUiPrefs = { updatedAt: new Date().toISOString() };
  // 確認済みの有効状態だけを保存する。新しいアカウントでの確認を省略しない。
  if (patch.developerModeEnabled === true || previous?.developerModeEnabled === true) stored.developerModeEnabled = true;
  if (setupMode) stored.setupMode = setupMode;
  writeSecureJson(prefsFile(), stored);
  return readUiPrefs();
}
