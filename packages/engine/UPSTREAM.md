# Upstream and fork lineage

`@hivemagnus/canvas-word-engine` is a maintained MIT fork of
[Hufe921/canvas-editor](https://github.com/Hufe921/canvas-editor), the
canvas-based rich-text editor with Word-style page layout. The upstream MIT
license and copyright are retained in [LICENSE](LICENSE).

| | |
| --- | --- |
| Upstream repository | <https://github.com/Hufe921/canvas-editor> |
| Upstream source pin | commit `71aa0996c2d4c827ec5d86d9acee80eb0a3f98a4` (merge of [PR 1492](https://github.com/Hufe921/canvas-editor/pull/1492), October 12, 2026) |
| Closest published upstream | `@hufe921/canvas-editor` 1.0.5, base commit `f8435acb98badcc831174055e9001d42fe51bb0f` |
| Original fork base | 1.0.4, commit `9af964c2f920da1fcc7d541fae4ab781fcd3bf02` |
| This package | 1.0.0 (versions restart at 1.0.0 for the public package) |

The source pin includes merged PR 1492, which is not yet verified in a published
upstream package. The complete runtime source delta from the 1.0.4 base is
integrated, including incremental row computation, per-control background
properties, disabled-history allocation, caret toggles, the selection
anchor/table-crossing/scroll fixes of issue 1489 and opt-in table identities.

The runtime has no third-party package dependencies. Build tooling (TypeScript,
Vite/Rolldown, Vitest) is development-only; see [NOTICES.md](NOTICES.md) for the
two build helpers embedded in the bundle. Upstream source keeps its original
formatting (including its Chinese comments).

## Fork changes

Each entry lists the change, its test coverage in this repository, and its
upstream status. Patches keep the original 1.0.4 development base noted above
unless stated otherwise. Several were developed against native-browser
fixtures (Chromium and WebKit) that are not part of this repository; the unit
tests under `src/__tests__/` and `test/` plus the headless render smoke test
cover them here.

### 1. Serialized object identity

Element, table row and cell IDs are retained only when the caller requests
`getValue({ extraPickAttrs: ['id'] })`. Default serialization and internal
clipboard data strip them, so pasted objects receive fresh identities. Extra
cell attributes cannot overwrite the recursively serialized `value`.
Adopted from merged upstream [PR 1492](https://github.com/Hufe921/canvas-editor/pull/1492)
with its ten regression cases adapted for glyph identities
(`src/__tests__/stable-object-identities.test.ts`).

### 2. Identity before history

Persistent element IDs are assigned during expansion and insertion, before
history captures them, so new runs and paragraph fragments have deterministic
identities. IDs are excluded from input's style-copy attributes. Covered by
`test/unit/serialization-identity.test.ts` and the browser smoke test.
Upstream status: not submitted.

### 3. Unicode search boundaries

Search maps UTF-16 and case-fold expansion offsets to grapheme elements,
rejects partial grapheme matches, preserves text after the final table and
uses the cursor-before-selection range convention. Upstream status: not
submitted.

### 4. Disable native history allocation

`historyMaxRecordCount: 0` opts out of cloning body/header/footer elements for
native undo snapshots, for callers that keep their own operation journal.
Positive counts keep upstream behavior; content-change events still fire.
Upstream status: merged October 7, 2026 in
[PR 1488](https://github.com/Hufe921/canvas-editor/pull/1488).

### 5. Coalesce externally owned glyph runs

During serialization, differing runtime glyph IDs do not prevent merging
fragments with the same non-empty `externalId`. The first glyph ID is retained;
distinct external IDs, styles, traces and extension metadata stay separate, and
unbound explicit IDs keep their separation. This avoids exporting one record per
character when external IDs represent text runs
(`src/__tests__/external-run-serialization.test.ts`). Upstream status: not
submitted.

### 6. Expanded runtime query for selection

Exposes a cloned current-container element list for computing transient render
ranges from external identities. The query mutates no editor state. Upstream
status: not submitted.

### 7. Focus input within pointer activation

An editable canvas click focuses the input agent synchronously on every
platform, so the first typed characters after a click are not dropped and touch
keyboards activate inside a trusted event. Upstream status: not submitted.

### 8. Compact snapshots and reused font metrics

Shallow element records are coalesced before cloning the serialized snapshot;
table row/cell arrays are copied first so runtime topology is untouched. Basis
glyph metrics are reused per computed CSS font
(`src/__tests__/font-metrics-cache.test.ts`). Upstream status: not submitted.

### 9. Stable external bindings, native focus and touch selection

An application-neutral command binds freshly created glyph spans to external
run metadata without resetting content or adding native history. All spans are
validated before any is mutated, including table cells and grapheme-relative
offsets. Explicit focus commands focus the input agent synchronously. An opt-in
touch selection command captures pointer drags on the canvas without replacing
normal page scrolling. Upstream status: not submitted.

### 10. Visual image fitting preserves serialized dimensions

Oversized inline images are fitted through row metrics instead of mutating
their stored width and height during layout; explicit resizing still changes
dimensions. Upstream status: not submitted.

### 11. Literal zero-width space preservation

U+0000 is the transient paragraph sentinel instead of U+200B, so legitimate
zero-width spaces keep their exact content and UTF-16 offsets. Serialization
translates only the sentinel to a newline; text metrics treat it as zero-width
and drawing never paints it (`src/__tests__/external-run-serialization.test.ts`,
`test/unit/serialization-identity.test.ts`). Upstream status: not submitted.

### 12. Hyperlink navigation safety and visual defaults

Popup anchors and native open actions reject active protocols and
control-character obfuscation; HTTP(S), `mailto:` and relative navigation open
with opener/referrer protection. Hyperlink painting resolves inherited color and
underline without mutating stored formatting
(`src/__tests__/hyperlink-safety.test.ts`). Upstream status: not submitted.

### 13. Visible selection controls formatting toggles

Bold, italic, underline and strikeout toggles ignore internal paragraph
sentinels when deciding the toggle state over a selection
(`src/__tests__/formatting-selection.test.ts`). Upstream status: not submitted.

### 14. Paragraph geometry and pagination

Optional paragraph layout/group metadata (`paragraphLayout`) and soft line
breaks: left/first-line insets are computed during the existing glyph layout
pass; before/after spacing, collapsed adjacent margins, explicit page breaks and
keep-with-next are honored in body, table cells, header and footer
(`src/__tests__/paragraph-layout.test.ts`). No second layout pass is added.
Upstream status: not submitted.

### 15. Application-controlled image loading

An optional image-source predicate is checked before document image, drag
image, resizer and preview construction, including cached and history-restored
images. Restricted HTML paste parses in an inert template and removes
active/resource-bearing markup. Denied images render a placeholder without
fetching their source. Runtime predicates are never serialized
(`src/__tests__/image-source.test.ts`). Upstream status: not submitted.

### 16. Toggle the effective caret formatting

At a collapsed caret, explicit pending insertion formatting takes precedence
over the preceding glyph, so toggling bold/italic/underline/strikeout off and on
restores the insertion style. Upstream status: merged October 7, 2026 in
[PR 1487](https://github.com/Hufe921/canvas-editor/pull/1487); the inherited
hyperlink underline rule remains local.

### 17. Keyboardless edit intentions and soft Enter

Cancelable `beforeinput` deletion and paragraph/line-break intentions are
handled through the existing keyboard handlers, for software keyboards that send
no meaningful keydown. Shift+Enter inserts a soft break and keeps the heading or
list container. See the
[Input Events specification](https://www.w3.org/TR/input-events-2/).
Upstream status: not submitted.

### 18. Touch selection cancellation preserves content

Pointer cancellation, lost capture and disabling touch selection restore the
initial range without applying a drop. Live composition fences touch selection.
Upstream status: not submitted.

### 19. Cursor visibility respects the visual viewport

Cursor scrolling bounds intersect the visual viewport, so the caret stays
visible when a software keyboard shrinks it. Upstream status: not submitted.

### 20. Deferred cursor focus respects later user navigation

A deferred focus request is dropped when focus has moved elsewhere (for example
to a toolbar) or the editor was destroyed in the meantime. Upstream status: not
submitted.

### Packaging changes in this repository (1.0.0)

- Published as an ES module bundle (`dist/canvas-word-engine.js`, CSS and
  workers inlined) with declarations in `dist/types` and an `exports` map.
- Declarations are post-processed (`scripts/finalize-types.mjs`) to drop the
  stylesheet side-effect import and add explicit `.js` extensions, so they
  type-check under `NodeNext` without `skipLibCheck`.
- The one `@/` path-alias import was replaced with a relative import.

## Maintenance policy

Upgrade only to an exact upstream commit after serialization, Unicode, table
identity, review, touch and performance regressions pass. Keep patches small and
propose generic changes upstream once their fixtures pass. Review upstream
monthly; security advisories trigger immediate review.
