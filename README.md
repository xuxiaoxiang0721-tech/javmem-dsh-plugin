# javmem-dsh-plugin

中文 | [English](README.en.md)

[![npm](https://img.shields.io/npm/v/javmem-dsh-plugin)](https://www.npmjs.com/package/javmem-dsh-plugin)
[![compat](https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin/actions/workflows/compat.yml/badge.svg)](https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin/actions/workflows/compat.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**装上就有记忆：DeepSeek Harness 里的每个 Tobs Bot 都记得自己和你聊过的话，各记各的，互相看不到。有 memv2 和 Javis 的，还能换成两个记忆库对照着回答。**

在配置里列出一个 Bot，它从下一个会话起就有记忆工具：不用另搭服务，不要令牌，也不用给每个 Bot 单独接私有 MCP、填卡片、点批准。插件只读地把这个 Bot 自己的历史会话建成一个本地全文索引（零准备模式），中文按词也能搜到。想要更强的记忆，可以给 Bot 换成 javmem，也就是 memv2（事实记忆）加 Javis（Graphiti 记忆图谱）这一套，工具名不变。

## 适合谁，不适合谁

适合：

- 用 Tobs 养了好几个 Bot，想让每个 Bot 记得和你聊过什么、而且各记各的人；
- 不想另外搭服务的人：零准备模式装上就能用，数据只在本机；
- 已经在跑 memv2 和 Javis 的人：一个插件代替每个 Bot 一张私有 MCP 卡片，两个库对照着回答；
- 在意记忆不被写乱的人：插件只读，不写 memv2 和 Javis，也不和导入管线抢着写。

不适合：

- 不用 Tobs 的 DSH 用户：插件只给 Tobs 的 Bot 挂工具。想给普通 DSH 会话加记忆，可以看 Hindsight、DSH-Mem0、MemOS 这类插件。
- 想要语义搜索、自动抽取事实的人：零准备模式只按词搜原话；要这些得用 memv2 和 Javis（目前没有公开发布，见「前提」）。

同一套工具也能接到 Claude Code 等 MCP 客户端，用 [javmem-mcp](https://github.com/xuxiaoxiang0721-tech/javmem-mcp) 就行。

## 快速开始

1. **准备**：DeepSeek Harness 0.2.1-rc.3 以上、1.0 以下（带 Tobs），Node 22.5 以上（DSH 自带的 Node 就行）。零准备模式不需要别的。
2. **安装**，三种写法任选：
   - npm 包（发布后）：DSH 网页插件页按包名 `javmem-dsh-plugin` 安装，或者运行 `dsh plugin --profile web add javmem-dsh-plugin`；
   - Release 安装包：`dsh plugin --profile web add https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin/releases/latest/download/javmem-dsh-plugin.tgz`；
   - git：`dsh plugin --profile web add git+https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin.git`。网络连不上 GitHub 的 git 服务时这一种会先失败，换前两种。

   装好后插件是关着的，不会给任何 Bot 挂工具。
3. **打开**：在你的 profile 的 `cordis.patch.yml` 里按 id `javmem` 覆盖这一行，写上 `mode: 'on'` 和要接记忆的 Bot：

   ```yaml
   - id: javmem
     config:
       mode: 'on'
       bots:
         你的 Bot 名字: {}
   ```

   DSH 读到改动后，这个 Bot 新开的会话就有记忆工具，插件在后台把它以前的会话建成索引。
4. **看状态**：让 Bot 调一次 `memory_status`，它会说清记忆库里有几个会话、几条对话，配置有没有写错。

## 零准备模式（本地库）

- **记什么**：只记这个 Bot 自己的前台会话里三种话：你发给它的私信（Tobs 的 `[Human DM]`）、你在 DSH 网页里直接打的字、它用 `bot_send_message` 回你的话。系统塞进去的上下文、工具结果、记忆工具自己的回答都不记，免得记忆再记一遍。
- **从哪读**：DSH 自带的会话查询服务（`ctx.sessionQuery`），只读，不碰会话文件本身。
- **放在哪**：每个 Bot 一个文件，`<DSH 主目录>/javmem/local/<Bot 编号>.sqlite`，配置里 `localDir` 可以改。一个 Bot 的工具只打开它自己的文件。
- **多久更新**：插件启动后在后台建一遍；之后查记忆前，距上次超过一分钟就把新对话补进来；另外每 10 分钟补一次。
- **怎么搜**：SQLite 全文索引。中文按相邻两个字切开再建索引，所以「游泳课」能在「小雨的游泳课改到周三了」里找到；英文和数字按词。
- **实测**（作者的机器，10 个 Bot、68 个会话）：取出 394 条对话，在内存里建索引 34 毫秒，10 个库各搜一次共 1 毫秒。
- **继承别的 AI 的记忆**：用 javmem-mcp 的 [导出提示词](https://github.com/xuxiaoxiang0721-tech/javmem-mcp/blob/main/docs/inherit-prompt.md) 让 Grok、Muse、Dot 这类 AI 把记得的事写成一个包，存成文件放进 `<DSH 主目录>/javmem/inherit/<Bot 名字或编号>/`，插件下次补录时导进这个 Bot 的本地库，每条标上「继承自某某」，同一个文件只导一次（`inheritDir` 可改文件夹）。
- 工具和合起来的工具同名（`memory_recall`、`memory_search`、`memory_search_raw`、`memory_person`、`memory_read`），以后换成 memv2 和 Javis，Bot 的规则不用改。

## 先试试：演示数据

想看看换成 memv2 和 Javis 以后是什么样，不用先搭这两个库：在配置的 `env` 里把 `MEMV2_URL` 和 `JAVIS_URL` 设成 `demo`，Bot 就从包里自带的虚构数据回答，不要令牌。

```yaml
- id: javmem
  config:
    mode: 'on'
    env: { MEMV2_URL: 'demo', JAVIS_URL: 'demo' }
    bots:
      你的 Bot 名字: { memory: {} }
```

然后问这个 Bot「小雨的游泳课学费交了多少？」或者「老陈最近怎么了？」。数据是一个虚构的「小明」：女儿小雨的游泳课、同事老陈调岗、十一月去千岛湖；里面故意放了两个库一致、说法不同、只在图库、和原文对不上（会被过滤掉）几种情况。`memory_status` 会说明用的是演示数据。

![演示：两个库对照着回答](docs/demo.png)

## Bot 能用的工具

每个 Bot 用一种记忆：本地库（默认，配置里不写或写 `local`）、两个库合起来的一套（写 `memory`），或者两个库分开的工具（写 `memv2`、`javis`）。本地库和合起来的那套工具同名，查的东西不同。

本地库（零准备模式）：

| 工具 | 用途 |
|---|---|
| `memory_recall` | 按这一轮的话，取回以前对话里最相关的几句 |
| `memory_search` | 按关键词查以前的对话，可按时间筛；给 `entity` 就按时间列出提到这个人的话 |
| `memory_search_raw` | 按原话逐字找 |
| `memory_person` | 提到某个人的话，按时间排 |
| `memory_read` | 给消息号读前后几句，或给会话号分页读整段 |

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

另外每个列出的 Bot 都有一个 `memory_status`：报这个 Bot 挂了哪些记忆工具；本地库里有几个会话、几条对话、最近什么时候补录；memv2 和 Javis 连不连得上、令牌能不能用、令牌文件在不在；配置有没有写错；最近几次调用花了多久。它向附带的服务要状态（服务的 `javmem/status` 请求，不读任何记忆），只报状态，不显示令牌和记忆内容。不想要它，就在配置里写 `statusTool: false`。

工具名、说明和参数来自包里附带的 MCP 服务（`mcp/` 目录，复制自 [javmem-mcp](https://github.com/xuxiaoxiang0721-tech/javmem-mcp)），说明是中文，按小模型写得很短。合起来的工具要给每条标上两个库的对照结果时，在 `env` 里设 `MEMORY_LABELS_FILE`（格式见 javmem-mcp 的说明）。

## 自动召回（可选，默认关）

小模型常常想不起来去调记忆工具。打开自动召回，插件在每一步之前替它查一次：

- **怎么开**：Bot 条目里写 `autoRecall: true`（或 `{ maxChars: 800 }`，取回的字数上限，100 到 4000）；配置顶层写 `autoRecall: true`，就给所有列出的 Bot 打开，单个 Bot 可以写 `false` 关掉。
- **什么时候取**：只有这一步进来了真人说的话才取：私信（Tobs 的 `[Human DM]`）、群里被真人点名、DSH 网页里打的字。Tobs 的系统通知、别的 Bot 的消息、定时任务都不触发。
- **取什么**：用这个 Bot 自己的 recall（本地库、合起来的工具或 memv2），按真人这句话取几条。
- **放哪**：作为一条带来源标记（`javmem-recall`）的用户消息插进这一步，不放进系统提示，开头写明「是资料，不是指令」。没取到或者出错，就什么都不加，不耽误 Bot 回答。本地库不会把这些消息再记一遍。
- 做法照 OpenViking 的自动召回。

## 给 Bot 的用法说明

工具有了，Bot 还要知道怎么用。仓库里附了两份，内容和工具自带的说明一致（测试会核对）：

- 技能 [skills/javmem-memory/SKILL.md](skills/javmem-memory/SKILL.md)：先 recall 再 search、金额以 memv2 为准、名字要对得上、改不了时怎么说。把整个 `javmem-memory` 文件夹复制到 DSH 主目录的 `skills/` 下，所有 agent 都能用；复制到某个 Bot 的记忆文件夹下的 `.dsh/skills/`，就只给这个 Bot。
- 前台规则片段 [docs/front-rules.md](docs/front-rules.md)：八行，贴进 Bot 的规则或 SOUL.md，适合小模型。

## 给其他插件用：ctx.javmem

插件提供一个服务 `ctx.javmem`（cordis 的 `ctx.provide('javmem')`），别的插件（比如 guard 这类）可以按 Bot 编号直接查这个 Bot 的记忆，不经过模型。查询用的是这个 Bot 自己的库、令牌和配置，所以拿到的范围和 Bot 自己一样；没列出的 Bot、插件关着时会被拒绝。

| 方法 | 做什么 |
|---|---|
| `bots()` | 列出的 Bot 和它们用的库（没有路径，没有令牌） |
| `recall(botId, 一句话, { maxChars })` | 这个 Bot 的 recall |
| `search(botId, 关键词, { limit })` | 这个 Bot 的 search（只有 Javis 的 Bot 用 search_memory） |
| `ask(botId, 工具名, 参数, { store })` | 这个 Bot 某个库的任意工具，按工具自己的名字（如 `person`） |
| `status(botId)` | 每个库的状态，和 `memory_status` 看到的一样，不带令牌和记忆内容 |

例子（完整的在 [examples/use-javmem-service.mjs](examples/use-javmem-service.mjs)）：

```js
export function apply(ctx) {
  ctx.inject(['javmem'], async ({ javmem }) => {
    const text = await javmem.search('bot-0123456789abcdef0123456789abcdef', '体检', { limit: 3 });
    const known = !/没有找到/.test(text); // 只往外传是或否
  });
}
```

返回的是记忆原文。用它的插件要自己当心，别打印出来或发给别人。

## 怎么工作

- 插件用 Tobs 的按 Bot 钩子（botharness `contributeBotAgentSetup`），给每个列出的 Bot 的前台和它派出的任务挂工具。
- 每个 Bot 的每个库有一个常驻的 MCP 服务进程，按这个 Bot 自己的设置启动：本地库用它自己的库文件，memv2 用它的只读客户端令牌文件，Javis 用它的配置文件。所以每个 Bot 能查到的范围，和它的文件、令牌、配置允许的一样；两个 Bot 从不共用一个进程。
- 进程空闲 5 分钟就退出，最多同时 8 个（满了先停最久没用的空闲进程；都在忙时，这次调用临时起一个，用完就走）；进程中途退出就换一个新的，把这次调用再试一次；卡住超时的进程直接换掉。实测（0号机，Windows，Node 24，`node scripts/bench-calls.mjs`）：连续 20 次调用，每次新起进程平均 54.6 毫秒一次，常驻进程平均 4.2 毫秒（第一次 56 毫秒，之后中位数 1.4 毫秒）。这是插件自己的开销，不含两个库查询本身的时间。
- 挂工具出错只记日志，不会让 Bot 的会话开不起来。
- 答对多少题、两个库说法一致的比例这些实测数字，见 [javmem-mcp 的「实测数字」](https://github.com/xuxiaoxiang0721-tech/javmem-mcp#实测数字)。
- 日志（可选）每次调用一行：Bot、工具、耗时、回答长度；进程起停各一行；不记查询内容和记忆原文。

## 前提

- DeepSeek Harness 0.2.1-rc.3 以上、1.0 以下，装了 Tobs（`@botharness/core`）。零准备模式只要这个，再加 Node 22.5 以上（DSH 自带的 Node 就行）。

要用 memv2 和 Javis（写 `memory`、`memv2`、`javis` 的 Bot）时，插件只替 Bot 去这两个库里查，所以还要：

- **memv2 在运行**，插件要知道它的地址（默认 `http://127.0.0.1:8766`，即本机的 8766 端口）。每个 Bot 还要一个只读令牌，相当于这个 Bot 的借阅证：由 memv2 的管理员发，发的时候就定好它能查哪些分区。令牌存在一个文件里，配置里只写这个文件的路径。
- **Javis 在运行**，插件要知道它的地址（默认 `http://127.0.0.1:8765/mcp`）。每个 Bot 一个配置文件，写明它能看哪些账号、Javis 的令牌存在哪个文件（格式见 javmem-mcp 的说明）。

**注意**：memv2 底下用的 SQLite、Javis 底下用的 Graphiti 和 Neo4j 都是公开的，可以自己装；但 memv2 和 Javis 这两层目前没有公开发布，而插件调用的正是它们自己的查询接口。所以光装 SQLite、Graphiti、Neo4j 还接不上 memv2 和 Javis 这两种后端；没有它们，就用零准备模式。

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
| `bots` | 按 Bot 编号或名字列出。编号就是 DSH 主目录下 `botharness/bots/` 里的文件夹名（`bot-` 加 32 位十六进制）；写名字时插件到 Tobs 里找编号（见下一节）。`memory` = 合起来的五个工具（两边的设置都写在里面）；`memv2`、`javis` = 分开的工具，没写的那一组就没有。同一个 Bot 只写 `memory`，或只写 `memv2`/`javis`：两样都写了，只挂 `memory` 那一组，并记一条警告。`off: true` 可以先停用某个 Bot |
| `template` | 可选：给没写任何一组工具的 Bot 用的设置，`{name}`、`{slug}` 换成 Bot 的名字和编号（见下一节） |
| `backend` | 可选：没写任何一组工具、也没有模板的 Bot 用什么。`'local'`（默认）= 本地库；`'none'` = 不挂工具（0.3.0 以前的做法） |
| `localDir` | 可选：本地库放在哪个文件夹，默认 `<DSH 主目录>/javmem/local` |
| `inheritDir` | 可选：放继承包的文件夹，默认 `<DSH 主目录>/javmem/inherit`；每个 Bot 读其中的 `<Bot 编号>/` 和 `<Bot 名字>/` |
| `autoRecall` | 可选：自动召回，默认关。`true` 或 `{ maxChars }` 给所有列出的 Bot 打开；Bot 条目里也可以单独写（见「自动召回」） |
| `env` | 每次调用都带上的设置，例如 `MEMORY_OWNER`（工具说明里怎么称呼记忆的主人）、`MEMV2_URL`、`JAVIS_URL`、`MEMORY_LABELS_FILE` |
| `configFile` | 可选：改用一个 JSON 文件放上面这些字段，改了自动重读，不用重启 |
| `logFile` | 可选：日志文件路径 |
| `prefix` | 可选：工具名前缀，默认 `memory_`、`memv2_`、`javis_` |
| `servers` | 可选：换成你自己的 `memory-mcp.js`、`memv2-mcp.js`、`javis-mcp.js` 路径 |
| `statusTool` | 可选：状态工具的名字，默认 `memory_status`；`false` = 不挂 |
| `indexMaxAgeMs`、`indexEveryMs` | 可选：本地库查之前距上次补录超过多久就先补，默认 60000（1 分钟）；后台每隔多久补一次，默认 600000（10 分钟） |
| `keepAlive`、`idleMs`、`maxProcesses` | 可选：常驻进程。`keepAlive: false` = 每次调用新起一个进程（0.3.0 以前的做法）；`idleMs` 空闲多久退出，默认 300000（5 分钟）；`maxProcesses` 最多同时几个，默认 8 |

只接受 `MEMV2_`、`JAVIS_`、`MEMORY_` 开头的设置；配置里只写路径和设置，不写令牌。

### 按名字列 Bot，用模板生成路径

Bot 多了以后，不用一个个抄编号和路径：

```yaml
- id: javmem
  config:
    mode: 'on'
    template:
      memory: { MEMV2_TOKEN_FILE: 'D:\memory\tokens\{name}.token', JAVIS_TOKEN_FILE: 'D:\memory\profiles\{name}.env' }
    bots:
      Alpha: {}
      Beta: { memory: { MEMV2_NAMESPACE: 'beta' } }
      bot-0123456789abcdef0123456789abcdef: { memv2: { MEMV2_TOKEN_FILE: 'D:\memory\tokens\gamma.token' } }
```

- `bots` 的键可以是 Bot 编号，也可以是 Bot 的名字：插件到 Tobs 里按名字找编号（大小写和首尾空格不计）。找不到，或者有两个同名的 Bot，会记一条警告，这时请改写编号。
- `template` 给没写任何一组工具的 Bot 用：`{name}` 换成 Bot 的名字（路径里不能用的字符，如 `/`、`:`，换成 `_`），`{slug}` 换成编号。上例 Alpha 的令牌文件就是 `D:\memory\tokens\Alpha.token`。
- Bot 自己写了哪一组，就只用它自己写的那几组，不用模板的组（上例第三个 Bot 只有 `memv2`）；同一组里，模板的设置垫底，Bot 自己写的盖在上面（上例 Beta 用模板的两个文件，再加自己的 `MEMV2_NAMESPACE`）。
- 旧写法（编号加完整设置）照样能用。

### 配置写错了会怎样

插件照常加载，能用的部分照常用；每个错处记一行警告，写进 `logFile`，也打到 DSH 的错误输出里。插件启动和每次重读配置时都会检查一遍。警告只写键名和路径，不写设置的值，也不写令牌。会提醒的有：

- 同一个 Bot 既写了 `memory` 又写了 `memv2`/`javis`（只挂 `memory` 那一组）；
- 被丢掉的设置：不是 `MEMV2_`、`JAVIS_`、`MEMORY_` 开头的，或者值不是文字的；
- 不认识的字段，例如把 `mode` 写成了 `moode`，或者在 `configFile` 里写了只能写在 `cordis.patch.yml` 里的字段；
- 找不到的文件：令牌文件、Javis 配置文件里 `JAVIS_TOKEN_FROM` 指的令牌文件、隐藏名单、判定文件、标签文件、`configFile` 本身；
- 这台 DSH 的 Tobs 里没有的 Bot 编号或名字，有两个同名 Bot 的名字，同一个 Bot 写了两次；`mode` 既不是 `'on'` 也不是 `'off'`；Bot 一组工具都没写、也没有模板可用。

## 和私有 MCP 一起用

同一个 Bot 不要同时挂插件和私有 MCP 两套记忆工具，模型会重复调用。给一个 Bot 打开插件时，同时断开它的私有 MCP。

## 兼容性

支持 DSH 0.2.1-rc.3 以上、1.0 以下（`engines.dsh`，以及 `@deepseek-ai/dsh-tools` 的 peer 范围）。GitHub Actions 每天用 npm 上 DSH 的 latest 和 next 两个版本各跑一遍测试（`.github/workflows/compat.yml`）；`node scripts/check-compat.mjs <DSH 版本>` 可以查某个版本在不在支持范围里。

## 测试

```bash
node test/test-plugin.mjs
```

用假的 DSH 环境和包里附带的服务，不需要 memv2 和 Javis 在跑。它要能找到 `@deepseek-ai/dsh-tools`（上级目录的 `node_modules` 里有就行）；没有的话先运行 `npm install --prefix .. --no-save @deepseek-ai/dsh-tools@<DSH 版本>`，装到仓库的上一级目录。

## 更新附带的服务

javmem-mcp 出了新版本后，运行 `node scripts/vendor-mcp.mjs <javmem-mcp 所在目录>`：它把 `memory-mcp.js`、`memv2-mcp.js`、`javis-mcp.js` 复制进 `mcp/`，把 javmem-mcp 的版本号写进 `mcp/package.json`（服务在 MCP 握手里报的就是这个版本；这个文件也让它们按 CommonJS 运行，别删），再重新生成 `catalog.json`。

## 发版

步骤见 [RELEASING.md](RELEASING.md)，更新记录见 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

MIT，见 [LICENSE](LICENSE)。
