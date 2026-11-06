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
//   bots     { <Bot id or name>: { name?, off?, memory?: { ENV: value }, memv2?: { ENV: value }, javis?: { ENV: value } } }
//            A Bot id (slug) is its folder name under <DSH home>/botharness/bots (bot-<32 hex>); a key that is not a
//            known id is looked up as a Bot name in Tobs's registry. memory = the combined server's five tools (give it
//            both MEMV2_* and JAVIS_* settings); memv2 / javis = the single-store servers' tools. Give a Bot either
//            memory or memv2/javis, not both: a Bot given both gets only the memory tools. Values are paths and
//            settings, never tokens.
//   template { memory?|memv2?|javis?: { ENV: value } } the stores of every listed Bot whose entry names none; within
//            a store the Bot's own settings win. {name} and {slug} in a value become the Bot's name (characters a path
//            cannot hold become _) and id, e.g. MEMV2_TOKEN_FILE: 'D:\memory\tokens\{name}.token'.
// Config mistakes never stop the plugin. Each one is named in a warning line (log file and stderr) at load and on
// every reload: a Bot given both tool sets, a dropped setting, an unknown field, a file setting whose file is
// missing, a Bot id or name this DSH does not know. Warnings carry key names and paths only, never values or tokens.
//   env      { ENV: value } given to every call (e.g. MEMORY_OWNER, MEMV2_URL, JAVIS_URL)
//   prefix   { memv2: 'memv2_', javis: 'javis_' }
//   servers  { memv2: <path to memv2-mcp.js>, javis: <path to javis-mcp.js> } (default: the bundled copies)
//   statusTool  the name of the status tool every listed Bot also gets (default memory_status; false = none): its
//            tools, each store's state, its files, its config warnings and its last calls' times, no token and no
//            memory text
//   keepAlive, idleMs, maxProcesses  each Bot and store keeps one server process (keepAlive, default true; false =
//            one process per call): it exits after idleMs without calls (default 300000), at most maxProcesses run at
//            once (default 8; the least recently used idle one makes room, and when all are busy a call gets a one-off
//            process), and a process that dies mid-call is replaced and the call tried once more
//   configFile, catalogFile, logFile, callMs (logFile: optional; one line per call with bot, tool, milliseconds and
//            answer size, never arguments or memory text; process start, stop and exit lines)
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
  statusTool: 'memory_status',
  callMs: 120000,
  keepAlive: true,
  idleMs: 300000,
  maxProcesses: 8,
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
const FILE_FIELDS = ['mode', 'bots', 'env', 'template'];
const ROW_FIELDS = ['configFile', 'catalogFile', 'logFile', 'callMs', 'prefix', 'servers', 'statusTool',
  'keepAlive', 'idleMs', 'maxProcesses', 'call', 'now'];
