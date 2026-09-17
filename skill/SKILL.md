---
name: codex-with-chatgpt
description: >
  Use ChatGPT (web) as the planning and review brain for Codex coding sessions,
  while Codex keeps full execution ownership. Use when the user says
  "Codex with ChatGPTを使って ..." / "Codex with ChatGPTを初回設定して" /
  "ChatGPTで計画して", when they ask to connect ChatGPT to the current
  workspace, disconnect it, or run a task through the ChatGPT planning loop.
---

# Codex with ChatGPT

ChatGPT thinks. Codex works.

Codex owns editing, shell, Git mutation, tests, build and recovery. ChatGPT owns
reasoning, planning, review and debug strategy. The C2C Bridge gives ChatGPT a
read-only MCP view of the authorized Workspace. Never turn the ChatGPT MCP into
an execution surface.

## Golden rules

1. **Never paste repository files, diffs or logs into ChatGPT.** ChatGPT reads
   them through the C2C connector. Codex executes changes locally.
2. **Never expose C2C internals unless required by the guided manual setup.**
   User-facing wording is「ChatGPTへ接続 / 安全な接続 / ペアリング」. Do not teach
   the user to handle raw OAuth tokens, ports, localhost URLs or PKCE details.
3. **The pairing code is the only credential that may be typed into a browser.**
   Never read/copy OAuth tokens, cookies or browser session storage. Pairing
   codes are one-time and short-lived: mint a fresh code only when the ChatGPT
   Authorize/pairing form is visible, then use it immediately.
4. Before the first ChatGPT connection on a machine, run `c2c prefs --json`.
   - `setupMode` missing: show exactly `setupChoicePrompt`, wait for「1」or「2」,
     then `c2c prefs set --setup-mode auto|manual --json`. Never guess.
   - `manual`: use **Guided manual ChatGPT setup** from the start.
   - `auto`: use the in-app browser; after two explicit failures of the same
     settings step after repair, fall back to the guided manual flow.
   - browser/js timeout, loading/generating, login, 2FA or CAPTCHA waiting is
     not a settings-step failure.
   - `developerModeEnabled: true`: skip the Developer Mode page until a create
     attempt explicitly requires it.
5. **Use the built-in in-app browser (iab) for ChatGPT.** Reuse one ChatGPT tab,
   keep it foreground, `markHandoff()` while waiting and `markDeliverable()`
   after the working C2C chat is established. Never use Computer Use or a
   normal external browser for ChatGPT. Cloudflare login is the only routine
   exception. If the user explicitly accepts impact to their own browser, that
   explicit consent may override this rule for ChatGPT.
6. `c2c session -w <ws> --json` → `conversation.mode` is the only conversation
   mode switch.
   - `long-chat`: one saved ChatGPT conversation per Workspace.
   - `project`: one ChatGPT Project per Workspace; the same Codex conversation
     reuses its saved chat URL, while a new Codex conversation creates a new
     chat from that Project collection.
   Each Workspace has one connector. Never silently bind another Workspace's
   connector or Project.
7. Run `c2c sandbox-allow --json` after install/setup. It is machine-wide and
   must not receive `-w`. If it fails with EPERM/Operation not permitted,
   request elevation and retry once.
8. **Doctor gate.** Run `c2c doctor -w <ws> --json` before opening/sending C2C
   messages. Do not send INIT/EXECUTED while bridge/MCP/tunnel is unhealthy.
   `namedRepair.needed` and `chatgptRepair.needed` have dedicated repair flows.
   An uncertain bridge state is not permission to start a second bridge or
   delete the connector.
9. Use one shared hardened C2C checkout per machine. Never copy C2C source or
   the Skill into application repositories.
10. **Workspace is the authorization boundary; Repository is the Git/execution
    identity boundary inside it.** A Workspace may contain one repository or
    multiple repositories. Multi-repository Workspaces are allowed. Never let a
    Repository selector escape the Workspace, never mix Git/Test/Execution
    state across Repository IDs, and never reuse OAuth/token/Project material
    across different Workspace boundaries.
11. **Never update automatically.** Normal update checks report only. Never
    auto-pull, auto-install, auto-stash, reset or discard local changes. An
    explicit update request must inspect and verify the candidate first.

