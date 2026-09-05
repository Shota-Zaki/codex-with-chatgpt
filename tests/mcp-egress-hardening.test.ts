import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startBridge, type Bridge } from "../src/bridge/server.js";
import { resetRipgrepCache } from "../src/workspace/search.js";
import { cleanup, git, isolateStateDir, makeGitRepo, makeTmpDir, write } from "./helpers.js";

let root: string;
let stateDir: string;
let authDir: string;
let bridge: Bridge;
let client: Client;

function textOf(result: { content?: unknown }): string {
  const content = result.content as { type: string; text: string }[];
  return content?.[0]?.text ?? "";
}

function jsonOf<T>(result: { content?: unknown }): T {
  return JSON.parse(textOf(result)) as T;
}

beforeAll(async () => {
  stateDir = isolateStateDir();
  root = makeTmpDir("mcp-egress");
  authDir = makeTmpDir("mcp-egress-auth");
  makeGitRepo(root);

  bridge = await startBridge({
    workspaceRoot: root,
    port: 0,
    persistRuntime: false,
    authStoreFile: path.join(authDir, "store.json"),
  });
  const tokens = bridge.authStore.issueTokens({
    clientId: "mcp-egress-test",
    scopes: ["workspace.read", "workspace.search", "git.read", "execution.read"],
  });
  client = new Client({ name: "mcp-egress-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${bridge.localBaseUrl()}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${tokens.accessToken}` } },
  });
  await client.connect(transport);
});

afterAll(async () => {
  delete process.env.C2C_DISABLE_RG;
  resetRipgrepCache();
  await client.close();
  await bridge.close();
  cleanup(root);
  cleanup(authDir);
  cleanup(stateDir);
});

describe("MCP outbound secret boundary", () => {
  it("redacts recognized credentials from read_file", async () => {
    const secret = "ghp_abcdefghijklmnopqrstuvwxyz123456";
    write(root, "src/read-secret.txt", `token=${secret}\n`);

    const result = await client.callTool({
      name: "read_file",
      arguments: { path: "src/read-secret.txt" },
    });
    const body = jsonOf<{ content: string }>(result);

    expect(result.isError ?? false).toBe(false);
    expect(body.content).toContain("[REDACTED]");
    expect(body.content).not.toContain(secret);
    expect(textOf(result)).not.toContain(secret);
  });

  it("redacts recognized credentials from search matches", async () => {
    const secret = "sk-abcdefghijklmnopqrstuvwxyz123456";
    write(root, "src/search-secret.txt", `api_key=${secret}\n`);

    const result = await client.callTool({
      name: "search_workspace",
      arguments: { query: "api_key" },
    });
    const body = jsonOf<{ matches: { text: string }[] }>(result);

    expect(result.isError ?? false).toBe(false);
    expect(body.matches.some((match) => match.text.includes("[REDACTED]"))).toBe(true);
    expect(textOf(result)).not.toContain(secret);
  });

  it("redacts recognized credentials from git_diff", async () => {
    const secret = "ghp_1234567890abcdefghijklmnopqrstuvwxyz";
    write(root, "src/diff-secret.txt", `token=${secret}\n`);

    const result = await client.callTool({
      name: "git_diff",
      arguments: { mode: "unstaged" },
    });
    const body = jsonOf<{ diff: string }>(result);

    expect(result.isError ?? false).toBe(false);
    expect(body.diff).toContain("[REDACTED]");
    expect(body.diff).not.toContain(secret);
    expect(textOf(result)).not.toContain(secret);
  });

  it("fails closed without echoing private-key content", async () => {
    write(
      root,
      "src/private-material.txt",
      "-----BEGIN OPENSSH PRIVATE KEY-----\nvery-secret-key-body\n-----END OPENSSH PRIVATE KEY-----\n"
    );

    const result = await client.callTool({
      name: "read_file",
      arguments: { path: "src/private-material.txt" },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("SENSITIVE_CONTENT_RESTRICTED");
    expect(textOf(result)).not.toContain("BEGIN OPENSSH PRIVATE KEY");
    expect(textOf(result)).not.toContain("very-secret-key-body");
  });

  it("maps unavailable regex fallback to a deterministic safe MCP error", async () => {
    process.env.C2C_DISABLE_RG = "1";
    resetRipgrepCache();
    try {
      const result = await client.callTool({
        name: "search_workspace",
        arguments: { query: "(a+)+$", regex: true },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("REGEX_ENGINE_UNAVAILABLE");
      expect(textOf(result)).not.toContain(root);
    } finally {
      delete process.env.C2C_DISABLE_RG;
      resetRipgrepCache();
    }
  });

  it("preserves read-only MCP tool boundaries", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    for (const forbidden of [
      "write_file",
      "delete_file",
      "shell",
      "execute",
      "execute_shell",
      "git_commit",
      "install_package",
      "network_request",
    ]) {
      expect(names).not.toContain(forbidden);
    }
  });
});
