# C2C Hardened Security Baseline Design

## Status

Approved direction: Hardened Fork (recommended option B).

Base commit: `a9f91cd98df1bc82686f57d5bc2b2993394c93be`

Target branch: `hardening/security-baseline`

## Goal

Turn this fork into the single trusted Codex-with-ChatGPT implementation used across the owner's repositories, while preserving the upstream read-only ChatGPT architecture and reducing supply-chain, authorization, exposure, denial-of-service, and secret-leak risks.

## Non-goals

- Do not give ChatGPT write, delete, shell, package-install, or commit capabilities.
- Do not copy C2C source code into each application repository.
- Do not centralize OAuth tokens across repositories.
- Do not automatically merge or execute upstream updates.
- Do not introduce a new cloud backend.
- Do not change normal project source files solely to support C2C.

## Architecture

One hardened checkout is installed on the workstation and exposed through one user-scoped Codex Skill. Each connected repository remains an independent C2C workspace with its own workspace identity, bridge runtime, OAuth registration, token set, pairing state, and ChatGPT Project/connector.

```text
Shota-Zaki/codex-with-chatgpt
        |
        | hardened checkout
        v
$HOME/.agents/skills/codex-with-chatgpt/SKILL.md
        |
        +--> Repo A / Workspace A / Token A
        +--> Repo B / Workspace B / Token B
        +--> Repo C / Workspace C / Token C
```

The existing read-only MCP boundary remains mandatory. ChatGPT receives only read/search/git/execution-read capabilities and can never directly mutate the workspace.

## Security principles

1. Fail closed on unknown authorization input, path validation failures, sanitizer uncertainty, tunnel validation failures, and dependency/update ambiguity.
2. No unattended upstream code execution.
3. Least privilege per workspace and per OAuth scope.
4. Secrets are protected both by file/path deny rules and outbound content sanitization.
5. Public endpoints expose the minimum metadata required for protocol operation.
6. User-controlled or proxy-supplied network identity is not trusted without an explicit trusted source.
7. Every hardening change requires a regression test that fails before the implementation and passes after it.

## Required changes

### 1. Disable unattended self-update

The installed Skill must not automatically run `git pull`, dependency installation, build, Skill replacement, or bridge restart when an update is detected.

Required behavior:

- `c2c update-check --json` may report that a newer upstream/fork revision exists.
- Normal workflows continue on the currently installed reviewed commit.
- Actual updates run only after an explicit user instruction such as `Codex with ChatGPTを更新して`.
- Manual update workflow must inspect the incoming diff, run dependency/install checks, run tests/typecheck/build, and only then replace the installed version.
- A dirty checkout must not be automatically stashed and overwritten.

### 2. Use the current user Skill location

The maintained installation target is:

```text
$HOME/.agents/skills/codex-with-chatgpt/SKILL.md
```

Windows resolves this under `%USERPROFILE%\.agents\skills\codex-with-chatgpt\SKILL.md`.

The fork must not reinstall itself into `~/.codex/skills` as the primary path.

### 3. Pin the MCP SDK dependency

Replace the floating dependency:

```json
"@modelcontextprotocol/sdk": "latest"
```

with the exact reviewed version currently represented by the lockfile:

```json
"@modelcontextprotocol/sdk": "1.30.0"
```

Continue using a frozen lockfile for installation. Future dependency upgrades are reviewable changes, not implicit resolution changes.

### 4. OAuth scopes fail closed

Unknown or unsupported requested scopes must never cause a full-scope grant.

Required behavior:

- Empty scope request may use the documented default set needed by ChatGPT.
- A request containing only supported scopes receives only those scopes.
- A request containing any unsupported scope is rejected with OAuth `invalid_scope`.
- Refresh token issuance remains conditional on `offline_access`.
- Scope filtering must never escalate privileges.

### 5. Bound dynamic client registration

Protect `/oauth/register` from unbounded state growth.

Required behavior:

- Limit redirect URI count per registration.
- Limit individual redirect URI length.
- Limit client name length using the existing 200-character maximum.
- Enforce a finite maximum number of registered clients per workspace.
- Reject new registrations when the workspace limit is reached.
- Add request rate limiting for registration and authorization pairing attempts.
- Rejections must not disclose token or internal filesystem data.

The implementation may use an in-memory fixed-window limiter because the bridge is a single-process local service and the purpose is abuse resistance, not distributed quota accounting.

### 6. Harden client IP derivation

Do not trust arbitrary `X-Forwarded-For` values.

Required behavior:

- Direct loopback requests derive identity from `socket.remoteAddress`.
- Public Cloudflare traffic may use a validated `CF-Connecting-IP` value.
- Arbitrary `X-Forwarded-For` must not override client identity.
- Pairing and OAuth rate limits use the hardened derived identity.
- Admin API remains loopback-only and continues rejecting proxied requests.

### 7. Minimize `/health` information disclosure

The public health response must not expose workspace identity, filesystem-derived identifiers, or version information.

Required response shape:

```json
{
  "service": "codex-with-chatgpt",
  "status": "ok"
}
```

Tunnel readiness checks must continue to validate service identity and status without needing a workspace ID.

### 8. Disable unsafe Node regex fallback

