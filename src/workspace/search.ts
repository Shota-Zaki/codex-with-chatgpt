import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { Workspace, WorkspaceError } from "./manager.js";

export interface SearchOptions {
  query: string;
  path?: string;
  glob?: string;
  limit?: number;
  regex?: boolean;
}

export interface SearchMatch {
  path: string;
  line: number;
  text: string;
}

export interface SearchResult {
  matches: SearchMatch[];
  matchCount: number;
  truncated: boolean;
  engine: "ripgrep" | "node";
}

export class SearchError extends Error {
  constructor(
    readonly code: "REGEX_ENGINE_UNAVAILABLE" | "SEARCH_LIMIT_EXCEEDED",
    message: string
  ) {
    super(message);
    this.name = "SearchError";
  }
}

const MAX_GLOB_LENGTH = 1024;
const MAX_GLOB_STEPS = 20_000_000;
const RG_CANDIDATES = [
  "rg",
  "/opt/homebrew/bin/rg",
  "/usr/local/bin/rg",
  "/usr/bin/rg",
  "/Applications/Cursor.app/Contents/Resources/app/node_modules/@vscode/ripgrep/bin/rg",
  "/Applications/Visual Studio Code.app/Contents/Resources/app/node_modules/@vscode/ripgrep/bin/rg",
];

let cachedRg: string | null | undefined;

export function findRipgrep(): string | null {
  if (process.env.C2C_DISABLE_RG === "1") return null;
  if (cachedRg !== undefined) return cachedRg;
  if (process.env.C2C_RG_PATH) {
    cachedRg = process.env.C2C_RG_PATH;
    return cachedRg;
  }
  for (const candidate of RG_CANDIDATES) {
    try {
      const result = spawnSync(candidate, ["--version"], { stdio: "ignore", timeout: 3000 });
      if (result.status === 0) {
        cachedRg = candidate;
        return candidate;
      }
    } catch {
      // try next candidate
    }
  }
  cachedRg = null;
  return null;
}

/** For tests. */
export function resetRipgrepCache(): void {
  cachedRg = undefined;
}

async function searchWithRipgrep(
  ws: Workspace,
  rgBin: string,
  searchAbs: string,
  opts: SearchOptions,
  limit: number
): Promise<SearchResult> {
  const args = ["--json", "--max-filesize", "2M", "--max-count", "20"];
  if (!opts.regex) args.push("-F");
  args.push("--smart-case");
  if (opts.glob) args.push("-g", opts.glob);
  args.push("--", opts.query, searchAbs);

  return new Promise((resolvePromise, reject) => {
    const child = spawn(rgBin, args, { cwd: ws.root, stdio: ["ignore", "pipe", "ignore"] });
    const matches: SearchMatch[] = [];
    let truncated = false;
    let malformedOutput = false;
    const rl = readline.createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      if (matches.length >= limit) {
        truncated = true;
        child.kill("SIGTERM");
        return;
      }
      try {
        const event = JSON.parse(line) as {
          type: string;
          data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string } };
        };
        if (event.type !== "match" || !event.data?.path?.text) return;
        const rel = path.relative(ws.root, event.data.path.text).split(path.sep).join("/");
        if (rel.startsWith("..") || ws.ignoreRules.isHidden(rel)) return;
        matches.push({
          path: rel,
          line: event.data.line_number ?? 0,
          text: (event.data.lines?.text ?? "").trimEnd().slice(0, 500),
        });
      } catch {
        malformedOutput = true;
      }
    });
    child.on("error", (error) => {
      rl.close();
      reject(error);
    });
    child.on("close", (code, signal) => {
      rl.close();
      if (malformedOutput || (code !== 0 && code !== 1 && !(truncated && signal === "SIGTERM"))) {
        reject(new Error("ripgrep did not complete successfully."));
        return;
      }
      resolvePromise({ matches, matchCount: matches.length, truncated, engine: "ripgrep" });
    });
  });
}

