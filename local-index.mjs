// The zero-setup backend's indexer: reads each listed Bot's own past sessions through DSH's session query service
// (ctx.sessionQuery, read-only) and adds what was said to that Bot's local store (javmem-mcp's local-store.js, one
// SQLite file per Bot). Only three kinds of text go in: a Human's direct messages (the body of Tobs's [Human DM]
// envelope, or a Human's Group mention), what a Human typed in the DSH web page, and what the Bot sent back with
// bot_send_message. Injected context, tool results and memory tools' own answers never do, so memory is not stored
// twice. Each session is read from where the last pass stopped.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';

const require = createRequire(import.meta.url);

// Section headers of Tobs's inbox envelopes that start a new part of a harvested turn.
const NEXT_SECTION = /\n\n\[(?:Human DM|Group|Bot Inbox|Host|Human response|Open Inbox|Triage|Snooze returned)/;
const ENVELOPE_LINE = /^(Source Event ID|Channel|Message ID): .*$/;

const textOf = (content) => (Array.isArray(content) ? content : [])
  .map((p) => (p && p.type === 'text' ? String(p.text || '') : '')).join('\n');

/** The Human's words in one inbound Tobs message (possibly a harvest of several sections). */
export function humanParts(text) {
  const out = [];
  let at = text.indexOf('[Human DM]\n');
  while (at >= 0) {
    const rest = text.slice(at + '[Human DM]\n'.length);
    const end = rest.search(NEXT_SECTION);
    const lines = (end >= 0 ? rest.slice(0, end) : rest).split('\n');
    while (lines.length && ENVELOPE_LINE.test(lines[0])) lines.shift();
    const body = lines.join('\n').trim();
    if (body) out.push(body);
    at = text.indexOf('[Human DM]\n', at + 1);
  }
  const mention = /\[Bot Inbox: direct Group mention from Human\][\s\S]*?\nMessage: ([\s\S]*?)(?=\n\n\[|$)/g;
  for (const m of text.matchAll(mention)) if (m[1].trim()) out.push(m[1].trim());
  return out;
}

/** The messages worth keeping among a session's events: { seq, role, time, text }. */
export function messagesOf(events) {
  const out = [];
  for (const ev of events) {
    const d = ev && ev.data;
    if (!d) continue;
    const time = Number.isFinite(ev.time) ? new Date(ev.time).toISOString() : (typeof ev.time === 'string' ? ev.time : null);
    if (ev.type === 'user/message' && d.source && d.source.kind === 'user') {
      const text = textOf(d.content);
      // Typed in the DSH web page: the message itself, no envelope.
      if (d.source.rpcId) {
        if (text.trim()) out.push({ seq: ev.seq * 10, role: 'user', time, text: text.trim() });
        continue;
      }
      humanParts(text).forEach((part, i) => out.push({ seq: ev.seq * 10 + i, role: 'user', time, text: part }));
    } else if (ev.type === 'tool/call' && d.name === 'bot_send_message') {
      let args = d.arguments;
      if (typeof args === 'string') {
        try { args = JSON.parse(args); } catch { args = null; }
      }
      const body = args && typeof args.body === 'string' ? args.body.trim() : '';
      if (body) out.push({ seq: ev.seq * 10, role: 'assistant', time, text: body });
    }
  }
  return out;
}

function titleOf(events) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e && e.type === 'session/title' && e.data && typeof e.data.title === 'string' && e.data.title.trim()) return e.data.title.trim();
  }
  return null;
}

/**
 * Memory from other tools dropped into one of the Bot's inherit folders: original conversations exported from
 * ChatGPT, Claude, Claude Code, Codex or as 1.2 memory packages (javmem-mcp's history.js), and javmem packages
 * (javmem-inherit). Each file once (by its content hash); a longer export of the same conversations adds only the
 * new messages. Returns how many messages were added.
 */
