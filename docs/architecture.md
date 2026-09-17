# Architecture

```
             ┌───────────────────────────┐
             │    ChatGPT Web / Sol      │
             │  Reason / Plan / Review   │
             └──────────┬──────────▲─────┘
                        │          │
               MCP      │          │ Computer Use
            Data Plane  │          │ Control Plane
                        ▼          │
             ┌─────────────────────┐
             │      C2C Bridge     │
             │  MCP Server (RO)    │
             │  OAuth AS + PRM     │
             │  Pairing Manager    │
             │  Tunnel Manager     │
             │  Admin API (local)  │
             └──────────┬──────────┘
                        │ read-only / one OAuth audience
                        ▼
             ┌─────────────────────┐
             │   Local Workspace   │
             │ ┌─────┐ ┌─────┐     │
             │ │RepoA│ │RepoB│ ... │
             │ └─────┘ └─────┘     │
             └──────────▲──────────┘
                        │ edit / shell / git / test
             ┌──────────┴──────────┐
             │  Codex Harness      │
             └─────────────────────┘
```

## Principles

- **ChatGPT thinks. Codex works.** The bridge never re-implements a coding harness.
- **Computer Use = control plane**: tiny `[C2C]` state messages (< 1 KB).
- **MCP = data plane**: ChatGPT pulls files/diffs/search results itself.
- **Read-only by design**: no write/exec tools exist in the ChatGPT MCP surface.
- **Workspace is the authorization boundary**: one bridge = one Workspace = one token audience.
- **Repository is the execution identity boundary inside a Workspace**: Git state, diffs and Codex execution records are addressed by stable repository id and are never implicitly merged across sibling repositories.

## Multi-repository model

A Workspace may be:

```text
Workspace
├ Repo A
├ Repo B
├ Repo C
└ Repo D
```

Repository discovery follows fail-safe rules:

1. If the Workspace root itself is a Git repository root, it is the single repository context by default.
2. Otherwise immediate child Git repository roots are discovered automatically, up to the bounded maximum.
3. Nested repositories may be registered explicitly in `.c2c.json`:

```json
{
  "name": "CodeX-Chat-Develop",
  "repositories": ["RepoA", "RepoB", "services/RepoC"]
}
```

Every configured path is canonicalized through the Workspace resolver and must be an actual Git toplevel inside the Workspace. Configuration cannot authorize paths outside the Workspace.

Each repository gets a stable 12-character id derived from its canonical root. The algorithm is intentionally the same as the existing standalone Workspace id, so an existing Repo A keeps the same repository identity after moving under a parent multi-repository Workspace.

`workspace_info` is the discovery point and returns repository id, name, Workspace-relative root, project metadata and Git identity. In a multi-repository Workspace:

- Git tools require an explicit repository selector.
- execution/test tools require an explicit repository selector.
- read/list/search can still operate on the whole already-authorized Workspace, or be explicitly confined to one repository.
- repository-confined paths receive a second containment check, preventing `../RepoB` from a Repo A request.
- every Git/execution response repeats repository identity, preventing state from being mistaken for another repository.

This model leaves room for future cross-repository Goal/Plan/Review orchestration: an orchestration object can hold an ordered set of repository ids while repository-local Task/Evidence/Git/Execution data remains individually addressable.

## Components (src/)

| Module | Responsibility |
| --- | --- |
| `bridge/` | Express app assembly, loopback-only listener, port fallback, runtime state, admin API |
| `mcp/` | McpServer with 9 read-only tools; stateless Streamable HTTP transport; repository selectors are exposed only on read surfaces |
| `auth/` | OAuth 2.1 authorization server: discovery metadata, DCR, authorization-code + PKCE, refresh rotation, revocation. Opaque tokens stored as SHA-256 hashes |
| `pairing/` | PairingCode lifecycle: CSPRNG generation, TTL, attempt limits, IP rate limit, one-time use |
| `workspace/` | Canonical Workspace containment, sensitive-file policy, `.c2cignore`, repository discovery/selection, repository containment, paginated read/list, ripgrep search with Node fallback, Git status/diff |
| `tunnel/` | `TunnelProvider` interface + Cloudflare Quick/Named Tunnel implementations; optional `C2C_TUNNEL_PROTOCOL=auto\|quic\|http2` transport selection |
| `execution/` | JSONL execution records plus optional sanitized command output; repository identity is retained when records belong to a child repository |
| `process/` | Daemon spawn/reuse, health probing, graceful shutdown |
| `cli/` | `c2c` commands; `--json` for Skill automation. Executable-boundary compatibility accepts leftover `-w` on machine-wide commands |
| `config/`, `logger/` | OS-convention state dir, secret-redacting logger |

## Request lifecycles

**MCP call**: ChatGPT → tunnel (HTTPS) → bridge `/mcp` → bearer middleware (401/403) → stateless StreamableHTTP transport → tool handler → optional repository selection → Workspace/repository containment → ignore rules → pagination → outbound sanitizer → JSON result.

**Authorization**: 401 with `WWW-Authenticate: resource_metadata=…` → `/.well-known/oauth-protected-resource/mcp` → AS metadata → DCR → `/oauth/authorize` (HTML pairing page) → pairing code verified → 302 with authorization code → `/oauth/token` (PKCE S256) → access + refresh tokens.

**Ports**: prefer 48765, bind 127.0.0.1 only. On conflict, `/health` identifies whether the occupant is a c2c bridge for the same Workspace (reuse) or not (fall back to an ephemeral port). Configuration follows automatically via the runtime state file; users never need a fixed local port.

**Tunnel**: default is a Cloudflare Quick Tunnel (`cloudflared tunnel --url …`). The URL changes per start, so `c2c doctor` can restart it and tell the Skill to repair that Workspace's ChatGPT connector. A Workspace may instead choose a named hostname once (`c2c tunnel choose --mode named`). Tunnel name, hostname and preference live under the OS state dir (`tunnels/<workspaceId>.json`), never in the application repositories. Named starts use `cloudflared tunnel --url … run <name>` so the public URL stays stable. If named provisioning fails, C2C falls back to Quick Tunnel. If a named tunnel later drops, doctor asks for a Cloudflare re-login (`namedRepair`) instead of rotating the ChatGPT connector. Networks that filter QUIC may set `C2C_TUNNEL_PROTOCOL=http2`; leaving it unset preserves cloudflared's default.
