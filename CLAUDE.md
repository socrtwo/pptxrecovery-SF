# CLAUDE.md

A small, dependency-free PWA that salvages content from broken `.pptx`
files entirely in the browser. Three-stage repair pipeline: standard ZIP
read → low-level header scan → XML repair and text rescue. **No
dependencies** — pure HTML + JavaScript using the browser's built-in
`DecompressionStream` / `CompressionStream`. Files never leave the device.

## Repo map

- `web/` — the whole app (HTML / JS / manifest / service worker). This
  is the canonical and only implementation.
- `scripts/` — release packaging helpers.
- `.github/workflows/` — `pages.yml` (deploy `web/` to Pages on push to
  `main`), `release.yml` (build per-platform bundles on `v*` tag).

## Branch policy

Work on the assigned feature branch:

1. Commit and push the feature branch.
2. **Open a PR from the feature branch to `main`** using the GitHub MCP
   tools (`mcp__github__create_pull_request`). Do not merge directly —
   the maintainer reviews and merges.
3. The Pages deploy and Release pipelines fire from `main` only — nothing
   ships until the PR lands.

## Releasing

- Push a `v*` tag to `main` (or use Actions → Release → workflow_dispatch)
  to produce per-platform bundles (Windows / macOS / Linux / ChromeOS /
  Android / iOS / Web). All bundles wrap the same `web/` source.

## Verifying changes

There is no test suite. After touching `web/`:

1. Serve locally (`python3 -m http.server` from inside `web/`).
2. Drop a known-broken `.pptx` onto the page.
3. Confirm both outputs are produced: the rebuilt `.pptx` and the
   plain-text dump of every `<a:t>` slide run.
4. Hard-reload (or clear cache) when iterating — the service worker
   aggressively serves the cached app shell.

## Gotchas

- **No dependencies** is a feature, not an accident. Don't pull in JSZip
  or any other ZIP / XML library — the whole point is that we use the
  browser's native streams.
- The three-stage pipeline is order-sensitive: standard read must run
  first (cheapest), header scan second (rebuilds central directory), XML
  repair last (most lossy). Don't reorder.
- `DecompressionStream` is unavailable on older Safari. The PWA
  gracefully degrades the standard-read stage; keep that fallback.
- Bump the service worker cache version whenever you change anything in
  `web/`, or users get the old shell.
