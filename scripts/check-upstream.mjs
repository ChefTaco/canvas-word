#!/usr/bin/env node
// Compares the upstream pins recorded in packages/*/UPSTREAM.md with the
// current upstream repositories and npm releases, and prints a Markdown report.
// With --report-issue (scheduled workflow) it keeps one open reminder issue in
// this repository up to date while upstream has moved. Read-only otherwise.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const ISSUE_TITLE = 'Upstream changes to review';
const sha = '([0-9a-f]{40})';

/** Parse the pins from the engine and codec UPSTREAM.md files. */
export function readPins(engineMarkdown, codecMarkdown) {
  const find = (text, pattern, what) => {
    const match = text.match(pattern);
    if (!match) throw new Error(`UPSTREAM.md no longer records ${what}.`);
    return match[1];
  };
  return [
    {
      name: 'engine',
      repository: 'Hufe921/canvas-editor',
      npm: '@hufe921/canvas-editor',
      commit: find(engineMarkdown, new RegExp(`\\| Upstream source pin \\| commit \`${sha}\``), 'the engine source pin'),
      version: find(engineMarkdown, /\| Closest published upstream \| `@hufe921\/canvas-editor` (\d+\.\d+\.\d+)/, 'the closest published engine release'),
    },
    {
      name: 'codec',
      repository: 'Hufe921/canvas-editor-plugin',
      npm: '@hufe921/canvas-editor-plugin-docx',
      commit: find(codecMarkdown, new RegExp(`\\| Current upstream snapshot \\| plugin monorepo commit \`${sha}\``), 'the codec upstream snapshot'),
      version: find(codecMarkdown, /\| Fork base \| `@hufe921\/canvas-editor-plugin-docx` (\d+\.\d+\.\d+)/, 'the codec fork base'),
    },
  ];
}

/** Numeric comparison of x.y.z versions (pre-release suffixes ignored). */
export function compareVersions(left, right) {
  const parts = (value) => value.split('-')[0].split('.').map(Number);
  const [a, b] = [parts(left), parts(right)];
  for (let index = 0; index < 3; index++) if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0);
  return 0;
}

/** Collect drift for each pin using injected fetchers (GitHub REST JSON, npm registry JSON). */
export async function checkPins(pins, { github, npm }) {
  const results = [];
  for (const pin of pins) {
    const repository = await github(`/repos/${pin.repository}`);
    const branch = repository.default_branch;
    const compare = await github(`/repos/${pin.repository}/compare/${pin.commit}...${branch}`);
    const latest = (await npm(pin.npm))['dist-tags']?.latest;
    results.push({
      ...pin,
      branch,
      commitsAhead: compare.ahead_by ?? 0,
      diverged: compare.status === 'diverged',
      compareUrl: compare.html_url,
      latest,
      newerRelease: typeof latest === 'string' && compareVersions(latest, pin.version) > 0,
    });
  }
  return results;
}

export function report(results) {
  const drift = results.some((result) => result.commitsAhead > 0 || result.newerRelease || result.diverged);
  const lines = [
    drift ? 'Upstream has moved since the pins in `UPSTREAM.md`. Review the changes, port what applies, and update the pins.' : 'All upstream pins in `UPSTREAM.md` are current.',
    '',
    '| Package | Upstream | Pinned commit | Commits on default branch since pin | Pinned release | Latest npm release |',
    '| --- | --- | --- | --- | --- | --- |',
    ...results.map((result) => `| ${result.name} | [${result.repository}](https://github.com/${result.repository}) | \`${result.commit.slice(0, 12)}\` | ${result.diverged ? 'diverged' : result.commitsAhead}${result.commitsAhead ? ` ([compare](${result.compareUrl}))` : ''} | ${result.npm} ${result.version} | ${result.latest ?? 'unknown'}${result.newerRelease ? ' (newer)' : ''} |`),
    '',
    'This issue is maintained by the scheduled `Upstream watch` workflow (`scripts/check-upstream.mjs`).',
  ];
  return { drift, body: lines.join('\n') };
}

async function main() {
  const root = new URL('../', import.meta.url);
  const [engine, codec] = await Promise.all([
    readFile(new URL('packages/engine/UPSTREAM.md', root), 'utf8'),
    readFile(new URL('packages/codec/UPSTREAM.md', root), 'utf8'),
  ]);
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const headers = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const request = async (path, init = {}) => {
    const response = await fetch(`https://api.github.com${path}`, { ...init, headers: { ...headers, ...init.headers } });
    if (!response.ok) throw new Error(`GitHub API ${init.method ?? 'GET'} ${path} returned ${response.status}.`);
    return response.json();
  };
  const npm = async (name) => {
    const response = await fetch(`https://registry.npmjs.org/${name.replaceAll('/', '%2F')}`, { headers: { accept: 'application/vnd.npm.install-v1+json' } });
    if (!response.ok) throw new Error(`npm registry returned ${response.status} for ${name}.`);
    return response.json();
  };
  const { drift, body } = report(await checkPins(readPins(engine, codec), { github: request, npm }));
  console.log(body);
  if (!process.argv.includes('--report-issue')) return;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository || !token) throw new Error('--report-issue needs GITHUB_REPOSITORY and GH_TOKEN.');
  const issues = await request(`/repos/${repository}/issues?state=open&creator=github-actions%5Bbot%5D&per_page=100`);
  const existing = issues.find((issue) => issue.title === ISSUE_TITLE && !issue.pull_request);
  const json = (value) => ({ method: existing ? 'PATCH' : 'POST', body: JSON.stringify(value), headers: { 'content-type': 'application/json' } });
  if (existing) {
    if (existing.body !== body) await request(`/repos/${repository}/issues/${existing.number}`, json(drift ? { body } : { body, state: 'closed', state_reason: 'completed' }));
    else if (!drift) await request(`/repos/${repository}/issues/${existing.number}`, json({ state: 'closed', state_reason: 'completed' }));
  } else if (drift) await request(`/repos/${repository}/issues`, json({ title: ISSUE_TITLE, body }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