const BOT_FIELDS = ['name', 'off', ...STORES];
// Tobs's own pattern for a Bot id (slug).
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
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
 * The usable part of a config object (row config or file), and what was wrong with it. bots stays keyed as written
 * (a Bot id or a Bot name; resolveBots turns the keys into ids). overlap names the Bots given both the combined server
 * and a single-store one: they get the memory tools only. problems lists every mistake as { bot: key or null, text }
 * with key names, never values.
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
  // The stores of a template or of one Bot's entry, with the memory-or-single-store rule applied.
  const storesOf = (obj, where, bot, onBoth) => {
    const out = {};
    for (const store of STORES) {
      if (obj[store] === undefined || obj[store] === null) continue;
      if (!isObject(obj[store])) { note(`${where}.${store} is not a set of settings, so it is ignored`, bot); continue; }
      out[store] = settings(obj[store], `${where}.${store}`, bot);
    }
    if (out.memory && (out.memv2 || out.javis)) {
      onBoth();
      delete out.memv2;
      delete out.javis;
    }
    return out;
  };
  // template: store settings every listed Bot gets when its own entry names no store; {name} and {slug} in a value
  // become the Bot's name and id.
  let template = {};
  if (input.template !== undefined && !isObject(input.template)) note('template is not a set of stores, so it is ignored');
  else if (input.template !== undefined) {
    for (const key of Object.keys(input.template)) if (!STORES.includes(key)) note(`unknown field template.${key}`);
    template = storesOf(input.template, 'template', null,
      () => note('template has both memory and memv2/javis; only memory is used'));
  }
  const bots = {};
  const overlap = [];
  if (input.bots !== undefined && !isObject(input.bots)) note('bots is not a list of Bots, so no Bot gets tools');
  for (const [key, b] of Object.entries(isObject(input.bots) ? input.bots : {})) {
    const where = `bots.${key}`;
    if (!isObject(b)) { note(`${where} is not a set of settings, so this Bot is skipped`, key); continue; }
    for (const field of Object.keys(b)) if (!BOT_FIELDS.includes(field)) note(`unknown field ${where}.${field}`, key);
    if (b.off === true) continue; // "off": true parks a Bot without removing it
    const label = String(b.name || key);
    const entry = storesOf(b, where, key, () => {
      overlap.push(label);
      note(`bot="${label}" has both memory and memv2/javis set; only the memory tools are registered`, key);
    });
    if (b.name) entry.name = String(b.name);
    if (!STORES.some((s) => entry[s] || template[s])) note(`bot="${label}" names no store (memory, memv2 or javis), so it gets no tools`, key);
    bots[key] = entry;
  }
  // YAML 1.1 readers turn a bare on/off into a boolean.
  const mode = input.mode === 'on' || input.mode === true ? 'on' : 'off';
  if (input.mode !== undefined && !['on', 'off', true, false].includes(input.mode)) {
    note(`mode is neither 'on' nor 'off', so the plugin is off`);
  }
  let env = {};
  if (input.env !== undefined && !isObject(input.env)) note('env is not a set of settings, so it is ignored');
  else if (input.env !== undefined) env = settings(input.env, 'env', null);
  return { mode, bots, env, template, from, overlap, problems };
}

