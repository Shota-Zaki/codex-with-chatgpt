import { isIP } from "node:net";
import type { Request } from "express";

function singleHeader(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes(",")) return null;
  return trimmed;
}

/**
 * Derive a rate-limit identity without trusting arbitrary proxy headers.
 * cloudflared connects to the bridge over loopback and supplies one
 * CF-Connecting-IP value; X-Forwarded-For is intentionally ignored.
 */
export function deriveClientIp(req: Request): string {
  const remote = req.socket.remoteAddress ?? "unknown";
  const cfIp = singleHeader(req.headers["cf-connecting-ip"]);
  if (cfIp && isIP(cfIp) !== 0) return cfIp;
  return remote;
}
