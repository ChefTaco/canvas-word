# Changelog

Both packages follow [Semantic Versioning](https://semver.org/) and are released
independently (tags `engine-vX.Y.Z` and `codec-vX.Y.Z`).

## @hivemagnus/canvas-word-engine 1.1.0

- Preserve the final submitted changes and tests from editor PRs 1495, 1496,
  1505, 1506, 1508 and 1509, including atomic bindings, exact selection recovery,
  mixed-direction story geometry, line heights, cell padding and paragraph flow.
- Retain the shared layout engine and Canvas/SVG rendering backends.
- Preserve the existing binding command, paragraph metadata, identity, resource
  policy, literal zero-width-space and input behavior.
- Add a diagnostic `./testing` export for installed-package integration fixtures.
- Exercise retained browser regressions on both rendering backends.

## @hivemagnus/canvas-word-codec 1.0.1

- Add a CommonJS entry alongside ESM, with installed-package round-trip checks.
- Export the theme color helper for regression fixtures; conversion behavior is unchanged.

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