## In-app browser (ChatGPT)

Use the `control-in-app-browser` Skill. Once per Codex session, initialize the
browser runtime and reuse `agent.browsers.get("iab")`.

- Keep one ChatGPT tab; use `goto` instead of opening new tabs.
- Allowed fixed URLs:
  - Developer Mode: `https://chatgpt.com/#settings/Security`
  - Plugins hub: `https://chatgpt.com/plugins`
  - Add connector: `https://chatgpt.com/plugins#settings/Connectors?create-connector=true&redirectAfter=%2Fplugins`
  - saved conversation URL from the current Workspace/session
  - saved Project collection URL from the current Workspace/session
  - `https://chatgpt.com/` only for a new `long-chat` conversation
- Never click Reconnect/Refresh on a connector whose public address changed.
  Delete only this Workspace's connector, then recreate the same connector name
  with the new Server URL.
- Connected/authorize success/pairing accepted is sufficient; do not wait for a
  tool-count badge. Verify by calling `workspace_info` in the actual C2C chat.
- After sending a ChatGPT message, poll cheaply every 20–30 seconds rather than
  holding a long browser wait. A browser timeout is not a lost task: reclaim the
  same tab and inspect the page before sending anything again.
- If a Project collection shows only Retry, use Retry once in the same tab, then
  open the last working chat through its Project link. Do not write waiting
  checkpoints until the message is visibly submitted.
- A Work conversation is not a C2C Chat conversation. If the Chat/Work switcher
  shows Work, open a new Chat and HANDOFF instead of continuing in Work.

## Locations and command scope

- Shared checkout: `<ACTUAL_CHECKOUT_PATH>` (installer/update replaces this in
  the installed Skill).
- Installed Skill: `~/.agents/skills/codex-with-chatgpt/SKILL.md`; Windows:
  `%USERPROFILE%\.agents\skills\codex-with-chatgpt\SKILL.md`.
- Run `node "<checkout>/bin/c2c.js" <command>` or the globally linked `c2c`.
- If dependencies/build output are absent:
  `corepack pnpm install --frozen-lockfile && corepack pnpm build`.

Workspace-scoped commands receive `-w <workspace root>`. The Workspace root is
an approved authorization boundary, **not necessarily one Git repository**.
It may be:

```text
Workspace
├ RepoA
├ RepoB
└ services/RepoC
```

If the Workspace root itself is not a Git repository, immediate child Git roots
are discovered. For nested repositories or to make membership explicit, use:

```json
{
  "repositories": ["RepoA", "RepoB", "services/RepoC"]
}
```

Machine-wide commands intentionally do not need `-w`: `update-check`,
`sandbox-allow`, `prefs`, and `tunnel login`. The executable accepts a leftover
`-w` for compatibility, but new Skill instructions must omit it.

## Daily update check

At the start of a workflow:

1. `c2c update-check --json`
2. `c2c sandbox-allow --json`

`updateAvailable: false` → continue silently. `true` → report only:

`Codex with ChatGPT に更新候補があります。現在は検証済みCommitのまま続行します。更新する場合は「Codex with ChatGPTを更新して」と指示してください。`

Do not pull/install/build/restart from the normal update check.

## Explicit manual update

Only when the user explicitly asks to update C2C:

1. In the shared hardened checkout, `git status --porcelain`. If dirty, stop;
   never stash/reset/discard automatically.
2. `git fetch --all --prune`. Candidate must be the configured Hardened Fork
   branch, never the original upstream directly.
3. Inspect `git log --oneline HEAD..<candidate>`, `git diff --stat`, and the
   `package.json`/lockfile diff. If HEAD is not an ancestor, stop for review.
4. Create a temporary detached worktree and run exactly:
   - `corepack pnpm install --frozen-lockfile`
   - `corepack pnpm test`
   - `corepack pnpm typecheck`
   - `corepack pnpm build`
5. All must exit 0 before `git merge --ff-only <candidate>` in the verified
   checkout. Re-run the same four checks after fast-forward.
6. Reinstall `skill/SKILL.md` only after verification and restore the actual
   checkout-path placeholder in the installed copy.
7. `c2c sandbox-allow --json`, `c2c restart -w <workspace>`, and
   `c2c update-check --force --json`.
