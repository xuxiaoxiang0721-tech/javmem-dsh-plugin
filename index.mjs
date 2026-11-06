// javmem-dsh-plugin: read-only memory tools for the Bots of DeepSeek Harness (Tobs), with no private MCP card,
// token form or approval per Bot.
//
// For every Bot listed in the config, Tobs's per-Bot agent setup (botharness contributeBotAgentSetup: the front
// desk and its Assignments) registers the tools of the bundled MCP servers: mcp/memory-mcp.js (both stores in five
// tools, as memory_<tool>), or mcp/memv2-mcp.js (memv2 fact memory) and mcp/javis-mcp.js (Javis memory graph) as
// memv2_<tool> and javis_<tool>. Names, descriptions and arguments
// are the servers' own (catalog.json, refreshed from their tools/list at load). Each call starts the server with
// that Bot's settings (its memv2 token file, its Javis profile) plus the shared env, asks the one tool and lets it
// end, so a Bot sees exactly what its token and profile allow, and a Bot added to the config has memory from its
// next session on.
//
// Config (the cordis row's config, or a JSON file named by configFile that is re-read when it changes):
//   mode     'on' | 'off' (off registers nothing)
//   bots     { <bot slug>: { name, off?, memory?: { ENV: value }, memv2?: { ENV: value }, javis?: { ENV: value } } }
//            A slug is a Bot's folder name under <DSH home>/botharness/bots (bot-<32 hex>). memory = the combined
//            server's five tools (give it both MEMV2_* and JAVIS_* settings); memv2 / javis = the single-store
//            servers' tools. Give a Bot either memory or memv2/javis, not both: a Bot given both gets only the memory
//            tools. Values are paths and settings, never tokens.
// Config mistakes never stop the plugin. Each one is named in a warning line (log file and stderr) at load and on
// every reload: a Bot given both tool sets, a dropped setting, an unknown field, a file setting whose file is
// missing, a Bot id this DSH does not know. Warnings carry key names and paths only, never values or tokens.
//   env      { ENV: value } given to every call (e.g. MEMORY_OWNER, MEMV2_URL, JAVIS_URL)
//   prefix   { memv2: 'memv2_', javis: 'javis_' }
//   servers  { memv2: <path to memv2-mcp.js>, javis: <path to javis-mcp.js> } (default: the bundled copies)
//   configFile, catalogFile, logFile, callMs (logFile: optional; one line per call with bot, tool, milliseconds and
//            answer size, never arguments or memory text)
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineTool } from '@deepseek-ai/dsh-tools';

export const name = 'javmem-dsh-plugin';

