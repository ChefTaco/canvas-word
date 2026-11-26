# Changelog

Both packages follow [Semantic Versioning](https://semver.org/) and are released
independently (tags `engine-vX.Y.Z` and `codec-vX.Y.Z`).

## @hivemagnus/canvas-word-engine 1.2.2 - 2026-11-26

- Security fix: the HTML sanitizer added in 1.2.1 could be bypassed. Pasted or
  `setHTML` markup inside a heading was serialized and parsed again in the live
  document after sanitizing, and some markup changes shape when parsed again,
  so an inline event handler could run in the host page. HTML import now works
  on the sanitized nodes and never reparses them; headings, list items and
  table cells recurse with copies of their nodes. The sanitizer also removes
  SVG, MathML, `template`, `xmp`, `noembed`, `noframes` and `plaintext`
  elements, and repeats until its output is stable when serialized and parsed
  again (markup that never settles is dropped). Copy markup
  (`createDomFromElementList` and the clipboard fallback) is no longer
  reparsed in the live document either.

### Upgrade notes

- Security: fixes a sanitizer bypass in 1.2.1 — upgrade. Every application
  that lets users paste HTML or passes untrusted HTML to `setHTML` should move
  to this release.
- Pasted and `setHTML` HTML no longer keeps inline SVG or MathML (including
  their text), `template`, `xmp`, `noembed`, `noframes` or `plaintext`
  content.

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
