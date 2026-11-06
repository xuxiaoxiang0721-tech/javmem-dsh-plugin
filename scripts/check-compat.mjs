// Is a DSH version inside this plugin's declared ranges? engines.dsh is checked the way DSH's plugin loader checks it
// (prereleases count); the @deepseek-ai/dsh-tools peer range the way npm and pnpm check peers (a prerelease such as
// 0.3.0-rc.1 only counts when a comparator on its own major.minor.patch carries a prerelease tag, so each prerelease
// line needs its own branch). Exits 1 when either range rejects a version. Needs the semver package.
//   node scripts/check-compat.mjs <dsh version>...
import { readFileSync } from 'node:fs';
import semver from 'semver';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const engines = pkg.engines?.dsh;
const peer = pkg.peerDependencies?.['@deepseek-ai/dsh-tools'];
const versions = process.argv.slice(2);
if (!versions.length) {
  console.error('usage: node scripts/check-compat.mjs <dsh version>...');
  process.exit(2);
}
let failed = false;
for (const v of versions) {
  if (!semver.valid(v)) {
    console.error(`${v}: not a semantic version`);
    failed = true;
    continue;
  }
  const dsh = semver.satisfies(v, engines, { includePrerelease: true });
  const npm = semver.satisfies(v, peer);
  console.log(`${v}: engines.dsh ${dsh ? 'ok' : 'NO'}, @deepseek-ai/dsh-tools peer ${npm ? 'ok' : 'NO'}`);
  if (!dsh || !npm) failed = true;
}
if (failed) console.log(`engines.dsh: ${engines}\npeer: ${peer}`);
process.exit(failed ? 1 : 0);
