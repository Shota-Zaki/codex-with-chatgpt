# Security Model

## Trust boundaries

1. **Repository workspace root is the smallest authorization boundary.** One bridge
   serves exactly one repository workspace; every access/refresh token is bound to
   `workspace_id`; a token for repository A returns 403 on repository B's bridge.
   Do not connect a parent directory that contains multiple repositories as one
   workspace.
2. **Workspace content is untrusted.** README text, comments, diffs, search results
   and command output may contain prompt injection. MCP stays read-only and returned
   text passes through the shared outbound sanitizer.
3. **Long-lived credentials are not exposed to ChatGPT as user-visible secrets.**
   The in-app browser only needs the one-time pairing code during authorization.
   Access/refresh tokens travel through OAuth endpoints and persisted token records
   contain SHA-256 hashes rather than raw token values.
4. **Local bridge identity and public liveness are separate.** Public `/health`
   returns only `{ "service": "c2c-bridge", "status": "ok" }`. Workspace identity
   is read only through loopback `/admin/info` with the random runtime admin token.
5. **One machine uses one shared hardened checkout.** The C2C implementation is not
   copied into application repositories. Each repository still has its own
   workspace/OAuth-token/connector/ChatGPT-Project boundary.

## Threat model → mitigations

| Threat | Mitigation |
| --- | --- |
| MCP URL leaks | URL alone is insufficient: every `/mcp` request requires a valid bearer token (401 without, 403 for a token bound to another workspace) |
| Pairing-code brute force | CSPRNG code, short TTL, attempt cap, one-time use and fixed-window rate limiting keyed by the hardened client-IP derivation |
| Spoofed client IP | A single syntactically valid `CF-Connecting-IP` may be used; `X-Forwarded-For` is never trusted; otherwise `socket.remoteAddress` is used |
| OAuth privilege escalation | Missing scope uses the documented default; supported-only requests receive exactly the requested subset; any unknown scope returns OAuth `invalid_scope` |
| OAuth registration state exhaustion | Registered clients, redirect URI count/length and pending authorization requests are bounded; `/oauth/register` also has a fixed-window per-client-IP rate limit |
| OAuth CSRF | `state` is round-tripped; authorization requests are server-side records keyed by random ids |
| Code interception | PKCE S256 is mandatory; authorization codes are one-time, short-lived and bound to client + redirect URI |
| Token theft | Opaque high-entropy tokens; persisted records contain SHA-256 hashes; access tokens expire; refresh tokens rotate on every use; old refresh-token replay fails; revocation is supported |
| Workspace traversal | Canonical realpath containment rejects absolute escape, `..`, null bytes and platform-specific path tricks |
| Symlink escape | Canonicalization resolves symlinks before containment checks for files and directories |
| Sensitive files | Resolve/list/search/git-diff boundaries deny `.env*` (except `.env.example`), key material, SSH/cloud credentials, Docker/Kubernetes configs, Azure/gcloud state, `.pypirc`, Terraform state/vars, mobile provisioning files and other configured sensitive paths |
| Regex ReDoS in Node fallback | Node fallback performs literal search only. Regex requires ripgrep; without a working ripgrep engine the request fails with `REGEX_ENGINE_UNAVAILABLE` |
| Outbound secret leakage | `read_file`, search matches, `git_diff` and execution output share the same outbound sanitizer for recognized GitHub/OpenAI/Slack/AWS/Google credentials, common secret assignments, C2C secrets and home paths |
| Private-key leakage | Any returned text containing a `-----BEGIN ... PRIVATE KEY-----` block fails closed; the private-key body is not returned |
| Oversized file / diff DoS | `read_file` caps response size; `git_diff` paginates with hard byte caps; search caps matches and file size |
| Tunnel exposure | Bridge binds only to loopback; public exposure is via HTTPS tunnel. `/health` is anonymous and contains no workspace id, version or filesystem-derived data |
| Admin API abuse | Admin API is loopback-only + random admin token stored in a restricted runtime file; requests carrying proxy headers are rejected; unauthenticated requests receive 404 |
| Public exception leakage | Unhandled parser/route errors return generic JSON and do not echo stack traces, filesystem paths or raw exception text |
| Log credential leakage | Logger sanitization redacts C2C bearer/pairing secrets and recognized outbound secret forms before writing |
| Execution output leak | Codex may nominate test/build/lint/typecheck output; the shared sanitizer redacts recognized secrets, truncates output and refuses private-key blocks. Restricted items expose metadata only. ChatGPT cannot execute commands |
| Unattended supply-chain update | Normal update checks report only. No automatic pull/install/build/restart and no automatic stash/reset. An explicit update request must inspect candidate diffs/dependencies and pass frozen install + test + typecheck + build before fast-forwarding |
| Prompt injection to mutation | MCP exposes no write/delete/shell/execute/commit/package-install/arbitrary-network tool, so workspace text cannot grant those capabilities |

