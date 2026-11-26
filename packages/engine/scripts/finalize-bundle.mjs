#!/usr/bin/env node
// Runs after both bundle builds:
// - removes the source maps Vite writes for inlined workers (dist/assets); the
//   workers are embedded as blobs, so nothing references them;
// - writes dist/testing.js, the `./testing` entry, which takes the diagnostic hooks
//   from the main bundle's internal `__canvasWordTesting` binding, so fixtures share
//   its module instance, and checks the main entry no longer exports them by name;
// - checks the minified bundle points at its source map.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
rmSync(new URL('assets/', dist), { recursive: true, force: true });

const source = readFileSync(new URL('../src/testing.ts', import.meta.url), 'utf8');
const names = [...source.matchAll(/^export \{ (\w+) \} from /gm)].map((match) => match[1]);
if (!names.length) throw new Error('No diagnostic exports found in src/testing.ts.');
const internal = '__canvasWordTesting';
for (const file of ['canvas-word-engine.js', 'canvas-word-engine.min.js']) {
  const bundle = readFileSync(new URL(file, dist), 'utf8');
  const exported = bundle.slice(Math.max(bundle.lastIndexOf('export {'), bundle.lastIndexOf('export{')));
  if (!new RegExp(`\\b${internal}\\b`).test(exported)) throw new Error(`${file} does not export ${internal}.`);
  // Since 2.0.0 the diagnostic hooks are only reachable through ./testing, except
  // EDITOR_CLIPBOARD, which is also part of the upstream editor's public API.
  for (const name of names.filter((hook) => hook !== 'EDITOR_CLIPBOARD'))
    if (new RegExp(`\\bas ${name}\\b|[{,\\s]${name}[,}\\s]`).test(exported))
      throw new Error(`${file} still exports ${name} from the main entry.`);
}
writeFileSync(
  new URL('testing.js', dist),
  `/** Diagnostic hooks for integration fixtures; document applications use the main entry. */\n` +
    `import { ${internal} as hooks } from './canvas-word-engine.js';\n` +
    `export const { ${names.join(', ')} } = hooks;\n`,
);

const minified = readFileSync(new URL('canvas-word-engine.min.js', dist), 'utf8');
if (!minified.trimEnd().endsWith('//# sourceMappingURL=canvas-word-engine.min.js.map') || !existsSync(new URL('canvas-word-engine.min.js.map', dist)))
  throw new Error('The minified bundle is missing its source map.');
