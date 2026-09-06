# C2C Hardened Security Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the fork for user-wide Codex use without changing the read-only ChatGPT capability boundary.

**Architecture:** Keep one hardened checkout and one user-scoped Skill, while retaining one isolated bridge/OAuth/token set per repository workspace. Public endpoints reveal only protocol-required data; workspace identity is verified locally through the existing loopback-only admin surface and runtime admin token. Security-sensitive transformations are centralized behind reusable helpers so file/search/diff/execution output share one outbound secret boundary.

**Tech Stack:** TypeScript, Node.js >=20, Express 5, MCP SDK 1.30.0, Vitest, pnpm 11.24.0.

**Spec:** `docs/superpowers/specs/2026-09-05-c2c-hardening-design.md`

## Global Constraints

- ChatGPT remains structurally read-only: no write/delete/shell/commit/install/network MCP tools.
- User Skill installation target is `$HOME/.agents/skills/codex-with-chatgpt/SKILL.md`.
- No unattended `git pull`, dependency installation, build, Skill replacement, or restart.
- `@modelcontextprotocol/sdk` is pinned exactly to `1.30.0`.
- All authorization, path, sanitizer, tunnel, and dependency ambiguity fails closed.
- Existing workspace/token isolation, traversal defense, symlink defense, PKCE, token hashing and refresh rotation must remain intact.
- Each behavior change gets a regression test before implementation.

---

### Task 1: Pin dependencies and make Skill updates explicit-only

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `skill/SKILL.md`
- Test: static assertions added to `tests/skill-hardening.test.ts`

**Interfaces:**
- Produces: exact MCP dependency specifier `1.30.0` and a Skill whose normal workflows only *report* updates.

- [ ] **Step 1: Add a failing static regression test**

Create `tests/skill-hardening.test.ts` that reads `package.json`, `pnpm-lock.yaml`, and `skill/SKILL.md` and asserts:

```ts
expect(pkg.dependencies["@modelcontextprotocol/sdk"]).toBe("1.30.0");
expect(skill).toContain("~/.agents/skills/codex-with-chatgpt/SKILL.md");
expect(skill).not.toContain("git stash && git pull --ff-only");
expect(skill).not.toContain("Then run the update workflow below");
```

Also assert that the normal update-check section says an update is reported but not installed unless the user explicitly requests an update.

- [ ] **Step 2: Verify the new test fails on the upstream baseline**

Run: `corepack pnpm test tests/skill-hardening.test.ts`
Expected: FAIL because dependency is `latest`, the Skill uses `~/.codex/skills`, and automatic update text exists.

- [ ] **Step 3: Pin the dependency and lockfile specifier**

Change only the specifier values:

```json
"@modelcontextprotocol/sdk": "1.30.0"
```

Keep the already resolved lockfile package version `1.30.0` unchanged.

- [ ] **Step 4: Harden the Skill update workflow**

Replace the automatic daily update behavior with:

```text
- Run `c2c update-check --json` only to detect availability.
- If an update exists, notify the user and continue the current task on the reviewed installed commit.
- Never run git pull/install/build/restart from the normal update check.
- Run the update workflow only when the user explicitly asks to update C2C.
- A dirty checkout aborts manual update; never auto-stash.
- Reinstall the Skill to ~/.agents/skills/codex-with-chatgpt/SKILL.md.
```

- [ ] **Step 5: Re-run the focused test**

Run: `corepack pnpm test tests/skill-hardening.test.ts`
Expected: PASS.

---

### Task 2: Make OAuth scopes and registration fail closed

**Files:**
- Modify: `src/auth/store.ts`
- Modify: `src/auth/oauth.ts`
- Create: `src/auth/rate-limit.ts`
- Create: `src/auth/client-ip.ts`
- Modify: `src/bridge/server.ts`
- Modify: `tests/oauth.test.ts`

**Interfaces:**
- Produces: `parseRequestedScopes(requested): { ok: true; scopes: string[] } | { ok: false; unsupported: string[] }`.
- Produces: `FixedWindowRateLimiter` and `deriveClientIp(req)`.

- [ ] **Step 1: Add failing OAuth scope tests**

Add tests that request `workspace.read unknown.scope` and assert an OAuth `invalid_scope` error, then request only `workspace.read` and confirm the issued token carries no search/git/execution/offline scopes.

- [ ] **Step 2: Add failing registration-bound tests**

Add tests for:

```text
redirect_uris > 8 -> 400
redirect URI length > 2048 -> 400
registered clients > 32 -> 429/400 deterministic rejection
rapid registration requests above the configured window -> 429
```

Use a separately started bridge for limit tests so the shared test bridge is not exhausted.

- [ ] **Step 3: Add failing forwarded-IP tests**

