import fs from "node:fs";
import path from "node:path";
import { Workspace } from "./manager.js";
import { gitInfo, runGit, type GitInfo } from "./git.js";

export type RepositorySelectionErrorCode =
  | "NO_REPOSITORY"
  | "REPOSITORY_REQUIRED"
  | "REPOSITORY_NOT_FOUND"
  | "AMBIGUOUS_REPOSITORY"
  | "PATH_OUTSIDE_REPOSITORY"
  | "INVALID_REPOSITORY_CONFIG";

export class RepositorySelectionError extends Error {
  constructor(
    public readonly code: RepositorySelectionErrorCode,
    message: string
  ) {
    super(message);
    this.name = "RepositorySelectionError";
  }
}

export interface RepositoryContext {
  /** Stable repository identity. Equal to this repository's standalone Workspace id. */
  id: string;
  name: string;
  /** Canonical absolute root. Never return this path to ChatGPT. */
  root: string;
  /** Workspace-relative root using forward slashes; "." means the Workspace root. */
  relativeRoot: string;
  /** Repository-scoped Workspace used for path confinement and ignore rules. */
  scope: Workspace;
  git: GitInfo;
}

interface WorkspaceRepositoryConfig {
  repositories?: unknown;
}

const MAX_REPOSITORIES = 64;
const MAX_DISCOVERY_CANDIDATES = 128;
const CASE_INSENSITIVE = process.platform === "win32" || process.platform === "darwin";
const normCase = (value: string): string => (CASE_INSENSITIVE ? value.toLowerCase() : value);

function slash(value: string): string {
  return value.split(path.sep).join("/");
}

function normalizeSelectorPath(value: string): string {
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  return normalized === "" ? "." : normalized;
}

function invalidRepositoryConfig(message: string): never {
  throw new RepositorySelectionError("INVALID_REPOSITORY_CONFIG", message);
}

function configuredRepositoryRoots(workspace: Workspace): string[] | null {
  const configFile = path.join(workspace.root, ".c2c.json");
  if (!fs.existsSync(configFile)) return null;

  let parsed: WorkspaceRepositoryConfig;
  try {
    const value = JSON.parse(fs.readFileSync(configFile, "utf8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return invalidRepositoryConfig(".c2c.json must contain a JSON object.");
    }
    parsed = value as WorkspaceRepositoryConfig;
  } catch (error) {
    if (error instanceof RepositorySelectionError) throw error;
    return invalidRepositoryConfig(".c2c.json is invalid JSON; repository discovery was stopped.");
  }

  if (parsed.repositories === undefined) return null;
  if (!Array.isArray(parsed.repositories)) {
    return invalidRepositoryConfig(
      ".c2c.json repositories must be an array of workspace-relative repository roots."
    );
  }
  if (parsed.repositories.length > MAX_REPOSITORIES) {
    return invalidRepositoryConfig(
      `.c2c.json repositories exceeds the maximum of ${MAX_REPOSITORIES}.`
    );
  }

  const values = parsed.repositories.map((entry) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      return invalidRepositoryConfig(
        ".c2c.json repositories entries must be non-empty strings."
      );
    }
    return normalizeSelectorPath(entry);
  });
  return [...new Set(values)];
}

function isRepositoryRoot(candidate: string): boolean {
  const result = runGit(candidate, ["rev-parse", "--show-toplevel"]);
  if (!result.ok || !result.stdout.trim()) return false;
  try {
    const top = fs.realpathSync.native(path.resolve(result.stdout.trim()));
    const root = fs.realpathSync.native(candidate);
    return normCase(top) === normCase(root);
  } catch {
    return false;
  }
}

function createRepositoryContext(workspace: Workspace, relativeRoot: string): RepositoryContext {
  const normalized = normalizeSelectorPath(relativeRoot);
  const resolved = workspace.resolve(normalized);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved.abs);
  } catch {
    throw new RepositorySelectionError(
      "REPOSITORY_NOT_FOUND",
      `Configured repository does not exist: ${normalized}`
    );
  }
  if (!stat.isDirectory() || !isRepositoryRoot(resolved.abs)) {
    throw new RepositorySelectionError(
      "REPOSITORY_NOT_FOUND",
      `Configured path is not a Git repository root: ${normalized}`
    );
  }
  const scope = new Workspace(resolved.abs);
  const rel = slash(path.relative(workspace.root, scope.root)) || ".";
  return {
    id: scope.id,
    name: scope.name,
    root: scope.root,
    relativeRoot: rel,
    scope,
    git: gitInfo(scope.root),
  };
}

