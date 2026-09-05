import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import { startBridge } from "../src/bridge/server.js";
import { cleanup, isolateStateDir, makeTmpDir, write } from "./helpers.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) cleanup(dir);
  delete process.env.C2C_STATE_DIR;
});

describe("public bridge error hardening", () => {
  it("does not expose parser stacks or internal paths for malformed public requests", async () => {
    dirs.push(isolateStateDir());
    const root = makeTmpDir("bridge-public-error");
    const authDir = makeTmpDir("bridge-public-error-auth");
    dirs.push(root, authDir);
    write(root, "hello.txt", "hello\n");

    const bridge = await startBridge({
      workspaceRoot: root,
      port: 0,
      persistRuntime: false,
      authStoreFile: path.join(authDir, "store.json"),
    });
    try {
      const response = await fetch(`${bridge.localBaseUrl()}/oauth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      });

      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(await response.json()).toEqual({ error: "invalid_request" });
    } finally {
      await bridge.close();
    }
  });
});
