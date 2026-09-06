import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("reviewed dependency pin", () => {
  it("pins MCP SDK in both package.json and the frozen lockfile importer", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    const lock = fs.readFileSync(path.join(repoRoot, "pnpm-lock.yaml"), "utf8");

    expect(pkg.dependencies["@modelcontextprotocol/sdk"]).toBe("1.30.0");
    expect(lock).toMatch(
      /'@modelcontextprotocol\/sdk':\s*\n\s*specifier: 1\.30\.0\s*\n\s*version: 1\.30\.0\(zod@3\.25\.76\)/
    );
  });
});