Verify arbitrary `X-Forwarded-For` does not become pairing/registration identity. Verify a syntactically valid `CF-Connecting-IP` is accepted only through `deriveClientIp` validation; malformed/multi-value headers fall back to the socket address.

- [ ] **Step 4: Implement fail-closed scope parsing**

Replace the current fallback-to-all behavior with:

```ts
export type ScopeParseResult =
  | { ok: true; scopes: string[] }
  | { ok: false; unsupported: string[] };

export function parseRequestedScopes(requested: string | undefined): ScopeParseResult {
  if (!requested?.trim()) return { ok: true, scopes: [...SUPPORTED_SCOPES] };
  const asked = [...new Set(requested.split(/[\s+]+/).filter(Boolean))];
  const unsupported = asked.filter((scope) => !(SUPPORTED_SCOPES as readonly string[]).includes(scope));
  if (unsupported.length > 0) return { ok: false, unsupported };
  return { ok: true, scopes: asked };
}
```

In `/oauth/authorize`, return OAuth `invalid_scope` before creating a pending request.

- [ ] **Step 5: Bound registrations and pending authorization state**

Add constants:

```ts
MAX_REGISTERED_CLIENTS = 32
MAX_REDIRECT_URIS = 8
MAX_REDIRECT_URI_LENGTH = 2048
MAX_PENDING_AUTH_REQUESTS = 64
```

Expose `clientCount()` on `AuthStore`; reject new registrations when full. Cap pending requests after pruning expired entries.

- [ ] **Step 6: Add reusable fixed-window rate limiting**

Implement an in-memory limiter keyed by hardened client identity. Registration should reject above a conservative burst limit (for example 20 requests/minute/IP). Pairing keeps its existing attempt limiter but receives `deriveClientIp(req)` rather than `req.ip`.

- [ ] **Step 7: Remove broad proxy trust**

Do not use `app.set("trust proxy", true)`. `deriveClientIp` validates a single `CF-Connecting-IP` with `node:net.isIP`; otherwise use `req.socket.remoteAddress`.

- [ ] **Step 8: Run focused OAuth tests**

Run: `corepack pnpm test tests/oauth.test.ts tests/pairing.test.ts`
Expected: PASS.

---

### Task 3: Minimize public health while preserving local workspace identity

**Files:**
- Modify: `src/bridge/server.ts`
- Modify: `src/bridge/runtime.ts`
- Modify: `src/process/daemon.ts`
- Modify: `tests/port.test.ts`
- Modify: `tests/runtime.test.ts`

**Interfaces:**
- Public `GET /health` returns only `{ service, status }`.
- Local bridge observation authenticates to `GET /admin/info` using the runtime admin token.

- [ ] **Step 1: Add failing public-health test**

Assert `/health` has exactly `service` and `status` and contains neither `workspaceId` nor `version`.

- [ ] **Step 2: Add failing authenticated local-probe test**

Update runtime tests so a valid runtime state plus matching admin token yields `healthy`, while a wrong admin token yields `unknown` rather than trusting anonymous health.

- [ ] **Step 3: Change public health response**

Return:

```ts
res.json({ service: SERVICE_NAME, status: "ok" });
```

Tunnel readiness continues to validate these two fields only.

- [ ] **Step 4: Split public health probe from local identity probe**

Keep `probeHealth(port)` for anonymous service liveness. Add an authenticated local probe using `/admin/info` with `Authorization: Bearer <runtime.adminToken>` and require returned `workspaceId === expected workspaceId`.

- [ ] **Step 5: Update daemon stop/reuse behavior**

`findBridgeObservation` and `stopBridge` use the authenticated local probe before treating a runtime file as belonging to the current workspace.

- [ ] **Step 6: Run focused runtime/port tests**

Run: `corepack pnpm test tests/runtime.test.ts tests/port.test.ts tests/tunnel.test.ts`
Expected: PASS.

---

### Task 4: Remove untrusted Node regex execution

**Files:**
- Modify: `src/workspace/search.ts`
- Modify: `src/mcp/server.ts`
- Modify: `tests/search.test.ts`
- Modify: `tests/mcp-integration.test.ts`

**Interfaces:**
- Produces deterministic error code `REGEX_ENGINE_UNAVAILABLE` when `regex=true` and ripgrep is unavailable.

- [ ] **Step 1: Add failing Node fallback regex test**

Force `C2C_DISABLE_RG=1`, call `searchWorkspace(..., { regex: true })`, and expect rejection with `REGEX_ENGINE_UNAVAILABLE`.

- [ ] **Step 2: Preserve literal fallback behavior**

Keep existing Node literal search tests unchanged and passing.

- [ ] **Step 3: Remove `new RegExp(opts.query, "i")` from Node fallback**

