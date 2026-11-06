// Copies the javmem-mcp servers into mcp/ from a javmem-mcp checkout, records its version in mcp/package.json (the
// servers report it in their MCP handshake) and rebuilds catalog.json.
//   node scripts/vendor-mcp.mjs <path to javmem-mcp>
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mcp = join(here, '..', 'mcp');
// graphiti.js: javis-mcp's backend for the official Graphiti server; feed.js: what sends a Bot's conversations to
// memv2-lite and Graphiti (backends memv2, graphiti and full).
const FILES = ['memory-mcp.js', 'memv2-mcp.js', 'javis-mcp.js', 'demo.js', 'local-mcp.js', 'local-store.js', 'inherit.js',
  'graphiti.js', 'feed.js'];
const DIRS = ['demo']; // the made-up demo data for MEMV2_URL=demo and JAVIS_URL=demo

const from = process.argv[2];
if (!from) {
  console.error('usage: node scripts/vendor-mcp.mjs <path to javmem-mcp>');
  process.exit(2);
}
const pkg = JSON.parse(readFileSync(join(from, 'package.json'), 'utf8'));
if (pkg.name !== 'javmem-mcp') {
  console.error(`${from} is not a javmem-mcp checkout (package name ${pkg.name})`);
  process.exit(2);
}
for (const file of FILES) copyFileSync(join(from, file), join(mcp, file));
for (const dir of DIRS) {
  rmSync(join(mcp, dir), { recursive: true, force: true });
  cpSync(join(from, dir), join(mcp, dir), { recursive: true });
}
// "type": "commonjs" lets the CommonJS servers run inside this "type": "module" package; keep it.
writeFileSync(join(mcp, 'package.json'), `${JSON.stringify({
  description: `javmem-mcp ${pkg.version}, copied by scripts/vendor-mcp.mjs`,
  version: pkg.version,
  type: 'commonjs',
}, null, 2)}\n`);
console.log(`copied javmem-mcp ${pkg.version}: ${[...FILES, ...DIRS.map((d) => `${d}/`)].join(', ')}`);
const r = spawnSync(process.execPath, [join(here, 'make-catalog.mjs')], { stdio: 'inherit' });
process.exit(r.status ?? 1);
