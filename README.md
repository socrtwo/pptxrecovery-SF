<!--MODERNIZED:v2-->
# PPTX Recovery

> Repair corrupt PowerPoint `.pptx` files — entirely in your browser, on every platform.

[![Live app](https://img.shields.io/badge/live-app-ff2e93?style=for-the-badge)](https://socrtwo.github.io/pptxrecovery-SF/)
[![Releases](https://img.shields.io/github/v/release/socrtwo/pptxrecovery-SF?style=for-the-badge&color=7c3aed)](https://github.com/socrtwo/pptxrecovery-SF/releases)
[![License](https://img.shields.io/github/license/socrtwo/pptxrecovery-SF?style=for-the-badge&color=22d3ee)](https://github.com/socrtwo/pptxrecovery-SF/blob/main/LICENSE)
[![Last commit](https://img.shields.io/github/last-commit/socrtwo/pptxrecovery-SF?style=for-the-badge&color=34d399)](https://github.com/socrtwo/pptxrecovery-SF/commits)

🌐 **Live app:** https://socrtwo.github.io/pptxrecovery-SF/
📦 **Downloads:** [Releases](https://github.com/socrtwo/pptxrecovery-SF/releases)
📂 **Source:** [socrtwo/pptxrecovery-SF](https://github.com/socrtwo/pptxrecovery-SF)

---

PPTX Recovery is a small, dependency-free Progressive Web App that salvages
content from broken `.pptx` files. It opens, scans, and rebuilds the underlying
ZIP/XML structure right in your browser — your file never leaves the device.

## Highlights

- 🔒 **100% local.** No upload, no server, no telemetry. The page works offline once loaded.
- 🩹 **Three-stage repair pipeline:** standard ZIP read → low-level header scan → XML repair & text rescue.
- ⚡ **No dependencies.** Pure HTML + JavaScript. Decompression uses the bundled **Immortal Inflater** (`immortal-inflate.js`) — a fault-tolerant pure-JS DEFLATE decoder, so corrupt/truncated streams yield partial data instead of an error.
- 📲 **Installs as an app** on Windows, macOS, Linux, ChromeOS, Android, and iOS.
- 📝 **Two outputs:** a rebuilt `.pptx` plus a plain-text dump of every `<a:t>` slide run.

## Quick start

The fastest way is the hosted version:

> **https://socrtwo.github.io/pptxrecovery-SF/**

Drop a corrupt `.pptx` onto the page, then download the recovered file.

## Downloads

Pre-built bundles for every standard platform are attached to each
[GitHub Release](https://github.com/socrtwo/pptxrecovery-SF/releases). All
bundles ship the **same in-browser app** — the only difference is how the
platform launches it.

| Platform   | File                                       | How to run                                                                  |
| ---------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| Windows    | `pptxrecovery-<ver>-windows.zip`           | Unzip → double-click `PptxRecovery.bat`                                     |
| macOS      | `pptxrecovery-<ver>-macos.zip`             | Unzip → double-click `PptxRecovery.command`                                 |
| Linux      | `pptxrecovery-<ver>-linux.tar.gz`          | Extract → `./pptxrecovery.sh`                                               |
| ChromeOS   | `pptxrecovery-<ver>-chromeos.zip`          | Open `web/index.html` in Chrome → install via address-bar icon              |
| Android    | `pptxrecovery-<ver>-android.zip`           | Visit live URL in Chrome → "Add to Home screen" (or serve `web/` locally)   |
| iOS        | `pptxrecovery-<ver>-ios.zip`               | Visit live URL in Safari → Share → "Add to Home Screen"                     |
| Web        | `pptxrecovery-<ver>-web.zip`               | Drop `web/` onto any static host                                            |

Each bundle is verified by the `SHA256SUMS` file attached to the same release.

## How it works

PPTX files are ZIP archives of XML. When a file is corrupt the app tries three
strategies in order, stopping as soon as it has a usable result:

1. **Standard ZIP read** — find the End-Of-Central-Directory record, walk every
   entry, and validate it.
2. **Low-level scan** — when the central directory is missing or wrong, scan
   the byte stream for `PK\x03\x04` local-file headers and reconstruct entries
   one-by-one. Truncated `deflate` streams are retried with shrinking tails so
   nearly-complete data is recovered when possible.
3. **XML repair & text rescue** — every `.xml` / `.rels` entry is run through
   `DOMParser`; broken markup is best-effort patched (control chars stripped,
   stray tags closed). Slide text is also extracted via a forgiving regex over
   `<a:t>...</a:t>` runs and offered as a `.txt` fallback.

Recovered entries are repackaged into a fresh, well-formed `.pptx` archive
written natively with the browser's `CompressionStream`.

## Browser support

Runs in any modern browser. Decompression is handled by the bundled **Immortal
Inflater** (pure JavaScript), so it does **not** require `DecompressionStream`.
The repaired-file download uses `CompressionStream` when available and silently
falls back to storing entries uncompressed when it isn't, so the app still works
on older browsers.

## Building from source

```bash
git clone https://github.com/socrtwo/pptxrecovery-SF.git
cd pptxrecovery-SF
# (optional) regenerate PWA icons
python3 scripts/gen-icons.py
# build all platform bundles into dist/
bash scripts/build-releases.sh v0.0.0-dev
```

### Cutting a release

Two ways, both publish a GitHub Release with all 7 platform bundles attached:

1. **From the GitHub UI:**
   *Actions* → *Build & publish multi-platform releases* → *Run workflow* →
   enter a version like `v1.0.0` and click *Run workflow*. The workflow
   creates the tag on the chosen branch and uploads the artifacts.

2. **From your terminal:**

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

   The same workflow ([`.github/workflows/release.yml`](.github/workflows/release.yml))
   reacts to the tag push, builds the bundles, and attaches them to a new
   GitHub Release.

The hosted PWA is deployed by
[`.github/workflows/pages.yml`](.github/workflows/pages.yml) on every push to
`main`.

## Repository layout

```
.
├── web/                           # the PWA (this is the whole app)
│   ├── index.html
│   ├── recovery.js
│   ├── manifest.webmanifest
│   ├── sw.js
│   └── icon.svg / icon-*.png
├── scripts/
│   ├── build-releases.sh          # builds dist/*.zip|.tar.gz
│   ├── gen-icons.py               # regenerates PNG icons
│   └── launchers/<platform>/      # per-platform launchers + READMEs
└── .github/workflows/
    ├── pages.yml                  # deploy PWA to GitHub Pages
    └── release.yml                # build & publish multi-platform releases
```

## Origin

This project was originally hosted on **SourceForge** as a Windows-only
VB.NET application. It has been migrated to GitHub and rebuilt as a
cross-platform PWA so that everyone — including macOS, Linux, ChromeOS,
Android and iOS users — can recover broken `.pptx` files without installing
anything.

- **SourceForge:** [pptxrecovery](https://sourceforge.net/projects/pptxrecovery/)
- **Migrated with:** [SF2GH Migrator](https://github.com/socrtwo/sf-to-github)

## Contributing

Issues and pull requests are welcome at
<https://github.com/socrtwo/pptxrecovery-SF/issues>.

## License

MIT — see [LICENSE](LICENSE) for details. If no `LICENSE` file is present, the
project is shared as-is for reference and personal use; please contact the
maintainer for other use cases.

---

*Maintained by [@socrtwo](https://github.com/socrtwo)*
