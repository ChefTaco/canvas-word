# AGENTS.md - canvas-word

Guidance for contributors (human or AI). This public MIT repository publishes
two maintained forks of Hufe921's canvas-editor projects:
`@hivemagnus/canvas-word-engine` (`packages/engine`) and
`@hivemagnus/canvas-word-codec` (`packages/codec`). Preserve every `LICENSE`,
`NOTICES.md`, `notices/`, `UPSTREAM.md`, `packages/codec/provenance/` and the
upstream snapshots in `packages/codec/upstream*/`.

## Privacy

This repository is public. Never commit secrets, private infrastructure, local
notes, or real user data, in code, tests, fixtures, docs, or commit messages:

- No real hostnames, private network domains, IP addresses, usernames, email
  addresses, or home paths. Use placeholders: `example.com` hosts, documentation
  IP ranges (`192.0.2.0/24`), `operator` or `user` accounts, `/home/operator`,
  and fake tokens such as `fixture-token`.
- Test documents are synthetic and generated in code. Never add a real
  document, manuscript or customer file as a fixture.
- Never commit `.env`, keys, certificates, databases, `AGENTS.local.md`,
  `CLAUDE.local.md`, or `.private-terms`. Read `AGENTS.local.md` when present;
  never copy it into tracked content.
- Install the hooks with `npm run hooks:install` and never bypass them
  (`--no-verify`). They run `scripts/check-private-data.sh` (forbidden paths and
  the optional, gitignored `.private-terms` denylist, also on commit messages)
  and `scripts/scan-secrets.sh`.

## Ground rules

- Node.js 24.22.1+ or 26.13.0+, npm workspaces, ESM, strict TypeScript.
- The engine has no runtime dependencies and builds to one self-contained
  bundle; keep it that way. Upstream engine source keeps its original
  formatting; keep fork changes small and generic.
- The codec stays headless: no DOM, network, filesystem or editor access in its
  runtime. Validate every external document with `validateDocument`.
- No application-specific behaviour in either package.
- Every fork change gets an entry in that package's `UPSTREAM.md` (what, tests,
  upstream status) and a test.

## Tests and gates

```bash
npm run verify   # privacy tests, secret and private-data scans, typecheck, unit tests, build, browser render test, package checks
```

The browser render test (`npm run test:browser`) needs a Playwright Chromium;
CI installs it with `npx playwright install --with-deps chromium`.

## Commits and releases

Use [Conventional Commits](https://www.conventionalcommits.org/). Never
overwrite published versions or release tags. Each package is released from its
own tag, `engine-vX.Y.Z` or `codec-vX.Y.Z`, matching its `package.json`, through
`.github/workflows/publish.yml`, which waits for approval on the `npm-publish`
environment and authenticates with npm trusted publishing. Update `CHANGELOG.md`
with every release.
