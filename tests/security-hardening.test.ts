import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Request } from "express";
import { startBridge } from "../src/bridge/server.js";
import { deriveClientIp } from "../src/auth/client-ip.js";
import { parseRequestedScopes } from "../src/auth/store.js";
import { sanitizeOutboundText } from "../src/security/outbound-sanitize.js";
import { Workspace, WorkspaceError } from "../src/workspace/manager.js";
import { resetRipgrepCache, searchWorkspace } from "../src/workspace/search.js";
import { cleanup, isolateStateDir, makeTmpDir, write } from "./helpers.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) cleanup(dir);
  delete process.env.C2C_STATE_DIR;
  delete process.env.C2C_DISABLE_RG;
  resetRipgrepCache();
});

describe("dependency and Skill hardening", () => {
  it("pins the reviewed MCP SDK and removes unattended update behavior", () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    const skill = fs.readFileSync(path.join(repoRoot, "skill", "SKILL.md"), "utf8");

    expect(pkg.dependencies["@modelcontextprotocol/sdk"]).toBe("1.30.0");
    expect(skill).toContain("~/.agents/skills/codex-with-chatgpt/SKILL.md");
    expect(skill).not.toContain("git stash && git pull --ff-only");
    expect(skill).not.toContain("Then run the update workflow below, and CONTINUE");
  });
});

describe("OAuth scope hardening", () => {
  it("rejects unsupported scopes instead of escalating to all scopes", () => {
    const result = parseRequestedScopes("workspace.read unknown.scope");
    expect(result).toEqual({ ok: false, unsupported: ["unknown.scope"] });
  });

  it("preserves a supported least-privilege subset", () => {
    const result = parseRequestedScopes("workspace.read git.read");
    expect(result).toEqual({ ok: true, scopes: ["workspace.read", "git.read"] });
  });
});

describe("client identity hardening", () => {
  const request = (headers: Record<string, string>, remoteAddress = "127.0.0.1"): Request =>
    ({ headers, socket: { remoteAddress } } as unknown as Request);

  it("does not trust X-Forwarded-For", () => {
    expect(deriveClientIp(request({ "x-forwarded-for": "203.0.113.10" }))).toBe("127.0.0.1");
  });

  it("accepts one valid Cloudflare client IP and rejects malformed multi-value input", () => {
    expect(deriveClientIp(request({ "cf-connecting-ip": "203.0.113.11" }))).toBe("203.0.113.11");
    expect(deriveClientIp(request({ "cf-connecting-ip": "203.0.113.11, 198.51.100.2" }))).toBe("127.0.0.1");
  });
});

describe("public health minimization", () => {
  it("exposes only service and status", async () => {
    dirs.push(isolateStateDir());
    const root = makeTmpDir("hard-health");
    dirs.push(root);
    write(root, "hello.txt", "hello\n");
    const authDir = makeTmpDir("hard-health-auth");
    dirs.push(authDir);
    const bridge = await startBridge({
      workspaceRoot: root,
      port: 0,
      persistRuntime: false,
      authStoreFile: path.join(authDir, "store.json"),
    });
    try {
      const response = await fetch(`${bridge.localBaseUrl()}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ service: "c2c-bridge", status: "ok" });
    } finally {
      await bridge.close();
    }
  });
});

describe("regex fallback hardening", () => {
  it("rejects regex search when ripgrep is unavailable", async () => {
    const root = makeTmpDir("hard-search");
    dirs.push(root);
    write(root, "a.txt", "aaaaaaaaaaaaaaaaaaaaaaaaaaaa!\n");
    const ws = new Workspace(root);
    process.env.C2C_DISABLE_RG = "1";
    resetRipgrepCache();

    await expect(
      searchWorkspace(ws, { query: "(a+)+$", regex: true })
    ).rejects.toMatchObject({ code: "REGEX_ENGINE_UNAVAILABLE" });
  });

  it("keeps literal Node fallback search working", async () => {
    const root = makeTmpDir("hard-search-literal");
    dirs.push(root);
    write(root, "a.txt", "needle-hardening\n");
    const ws = new Workspace(root);
    process.env.C2C_DISABLE_RG = "1";
    resetRipgrepCache();

    const result = await searchWorkspace(ws, { query: "needle-hardening" });
    expect(result.engine).toBe("node");
    expect(result.matches[0]?.text).toContain("needle-hardening");
  });
});

describe("sensitive path hardening", () => {
  it("denies common Docker, Kubernetes, cloud and Terraform credential/state files", () => {
    const root = makeTmpDir("hard-sensitive");
    dirs.push(root);
    const paths = [
      ".docker/config.json",
      ".kube/config",
      ".azure/credentials",
      ".config/gcloud/application_default_credentials.json",
      ".pypirc",
      "terraform.tfstate",
      "prod.tfstate.backup",
      "prod.tfvars",
      "prod.tfvars.json",
      "profile.mobileprovision",
    ];
    for (const p of paths) write(root, p, "secret\n");
    const ws = new Workspace(root);

    for (const p of paths) {
      try {
        ws.resolve(p);
        expect.unreachable(`expected ${p} to be denied`);
      } catch (error) {
        expect(error).toBeInstanceOf(WorkspaceError);
        expect((error as WorkspaceError).code).toBe("ACCESS_DENIED_SENSITIVE_FILE");
      }
    }
  });
});

describe("shared outbound sanitizer", () => {
  it("redacts recognized secrets without altering ordinary source text", () => {
    const raw = [
      "const answer = 42;",
      "token=ghp_abcdefghijklmnopqrstuvwxyz123456",
      "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456",
      "password=hunter2",
    ].join("\n");
    const result = sanitizeOutboundText(raw);
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.text).toContain("const answer = 42;");
      expect(result.text).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz123456");
      expect(result.text).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
      expect(result.text).not.toContain("hunter2");
      expect(result.text).toContain("[REDACTED]");
    }
  });

  it("fails closed on private-key blocks", () => {
    const result = sanitizeOutboundText(
      "-----BEGIN OPENSSH PRIVATE KEY-----\nsecret\n-----END OPENSSH PRIVATE KEY-----"
    );
    expect(result).toEqual({ allowed: false, reason: "private_key" });
  });
});
