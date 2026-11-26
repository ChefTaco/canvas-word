#!/usr/bin/env node
// Runs after both bundle builds:
// - removes the source maps Vite writes for inlined workers (dist/assets); the
//   workers are embedded as blobs, so nothing references them;
// - writes dist/testing.js, the `./testing` entry, as a thin re-export of the
//   diagnostic hooks from the main bundle, so fixtures share its module instance;
// - checks the minified bundle points at its source map.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
rmSync(new URL('assets/', dist), { recursive: true, force: true });

const source = readFileSync(new URL('../src/testing.ts', import.meta.url), 'utf8');
const names = [...source.matchAll(/^export \{ (\w+) \} from /gm)].map((match) => match[1]);
if (!names.length) throw new Error('No diagnostic exports found in src/testing.ts.');
const bundle = readFileSync(new URL('canvas-word-engine.js', dist), 'utf8');
for (const name of names)
  if (!new RegExp(`\\bas ${name}\\b|[{,\\s]${name}[,}\\s]`).test(bundle.slice(bundle.lastIndexOf('export {'))))
    throw new Error(`The main bundle does not export ${name}.`);
writeFileSync(
  new URL('testing.js', dist),
  `/** Diagnostic hooks for integration fixtures; document applications use the main entry. */\nexport { ${names.join(', ')} } from './canvas-word-engine.js';\n`,
);

const minified = readFileSync(new URL('canvas-word-engine.min.js', dist), 'utf8');
if (!minified.trimEnd().endsWith('//# sourceMappingURL=canvas-word-engine.min.js.map') || !existsSync(new URL('canvas-word-engine.min.js.map', dist)))
  throw new Error('The minified bundle is missing its source map.');
