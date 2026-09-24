import ignore, { type Ignore } from "ignore";
import fs from "node:fs";
import path from "node:path";

/** MCPで共有しない認証情報・実データ。個別設定からの解除は不可。 */
export const SENSITIVE_PATTERNS: string[] = [
  ".env", ".env.*", "!.env.example", "*.pem", "*.key", "*.p12", "*.pfx", "*.jks", "*.keystore",
  "id_rsa", "id_rsa.*", "id_ed25519", "id_ed25519.*", "id_ecdsa", "id_ecdsa.*", "id_dsa", "id_dsa.*",
  ".ssh/", ".aws/", ".gnupg/", ".npmrc", ".netrc", "_netrc", ".git-credentials",
  "*.keychain", "*.keychain-db", ".cloudflared/", "credentials.json", "service-account*.json", "secrets.json",
  "cookies.sqlite", "Cookies", ".c2c-secrets*", ".codex/", "**/.docker/config.json", "auth.json",
  "*.sqlite", "*.sqlite3", "*.sqlite-wal", "*.sqlite-shm", "*.sqlite3-wal", "*.sqlite3-shm",
  "*.db", "*.db-wal", "*.db-shm", "*.dump", "*.backup", "*.sql.gz", "*.p8", "*.mobileprovision",
];

/** 一覧と検索で省略する生成物。明示的な読み取りの可否とは別に扱う。 */
export const NOISE_PATTERNS: string[] = [
  ".git/", "node_modules/", "dist/", "build/", "out/", ".next/", ".nuxt/", ".svelte-kit/", "coverage/",
  ".cache/", ".turbo/", ".venv/", "venv/", "__pycache__/", ".pytest_cache/", ".mypy_cache/", "target/",
  ".gradle/", ".idea/", ".tooling/", ".pnpm-store/", ".DS_Store", "*.lock", "pnpm-lock.yaml", "package-lock.json", "yarn.lock",
];

interface CachedRules { stamp: string; rules: Ignore }

export class IgnoreRules {
  private readonly sensitive: Ignore = ignore().add(SENSITIVE_PATTERNS);
  private readonly noise: Ignore = ignore().add(NOISE_PATTERNS);
  private readonly root: string;
  private readonly cache = new Map<string, CachedRules>();

  constructor(workspaceRoot: string) {
    this.root = fs.realpathSync.native(workspaceRoot);
  }

  private customFor(directory: string): Ignore | null {
    let real: string;
    try { real = fs.realpathSync.native(directory); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error("非公開設定のディレクトリを確認できません。");
    }
    const rel = path.relative(this.root, real);
    if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
      throw new Error("非公開設定が共有範囲の外を参照しています。");
    }
    const file = path.join(real, ".c2cignore");
    let stat: fs.BigIntStats;
    try { stat = fs.lstatSync(file, { bigint: true }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") { this.cache.delete(file); return null; }
      throw new Error(".c2cignoreを確認できないため共有を停止しました。");
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536n) {
      throw new Error(".c2cignoreは64KiB以下の通常ファイルにしてください。");
    }
    const stamp = `${stat.dev}:${stat.ino}:${stat.mtimeNs}:${stat.ctimeNs}:${stat.size}`;
    const cached = this.cache.get(file);
    if (cached?.stamp === stamp) return cached.rules;
    let content: string;
    try { content = fs.readFileSync(file, "utf8"); }
    catch { throw new Error(".c2cignoreを読み込めないため共有を停止しました。"); }
    const after = fs.lstatSync(file, { bigint: true });
    if (!after.isFile() || after.isSymbolicLink() || `${after.dev}:${after.ino}:${after.mtimeNs}:${after.ctimeNs}:${after.size}` !== stamp) {
      throw new Error(".c2cignoreが変更されたため、もう一度読み取りを実行してください。");
    }
    const rules = ignore().add(content);
    if (this.cache.size >= 4096) this.cache.clear();
    this.cache.set(file, { stamp, rules });
    return rules;
  }

  isSensitive(relPath: string): boolean {
    if (!relPath || relPath === ".") return false;
    if (this.sensitive.ignores(relPath)) return true;
    const parts = relPath.replace(/\/$/, "").split("/");
    // Workspace直下だけでなく、各Repositoryと下位ディレクトリの設定を適用。
    // 下位の否定パターンによって上位で拒否したファイルを再公開しない。
    for (let i = 0; i < parts.length; i++) {
      const rules = this.customFor(path.join(this.root, ...parts.slice(0, i)));
      const localPath = parts.slice(i).join("/") + (relPath.endsWith("/") ? "/" : "");
      if (rules?.ignores(localPath)) return true;
    }
    return false;
  }

  isNoise(relPath: string): boolean {
    if (!relPath || relPath === ".") return false;
    return this.noise.ignores(relPath);
  }

  isHidden(relPath: string): boolean { return this.isNoise(relPath) || this.isSensitive(relPath); }
}
