import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIssueForm, parseLlamaBench, parsePrice, parsePhoto, issueToRig, filterRigs, loadRigs } from './rigs.js';

const BENCH = `| model                          |       size |     params | backend    | ngl |            test |                  t/s |
| ------------------------------ | ---------: | ---------: | ---------- | --: | --------------: | -------------------: |
| llama 8B Q4_K - Medium         |   4.58 GiB |     8.03 B | CUDA       |  99 |           pp512 |      5765.41 ± 20.55 |
| llama 8B Q4_K - Medium         |   4.58 GiB |     8.03 B | CUDA       |  99 |           tg128 |        197.71 ± 0.81 |
| qwen2 32B Q4_K - Medium        |  18.48 GiB |    32.76 B | CUDA       |  99 |           tg128 |         38.20 ± 0.10 |

build: 3ff8ae5 (4567)`;

const BODY = `### Parts

- 2x RTX 3090
- Ryzen 9 5950X

### What you paid (USD)

$2,350 total, used, March 2026

### Stack

llama.cpp b4567, Ubuntu 24.04

### Benchmark output

\`\`\`text
${BENCH}
\`\`\`

### Power draw under load (W)

_No response_

### Photo

![rig](https://github.com/user-attachments/assets/abc123)`;

const issue = { number: 7, title: 'Rig: Dual 3090 closet box', user: { login: 'dev' }, html_url: 'https://github.com/x/7', created_at: '2026-10-20T10:00:00Z', body: BODY };

test('issue form sections, with "_No response_" as empty', () => {
  const f = parseIssueForm(BODY);
  assert.equal(f.Stack, 'llama.cpp b4567, Ubuntu 24.04');
  assert.equal(f['Power draw under load (W)'], '');
  assert.ok(f['Benchmark output'].startsWith('| model'));
});

test('llama-bench table → one run per model+backend', () => {
  const runs = parseLlamaBench(BENCH);
  assert.deepEqual(runs[0], { model: 'llama 8B Q4_K - Medium', sizeGiB: 4.58, backend: 'CUDA', pp: 5765.41, tg: 197.71 });
  assert.equal(runs[1].pp, null);
  assert.equal(runs[1].tg, 38.2);
  assert.deepEqual(parseLlamaBench('no table here'), []);
});

test('price and photo parsing', () => {
  assert.equal(parsePrice('$2,350 total'), 2350);
  assert.equal(parsePrice('about 2.3k'), 2300);
  assert.equal(parsePrice('free'), null);
  assert.equal(parsePhoto('![x](https://evil.example/a.png)'), null);
  assert.equal(parsePhoto('<img src="https://github.com/user-attachments/assets/z" />'), 'https://github.com/user-attachments/assets/z');
});

test('issue → rig with best run and tok/s per $1k; no bench → skipped', () => {
  const rig = issueToRig(issue);
  assert.equal(rig.title, 'Dual 3090 closet box');
  assert.deepEqual(rig.parts, ['2x RTX 3090', 'Ryzen 9 5950X']);
  assert.equal(rig.best.tg, 197.71);
  assert.equal(rig.tgPerK, 84.1);
  assert.equal(rig.photo, 'https://github.com/user-attachments/assets/abc123');
  assert.equal(issueToRig({ ...issue, body: '### Parts\n\nx' }), null);
});

test('filter and sort', () => {
  const a = issueToRig(issue);
  const b = { ...a, id: 8, title: 'Mac box', parts: ['Mac Studio'], runs: [{ ...a.runs[0], backend: 'Metal', model: 'llama 70B' }], best: { tg: 12 }, tgPerK: 300, createdAt: '2026-10-21T00:00:00Z' };
  assert.deepEqual(filterRigs([a, b]).map(r => r.id), [7, 8]);
  assert.deepEqual(filterRigs([a, b], { sort: 'value' }).map(r => r.id), [8, 7]);
  assert.deepEqual(filterRigs([a, b], { backend: 'metal' }).map(r => r.id), [8]);
  assert.deepEqual(filterRigs([a, b], { q: '3090' }).map(r => r.id), [7]);
});

test('loadRigs falls back to the cached copy when GitHub fails', async () => {
  const dir = await import('node:fs/promises').then(fs => fs.mkdtemp('/tmp/snr-'));
  const ok = async () => ({ ok: true, json: async () => [issue, { number: 9, pull_request: {}, body: BODY }] });
  assert.equal((await loadRigs({ dataDir: dir, fetchFn: ok })).length, 1);
  const down = async () => ({ ok: false, status: 503 });
  assert.equal((await loadRigs({ dataDir: dir, fetchFn: down }))[0].id, 7);
});