8. Report the new verified commit SHA. The new Skill applies from the next
   Codex session.

## Connection choice (once per Workspace)

Before first setup/tunnel start:

1. `c2c tunnel status -w <ws> --json`.
2. `needsChoice: false` → continue.
3. `needsChoice: true` → show exactly `userPrompt` and wait.
   - temporary address → `c2c tunnel choose -w <ws> --mode quick --json`
   - fixed domain → show `loginPrompt`, then
     `c2c tunnel choose -w <ws> --mode named --zone <domain> --json`
4. If named setup returns `fallback: true`, show `userMessage` and continue on
   temporary addressing. Never store tunnel credentials in the Workspace.
5. If QUIC is filtered/unstable, the runtime may be started with
   `C2C_TUNNEL_PROTOCOL=http2`. Supported explicit values are `auto`, `quic`,
   and `http2`; unset preserves cloudflared's default.

## First-time setup

1. Check Node >=20 and `cloudflared`; install cloudflared yourself when missing
   (`brew install cloudflared` / `winget install Cloudflare.cloudflared`).
2. Ensure the shared C2C checkout has dependencies/build output.
3. Run `c2c sandbox-allow --json`, **Connection choice**, then
   `c2c setup -w <ws> --json`. Keep `mcpUrl`, `workspaceName`, `connectorName`.
   Do **not** rely on a pairing code minted before the Authorize form is ready.
4. Run `c2c prefs --json`; follow the saved setup mode.
5. In the one IAB tab:
   - enable Developer Mode only when needed;
   - delete only an existing connector with the exact `connectorName`;
   - open the add-connector URL and create the same name with:
     - Description: `Securely connect ChatGPT to the current Codex workspace for planning and review.`
     - Server URL: current `mcpUrl`
     - Authentication: OAuth
   - click Connect/Authorize. **Only after the pairing form is visible**, run
     `c2c pair -w <ws> --json` and type that fresh pairing code immediately.
6. Open the first C2C chat per **Conversation management**. Send the boot prompt
   from `docs/protocol.md`, then ask the exact connector to call
   `workspace_info`. Verify `workspaceName` and, when relevant, the expected
   repository list/IDs before saving the chat URL.
7. Report only:

```text
Codex with ChatGPT

✓ 現在のプロジェクトを確認
✓ Workspace Bridgeを起動
✓ 安全な接続を確立
✓ ChatGPTへ接続
✓ ファイル読み取りテスト成功

準備完了
```

## Guided manual ChatGPT setup

Use this when `setupMode=manual` or after two explicit automatic settings-step
failures. Keep local C2C state; do not silently switch to Codex-only mode.
Guide one action at a time and wait for「完了」between actions:

1. If needed, open Developer Mode settings and enable it; record with
   `c2c prefs set --developer-mode --json`.
2. Open Plugins and delete only the exact `connectorName` if it exists.
3. Open the add-connector URL and create the exact connector with current
   `mcpUrl`, OAuth, and the standard description.
4. Ask the user to click Connect/Authorize. When the pairing form is visible,
   run `c2c pair -w <ws> --json` and give only that fresh code.
5. After Connected, resume verification in the real C2C chat with
   `workspace_info`.

## Conversation management

`c2c session -w <ws> --json` returns `{ session, conversation }`.

### long-chat

- Reuse `conversation.chatUrl` when valid.
- Save only after boot + `workspace_info` names the expected Workspace:
  `c2c session set -w <ws> --mode long-chat --url <url> --title "C2C <workspace>"`.
- After protocol transitions, update task/iteration/state/checkpoint metadata;
  never store logs or diffs in checkpoint fields.
- Switch chats only on explicit user request, visible lag, Work-mode mismatch,
  404, or failed connector rebinding. New chat → boot → HANDOFF →
  `workspace_info` → save URL.

### project

One ChatGPT Project per Workspace. A multi-repository Workspace still uses one
Project and one connector because OAuth authorization is Workspace-scoped;
repository identity is carried inside MCP results.

- Same Codex conversation → reuse this thread's saved ChatGPT chat URL.
- New Codex conversation → open `conversation.projectUrl` and create a new chat
  from that collection, then boot/HANDOFF/`workspace_info`.
- Different Workspace → different Project/connector.
- Never upload the repositories as Project sources; never use Share.

