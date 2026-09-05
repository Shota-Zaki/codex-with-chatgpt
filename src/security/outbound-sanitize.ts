import { redact } from "../logger/index.js";

const PRIVATE_KEY_BLOCKS: RegExp[] = [
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/i,
  /-----BEGIN PGP PRIVATE KEY BLOCK-----/i,
];

const SECRET_PATTERNS: RegExp[] = [
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /((?:api[_-]?key|secret|password|passwd|authorization|token)\s*[:=]\s*["']?)\S+/gi,
];

export type OutboundSanitizeResult =
  | { allowed: true; text: string }
  | { allowed: false; reason: "private_key" };

export function redactHomePaths(text: string): string {
  return text
    .replace(/\/Users\/[^/\s"'`]+/g, "/Users/[user]")
    .replace(/\/home\/[^/\s"'`]+/g, "/home/[user]")
    .replace(/C:\\Users\\[^\\\s"'`]+/gi, String.raw`C:\Users\[user]`);
}

/**
 * Deterministic last-mile boundary for text leaving the local workspace.
 * Private keys fail closed; recognized credentials are redacted.
 */
export function sanitizeOutboundText(raw: string): OutboundSanitizeResult {
  if (PRIVATE_KEY_BLOCKS.some((pattern) => pattern.test(raw))) {
    return { allowed: false, reason: "private_key" };
  }

  let text = redact(raw);
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (match, prefix) =>
      typeof prefix === "string" ? `${prefix}[REDACTED]` : "[REDACTED]"
    );
  }
  text = redactHomePaths(text);
  return { allowed: true, text };
}
