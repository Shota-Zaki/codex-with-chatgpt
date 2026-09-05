# Codex with ChatGPT

[English](README.md) | **简体中文**

> ChatGPT 负责思考，Codex 负责执行。

## 解决什么问题

把 ChatGPT 网页版作为 Codex 编码会话的规划与审查层，同时把所有执行权保留在
Codex。仓库不会整体上传；ChatGPT 通过 OAuth 保护的**只读** MCP 连接按需读取
当前仓库所需的文件、搜索结果、Git diff 和已释放的执行结果。

这是 `Shota-Zaki/codex-with-chatgpt` 的安全强化 fork。不要直接把原始 upstream
作为日常正本，也不要把 C2C 本体复制进每个业务仓库。

## 一段话安装（推荐）

把下面内容交给 Codex：

```text
请安装并配置我的 Hardened Codex with ChatGPT fork，并自行完成技术步骤：

1. 检查 git 和 Node.js >= 20；缺少时再安装，并在需要公网连接时安装 cloudflared。
2. 这台电脑只保留一个共享的 hardened checkout。不存在时从
   https://github.com/Shota-Zaki/codex-with-chatgpt 克隆到
   ~/codex-with-chatgpt；已经存在时不要自动 pull、reset、stash 或更新。
   除非我明确说“Codex with ChatGPTを更新して”，否则继续使用当前已验证 commit。
3. 在共享 checkout 中执行：
   corepack pnpm install --frozen-lockfile
   corepack pnpm build
4. 把 skill/SKILL.md 安装到
   ~/.agents/skills/codex-with-chatgpt/SKILL.md
   Windows 使用：
   %USERPROFILE%\.agents\skills\codex-with-chatgpt\SKILL.md
   并把 Skill 中的 checkout 占位路径替换为这个共享 checkout 的真实路径。
5. 每次只为一个仓库建立一个 workspace。绝对不要把包含多个仓库的父目录作为
   一个 workspace 连接。
6. 每个仓库分别使用自己的 workspace、OAuth/token 状态、ChatGPT connector
   和 ChatGPT Project；禁止跨仓库复用认证边界。
7. 按 SKILL.md 的 first-time setup 流程配置。只有登录、验证码、2FA、明确同意
   或 Skill 定义的手动配置步骤需要我操作时，再一次告诉我一个动作。
8. 完成后给我看状态清单，并确认文件读取测试。
```

## 更新策略

正常的 `update-check` **只检查并报告更新候选，不自动更新**。发现新版本时继续
使用当前已验证 commit。

只有用户明确说 **「Codex with ChatGPTを更新して」** 时才进入更新流程：

1. 检查 checkout 是否 dirty；dirty 就停止，禁止自动 stash/reset/覆盖。
2. fetch 后先检查候选 commit、diff 和依赖变化。
3. 在临时 detached worktree 中执行：
   `corepack pnpm install --frozen-lockfile` → `test` → `typecheck` → `build`。
4. 全部成功后才允许 fast-forward 共享 checkout，并在更新后的 checkout 上再次
   运行同样验证。
5. 验证后再更新 `~/.agents/skills/codex-with-chatgpt/SKILL.md`。

## 安装 → 配置 → 使用（手动版）

1. 电脑上只保留一个 `Shota-Zaki/codex-with-chatgpt` hardened checkout。
2. 复制 `skill/SKILL.md` 到
   `~/.agents/skills/codex-with-chatgpt/SKILL.md`；Windows 为
   `%USERPROFILE%\.agents\skills\codex-with-chatgpt\SKILL.md`。
3. 把 Skill 中的 checkout 路径写成上面的共享 checkout。
4. 在目标仓库里告诉 Codex：**「使用 Codex with ChatGPT 完成首次配置。」**
5. 之后正常说：**「使用 Codex with ChatGPT，帮我实现 XXX。」**

不要在每个仓库里复制一份 C2C。仓库 A 与仓库 B 必须分别拥有自己的 Workspace、
OAuth/token、connector 和 ChatGPT Project。

成功后的用户可见状态应类似：

```
Codex with ChatGPT

✓ 当前项目已识别
✓ Workspace Bridge 已启动
✓ 安全连接已建立
✓ ChatGPT 已连接
✓ 文件读取测试通过

Ready.
```

## 工作原理

