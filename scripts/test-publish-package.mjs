import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { parseReleaseRef, publishedVersionExists, publishPackage } from './publish-package.mjs';

const names = { engine: '@hivemagnus/canvas-word-engine', codec: '@hivemagnus/canvas-word-codec' };

function releaseFixture(t, manifest = {}) {
  const root = mkdtempSync(join(tmpdir(), 'canvas-word-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [key, name] of Object.entries(names)) {
    mkdirSync(join(root, 'packages', key), { recursive: true });
    writeFileSync(join(root, 'packages', key, 'package.json'), JSON.stringify({
      name, version: '1.0.1', publishConfig: { access: 'public' }, ...manifest,
    }));
  }
  return root;
}

test('release tags name exactly one package and version', () => {
  assert.deepEqual(parseReleaseRef('refs/tags/engine-v1.2.3'), { key: 'engine', version: '1.2.3' });
  assert.deepEqual(parseReleaseRef('refs/tags/codec-v2.0.0-rc.1'), { key: 'codec', version: '2.0.0-rc.1' });
  for (const ref of ['refs/tags/v1.0.0', 'refs/heads/main', 'refs/tags/other-v1.0.0', 'refs/tags/engine-1.0.0', undefined]) {
    assert.equal(parseReleaseRef(ref), undefined, String(ref));
  }
});

test('only an explicit 404 means a version is absent; other registry failures stop publication', async () => {
  assert.equal(await publishedVersionExists('@example/package', '1.0.1', async (url, options) => {
    assert.equal(url, 'https://registry.npmjs.org/%40example%2Fpackage/1.0.1');
    assert.equal(options.redirect, 'error');
    return new Response('', { status: 404 });
  }), false);
  assert.equal(await publishedVersionExists('@example/package', '1.0.1', async () =>
    Response.json({ name: '@example/package', version: '1.0.1' })), true);
  for (const status of [401, 403, 429, 500, 503]) {
    await assert.rejects(publishedVersionExists('@example/package', '1.0.1', async () => new Response('', { status })), new RegExp(`HTTP ${status}`));
  }
  await assert.rejects(publishedVersionExists('@example/package', '1.0.1', async () => Response.json({})), /Unexpected npm metadata/);
});

test('the workflow publishes only from the protected environment, with OIDC and no stored npm credential', () => {
  const workflow = parse(readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8'));
  const job = workflow.jobs.publish;
  assert.equal(job.environment, 'npm-publish');
  assert.equal(job.permissions['id-token'], 'write');
  assert.deepEqual(workflow.on.push.tags, ['engine-v*', 'codec-v*']);
  assert.equal(workflow.on.workflow_dispatch.inputs.dry_run.default, true);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.package.options, ['engine', 'codec']);
  const steps = job.steps;
  assert.equal(steps.at(-1).run, 'node scripts/publish-package.mjs');
  assert.ok(steps.some(step => step.run === 'node scripts/check-publish-environment.mjs' && step.if === "env.DRY_RUN != 'true'"));
  assert.ok(!JSON.stringify(workflow).includes('secrets.'));
});

test('real publication requires the matching package tag and a definite registry answer', async t => {
  const root = releaseFixture(t);
  let publications = 0;
  const run = () => { publications++; };
  for (const ref of ['refs/heads/main', 'refs/tags/engine-v1.0.0', 'refs/tags/codec-v1.0.1', 'refs/tags/v1.0.1']) {
    await assert.rejects(publishPackage({ root, key: 'engine', dryRun: false, ref, run }), /matching release tag/, ref);
  }
  await assert.rejects(publishPackage({ root, key: 'engine', dryRun: false, ref: 'refs/tags/engine-v1.0.1', run,
    fetcher: async () => new Response('', { status: 503 }) }), /HTTP 503/);
  assert.equal(publications, 0);
});

test('dry runs validate the package directory without registry access or provenance', async t => {
  const root = releaseFixture(t);
  const calls = [];
  await publishPackage({ root, key: 'codec', dryRun: true, ref: 'refs/heads/main', fetcher: () => { throw new Error('unexpected registry lookup'); },
    run: (...args) => calls.push(args) });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], ['publish', '--dry-run', '--ignore-scripts', '--access', 'public', '--registry', 'https://registry.npmjs.org/']);
  assert.equal(calls[0][2].cwd, join(root, 'packages/codec'));
});

test('real publication skips an existing version and otherwise publishes with provenance', async t => {
  const root = releaseFixture(t);
  const calls = [];
  const run = (...args) => calls.push(args);
  await publishPackage({ root, key: 'engine', dryRun: false, ref: 'refs/tags/engine-v1.0.1', run,
    fetcher: async () => Response.json({ name: names.engine, version: '1.0.1' }) });
  assert.equal(calls.length, 0);
  await publishPackage({ root, key: 'engine', dryRun: false, ref: 'refs/tags/engine-v1.0.1', run, fetcher: async () => new Response('', { status: 404 }) });
  assert.equal(calls.length, 1);
  assert.ok(calls[0][1].includes('--provenance'));
  assert.equal(calls[0][2].cwd, join(root, 'packages/engine'));
});

test('package metadata mismatches stop before calling npm', async t => {
  const options = (root, key = 'engine') => ({ root, key, dryRun: true, run: () => assert.fail('npm must not run') });
  await assert.rejects(publishPackage(options(releaseFixture(t, { private: true }))), /public @hivemagnus\/canvas-word-engine/);
  await assert.rejects(publishPackage(options(releaseFixture(t, { publishConfig: {} }), 'codec')), /public @hivemagnus\/canvas-word-codec/);
  await assert.rejects(publishPackage(options(releaseFixture(t, { name: '@example/other' }))), /public @hivemagnus/);
  await assert.rejects(publishPackage(options(releaseFixture(t, { version: 'next' }))), /valid version/);
  await assert.rejects(publishPackage(options(releaseFixture(t), 'other')), /Unknown package/);
  await assert.rejects(publishPackage({ root: releaseFixture(t), key: 'engine', dryRun: undefined }), /explicit boolean/);
});
