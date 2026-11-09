# @hivemagnus/canvas-word-engine

Canvas-based Word-style document editor engine: paginated page view, rich text,
tables, images, headers/footers, review traces and read-only mode, rendered on
`<canvas>`. A maintained MIT fork of
[Hufe921/canvas-editor](https://github.com/Hufe921/canvas-editor) with stable
serialized element identities, paragraph geometry and input/selection fixes
(see [UPSTREAM.md](UPSTREAM.md)).

Browser only. One self-contained ES module with no runtime dependencies (CSS
and web workers are inlined).

## Install

```bash
npm install @hivemagnus/canvas-word-engine
```

## Usage

```ts
import Editor, { EditorMode, ElementType, type IElement } from '@hivemagnus/canvas-word-engine';

// Paragraphs are runs of text followed by a '\n' paragraph mark. Give runs and marks
// IDs (and an externalId per run) when you need to address them later, for example
// for review comments anchored to {paragraphId, start, end}.
const main: IElement[] = [
  { type: ElementType.TEXT, id: 'run-1', externalId: 'run-1', value: 'The bridge ', extension: { paragraphId: 'p1' } },
  { type: ElementType.TEXT, id: 'run-2', externalId: 'run-2', value: 'creaked', bold: true, extension: { paragraphId: 'p1' } },
  { type: ElementType.TEXT, id: 'p1-mark', value: '\n', extension: { paragraphId: 'p1' } },
];

const container = document.querySelector<HTMLDivElement>('#editor')!;
const editor = new Editor(container, { header: [], main, footer: [] }, {
  mode: EditorMode.READONLY, // read-only page view
  historyMaxRecordCount: 0, // optional: disable native undo snapshots when you keep your own history
  imageSourceAllowed: (element) => element.value.startsWith('data:'), // optional image policy
});

// Serialize. IDs are kept only when asked for; runs sharing an externalId are coalesced.
const { data } = editor.command.getValue({ extraPickAttrs: ['id'] });
// Loading `data` into a new Editor and serializing again returns the same IDs.

editor.destroy();
```

### Identity and review anchors

- `getValue({ extraPickAttrs: ['id'] })` keeps element, table, row and cell IDs.
  Without it, IDs are stripped (as upstream does for clipboard data).
- Glyphs are expanded internally; serialization merges glyphs with the same
  `externalId` back into one run and keeps the first glyph's ID, so a run's ID is
  stable across serialize → load → serialize.
- `extension` is opaque application metadata carried through unchanged; use it
  for paragraph/run membership.
- Paragraph marks stay separate elements, and a literal U+200B is ordinary text.
- `command.getRuntimeElementList()` returns a clone of the expanded runtime list
  (to map a selection back to run IDs and offsets);
  `command.executeSetExternalElementBindings([...])` binds freshly typed glyph
  spans to external runs without touching content or history.

### Paragraph layout

Elements accept an optional `paragraphLayout` (`before`, `after`, `indent`,
`firstLineIndent`, `keepWithNext`, `pageBreakBefore`) and `paragraphBreak: false`
for soft line breaks.

Version 1.1.0 also includes the preserved atomic binding/selection, exact nested
range restoration, mixed-direction story table, explicit line-height, table
padding/row-keep and paragraph-flow APIs. See [UPSTREAM.md](UPSTREAM.md) for exact
contribution heads, capability limits and validation. The original
`executeSetExternalElementBindings` and `paragraphLayout` contracts remain available.
Diagnostic fixtures may import `./testing` to exercise the installed bundle.

The rest of the API (commands, events, options, plugins) is upstream
canvas-editor's; see its [documentation](https://hufe.club/canvas-editor-docs/).

## License

MIT. Upstream copyright is retained in [LICENSE](LICENSE); embedded build
helper notices are in [NOTICES.md](NOTICES.md).

The unreleased 1.2.0 source also preserves the generic section-layout candidate,
including continuous columns, page-owned stories/fields, paragraph boxes and
section table flow. Use an exact verified source pin for this candidate; npm
1.1.0 remains the published stable engine. See [UPSTREAM.md](UPSTREAM.md).