const HERE = dirname(fileURLToPath(import.meta.url));
// The package's own version, read from package.json so the two cannot drift apart.
export const VERSION = (() => {
  try { return String(JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8')).version); } catch { return 'unknown'; }
})();
export const DEFAULTS = {
  catalogFile: join(HERE, 'catalog.json'),
  servers: {
    memv2: join(HERE, 'mcp', 'memv2-mcp.js'),
    javis: join(HERE, 'mcp', 'javis-mcp.js'),
    memory: join(HERE, 'mcp', 'memory-mcp.js'),
  },
  prefix: { memv2: 'memv2_', javis: 'javis_', memory: 'memory_' },
  callMs: 120000,
};
// memory = the combined server (both stores in five tools); memv2 and javis = the single-store servers.
const STORES = ['memv2', 'javis', 'memory'];
// The servers' own settings come only from the config, never from the host's environment.
const OWN_ENV = /^(MEMV2_|JAVIS_|MEMORY_)/;

function logger(file) {
  if (!file) return () => {};
  return (line) => {
    try { appendFileSync(file, `${new Date().toISOString()} javmem ${line}\n`, 'utf8'); } catch { /* best effort */ }
  };
}

// Fields a config may carry: FILE_FIELDS in a configFile or the row, ROW_FIELDS only in the cordis row (call and now
// are for tests), BOT_FIELDS in one Bot's entry.
const FILE_FIELDS = ['mode', 'bots', 'env'];
const ROW_FIELDS = ['configFile', 'catalogFile', 'logFile', 'callMs', 'prefix', 'servers', 'call', 'now'];
const BOT_FIELDS = ['name', 'off', ...STORES];
// Settings that name a file, with what a missing file means for the Bot.
const FILE_SETTINGS = {
  MEMV2_TOKEN_FILE: 'memv2 calls will fail',
  JAVIS_TOKEN_FILE: 'Javis calls will fail',
  MEMORY_LABELS_FILE: 'no cross-check marks',
  JAVIS_HIDE_FILE: 'nothing is hidden',
  JAVIS_VERIFY_FILE: 'facts get the rule check only',
};
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The usable part of a config object (row config or file), and what was wrong with it. overlap names the Bots given
 * both the combined server and a single-store one: they get the memory tools only. problems lists every mistake as
 * { bot: slug or null, text } with key names, never values.
 */
export function normalizeConfig(raw = {}, from = 'row') {
  const problems = [];
  const note = (text, bot = null) => problems.push({ bot, text });
  const input = isObject(raw) ? raw : {};
  const known = from === 'file' ? FILE_FIELDS : [...FILE_FIELDS, ...ROW_FIELDS];
  for (const key of Object.keys(input)) {
    if (!known.includes(key)) note(`unknown field ${key}${from === 'file' ? ' in configFile' : ''}`);
  }
  // Only MEMV2_/JAVIS_/MEMORY_ settings with text values reach the servers; every other key is named and dropped.
  const settings = (obj, where, bot) => {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!OWN_ENV.test(k)) note(`dropped setting ${where}.${k} (only MEMV2_, JAVIS_ and MEMORY_ settings are used)`, bot);
      else if (typeof v !== 'string') note(`dropped setting ${where}.${k} (the value is not text)`, bot);
      else out[k] = v;
    }
    return out;
  };
  const bots = {};
  const overlap = [];
  if (input.bots !== undefined && !isObject(input.bots)) note('bots is not a list of Bots, so no Bot gets tools');
  for (const [slug, b] of Object.entries(isObject(input.bots) ? input.bots : {})) {
    const where = `bots.${slug}`;
    if (!isObject(b)) { note(`${where} is not a set of settings, so this Bot is skipped`, slug); continue; }
    for (const key of Object.keys(b)) if (!BOT_FIELDS.includes(key)) note(`unknown field ${where}.${key}`, slug);
    if (b.off === true) continue; // "off": true parks a Bot without removing it
    const entry = { name: String(b.name || slug) };
    for (const store of STORES) {
      if (b[store] === undefined || b[store] === null) continue;
      if (!isObject(b[store])) { note(`${where}.${store} is not a set of settings, so it is ignored`, slug); continue; }
      entry[store] = settings(b[store], `${where}.${store}`, slug);
    }
    if (entry.memory && (entry.memv2 || entry.javis)) {
      overlap.push(entry.name);
      note(`bot="${entry.name}" has both memory and memv2/javis set; only the memory tools are registered`, slug);
      delete entry.memv2;
      delete entry.javis;
    }
    if (!STORES.some((s) => entry[s])) note(`bot="${entry.name}" names no store (memory, memv2 or javis), so it gets no tools`, slug);
    bots[slug] = entry;
  }
  // YAML 1.1 readers turn a bare on/off into a boolean.
  const mode = input.mode === 'on' || input.mode === true ? 'on' : 'off';
  if (input.mode !== undefined && !['on', 'off', true, false].includes(input.mode)) {
    note(`mode is neither 'on' nor 'off', so the plugin is off`);
  }
  let env = {};
  if (input.env !== undefined && !isObject(input.env)) note('env is not a set of settings, so it is ignored');
  else if (input.env !== undefined) env = settings(input.env, 'env', null);
  return { mode, bots, env, from, overlap, problems };
}

// The JAVIS_TOKEN_FROM line of a Javis Bot profile (the file that holds the token), if it has one. Only that line is
// read; nothing of the file is logged but the path.
function tokenFrom(profile) {
  try {
    const line = readFileSync(profile, 'utf8').split(/\r?\n/).find((l) => /^\s*(export\s+)?JAVIS_TOKEN_FROM\s*=/.test(l));
    return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2').trim() : '';
  } catch {
    return '';
  }
}

/** File settings (token files, the Javis profile's token file, hide list, verdicts, labels) whose file is missing. */
export function fileProblems(config, exists = existsSync) {
  const problems = [];
  const check = (env, where, bot) => {
    for (const [key, effect] of Object.entries(FILE_SETTINGS)) {
      const file = env[key];
      if (!file) continue;
      if (!exists(file)) {
        problems.push({ bot, text: `missing file ${where}.${key}=${file} (${effect})` });
      } else if (key === 'JAVIS_TOKEN_FILE') {
        const from = tokenFrom(file);
        if (from && !exists(from)) problems.push({ bot, text: `missing file JAVIS_TOKEN_FROM=${from}, named in ${where}.${key}=${file} (${effect})` });
      }
    }
  };
  check(config.env, 'env', null);
  for (const [slug, bot] of Object.entries(config.bots)) {
    for (const store of STORES) if (bot[store]) check(bot[store], `bots.${slug}.${store}`, slug);
  }
  return problems;
}