### Bind Project

Ask the user to create a Project named for `workspaceName` with project-only
memory. When its collection page is open, save its URL with `c2c session set`.
In Project settings, keep project-only memory, no library/repository upload,
and use the instructions below.

### Project instructions

```text
You are the planning and review layer for one local Workspace. Codex executes.

This Project is bound only to:
- Workspace name: {{workspace_name}}
- Connector (use this one only): {{connector_name}}

Call workspace_info first when identity matters. A Workspace may contain one or
multiple repositories. Use repositoryId/repositoryRoot from workspace_info to
keep Git state, branch, diff, test/build records and execution output separated.
When multiple repositories exist, pass the intended repository selector to
repository-specific Git/execution tools. Never guess, silently aggregate, or
attribute one repository's state to another.

When you call tools, use only this connector. If workspace_info names a
different Workspace, stop and do not use this Project's memory to continue.
Read code, Git, diffs and released execution output through the connector.
Never ask anyone to paste file bodies, diffs or logs. Never request C2C write,
shell, Git mutation or package-install capabilities; Codex owns execution.

When facts conflict, trust:
1. Current connector data
2. HANDOFF in this chat
3. These instructions
4. Project memory

On HANDOFF, re-read current code/state through the connector and resume at
NEXT_EXPECTED_STEP.
```

## Coding workflow

Protocol: INIT → PLAN → EXECUTING → EXECUTED → REVIEW → PLAN/DONE/BLOCKED.
Session-only checkpoint states may additionally include `INIT`,
`PLAN_RECEIVED`, `EXECUTING`, `EXECUTED_LOCAL`, `EXECUTED_SENT`, `DONE`,
`BLOCKED`. Do not invent `STATE: RESUME`; use HANDOFF when changing chats.

0. Run connection choice if still required, then `c2c doctor -w <ws> --json`.
   Complete named/chatgpt repair before continuing.
1. `c2c session -w <ws> --json`, open the correct conversation, then call
   `workspace_info` through the exact connector. Confirm Workspace identity.
   If more than one repository exists, identify the repository/repositories
   relevant to the user's goal by stable `repositoryId` / `repositoryRoot`.
   A cross-repository plan is allowed, but state must remain repository-scoped.
2. Resume from `session.checkpoint` before sending any new INIT:
   - `EXECUTED_SENT` waiting for review → wait/recover chat, do not rerun.
   - `EXECUTED_LOCAL` → record if needed, then send EXECUTED only.
   - `EXECUTING` → continue the current plan or HANDOFF for a restated plan.
   - `PLAN_RECEIVED` → execute it.
   - `INIT` waiting for plan → wait; do not resend INIT.
   - `DONE` → clear checkpoint.
   - `BLOCKED` → surface the reason.
3. For a new task send:

```text
[C2C]
STATE: INIT
TASK_ID: c2c_f81a
ITERATION: 0

GOAL:
<user goal>

INSTRUCTION:
Inspect the connected Workspace through the Codex with ChatGPT connector.
Use workspace_info to identify repositories. Keep repository-specific Git and
execution state separate. Produce a C2C PLAN message.
```

   Save checkpoint `INIT / waitingFor=GPT_PLAN`.
4. Wait for a substantive PLAN with rationale, concrete file/repository targets,
   tests and success criteria. Ask once for expansion if it is a bare one-liner.
5. Codex executes the plan with its own tools. Save `EXECUTING` checkpoint.
6. Record each affected repository separately so MCP history cannot mix them.
   - Single-repository Workspace: existing command remains valid.
   - Multi-repository Workspace: pass the Workspace-relative repository root:

```text
c2c record -w <ws> --repository RepoA --task c2c_f81a --iteration 1 --changed-files "src/a.ts" --tests "27 passed" --exit-status ok
c2c record -w <ws> --repository RepoB --task c2c_f81a --iteration 1 --changed-files "src/b.ts" --tests "build passed" --exit-status ok
```

   If a test/build/lint/typecheck command produced useful output, save it to a
   temp file and include `--command`, `--output-file`, `--exit-code`. Never
   record `.env`, credentials, shell history or unrelated dumps.
7. Send one small EXECUTED control message; do not paste diff/log bodies:

