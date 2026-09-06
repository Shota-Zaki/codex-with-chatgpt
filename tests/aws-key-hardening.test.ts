import { describe, expect, it } from "vitest";
import { sanitizeOutboundText } from "../src/security/outbound-sanitize.js";

describe("AWS access-key outbound hardening", () => {
  it("redacts both long-lived AKIA and temporary ASIA access key IDs", () => {
    const longLived = "AKIAABCDEFGHIJKLMNOP";
    const temporary = "ASIAABCDEFGHIJKLMNOP";
    const result = sanitizeOutboundText(`ids: ${longLived} ${temporary}`);

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.text).not.toContain(longLived);
      expect(result.text).not.toContain(temporary);
      expect(result.text.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(2);
    }
  });
});