async function searchWithNode(
  ws: Workspace,
  searchAbs: string,
  opts: SearchOptions,
  limit: number
): Promise<SearchResult> {
  const needle = opts.query.toLowerCase();
  const matchesGlob = opts.glob ? compileGlob(opts.glob) : null;
  const matches: SearchMatch[] = [];
  let truncated = false;

  const scanFile = async (fileAbs: string, fileRel: string): Promise<void> => {
    if (truncated || ws.ignoreRules.isHidden(fileRel)) return;
    if (matchesGlob && !matchesGlob(fileRel)) return;
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(fileAbs);
    } catch {
      return;
    }
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) return;
    let content: string;
    try {
      content = await fs.promises.readFile(fileAbs, "utf8");
    } catch {
      return;
    }
    if (content.includes("\0")) return;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.toLowerCase().includes(needle)) {
        matches.push({ path: fileRel, line: i + 1, text: line.trimEnd().slice(0, 500) });
        if (matches.length >= limit) {
          truncated = true;
          return;
        }
      }
    }
  };

  const walk = async (dirAbs: string, dirRel: string): Promise<void> => {
    if (truncated) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (truncated) return;
      const childRel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
      const childAbs = path.join(dirAbs, entry.name);
      if (entry.isDirectory()) {
        if (ws.ignoreRules.isHidden(childRel) || ws.ignoreRules.isHidden(childRel + "/")) continue;
        await walk(childAbs, childRel);
      } else if (entry.isFile()) {
        await scanFile(childAbs, childRel);
      }
    }
  };

  const startRel = path.relative(ws.root, searchAbs).split(path.sep).join("/");
  let startStat: fs.Stats;
  try {
    startStat = await fs.promises.stat(searchAbs);
  } catch {
    throw new WorkspaceError("FILE_NOT_FOUND", "Search path was not found or could not be accessed.");
  }
  if (startStat.isFile()) await scanFile(searchAbs, startRel);
  else if (startStat.isDirectory()) await walk(searchAbs, startRel);
  else throw new WorkspaceError("NOT_A_FILE", "Search path is not a regular file or directory.");
  return { matches, matchCount: matches.length, truncated, engine: "node" };
}

/** Match star, globstar, recursive-directory and question-mark wildcards without regex backtracking. */
function compileGlob(glob: string): (filePath: string) => boolean {
  const tokens: string[] = [];
  const pattern = glob.toLowerCase();
  for (let i = 0; i < pattern.length;) {
    const token = pattern.startsWith("**/", i) ? "**/" : pattern.startsWith("**", i) ? "**" : pattern[i];
    tokens.push(token);
    i += token.length;
  }
  let steps = 0;
  return (filePath) => {
    const value = filePath.toLowerCase();
    steps += tokens.length * (value.length + 1);
    if (steps > MAX_GLOB_STEPS) {
      throw new SearchError("SEARCH_LIMIT_EXCEEDED", "Glob matching budget exceeded; narrow the search path or pattern.");
    }
    let next = new Uint8Array(value.length + 1);
    next[value.length] = 1;
    for (let p = tokens.length - 1; p >= 0; p--) {
      const token = tokens[p];
      const current = new Uint8Array(value.length + 1);
      if (token === "*" || token === "**" || token === "**/") current[value.length] = next[value.length];
      let directorySuffix = 0;
      for (let i = value.length - 1; i >= 0; i--) {
        if (token === "**/") {
          if (value[i] === "/" && next[i + 1]) directorySuffix = 1;
          current[i] = next[i] || directorySuffix;
        } else if (token === "*" || token === "**") {
          current[i] = next[i] || ((token === "**" || value[i] !== "/") ? current[i + 1] : 0);
        } else {
          current[i] = (token === "?" ? value[i] !== "/" : token === value[i]) ? next[i + 1] : 0;
        }
      }
      next = current;
    }
    if (next[0]) return true;
    for (let i = 1; i < value.length; i++) {
      if (value[i - 1] === "/" && next[i]) return true;
    }
    return false;
  };
}

export async function searchWorkspace(ws: Workspace, opts: SearchOptions): Promise<SearchResult> {
  if (!opts.query || opts.query.length < 2) {
    return { matches: [], matchCount: 0, truncated: false, engine: "node" };
  }
  if (opts.glob && opts.glob.length > MAX_GLOB_LENGTH) {
    throw new SearchError("SEARCH_LIMIT_EXCEEDED", "Glob pattern exceeds the supported length.");
  }
  const limit = Math.min(200, Math.max(1, Math.floor(opts.limit ?? 50)));
  const { abs } = ws.resolve(opts.path ?? ".");
  const rg = findRipgrep();
  if (rg) {
    try {
      return await searchWithRipgrep(ws, rg, abs, opts, limit);
    } catch {
      if (opts.regex) {
        throw new SearchError(
          "REGEX_ENGINE_UNAVAILABLE",
          "Regex search requires a working ripgrep engine."
        );
      }
      // Literal search may fall back to the bounded Node implementation.
    }
  }
  if (opts.regex) {
    throw new SearchError(
      "REGEX_ENGINE_UNAVAILABLE",
      "Regex search requires ripgrep and is unavailable in the Node fallback."
    );
  }
  return searchWithNode(ws, abs, opts, limit);
}
