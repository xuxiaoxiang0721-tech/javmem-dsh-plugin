// Writes catalog.json: the tools (name, description, arguments) of the two bundled MCP servers, as their tools/list
// gives them with the default settings. Run after updating mcp/: node scripts/make-catalog.mjs
import { writeFileSync } from 'node:fs';
import { callServer, DEFAULTS } from '../index.mjs';

const out = {};
for (const [store, script] of Object.entries(DEFAULTS.servers)) {
  const r = await callServer(script, {}, null, null, { timeoutMs: 30000 });
  out[store] = (r.tools || []).map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  console.log(store, out[store].map((t) => t.name).join(', '));
}
writeFileSync(DEFAULTS.catalogFile, `${JSON.stringify(out, null, 1)}\n`, 'utf8');
console.log('wrote', DEFAULTS.catalogFile);
