#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  approveWorkspaceRoot,
  readWorkspaceRoots,
  removeWorkspaceRoot,
  resolveApprovedWorkspaceRoot,
  setDefaultWorkspaceRoot,
  workspaceRootsFile,
} from "./workspace-roots.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "..", "dist", "cli", "index.js");
const CASE_INSENSITIVE = process.platform === "win32" || process.platform === "darwin";
const normCase = (value) => (CASE_INSENSITIVE ? value.toLowerCase() : value);

function optionValue(args, names) {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    for (const name of names) {
      if (arg === name) return args[index + 1] ?? null;
      if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
    }
  }
  return null;
}

function stripOption(args, names) {
  const next = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const exact = names.includes(arg);
    const assigned = names.some((name) => arg.startsWith(`${name}=`));
    if (exact) {
      index += 1;
      continue;
    }
    if (assigned) continue;
    next.push(arg);
  }
  return next;
}

function isMachineWideCommand(args) {
  if (args[0] === "update-check" || args[0] === "sandbox-allow" || args[0] === "prefs" || args[0] === "roots") return true;
  return args[0] === "tunnel" && args[1] === "login";
}

function usesWorkspace(args) {
  const command = args[0];
  if (!command || command.startsWith("-") || args.includes("--help") || args.includes("-h")) return false;
  return new Set([
    "serve",
    "start",
    "setup",
    "stop",
    "restart",
    "status",
    "doctor",
    "pair",
    "unpair",
    "logs",
    "workspace",
    "session",
    "record",
  ]).has(command) || (command === "tunnel" && args[1] !== "login");
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function repositoryIdFromPath(repositoryRoot) {
  return createHash("sha256").update(normCase(repositoryRoot)).digest("hex").slice(0, 12);
}

function repositoryRootFromGit(cwd) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
    timeout: 8000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    windowsHide: true,
  });
  if (result.status !== 0 || !result.stdout?.trim()) return null;
  try {
    return realpathSync(path.resolve(result.stdout.trim()));
  } catch {
    return null;
  }
}

function setRepositoryEnvironment(workspaceRoot, repositoryRoot) {
  if (!isInside(workspaceRoot, repositoryRoot)) {
    throw new Error("record repository must resolve inside the selected Workspace");
  }
  process.env.C2C_RECORD_REPOSITORY_ID = repositoryIdFromPath(repositoryRoot);
  process.env.C2C_RECORD_REPOSITORY_ROOT =
    path.relative(workspaceRoot, repositoryRoot).split(path.sep).join("/") || ".";
}

function prepareRecordRepository(args) {
  if (args[0] !== "record") return args;

  const workspaceInput = optionValue(args, ["-w", "--workspace"]) ?? process.cwd();
  const workspaceRoot = realpathSync(path.resolve(workspaceInput));
  const selector = optionValue(args, ["--repository", "--repo"]);

  if (selector) {
    const normalizedSelector = selector.trim();
    if (/^[a-f0-9]{12}$/i.test(normalizedSelector)) {
      const cwdRepository = repositoryRootFromGit(process.cwd());
      if (!cwdRepository || !isInside(workspaceRoot, cwdRepository)) {
        throw new Error(
          "record repository id requires the command to run inside that Git repository; use a Workspace-relative repository root from the parent Workspace"
        );
      }
      const actualId = repositoryIdFromPath(cwdRepository);
      if (actualId !== normalizedSelector.toLowerCase()) {
        throw new Error("record repository id does not match the current Git repository");
      }
      setRepositoryEnvironment(workspaceRoot, cwdRepository);
    } else {
      const candidate = realpathSync(path.resolve(workspaceRoot, normalizedSelector));
      const gitRoot = repositoryRootFromGit(candidate);
      if (!gitRoot || normCase(gitRoot) !== normCase(candidate)) {
        throw new Error("record --repository must point to a Git repository root");
      }
      setRepositoryEnvironment(workspaceRoot, candidate);
    }
    return stripOption(args, ["--repository", "--repo"]);
  }

  // Backward compatibility for the existing Skill: if `c2c record -w <parent>`
  // runs from inside one repository, tag the record automatically. When Codex
  // runs from the parent Workspace and multiple repositories exist, the caller
  // must pass --repository explicitly instead of guessing.
  const cwdRepository = repositoryRootFromGit(process.cwd());
  if (cwdRepository && isInside(workspaceRoot, cwdRepository)) {
    setRepositoryEnvironment(workspaceRoot, cwdRepository);
  } else {
    delete process.env.C2C_RECORD_REPOSITORY_ID;
    delete process.env.C2C_RECORD_REPOSITORY_ROOT;
  }
  return args;
}

