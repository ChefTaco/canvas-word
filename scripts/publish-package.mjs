#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Publishes one workspace package with provenance when its version is not on npm yet.
// Each package is released from its own tag: engine-vX.Y.Z or codec-vX.Y.Z.
// A dry run packs and validates without registry access; a real publication must run from
// the matching tag and authenticates through npm trusted publishing (OIDC).

export const PACKAGES = {
  engine: { name: '@hivemagnus/canvas-word-engine', dir: 'packages/engine' },
  codec: { name: '@hivemagnus/canvas-word-codec', dir: 'packages/codec' },
};

/** Maps a release ref (refs/tags/<key>-vX.Y.Z) to its package key and version. */
export function parseReleaseRef(ref) {
  const match = /^refs\/tags\/(engine|codec)-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(ref ?? '');
  return match ? { key: match[1], version: match[2] } : undefined;
}

export function readReleasePackage(root, key) {
  const expected = PACKAGES[key];
  if (!expected) throw new Error(`Unknown package "${key}"; expected one of ${Object.keys(PACKAGES).join(', ')}`);
  const pkg = JSON.parse(readFileSync(join(root, expected.dir, 'package.json'), 'utf8'));
  if (pkg.name !== expected.name || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version ?? '')
    || pkg.private || pkg.publishConfig?.access !== 'public') {
    throw new Error(`${expected.dir}/package.json must be the public ${expected.name} package with a valid version`);
  }
  return { ...pkg, dir: join(root, expected.dir) };
}

export async function publishedVersionExists(name, version, fetcher = fetch) {
  const response = await fetcher(`https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`, {
    redirect: 'error', signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`Could not check ${name}@${version} on npm (HTTP ${response.status}); publication stopped`);
  const metadata = await response.json();
  if (metadata.name !== name || metadata.version !== version) throw new Error(`Unexpected npm metadata for ${name}@${version}; publication stopped`);
  return true;
}

export async function publishPackage({ root, key, dryRun, ref, fetcher = fetch, run = execFileSync }) {
  if (typeof dryRun !== 'boolean') throw new Error('An explicit boolean dryRun is required');
  const pkg = readReleasePackage(root, key);
  if (!dryRun) {
    const release = parseReleaseRef(ref);
    if (!release || release.key !== key || release.version !== pkg.version) throw new Error('Real publication must run from the matching release tag');
  }
  // A registry or authentication failure must not be mistaken for an unpublished version.
  if (!dryRun && await publishedVersionExists(pkg.name, pkg.version, fetcher)) {
    console.log(`${pkg.name}@${pkg.version} is already on npm; skipping`);
    return;
  }
  // The payload was built, tested and inspected by the gates; never run lifecycle scripts here.
  run('npm', ['publish', dryRun ? '--dry-run' : '--provenance', '--ignore-scripts', '--access', 'public',
    '--registry', 'https://registry.npmjs.org/'], { cwd: pkg.dir, stdio: 'inherit' });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!['true', 'false'].includes(process.env.DRY_RUN)) throw new Error('DRY_RUN must be true or false');
    const dryRun = process.env.DRY_RUN === 'true';
    const key = dryRun ? process.env.PACKAGE : parseReleaseRef(process.env.GITHUB_REF)?.key;
    if (!key) throw new Error('Set PACKAGE for a dry run, or run from an engine-vX.Y.Z / codec-vX.Y.Z tag');
    await publishPackage({ root: resolve(import.meta.dirname, '..'), key, dryRun, ref: process.env.GITHUB_REF });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
