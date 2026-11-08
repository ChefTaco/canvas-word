# canvas-word

Canvas-based Word document engine and DOCX codec, published as two MIT
packages. Both are maintained forks of
[Hufe921/canvas-editor](https://github.com/Hufe921/canvas-editor) projects.

| Package | What it is | Runs in |
| --- | --- | --- |
| [`@hivemagnus/canvas-word-engine`](packages/engine) | Canvas rich-text editor with Word-style paginated page view, read-only mode and stable serialized paragraph/run identities. Fork of `canvas-editor`. | Browser |
| [`@hivemagnus/canvas-word-codec`](packages/codec) | Headless DOCX codec: DOCX bytes ⇄ neutral, validated Word exchange document, with tracked changes, comments, tables, images, sections and headers/footers. Fork of `canvas-editor-plugin-docx`. | Node.js 24+ |

## Install

```bash
npm install @hivemagnus/canvas-word-engine   # browser
npm install @hivemagnus/canvas-word-codec    # Node.js
```

## Usage

Convert a DOCX on the server and write one back:

```ts
import { exportDocx, importDocx, paragraphsOf } from '@hivemagnus/canvas-word-codec';

const { document, losses } = await importDocx(docxBytes);
const text = paragraphsOf(document).map((p) => p.runs.map((r) => r.text).join(''));
const bytes = await exportDocx(document, 'retain-review'); // or 'final' / 'original'
```

Render it read-only in the browser, keeping paragraph and run IDs addressable:

```ts
import Editor, { EditorMode, type IElement } from '@hivemagnus/canvas-word-engine';
import type { WordDocument } from '@hivemagnus/canvas-word-codec';

function toElements(document: WordDocument): IElement[] {
  return document.blocks.flatMap((block): IElement[] =>
    block.type !== 'paragraph'
      ? []
      : [
          ...block.runs.map((run): IElement => ({
            id: run.id,
            externalId: run.id,
            value: run.text,
            bold: run.style.bold,
            italic: run.style.italic,
            extension: { paragraphId: block.id, runId: run.id },
          })),
          { id: `${block.id}-mark`, value: '\n', extension: { paragraphId: block.id } },
        ],
  );
}

const editor = new Editor(container, toElements(document), { mode: EditorMode.READONLY });
const saved = editor.command.getValue({ extraPickAttrs: ['id'] }); // same IDs after reload
```

The example maps only paragraphs and two styles; a full mapping also covers
headings, paragraph layout (`paragraphLayout`), tables, images and review
traces. See each package's README for its API:
[engine](packages/engine/README.md), [codec](packages/codec/README.md).

## Lineage

| Package | Upstream | Fork base | Details |
| --- | --- | --- | --- |
| engine | [Hufe921/canvas-editor](https://github.com/Hufe921/canvas-editor) | commit `71aa0996` (1.0.5 + merged PR 1492) | [UPSTREAM.md](packages/engine/UPSTREAM.md) |
| codec | [Hufe921/canvas-editor-plugin](https://github.com/Hufe921/canvas-editor-plugin) `packages/docx` | 1.0.0, commit `4741a9f8` | [UPSTREAM.md](packages/codec/UPSTREAM.md) |

Versions restart at 1.0.0 for these public packages. Upstream licenses and
copyright notices are retained in each package's `LICENSE` and `NOTICES.md`.

## Development

```bash
npm ci
npm run hooks:install
npm run verify        # privacy and secret scans, typecheck, tests, build, browser render test, package checks
```

The browser render test needs a Playwright Chromium
(`npx playwright install chromium` if you do not have one).

Releases: push `engine-vX.Y.Z` or `codec-vX.Y.Z` (matching that package's
version) to run `.github/workflows/publish.yml`, which publishes through npm
trusted publishing with provenance after approval on the `npm-publish`
environment. See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE).