## OAuth bounds

Current hardening baseline:

- `MAX_REGISTERED_CLIENTS = 32`
- `MAX_REDIRECT_URIS = 8`
- `MAX_REDIRECT_URI_LENGTH = 2048`
- `MAX_PENDING_AUTH_REQUESTS = 64`
- Dynamic registration rate limit: fixed-window, per derived client IP

Scopes:

- `workspace.read`
- `workspace.search`
- `git.read`
- `execution.read`
- `offline_access`

Tool handlers enforce scopes individually with `INSUFFICIENT_SCOPE`.

## Public health vs local identity

Public liveness:

```json
{
  "service": "c2c-bridge",
  "status": "ok"
}
```

It intentionally contains no `workspaceId`, version, workspace name/root or
filesystem-derived information.

Daemon reuse and stop decisions do **not** infer workspace identity from public
health. The local runtime record contains the workspace id, process information,
port and random admin token. C2C first checks liveness, then calls loopback
`/admin/info` with that admin token and accepts the bridge only when the returned
workspace id matches the requested workspace.

## Sensitive outbound content

The shared outbound sanitizer is a final text boundary for MCP data. It is applied
at the MCP structured-output boundary, so `read_file`, search results, git diffs and
execution output cannot bypass it merely because they originate from different
modules.

Recognized secret categories include:

- GitHub personal/access tokens
- OpenAI API keys
- Slack tokens
- AWS access key IDs
- Google API keys
- common assignments such as `api_key`, `secret`, `password`, `passwd`,
  `authorization` and `token`
- C2C bearer/pairing secrets
- home-directory usernames/paths

Private-key material is stricter than redaction: the entire outbound response is
withheld with a safe error rather than returning a partially redacted key block.

## Storage

State lives under the OS-convention app directory
(`~/Library/Application Support/codex-with-chatgpt` on macOS and
`%LOCALAPPDATA%\codex-with-chatgpt` on Windows), not inside application
repositories. Named-hostname preference and tunnel metadata also live in that
state directory.

Persisted OAuth access/refresh records store token hashes, not raw bearer token
values. The runtime admin token is local process-control material and is kept in a
restricted runtime state file.

## What ChatGPT can never do through C2C MCP

The MCP server intentionally does not register tools for:

- writing files
- deleting files
- running shell commands
- arbitrary command execution
- committing Git changes
- installing packages
- arbitrary outbound network requests

These capabilities are reserved to Codex's execution harness and are not part of
the ChatGPT MCP surface.

## Update trust boundary

Normal `c2c update-check` is informational. The installed verified checkout remains
unchanged even when a newer candidate exists.

Only an explicit user request to update may enter the hardened update workflow.
That workflow must:

1. stop when the shared checkout is dirty;
2. never automatically stash/reset/discard local changes;
3. inspect candidate commits, overall diff and dependency diff;
4. validate the candidate in an isolated worktree with
   `corepack pnpm install --frozen-lockfile`, test, typecheck and build;
5. fast-forward only after validation;
6. repeat the same verification on the updated checkout;
7. install the Skill under `~/.agents/skills/codex-with-chatgpt/SKILL.md`
   (Windows: `%USERPROFILE%\.agents\skills\codex-with-chatgpt\SKILL.md`) only
   after the verified update.

A hardening commit is not considered verified solely because these controls exist
in source. Deployment still requires the prescribed fresh validation on the exact
candidate commit.