/** Bots listed by an id this DSH's Tobs does not know (needs its registry; none is checked without one). */
export function botProblems(config, registry) {
  if (!registry || typeof registry.get !== 'function') return [];
  const problems = [];
  for (const slug of Object.keys(config.bots)) {
    let known = true;
    try { known = registry.get(slug) !== undefined; } catch { /* a registry that cannot answer: do not guess */ }
    if (!known) problems.push({ bot: slug, text: `no Bot ${slug} in this DSH (bots.${slug}), so nobody gets these tools` });
  }
  return problems;
}

/** Each problem as one warning line, in the log file (if any) and on stderr, so it shows without a log file. */
function warn(problems, log) {
  for (const p of problems) {
    const line = `warning ${p.text}`;
    log(line);
    console.warn(`${name}: ${line}`);
  }
}

function readConfig(file, fallback) {
  if (!file) return normalizeConfig(fallback, 'row');
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    const c = normalizeConfig(fallback, 'row');
    c.problems.unshift({ bot: null, text: `missing file configFile=${file} (the row's own mode, bots and env are used)` });
    return c;
  }
  try {
    return normalizeConfig(JSON.parse(text.replace(/^﻿/, '')), 'file');
  } catch {
    const c = normalizeConfig(fallback, 'row');
    c.problems.unshift({ bot: null, text: `configFile=${file} is not valid JSON (the row's own mode, bots and env are used)` });
    return c;
  }
}

/** Tool arguments as dsh-tools parameter specs (types, descriptions, enums, required). */
export function parameters(schema) {
  const out = {};
  const required = new Set(schema?.required || []);
  for (const [key, p] of Object.entries(schema?.properties || {})) {
    if (!['string', 'integer', 'number', 'boolean'].includes(p?.type)) continue;
    const spec = { type: p.type };
    if (p.description) spec.description = String(p.description);
    if (Array.isArray(p.enum)) spec.enum = p.enum;
    if (required.has(key)) spec.required = true;
    out[key] = spec;
  }
  return out;
}

/**
 * Start an MCP server script with `env`, run one request (tools/list when `tool` is null, else tools/call) and end
 * it. Resolves with the JSON-RPC result; rejects on a timeout, the call being cancelled, or the server failing.
 */
export function callServer(script, env, tool, args, { signal, timeoutMs = DEFAULTS.callMs } = {}) {
  return new Promise((resolve, reject) => {
    const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !OWN_ENV.test(k)));
    const child = spawn(process.execPath, [script], { env: { ...base, ...env }, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    let buffer = '';
    let done = false;
    const finish = (error, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      try { child.stdin.end(); } catch { /* closed */ }
      const killer = setTimeout(() => { try { child.kill(); } catch { /* gone */ } }, 3000);
      killer.unref?.();
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('timeout')), timeoutMs);
    const onAbort = () => finish(new Error('cancelled'));
    if (signal?.aborted) { finish(new Error('cancelled')); return; }
    signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', (e) => finish(e));
    child.on('exit', (code) => finish(new Error(`server exited (${code})`)));
    const send = (msg) => { try { child.stdin.write(`${JSON.stringify(msg)}\n`); } catch (e) { finish(e); } };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      for (let i = buffer.indexOf('\n'); i >= 0; i = buffer.indexOf('\n')) {
        const line = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 1) {
          if (msg.error) { finish(new Error(msg.error.message || 'initialize failed')); return; }
          send({ jsonrpc: '2.0', method: 'notifications/initialized' });
          send(tool === null
            ? { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }
            : { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args ?? {} } });
        } else if (msg.id === 2) {
          if (msg.error) finish(new Error(msg.error.message || 'call failed'));
          else finish(null, msg.result);
        }
      }
    });
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name, version: VERSION } } });
  });
}

const catalogKey = (c) => JSON.stringify(STORES.map((s) => (c[s] || []).map((t) => [t.name, t.description, t.inputSchema])));

function readCatalog(file) {
  try {
    const c = JSON.parse(readFileSync(file, 'utf8'));
    return Object.fromEntries(STORES.map((s) => [s, Array.isArray(c[s]) ? c[s] : []]));
  } catch {
    return Object.fromEntries(STORES.map((s) => [s, []]));
  }
}

