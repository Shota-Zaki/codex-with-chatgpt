# Work Unit Evidence — upstream audit + multi-repository baseline

Date: 2026-09-17
Branch: `work`
Start SHA: `25afa3709c5d612fe10efc9b993a33209dc7d5ab`
Upstream: `XiaoDuoYa/codex-with-chatgpt@main`
Upstream head audited: `9663b88753e35c76796c5bce000293e0bd22cd9e`
Upstream merge base: `a9f91cd98df1bc82686f57d5bc2b2993394c93be`
Rules: `Shota-Zaki/development-rules` 3.0.0 (`fa23243ab0f5b7c63c32f83f86c2de55dd42bd54`)

## Upstream delta classification

| Upstream commit | Decision | Result |
| --- | --- | --- |
| `230eec1c4f8eeb9972b95245b5b784b9233c69db` Windows background consoles | Adopt / Adapt | `windowsHide: true` adopted for Git, ripgrep, cloudflared detect/provision and tunnel processes. CLI-local update-check subprocess remains acceptance/potential Adapt because wholesale replacement of localized Hardened CLI was rejected. |
| `a48d9754` Star History | Not needed | README cosmetic/traffic badge only; no feature, fix, security or compatibility value for this Baseline. |
| `860d7bc4407f434c7076e2d2ac719fe45b0d638e` reconnect + sensitive git status | Adapt | Sensitive `git_status` hiding fully adopted with hidden change/conflict counts. Skill now mints pairing only when Authorize form is ready, verifies `workspace_info` in the saved chat after connector recreation and falls back to a new Chat + HANDOFF instead of destructive reconnect loops. Live browser acceptance remains unverified. |
| `39c84845f0112fc4531d2b8abb344315fd0a8259` Cloudflare transport protocol | Adopt | Added `C2C_TUNNEL_PROTOCOL=auto|quic|http2`; Quick/Named/provision paths use protocol selection while retaining `--no-autoupdate`. |
| `8fdd97c1` upstream 0.1.3 version | Adapt | Fork version is `0.1.3-hardened.1`; pinned `@modelcontextprotocol/sdk=1.30.0` remains pinned rather than adopting variable dependency behavior. |
| `9663b88753e35c76796c5bce000293e0bd22cd9e` leftover `-w` compatibility | Adapt | Executable boundary accepts/removes unused Workspace options for machine-wide commands. Skill now instructs omitting `-w` for `update-check`, `sandbox-allow`, `prefs`, `tunnel login`. |

## Multi-repository implementation

- Workspace remains OAuth/token/bridge authorization boundary; Repository Context is Git/Execution identity boundary.
- Added stable repository ids equal to each repository's prior standalone Workspace id.
- Default discovery: Workspace Git root, otherwise bounded immediate-child Git roots. Nested roots may be registered through `.c2c.json.repositories`.
- Repository config is fail-closed: malformed JSON, invalid shape, outside-Workspace path or non-Git root is rejected instead of silently widening/falling back.
- Auto-discovery is bounded to 128 directory candidates and 64 repositories.
- `workspace_info` exposes repository id/name/relative root/project metadata/Git identity without absolute filesystem roots.
- Multi-repository Git/execution MCP calls require an explicit repository selector; sibling state is not implicitly aggregated.
- read/list/search may remain Workspace-wide or be repository-confined. Repository-confined path resolution rejects sibling `..` escape after Workspace canonicalization.
- `git_status` / `git_diff` results repeat repository identity.
- Execution records/output carry repository id/root and repository-scoped reads cannot expose sibling output.
- Existing standalone repository execution history remains attributable after attaching that repository to a parent Workspace because repository identity is stable.
- Ambiguous untagged parent-Workspace legacy records are not guessed into a child repository.
- Skill records affected repositories separately with `c2c record -w <ws> --repository <relative-root> ...` and permits cross-repository plans without combining repository-local evidence.
- ChatGPT MCP tool count and OAuth scopes remain unchanged and read-only; Software Engineering mutation remains Codex-owned.

## Post-implementation hardening review

- Invalid `.c2c.json` repository configuration now fails closed.
- Automatic repository probing has deterministic ordering and bounded candidate count.
- Existing sensitive Git diff filtering, literal-only Node search fallback, outbound sanitizer, OAuth/token protection, path canonicalization and manual verified update policy were retained.
- Skill's former explicit `1 Repository = 1 Workspace` rule and matching Locations text were removed and replaced with the Workspace/Repository boundary model.
- Reconnect guidance was synchronized with upstream's late-pairing and stale-saved-chat recovery behavior without discarding Hardened Fork IAB/manual-fallback/Project/checkpoint safeguards.

## Verification state

Completed:

- Cross-fork history comparison confirmed exactly six upstream commits after the common merge base at the audited upstream head.
- Upstream head was rechecked during the Work Unit and remained `9663b88753e35c76796c5bce000293e0bd22cd9e`.
- Tunnel source files selected for direct adoption were checked against Fork history before adoption.
- Source-level post-implementation review found and corrected fail-open invalid repository config behavior.
- Targeted tests were authored for repository discovery/selection/confinement, execution separation, sensitive status hiding, invalid repository config and tunnel protocol parsing.
- Atomic Git commits were built from known branch tips and applied with non-force fast-forward after rereading the branch tip.

Not executed in this environment:

- `corepack pnpm install --frozen-lockfile`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- Windows console-flash acceptance, especially the localized CLI's update-check subprocess
- Cloudflare Quick/Named live transport acceptance
- ChatGPT connector delete/recreate + fresh late pairing + saved-chat `workspace_info` recovery acceptance
- Project/long-chat recovery acceptance

Reason: the available local C2C execution route reported no tunnel-client connection. The same blocker was not repeatedly retried; independent GitHub audit/implementation work continued.

## Remaining acceptance

1. Restore a repository-checkout execution path and run frozen install/test/typecheck/build on the exact candidate commit.
2. Resolve any compile/test failures before marking upstream integration or Multi-Repository tasks Done.
3. Verify Windows background process behavior and Adapt CLI-local update-check `windowsHide` if required.
4. Verify Quick/Named Cloudflare transport and real ChatGPT connector recreation, saved-chat identity rebind and Project/long-chat HANDOFF recovery.
5. Update Task state from the resulting command/e2e Evidence, then use the verified Baseline for CodeX-Chat-Develop integration.
