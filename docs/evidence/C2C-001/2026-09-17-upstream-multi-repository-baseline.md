# Work Unit Evidence — upstream audit + multi-repository baseline

Date: 2026-09-17
Branch: `work`
Start SHA: `25afa3709c5d612fe10efc9b993a33209dc7d5ab`
Upstream: `XiaoDuoYa/codex-with-chatgpt@main`
Upstream merge base: `a9f91cd98df1bc82686f57d5bc2b2993394c93be`
Rules: `Shota-Zaki/development-rules` 3.0.0 (`fa23243ab0f5b7c63c32f83f86c2de55dd42bd54`)

## Upstream delta classification

| Upstream commit | Decision | Adaptation |
| --- | --- | --- |
| `230eec1c4f8eeb9972b95245b5b784b9233c69db` Windows background consoles | Adopt / Adapt | `windowsHide: true` adopted for Git, ripgrep, cloudflared detect/provision and tunnel processes. Hardened `workspace/search.ts` retained. CLI-local update-check spawn remains pending because overwriting localized/hardened CLI is not acceptable without verification. |
| `a48d9754` Star History | Not needed | README cosmetic/traffic badge only; no feature, fix, security or compatibility value for Hardened baseline. |
| `860d7bc4407f434c7076e2d2ac719fe45b0d638e` reconnect + sensitive git status | Adapt | Sensitive `git_status` hiding fully adopted with hidden change/conflict counts. Reconnect behavior documented to re-check `workspace_info` and mint pairing late; direct Skill/doctor source adaptation remains pending because both files have Hardened/Japanese divergence and require browser/runtime acceptance. |
| `39c84845f0112fc4531d2b8abb344315fd0a8259` Cloudflare transport protocol | Adopt | Added `C2C_TUNNEL_PROTOCOL=auto|quic|http2`; Quick/Named/provision paths use upstream protocol implementation while retaining `--no-autoupdate`. |
| `8fdd97c1` upstream 0.1.3 version | Adapt | Fork version becomes `0.1.3-hardened.1`; pinned `@modelcontextprotocol/sdk=1.30.0` remains pinned instead of adopting upstream variable dependency behavior. |
| `9663b88753e35c76796c5bce000293e0bd22cd9e` leftover `-w` compatibility | Adapt | Executable boundary strips unused Workspace options for machine-wide commands, avoiding broad replacement of the localized/hardened CLI. |

## Multi-repository implementation

- Added repository registry/selection layer with stable repository ids equal to standalone Workspace ids.
- Workspace remains the OAuth/bridge authorization boundary; repository context cannot widen it.
- Default discovery: Workspace Git root, otherwise bounded immediate child Git roots. Nested repositories may be explicitly registered through `.c2c.json.repositories`.
- Git/execution MCP tools require repository selection when more than one repository exists.
- read/list/search can remain Workspace-wide or be repository-confined.
- Repository-confined requests reject sibling `..` escape after Workspace canonicalization.
- `workspace_info` exposes repository identities/project metadata/Git identity without absolute filesystem roots.
- `git_status`/`git_diff` responses repeat repository identity.
- execution records/output metadata carry repository id/root; repository-scoped output cannot read sibling output.
- historical standalone execution records remain addressable because repository identity uses the existing standalone Workspace-id algorithm.
- ChatGPT MCP tool count and OAuth scopes remain unchanged and read-only.

## Verification state

Completed:

- GitHub history/merge-base comparison confirmed exactly six upstream commits after the common base.
- Source-level compatibility check confirmed the tunnel source files selected for direct adoption were unchanged in the Fork since merge-base.
- Existing hardened Git diff/search/security behavior was compared before adaptation; sensitive diff filtering, literal Node search fallback, outbound sanitizer, OAuth and update policy were retained.
- New targeted tests were authored for repository discovery/selection/confinement/execution separation/sensitive status and tunnel protocol parsing.

Not executed in this environment:

- `corepack pnpm install --frozen-lockfile`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- Windows process acceptance
- Cloudflare Quick/Named tunnel live acceptance
- ChatGPT connector delete/recreate + saved-chat `workspace_info` recovery acceptance

Reason: the available local C2C execution route reported no tunnel-client connection. The same blocker was not repeatedly retried; independent GitHub implementation/audit work continued.

## Remaining acceptance

1. Restore a repository checkout execution path and run frozen install/test/typecheck/build on the exact candidate commit.
2. Resolve any compile/test failures before marking C2C-001/C2C-002 complete.
3. Adapt the upstream late-pairing/reconnect Skill and doctor changes into the localized Hardened Fork, then verify with actual ChatGPT Project/long-chat recovery.
4. Verify the remaining CLI-local Windows `update-check` process does not flash a console; adapt `windowsHide` if needed without regressing Japanese/Hardened CLI behavior.
