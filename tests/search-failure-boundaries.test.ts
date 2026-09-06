import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { Workspace } from "../src/workspace/manager.js";
import { resetRipgrepCache, searchWorkspace } from "../src/workspace/search.js";
import { cleanup, makeTmpDir, write } from "./helpers.js";

const scenario = vi.hoisted(() => ({ code: 2 as number | null, signal: null as string | null, lines: [] as string[] }));
vi.mock("node:child_process", async () => {
  const { EventEmitter } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  return {
    spawnSync: () => ({ status: 0 }),
    spawn: () => {
      const child = new EventEmitter() as InstanceType<typeof EventEmitter> & {
        stdout: InstanceType<typeof PassThrough>;
        kill: (signal: string) => boolean;
      };
      child.stdout = new PassThrough();
      let killed = false;
      child.kill = (signal) => {
        if (!killed) {
          killed = true;
          queueMicrotask(() => child.emit("close", null, signal));
        }
        return true;
      };
      queueMicrotask(() => {
        for (const line of scenario.lines) child.stdout.write(line + "\n");
        child.stdout.end();
        setImmediate(() => {
          if (!killed) child.emit("close", scenario.code, scenario.signal);
        });
      });
      return child;
    },
  };
});

let root: string;
beforeEach(() => {
  root = makeTmpDir("search-failure");
  write(root, "note.txt", "needle-boundary\n");
  vi.stubEnv("C2C_RG_PATH", "fake-rg");
  vi.stubEnv("C2C_DISABLE_RG", "");
  resetRipgrepCache();
  scenario.code = 2;
  scenario.signal = null;
  scenario.lines = [];
});
afterEach(() => {
  cleanup(root);
  vi.unstubAllEnvs();
  resetRipgrepCache();
});

describe("ripgrep failure classification", () => {
  it("does not report an invalid regex process as a successful empty search", async () => {
    await expect(searchWorkspace(new Workspace(root), { query: "invalid(", regex: true }))
      .rejects.toMatchObject({ code: "REGEX_ENGINE_UNAVAILABLE" });
  });

  it("falls back for a literal query after a process failure", async () => {
    const result = await searchWorkspace(new Workspace(root), { query: "needle-boundary" });
    expect(result.engine).toBe("node");
    expect(result.matches.map((match) => match.path)).toEqual(["note.txt"]);
  });

  it("accepts the normal no-match exit status", async () => {
    scenario.code = 1;
    const result = await searchWorkspace(new Workspace(root), { query: "absent", regex: true });
    expect(result.engine).toBe("ripgrep");
    expect(result.matches).toEqual([]);
  });

  it("does not accept malformed JSON as successful output", async () => {
    scenario.code = 0;
    scenario.lines = ["not-json"];
    await expect(searchWorkspace(new Workspace(root), { query: "needle", regex: true }))
      .rejects.toMatchObject({ code: "REGEX_ENGINE_UNAVAILABLE" });
  });

  it("rejects unexpected signal termination", async () => {
    scenario.code = null;
    scenario.signal = "SIGKILL";
    await expect(searchWorkspace(new Workspace(root), { query: "needle", regex: true }))
      .rejects.toMatchObject({ code: "REGEX_ENGINE_UNAVAILABLE" });
  });

  it("preserves deliberate limit termination as a truncated result", async () => {
    const event = JSON.stringify({ type: "match", data: {
      path: { text: path.join(root, "note.txt") }, line_number: 1, lines: { text: "needle-boundary\n" },
    } });
    scenario.lines = [event, event];
    const result = await searchWorkspace(new Workspace(root), { query: "needle", regex: true, limit: 1 });
    expect(result.engine).toBe("ripgrep");
    expect(result.matches).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });
});