Regex search is allowed only when the trusted ripgrep engine is available.

Required behavior:

- Literal search continues to work with ripgrep or the Node fallback.
- `regex=true` with ripgrep available continues to work.
- `regex=true` without ripgrep fails closed with a deterministic error such as `REGEX_ENGINE_UNAVAILABLE`.
- The Node fallback must not construct `new RegExp()` from untrusted workspace-search input.

### 9. Expand sensitive-file deny rules

Keep the existing deny-by-default rules and add protection for common local/cloud/deployment credentials and state files, including at minimum:

```text
.docker/config.json
.kube/config
.azure/
.config/gcloud/
.pypirc
terraform.tfstate
terraform.tfstate.*
*.tfstate
*.tfstate.*
*.tfvars
*.tfvars.json
*.mobileprovision
```

`.env.example` remains allowed as in upstream.

### 10. Add a shared outbound secret sanitizer

Secret detection must apply consistently to content leaving the local workspace through MCP, not only command output.

Apply sanitization to:

- `read_file` content
- `search_workspace` matched text
- `git_diff` diff text
- `execution_output` text

At minimum redact recognizable:

- GitHub classic and fine-grained token prefixes
- OpenAI-style API keys
- Slack token prefixes
- AWS access key IDs
- Google API keys
- common `api_key`, `secret`, `password`, `passwd`, and `authorization` assignments
- home-directory usernames in emitted paths where already supported

Private-key blocks remain hard-rejected for execution output. For ordinary file/diff/search content, a detected private-key block must fail closed rather than returning the block.

The sanitizer must preserve ordinary source code whenever no secret signature is detected.

### 11. Preserve the read-only MCP capability surface

The MCP server must continue to expose only these classes of operations:

- workspace metadata
- directory listing
- file reading
- workspace search
- git status
- git diff
- test/execution status
- sanitized execution output

No write-file, delete-file, shell, git-commit, package-install, process-execution, or arbitrary network-request MCP tool may be added.

## Error handling

Security-sensitive failures use deterministic, non-secret-bearing errors. Security checks fail closed. Internal exception messages that may contain host paths or credentials must not be exposed directly to remote clients without sanitization.

The existing CLI may keep more detailed local diagnostics when those diagnostics pass logger redaction.

## Testing strategy

Use TDD for every behavior change. Required regression coverage includes:

1. unsupported OAuth scope -> `invalid_scope`
2. supported subset -> no scope escalation
3. registration redirect-count limit
4. registration URI-length limit
5. registration client-count limit
6. registration rate-limit rejection
7. spoofed `X-Forwarded-For` does not control pairing identity
8. valid Cloudflare client IP can be derived only from validated input
9. `/health` omits workspace ID and version
10. literal Node fallback search still works
11. Node fallback regex search is rejected
12. newly protected credential/state paths are denied
13. `read_file` redacts recognized secrets
14. `search_workspace` redacts recognized secrets
15. `git_diff` redacts recognized secrets
16. private-key content fails closed
17. execution output keeps its existing secret protections
18. ChatGPT MCP tool list still has no mutation/shell tools
19. cross-workspace token remains 403
20. path traversal remains rejected
21. symlink escape remains rejected

Verification commands before integration:

```text
corepack pnpm install --frozen-lockfile
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
```

A completion claim requires fresh successful output from all four commands on the final reviewed commit.

## Upstream sync policy

The fork tracks upstream manually.

Workflow:

1. Fetch upstream changes without merging them into the trusted branch.
2. Review upstream diff and dependency changes.
3. Merge/rebase into a temporary update branch.
4. Run the complete hardening regression suite.
5. Review the final diff against this specification.
6. Merge only after explicit approval.

No scheduled or implicit upstream merge is part of normal C2C execution.

## Rollout across repositories

After the hardened branch is verified and merged:

1. Install one reviewed checkout on the workstation.
2. Install one user-scoped Skill under `$HOME/.agents/skills/codex-with-chatgpt/`.
3. Connect repositories individually as separate workspaces.
4. Keep each workspace's OAuth/pairing/tunnel state separate.
5. Do not modify application repositories unless a repository-specific `.c2cignore` or `.c2c.json` is intentionally required.
6. Existing repositories are onboarded one by one so a mistaken workspace root cannot expose a parent directory containing unrelated projects.

## Acceptance criteria

The hardened fork is acceptable for broad personal use only when all of the following are true on one fixed commit:

- No automatic pull/install/build/update path remains in the default Skill workflow.
- The Skill installs from the current user Skill location.
- MCP SDK is exact-version pinned.
- OAuth scopes fail closed.
- Registration cannot grow without bounds.
- Untrusted forwarded IP headers cannot bypass rate limiting.
- Public health reveals only service/status.
- Regex fallback cannot invoke Node's RegExp engine on untrusted patterns.
- Sensitive-file patterns include the additional credential/state paths.
- Outbound file/search/diff/execution text passes through a shared secret-safety boundary.
- ChatGPT remains structurally read-only.
- Workspace isolation, traversal defense, symlink defense, token hashing, PKCE, refresh rotation, and loopback-only admin behavior remain intact.
- Full tests, typecheck, and build pass on the exact reviewed commit.
