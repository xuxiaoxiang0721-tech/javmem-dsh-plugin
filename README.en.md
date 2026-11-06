# javmem-dsh-plugin

[中文](README.md) | English

[![npm](https://img.shields.io/npm/v/javmem-dsh-plugin)](https://www.npmjs.com/package/javmem-dsh-plugin)
[![compat](https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin/actions/workflows/compat.yml/badge.svg)](https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin/actions/workflows/compat.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Memory from the moment it is installed: every Tobs Bot in DeepSeek Harness remembers what you and it talked about, each Bot its own, unseen by the others. With memv2 and Javis, it can answer from two memory stores checked against each other instead.**

List a Bot in the config and it has memory tools from its next session on: no service to set up, no token, no private MCP server, card or approval per Bot. The plugin builds a local full-text index of that Bot's own past sessions, read-only (zero-setup mode), and Chinese words are found inside sentences. For stronger memory a Bot can move to javmem, memv2 (fact memory) plus Javis (a Graphiti memory graph), with the same tool names.

## Why javmem

1. **Built for personal Bots, so it can afford good models.** One person's conversations are nowhere near commercial data volumes, so javmem doesn't skimp on the model that extracts memory: the same person has to be recognised as the same person, relations linked correctly and events put in order, and the better the model, the more accurate it gets. You see the cost before you install, and a daily cap keeps a big history import from running up the bill. If you'd rather pay nothing, zero-setup mode costs nothing at all.
2. **Bring your past in one go.** Most memory plugins start remembering on the day you install them. javmem comes with an importer that parses the history exported from tools like Grok, ChatGPT and Claude and loads it in one pass. What goes in is the original conversation, not a few things an AI recalls about you; people, things, times and places are all in the original words, which is what lets them be linked into a web. For a tool that can't export its history, an export prompt lets the AI write down what it remembers.
3. **Two stores, each with its own job: the more it holds, the more it resembles a real person.** With the full backend, memv2 keeps what is true: facts, numbers, dates. The graph keeps who, when, where, and how things changed later. The original words are kept too, down to how someone phrases things. Outdated statements are marked as no longer valid, so it can tell what you thought then from what you think now, and where the two stores disagree it says so. The more memory builds up, the more faithfully it can reconstruct a real person: groundwork for a digital human.
4. **Read-only, so a Bot can't rewrite your past.** Memory has only two ways in, both outside the model's hands: the Bot program itself packages new conversations and delivers them to the store, and you import your own history; the model can look things up but never write, so it can't slip a guess of its own into memory, and instructions smuggled in by a web page or another Bot can't make it delete or change what is remembered.

## Who it is for, and who it is not for

For:

- people who run several Bots in Tobs and want each to remember what you talked about, each its own;
- people who do not want to set up a service: zero-setup mode works once installed, and its data stays on the machine;
- people who already run memv2 and Javis: one plugin instead of one private MCP card per Bot, with both stores checked against each other;
- people who want memory that nothing scrambles: the plugin is read-only, never writes to memv2 or Javis and never competes with the import pipeline.

Not for:

- DSH users without Tobs: the plugin only gives tools to Tobs Bots. For memory in ordinary DSH sessions, look at plugins such as Hindsight, DSH-Mem0 or MemOS.
- people who want semantic search or facts extracted automatically: zero-setup mode searches the original words; for those you need memv2 and Javis (not publicly released at the moment, see Prerequisites).

The same tools work in Claude Code and other MCP clients through [javmem-mcp](https://github.com/xuxiaoxiang0721-tech/javmem-mcp).

## Quick start

1. **Prepare**: DeepSeek Harness 0.2.1-rc.3 or later, below 1.0, with Tobs, and Node 22.5 or later (the Node DSH ships will do). Zero-setup mode needs nothing else.
2. **Install**, any of three ways:
   - the npm package (once published): on the DSH web Plugins page by the package name `javmem-dsh-plugin`, or `dsh plugin --profile web add javmem-dsh-plugin`;
   - the Release tarball: `dsh plugin --profile web add https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin/releases/latest/download/javmem-dsh-plugin.tgz`;
   - git: `dsh plugin --profile web add git+https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin.git`. Where GitHub's git service cannot be reached this one fails first; use one of the other two.

   Once installed the plugin is off and gives no Bot any tool.
3. **Turn it on**: in your profile's `cordis.patch.yml`, override the row with id `javmem` with `mode: 'on'` and the Bots that get memory:

   ```yaml
   - id: javmem
     config:
       mode: 'on'
       bots:
         Your Bot's name: {}
   ```

   Once DSH reads the change, that Bot's new sessions have the memory tools, and the plugin indexes its past sessions in the background.
4. **Check**: ask the Bot to call `memory_status` once. It says how many sessions and messages its memory holds and whether the config has mistakes.

## Zero-setup mode (the local store)

- **What it keeps**: three kinds of text from the Bot's own front-desk sessions only: your direct messages to it (Tobs's `[Human DM]`), what you type in the DSH web page, and what it sends back with `bot_send_message`. Injected context, tool results and the memory tools' own answers are left out, so memory is never stored twice.
- **Where it reads**: DSH's own session query service (`ctx.sessionQuery`), read-only; the session files themselves are never touched.
- **Where it keeps it**: one file per Bot, `<DSH home>/javmem/local/<Bot id>.sqlite` (`localDir` changes the folder). A Bot's tools open only its own file.
- **How often**: the plugin indexes in the background after it starts; before a memory call, anything newer than a minute is added first; and every 10 minutes in the background.
- **How it searches**: SQLite full-text search. Chinese is indexed as pairs of neighbouring characters, so 「游泳课」 (swimming lessons) is found inside 「小雨的游泳课改到周三了」; other text by words.
- **Measured** (on the author's machine, 10 Bots, 68 sessions): 394 messages taken in, indexed in memory in 34 ms; one search in each of the 10 stores took 1 ms in all.
- **Memory inherited from other AIs**: with javmem-mcp's [export prompt](https://github.com/xuxiaoxiang0721-tech/javmem-mcp/blob/main/docs/inherit-prompt.md), an AI such as Grok, Muse or Dot writes what it remembers as a package; save it as a file in `<DSH home>/javmem/inherit/<Bot name or id>/` and the plugin adds it to that Bot's local store on its next pass, each item marked with where it came from, each file once (`inheritDir` changes the folder). Original conversations exported from other tools (ChatGPT's and Claude's `conversations.json`, Claude Code's and Codex's session logs, 1.2 memory packages) go in the same folder: the original words, marked as imported from that tool (see javmem-mcp's "Bring past conversations in one go").
- The tools have the same names as the combined set (`memory_recall`, `memory_search`, `memory_search_raw`, `memory_person`, `memory_read`), so a Bot's rules stay the same when it moves to memv2 and Javis.

## Choosing a backend: A, B, C, D

The local store (D) costs nothing and works as installed. For memory with more depth, pick one of four:

| Option | `backend` | What it keeps | Cost per 1,000 messages | What it needs | The Bot's tools |
|---|---|---|---|---|---|
| D local store (default) | `local` | the original words, searchable by words (Chinese too) | 0 | nothing | `memory_*` (5) |
| B fact store | `memv2` | D plus extracted facts, old and new kept apart | about 600,000 tokens | memv2-lite (Node, no Docker) | `memv2_*` (4) |
| C graph | `graphiti` | D plus people, things and how they relate over time | about 2.5 million tokens | the official Graphiti server (Docker, about 11 GB) | `javis_*` (4) |
| A full set | `full` | B and C, answered side by side | about 3.1 million tokens | both (one compose, about 12 GB) | `memory_*` (5) |

Costs are estimates from a test on 2026-11-06 with gpt-6-luna on made-up conversations; the models can be OpenAI, DeepSeek with Qwen, or a local Ollama (free, needs a strong computer). Both stores start empty.

- **One command**: `npx -y javmem-mcp setup` explains the four choices and their cost, asks for the models and a daily limit, **shows the quote first and writes nothing until you say yes**: the model settings, the services to start, the tokens, and the plugin config (`plugin-config.json`, to use as the plugin's `configFile` or copy into its config). It starts nothing and sends nothing anywhere.
- **Estimate first**: `npx -y javmem-mcp estimate <local store or inherited packages>` prints counts and estimated tokens only.
- **In**: Bots on B, C and A keep their local store; after each pass over a Bot's new conversations the plugin sends the settled stretches on (each once). The graph has a daily limit per Bot (`backends.graphiti.dailyTokens`); the fact store keeps its own (`MEMV2_DAILY_TOKENS`). The log holds counts only.
- **One per Bot**: a namespace (fact store) and a group (graph) per Bot, `bot-<Bot id>` by default, invisible to the others.
- **Auto recall** works with D, B and A; C has no recall tool.
- `memory_status` reports whether each store answers, how much it holds, what is still queued and the tokens spent today.

## Try it first: demo data

See what memv2 and Javis give before setting either up: set `MEMV2_URL` and `JAVIS_URL` to `demo` in the config's `env`, and the Bot answers from made-up data that ships with the package, with no token.

```yaml
- id: javmem
  config:
    mode: 'on'
    env: { MEMV2_URL: 'demo', JAVIS_URL: 'demo' }
    bots:
      Your Bot's name: { memory: {} }
```

Then ask the Bot 「小雨的游泳课学费交了多少？」 (how much were the swimming lessons?) or 「老陈最近怎么了？」 (what is up with Lao Chen?). The data is a fictional 小明 (Xiao Ming): his daughter's swimming lessons, his colleague 老陈 moving to another office, a November trip to 千岛湖; it holds, on purpose, facts both stores agree on, facts they word differently, facts only the graph has, and one that the source text does not back (dropped). `memory_status` says it is demo data.

![Demo: both stores checked against each other](docs/demo.png)

## The tools a Bot gets

Each Bot uses one kind of memory: the local store (the default: nothing, or `local`, in the config), the combined set over both stores (`memory`), or the two stores apart (`memv2`, `javis`). The local store and the combined set share their tool names and search different things.

The local store (zero-setup mode):

| Tool | What it does |
|---|---|
| `memory_recall` | the lines of past conversations most related to this turn |
| `memory_search` | keyword search over past conversations, with a date range; with `entity`, what was said about that person, by time |
| `memory_search_raw` | the exact words |
| `memory_person` | what was said about one person, by time |
| `memory_read` | the lines around a message id, or a whole session page by page |

The combined set (`memory` in the config):

| Tool | What it does |
|---|---|
| `memory_recall` | memv2 facts about this turn's topic; a fact both stores hold is marked 「图库也有」 (the graph has it too) |
| `memory_search` | both stores at once: memv2's facts first (facts and amounts count from memv2), then the graph's people, relations and timeline; a fact both hold is listed once, a different wording sits next to memv2's |
| `memory_search_raw` | keyword search over both stores' original text, one line per message |
| `memory_person` | one person: all their relations in the graph plus memv2's facts about them, by time |
| `memory_read` | a memv2 record by its record key, or a graph conversation by its session id |

The two stores apart (`memv2` and `javis` in the config):

| Tool | From | What it does |
|---|---|---|
| `memv2_recall` | memv2 | memories about this turn's topic, quick enough to call every turn |
| `memv2_search` | memv2 | search by content or name, with dates and record keys |
| `memv2_search_raw` | memv2 | keyword search over the original records |
| `memv2_read_record` | memv2 | one record's original text by its key |
| `javis_search_memory` | Javis | relations and facts about people and things (only those checked against the source text) |
| `javis_get_entity` | Javis | all relations of one person or thing |
| `javis_find_sessions` | Javis | keyword search over past conversations' original lines |
| `javis_get_conversation` | Javis | a whole conversation by its session id |

Every listed Bot also gets `memory_status`: which memory tools the Bot has; how many sessions and messages its local store holds and when it last took in new ones; whether memv2 and Javis answer and take its tokens, and whether its token files are there; whether the config has mistakes; and how long its last calls took. It asks the bundled servers for their state (their `javmem/status` request, which reads no memory) and shows no token and no memory text. `statusTool: false` in the config leaves it out.

Tool names, descriptions and arguments come from the bundled MCP servers (`mcp/`, copied from [javmem-mcp](https://github.com/xuxiaoxiang0721-tech/javmem-mcp)); the descriptions are in Chinese and kept short for small models. For cross-check marks on the combined tools, set `MEMORY_LABELS_FILE` in `env` (format in the javmem-mcp README).

## Auto recall (optional, off by default)

Small models often forget to call the memory tools. With auto recall on, the plugin asks for them before each step:

- **Turning it on**: `autoRecall: true` in a Bot's entry (or `{ maxChars: 800 }`, the most characters to bring back, 100 to 4000); `autoRecall: true` at the top of the config turns it on for every listed Bot, and a Bot can say `false`.
- **When**: only when a Human's words enter the step: a direct message (Tobs's `[Human DM]`), a Human's mention in a Group, or text typed in the DSH web page. Tobs's notices, other Bots' messages and schedules never trigger it.
- **What**: the Bot's own recall (local store, combined set or memv2), asked with the Human's words.
- **Where it goes**: one more user-role message in that step, with its own source kind (`javmem-recall`), never in the system prompt, opening with a note that it is material, not instructions. When nothing comes back or something fails, nothing is added and the Bot answers as usual. The local store never takes these messages in.
- It follows OpenViking's auto recall.

## Usage notes for the Bot

With the tools in place, a Bot still needs to know how to use them. Two notes ship with the plugin, in Chinese like the tool text and in line with the tools' own guidance (a test checks this):

- The skill [skills/javmem-memory/SKILL.md](skills/javmem-memory/SKILL.md): recall first, then search; amounts count from memv2; names must match; what to say when asked to change memory. Copy the whole `javmem-memory` folder into `skills/` under the DSH home for every agent, or into `.dsh/skills/` under one Bot's memory folder for that Bot only.
- The front-rules snippet [docs/front-rules.md](docs/front-rules.md): eight lines to paste into a Bot's rules or SOUL.md, sized for small models.

## For other plugins: ctx.javmem

The plugin provides a service, `ctx.javmem` (cordis `ctx.provide('javmem')`), so another plugin (a guard, say) can look into a Bot's memory by its id without a model. Each query uses that Bot's own store, token and profile, so it reaches exactly what the Bot itself reaches; a Bot that is not listed, or a plugin that is off, is refused.

| Method | What it does |
|---|---|
| `bots()` | the listed Bots and their stores (no paths, no tokens) |
| `recall(botId, sentence, { maxChars })` | the Bot's recall |
| `search(botId, keywords, { limit })` | the Bot's search (search_memory for a Bot with Javis only) |
| `ask(botId, tool, args, { store })` | any tool of one of the Bot's stores, by the tool's own name (such as `person`) |
| `status(botId)` | each store's state, as `memory_status` sees it, with no token and no memory text |

Example (the whole plugin is in [examples/use-javmem-service.mjs](examples/use-javmem-service.mjs)):

```js
export function apply(ctx) {
  ctx.inject(['javmem'], async ({ javmem }) => {
    const text = await javmem.search('bot-0123456789abcdef0123456789abcdef', '体检', { limit: 3 });
    const known = !/没有找到/.test(text); // pass on a yes or no only
  });
}
```

What comes back is memory text: a plugin that uses it should take care not to print it or send it anywhere.

## How it works

- The plugin uses Tobs's per-Bot hook (botharness `contributeBotAgentSetup`) to give tools to every listed Bot's front desk and to the Assignments it sends out.
- Each store of each Bot has one long-lived MCP server process, started with that Bot's own settings: the local store with its own file, memv2 with its read-only client token file, Javis with its profile. So each Bot reaches exactly what its file, token and profile allow, and two Bots never share a process.
- A process exits after 5 idle minutes, and at most 8 run at once (the least recently used idle one makes room; when all are busy, the call gets a one-off process). A process that dies mid-call is replaced and the call tried once more; one that hangs past the timeout is replaced. Measured (0号机, Windows, Node 24, `node scripts/bench-calls.mjs`): over 20 consecutive calls, one process per call took 54.6 ms per call on average, a long-lived process 4.2 ms (56 ms for the first, then a median of 1.4 ms). That is the plugin's own cost, without the stores' query time.
- A failure while registering tools is only logged; it never keeps a Bot's session from starting.
- Measured numbers (right answers found, how often the two stores agree) are in [javmem-mcp's "Measured numbers"](https://github.com/xuxiaoxiang0721-tech/javmem-mcp/blob/main/README.en.md#measured-numbers).
- The log (optional) has one line per call: Bot, tool, milliseconds and answer size, and a line when a process starts or stops; never the query or memory text.

## Prerequisites

- DeepSeek Harness 0.2.1-rc.3 or later, below 1.0, with Tobs (`@botharness/core`). Zero-setup mode needs only this, and Node 22.5 or later (the Node DSH ships will do).

For memv2 and Javis (Bots given `memory`, `memv2` or `javis`), the plugin only queries those two stores for the Bots, so it also needs:

- **memv2 running**, at an address the plugin knows (default `http://127.0.0.1:8766`, port 8766 on this machine). Every Bot needs a read-only token, its library card so to speak: memv2's administrator issues it and decides at that moment which partitions it may read. The token lives in a file; the config only holds that file's path.
- **Javis running**, at an address the plugin knows (default `http://127.0.0.1:8765/mcp`). Every Bot has a profile naming the accounts it may see and the file that holds Javis's token (format in the javmem-mcp README).

**Note**: the original memv2 and Javis are not publicly released at the moment, and the settings above talk to their own query interfaces. Without them: besides zero-setup mode, there are the public memv2-lite and the official Graphiti server (`backend: memv2`, `graphiti`, `full`, see "Choosing a backend").

## Configuration

Override the row by its id in your profile's `cordis.patch.yml`:

```yaml
- id: javmem
  config:
    mode: 'on'
    env:
      MEMORY_OWNER: 'Alex'
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

| Field | Meaning |
|---|---|
| `mode` | `'on'` or `'off'` (quoted, so YAML does not read a yes/no) |
| `bots` | Bots by id or by name. The id is the Bot's folder name under `botharness/bots/` in the DSH home (`bot-` plus 32 hex digits); for a name the plugin finds the id in Tobs (next section). `memory` = the five combined tools (with both stores' settings inside); `memv2`, `javis` = the tools of each store apart, and a store left out gives no tools. Give a Bot either `memory` or `memv2`/`javis`: a Bot given both gets only the `memory` tools, with a warning. `off: true` parks a Bot |
| `template` | optional: settings for every Bot whose entry names no store; `{name}` and `{slug}` become the Bot's name and id (next section) |
| `backend` | optional: what a Bot gets that names no store and has no template. `'local'` (default) = the local store; `'memv2'`, `'graphiti'`, `'full'` = the fact store, the graph, the full set (see "Choosing a backend"; they need `backends`); `'none'` = no tools (the way before 0.3.0) |
| `backends` | the services behind B, C and A. `memv2`: `url`, `tokenFile` (the read-only token file the Bots query with), `writeTokenFile` (the writable one the plugin sends conversations with), `namespace` (default `bot-{slug}`); `graphiti`: `url` (default `http://127.0.0.1:8000/mcp/`), `group` (default `bot-{slug}`), `dailyTokens` (each Bot's daily limit, default 1000000), `window` (episodes in flight, default 4). The setup wizard writes them |
| `localDir` | optional: the folder of the local stores, default `<DSH home>/javmem/local` |
| `inheritDir` | optional: the folder of inherited packages, default `<DSH home>/javmem/inherit`; each Bot reads its `<Bot id>/` and `<Bot name>/` in it |
| `autoRecall` | optional: auto recall, off by default. `true` or `{ maxChars }` turns it on for every listed Bot; a Bot's entry may say so too (see "Auto recall") |
| `env` | settings sent with every call, such as `MEMORY_OWNER` (how the tool text names the memory's owner), `MEMV2_URL`, `JAVIS_URL`, `MEMORY_LABELS_FILE` |
| `configFile` | optional: a JSON file with the fields above instead, re-read when it changes, no restart |
| `logFile` | optional: the log file's path |
| `prefix` | optional: tool name prefixes, default `memory_`, `memv2_`, `javis_` |
| `servers` | optional: paths to your own `memory-mcp.js`, `memv2-mcp.js`, `javis-mcp.js` |
| `statusTool` | optional: the status tool's name, default `memory_status`; `false` = none |
| `indexMaxAgeMs`, `indexEveryMs` | optional: how old the local store's last pass may be before a call takes in new messages first, default 60000 (a minute); how often it does so in the background, default 600000 (10 minutes) |
| `keepAlive`, `idleMs`, `maxProcesses` | optional: the long-lived processes. `keepAlive: false` = a new process for every call (the way before 0.3.0); `idleMs` = idle time before a process exits, default 300000 (5 minutes); `maxProcesses` = how many may run at once, default 8 |

Only settings starting with `MEMV2_`, `JAVIS_` or `MEMORY_` are used; the config holds paths and settings, never tokens.

### Bots by name, paths from a template

With many Bots there is no need to copy ids and paths one by one:

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

- A key in `bots` may be a Bot id or a Bot name: the plugin finds the id for a name in Tobs (ignoring case and spaces at the ends). A name that matches no Bot, or two Bots, gets a warning; write the id then.
- `template` serves every Bot whose entry names no store: `{name}` becomes the Bot's name (characters a path cannot hold, such as `/` and `:`, become `_`), `{slug}` its id. Alpha's token file above is `D:\memory\tokens\Alpha.token`.
- A Bot that names stores gets only the stores it names, none from the template (the third Bot above has `memv2` only); within a store, the template's settings come first and the Bot's own override them (Beta above uses the template's two files plus its own `MEMV2_NAMESPACE`).
- The old form (an id with full settings) works as before.

### When the config has mistakes

The plugin still loads, and what is usable is used; every mistake is one warning line in `logFile` and in DSH's error output, checked at start and on every config reload. Warnings name keys and paths, never values or tokens. They cover:

- a Bot given both `memory` and `memv2`/`javis` (it gets the `memory` tools only);
- dropped settings: names not starting with `MEMV2_`, `JAVIS_` or `MEMORY_`, or values that are not text;
- unknown fields, such as `moode` for `mode`, or a row-only field written in the `configFile`;
- missing files: token files, the token file a Javis profile names in `JAVIS_TOKEN_FROM`, the hide list, the verdict file, the labels file, and the `configFile` itself;
- a Bot id or name this DSH's Tobs does not know, a name two Bots share, the same Bot listed twice; a `mode` that is neither `'on'` nor `'off'`; a Bot that names no store while there is no template.

## With private MCP servers

Do not give one Bot both the plugin's tools and a private MCP server's memory tools: the model would call both. When you turn the plugin on for a Bot, disconnect its private MCP server at the same time.

## Compatibility

DSH 0.2.1-rc.3 or later, below 1.0 (`engines.dsh`, and the `@deepseek-ai/dsh-tools` peer range). GitHub Actions tests against DSH's npm latest and next tags every day (`.github/workflows/compat.yml`); `node scripts/check-compat.mjs <DSH version>` tells whether a version is in range.

## Tests

```bash
node test/test-plugin.mjs
```

A fake DSH host and the bundled servers; memv2 and Javis need not run. It needs `@deepseek-ai/dsh-tools` (a `node_modules` in a folder above the checkout will do); without it, run `npm install --prefix .. --no-save @deepseek-ai/dsh-tools@<DSH version>` first, into the folder above the checkout.

## Updating the bundled servers

When javmem-mcp has a new version, run `node scripts/vendor-mcp.mjs <javmem-mcp folder>`: it copies `memory-mcp.js`, `memv2-mcp.js` and `javis-mcp.js` into `mcp/`, records javmem-mcp's version in `mcp/package.json` (the servers report it in their MCP handshake; the file also makes them run as CommonJS, so keep it) and rebuilds `catalog.json`.

## Releasing

Steps in [RELEASING.md](RELEASING.md); changes in [CHANGELOG.md](CHANGELOG.md).

## License

MIT, see [LICENSE](LICENSE).
