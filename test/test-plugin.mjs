// Offline tests: a fake DeepSeek Harness host (cordis ctx, botharness, an agent's tool registry) with the bundled MCP
// servers pointed at a closed port, so no memv2 or Javis is needed.
//   node test/test-plugin.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, DEFAULTS, normalizeConfig, parameters, VERSION } from '../index.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'javmem-dsh-plugin-'));
const A = 'bot-0123456789abcdef0123456789abcdef';
const B = 'bot-fedcba9876543210fedcba9876543210';
const CLOSED = 'http://127.0.0.1:9';
const tokenFile = join(scratch, 'a.token');
writeFileSync(tokenFile, 'not-a-real-token\n');
const profile = join(scratch, 'a.env');
writeFileSync(profile, `JAVIS_SOURCES=acct-a\nJAVIS_TOKEN_FROM=${tokenFile}\n`);
const bots = {
  [A]: { name: 'Alpha', memv2: { MEMV2_TOKEN_FILE: tokenFile }, javis: { JAVIS_TOKEN_FILE: profile } },
  [B]: { name: 'Beta', memv2: { MEMV2_TOKEN_FILE: tokenFile } },
};
const env = { MEMV2_URL: CLOSED, JAVIS_URL: `${CLOSED}/mcp`, MEMORY_OWNER: '小明' };
const logFile = join(scratch, 'plugin.log');
let passed = 0;
const ok = (label) => { passed += 1; console.log('ok', label); };

function host() {
  const setups = [];
  const ctx = { inject(names, cb) { assert.deepEqual(names, ['botharness']); cb({ botharness: { contributeBotAgentSetup(fn) { setups.push(fn); return () => {}; } }, effect(fn) { fn(); } }); } };
  const agent = (slug, rootRole = 'orchestrator') => {
    const tools = new Map();
    const agentCtx = { tools: { register(def) { assert.ok(!tools.has(def.name)); tools.set(def.name, def); return () => tools.delete(def.name); } } };
    for (const fn of setups) fn(agentCtx, {}, { botSlug: slug, rootRole });
    return tools;
  };
  return { ctx, agent, setups };
}
const run = (tool, args) => tool.execute(args, { signal: new AbortController().signal });

// 1. Config: on/off (also YAML booleans), parked Bots, only MEMV2_/JAVIS_/MEMORY_ settings pass.
{
  const c = normalizeConfig({ mode: true, bots: { [A]: { name: 'x', memv2: { MEMV2_TOKEN_FILE: 'f', PATH: 'no' } }, [B]: { off: true } }, env: { MEMORY_OWNER: 'o', HOME: 'no' } });
  assert.equal(c.mode, 'on');
  assert.deepEqual(Object.keys(c.bots), [A]);
  assert.deepEqual(c.bots[A].memv2, { MEMV2_TOKEN_FILE: 'f' });
  assert.deepEqual(c.env, { MEMORY_OWNER: 'o' });
  assert.deepEqual(c.overlap, []);
  assert.equal(normalizeConfig({ mode: false }).mode, 'off');
  assert.deepEqual(parameters({ required: ['q'], properties: { q: { type: 'string', description: 'd' }, n: { type: 'integer', minimum: 1 }, a: { type: 'array' } } }),
    { q: { type: 'string', description: 'd', required: true }, n: { type: 'integer' } });
  ok('config and parameters');
}

// 2. Off registers nothing; on gives a listed Bot its stores' tools; unlisted Bots get none.
{
  const h0 = host();
  apply(h0.ctx, { mode: 'off', bots, env, logFile });
  assert.equal(h0.agent(A).size, 0);
  const h = host();
  apply(h.ctx, { mode: 'on', bots, env, logFile });
  assert.deepEqual([...h.agent(A).keys()].sort(), ['javis_find_sessions', 'javis_get_conversation', 'javis_get_entity',
    'javis_search_memory', 'memv2_read_record', 'memv2_recall', 'memv2_search', 'memv2_search_raw']);
  assert.equal(h.agent(A, 'assignment').size, 8);
  assert.equal(h.agent(B).size, 4);
  assert.equal(h.agent('bot-ffffffffffffffffffffffffffffffff').size, 0);
  ok('off, on, per-store tools, unlisted Bots');
}