```text
[C2C]
STATE: EXECUTED
TASK_ID: c2c_f81a
ITERATION: 1

RESULT:
Execution finished.

REPOSITORIES:
RepoA, RepoB

TESTS:
See repository-scoped execution records.

Please independently inspect the relevant repositories. Use repository selectors
for git_diff/test_status/execution_summary/execution_output and never combine
sibling repository state implicitly.
```

   Save `EXECUTED_SENT / waitingFor=GPT_REVIEW`.
8. ChatGPT replies DONE / next PLAN / BLOCKED. Loop up to `.c2c.json`
   `maxIterations` (default 12); at the limit ask the user whether to continue.
9. DONE → summarize and clear checkpoint. BLOCKED → preserve reason and surface
   the one user decision if any.

## Disconnect

1. `c2c unpair -w <ws>` revokes this Workspace's tokens.
2. Optionally delete only this Workspace's connector from the Plugins hub.
3. Tell the user: `このプロジェクトに対するChatGPTのアクセスを解除しました。`

## Reconnect after address reclaim

When a temporary public address changed, `chatgptRepair.connectorAction=update`
means Delete + recreate, never Reconnect.

1. Run `c2c doctor -w <ws> --json`. Tell the user exactly
   `chatgptRepair.userMessage`. Ignore any pairing code that doctor happened to
   mint; it may expire before the browser reaches authorization.
2. Using the same IAB tab, delete only `chatgptRepair.connectorName`, then create
   that **same** name at the add-connector URL with `chatgptRepair.mcpUrl` and
   OAuth.
3. Click Connect/Authorize. Only when the pairing form is visible run
   `c2c pair -w <ws> --json` and enter the new code immediately.
4. Once Connected, run doctor again. When the Doctor gate is green, reopen the
   saved chat already used by this Codex thread.
5. **Re-check the actual saved chat:** call `workspace_info` through the exact
   connector and confirm the expected Workspace plus repository identities.
   Doctor being green is not proof that the saved conversation rebound.
6. If the saved chat still fails after the connector was recreated, do not loop
   destructive repair. In project mode, create a new Chat in the same Project;
   in long-chat, switch to a new Chat. Send boot + HANDOFF from the saved
   checkpoint, call `workspace_info`, then replace the saved chat URL only after
   identity succeeds.
7. If the collection page shows only Retry, Retry once in the same tab, then
   follow the last working chat's Project link before creating the recovery chat.

For a named hostname, `namedRepair.needed` means Cloudflare login/repair while
keeping the connector because the public hostname did not change.

## Repair / recovery map

Run `c2c doctor -w <ws> --json` first and obey the Doctor gate.

| Symptom | Action |
| --- | --- |
| Bridge not running | Let doctor start it; do not start duplicate bridges |
| Bridge state uncertain | Do not start/delete anything; inspect/retry later instead of destructive repair |
| Named tunnel needs login | `c2c tunnel login --json`, then doctor; keep connector |
| Temporary address changed | Delete/recreate only this Workspace's connector; pair late; re-check saved chat with `workspace_info` |
| Saved chat still cannot use recreated connector | New Chat in same Project (or long-chat switch) + HANDOFF + `workspace_info`; no repeated connector deletion loop |
| ChatGPT tool call 401 | Authorize again with a fresh late-minted pairing code |
| Pairing rejected/expired | Wait until form is visible, then `c2c pair -w <ws> --json` |
| `REPOSITORY_REQUIRED` | Call `workspace_info`; pass the intended repositoryId/root to Git/execution tools |
| Sensitive Git changes hidden | Expected; ChatGPT gets hidden counts, Codex inspects locally if needed |
| Every new Codex chat cannot write C2C state | `c2c sandbox-allow --json` once |
| cloudflared missing | Install with brew/winget then retry |
| Project collection only shows Retry | Retry once, then open last working chat via its Project link |
| Wrong Project collection | Ask user to open the expected Workspace Project or explicitly choose long-chat |
| Same explicit browser settings step fails twice | Guided manual setup; do not count timeout/login/2FA waiting as failure |

Do not turn recovery into repeated destructive retries. Preserve the last known
working session/checkpoint and continue independent local engineering whenever a
ChatGPT-side issue does not block Codex execution.
