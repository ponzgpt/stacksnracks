// Rigs come from GitHub issues filed with the "Submit a rig" form and labelled `approved` by a maintainer.
// Issue body (form sections) + pasted llama-bench table → one rig with its runs.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';

export const ISSUES_URL = 'https://api.github.com/repos/ponzgpt/stacksnracks/issues?labels=rig,approved&state=open&per_page=100';

// "### Heading\n\nanswer" sections → { heading: answer }, with GitHub's "_No response_" as ''.
export function parseIssueForm(body = '') {
  const out = {};
  for (const part of body.split(/^###\s+/m).slice(1)) {
    const nl = part.indexOf('\n');
    const key = (nl < 0 ? part : part.slice(0, nl)).trim();
    const val = (nl < 0 ? '' : part.slice(nl + 1)).trim();
    out[key] = val === '_No response_' ? '' : val.replace(/^```\w*\n?|\n?```$/g, '').trim();
  }
  return out;
}

// llama-bench markdown table → [{ model, sizeGiB, backend, pp, tg }], one entry per model+backend.
// Columns are found by header name, so extra columns from newer llama.cpp builds are ignored.
export function parseLlamaBench(text = '') {
  const rows = text.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'))
    .map(l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
  if (rows.length < 2) return [];
  const head = rows[0].map(h => h.toLowerCase());
  const col = name => head.indexOf(name);
  const [iModel, iSize, iBackend, iTest, iTps] = ['model', 'size', 'backend', 'test', 't/s'].map(col);
  if ([iModel, iTest, iTps].includes(-1)) return [];
  const runs = new Map();
  for (const r of rows.slice(1)) {
    if (r.every(c => /^[-: ]*$/.test(c))) continue; // separator
    const tps = parseFloat(r[iTps]);
    const test = (r[iTest] || '').toLowerCase();
    if (!Number.isFinite(tps) || tps <= 0 || !/^(pp|tg)\d+/.test(test)) continue;
    const backend = iBackend < 0 ? '' : r[iBackend];
    const key = `${r[iModel]}|${backend}`;
    const run = runs.get(key) || { model: r[iModel], sizeGiB: parseFloat(r[iSize]) || null, backend, pp: null, tg: null };
    const kind = test.slice(0, 2);
    if (run[kind] == null) run[kind] = tps; // first pp / tg row wins (the plain, zero-depth test)
    runs.set(key, run);
  }
  return [...runs.values()].filter(r => r.tg != null || r.pp != null);
}

// "$2,350 (used, March)" → 2350; "2.3k" → 2300. Out-of-range values are treated as missing.
export function parsePrice(text = '') {
  const m = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1);
  return n >= 50 && n <= 200_000 ? Math.round(n) : null;
}

// Only images GitHub itself hosts for issue attachments.
export function parsePhoto(text = '') {
  const url = (text.match(/!\[[^\]]*\]\((https:\/\/[^)\s]+)\)/) || text.match(/src="(https:\/\/[^"\s]+)"/) || [])[1];
  if (!url) return null;
  const { hostname, pathname } = new URL(url);
  const ok = (hostname === 'github.com' && pathname.startsWith('/user-attachments/')) || hostname.endsWith('.githubusercontent.com');
  return ok ? url : null;
}

export function issueToRig(issue) {
  const f = parseIssueForm(issue.body || '');
  const runs = parseLlamaBench(f['Benchmark output']);
  if (!runs.length) return null;
  const priceUsd = parsePrice(f['What you paid (USD)']);
  const best = runs.reduce((a, b) => ((b.tg ?? -1) > (a.tg ?? -1) ? b : a));
  return {
    id: issue.number,
    title: (issue.title || '').replace(/^rig:\s*/i, '').trim() || `Rig #${issue.number}`,
    author: issue.user?.login || 'anonymous',
    url: issue.html_url,
    createdAt: issue.created_at,
    parts: (f.Parts || '').split('\n').map(l => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean),
    priceUsd,
    priceText: f['What you paid (USD)'] || '',
    stack: f.Stack || '',
    watts: parseFloat(f['Power draw under load (W)']) || null,
    photo: parsePhoto(f.Photo),
    runs,
    best,
    tgPerK: priceUsd && best.tg ? Math.round((best.tg / priceUsd) * 1000 * 10) / 10 : null,
  };
}

// Fetch approved rigs from GitHub; on failure, serve the last good copy from the data volume.
export async function loadRigs({ dataDir, url = ISSUES_URL, fetchFn = fetch }) {
  const cache = `${dataDir}/rigs.json`;
  try {
    const res = await fetchFn(url, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'stacksnracks' } });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const rigs = (await res.json()).filter(i => !i.pull_request).map(issueToRig).filter(Boolean);
    await mkdir(dataDir, { recursive: true });
    await writeFile(cache + '.tmp', JSON.stringify(rigs));
    await rename(cache + '.tmp', cache);
    return rigs;
  } catch (e) {
    console.error('loadRigs:', e.message);
    return JSON.parse(await readFile(cache, 'utf8').catch(() => '[]'));
  }
}

const SORTS = {
  tg: (a, b) => (b.best.tg ?? 0) - (a.best.tg ?? 0),
  value: (a, b) => (b.tgPerK ?? -1) - (a.tgPerK ?? -1),
  new: (a, b) => b.createdAt.localeCompare(a.createdAt),
};

// Explorer query: q matches model/parts/title, backend is exact, sort is tg | value | new.
export function filterRigs(rigs, { q = '', backend = '', sort = 'tg' } = {}) {
  const needle = q.trim().toLowerCase();
  return rigs
    .filter(r => !backend || r.runs.some(x => x.backend.toLowerCase() === backend.toLowerCase()))
    .filter(r => !needle || [r.title, ...r.parts, ...r.runs.map(x => x.model)].some(s => s.toLowerCase().includes(needle)))
    .sort(SORTS[sort] || SORTS.tg);
}