function autoDiscoverRepositoryRoots(workspace: Workspace): string[] {
  if (isRepositoryRoot(workspace.root)) return ["."];

  const candidates: string[] = [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(workspace.root, { withFileTypes: true });
  } catch {
    return candidates;
  }

  let scanned = 0;
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const rel = entry.name;
    if (workspace.ignoreRules.isHidden(rel) || workspace.ignoreRules.isHidden(`${rel}/`)) continue;
    scanned += 1;
    if (scanned > MAX_DISCOVERY_CANDIDATES) break;
    const candidate = path.join(workspace.root, entry.name);
    if (isRepositoryRoot(candidate)) candidates.push(rel);
    if (candidates.length >= MAX_REPOSITORIES) break;
  }
  return candidates;
}

/**
 * Return the Git repositories belonging to a Workspace without widening its
 * authorization boundary. Explicit `.c2c.json.repositories` entries may point
 * to nested repositories; without configuration only the Workspace root or
 * immediate child repositories are discovered.
 */
export function discoverRepositories(workspace: Workspace): RepositoryContext[] {
  const configured = configuredRepositoryRoots(workspace);
  const roots = configured ?? autoDiscoverRepositoryRoots(workspace);
  const contexts = roots.map((root) => createRepositoryContext(workspace, root));
  const seen = new Set<string>();
  return contexts.filter((repository) => {
    if (seen.has(repository.id)) return false;
    seen.add(repository.id);
    return true;
  });
}

function describeRepositories(repositories: RepositoryContext[]): string {
  return repositories
    .map((repository) => `${repository.name} (${repository.id}, ${repository.relativeRoot})`)
    .join(", ");
}

export function selectRepository(
  workspace: Workspace,
  selector?: string,
  repositories: RepositoryContext[] = discoverRepositories(workspace)
): RepositoryContext {
  if (repositories.length === 0) {
    throw new RepositorySelectionError("NO_REPOSITORY", "No Git repository was found in this Workspace.");
  }
  const raw = selector?.trim();
  if (!raw) {
    if (repositories.length === 1) return repositories[0];
    throw new RepositorySelectionError(
      "REPOSITORY_REQUIRED",
      `This Workspace contains multiple repositories. Specify repository by id or relative root. Available: ${describeRepositories(repositories)}`
    );
  }

  const normalized = normalizeSelectorPath(raw);
  const exact = repositories.filter(
    (repository) =>
      repository.id.toLowerCase() === raw.toLowerCase() ||
      normalizeSelectorPath(repository.relativeRoot).toLowerCase() === normalized.toLowerCase()
  );
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    throw new RepositorySelectionError(
      "AMBIGUOUS_REPOSITORY",
      `Repository selector '${raw}' is ambiguous. Use repository id. Available: ${describeRepositories(exact)}`
    );
  }

  const byName = repositories.filter((repository) => repository.name.toLowerCase() === raw.toLowerCase());
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    throw new RepositorySelectionError(
      "AMBIGUOUS_REPOSITORY",
      `Repository name '${raw}' is ambiguous. Use repository id or relative root. Available: ${describeRepositories(byName)}`
    );
  }

  throw new RepositorySelectionError(
    "REPOSITORY_NOT_FOUND",
    `Repository '${raw}' is not registered in this Workspace. Available: ${describeRepositories(repositories)}`
  );
}

export function workspacePathForRepository(repository: RepositoryContext, requested = "."): string {
  const clean = normalizeSelectorPath(requested);
  if (repository.relativeRoot === ".") return clean;
  if (clean === ".") return repository.relativeRoot;
  return `${repository.relativeRoot}/${clean}`;
}

/** Resolve a repository-relative path and reject `..` escapes into sibling repositories. */
export function resolveRepositoryPath(
  workspace: Workspace,
  repository: RepositoryContext,
  requested = "."
): { abs: string; workspaceRel: string; repositoryRel: string } {
  const scoped = workspacePathForRepository(repository, requested);
  const resolved = workspace.resolve(scoped);
  const relative = path.relative(repository.root, resolved.abs);
  const escaped = relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  if (escaped) {
    throw new RepositorySelectionError(
      "PATH_OUTSIDE_REPOSITORY",
      `Path resolves outside repository '${repository.name}': ${requested}`
    );
  }
  return {
    abs: resolved.abs,
    workspaceRel: resolved.rel,
    repositoryRel: slash(relative) || ".",
  };
}
