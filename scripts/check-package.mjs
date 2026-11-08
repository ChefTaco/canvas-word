#!/usr/bin/env node
// Packs both workspace packages, checks their file lists against an allowlist, scans the
// packed bytes for secrets and private data, installs the tarballs into a disposable prefix,
// and checks that the installed packages resolve, type-check and (codec) round-trip a document.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { privateInfrastructureFindings, secretFindings } from './privacy-policy.mjs';

const root = resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(join(tmpdir(), 'canvas-word-package-check-'));
const run = (command, args, options = {}) => new Promise((done, reject) => {
  execFile(command, args, { cwd: root, timeout: 300_000, maxBuffer: 16 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
    if (error) reject(new Error(`${command} ${args.join(' ')} failed: ${String(stderr).slice(-2000) || error.message}`));
    else done(String(stdout));
  });
});

const packages = [
  {
    dir: 'packages/engine',
    tarball: /^hivemagnus-canvas-word-engine-\d[\w.-]*\.tgz$/,
    allowed: [/^dist\/canvas-word-engine\.js$/, /^dist\/build-manifest\.json$/, /^dist\/types\/.+\.d\.ts$/, /^notices\/[\w.-]+$/,
      /^(?:LICENSE|NOTICES\.md|UPSTREAM\.md|README\.md|package\.json)$/],
    required: ['dist/canvas-word-engine.js', 'dist/types/index.d.ts', 'LICENSE', 'NOTICES.md', 'UPSTREAM.md', 'README.md'],
  },
  {
    dir: 'packages/codec',
    tarball: /^hivemagnus-canvas-word-codec-\d[\w.-]*\.tgz$/,
    allowed: [/^dist\/[\w.-]+\.(?:js|d\.ts)$/, /^dist\/cjs\/[\w.-]+\.(?:js|d\.ts|json)$/,  /^(?:LICENSE|NOTICES\.md|UPSTREAM\.md|README\.md|package\.json)$/],
    required: ['dist/index.js', 'dist/index.d.ts', 'LICENSE', 'NOTICES.md', 'UPSTREAM.md', 'README.md'],
  },
];

const termsFile = join(root, '.private-terms');
const terms = existsSync(termsFile)
  ? (await readFile(termsFile, 'utf8')).split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
  : [];
const termPattern = terms.length ? new RegExp(terms.join('|'), 'i') : undefined;
const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
// Addresses that legitimately appear in shipped code: documentation examples only.
const allowedEmail = /@example\.(?:com|org|net)\b/i;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

