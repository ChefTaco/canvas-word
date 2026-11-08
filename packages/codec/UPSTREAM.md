# Upstream and fork lineage

`@hivemagnus/canvas-word-codec` is a maintained MIT fork of the canvas-editor
DOCX plugin, `@hufe921/canvas-editor-plugin-docx`, rewritten as a headless
codec. The upstream MIT license and copyright are retained in [LICENSE](LICENSE).

| | |
| --- | --- |
| Upstream repository | <https://github.com/Hufe921/canvas-editor-plugin> (`packages/docx`) |
| Fork base | `@hufe921/canvas-editor-plugin-docx` 1.0.0, commit `4741a9f8885d57fde1704d39a7aa930aeadc51e6` |
| Current upstream snapshot | plugin monorepo commit `0e8a1b36c8e94061edc19ce05b93c12fbad03b34` (includes merged optional-download PR 45) |
| This package | 1.0.1 |

The repository keeps both upstream snapshots as provenance (they are not
published or built):

- `upstream/` — the original 1.0.0 source and manifest; `provenance/base.json`
  records the published tarball and source archive digests, and
  `provenance/upstream-dependency-inventory.json` plus `provenance/notices/`
  the original 26-entry license closure.
- `upstream-current/` — the current upstream browser source;
  `provenance/upstream-current.json` binds it to its exact commit.

A public headless proposal (upstream PR 46) remains open and is not claimed as
accepted upstream.

## What changed from upstream

The runtime entry `src/index.ts` is a headless rewrite of the plugin's exchange
boundary. Upstream converts between a live canvas-editor instance and a browser
download; this fork converts between DOCX bytes and a neutral, validated Word
exchange document (`WordDocument`), with no editor, DOM, download, database or
network access. Applications supply image bytes and own persistence.

The upstream runtime dependencies (JSZip, Color, the `docx` package) are not
used. The fork uses bounded XML/ZIP parsers (`@xmldom/xmldom`, `saxes`,
`yauzl`) and a buffer ZIP writer (`yazl`), with Zod for validation.

## Fork changes

| Change | What it does | Tests in this repository | Upstream status |
| --- | --- | --- | --- |
| headless-codec | Replace editor-bound export/import and automatic download with a neutral byte/document API; applications own all effects. | `test/headless.test.js` (no DOM, database or network), `test/roundtrip-corpus.test.ts` | Proposal open (PR 46) |
| bounded-package-conversion | CRC checks, bounded decompression and XML, relationship validation, no remote image fetching, inert active content, duplicate-entry rejection. | `test/headless.test.js` unsafe XML, duplicate entries, expansion bombs | Not submitted |
| native-review-exchange | Map insertions, deletions, run property revisions and classic anchored comments to exchange changes and comments. | `test/headless.test.js`, `test/roundtrip-corpus.test.ts` | Not submitted |
| native-paragraph-review | Preserve `w:pPrChange` and paragraph-mark insertion/deletion in original/final/markup views; keep physical block identity while projecting logical paragraphs. | `test/native-paragraphs.test.js` | Not submitted |
| positioned-assets-and-sections | Preserve inline raster images in run order across body, table cells and stories; expose neutral section ranges and layouts; preserve cursor comments and standalone page breaks. | `test/headless.test.js`, `test/native-paragraphs.test.js`, `test/roundtrip-corpus.test.ts` | Not submitted |
| owned-layout-stories | Accept full header/footer documents, keeping tables, inline images and native revisions with part identity isolation. Header/footer comment ranges are rejected, since Word ignores them ([MS-OI29500](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/64b95366-980f-4c75-9519-b745345ded9a)). | `test/headless.test.js` | Not submitted |
| native-comment-range-limit | Reject aggregate classic comment ranges beyond Word's 32767 limit; final/original projections omit native review without mutating input. | `test/headless.test.js` | Not submitted |
| complete-story-preflight | Detect unsupported features and missing/invalid review dates in every Word XML part, including headers and footers, and report them as losses. | `test/headless.test.js` | Not submitted |
| named-style-exchange | Preserve named paragraph and character style definitions, Unicode labels, direct overrides and style references in property revisions; reject undefined or cyclic inheritance. | `test/headless.test.js`, `test/themes.test.js` | Not submitted |
| section-title-control | Let applications suppress automatically inserted section headings while keeping section boundaries. | `test/roundtrip-corpus.test.ts` | Not submitted |
| theme-defaults-and-style-graphs | Resolve internal Latin theme fonts, document defaults and RGB colors; preserve character `basedOn` graphs; report flattened inheritance and unsupported theme features. | `test/themes.test.js` | Not submitted |
| conditional-layout-fidelity | Detect bidirectional, vertical, frame and multi-column layouts and first/even story variants; pick the default story regardless of reference order. | `test/themes.test.js` | Not submitted |
| story-empty-line-typography | Preserve per-story default fonts and sizes, paragraph-mark and empty-run font properties. | `test/themes.test.js`, `test/native-paragraphs.test.js` | Not submitted |
| explicit-source-page-counters | Import a page counter only when a PAGE field is present; center only the generated PAGE paragraph. | `test/themes.test.js`, `test/native-paragraphs.test.js` | Not submitted |
| bounded-export-compression | Store entries whose DEFLATE expansion would exceed 190:1 so exported packages stay within the 200:1 import bound. | `test/headless.test.js` (300000-word paragraph) | Not submitted |
| source-identifier-and-table-fidelity | Report missing/duplicate property-revision IDs and unsupported table alignment; rebuilt OOXML receives unique identities. | `test/headless.test.js` | Not submitted |
| page-field-cache-and-ambiguous-review | Map footer PAGE fields (including cached results and split instructions) to the page counter without keeping cached text; reject ambiguous run property revisions. | `test/headless.test.js` | Not submitted |
| stable-story-round-trip (1.0.0) | A footer paragraph that held only the page counter is not imported as story text, and an exported footer adds an empty paragraph only when it has no content, so header/footer stories no longer grow on each export/import cycle. | `test/roundtrip-corpus.test.ts` | Not submitted |
| esm-package (1.0.0) | Published as an ES module with declarations and an `exports` map; `validateDocument` and `documentSchema` are exported. | `scripts/check-package.mjs` | Packaging only |

## CommonJS compatibility (1.0.1)

The same runtime is emitted as ESM and CommonJS, selected by the package export
map. Both entries expose the same version and pass an installed-package DOCX
round trip. This lets existing CommonJS applications adopt the shared package
without maintaining a separate source fork. `themeColorTransform` is exported
for synthetic theme regression fixtures. No conversion behavior changes.
Tests: `scripts/check-package.mjs` and the existing codec corpus.
Upstream status: packaging only; not submitted.

## Maintenance

Review upstream monthly and advisories continuously. Record base commit,
rationale, test coverage and upstream status for every change, and upgrade pins
only after the round-trip and rejection corpora pass. A release of this package
does not imply upstream acceptance. Microsoft Word acceptance of the exported
files has not been independently certified.