// A Bot name as it may stand in a path: characters that paths cannot hold (or that would make it a folder) become _.
const pathSafe = (s) => String(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();

/**
 * One Bot's final store settings: its own stores, or the template's when its entry names none; within a store the
 * template's settings (with {name} and {slug} filled in) sit under the Bot's own.
 */
function materialize(entry, name, slug, template = {}) {
  const own = STORES.filter((s) => entry[s]);
  const stores = own.length ? own : STORES.filter((s) => template[s]);
  const fill = (v) => v.replaceAll('{name}', pathSafe(name)).replaceAll('{slug}', slug);
  const out = { name };
  for (const s of stores) {
    out[s] = {
      ...Object.fromEntries(Object.entries(template[s] || {}).map(([k, v]) => [k, fill(v)])),
      ...(entry[s] || {}),
    };
  }
  return out;
}

/**
 * The config's Bots keyed by Bot id. A key is a Bot id, or a Bot name that Tobs's registry knows (exactly one Bot of
 * that name, or of that name ignoring case and spaces at the ends). Without a registry an id-shaped key is taken as
 * an id and a name waits. problems names what could not be resolved, with config keys only.
 */
export function resolveBots(config, registry) {
  const bots = {};
  const problems = [];
  let records = null;
  const list = () => {
    if (records === null) {
      try { records = typeof registry?.list === 'function' ? (registry.list() || []) : []; } catch { records = []; }
    }
    return records;
  };
  const byId = (key) => {
    try { return typeof registry?.get === 'function' ? registry.get(key) : undefined; } catch { return undefined; }
  };
  for (const [key, entry] of Object.entries(config.bots)) {
    let slug = null;
    let record;
    if (registry) {
      record = byId(key);
      if (record) {
        slug = key;
      } else {
        const exact = list().filter((r) => r && r.name === key);
        const near = exact.length ? exact : list().filter((r) => r && typeof r.name === 'string'
          && r.name.trim().toLowerCase() === key.trim().toLowerCase());
        if (near.length === 1 && near[0].slug) {
          [record] = near;
          slug = record.slug;
        } else if (near.length > 1) {
          problems.push({ bot: key, text: `several Bots are named ${key} (bots.${key}), so list it by its id: ${near.map((r) => r.slug).join(', ')}` });
          continue;
        } else {
          problems.push({ bot: key, text: SLUG.test(key)
            ? `no Bot ${key} in this DSH (bots.${key}), so nobody gets these tools`
            : `no Bot named ${key} in this DSH (bots.${key}), so nobody gets these tools` });
          continue;
        }
      }
    } else if (SLUG.test(key)) {
      slug = key;
    } else {
      continue; // a name needs the registry
    }
    if (bots[slug]) {
      problems.push({ bot: key, text: `bots.${key} is the same Bot as bots.${bots[slug].key} (${slug}); only the first counts` });
      continue;
    }
    bots[slug] = { ...materialize(entry, entry.name || record?.name || key, slug, config.template), key };
  }
  return { bots, problems };
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

/**
 * The file settings in env (token files, hide list, verdicts, labels), plus the token file a Javis profile names in
 * JAVIS_TOKEN_FROM, each with whether its file is there. where = the config path of env, for messages.
 */
export function fileChecks(env, where, exists = existsSync) {
  const out = [];
  for (const [key, effect] of Object.entries(FILE_SETTINGS)) {
    const file = env[key];
    if (!file) continue;
    const there = exists(file);
    out.push({ key, file, there, effect, text: `${where}.${key}=${file}` });
    const from = there && key === 'JAVIS_TOKEN_FILE' ? tokenFrom(file) : '';
    if (from) out.push({ key: 'JAVIS_TOKEN_FROM', file: from, there: exists(from), effect, text: `JAVIS_TOKEN_FROM=${from}, named in ${where}.${key}=${file}` });
  }
  return out;
}

/** File settings (token files, the Javis profile's token file, hide list, verdicts, labels) whose file is missing. */
export function fileProblems(config, exists = existsSync) {
  const problems = [];
  const check = (env, where, bot) => {
    for (const c of fileChecks(env, where, exists)) if (!c.there) problems.push({ bot, text: `missing file ${c.text} (${c.effect})` });
  };
  check(config.env, 'env', null);
  for (const [slug, bot] of Object.entries(config.bots)) {
    for (const store of STORES) if (bot[store]) check(bot[store], `bots.${slug}.${store}`, slug);
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
 * Start an MCP server script with `env`, run one request (tools/list when `tool` is null, else tools/call; `method`
 * sends that request with `args` as its params instead) and end it. Resolves with the JSON-RPC result; rejects on a
 * timeout, the call being cancelled, or the server failing.
 */
export function callServer(script, env, tool, args, { signal, timeoutMs = DEFAULTS.callMs, method } = {}) {
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
          if (method) send({ jsonrpc: '2.0', id: 2, method, params: args ?? {} });
          else if (tool === null) send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
          else send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args ?? {} } });
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

const childEnv = (env) => ({ ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !OWN_ENV.test(k))), ...env });
const gone = (reason) => Object.assign(new Error(`server exited (${reason})`), { gone: true });

/**
 * One long-lived MCP server process for one script and one env, so for one Bot and one store: the handshake once,
 * then any number of requests, several at a time. Its handles are unref'd, so it never keeps the host running by
 * itself; a request's own timer does while it waits.
 */