try {
  await run('npm', ['run', 'build']);
  const tarballs = [];
  for (const pkg of packages) {
    const cwd = join(root, pkg.dir);
    const listing = JSON.parse(await run('npm', ['pack', '--dry-run', '--json', '--silent'], { cwd }));
    const files = listing[0].files.map((file) => file.path);
    const unexpected = files.filter((path) => !pkg.allowed.some((pattern) => pattern.test(path)));
    if (unexpected.length) throw new Error(`${pkg.dir}: unexpected packed files: ${unexpected.join(', ')}`);
    for (const required of pkg.required) if (!files.includes(required)) throw new Error(`${pkg.dir}: packed file missing: ${required}`);

    const filename = (await run('npm', ['pack', '--pack-destination', temporary, '--silent'], { cwd })).trim().split('\n').at(-1);
    if (!filename || !pkg.tarball.test(filename)) throw new Error(`${pkg.dir}: pack did not produce the expected tarball`);
    tarballs.push(join(temporary, filename));

    const extracted = join(temporary, `${filename}.contents`);
    await mkdir(extracted);
    await run('tar', ['-xzf', join(temporary, filename), '-C', extracted]);
    let findings = 0;
    for await (const file of walk(extracted)) {
      const relative = file.slice(extracted.length + 1);
      const content = await readFile(file, 'utf8');
      for (const finding of [...secretFindings(content), ...privateInfrastructureFindings(content)]) {
        console.error(`${filename}:${relative}:${finding.line}: ${finding.rule} [redacted]`);
        findings++;
      }
      for (const [index, line] of content.split('\n').entries()) {
        if (termPattern?.test(line)) { console.error(`${filename}:${relative}:${index + 1}: private term [redacted]`); findings++; }
        const match = line.match(email);
        if (match && !allowedEmail.test(match[0])) { console.error(`${filename}:${relative}:${index + 1}: email address [redacted]`); findings++; }
      }
    }
    if (findings) throw new Error(`${filename}: ${findings} privacy finding(s) in packed files`);
  }

  const install = join(temporary, 'install');
  await mkdir(install);
  await writeFile(join(install, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }));
  const types = JSON.parse(await readFile(join(root, 'node_modules/@types/node/package.json'), 'utf8')).version;
  const typescript = JSON.parse(await readFile(join(root, 'node_modules/typescript/package.json'), 'utf8')).version;
  await run('npm', ['install', '--no-audit', '--no-fund', ...tarballs, `@types/node@${types}`, `typescript@${typescript}`], { cwd: install });

  // Codec: the installed ESM entry converts a document both ways.
  await writeFile(join(install, 'codec.mjs'), `
    import { CODEC_VERSION, defaultLayout, exportDocx, importDocx } from '@hivemagnus/canvas-word-codec';
    const document = { schemaVersion: 1, changes: [], comments: [], layout: defaultLayout(),
      blocks: [{ type: 'paragraph', id: 'p', style: { heading: 1 }, runs: [{ id: 'r', text: 'Packed', style: { bold: true } }] }] };
    const back = await importDocx(await exportDocx(document, 'final'));
    if (back.document.blocks[0].runs[0].text !== 'Packed' || !back.document.blocks[0].runs[0].style.bold) throw new Error('codec round trip failed');
    console.log(CODEC_VERSION);
  `);
  const codecVersion = (await run(process.execPath, ['codec.mjs'], { cwd: install })).trim();
  await writeFile(join(install, 'codec.cjs'), `
    const { CODEC_VERSION, defaultLayout, exportDocx, importDocx } = require('@hivemagnus/canvas-word-codec');
    (async () => {
      const document = { schemaVersion: 1, changes: [], comments: [], layout: defaultLayout(), blocks: [{ type: 'paragraph', id: 'p', style: {}, runs: [{ id: 'r', text: 'CommonJS', style: {} }] }] };
      const back = await importDocx(await exportDocx(document, 'final'));
      if (back.document.blocks[0].runs[0].text !== 'CommonJS') throw new Error('CommonJS round trip failed');
      console.log(CODEC_VERSION);
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `);
  const commonjsVersion = (await run(process.execPath, ['codec.cjs'], { cwd: install })).trim();
  if (commonjsVersion !== codecVersion) throw new Error('Codec module versions differ');

  // Engine: browser-only, so check that the export map resolves and that both packages'
  // published declarations type-check for a NodeNext consumer without skipLibCheck.
  const resolved = (await run(process.execPath, ['--input-type=module', '-e',
    "console.log(import.meta.resolve('@hivemagnus/canvas-word-engine'))"], { cwd: install })).trim();
  if (!resolved.endsWith('/node_modules/@hivemagnus/canvas-word-engine/dist/canvas-word-engine.js')) throw new Error('engine export map does not resolve');
  await writeFile(join(install, 'consumer.ts'), `
    import Editor, { EditorMode, ElementType, type IEditorResult, type IElement } from '@hivemagnus/canvas-word-engine';
    import { exportDocx, importDocx, type WordDocument } from '@hivemagnus/canvas-word-codec';
    const element: IElement = { type: ElementType.TEXT, value: 'x', id: 'run-1', externalId: 'run-1' };
    export function mount(container: HTMLDivElement): IEditorResult {
      const editor = new Editor(container, [element], { mode: EditorMode.READONLY });
      return editor.command.getValue({ extraPickAttrs: ['id'] });
    }
    export async function convert(bytes: Buffer): Promise<WordDocument> {
      return (await importDocx(await exportDocx((await importDocx(bytes)).document, 'final'))).document;
    }
  `);
  await writeFile(join(install, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true,
      skipLibCheck: false, lib: ['ES2022', 'DOM', 'DOM.Iterable'], types: ['node'] },
    files: ['consumer.ts'],
  }));
  await run(process.execPath, [join(install, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], { cwd: install });
  console.log(JSON.stringify({ packages: tarballs.map((path) => path.split('/').at(-1)), codecVersion, engineExports: 'ok', consumerTypes: 'ok' }));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
