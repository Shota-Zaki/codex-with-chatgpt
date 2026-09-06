# Codex with ChatGPT

**English** | [简体中文](README.zh-CN.md)

> ChatGPT thinks. Codex works.

## The problem

You already pay for ChatGPT's web subscription. Its reasoning quota sits mostly
idle while Codex burns scarce API tokens on planning and review. This project
uses ChatGPT's web UI as the brain and Codex as the hands — no API key, no
reverse proxy, just the official web app plus a read-only MCP bridge.

## What this is

Turn ChatGPT (web) into the planning and review brain for your Codex coding
sessions while Codex keeps full execution ownership. Your repo is never
uploaded — ChatGPT reads only the files it needs through a secure, OAuth-protected,
**read-only** MCP connection to your local workspace.

## One-prompt install (beginner-friendly)

Don't know git, Node, or terminals? Copy this entire block into your coding
agent (Codex):

```text
Please install and configure my hardened Codex with ChatGPT fork. Handle the
technical work yourself:

1. Check prerequisites: git and Node.js >= 20. Install missing prerequisites
   (Homebrew on macOS, winget on Windows) and install cloudflared if needed.
2. Keep exactly one shared hardened checkout on this computer. If it does not
   exist, clone https://github.com/Shota-Zaki/codex-with-chatgpt to
   ~/codex-with-chatgpt. If it already exists, DO NOT pull or update it
   automatically; keep using the current verified commit unless I explicitly
   ask to update Codex with ChatGPT.
3. Build from the lockfile: in that checkout run
   corepack pnpm install --frozen-lockfile and corepack pnpm build.
4. Install the user Skill: copy skill/SKILL.md to
   ~/.agents/skills/codex-with-chatgpt/SKILL.md (Windows:
   %USERPROFILE%\.agents\skills\codex-with-chatgpt\SKILL.md), then replace the
   "checkout lives at:" placeholder with the actual shared checkout path.
5. Follow the first-time setup workflow in SKILL.md for ONE repository only.
   Never connect a parent directory that contains multiple repositories.
6. Keep each repository's workspace, OAuth/token state, ChatGPT connector, and
   ChatGPT Project separate. Never reuse one repository's credentials for another.
7. Only interrupt me for login, CAPTCHA, 2FA, explicit consent, or the guided
   ChatGPT setup choices defined by the Skill. Give me one action at a time.
8. At the end, show the readiness checklist and confirm the file-read test.
```

**Updates:** the Skill may check whether a newer candidate exists, but it never
updates automatically. It keeps using the current verified commit and only
reports that an update is available. Apply an update only after an explicit
request such as **"Codex with ChatGPTを更新して"**; the hardened update workflow
refuses dirty checkouts and validates the candidate before fast-forwarding.

## Install → setup → use (manual)

1. Keep one shared checkout of this hardened fork on the computer.
2. Copy `skill/SKILL.md` to `~/.agents/skills/codex-with-chatgpt/SKILL.md`
   (Windows: `%USERPROFILE%\.agents\skills\codex-with-chatgpt\SKILL.md`) and set
   its checkout path to that shared checkout.
3. Tell Codex: **"使用 Codex with ChatGPT 完成首次配置。"**
4. After that: **"使用 Codex with ChatGPT，帮我实现 XXX。"**

Do not copy the C2C checkout into each application repository. One repository
must map to one workspace boundary; repositories must not share OAuth/token
state or a ChatGPT Project.

That's the whole manual. You do not need to understand MCP, OAuth, tunnels,
ports, or localhost. Codex handles the setup and should only surface this:

```
Codex with ChatGPT

✓ Current project identified
✓ Workspace Bridge started
✓ Secure connection established
✓ ChatGPT connected
✓ File read test passed

Ready.
```

The only steps that may need your hands: logging into ChatGPT (and Cloudflare if
you choose a stable hostname). A **new repository** also asks you to create one
ChatGPT Project (collection) for that repository, with project-only memory.
Existing repositories keep their legacy long chat unless you explicitly migrate.

### Optional stable hostname

The default public address is temporary and changes when the bridge restarts.
Codex then replaces only that repository's ChatGPT connector with the same
connector name and the new address.

If you have a Cloudflare account and a domain already on Cloudflare, first-time
setup can offer a stable hostname such as `c2c-<project>.example.com`. If you do
not have an account, do not want one, or login fails, the temporary address
continues to work.

Credentials stay in the C2C user-state directory, never in the application repo.

## How it works

