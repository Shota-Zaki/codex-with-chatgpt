#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

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
  if (args[0] === "update-check" || args[0] === "sandbox-allow" || args[0] === "prefs") return true;
  return args[0] === "tunnel" && args[1] === "login";
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
    if (/^[a-f0-9]{12}$/i.test(selector.trim())) {
      process.env.C2C_RECORD_REPOSITORY_ID = selector.trim().toLowerCase();
      delete process.env.C2C_RECORD_REPOSITORY_ROOT;
    } else {
      const candidate = realpathSync(path.resolve(workspaceRoot, selector));
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

function normalizeArgs(rawArgs) {
  let args = prepareRecordRepository([...rawArgs]);
  // Upstream compatibility: machine-wide commands accept a leftover Workspace
  // option even though they do not use it. Normalize at the executable boundary
  // so the hardened/localized CLI implementation does not need broad changes.
  if (isMachineWideCommand(args)) args = stripOption(args, ["-w", "--workspace"]);
  return args;
}

const args = normalizeArgs(process.argv.slice(2));
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