The Node implementation performs literal case-insensitive matching only. `searchWorkspace` rejects regex mode before entering Node fallback.

- [ ] **Step 4: Map the new error deterministically through MCP**

Do not expose arbitrary exception text; return an MCP error containing `REGEX_ENGINE_UNAVAILABLE` and a short safe message.

- [ ] **Step 5: Run search/MCP tests**

Run: `corepack pnpm test tests/search.test.ts tests/mcp-integration.test.ts`
Expected: PASS.

---

### Task 5: Expand path-based secret protection

**Files:**
- Modify: `src/workspace/ignore.ts`
- Modify: `tests/workspace.test.ts`
- Modify: `tests/git.test.ts`

**Interfaces:**
- Existing `IgnoreRules.isSensitive()` remains the single path-deny policy consumed by read/list/search/git-diff.

- [ ] **Step 1: Add failing sensitive-path tests**

Create representative files and assert denial for:

```text
.docker/config.json
.kube/config
.azure/credentials
.config/gcloud/application_default_credentials.json
.pypirc
terraform.tfstate
prod.tfstate.backup
prod.tfvars
prod.tfvars.json
profile.mobileprovision
```

- [ ] **Step 2: Extend `SENSITIVE_PATTERNS`**

Add the required patterns without weakening existing rules or `.env.example` exception.

- [ ] **Step 3: Extend git-diff regression coverage**

Assert changes to protected Terraform/cloud credential files do not appear in returned diffs.

- [ ] **Step 4: Run workspace/git tests**

Run: `corepack pnpm test tests/workspace.test.ts tests/git.test.ts`
Expected: PASS.

---

### Task 6: Centralize outbound content secret safety

**Files:**
- Create: `src/security/outbound-sanitize.ts`
- Modify: `src/execution/sanitize.ts`
- Modify: `src/mcp/server.ts`
- Modify: `tests/execution-output.test.ts`
- Modify: `tests/mcp-integration.test.ts`

**Interfaces:**
- Produces `sanitizeOutboundText(raw, options?)` returning either safe redacted text or a fail-closed restriction reason.
- Execution output continues applying truncation after shared secret sanitization.

- [ ] **Step 1: Add failing shared-sanitizer tests**

Cover recognized GitHub/OpenAI/Slack/AWS/Google token shapes, key/value assignments, home paths, ordinary non-secret source text, and private-key rejection.

- [ ] **Step 2: Implement shared sanitizer**

Move reusable credential/private-key/home-path rules out of execution-only code. Keep result deterministic:

```ts
type OutboundSanitizeResult =
  | { allowed: true; text: string }
  | { allowed: false; reason: "private_key" };
```

- [ ] **Step 3: Reuse the shared sanitizer in execution output**

`sanitizeExecutionOutput` calls the shared sanitizer first, then applies line/byte truncation. Existing execution-output behavior remains compatible.

- [ ] **Step 4: Apply sanitizer at MCP egress**

Before returning structured results:

```text
read_file.content -> sanitize
search_workspace.matches[].text -> sanitize each line
git_diff.diff -> sanitize
execution_output.text -> already sanitized at storage + retain defense-in-depth
```

Private-key detection in file/search/diff returns an MCP error without any matching content.

- [ ] **Step 5: Add MCP integration regressions**

Create ordinary source files/diffs containing token-like values and assert returned structured/text content contains `[REDACTED]` and never the raw value. Assert a private-key block causes `isError=true` and does not echo key content.

- [ ] **Step 6: Run sanitizer/MCP tests**

Run: `corepack pnpm test tests/execution-output.test.ts tests/mcp-integration.test.ts`
Expected: PASS.

---

### Task 7: Whole-repository verification and fixed-commit review

**Files:**
- Review all changed files against the specification.
- No production changes unless verification reveals a concrete defect.

- [ ] **Step 1: Install exactly from the lockfile**

Run: `corepack pnpm install --frozen-lockfile`
Expected: exit 0 and no lockfile modification.

- [ ] **Step 2: Run full tests**

Run: `corepack pnpm test`
Expected: 0 failed tests.

- [ ] **Step 3: Run typecheck**

Run: `corepack pnpm typecheck`
Expected: exit 0.

- [ ] **Step 4: Run build**

Run: `corepack pnpm build`
Expected: exit 0.

- [ ] **Step 5: Inspect the exact diff**

Confirm:

```text
no MCP mutation tools added
no automatic upstream update remains
no secret-bearing diagnostics exposed remotely
health public payload minimal
OAuth unknown scopes fail closed
registration state bounded
regex Node fallback cannot construct untrusted RegExp
new sensitive paths denied
all MCP text egress crosses shared sanitizer
```

- [ ] **Step 6: Review exact commit SHA**

Record the final SHA and re-run all four verification commands on that exact commit before any merge/completion claim.
