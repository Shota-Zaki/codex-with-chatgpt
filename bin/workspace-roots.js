import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CASE_INSENSITIVE = process.platform === "win32" || process.platform === "darwin";
const CONFIG_SCHEMA_VERSION = 1;
const WINDOWS_ZERO_CONFIG_ROOT = "C:\\project";

function normCase(value) {
  return CASE_INSENSITIVE ? value.toLowerCase() : value;
}

export function workspaceRootsStateDir() {
  const override = process.env.C2C_STATE_DIR?.trim();
  if (override) return path.resolve(override);
  const home = os.homedir();
  switch (process.platform) {
    case "darwin":
      return path.join(home, "Library", "Application Support", "codex-with-chatgpt");
    case "win32":
      return path.join(process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "codex-with-chatgpt");
    default: {
      const base = process.env.XDG_STATE_HOME ?? path.join(home, ".local", "state");
      return path.join(base, "codex-with-chatgpt");
    }
  }
}

export function workspaceRootsFile() {
  return path.join(workspaceRootsStateDir(), "workspace-roots.json");
}

function canonicalDirectory(input) {
  const resolved = path.resolve(input);
  const real = fs.realpathSync.native(resolved);
  if (!fs.statSync(real).isDirectory()) {
    throw new Error(`Workspace root is not a directory: ${input}`);
  }
  return real;
}

function samePath(a, b) {
  return normCase(path.resolve(a)) === normCase(path.resolve(b));
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function normalizeConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { schemaVersion: CONFIG_SCHEMA_VERSION, approvedRoots: [], defaultRoot: null };
  }
  const approvedRoots = [];
  const seen = new Set();
  if (Array.isArray(value.approvedRoots)) {
    for (const entry of value.approvedRoots) {
      if (typeof entry !== "string" || !entry.trim()) continue;
      const resolved = path.resolve(entry);
      const key = normCase(resolved);
      if (seen.has(key)) continue;
      seen.add(key);
      approvedRoots.push(resolved);
    }
  }
  const defaultRoot = typeof value.defaultRoot === "string" && value.defaultRoot.trim()
    ? path.resolve(value.defaultRoot)
    : null;
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    approvedRoots,
    defaultRoot: defaultRoot && approvedRoots.some((root) => samePath(root, defaultRoot)) ? defaultRoot : null,
  };
}

export function readWorkspaceRoots() {
  try {
    return normalizeConfig(JSON.parse(fs.readFileSync(workspaceRootsFile(), "utf8")));
  } catch {
    return { schemaVersion: CONFIG_SCHEMA_VERSION, approvedRoots: [], defaultRoot: null };
  }
}

function writeWorkspaceRoots(config) {
  const stateDir = workspaceRootsStateDir();
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const file = workspaceRootsFile();
  const tmp = `${file}.${process.pid}.tmp`;
  const payload = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    approvedRoots: config.approvedRoots,
    defaultRoot: config.defaultRoot,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(tmp, 0o600);
  } catch {
    // Windows / filesystems without chmod semantics.
  }
  fs.renameSync(tmp, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Windows / filesystems without chmod semantics.
  }
  return normalizeConfig(payload);
}

export function approveWorkspaceRoot(input, { makeDefault = true } = {}) {
  const root = canonicalDirectory(input);
  const current = readWorkspaceRoots();
  const approvedRoots = current.approvedRoots.some((entry) => samePath(entry, root))
    ? current.approvedRoots
    : [...current.approvedRoots, root];
  return writeWorkspaceRoots({
    approvedRoots,
    defaultRoot: makeDefault ? root : current.defaultRoot,
  });
}

export function removeWorkspaceRoot(input) {
  let requested;
  try {
    requested = fs.realpathSync.native(path.resolve(input));
  } catch {
    requested = path.resolve(input);
  }
  const current = readWorkspaceRoots();
  const approvedRoots = current.approvedRoots.filter((entry) => !samePath(entry, requested));
  const defaultRemoved = current.defaultRoot ? samePath(current.defaultRoot, requested) : false;
  return writeWorkspaceRoots({
    approvedRoots,
    defaultRoot: defaultRemoved ? (approvedRoots[0] ?? null) : current.defaultRoot,
  });
}

export function setDefaultWorkspaceRoot(input) {
  const root = canonicalDirectory(input);
  const current = readWorkspaceRoots();
  if (!current.approvedRoots.some((entry) => samePath(entry, root))) {
    throw new Error("Default Workspace root must be approved first with `c2c roots add <path>`.");
  }
  return writeWorkspaceRoots({ approvedRoots: current.approvedRoots, defaultRoot: root });
}

export function implicitWorkspaceRoot() {
  const override = process.env.C2C_DEFAULT_WORKSPACE_ROOT?.trim();
  const candidate = override || (process.platform === "win32" ? WINDOWS_ZERO_CONFIG_ROOT : "");
  if (!candidate) return null;
  try {
    return canonicalDirectory(candidate);
  } catch {
    return null;
  }
}

export function resolveApprovedWorkspaceRoot(cwd = process.cwd()) {
  let canonicalCwd;
  try {
    canonicalCwd = fs.realpathSync.native(path.resolve(cwd));
  } catch {
    canonicalCwd = path.resolve(cwd);
  }
  const current = readWorkspaceRoots();
  const existingRoots = current.approvedRoots.filter((root) => {
    try {
      return fs.statSync(root).isDirectory();
    } catch {
      return false;
    }
  });
  const containing = existingRoots
    .filter((root) => isInside(root, canonicalCwd))
    .sort((a, b) => b.length - a.length);
  if (containing.length > 0) return containing[0];
  if (current.defaultRoot && existingRoots.some((root) => samePath(root, current.defaultRoot))) {
    return current.defaultRoot;
  }

  if (current.approvedRoots.length === 0) {
    const implicit = implicitWorkspaceRoot();
    if (implicit && isInside(implicit, canonicalCwd)) {
      approveWorkspaceRoot(implicit, { makeDefault: true });
      return implicit;
    }
  }
  return null;
}
