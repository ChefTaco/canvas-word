import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

// Builds one self-contained ES module (CSS and workers inlined) and records the
// emitted module graph plus the SHA-256 of the final bytes in dist/build-manifest.json.
// `vite build --mode min` builds the same module minified, with a source map,
// as canvas-word-engine.min.js and adds it to the same manifest.
export default defineConfig(({ mode }) => {
const minified = mode === 'min';
const fileName = minified ? 'canvas-word-engine.min.js' : 'canvas-word-engine.js';
const manifestFile = new URL('./dist/build-manifest.json', import.meta.url);
type Output = { filename: string; sha256: string };
// Keep entries written by the other build of the same version.
const previous = (): Output[] => {
  try {
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as { version: string; outputs: Output[] };
    const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
    return manifest.version === version ? manifest.outputs.filter((output) => output.filename !== fileName) : [];
  } catch {
    return [];
  }
};
return {
  plugins: [
    cssInjectedByJsPlugin(),
    {
      name: 'canvas-word-bundle-manifest',
      generateBundle(_options, bundle) {
        const outputs = Object.values(bundle)
          .filter((output) => output.type === 'chunk')
          .map((output) => ({
            filename: output.fileName,
            sha256: createHash('sha256').update(output.code).digest('hex'),
            modules: Object.keys(output.modules)
              .map((name) => name.replace(new URL('.', import.meta.url).pathname, ''))
              .sort(),
            imports: output.imports,
          }));
        if (outputs.some((output) => output.imports.length))
          throw new Error('The engine bundle unexpectedly has external runtime chunks.');
        mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
        writeFileSync(
          manifestFile,
          JSON.stringify(
            {
              schemaVersion: 1,
              version: JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
                .version,
              outputs: [...previous(), ...outputs].sort((a, b) => a.filename.localeCompare(b.filename)),
            },
            null,
            2,
          ) + '\n',
        );
      },
      writeBundle: {
        order: 'post',
        sequential: true,
        handler() {
          const file = manifestFile;
          const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
            outputs: Array<{ filename: string; sha256: string }>;
          };
          for (const output of manifest.outputs.filter((entry) => entry.filename === fileName))
            output.sha256 = createHash('sha256')
              .update(readFileSync(new URL(`./dist/${output.filename}`, import.meta.url)))
              .digest('hex');
          writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
        },
      },
    },
  ],
  build: {
    emptyOutDir: false,
    lib: { entry: 'src/bundle.ts', formats: ['es'], fileName: () => fileName },
    target: 'es2022',
    ...(minified ? { minify: true, sourcemap: true, rolldownOptions: { output: { minify: true } } } : {}),
  },
};
});