function toolFor(store, t, bot, role, opts, sharedEnv, log) {
  return defineTool({
    name: `${opts.prefix[store]}${t.name}`,
    description: t.description,
    parameters: parameters(t.inputSchema),
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      exec?.signal?.throwIfAborted?.();
      const started = Date.now();
      const tag = `bot="${bot.name}" role=${role} tool=${opts.prefix[store]}${t.name}`;
      let result;
      try {
        result = await opts.call(opts.servers[store], { ...sharedEnv(), ...bot[store] }, t.name, args,
          { signal: exec?.signal, timeoutMs: opts.callMs });
      } catch (e) {
        log(`call ${tag} ms=${Date.now() - started} failed=${String(e?.message || e).slice(0, 80)}`);
        throw new Error(`${{ memv2: 'memv2', javis: 'Javis', memory: '记忆工具' }[store]}这次没有回应（${String(e?.message || e).slice(0, 80)}），可以稍后再试。`);
      }
      const text = (result?.content || []).filter((c) => c?.type === 'text').map((c) => c.text).join('\n');
      log(`call ${tag} ms=${Date.now() - started} chars=${text.length}${result?.isError ? ' error' : ''}`);
      if (result?.isError) throw new Error(text || '查询出错。');
      return text;
    },
  });
}

/** The cordis plugin. Tests may pass rowConfig.call (replaces callServer) and rowConfig.now (replaces Date.now). */
export function apply(ctx, rowConfig = {}) {
  const opts = {
    ...DEFAULTS, ...rowConfig,
    servers: { ...DEFAULTS.servers, ...(rowConfig.servers || {}) },
    prefix: { ...DEFAULTS.prefix, ...(rowConfig.prefix || {}) },
  };
  opts.call = rowConfig.call || callServer;
  const now = rowConfig.now || Date.now;
  const log = logger(opts.logFile);
  let registry = null; // Tobs's Bot registry, once the botharness service is there
  const check = (c) => warn([...c.problems, ...fileProblems(c), ...botProblems(c, registry)], log);
  let config = readConfig(opts.configFile, rowConfig);
  let configMtime = mtime(opts.configFile);
  let checkedAt = now();
  let catalog = readCatalog(opts.catalogFile);
  log(`started v=${VERSION} mode=${config.mode} bots=${Object.keys(config.bots).length} from=${config.from} `
    + `tools=${STORES.map((s) => `${s}:${catalog[s].length}`).join(',')}`);
  check(config);

  // Refresh the catalog from the servers themselves (with the shared env, so MEMORY_OWNER shows in the text).
  Promise.all(STORES.map((s) => opts.call(opts.servers[s], config.env, null, null, { timeoutMs: 30000 })
    .then((r) => (Array.isArray(r?.tools) ? r.tools.map(({ name: n, description, inputSchema }) => ({ name: n, description, inputSchema })) : null))
    .catch(() => null)))
    .then((lists) => {
      const fresh = { ...catalog };
      STORES.forEach((s, i) => { if (lists[i] && lists[i].length) fresh[s] = lists[i]; });
      if (catalogKey(fresh) !== catalogKey(catalog)) {
        catalog = fresh;
        log(`catalog refreshed from the servers tools=${STORES.map((s) => `${s}:${catalog[s].length}`).join(',')}`);
      }
    });

  const current = () => {
    if (opts.configFile && now() - checkedAt >= 2000) {
      checkedAt = now();
      const m = mtime(opts.configFile);
      if (m !== configMtime) {
        configMtime = m;
        config = readConfig(opts.configFile, rowConfig);
        log(`config reloaded mode=${config.mode} bots=${Object.keys(config.bots).length} from=${config.from}`);
        check(config);
      }
    }
    return config;
  };

  // Runs inside Tobs's agent setup: nothing may throw from here, or the Bot's session would not start.
  const setup = (agentCtx, _agent, info) => {
    try {
      const c = current();
      if (c.mode !== 'on') return;
      const bot = c.bots[info?.botSlug];
      if (!bot) return;
      let count = 0;
      for (const store of STORES) {
        if (!bot[store]) continue;
        for (const t of catalog[store]) {
          try {
            agentCtx.tools.register(toolFor(store, t, bot, info.rootRole || 'unknown', opts, () => current().env, log));
            count += 1;
          } catch (e) {
            log(`register failed bot="${bot.name}" tool=${opts.prefix[store]}${t.name} ${String(e?.message || e).slice(0, 120)}`);
          }
        }
      }
      log(`tools bot="${bot.name}" role=${info.rootRole || 'unknown'} count=${count}`);
    } catch (e) {
      log(`setup failed bot=${info?.botSlug} ${String(e?.message || e).slice(0, 120)}`);
    }
  };

  ctx.inject(['botharness'], (scope) => {
    registry = scope.botharness?.registry ?? null;
    warn(botProblems(current(), registry), log);
    scope.effect(() => scope.botharness.contributeBotAgentSetup(setup), `${name}: per-Bot memory tools`);
  });
}

function mtime(file) {
  if (!file) return 0;
  try { return statSync(file).mtimeMs; } catch { return 0; }
}
