import { redact } from "./redact.js";

const PRIVATE_KEY_BLOCKS: RegExp[] = [
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/i,
  /-----BEGIN PGP PRIVATE KEY BLOCK-----/i,
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
  return { allowed: true, text: redactHomePaths(redact(raw)) };
}
