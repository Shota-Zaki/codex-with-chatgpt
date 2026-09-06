import path from "node:path";
import { getStateDir, readJsonIfExists, writeSecureJson } from "./paths.js";

export type SetupMode = "auto" | "manual";

export const SETUP_MODES: readonly SetupMode[] = ["auto", "manual"];

/** Shown once, before the first ChatGPT connection on this machine. */
export const SETUP_CHOICE_PROMPT = [
  "ChatGPTへ初めて接続する前に、設定方法を選択してください（選択は一度だけで、以後は既定値として使用します）：",
  "",
  "**1. AIによる自動設定（プレビュー）**",
  "内蔵ブラウザで設定を自動実行します。ログイン、認証コード、追加確認が必要な場合だけ操作してください。",
  "利点：ほとんど画面操作が不要です。",
  "欠点：手順が多いため全体的に遅くなります。同じ設定手順で2回連続失敗した場合は「手動ガイド設定」に切り替えます。",
  "",
  "**2. 手動ガイド設定**",
  "開くページや入力項目を1ステップずつ案内し、ブラウザ操作はユーザーが行います。",
  "利点：約3分で完了でき、手順を確認しながら安定して設定できます。",
  "欠点：案内に従った操作が必要で、完全自動ではありません。",
  "",
  "「1」または「2」で回答してください。選択されるまでは設定を開始しません。",
].join("\n");

interface StoredUiPrefs {
  developerModeEnabled?: boolean;
  setupMode?: SetupMode;
  updatedAt: string;
}

export interface UiPrefsView {
  developerModeEnabled: boolean;
  setupMode: SetupMode | null;
  setupChoicePrompt: string;
  remembered: {
    developerMode: boolean;
    setupMode: boolean;
  };
}

export function prefsFile(): string {
  return path.join(getStateDir(), "prefs.json");
}

function readStored(): StoredUiPrefs | null {
  const raw = readJsonIfExists<StoredUiPrefs>(prefsFile());
  if (!raw || typeof raw !== "object") return null;
  const setupMode = raw.setupMode === "auto" || raw.setupMode === "manual" ? raw.setupMode : undefined;
  return {
    developerModeEnabled: raw.developerModeEnabled === true,
    setupMode,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export function readUiPrefs(): UiPrefsView {
  const stored = readStored();
  const developerModeEnabled = stored?.developerModeEnabled === true;
  const setupMode = stored?.setupMode ?? null;
  return {
    developerModeEnabled,
    setupMode,
    setupChoicePrompt: SETUP_CHOICE_PROMPT,
    remembered: {
      developerMode: developerModeEnabled,
      setupMode: setupMode !== null,
    },
  };
}

export interface UiPrefsPatch {
  developerModeEnabled?: true;
  setupMode?: SetupMode;
}

export function mergeUiPrefs(patch: UiPrefsPatch): UiPrefsView {
  if (patch.setupMode !== undefined && !SETUP_MODES.includes(patch.setupMode)) {
    throw new Error(`setup-mode must be one of ${SETUP_MODES.join(", ")}`);
  }
  const previous = readStored();
  const setupMode = patch.setupMode ?? previous?.setupMode;
  const stored: StoredUiPrefs = {
    updatedAt: new Date().toISOString(),
  };
  // Only persist "confirmed on". Never write false — that would skip the
  // Security page on a new ChatGPT account or a machine restore.
  if (patch.developerModeEnabled === true || previous?.developerModeEnabled === true) {
    stored.developerModeEnabled = true;
  }
  if (setupMode) stored.setupMode = setupMode;
  writeSecureJson(prefsFile(), stored);
  return readUiPrefs();
}
