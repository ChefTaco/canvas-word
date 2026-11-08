# Changelog

Both packages follow [Semantic Versioning](https://semver.org/) and are released
independently (tags `engine-vX.Y.Z` and `codec-vX.Y.Z`).

## @hivemagnus/canvas-word-codec 1.0.0

First public release of the maintained headless DOCX codec fork (see
`packages/codec/UPSTREAM.md` for lineage and the full list of fork changes).

- ES module package with declarations and an `exports` map; Node.js 24+.
- `validateDocument` and `documentSchema` are exported.
- Fixed: header/footer stories no longer grow by an empty paragraph on every
  export/import cycle (page-counter-only footer paragraphs are not imported as
  story text; an empty footer is padded only when it has no content).
- Round-trip corpus tests over synthetic documents.

## @hivemagnus/canvas-word-engine 1.0.0

First public release of the maintained canvas-editor engine fork (see
`packages/engine/UPSTREAM.md` for lineage and the full list of fork changes).

- Single self-contained ES module bundle with declarations and an `exports` map.
- Declarations type-check under `NodeNext` without `skipLibCheck`.
- Serialization identity tests and a headless Chromium render smoke test.
