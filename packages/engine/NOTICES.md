# Notices

This package is MIT licensed. The upstream canvas-editor license and copyright
(Copyright (c) 2021-present, hufe) are retained in [LICENSE](LICENSE).

The built ES module has no external runtime imports. Its build graph includes a
Rolldown runtime helper, and the CSS insertion helper from
`vite-plugin-css-injected-by-js` is injected into the final bytes. Their MIT
notices are retained in [notices/](notices/), including Rolldown's third-party
notice file. Do not infer the absence of embedded code from `package.json`
having no runtime dependencies.

`dist/build-manifest.json` records every emitted module and the SHA-256 of the
final bundle bytes after CSS injection. This package contains no bundled font or
image files.
