# Notices and license elections

This maintained fork is MIT licensed. Retain the upstream Hufe copyright and
license in [LICENSE](LICENSE) with every redistribution. The headless exchange
code added by the fork is also distributed under MIT.

## Runtime dependencies

The published package depends on, and does not bundle, `@xmldom/xmldom`,
`saxes`, `yauzl`, `yazl` and `zod` (with their transitive dependencies
`buffer-crc32`, `pend` and `xmlchars`). Each is installed from npm with its own
license. Copies of their license files at the time of the fork are kept in the
repository under `provenance/runtime-notices/` for reference.

## Original upstream closure (provenance only)

The original upstream plugin's source-lock runtime closure has 26 entries,
including two type packages. Their package integrity, version and license
inventory is in `provenance/upstream-dependency-inventory.json` and their legal
files are in `provenance/notices/` (repository only). They are provenance
evidence: the original browser bundle and its runtime dependencies (JSZip, Color,
the `docx` package and their dependencies) are not used by this headless
package.

JSZip 3.10.1 is dual licensed. **This fork explicitly elects JSZip's MIT
option.** The complete upstream license notice is retained. Pako's MIT and Zlib
notices are retained, including the embedded Zlib source copyright/license
comments. BlueOak, ISC and MIT notices of all other original closure entries
remain intact.

This distribution contains no bundled font or image files. Applications supply
fonts and assets with their own licenses.
