# 更新记录 / Changelog

## 0.3.0（未发布 / unreleased）

- 版本号：启动日志和 MCP 握手里报的都是 `package.json` 的版本；附带的服务报 javmem-mcp 的版本（记在 `mcp/package.json`，由 `scripts/vendor-mcp.mjs` 写入）。
- 配置写错会提示：同一个 Bot 既写 `memory` 又写 `memv2`/`javis` 时只挂 `memory` 一组（0.2.2 是两组都挂）；丢掉的设置、不认识的字段、找不到的文件、Tobs 里没有的 Bot 编号，各记一行警告，只写键名和路径。
- 兼容范围放宽到 DSH 1.0 以下（`engines.dsh` 和 `@deepseek-ai/dsh-tools` 的 peer 范围），每天用 DSH 的 latest 和 next 各跑一遍测试。
- 第一次发 npm（包名 `javmem-dsh-plugin`），GitHub Release 附安装包 `javmem-dsh-plugin.tgz`；附带 javmem-mcp 0.3.0。
- 新工具 `memory_status`：这个 Bot 挂了哪些记忆工具、每个库连不连得上、令牌能不能用、文件在不在、配置提醒、最近几次调用的耗时；不显示令牌和记忆内容（`statusTool: false` 可关）。
- README：开头一句话说清是什么，写明适合谁、不适合谁，三种装法（npm、Release 安装包、git）；英文版 `README.en.md` 和中文版内容对等；npm、CI、许可证徽章。
- 按名字列 Bot、用模板生成路径：`bots` 的键可以写 Bot 名字（插件到 Tobs 里找编号）；`template` 里的 `{name}`、`{slug}` 换成 Bot 的名字和编号。旧写法照样能用。
- 常驻进程：每个 Bot 的每个库一个常驻 MCP 进程，空闲 5 分钟退出，最多同时 8 个，进程中途退出就换新的再试一次。连续调用平均从 54.6 毫秒降到 4.2 毫秒一次（`scripts/bench-calls.mjs`）。`keepAlive: false` 回到每次新起进程。
- 演示数据：`env` 里写 `MEMV2_URL: 'demo'`、`JAVIS_URL: 'demo'`，Bot 就从附带的虚构数据回答，不要令牌；`memory_status` 会说明是演示数据；README 配了截图。
- 用法说明：技能 `skills/javmem-memory/SKILL.md` 和前台规则片段 `docs/front-rules.md`（先 recall 再 search、金额以 memv2 为准、名字要对得上），和工具说明一致，测试会核对。
- 零准备模式：列出的 Bot 不写任何库，就用本地库：插件通过 DSH 的会话查询服务只读地把这个 Bot 自己的历史会话（真人私信、网页消息、Bot 的回复）建成本地全文索引，一个 Bot 一个 SQLite 文件，查之前补新对话。不要令牌，不用另搭服务。`backend: 'none'` 回到以前的做法。
- 自动召回（可选，默认关）：`autoRecall` 打开后，每一步之前只要有真人发言，就用这个 Bot 自己的 recall 取几条，作为带 `javmem-recall` 标记的用户消息插进这一步，不放进系统提示，写明是资料不是指令。
- 给其他插件的接口：`ctx.javmem`（`bots`、`recall`、`search`、`ask`、`status`），按 Bot 编号直接查这个 Bot 自己的记忆，不经过模型；附例子 `examples/use-javmem-service.mjs`。

English:

- Versions: the start line in the log and the MCP handshake carry `package.json`'s version; the bundled servers report javmem-mcp's (recorded in `mcp/package.json` by `scripts/vendor-mcp.mjs`).
- Config mistakes are named: a Bot given both `memory` and `memv2`/`javis` gets the `memory` tools only (0.2.2 registered both); dropped settings, unknown fields, missing files and Bot ids Tobs does not know each get one warning line, with key names and paths only.
- DSH range widened to below 1.0 (`engines.dsh` and the `@deepseek-ai/dsh-tools` peer range); a daily workflow tests against DSH's latest and next.
- First npm release (`javmem-dsh-plugin`), a GitHub Release asset `javmem-dsh-plugin.tgz`; bundles javmem-mcp 0.3.0.
- New tool `memory_status`: the Bot's memory tools, whether each store answers and takes its token, its files, its config warnings and its last calls' times; no token and no memory text (`statusTool: false` turns it off).
- README: a one-line pitch, who it is for and not for, three ways to install (npm, Release tarball, git); `README.en.md` in English with the same content as the Chinese one; npm, CI and licence badges.
- Bots by name, paths from a template: a key in `bots` may be a Bot name (the plugin finds its id in Tobs); `{name}` and `{slug}` in `template` become the Bot's name and id. The old form still works.
- Long-lived processes: one MCP server process per Bot and store, stopped after 5 idle minutes, at most 8 at once, replaced and the call retried once when it dies mid-call. Consecutive calls went from 54.6 ms to 4.2 ms each on average (`scripts/bench-calls.mjs`). `keepAlive: false` goes back to a process per call.
- Demo data: with `MEMV2_URL: 'demo'` and `JAVIS_URL: 'demo'` in `env`, a Bot answers from the bundled made-up data, no token; `memory_status` says it is demo data; the README has a picture.
- Zero-setup mode: a listed Bot that names no store gets the local store: through DSH's session query service the plugin indexes that Bot's own past sessions (Human DMs, web messages, the Bot's replies), read-only, one SQLite file per Bot, adding new messages before a call. No token, no service to set up. `backend: 'none'` restores the old behaviour.
- Auto recall (optional, off by default): with `autoRecall`, before each step in which a Human speaks, the Bot's own recall is asked and its lines join the step as one user-role message of kind `javmem-recall`, never in the system prompt, marked as material, not instructions.
- A service for other plugins: `ctx.javmem` (`bots`, `recall`, `search`, `ask`, `status`) asks a Bot's own memory by its id without a model; example in `examples/use-javmem-service.mjs`.
- Usage notes: the skill `skills/javmem-memory/SKILL.md` and the front-rules snippet `docs/front-rules.md` (recall first, then search; amounts count from memv2; names must match), in line with the tools' guidance, checked by a test.

## 0.2.2

- `VERSION` 从 `package.json` 读；两套工具都写的 Bot 会被提醒；README 的「前提」写成白话。

English: `VERSION` read from `package.json`; a Bot given both tool sets is warned about; plain-language prerequisites.

## 0.2.1

- `@deepseek-ai/dsh-tools` 的 peer 范围给预发布版本单写分支，0.2.1-rc.3 在 npm 和 pnpm 下也能装。

English: explicit prerelease branches in the `@deepseek-ai/dsh-tools` peer range, so 0.2.1-rc.3 installs under npm and pnpm.

## 0.2.0

- 合起来的五个 `memory_*` 工具；修好 CommonJS 服务在本包里起不来的问题。

English: the five combined `memory_*` tools; a fix for the CommonJS servers not starting inside this package.

## 0.1.0

- 给列出的 Tobs Bot 挂 memv2 和 Javis 的只读工具。

English: read-only memv2 and Javis tools for the Tobs Bots you list.
