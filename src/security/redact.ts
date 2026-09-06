/** Pure credential redaction shared by logs and outbound workspace text. */
const TOKEN_PATTERNS: RegExp[] = [
  /c2c_(?:at|rt|ac|admin)_[A-Za-z0-9_-]+/g,
  /(authorization"?\s*[:=]\s*"?bearer\s+)[^\s"']+/gi,
  /((?:access_token|refresh_token|client_secret|code_verifier|code|token)"?\s*[:=]\s*"?)[A-Za-z0-9._~+/-]{16,}/gi,
  /\b[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}\b/g,
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
];

// Preserve quoted values and adjacent fields while consuming escaped quotes,
// spaces, and a complete existing placeholder. Matching key suffixes preserves
// existing environment-variable handling such as SERVICE_API_KEY=... .
const SECRET_ASSIGNMENT = /((?:api[_-]?key|secret|password|passwd|authorization|token)["']?\s*[:=]\s*)("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\[REDACTED\]|(?:Bearer|Basic)[ \t]+(?:\[REDACTED\]|[^\s,;}\]]+)|[^\s,;}\]]+)/gi;

export function redact(input: string): string {
  let out = input;
  for (const pattern of TOKEN_PATTERNS) {
    out = out.replace(pattern, (_match, prefix: unknown) =>
      typeof prefix === "string" ? `${prefix}[REDACTED]` : "[REDACTED]"
    );
  }
  return out.replace(SECRET_ASSIGNMENT, (_match, prefix: string, value: string) => {
    const quote = value.startsWith('"') && value.endsWith('"')
      ? '"'
      : value.startsWith("'") && value.endsWith("'") ? "'" : "";
    return `${prefix}${quote}[REDACTED]${quote}`;
  });
}