// 3. Descriptions start as catalog.json and follow the servers (with the shared env) once refreshed.
{
  const catalog = JSON.parse(readFileSync(DEFAULTS.catalogFile, 'utf8'));
  const h = host();
  apply(h.ctx, { mode: 'on', bots, env, logFile });
  assert.equal(h.agent(A).get('memv2_recall').description, catalog.memv2[0].description);
  let tools;
  for (let i = 0; i < 50; i += 1) {
    await new Promise((r) => setTimeout(r, 200));
    tools = h.agent(A);
    if (/小明/.test(tools.get('javis_search_memory').description)) break;
  }
  assert.match(tools.get('javis_search_memory').description, /从小明以前和 AI 的对话里/);
  ok('catalog, then refreshed text with MEMORY_OWNER');
}

// 4. A call reaches the server with the Bot's and the shared settings; a service that is down is a tool error.
{
  const h = host();
  apply(h.ctx, { mode: 'on', bots, env, logFile });
  const tools = h.agent(A);
  await assert.rejects(() => run(tools.get('memv2_search'), { query: 'x' }), /memv2 没在运行/);
  await assert.rejects(() => run(tools.get('javis_find_sessions'), { query: 'x' }), /Javis 没在运行/);
  ok('service down: tool errors with the server\'s message');
}

// 5. Setup never throws, whatever the registry does.
{
  const h = host();
  apply(h.ctx, { mode: 'on', bots, env, logFile });
  assert.doesNotThrow(() => h.setups[0]({ tools: { register() { throw new Error('boom'); } } }, {}, { botSlug: A, rootRole: 'orchestrator' }));
  assert.doesNotThrow(() => h.setups[0](null, {}, { botSlug: A }));
  assert.match(readFileSync(logFile, 'utf8'), /register failed bot="Alpha"/);
  ok('setup never throws');
}

// 6. A config file is re-read when it changes (2-second check).
{
  const file = join(scratch, 'config.json');
  writeFileSync(file, JSON.stringify({ mode: 'on', bots: {} }));
  let t = 1_000_000;
  const h = host();
  apply(h.ctx, { configFile: file, logFile, now: () => t });
  assert.equal(h.agent(A).size, 0);
  await new Promise((r) => setTimeout(r, 50));
  writeFileSync(file, JSON.stringify({ mode: 'on', bots: { [A]: bots[A] }, env }));
  t += 2500;
  assert.equal(h.agent(A).size, 8);
  ok('config file reloaded without a restart');
}

// 7. A Bot given the combined server gets its five memory_* tools; a service that is down is a tool error.
{
  const C = 'bot-cccccccccccccccccccccccccccccccc';
  const h = host();
  apply(h.ctx, { mode: 'on', env, logFile, bots: { [C]: { name: 'Gamma', memory: { MEMV2_TOKEN_FILE: tokenFile, JAVIS_TOKEN_FILE: profile } } } });
  const tools = h.agent(C);
  assert.deepEqual([...tools.keys()].sort(), ['memory_person', 'memory_read', 'memory_recall', 'memory_search', 'memory_search_raw']);
  await assert.rejects(() => run(tools.get('memory_search'), { query: 'x' }), /两个库这次都没查成/);
  ok('combined server: five memory_* tools, both stores down named');
}

// 8. The code reports package.json's version. A Bot given both memory and memv2/javis still gets both sets (nothing
//    changes for it), but is named in a warning in the log file and on stderr.
{
  assert.equal(VERSION, JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
  const D = 'bot-dddddddddddddddddddddddddddddddd';
  const both = { [D]: { name: 'Delta', memory: { MEMV2_TOKEN_FILE: tokenFile }, memv2: { MEMV2_TOKEN_FILE: tokenFile } }, [B]: bots[B] };
  assert.deepEqual(normalizeConfig({ bots: both }).overlap, ['Delta']);
  const warned = [];
  const original = console.warn;
  console.warn = (m) => warned.push(String(m));
  let tools;
  try {
    const h = host();
    apply(h.ctx, { mode: 'on', env, logFile, bots: both });
    tools = h.agent(D);
  } finally {
    console.warn = original;
  }
  assert.equal(tools.size, 9);
  assert.equal(warned.length, 1);
  assert.match(warned[0], /^javmem-dsh-plugin: warning bot="Delta" has both memory and memv2\/javis set/);
  assert.match(readFileSync(logFile, 'utf8'), /warning bot="Delta" has both memory and memv2\/javis set/);
  ok('one version; a Bot with both tool sets is warned about');
}

assert.ok(!/"query"/.test(readFileSync(logFile, 'utf8')), 'the log must not hold arguments');
ok('log holds no arguments');
console.log(`${passed} checks passed`);
