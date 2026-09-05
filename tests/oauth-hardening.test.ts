import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import { startBridge, type Bridge } from "../src/bridge/server.js";
import { cleanup, isolateStateDir, makeTmpDir, pkceVerifierAndChallenge, write } from "./helpers.js";

const dirs: string[] = [];

const REDIRECT_URI = "http://127.0.0.1:19999/callback";

function makeWorkspace(prefix: string): string {
  const root = makeTmpDir(prefix);
  dirs.push(root);
  write(root, "hello.txt", "hello\n");
  return root;
}

async function startIsolatedBridge(prefix: string): Promise<Bridge> {
  dirs.push(isolateStateDir());
  const authDir = makeTmpDir(`${prefix}-auth`);
  dirs.push(authDir);
  return startBridge({
    workspaceRoot: makeWorkspace(prefix),
    port: 0,
    persistRuntime: false,
    authStoreFile: path.join(authDir, "store.json"),
  });
}

async function register(base: string, redirectUris: string[] = [REDIRECT_URI]): Promise<Response> {
  return fetch(`${base}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Hardening-Test", redirect_uris: redirectUris }),
  });
}

async function registerClient(base: string): Promise<string> {
  const response = await register(base);
  expect(response.status).toBe(201);
  const body = (await response.json()) as { client_id: string };
  return body.client_id;
}

function authorizeUrl(base: string, clientId: string, scope?: string): URL {
  const { challenge } = pkceVerifierAndChallenge();
  const url = new URL(`${base}/oauth/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (scope !== undefined) url.searchParams.set("scope", scope);
  return url;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) cleanup(dir);
  delete process.env.C2C_STATE_DIR;
});

describe("OAuth hardening", () => {
  it("returns invalid_scope for any unsupported requested scope", async () => {
    const bridge = await startIsolatedBridge("oauth-invalid-scope");
    try {
      const base = bridge.localBaseUrl();
      const clientId = await registerClient(base);
      const response = await fetch(authorizeUrl(base, clientId, "workspace.read unknown.scope"), {
        redirect: "manual",
      });

      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toBeTruthy();
      expect(new URL(location!).searchParams.get("error")).toBe("invalid_scope");
    } finally {
      await bridge.close();
    }
  });

  it("renders only the supported least-privilege subset requested", async () => {
    const bridge = await startIsolatedBridge("oauth-subset");
    try {
      const base = bridge.localBaseUrl();
      const clientId = await registerClient(base);
      const response = await fetch(authorizeUrl(base, clientId, "workspace.read"), {
        redirect: "manual",
      });

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Read files in this workspace");
      expect(html).not.toContain("Search this workspace");
      expect(html).not.toContain("Read git status and diffs");
      expect(html).not.toContain("Stay connected between sessions");
    } finally {
      await bridge.close();
    }
  });

  it("rejects registrations with more than eight redirect URIs", async () => {
    const bridge = await startIsolatedBridge("oauth-redirect-count");
    try {
      const redirectUris = Array.from(
        { length: 9 },
        (_, index) => `https://example.com/callback/${index}`
      );
      const response = await register(bridge.localBaseUrl(), redirectUris);
      expect(response.status).toBe(400);
    } finally {
      await bridge.close();
    }
  });

  it("rejects redirect URIs longer than 2048 characters", async () => {
    const bridge = await startIsolatedBridge("oauth-redirect-length");
    try {
      const tooLong = `https://example.com/${"a".repeat(2048)}`;
      const response = await register(bridge.localBaseUrl(), [tooLong]);
      expect(response.status).toBe(400);
    } finally {
      await bridge.close();
    }
  });

  it("rejects new registrations after the workspace client limit is reached", async () => {
    const bridge = await startIsolatedBridge("oauth-client-limit");
    try {
      for (let index = 0; index < 32; index += 1) {
        bridge.authStore.registerClient({
          clientName: `Existing-${index}`,
          redirectUris: [REDIRECT_URI],
        });
      }

      const response = await register(bridge.localBaseUrl());
      expect(response.status).toBe(429);
      const body = (await response.json()) as { error?: string };
      expect(body.error).toBe("too_many_clients");
    } finally {
      await bridge.close();
    }
  });

  it("rate limits dynamic client registration per derived client identity", async () => {
    const bridge = await startIsolatedBridge("oauth-registration-rate");
    try {
      const base = bridge.localBaseUrl();
      for (let index = 0; index < 20; index += 1) {
        const response = await register(base);
        expect(response.status).toBe(201);
      }

      const blocked = await register(base);
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get("retry-after")).toBeTruthy();
    } finally {
      await bridge.close();
    }
  });

  it("bounds pending authorization requests", async () => {
    const bridge = await startIsolatedBridge("oauth-pending-limit");
    try {
      const base = bridge.localBaseUrl();
      const clientId = await registerClient(base);
      for (let index = 0; index < 64; index += 1) {
        const response = await fetch(authorizeUrl(base, clientId, "workspace.read"), {
          redirect: "manual",
        });
        expect(response.status).toBe(200);
      }

      const blocked = await fetch(authorizeUrl(base, clientId, "workspace.read"), {
        redirect: "manual",
      });
      expect(blocked.status).toBe(302);
      const location = blocked.headers.get("location");
      expect(location).toBeTruthy();
      expect(new URL(location!).searchParams.get("error")).toBe("temporarily_unavailable");
    } finally {
      await bridge.close();
    }
  });
});
