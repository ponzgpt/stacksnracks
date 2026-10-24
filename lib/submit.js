// On-site rig submissions: validate the form, then file the same issue the GitHub form would,
// using the repo owner's token. Moderation stays the same: nothing is public until labelled `approved`.
import { parseLlamaBench } from './rigs.js';

export const REPO_API = 'https://api.github.com/repos/ponzgpt/stacksnracks/issues';

// Form field → issue heading (must match .github/ISSUE_TEMPLATE/rig.yml, which parseIssueForm reads).
export const FIELDS = [
  { name: 'title', label: 'Rig name', max: 80, required: true },
  { name: 'parts', heading: 'Parts', label: 'Parts', max: 2000, required: true },
  { name: 'price', heading: 'What you paid (USD)', label: 'What you paid (USD)', max: 200, required: true },
  { name: 'stack', heading: 'Stack', label: 'Stack', max: 1000, required: true },
  { name: 'bench', heading: 'Benchmark output', label: 'Benchmark output', max: 20000, required: true },
  { name: 'watts', heading: 'Power draw under load (W)', label: 'Power draw under load (W)', max: 20, required: false },
];

export function validateSubmission(form) {
  const values = Object.fromEntries(FIELDS.map(f => [f.name, String(form.get(f.name) || '').replace(/\r\n/g, '\n').trim()]));
  const errors = {};
  for (const f of FIELDS) {
    if (f.required && !values[f.name]) errors[f.name] = 'Required.';
    else if (values[f.name].length > f.max) errors[f.name] = `Keep it under ${f.max} characters.`;
  }
  const runs = parseLlamaBench(values.bench);
  if (values.bench && !errors.bench && !runs.length) errors.bench = 'No llama-bench table found. Paste the markdown table it prints, header row included.';
  if (values.watts && !/^\d{1,5}(\.\d+)?$/.test(values.watts)) errors.watts = 'A number of watts, or leave it empty.';
  return { values, errors, runs, ok: !Object.keys(errors).length };
}

// Same layout GitHub produces for issue forms, plus a "Submitted by" section rigs.js trusts only on owner-filed issues.
export function toIssue(values, user) {
  const section = (h, v, fence) => `### ${h}\n\n${v ? (fence ? `\`\`\`text\n${v.replace(/```/g, "'''")}\n\`\`\`` : v) : '_No response_'}`;
  const body = [
    ...FIELDS.filter(f => f.heading).map(f => section(f.heading, values[f.name], f.name === 'bench')),
    section('Photo', ''),
    section('Submitted by', `@${user.login} (GitHub id ${user.id}) via the site`),
  ].join('\n\n');
  return { title: `Rig: ${values.title}`, body, labels: ['rig'] };
}

export async function fileIssue({ token, issue, fetchFn = fetch }) {
  const res = await fetchFn(REPO_API, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'stacksnracks' },
    body: JSON.stringify(issue),
  });
  if (!res.ok) throw new Error(`GitHub issue create ${res.status}`);
  const { number, html_url } = await res.json();
  return { number, url: html_url };
}
