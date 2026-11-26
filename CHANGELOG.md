# Changelog

Both packages follow [Semantic Versioning](https://semver.org/) and are released
independently (tags `engine-vX.Y.Z` and `codec-vX.Y.Z`).

## Unreleased

## @hivemagnus/canvas-word-engine 2.0.0 - 2026-11-26

Major release: iframe blocks from document data are sandboxed in an opaque
origin and get only host-approved Permissions Policy features, and the
diagnostic hooks deprecated in 1.3.0 leave the main entry. The codec is
unchanged (still 1.2.0).

- Security (breaking default): iframe blocks are sandboxed with
  `allow-scripts` only, so script in a `srcdoc` (or same-origin `src`) iframe
  block from document data (`setValue`, `executeInsertElementList`) runs in
  an opaque origin and can no longer read or script the host
  page. Previously the default was `allow-scripts allow-same-origin`, which
  gave such content the host's origin. A document's own `iframeBlock.sandbox`
  list can no longer combine `allow-scripts` with `allow-same-origin` (the
  latter is dropped), malformed lists fall back to the default, and an empty
  list now means the strictest sandbox instead of no sandbox.
- Security: print copies of iframe blocks and iframes in `getHTML` and
  clipboard output carry the same sandbox; print copies had none. The print
  load signal now crosses the sandbox (`window.parent.postMessage`), content
  using `__CUSTOM_CANVAS_EDITOR_LOAD_HOOK__` keeps working unchanged, and a
  frame that never reports is given up after 10 seconds instead of blocking
  the print.
- New option `unsafeIframeAllowSameOrigin` (default `false`) restores the
  previous sandbox for hosts whose documents are all trusted.
- Security: the iframe `allow` attribute (Permissions Policy) is no longer
  taken from document data. A new option `iframeAllow` (default
  `['fullscreen']`) lists the features iframe blocks may use, and a
  document's `iframeBlock.allow` can only narrow it, so a document that asks
  for camera, microphone or geolocation gets nothing unless the host allows
  it. The attribute is now serialized with the Permissions Policy separator
  (`fullscreen; camera`); a list was previously joined with commas instead
  of the `;` the attribute syntax specifies.
- Breaking: the main entry no longer re-exports the diagnostic hooks
  `Draw`, `Previewer`, `HyperlinkParticle` and `mergeOption` or the `IRow` and
  `IElementPosition` types, as announced in 1.3.0; import them from
  `@hivemagnus/canvas-word-engine/testing`, which still shares the main
  bundle's module instance. `EDITOR_CLIPBOARD` stays on the main entry (it is
  part of the editor's public API) and in `./testing`. The bundles carry one
  internal, undeclared binding, `__canvasWordTesting`, that `./testing` reads;
  it is not public API.

### Upgrade notes

- Iframe block content now runs in an opaque origin: it has no access to the
  host page, `parent`/`top` DOM, cookies, `localStorage` or IndexedDB, and the
  host cannot read its document. A `snapDomFunction` that reads the frame's
  document can no longer capture it, and edits made inside a `srcdoc` frame
  are no longer copied back into `iframeBlock.srcdoc`. Messages posted from
  the frame arrive with origin `"null"`; check `event.source` in host message
  listeners. This also applies to `src` embeds from other sites: they no
  longer keep their own origin's cookies and storage inside the editor (a
  cross-origin URL can redirect to a same-origin one, so documents cannot
  opt back in).
- Hosts that need the old behaviour and load only trusted documents can pass
  `unsafeIframeAllowSameOrigin: true`. It restores
  `allow-scripts allow-same-origin` as the default and honours document
  sandbox lists as given, which lets document content run with the host's
  origin.
- Iframe blocks only get the Permissions Policy features the host lists in
  `iframeAllow` (default `['fullscreen']`). Documents whose
  `iframeBlock.allow` asked for other features (for example `camera`,
  `microphone`, `geolocation`, `autoplay`) lose them; hosts that want to
  grant one add it, for example `iframeAllow: ['fullscreen', 'camera']`.
  `iframeAllow: []` delegates nothing. Documents that keep their `allow`
  lists keep working; the lists are now intersected with the host's.
- Imports of `Draw`, `Previewer`, `HyperlinkParticle`, `mergeOption`,
  `IRow` or `IElementPosition` from `@hivemagnus/canvas-word-engine` now fail
  (a TypeScript error, and a module link error in the browser); import them from
  `@hivemagnus/canvas-word-engine/testing` instead, which works since 1.3.0.
