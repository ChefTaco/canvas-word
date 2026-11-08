#!/usr/bin/env node
// Makes the emitted declarations consumable from every TypeScript module resolution mode:
// - removes the editor's side-effect stylesheet import (the CSS is injected into the
//   JavaScript bundle, so consumers cannot resolve it);
// - adds explicit `.js` / `/index.js` extensions to relative specifiers, which ESM
//   declaration files need under `node16`/`nodenext` resolution.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = new URL('../dist/types/', import.meta.url).pathname;
const assetImport = /^import ['"][^'"]+\.css['"];\r?\n/gm;
const relative = /((?:from|import)\s*\(?\s*)(['"])(\.{1,2}(?:\/[^'"]*)?)\2/g;
let assets = 0;
const visit = (dir) => {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) visit(file);
    else if (file.endsWith('.d.ts')) rewrite(file);
  }
};
function rewrite(file) {
  const source = readFileSync(file, 'utf8');
  const next = source
    .replace(assetImport, () => (assets++, ''))
    .replace(relative, (match, lead, quote, specifier) => {
      if (/\.js$/.test(specifier)) return match;
      const target = resolve(dirname(file), specifier);
      if (existsSync(`${target}.d.ts`)) return `${lead}${quote}${specifier}.js${quote}`;
      if (existsSync(join(target, 'index.d.ts'))) return `${lead}${quote}${specifier}/index.js${quote}`;
      throw new Error(`Unresolved declaration import ${specifier} in ${file}`);
    });
  if (next !== source) writeFileSync(file, next);
  if (/['"][^'"]+\.css['"]|\?worker/.test(next)) throw new Error(`Asset import remains in ${file}`);
}
visit(root);
if (assets === 0) throw new Error('Expected the stylesheet import in the declaration output.');
