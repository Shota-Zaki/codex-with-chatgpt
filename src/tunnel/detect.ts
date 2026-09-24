import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CLOUDFLARED_ENV_KEYS = [
  "HOME", "USER", "LOGNAME", "PATH", "PATHEXT", "SYSTEMROOT", "SystemRoot", "WINDIR", "ComSpec",
  "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "APPDATA", "TEMP", "TMP", "TMPDIR",
  "LANG", "LC_ALL", "TZ", "SSL_CERT_FILE", "SSL_CERT_DIR", "TUNNEL_ORIGIN_CERT",
] as const;

/** cloudflaredへ親shellのAPIキーや認証トークンを渡さない。 */
export function cloudflaredEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = {};
  for (const key of CLOUDFLARED_ENV_KEYS) {
    const value = env[key];
    if (value !== undefined) safe[key] = value;
  }
  return safe;
}

const COMMON_DIRS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  path.join(process.env.HOME ?? "", ".local", "bin"),
  "C:\\Program Files\\cloudflared",
  "C:\\Program Files (x86)\\cloudflared",
];

function accessibleFile(candidate: string): string | null {
  try {
    const resolved = path.resolve(candidate);
    if (!fs.statSync(resolved).isFile()) return null;
    fs.accessSync(resolved, fs.constants.F_OK | fs.constants.X_OK);
    return resolved;
  } catch {
    return null;
  }
}

/** Locate a binary on PATH or in common install locations. */
export function findBinary(name: string): string | null {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  if (name === "cloudflared" && process.env.C2C_CLOUDFLARED_PATH?.trim()) {
    const configured = accessibleFile(process.env.C2C_CLOUDFLARED_PATH.trim());
    if (configured) return configured;
  }
  try {
    const probe = spawnSync(exe, ["--version"], {
      stdio: "ignore",
      timeout: 5000,
      windowsHide: true,
      env: cloudflaredEnvironment(),
    });
    if (probe.status === 0 || probe.status === 1) return exe; // on PATH
  } catch {
    // not on PATH
  }
  for (const dir of COMMON_DIRS) {
    const full = path.join(dir, exe);
    const configured = accessibleFile(full);
    if (configured) return configured;
  }
  return null;
}

export interface TunnelBinaries {
  cloudflared: string | null;
  wrangler: string | null;
}

export function detectTunnelBinaries(): TunnelBinaries {
  return {
    cloudflared: findBinary("cloudflared"),
    wrangler: findBinary("wrangler"),
  };
}