class Server {
  constructor(script, env, onExit) {
    this.pending = new Map();
    this.nextId = 2;
    this.closing = false;
    this.child = spawn(process.execPath, [script], { env: childEnv(env), stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    this.pid = this.child.pid;
    for (const handle of [this.child, this.child.stdin, this.child.stdout]) handle?.unref?.();
    let buffer = '';
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => {
      buffer += chunk;
      for (let i = buffer.indexOf('\n'); i >= 0; i = buffer.indexOf('\n')) {
        const line = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        const waiting = this.pending.get(msg.id);
        if (waiting) waiting(msg.error ? new Error(msg.error.message || 'call failed') : null, msg.result);
      }
    });
    const end = (reason) => {
      if (this.reason) return;
      this.reason = reason;
      for (const waiting of [...this.pending.values()]) waiting(gone(reason));
      onExit(this, reason);
    };
    this.child.on('exit', (code) => end(`code ${code}`));
    this.child.on('error', (e) => end(e?.code || 'spawn failed'));
    this.child.stdin.on('error', () => { /* a write after the server died; exit tells */ });
    this.ready = this.request('initialize', {
      protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name, version: VERSION } }, 30000)
      .then(() => this.write({ jsonrpc: '2.0', method: 'notifications/initialized' }));
    this.ready.catch(() => { /* each caller sees it */ });
  }

  get usable() { return !this.reason && !this.closing; }

  write(msg) {
    try { this.child.stdin.write(`${JSON.stringify(msg)}\n`); } catch { /* exit tells */ }
  }

  /** One JSON-RPC request; a timeout also ends the process, since a server that hangs once may hang again. */
  request(method, params, timeoutMs, signal) {
    return new Promise((resolve, reject) => {
      if (this.reason) { reject(gone(this.reason)); return; }
      if (signal?.aborted) { reject(new Error('cancelled')); return; }
      const id = method === 'initialize' ? 1 : this.nextId++;
      let timer;
      const onAbort = () => settle(new Error('cancelled'));
      const settle = (error, value) => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (error) reject(error); else resolve(value);
      };
      this.pending.set(id, settle);
      timer = setTimeout(() => { settle(new Error('timeout')); this.stop(); }, timeoutMs);
      signal?.addEventListener('abort', onAbort, { once: true });
      this.write({ jsonrpc: '2.0', id, method, params });
    });
  }

  /** Close stdin (the server answers what it holds, then exits); kill it if it is still there 3 seconds later. */
  stop() {
    if (this.closing) return;
    this.closing = true;
    try { this.child.stdin.end(); } catch { /* closed */ }
    const killer = setTimeout(() => { try { this.child.kill(); } catch { /* gone */ } }, 3000);
    killer.unref?.();
  }
}

/**
 * Long-lived server processes, one per script and env (per Bot and store, so Bots stay apart), with callServer's
 * signature. An idle process exits after idleMs. At max processes the least recently used idle one is stopped to make
 * room; when every one is busy the call runs in a one-off process. A process that dies before it answers is replaced
 * and the call is tried once more on the new one; a call that times out ends its process.
 */
export function createPool({ idleMs = DEFAULTS.idleMs, max = DEFAULTS.maxProcesses, log = () => {} } = {}) {
  const servers = new Map(); // key -> Server
  const keyOf = (script, env) => `${script}\n${JSON.stringify(Object.keys(env).sort().map((k) => [k, env[k]]))}`;
  const retire = (server, reason) => {
    clearTimeout(server.idle);
    if (servers.get(server.key) === server) servers.delete(server.key);
    if (server.usable) log(`process stop ${server.label} pid=${server.pid} reason=${reason}`);
    server.stop();
  };
  const idleLater = (server) => {
    server.used = Date.now();
    clearTimeout(server.idle);
    if (!server.usable || server.pending.size) return;
    server.idle = setTimeout(() => retire(server, 'idle'), idleMs);
    server.idle.unref?.();
  };
  const get = (script, env, label) => {
    const key = keyOf(script, env);
    const have = servers.get(key);
    if (have?.usable) {
      clearTimeout(have.idle);
      return have;
    }
    if (servers.size >= max) {
      const idle = [...servers.values()].filter((s) => !s.pending.size).sort((a, b) => a.used - b.used)[0];
      if (!idle) return null;
      retire(idle, 'cap');
    }
    const server = new Server(script, env, (s, reason) => {
      if (servers.get(s.key) === s) servers.delete(s.key);
      if (!s.closing) log(`process exited ${s.label} pid=${s.pid} ${reason}`);
    });
    Object.assign(server, { key, label: label || 'server', used: Date.now() });
    servers.set(key, server);
    log(`process start ${server.label} pid=${server.pid}`);
    return server;
  };
  async function call(script, env, tool, args, { signal, timeoutMs = DEFAULTS.callMs, method, label } = {}) {
    const [m, params] = method ? [method, args ?? {}]
      : tool === null ? ['tools/list', {}] : ['tools/call', { name: tool, arguments: args ?? {} }];
    for (let attempt = 0; ; attempt += 1) {
      const server = get(script, env || {}, label);
      if (!server) return callServer(script, env, tool, args, { signal, timeoutMs, method });
      try {
        await server.ready;
        return await server.request(m, params, timeoutMs, signal);
      } catch (e) {
        if (e?.gone && attempt === 0 && !signal?.aborted) continue;
        throw e;
      } finally {
        idleLater(server);
      }
    }
  }
  return {
    call,
    size: () => servers.size,
    pids: () => [...servers.values()].map((s) => s.pid),
    close: () => { for (const s of [...servers.values()]) retire(s, 'closed'); },
  };
}