function importInbox(store, dirs, log, slug) {
  const { importPackage } = require('./mcp/inherit.js');
  const history = require('./mcp/history.js');
  let added = 0;
  for (const dir of dirs) {
    if (!dir || !existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => ['.json', '.jsonl', '.txt', '.md'].includes(extname(f).toLowerCase())).sort()) {
      let text;
      try { text = readFileSync(join(dir, file), 'utf8'); } catch { continue; }
      const hash = createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
      if (store.meta(`inherited:${hash}`)) continue;
      let h = null;
      try { h = history.importExport(store, join(dir, file)); } catch { h = null; }
      if (h) {
        added += h.added;
        store.meta(`inherited:${hash}`, new Date().toISOString());
        log(`history bot=${slug} file=${file} tool=${h.tool} conversations=${h.conversations} added=${h.added}`);
        continue;
      }
      const r = importPackage(store, text);
      added += r.added;
      if (!r.pkg.facts.length && !r.pkg.conversations.length) store.meta(`inherited:${hash}`, 'unusable');
      log(`inherit bot=${slug} file=${file} added=${r.added} problems=${r.pkg.problems.length}`);
    }
  }
  return added;
}

/**
 * The indexer. deps: sessionQuery() and registry() (they arrive later than the plugin), dbFor(slug) (the Bot's store
 * file), inheritDirs(slug) (folders of javmem packages for it), log, now. refresh(slug) brings one Bot's store up to
 * date; fresh(slug) does so when the last pass is older than maxAgeMs (and waits for one that is running); close()
 * closes the stores.
 */
export function createIndexer({ sessionQuery, registry, dbFor, inheritDirs = () => [], log = () => {}, now = Date.now, maxAgeMs = 60000 }) {
  const stores = new Map(); // slug -> LocalStore (read-write)
  const last = new Map(); // slug -> time of the last finished pass
  const running = new Map(); // slug -> promise of the pass in progress
  const storeOf = (slug) => {
    const file = dbFor(slug);
    const have = stores.get(slug);
    if (have && have.file === file) return have;
    if (have) have.close();
    const { LocalStore } = require('./mcp/local-store.js');
    const store = new LocalStore(file);
    stores.set(slug, store);
    return store;
  };

  async function pass(slug) {
    // Inherited packages first: they need no session service.
    const inherited = dbFor(slug) ? importInbox(storeOf(slug), inheritDirs(slug), log, slug) : 0;
    const query = sessionQuery();
    const reg = registry();
    if (!query || typeof query.filterSessions !== 'function' || !reg) return { sessions: 0, added: inherited, skipped: 'no session service' };
    const dir = typeof reg.memoryDirFor === 'function' ? reg.memoryDirFor(slug) : undefined;
    if (!dir) return { sessions: 0, added: inherited, skipped: 'no memory folder' };
    const store = storeOf(slug);
    const records = await query.filterSessions([{ kind: 'cwd', values: [dir] }]);
    let added = inherited;
    for (const record of records) {
      const id = record && record.header && record.header.id;
      if (!id) continue;
      const snapshot = await query.readSession(id);
      const events = (snapshot && snapshot.events) || [];
      const from = Math.max(store.readTo(id), Number(snapshot.inheritedEventCount) || 0);
      if (events.length <= from) continue;
      const fresh = events.slice(from);
      added += store.add({ id, title: titleOf(events), origin: 'session' }, messagesOf(fresh), events.length);
      await new Promise((r) => setImmediate(r)); // let the host breathe between sessions
    }
    return { sessions: records.length, added };
  }

  async function refresh(slug) {
    if (running.has(slug)) return running.get(slug);
    const started = now();
    const p = pass(slug).then((r) => {
      last.set(slug, now());
      if (r.added || r.skipped) log(`local index bot=${slug} sessions=${r.sessions} added=${r.added} ms=${now() - started}${r.skipped ? ` skipped=${r.skipped}` : ''}`);
      return r;
    }, (e) => {
      last.set(slug, now());
      log(`local index bot=${slug} failed=${String(e?.message || e).slice(0, 120)}`);
      return { sessions: 0, added: 0, error: String(e?.message || e) };
    }).finally(() => running.delete(slug));
    running.set(slug, p);
    return p;
  }

  return {
    refresh,
    fresh: (slug) => (running.has(slug) ? running.get(slug)
      : (now() - (last.get(slug) || 0) >= maxAgeMs ? refresh(slug) : Promise.resolve(null))),
    lastPass: (slug) => last.get(slug) || null,
    close: () => { for (const s of stores.values()) s.close(); stores.clear(); },
  };
}