```
             ┌───────────────────────────┐
             │       ChatGPT Web         │
             │   Reason / Plan / Review  │
             └──────────┬──────────▲─────┘
                        │          │
               MCP      │          │ In-app browser
              data plane│          │ control plane (<1 KB)
                        ▼          │
             ┌─────────────────────┐
             │      C2C Bridge     │   loopback-only listener
             │  read-only MCP      │   OAuth 2.1 + one-time pairing
             │  OAuth + pairing    │   Cloudflare tunnel
             │  tunnel management  │
             └──────────┬──────────┘
                        │  read-only
                        ▼
             ┌─────────────────────┐          ┌─────────────────────┐
             │   Local workspace   │◀─────────│    Codex Harness    │
             └─────────────────────┘ edit/git │ Shell / Test / Fix  │
                                              └─────────────────────┘
```

- **Control plane (in-app browser):** Codex and ChatGPT exchange tiny structured
  `[C2C]` state messages — `INIT → PLAN → EXECUTED → REVIEW → DONE`. They do not
  paste diffs, logs, or file bodies into the chat.
- **Data plane (MCP):** ChatGPT pulls what it needs through nine read-only tools:
  `workspace_info`, `list_directory`, `read_file`, `search_workspace`,
  `git_status`, `git_diff`, `test_status`, `execution_summary`, and
  `execution_output`.
- **Independent review:** after Codex executes, ChatGPT reads the real git diff
  and released test/build output through MCP instead of trusting a claim that
  "tests passed."

## Hardened security model (short version)

- **Read-only by construction:** the MCP server exposes no write, delete, shell,
  execute, commit, package-install, or arbitrary-network tool.
- **One repository = one boundary:** each repository gets its own workspace,
  OAuth/token state, connector, and ChatGPT Project. Do not use a multi-repo
  parent directory as one workspace.
- **Fail-closed scopes:** unsupported OAuth scopes are rejected; a supported
  subset stays least-privilege.
- **Bounded public registration:** OAuth client registrations, redirect URIs,
  pending authorization requests, and registration attempts are bounded.
- **Anonymous public health:** `/health` exposes only service + status. Local
  workspace identity is read through an admin-token-protected loopback endpoint.
- **Sensitive paths stay blocked:** `.env*`, key material, SSH/cloud credentials,
  Docker/Kubernetes configs, Terraform state/vars and similar files are denied
  (`.env.example` remains readable).
- **Shared outbound secret boundary:** file reads, search matches, git diffs and
  execution output are redacted for common credentials. Private-key blocks fail
  closed and are not returned.
- **Path confinement:** canonical realpath checks block absolute-path, `../`, and
  symlink escapes.
- **Token isolation:** no token → 401; a token for another workspace → 403;
  refresh tokens rotate and persisted tokens are hash-only.
- **No unattended self-update:** normal update checks only report a candidate.
  Explicit updates refuse dirty checkouts and validate the candidate first.

Full threat model: [docs/security.md](docs/security.md)

## Development

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm test
corepack pnpm typecheck

c2c setup           # bridge + public connection + pairing code
c2c sandbox-allow   # allow the C2C local state dir in the Codex sandbox
c2c status / doctor / pair / unpair / logs / stop
```

Requirements: Node.js >= 20, git; public connectivity requires `cloudflared`.

Docs: [architecture](docs/architecture.md) · [protocol](docs/protocol.md) ·
[security](docs/security.md) · [troubleshooting](docs/troubleshooting.md)

## Repository layout

```
src/
  bridge/     loopback HTTP service, port recovery, admin API
  mcp/        nine read-only tools, stateless Streamable HTTP
  auth/       OAuth 2.1 (PKCE, registration, refresh rotation, revocation)
  pairing/    one-time pairing code (CSPRNG, TTL, rate limit)
  workspace/  path confinement, sensitive-file policy, search, git
  tunnel/     TunnelProvider abstraction + Cloudflare tunnel implementations
  execution/  execution records used by the review loop
  process/    daemon lifecycle
  cli/        c2c command line
skill/        Codex Skill (the UX layer)
tests/        unit + integration tests
docs/         architecture / protocol / security / troubleshooting
```

## Status and verification

This repository is a hardened fork. Do not treat a hardening branch or commit as
verified merely because the code was changed. Before deployment, pin a candidate
commit and run the required frozen install, test, typecheck, and build checks on
that exact commit. Merge to `main` only after those checks and review succeed.

**Unofficial community project. Not affiliated with or endorsed by OpenAI.**

## License

[MIT](LICENSE)
