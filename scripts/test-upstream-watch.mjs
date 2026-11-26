import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { checkPins, compareVersions, readPins, report } from './check-upstream.mjs';

const root = new URL('../', import.meta.url);
const pins = async () => readPins(
  await readFile(new URL('packages/engine/UPSTREAM.md', root), 'utf8'),
  await readFile(new URL('packages/codec/UPSTREAM.md', root), 'utf8'),
);

test('pins parse from the committed UPSTREAM.md files', async () => {
  const [engine, codec] = await pins();
  assert.equal(engine.repository, 'Hufe921/canvas-editor');
  assert.match(engine.commit, /^[0-9a-f]{40}$/);
  assert.match(engine.version, /^\d+\.\d+\.\d+$/);
  assert.equal(codec.npm, '@hufe921/canvas-editor-plugin-docx');
  assert.match(codec.commit, /^[0-9a-f]{40}$/);
  assert.throws(() => readPins('# moved', '# moved'), /no longer records/);
});

test('versions compare numerically', () => {
  assert(compareVersions('1.10.0', '1.9.9') > 0);
  assert.equal(compareVersions('1.0.5', '1.0.5'), 0);
  assert(compareVersions('1.0.5', '1.2.0') < 0);
});

test('report flags new commits and newer releases, and is quiet when current', async () => {
  const fixture = await pins();
  const fake = (ahead, latest) => ({
    github: async (path) => (path.includes('/compare/') ? { ahead_by: ahead, status: ahead ? 'ahead' : 'identical', html_url: 'https://github.com/example/compare' } : { default_branch: 'main' }),
    npm: async (name) => ({ 'dist-tags': { latest: latest ?? fixture.find((pin) => pin.npm === name).version } }),
  });
  const moved = report(await checkPins(fixture, fake(27, '9.0.0')));
  assert.equal(moved.drift, true);
  assert.match(moved.body, /\| engine \|.*\| 27 \(\[compare\]/);
  assert.match(moved.body, /9\.0\.0 \(newer\)/);
  const current = report(await checkPins(fixture, fake(0)));
  assert.equal(current.drift, false);
  assert.match(current.body, /are current/);
});
