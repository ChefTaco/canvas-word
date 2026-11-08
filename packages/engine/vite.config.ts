import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

// Builds one self-contained ES module (CSS and workers inlined) and records the
// emitted module graph plus the SHA-256 of the final bytes in dist/build-manifest.json.
export default defineConfig({
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
          new URL('./dist/build-manifest.json', import.meta.url),
          JSON.stringify(
            {
              schemaVersion: 1,
              version: JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
                .version,
              outputs,
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
          const file = new URL('./dist/build-manifest.json', import.meta.url);
          const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
            outputs: Array<{ filename: string; sha256: string }>;
          };
          for (const output of manifest.outputs)
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
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'canvas-word-engine.js' },
    target: 'es2022',
  },
});
