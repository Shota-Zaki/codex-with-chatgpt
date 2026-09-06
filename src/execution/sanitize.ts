import { sanitizeOutboundText } from "../security/outbound-sanitize.js";

export const MAX_OUTPUT_BYTES = 64 * 1024;
export const MAX_OUTPUT_LINES = 200;

export type SanitizeResult =
  | { allowed: true; text: string; truncated: boolean }
  | { allowed: false; reason: string };

function truncate(text: string): { text: string; truncated: boolean } {
  const lines = text.split(/\r?\n/);
  let truncated = false;
  let next = text;
  if (lines.length > MAX_OUTPUT_LINES) {
    next = lines.slice(0, MAX_OUTPUT_LINES).join("\n") + "\n…[truncated]";
    truncated = true;
  }
  if (Buffer.byteLength(next, "utf8") > MAX_OUTPUT_BYTES) {
    let cut = next;
    while (Buffer.byteLength(cut, "utf8") > MAX_OUTPUT_BYTES && cut.length > 0) {
      cut = cut.slice(0, Math.floor(cut.length * 0.9));
    }
    next = `${cut}\n…[truncated]`;
    truncated = true;
  }
  return { text: next, truncated };
}

/** Deterministic gate. Codex may nominate output; this decides if ChatGPT may read it. */
export function sanitizeExecutionOutput(raw: string): SanitizeResult {
  const sanitized = sanitizeOutboundText(raw);
  if (!sanitized.allowed) return sanitized;
  const { text, truncated } = truncate(sanitized.text);
  return { allowed: true, text, truncated };
}