```
             ┌───────────────────────────┐
             │      ChatGPT 网页版       │
             │   推理 / 规划 / 审查      │
             └──────────┬──────────▲─────┘
                        │          │
              只读 MCP  │          │ 内置浏览器控制消息
                        ▼          │
             ┌─────────────────────┐
             │      C2C Bridge     │   本机回环监听
             │  只读 MCP           │   OAuth 2.1 + 一次性配对码
             │  OAuth + Pairing    │   Cloudflare 连接
             └──────────┬──────────┘
                        │  只读
                        ▼
             ┌─────────────────────┐          ┌─────────────────────┐
             │     单一仓库        │◀─────────│    Codex Harness    │
             └─────────────────────┘ edit/git │ Shell / 测试 / 修复 │
                                              └─────────────────────┘
```

- **控制面**：Codex 与 ChatGPT 只交换小型 `[C2C]` 状态消息，例如
  `INIT → PLAN → EXECUTED → REVIEW → DONE`；不把文件、diff、日志直接粘贴到聊天。
- **数据面**：ChatGPT 通过九个只读工具读取需要的信息：
  `workspace_info`、`list_directory`、`read_file`、`search_workspace`、
  `git_status`、`git_diff`、`test_status`、`execution_summary`、
  `execution_output`。
- **执行权**：写文件、删除、Shell、执行命令、commit、安装包、任意网络请求等
  MCP 工具不存在，Codex 才负责执行。

## Hardened 安全模型

- **永久只读 MCP**：ChatGPT 侧没有 write/delete/shell/execute/commit/install/
  arbitrary-network 工具。
- **一个仓库 = 一个认证边界**：workspace、OAuth/token、connector、ChatGPT
  Project 分离，禁止多仓库父目录作为一个 workspace。
- **OAuth scope fail closed**：未指定 scope 使用 documented default；全部为支持的
  scope 时只授予请求子集；只要包含未知 scope 就返回 `invalid_scope`。
- **注册有界**：OAuth client 数、redirect URI 数/长度、pending authorization 和
  注册速率都有上限。
- **Client IP 收敛**：只接受单个合法 `CF-Connecting-IP`；不信任
  `X-Forwarded-For`；否则使用 socket remote address。
- **公开 health 匿名**：`/health` 仅返回 service 与 status；workspace identity
  通过本机 loopback + admin token 的内部接口确认。
- **Regex fail closed**：Node fallback 仅支持 literal 搜索；regex 没有 ripgrep 时
  返回 `REGEX_ENGINE_UNAVAILABLE`。
- **敏感路径拒绝**：除了既有 `.env`、密钥、SSH/Cloud 凭证，还拒绝 Docker、
  Kubernetes、Azure、gcloud、Terraform state/vars、mobileprovision 等；
  `.env.example` 仍允许读取。
- **统一 outbound sanitizer**：`read_file`、搜索结果、`git_diff`、执行结果在 MCP
  出口统一脱敏。检测到 private-key block 时不返回正文，直接 fail closed。
- **路径逃逸防护**：绝对路径、`../` 和 symlink escape 继续由 canonical realpath
  边界拒绝。
- **Token 隔离**：无 token 为 401；其他 workspace 的 token 为 403；refresh token
  轮换；持久化 token 只保存 hash。
- **禁止无人值守更新**：更新检查仅报告候选；显式更新也必须先验证候选。

完整威胁模型：[docs/security.md](docs/security.md)

## 开发与最终验证

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build

git status
git diff main...HEAD
```

安全强化分支仅仅“代码已经修改”不代表“验证完成”。部署前必须固定候选 commit，
在该 commit 上执行上述 frozen install / test / typecheck / build，并确认全部 exit 0。
完成独立审查前不要 merge 到 `main`。

## 目录结构

```
src/
  bridge/     本机回环 HTTP 服务、运行时身份、管理 API
  mcp/        九个只读工具、统一 outbound 安全边界
  auth/       OAuth 2.1、PKCE、DCR、scope、rate limit、token rotation
  pairing/    一次性配对码与限速
  workspace/  路径收敛、敏感文件策略、搜索、git
  tunnel/     Cloudflare 连接实现
  execution/  审查闭环使用的执行记录
  process/    daemon 生命周期
  cli/        c2c CLI
skill/        用户 Skill UX 层
tests/        单元与集成测试
docs/         设计、安全、协议、故障排查文档
```

## 状态与声明

这是 Hardened Fork。当前 hardening commit 在完成规定的 fresh 验证前，不应被
描述为“已验证”“安全”或“可合并”。

**非官方社区项目，与 OpenAI 无关联，未获其背书。**

## 许可证

[MIT](LICENSE)
