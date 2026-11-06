# javmem-dsh-plugin

[中文](README.md) | English

[![npm](https://img.shields.io/npm/v/javmem-dsh-plugin)](https://www.npmjs.com/package/javmem-dsh-plugin)
[![compat](https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin/actions/workflows/compat.yml/badge.svg)](https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin/actions/workflows/compat.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Gives every Tobs Bot in DeepSeek Harness a memory of its own: separated per Bot, read-only, with two memory stores checked against each other.**

Add a Bot to the config and it has memory tools from its next session on, without a private MCP server, a card or an approval per Bot. Each Bot queries with its own token and profile and sees only its own share. The memory comes from javmem: memv2 (fact memory) plus Javis (a Graphiti memory graph).

## Who it is for, and who it is not for

For:

- people who run several Bots in Tobs and want each Bot to query its own memory, unseen by the others;
- people who already run memv2 and Javis: one plugin instead of one private MCP card per Bot;
- people who want memory that nothing scrambles: the plugin is read-only, never writes memory and never competes with the import pipeline.

Not for:

- DSH users without Tobs: the plugin only gives tools to Tobs Bots. For memory in ordinary DSH sessions, look at plugins such as Hindsight, DSH-Mem0 or MemOS.
- people without memv2 and Javis who do not plan to set them up: the two stores are not publicly released at the moment (see Prerequisites).
- people who want the plugin to record new conversations: it is read-only, and memory is written through memv2's and Javis's own imports.

The same tools work in Claude Code and other MCP clients through [javmem-mcp](https://github.com/xuxiaoxiang0721-tech/javmem-mcp).

## Quick start

1. **Prepare**: DeepSeek Harness 0.2.1-rc.3 or later, below 1.0, with Tobs; memv2 and Javis running, and for every Bot that gets memory its own memv2 read-only token file and Javis profile (formats in the javmem-mcp README).
2. **Install**, any of three ways:
   - the npm package (once published): on the DSH web Plugins page by the package name `javmem-dsh-plugin`, or `dsh plugin --profile web add javmem-dsh-plugin`;
   - the Release tarball: `dsh plugin --profile web add https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin/releases/latest/download/javmem-dsh-plugin.tgz`;
   - git: `dsh plugin --profile web add git+https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin.git`. Where GitHub's git service cannot be reached this one fails first; use one of the other two.

   Once installed the plugin is off and gives no Bot any tool.
3. **Turn it on**: in your profile's `cordis.patch.yml`, override the row with id `javmem` with `mode: 'on'` and the Bots that get memory (see Configuration). Once DSH reads the change, those Bots' new sessions have the memory tools.
4. **Check**: ask a Bot to call `memory_status` once. It says whether both stores answer, whether the tokens work and whether the config has mistakes.

## The tools a Bot gets

Each Bot gets one of two sets: the combined set (recommended), or the tools of the two stores apart.

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

Every listed Bot also gets `memory_status`: which memory tools the Bot has, whether memv2 and Javis answer and take its tokens, whether its token files are there, whether the config has mistakes, and how long its last calls took. It asks the bundled servers for their state (their `javmem/status` request, which reads no memory) and shows no token and no memory text. `statusTool: false` in the config leaves it out.

Tool names, descriptions and arguments come from the bundled MCP servers (`mcp/`, copied from [javmem-mcp](https://github.com/xuxiaoxiang0721-tech/javmem-mcp)); the descriptions are in Chinese and kept short for small models. For cross-check marks on the combined tools, set `MEMORY_LABELS_FILE` in `env` (format in the javmem-mcp README).

## How it works

- The plugin uses Tobs's per-Bot hook (botharness `contributeBotAgentSetup`) to give tools to every listed Bot's front desk and to the Assignments it sends out.
- Every call starts the matching MCP server with that Bot's own settings and ends it when the answer is in: memv2 with the Bot's read-only client token file, Javis with its profile. So each Bot reaches exactly what its token and profile allow.
- A failure while registering tools is only logged; it never keeps a Bot's session from starting.
- The log (optional) has one line per call: Bot, tool, milliseconds and answer size; never the query or memory text.

## Prerequisites

The plugin stores no memory itself; it only queries the two memory stores for the Bots. So it needs:

- DeepSeek Harness 0.2.1-rc.3 or later, below 1.0, with Tobs (`@botharness/core`).
- **memv2 running**, at an address the plugin knows (default `http://127.0.0.1:8766`, port 8766 on this machine). Every Bot needs a read-only token, its library card so to speak: memv2's administrator issues it and decides at that moment which partitions it may read. The token lives in a file; the config only holds that file's path.
- **Javis running**, at an address the plugin knows (default `http://127.0.0.1:8765/mcp`). Every Bot has a profile naming the accounts it may see and the file that holds Javis's token (format in the javmem-mcp README).

**Note**: the SQLite under memv2 and the Graphiti and Neo4j under Javis are public and can be installed; memv2 and Javis themselves are not publicly released at the moment, and the plugin talks to their own query interfaces. So SQLite, Graphiti and Neo4j alone are not enough: the plugin finds nothing without memv2 and Javis.

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
| `bots` | Bots by id. The id is the Bot's folder name under `botharness/bots/` in the DSH home (`bot-` plus 32 hex digits). `memory` = the five combined tools (with both stores' settings inside); `memv2`, `javis` = the tools of each store apart, and a store left out gives no tools. Give a Bot either `memory` or `memv2`/`javis`: a Bot given both gets only the `memory` tools, with a warning. `off: true` parks a Bot |
| `env` | settings sent with every call, such as `MEMORY_OWNER` (how the tool text names the memory's owner), `MEMV2_URL`, `JAVIS_URL`, `MEMORY_LABELS_FILE` |
| `configFile` | optional: a JSON file with the fields above instead, re-read when it changes, no restart |
| `logFile` | optional: the log file's path |
| `prefix` | optional: tool name prefixes, default `memory_`, `memv2_`, `javis_` |
| `servers` | optional: paths to your own `memory-mcp.js`, `memv2-mcp.js`, `javis-mcp.js` |
| `statusTool` | optional: the status tool's name, default `memory_status`; `false` = none |

Only settings starting with `MEMV2_`, `JAVIS_` or `MEMORY_` are used; the config holds paths and settings, never tokens.

### When the config has mistakes

The plugin still loads, and what is usable is used; every mistake is one warning line in `logFile` and in DSH's error output, checked at start and on every config reload. Warnings name keys and paths, never values or tokens. They cover:

- a Bot given both `memory` and `memv2`/`javis` (it gets the `memory` tools only);
- dropped settings: names not starting with `MEMV2_`, `JAVIS_` or `MEMORY_`, or values that are not text;
- unknown fields, such as `moode` for `mode`, or a row-only field written in the `configFile`;
- missing files: token files, the token file a Javis profile names in `JAVIS_TOKEN_FROM`, the hide list, the verdict file, the labels file, and the `configFile` itself;
- a Bot id this DSH's Tobs does not know; a `mode` that is neither `'on'` nor `'off'`; a Bot that names no store.

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
