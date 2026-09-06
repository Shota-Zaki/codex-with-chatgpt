import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Logger, redact } from "../src/logger/index.js";
import { sanitizeOutboundText } from "../src/security/outbound-sanitize.js";
import { cleanup, makeTmpDir } from "./helpers.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) cleanup(dir);
});

function outbound(text: string): string {
  const result = sanitizeOutboundText(text);
  expect(result.allowed).toBe(true);
  if (!result.allowed) throw new Error("Unexpected restricted fixture");
  return result.text;
}

for (const [name, sanitize] of [["logs", redact], ["outbound", outbound]] as const) {
  describe(`${name}: credential value boundaries`, () => {
    it("redacts quoted JSON keys and complete values without corrupting adjacent fields", () => {
      const raw = JSON.stringify({
        password: 'fake phrase with "quotes" and \\ slash',
        token: "fake token with spaces",
        api_key: "fake short key",
        safe: "keep this value",
        count: 42,
      });
      const clean = sanitize(raw);
      expect(JSON.parse(clean)).toEqual({
        password: "[REDACTED]",
        token: "[REDACTED]",
        api_key: "[REDACTED]",
        safe: "keep this value",
        count: 42,
      });
      expect(clean).not.toContain("fake");
    });

    it("handles single quotes, environment variables and authorization schemes", () => {
      const raw = "{'password': 'fake phrase', 'safe': 'keep'}\nSERVICE_API_KEY=fake-key; next=42\nAuthorization: Basic ZmFrZTpmYWtl\nAuthorization: Bearer fake-bearer\n";
      const clean = sanitize(raw);
      expect(clean).toContain("'password': '[REDACTED]'");
      expect(clean).toContain("'safe': 'keep'");
      expect(clean).toContain("SERVICE_API_KEY=[REDACTED]; next=42");
      expect(clean).not.toContain("fake");
      expect(clean).not.toContain("ZmFrZTpmYWtl");
    });

    it("is stable when already-redacted values pass through the boundary again", () => {
      const raw = 'token=synthetic-value\n{"password":"synthetic phrase"}\nAuthorization: Bearer synthetic-bearer';
      const once = sanitize(raw);
      expect(sanitize(once)).toBe(once);
    });

    it("keeps recognized token redaction and ordinary source text", () => {
      const token = "ghp_" + "a".repeat(32);
      const clean = sanitize(`const answer = 42;\n${token}`);
      expect(clean).toContain("const answer = 42;");
      expect(clean).not.toContain(token);
      expect(clean).toContain("[REDACTED]");
    });
  });
}

it("uses the shared policy when Logger serializes structured metadata", () => {
  const root = makeTmpDir("quoted-log-redaction");
  dirs.push(root);
  const file = path.join(root, "audit.log");
  new Logger({ file }).info("safe event", { password: "synthetic phrase", count: 42 });
  const line = fs.readFileSync(file, "utf8");
  expect(line).toContain('"password":"[REDACTED]"');
  expect(line).toContain('"count":42');
  expect(line).not.toContain("synthetic phrase");
});

it("retains fail-closed outbound private-key handling", () => {
  expect(sanitizeOutboundText("-----BEGIN PRIVATE KEY-----\nsynthetic body")).toEqual({
    allowed: false,
    reason: "private_key",
  });
});