const catalogKey =(c) => JSON.stringify(STORES.map((s) => (c[s] || []).map((t) => [t.name, t.description, t.inputSchema])));

function readCatalog(file) {
  try {
    const c = JSON.parse(readFileSync(file, 'utf8'));
    return Object.fromEntries(STORES.map((s) => [s, Array.isArray(c[s]) ? c[s] : []]));
  } catch {
    return Object.fromEntries(STORES.map((s) => [s, []]));
  }
}

const textOutput = { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] };

// who = { slug, bot, role }; deps = { opts, sharedEnv, log, record(slug, { tool, ms, ok }) }.
function toolFor(store, t, who, deps) {
  const { opts, sharedEnv, log, record } = deps;
  const toolName = `${opts.prefix[store]}${t.name}`;
  return defineTool({
    name: toolName,
    description: t.description,
    parameters: parameters(t.inputSchema),
    output: textOutput,
    async execute(args, exec) {
      exec?.signal?.throwIfAborted?.();
      const started = Date.now();
      const tag = `bot="${who.bot.name}" role=${who.role} tool=${toolName}`;
      let result;
      try {
        result = await opts.call(opts.servers[store], { ...sharedEnv(), ...who.bot[store] }, t.name, args,
          { signal: exec?.signal, timeoutMs: opts.callMs, label: `bot="${who.bot.name}" store=${store}` });
      } catch (e) {
        const ms = Date.now() - started;
        record(who.slug, { tool: toolName, ms, ok: false });
        log(`call ${tag} ms=${ms} failed=${String(e?.message || e).slice(0, 80)}`);
        throw new Error(`${{ memv2: 'memv2', javis: 'Javis', memory: '记忆工具' }[store]}这次没有回应（${String(e?.message || e).slice(0, 80)}），可以稍后再试。`);
      }
      const ms = Date.now() - started;
      const text = (result?.content || []).filter((c) => c?.type === 'text').map((c) => c.text).join('\n');
      record(who.slug, { tool: toolName, ms, ok: !result?.isError });
      log(`call ${tag} ms=${ms} chars=${text.length}${result?.isError ? ' error' : ''}`);
      if (result?.isError) throw new Error(text || '查询出错。');
      return text;
    },
  });
}

