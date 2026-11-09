# @hivemagnus/canvas-word-codec

Headless DOCX codec for Node.js: Word bytes ⇄ a neutral, validated Word exchange
document (`WordDocument`). Reads and writes headings, paragraph layout, lists,
character formatting, hyperlinks, tables, inline images, page breaks, sections,
headers/footers, named styles, tracked changes and comments. No DOM, editor,
download, database or network access.

A maintained MIT fork of the canvas-editor DOCX plugin
(`@hufe921/canvas-editor-plugin-docx`); see [UPSTREAM.md](UPSTREAM.md).

## Install

```bash
npm install @hivemagnus/canvas-word-codec
```

Node.js 24 or later, ES module.

## Read a DOCX

```ts
import { readFile } from 'node:fs/promises';
import { importDocx, paragraphsOf } from '@hivemagnus/canvas-word-codec';

const { document, sections, assets, styleDefinitions, losses, detected } = await importDocx(await readFile('in.docx'));

for (const paragraph of paragraphsOf(document)) {
  console.log(paragraph.id, paragraph.runs.map((run) => run.text).join(''));
}
// losses: features that were converted approximately or dropped, with counts.
// assets: embedded images as {placeholderId, sha256, mediaType, bytesBase64, width, height}.
```

The importer assigns fresh random IDs (UUIDs) to blocks, runs, changes and
comments on every call. Persist the converted document if anything (review
comments, for example) must keep pointing at the same paragraph and run IDs.

## Write a DOCX

```ts
import { writeFile } from 'node:fs/promises';
import { defaultLayout, exportDocx, validateDocument, type WordDocument } from '@hivemagnus/canvas-word-codec';

const document: WordDocument = {
  schemaVersion: 1,
  layout: { ...defaultLayout(), font: 'Liberation Serif', fontSize: 14 },
  changes: [],
  comments: [],
  blocks: [
    { type: 'paragraph', id: 'p1', style: { heading: 1 }, runs: [{ id: 'r1', text: 'Report', style: {} }] },
    {
      type: 'paragraph', id: 'p2', style: { alignment: 'justify', after: 8 },
      runs: [
        { id: 'r2', text: 'Plain and ', style: {} },
        { id: 'r3', text: 'bold', style: { bold: true } },
        { id: 'r4', text: ' with a link', style: { hyperlink: 'https://example.com/', underline: true } },
      ],
    },
    { type: 'paragraph', id: 'p3', style: { list: 'bullet' }, runs: [{ id: 'r5', text: 'A bullet', style: {} }] },
  ],
};

validateDocument(document); // throws WordCodecError on invalid input
await writeFile('out.docx', await exportDocx(document, 'final'));
```

`exportDocx(document, mode, assets?, stories?, styleDefinitions?)` modes:
`'retain-review'` writes tracked changes and comments as native Word review
markup; `'final'` and `'original'` write the accepted or the original text
without review markup. Inline images are passed as
`assets: Map<assetId, { bytes: Buffer, mediaType: 'image/png' | 'image/jpeg' | 'image/webp' }>`
and referenced from runs with `inlineImage: { assetId, sha256, alt, width, height }`.

### Markdown

There is no Markdown parser in this package. To produce a DOCX from Markdown,
parse the Markdown with a Markdown library and map its tree to a `WordDocument`
(headings → `style.heading`, paragraphs → `paragraph` blocks, emphasis → run
`style.bold`/`italic`/`strikeout`, links → `style.hyperlink`, list items →
`style.list: 'bullet' | 'number'`, tables → `table` blocks, thematic breaks →
`pageBreak` if wanted), then call `validateDocument` and `exportDocx`.

## API

| Export | Description |
| --- | --- |
| `importDocx(bytes)` | DOCX bytes → `DocxConversion` `{ document, sections, styleDefinitions, assets, losses, detected }`. Rejects unsafe or malformed packages with `WordCodecError`. |
| `exportDocx(document, mode, assets?, stories?, styleDefinitions?)` | `WordDocument` → DOCX `Buffer` (validates first). |
| `exportDocxSections(input, mode)` | Several documents → one DOCX with independent sections, layouts, header/footer stories and optional section titles. |
| `validateDocument(value)` / `documentSchema` | Validate untrusted input as a `WordDocument` (Zod schema plus identity, Unicode and review-graph checks). |
| `validateDocxPackage(bytes)` | Bounded ZIP/XML preflight; returns the package parts as `Map<string, Buffer>`. |
| `readDocumentPackage`, `parseDocumentXml`, `createZipBuffer`, `crc32` | Lower-level package helpers. |
| `defaultLayout()` | Default A4 page layout (794×1123 px, 76 px margins, Georgia 16, page numbers on). |
| `paragraphsOf(document, includeStories?)` | All paragraphs, including table cells (and header/footer when asked). |
| `logicalParagraphs`, `paragraphGroups`, `visibleParagraph`, `visibleRun`, `paragraphStyle`, `runStyle`, `paragraphBoundaryVisible` | Project review state for a `'final' \| 'original' \| 'markup'` view. |
| `exchangeDocument(value)` | Canonical JSON string (sorted keys, no `undefined`) for hashing and comparison. |
| `composeWordStories`, `namespaceDocument` | Combine header/footer story documents with a body. |
| `validateStyles`, `importedStyleId` | Named style definitions. |
| `WordCodecError` | Error with `code`, `status` and optional `details`. |
| `MAX_DOCUMENT_BYTES`, `CODEC_VERSION` | 16 MiB exchange limit; package version. |

Types: `WordDocument`, `DocumentBlock`, `DocumentParagraph`, `DocumentRun`,
`DocumentTable`, `DocumentImage`, `DocumentBreak`, `TextStyle`,
`ParagraphStyle`, `DocumentLayout`, `DocumentChange`, `DocumentComment`,
`DocumentAnchor`, `DocumentView`, `ExportMode`, `DocxAsset`, `DocxConversion`,
`DocxSection`, `DocxIncomingAsset`, `WordPackageInput`, `WordStories`,
`WordStyleDefinition(s)`, `ZipEntry`.

## License

MIT. Upstream copyright is retained in [LICENSE](LICENSE); see
[NOTICES.md](NOTICES.md).

## Full-fidelity exchange source candidate

The unreleased 1.1.0 source also exposes `@hivemagnus/canvas-word-codec/exchange`,
which preserves the final PR 46 model for embedded fonts, nested table blocks,
section presentation and precise review snapshots. Its decoded model is richer
than the stable root API; choose that entry explicitly rather than treating the
two models as interchangeable. The existing root API and published 1.0.1 remain
compatible. See [UPSTREAM.md](UPSTREAM.md) for exact source and test evidence.
