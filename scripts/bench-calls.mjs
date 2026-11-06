// How long consecutive tool calls take with one server process per call (keepAlive: false, as before 0.3.0) and with
// a long-lived process per Bot and store (the default). A fake memv2 answers every search at once with no result, so
// what is measured is the plugin's own cost per call: starting node, the MCP handshake, the request. No real memory
// is read.
//   node scripts/bench-calls.mjs [calls, default 20]
import { mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { callServer, createPool, DEFAULTS } from '../index.mjs';

const calls = Number(process.argv[2]) || 20;
const fake = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ semantic: { items: [] } }));
  });
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
const scratch = mkdtempSync(join(tmpdir(), 'javmem-bench-'));
const token = join(scratch, 'bench.token');
writeFileSync(token, 'bench-token\n');
const env = { MEMV2_URL: `http://127.0.0.1:${fake.address().port}`, MEMV2_TOKEN_FILE: token };

async function run(label, call) {
  const ms = [];
  for (let i = 0; i < calls; i += 1) {
    const started = process.hrtime.bigint();
    const r = await call(DEFAULTS.servers.memv2, env, 'search', { query: `bench ${i}` }, { timeoutMs: 30000 });
    if (r?.isError) throw new Error(r.content?.[0]?.text);
    ms.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  const rest = ms.slice(1).sort((a, b) => a - b);
  const pick = (q) => rest[Math.min(rest.length - 1, Math.floor(q * rest.length))];
  const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
  console.log(`${label}: first ${ms[0].toFixed(0)} ms, then median ${pick(0.5).toFixed(1)} ms, p90 ${pick(0.9).toFixed(1)} ms; `
    + `mean of all ${calls} ${mean.toFixed(1)} ms`);
  return mean;
}

console.log(`${calls} consecutive memv2 search calls, Node ${process.version}, ${process.platform}`);
const before = await run('one process per call (keepAlive: false)', callServer);
const pool = createPool();
const after = await run('long-lived process (default)        ', pool.call);
pool.close();
fake.close();
console.log(`the mean call takes ${(before / after).toFixed(1)} times less time with a long-lived process`);