const STORE_LABEL = { memv2: 'memv2', javis: 'Javis' };
const STATE_TEXT = {
  ok: '连得上，令牌可用',
  bad_token: '连得上，但令牌不对',
  down: '连不上',
  no_token: '令牌没配好',
  error: '出错了',
};
const HIDE_TEXT = { ok: '隐藏名单可读', none: '没有隐藏名单', unreadable: '隐藏名单读不了，这样 Javis 一条都不会查' };
const LABELS_TEXT = { ok: '两库对照标签可读', missing: '两库对照标签文件找不到' };
const msText = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} 秒` : `${ms} 毫秒`);

/**
 * The status tool: which memory tools this Bot has, whether each store answers and takes its token, whether its
 * files are there, its config warnings and its last calls' times. It asks the bundled servers for their state (the
 * javmem/status request, which reads no memory) and shows no token and no memory text.
 */
function statusTool(who, deps) {
  const { opts, sharedEnv, problems, recentOf, toolNames } = deps;
  return defineTool({
    name: opts.statusTool,
    description: '查记忆插件的状态：这个 Bot 挂了哪些记忆工具，memv2 和 Javis 连不连得上、令牌能不能用，令牌文件在不在，'
      + '配置有没有写错，最近几次调用花了多久。只报状态，不显示令牌，也不显示记忆内容。记忆工具报错，或用户问记忆怎么不好用时用。',
    parameters: {},
    output: textOutput,
    async execute(_args, exec) {
      exec?.signal?.throwIfAborted?.();
      const { slug, bot } = who;
      const names = toolNames();
      const lines = [`记忆插件 ${name} ${VERSION}；Bot「${bot.name}」（${slug}）。`,
        names.length ? `挂上的记忆工具（${names.length} 个）：${names.join('、')}。` : '这个 Bot 没挂任何记忆工具（配置里没写 memory、memv2 或 javis）。'];
      const stores = STORES.filter((s) => bot[s]);
      const answers = await Promise.all(stores.map((s) => opts.call(opts.servers[s], { ...sharedEnv(), ...bot[s] }, null, {},
        { method: 'javmem/status', signal: exec?.signal, timeoutMs: 20000, label: `bot="${bot.name}" store=${s}` })
        .then((r) => ({ s, r }), (e) => ({ s, e }))));
      for (const { s, r, e } of answers) {
        if (e || !Array.isArray(r?.stores)) {
          lines.push(`${s === 'memory' ? '合起来的记忆工具' : STORE_LABEL[s]}：查不到状态（${String(e?.message || '服务没给状态').slice(0, 80)}）。`);
          continue;
        }
        for (const st of r.stores) {
          const extra = [st.detail && String(st.detail).replace(/[。.]$/, ''), st.hide_list && HIDE_TEXT[st.hide_list]].filter(Boolean).join('；');
          lines.push(`${STORE_LABEL[st.store] || st.store}（${st.url}）：${STATE_TEXT[st.state] || st.state}${extra ? `。${extra}` : ''}。`);
        }
        if (r.labels && LABELS_TEXT[r.labels]) lines.push(`${LABELS_TEXT[r.labels]}。`);
      }
      const checks = [...fileChecks(sharedEnv(), 'env'), ...stores.flatMap((s) => fileChecks(bot[s], `bots.${slug}.${s}`))];
      if (checks.length) lines.push(`文件：${checks.map((c) => `${c.key} ${c.there ? '在' : `不在（${c.file}）`}`).join('；')}。`);
      const mine = problems(slug);
      lines.push(mine.length ? `配置提醒（${mine.length} 条）：${mine.join('；')}。` : '配置提醒：没有。');
      const recent = recentOf(slug).slice(-5).reverse();
      lines.push(recent.length
        ? `最近 ${recent.length} 次调用（新的在前）：${recent.map((c) => `${c.tool} ${msText(c.ms)}${c.ok ? '' : '，失败'}`).join('；')}。`
        : '这个 Bot 最近还没有调用过记忆工具。');
      lines.push('这里只报状态：不显示令牌，也不显示记忆内容。');
      return lines.join('\n');
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
  const log = logger(opts.logFile);
  // Long-lived server processes per Bot and store (keepAlive: false = one process per call, as before 0.3.0).
  const pool = rowConfig.call || opts.keepAlive === false ? null
    : createPool({ idleMs: opts.idleMs, max: opts.maxProcesses, log });
  opts.call = rowConfig.call || (pool ? pool.call : callServer);
  const oneShot = rowConfig.call || callServer; // the catalog refresh at load needs no process kept
  if (pool && typeof ctx.effect === 'function') ctx.effect(() => () => pool.close(), `${name}: server processes`);
  const now = rowConfig.now || Date.now;
  let registry = null; // Tobs's Bot registry, once the botharness service is there
  const allProblems = (c) => {
    const r = resolveBots(c, registry);
    return [...c.problems, ...r.problems, ...fileProblems({ env: c.env, bots: r.bots })];
  };
  // Each warning once per config load, so the registry arriving later only adds what it newly shows (names).
  let warned = new Set();
  const check = (c, fresh = false) => {
    if (fresh) warned = new Set();
    const news = allProblems(c).filter((p) => !warned.has(p.text));
    for (const p of news) warned.add(p.text);
    warn(news, log);
  };
  // The last calls of each Bot (tool, milliseconds, ok), for the status tool; never arguments or answers.
  const recent = new Map();
  const record = (slug, call) => {
    const list = recent.get(slug) || [];
    list.push(call);
    if (list.length > 10) list.shift();
    recent.set(slug, list);
  };
  let config = readConfig(opts.configFile, rowConfig);
  let configMtime = mtime(opts.configFile);
  let checkedAt = now();
  let catalog = readCatalog(opts.catalogFile);
  log(`started v=${VERSION} mode=${config.mode} bots=${Object.keys(config.bots).length} from=${config.from} `
    + `tools=${STORES.map((s) => `${s}:${catalog[s].length}`).join(',')}`);
  check(config, true);

  // Refresh the catalog from the servers themselves (with the shared env, so MEMORY_OWNER shows in the text).
  Promise.all(STORES.map((s) => oneShot(opts.servers[s], config.env, null, null, { timeoutMs: 30000 })
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
        check(config, true);
      }
    }
    return config;
  };

  // Runs inside Tobs's agent setup: nothing may throw from here, or the Bot's session would not start.
  const setup = (agentCtx, _agent, info) => {
    try {
      const c = current();
      if (c.mode !== 'on') return;
      const slug = info?.botSlug;
      const bot = resolveBots(c, registry).bots[slug];
      if (!bot) return;
      const who = { slug, bot, role: info.rootRole || 'unknown' };
      const sharedEnv = () => current().env;
      const names = [];
      const register = (def) => {
        try {
          agentCtx.tools.register(def);
          return true;
        } catch (e) {
          log(`register failed bot="${bot.name}" tool=${def?.name} ${String(e?.message || e).slice(0, 120)}`);
          return false;
        }
      };
      for (const store of STORES) {
        if (!bot[store]) continue;
        for (const t of catalog[store]) {
          let def;
          try {
            def = toolFor(store, t, who, { opts, sharedEnv, log, record });
          } catch (e) {
            log(`register failed bot="${bot.name}" tool=${opts.prefix[store]}${t.name} ${String(e?.message || e).slice(0, 120)}`);
            continue;
          }
          if (register(def)) names.push(def.name);
        }
      }
      let count = names.length;
      if (opts.statusTool) {
        const problems = (s) => allProblems(current()).filter((p) => p.bot === s || p.bot === bot.key).map((p) => p.text);
        if (register(statusTool(who, { opts, sharedEnv, problems, recentOf: (s) => recent.get(s) || [], toolNames: () => names }))) count += 1;
      }
      log(`tools bot="${bot.name}" role=${who.role} count=${count}`);
    } catch (e) {
      log(`setup failed bot=${info?.botSlug} ${String(e?.message || e).slice(0, 120)}`);
    }
  };

  ctx.inject(['botharness'], (scope) => {
    registry = scope.botharness?.registry ?? null;
    check(current());
    scope.effect(() => scope.botharness.contributeBotAgentSetup(setup), `${name}: per-Bot memory tools`);
  });
}

function mtime(file) {
  if (!file) return 0;
  try { return statSync(file).mtimeMs; } catch { return 0; }
}
