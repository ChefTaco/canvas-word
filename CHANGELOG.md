# Changelog

Both packages follow [Semantic Versioning](https://semver.org/) and are released
independently (tags `engine-vX.Y.Z` and `codec-vX.Y.Z`).

## Unreleased

### @hivemagnus/canvas-word-codec

- Fix: a Word document with a `mailto:` or other non-HTTP(S) hyperlink no
  longer fails to import. The link is dropped, its text is kept and the
  conversion reports a `HYPERLINK_SCHEME_UNSUPPORTED` loss.
- Fix: the root API now accepts external relationships only for hyperlinks,
  like `./exchange`. External images, attached templates, OLE objects and
  themes are rejected with `UNSAFE_DOCUMENT_RELATIONSHIP`.
- Fix: percent-encoded relationship targets (`media/image%201.png`) resolve to
  their package parts instead of being reported missing.
- The root API and `./exchange` now share one implementation of package
  validation, ZIP writing, hashing, theme resolution and `WordCodecError`, so
  `instanceof WordCodecError` matches errors from either entry point. New
  helpers: `resolveRelationshipTarget` and `isWebHyperlink`.

- Feature: `importDocx(bytes, { limits })` and `validateDocxPackage(bytes,
  generated, limits)` take per-part XML limits (`maxBytes`, `maxNodes`,
  `maxDepth`, `maxAttributes`) so book-length manuscripts can be imported. The
  defaults are unchanged (16 MiB, 200,000 nodes, depth 64, 128 attributes);
  values are bounded by `XML_LIMIT_CEILINGS`, and invalid values throw
  `INVALID_XML_LIMITS`. `DOCUMENT_XML_LIMIT` errors now carry
  `details: { limit, maximum }`.
- Feature: `measureDocx(bytes, { limits? })` preflights a package without
  converting it: part sizes, XML node counts, the limits each part exceeds,
  the feature losses an import would report, and whether validation passes.
- Fix: packages the codec writes are re-validated with a 1,000,000-node budget,
  so exporting a long manuscript no longer fails the codec's own check.

#### Upgrade notes

- Documents with `mailto:` (or `ftp:`, `file:` and similar) links used to be
  rejected with `UNSAFE_DOCUMENT_RELATIONSHIP`; they now import with those links
  removed and a `HYPERLINK_SCHEME_UNSUPPORTED` loss entry. Show losses to users
  as before.
- Root-API callers that imported documents with an external HTTP(S) image,
  template or theme relationship now get `UNSAFE_DOCUMENT_RELATIONSHIP`
  (the `THEME_UNAVAILABLE` and external-image losses no longer occur on import).
  `./exchange` already behaved this way.
- A Word manuscript of a few hundred pages can exceed the default 200,000-node
  limit and fail with `DOCUMENT_XML_LIMIT`. Use `measureDocx` to check first,
  and pass `importDocx(bytes, { limits: { maxNodes } })` where your memory budget
  allows (roughly a few hundred bytes of heap per node).

## @hivemagnus/canvas-word-engine 1.2.1 - 2026-11-26

- Security: always parse pasted and `setHTML` HTML in an inert template and
  strip scripts, inline event handlers and active URLs before it reaches the
  document, also when no `imageSourceAllowed` policy is set. The policy still
  controls only whether image sources stay live.
- Build and test with Node.js 24.22.3+ or 26.13.1+, matching the rest of the suite.

### Upgrade notes

- HTML inserted through paste or `setHTML` no longer keeps scripts, frames,
  objects and embeds, `meta`/`base`/`link` elements, inline
  event handlers (`on*`), `srcdoc`/`formaction` attributes or `javascript:`-style
  and HTML `data:` URLs, even without an `imageSourceAllowed` policy. Content
  that relied on them now arrives without them.

## @hivemagnus/canvas-word-codec 1.1.1 - 2026-11-26

- Require Node.js 24.22.3+ or 26.13.1+ (`engines`), matching the rest of the
  suite. Conversion behavior is unchanged.

## @hivemagnus/canvas-word-engine 1.2.0

- Reject inherited layout entries and shared prototype mutation targets while
  preserving ordinary element identity.

- Retain the generic section-layout candidate: continuous columns, section
  stories, PAGE fields, table flow, paragraph presentation/spacing, native indent
  alignment, hard breaks, terminal cell paragraphs and section-leading space.
- Keep the earlier application compatibility APIs and PR behavior covered by
  the shared engine suite; preserve deferred observer teardown.
- Validate empty nested-table terminators with the internal paragraph marker,
  preserving authored literal zero-width-space text.

## @hivemagnus/canvas-word-codec 1.1.0

- Add the explicit `./exchange` API with the final PR 46 source and 35 retained
  regressions: embedded fonts, nested table presentation, sections, typography,
  native review snapshots and unsupported-feature diagnostics.
- Preserve the established root API and its 53-case round-trip/rejection corpus.
- Emit declarations and ESM/CommonJS entries for both exchange models.

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
