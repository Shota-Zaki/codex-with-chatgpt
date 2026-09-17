import { describe, expect, it } from "vitest";
import { resolveTunnelProtocol, tunnelProtocolArgs } from "../src/tunnel/protocol.js";

describe("tunnel transport protocol", () => {
  it("keeps cloudflared defaults when unset", () => {
    expect(resolveTunnelProtocol({})).toBeNull();
    expect(resolveTunnelProtocol({ C2C_TUNNEL_PROTOCOL: "  " })).toBeNull();
    expect(tunnelProtocolArgs(null)).toEqual([]);
  });

  it("accepts supported protocol names case-insensitively", () => {
    expect(resolveTunnelProtocol({ C2C_TUNNEL_PROTOCOL: "HTTP2" })).toBe("http2");
    expect(resolveTunnelProtocol({ C2C_TUNNEL_PROTOCOL: " quic " })).toBe("quic");
    expect(resolveTunnelProtocol({ C2C_TUNNEL_PROTOCOL: "auto" })).toBe("auto");
    expect(tunnelProtocolArgs("http2")).toEqual(["--protocol", "http2"]);
  });

  it("rejects unknown transport values instead of silently falling back", () => {
    expect(() => resolveTunnelProtocol({ C2C_TUNNEL_PROTOCOL: "tcp" })).toThrow(
      /C2C_TUNNEL_PROTOCOL must be one of auto, quic, http2/
    );
  });
});