- No data or storage migrations; serialized documents are unchanged and
  need no conversion. Downgrading to 1.3.0 is safe: it restores the previous
  sandbox and `allow` handling and the main-entry hooks, and ignores the
  `iframeAllow` and `unsafeIframeAllowSameOrigin` options.

## @hivemagnus/canvas-word-engine 1.3.0 - 2026-11-26

Released from `main`. Includes the 1.2.2 security fix (HTML import never
reparses sanitized markup) together with the new entries below.

- `./testing` now resolves to its own small entry (`dist/testing.js`) that
  re-exports the diagnostic hooks from the main bundle, instead of pointing at
  the main bundle itself. Importing those hooks from the main entry still works
  but is deprecated and ends in the next major version.
- Publish a minified build with a source map beside the readable bundle:
  `@hivemagnus/canvas-word-engine/min` (`dist/canvas-word-engine.min.js` and
  `.map`), recorded in `dist/build-manifest.json`. The readable bundle is
  unchanged.
- Feature: an opt-in off-screen text mirror for screen readers,
  `accessibility: { disabled: false, textMirror: true }`. It mirrors headings,
  paragraphs, lists and table text as DOM, follows edits and marks the caret's
  block with `aria-current`. Off by default.

### Repository

- A weekly `Upstream watch` workflow compares the pins in `UPSTREAM.md` with
  upstream canvas-editor and its DOCX plugin (default branches and npm
  releases) and keeps one reminder issue open while upstream has moved.

### Upgrade notes

- Import diagnostic hooks from `@hivemagnus/canvas-word-engine/testing`.
  Importing them from the main entry still works in 1.x but is deprecated and
  ends in the next major version.
- `@hivemagnus/canvas-word-engine/min` is an optional minified build of the
  same bundle; the main entry and its readable bundle are unchanged.
- The screen-reader text mirror is off by default; enable it with
  `accessibility: { disabled: false, textMirror: true }`.
- Coming from 1.2.1 or earlier: the 1.2.2 notes apply (pasted and `setHTML`
  HTML no longer keeps inline SVG, MathML, `template`, `xmp`, `noembed`,
  `noframes` or `plaintext` content).
- No data or storage migrations; serialized documents are unchanged. Downgrade
  to 1.2.2 is safe when the `./min` and `./testing` entries and `textMirror`
  are not used.

## @hivemagnus/canvas-word-codec 1.2.0 - 2026-11-26

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

- Feature (`./exchange`): footnotes and endnotes. A reference is an empty run
  with `note: { kind: 'footnote' | 'endnote', paragraphs }`; note paragraphs
  hold plain styled text. Import reads Word's footnotes and endnotes parts
  (instead of reporting `footnoteReference`/`endnoteReference` losses), and
  `exportDocx` and `exportDocxSections` write them back, renumbering notes
  across sections. Notes with tracked changes, comments, tables, drawings,
  fields or content controls are dropped with a `NOTE_CONTENT_UNSUPPORTED`
  loss; links and list formatting inside notes are dropped with
  `NOTE_HYPERLINK` / `NOTE_LIST`. The root API is unchanged.

### Repository

- Seeded mutation fuzzing of the codec's untrusted-input boundary
  (`packages/codec/test/fuzz.test.ts`): mutated XML parts, mutated ZIP bytes and
  random XML through both entry points must convert or raise `WordCodecError`.
  `FUZZ_ITERATIONS` and `FUZZ_SEED` widen a local run.

### Upgrade notes

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
- `./exchange` imports now contain note runs (`run.note`) where Word documents
  have footnotes or endnotes. Code that walks runs should keep or skip them;
  `validateDocument` accepts them, and `exportDocx` writes them back.
- No data or storage migrations. Downgrade to 1.1.1 is safe only for callers
  that use none of `limits`, `measureDocx`, `resolveRelationshipTarget`,
  `isWebHyperlink` or note runs; 1.1.1 rejects `mailto:` documents again and
  reports footnotes/endnotes as losses.

## @hivemagnus/canvas-word-engine 1.2.2 - 2026-11-26

Patch release cut from `engine-v1.2.1` (branch `release/engine-1.2.x`); the
engine 1.3.0 additions above are not part of it.

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
