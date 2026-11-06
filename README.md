# javmem-dsh-plugin

DeepSeek Harness（Tobs）插件：给你列出的 Bot 挂上只读的记忆工具，数据来自 memv2（事实记忆）和 Javis（Graphiti 记忆图谱）。不用给每个 Bot 单独接私有 MCP、填卡片、点批准；在配置里加一个 Bot，它从下一个会话起就有记忆。

记忆工具本身来自 [javmem-mcp](https://github.com/xuxiaoxiang0721-tech/javmem-mcp)，已经随包附带在 `mcp/` 里，不用另装。本插件不含 memv2 和 Javis 两个库本身，要你自己先装好。

## 快速开始

1. 准备：DeepSeek Harness 0.2.1 以上（带 Tobs）；memv2 和 Javis 在跑，每个要接记忆的 Bot 有自己的 memv2 只读令牌文件和 Javis 配置文件（格式见 javmem-mcp 的说明）。
2. 安装：在 DSH 网页的插件页里按仓库地址 `https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin` 安装；或者用命令 `dsh plugin --profile web add git+https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin.git`。装好后插件是关着的，不会给任何 Bot 挂工具。
3. 打开：在你的 profile 的 `cordis.patch.yml` 里按 id `javmem` 覆盖这一行，写上 `mode: 'on'` 和要接记忆的 Bot（见下文「配置」）。DSH 读到改动后，这些 Bot 新开的会话就有记忆工具。
4. 自测（可选）：在仓库目录运行 `node test/test-plugin.mjs`，不需要两个库在跑。

## 装上以后 Bot 能用的工具

每个 Bot 二选一：合起来的一个工具（推荐），或者两个库分开的工具。

合起来的工具（配置里写 `memory`）：

| 工具 | 用途 |
|---|---|
| `memory_recall` | 按这一轮的话题取回 memv2 里相关的事实，两个库都记了的标「图库也有」 |
| `memory_search` | 两个库一起查：先列 memv2 的事实（事实、金额以它为准），再列图库里的人和关系、时间线；重复的只列一次，说法不同的并排写出 |
| `memory_search_raw` | 按关键词在两个库的原文里找，同一句话只列一行 |
| `memory_person` | 一个人：图库里他的全部关系，加上 memv2 里关于他的事实，都按时间排 |
| `memory_read` | 给记录号读 memv2 的记录，或给对话号读图库的整段对话 |

分开的工具（配置里写 `memv2`、`javis`）：

| 工具 | 来自 | 用途 |
|---|---|---|
| `memv2_recall` | memv2 | 按这一轮的话题取回相关记忆，适合每轮先查 |
| `memv2_search` | memv2 | 按内容或人名查，带时间和记录号 |
| `memv2_search_raw` | memv2 | 按关键词在原文里找 |
| `memv2_read_record` | memv2 | 按记录号读一条记录的原文 |
| `javis_search_memory` | Javis | 查人和事的关系、事实（只给看核对过原文的） |
| `javis_get_entity` | Javis | 一个人或一件事的全部关系 |
| `javis_find_sessions` | Javis | 按关键词找以前对话的原话 |
| `javis_get_conversation` | Javis | 按对话号读整段对话 |

工具名、说明和参数来自包里附带的 MCP 服务（`mcp/` 目录，复制自 [javmem-mcp](https://github.com/xuxiaoxiang0721-tech/javmem-mcp)），说明是中文，按小模型写得很短。合起来的工具要给每条标上两个库的对照结果时，在 `env` 里设 `MEMORY_LABELS_FILE`（格式见 javmem-mcp 的说明）。

## 怎么工作

- 插件用 Tobs 的按 Bot 钩子（botharness `contributeBotAgentSetup`），给每个列出的 Bot 的前台和它派出的任务挂工具。
- 每次调用都用这个 Bot 自己的设置启动对应的 MCP 服务，问完就结束：memv2 用它的只读客户端令牌文件，Javis 用它的配置文件。所以每个 Bot 能查到的范围，和它的令牌、配置允许的一样。
- 挂工具出错只记日志，不会让 Bot 的会话开不起来。
- 日志（可选）每次调用一行：Bot、工具、耗时、回答长度；不记查询内容和记忆原文。

## 前提

- DeepSeek Harness 0.2.1 以上，装了 Tobs（`@botharness/core`）。
- memv2 的 HTTP 读接口，以及每个 Bot 一个只读客户端令牌（写在文件里）。
- Javis 的 MCP 端点，以及存它令牌的文件；每个 Bot 一个配置文件，写明能看哪些账号（见 javmem-mcp 的说明）。

## 安装

- DSH 网页的插件页里，按仓库地址 `https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin` 或本地路径安装；或者用命令：`dsh plugin --profile web add git+https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin.git`（本地路径也行）。
- 装好后插件是关着的（`mode: 'off'`），不会给任何 Bot 挂工具。

## 配置

在你的 profile 的 `cordis.patch.yml` 里按 id 覆盖这一行：

```yaml
- id: javmem
  config:
    mode: 'on'
    env:
      MEMORY_OWNER: '小明'
      MEMV2_URL: 'http://127.0.0.1:8766'
      JAVIS_URL: 'http://127.0.0.1:8765/mcp'
      MEMORY_LABELS_FILE: 'D:\memory\labels.json'
    bots:
      bot-0123456789abcdef0123456789abcdef:
        name: Alpha
        memory: { MEMV2_TOKEN_FILE: 'D:\memory\tokens\alpha.token', JAVIS_TOKEN_FILE: 'D:\memory\profiles\alpha.env' }
      bot-fedcba9876543210fedcba9876543210:
        name: Beta
        memv2: { MEMV2_TOKEN_FILE: 'D:\memory\tokens\beta.token' }
```

| 字段 | 说明 |
|---|---|
| `mode` | `'on'` 或 `'off'`（加引号，免得被当成是/否） |
| `bots` | 按 Bot 编号列出。编号就是 DSH 主目录下 `botharness/bots/` 里的文件夹名（`bot-` 加 32 位十六进制）。`memory` = 合起来的五个工具（两边的设置都写在里面）；`memv2`、`javis` = 分开的工具，没写的那一组就没有。同一个 Bot 不要既写 `memory` 又写 `memv2`/`javis`。`off: true` 可以先停用某个 Bot |
| `env` | 每次调用都带上的设置，例如 `MEMORY_OWNER`（工具说明里怎么称呼记忆的主人）、`MEMV2_URL`、`JAVIS_URL`、`MEMORY_LABELS_FILE` |
| `configFile` | 可选：改用一个 JSON 文件放上面这些字段，改了自动重读，不用重启 |
| `logFile` | 可选：日志文件路径 |
| `prefix` | 可选：工具名前缀，默认 `memory_`、`memv2_`、`javis_` |
| `servers` | 可选：换成你自己的 `memory-mcp.js`、`memv2-mcp.js`、`javis-mcp.js` 路径 |

只接受 `MEMV2_`、`JAVIS_`、`MEMORY_` 开头的设置；配置里只写路径和设置，不写令牌。

## 和私有 MCP 一起用

同一个 Bot 不要同时挂插件和私有 MCP 两套记忆工具，模型会重复调用。给一个 Bot 打开插件时，同时断开它的私有 MCP。

## 测试

```bash
node test/test-plugin.mjs
```

用假的 DSH 环境和包里的两个服务，不需要 memv2 和 Javis 在跑。

## 更新附带的服务

把新版 `memory-mcp.js`、`memv2-mcp.js`、`javis-mcp.js` 复制进 `mcp/`（`mcp/package.json` 让它们按 CommonJS 运行，别删），再运行 `node scripts/make-catalog.mjs` 生成 `catalog.json`。

## 许可证

待定（发布前由作者确定）。

---

## English summary

A DeepSeek Harness (Tobs) plugin that gives the Bots you list read-only memory tools from memv2 (fact memory) and Javis (Graphiti memory graph), with no per-Bot private MCP card. It hooks Tobs's per-Bot agent setup (`contributeBotAgentSetup`, front desk and Assignments) and registers `memv2_*` and `javis_*` tools whose text comes from the bundled MCP servers (`mcp/`, copied from javmem-mcp). Each call starts the server with that Bot's own token file or profile plus the shared `env`, so each Bot sees what its credentials allow. Install from `https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin` (DSH Plugins page, or `dsh plugin --profile web add git+https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin.git`). It ships with `mode: 'off'`; override the `javmem` row in your profile's `cordis.patch.yml` with `mode`, `env` and `bots` (slugs are the folder names under `<DSH home>/botharness/bots`). Setup errors are logged and never block a session. Tests: `node test/test-plugin.mjs`. License: to be decided.