function applyRememberedWorkspace(args) {
  if (!usesWorkspace(args) || isMachineWideCommand(args) || optionValue(args, ["-w", "--workspace"])) return args;
  const root = resolveApprovedWorkspaceRoot(process.cwd());
  return root ? [...args, "--workspace", root] : args;
}

function rootsUsage() {
  return [
    "Usage:",
    "  c2c roots list [--json]",
    "  c2c roots add <path> [--json]",
    "  c2c roots remove <path> [--json]",
    "  c2c roots default <path> [--json]",
    "  c2c roots resolve [--json]",
    "",
    "Approved Rootは端末共通設定です。配下のRepositoryでは個別Workspace指定が不要になります。",
  ].join("\n");
}

function handleRootsCommand(args) {
  if (args[0] !== "roots") return false;
  const subcommand = args[1] ?? "list";
  const json = args.includes("--json");

  if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    process.stdout.write(rootsUsage() + "\n");
    return true;
  }

  try {
    if (subcommand === "list") {
      const config = readWorkspaceRoots();
      if (json) {
        process.stdout.write(JSON.stringify({ ok: true, configPath: workspaceRootsFile(), ...config }) + "\n");
      } else if (config.approvedRoots.length === 0) {
        process.stdout.write("Approved Rootはまだありません。`c2c roots add <path>` で1回だけ登録してください。\n");
      } else {
        process.stdout.write(`Approved Roots（設定: ${workspaceRootsFile()}）\n`);
        for (const root of config.approvedRoots) {
          process.stdout.write(`${config.defaultRoot === root ? "*" : "-"} ${root}\n`);
        }
      }
      return true;
    }

    if (subcommand === "resolve") {
      const root = resolveApprovedWorkspaceRoot(process.cwd());
      if (json) process.stdout.write(JSON.stringify({ ok: true, root }) + "\n");
      else process.stdout.write(root ? `${root}\n` : "現在の場所に適用されるApproved Rootはありません。\n");
      return true;
    }

    const input = args[2];
    if (!input || input.startsWith("-")) {
      throw new Error(rootsUsage());
    }

    let config;
    if (subcommand === "add") config = approveWorkspaceRoot(input, { makeDefault: true });
    else if (subcommand === "remove") config = removeWorkspaceRoot(input);
    else if (subcommand === "default") config = setDefaultWorkspaceRoot(input);
    else throw new Error(rootsUsage());

    if (json) {
      process.stdout.write(JSON.stringify({ ok: true, configPath: workspaceRootsFile(), ...config }) + "\n");
    } else if (subcommand === "add") {
      process.stdout.write(`Approved Rootへ追加し、既定値に設定しました：${config.defaultRoot}\n`);
    } else if (subcommand === "remove") {
      process.stdout.write(`Approved Rootを削除しました：${path.resolve(input)}\n`);
    } else {
      process.stdout.write(`既定のApproved Rootを変更しました：${config.defaultRoot}\n`);
    }
    return true;
  } catch (error) {
    if (json) process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }) + "\n");
    else process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
    return true;
  }
}

function normalizeArgs(rawArgs) {
  let args = applyRememberedWorkspace([...rawArgs]);
  args = prepareRecordRepository(args);
  // Upstream compatibility: machine-wide commands accept a leftover Workspace
  // option even though they do not use it. Normalize at the executable boundary
  // so the hardened/localized CLI implementation does not need broad changes.
  if (isMachineWideCommand(args)) args = stripOption(args, ["-w", "--workspace"]);
  return args;
}

const rawArgs = process.argv.slice(2);
if (handleRootsCommand(rawArgs)) {
  // The machine-wide root registry does not need the bridge or compiled CLI.
} else {
  const args = normalizeArgs(rawArgs);
  process.argv = [...process.argv.slice(0, 2), ...args];

  if (existsSync(dist)) {
    await import(pathToFileURL(dist).href);
  } else {
    // dev fallback: run TypeScript sources through the tsx ESM loader
    const entry = path.join(here, "..", "src", "cli", "index.ts");
    const result = spawnSync(process.execPath, ["--import", "tsx/esm", entry, ...args], {
      stdio: "inherit",
    });
    process.exit(result.status ?? 1);
  }
}
