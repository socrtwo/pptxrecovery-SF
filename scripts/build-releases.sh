#!/usr/bin/env bash
# Build platform-specific release bundles from the contents of web/.
#
# Usage:  scripts/build-releases.sh [VERSION]
#         scripts/build-releases.sh v1.0.0
#
# Output goes to dist/ and is overwritten each run.

set -euo pipefail

VERSION="${1:-${GITHUB_REF_NAME:-v0.0.0-dev}}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/web"
LAUNCHERS="$ROOT/scripts/launchers"
DIST="$ROOT/dist"
STAGE="$DIST/_stage"

if [[ ! -d "$WEB" ]]; then
  echo "ERROR: web/ folder not found at $WEB" >&2
  exit 1
fi

# Ensure PWA icons exist (regenerate if missing).
if [[ ! -f "$WEB/icon-192.png" || ! -f "$WEB/icon-512.png" || ! -f "$WEB/icon-maskable.png" ]]; then
  python3 "$ROOT/scripts/gen-icons.py"
fi

rm -rf "$DIST"
mkdir -p "$DIST" "$STAGE"

stage() {
  local name="$1"
  local platform="$2"
  local target="$STAGE/$name"
  rm -rf "$target"
  mkdir -p "$target/web"
  cp -r "$WEB/." "$target/web/"
  if [[ -d "$LAUNCHERS/$platform" ]]; then
    cp -r "$LAUNCHERS/$platform/." "$target/"
  fi
  # Stamp version
  printf '%s\n' "$VERSION" > "$target/VERSION"
  echo "$target"
}

write_zip() {
  local src="$1" out="$2"
  ( cd "$src" && zip -qr "$out" . )
  echo "  -> $(basename "$out")"
}

write_tar() {
  local src="$1" out="$2"
  ( cd "$src" && tar -czf "$out" . )
  echo "  -> $(basename "$out")"
}

echo "Building releases for $VERSION"
echo "Source: $WEB"
echo

# Windows
echo "[windows]"
WIN_DIR="$(stage pptxrecovery-windows windows)"
write_zip "$WIN_DIR" "$DIST/pptxrecovery-${VERSION}-windows.zip"

# macOS
echo "[macos]"
MAC_DIR="$(stage pptxrecovery-macos macos)"
chmod +x "$MAC_DIR/PptxRecovery.command" 2>/dev/null || true
write_zip "$MAC_DIR" "$DIST/pptxrecovery-${VERSION}-macos.zip"

# Linux
echo "[linux]"
LIN_DIR="$(stage pptxrecovery-linux linux)"
chmod +x "$LIN_DIR/pptxrecovery.sh" 2>/dev/null || true
write_tar "$LIN_DIR" "$DIST/pptxrecovery-${VERSION}-linux.tar.gz"

# ChromeOS
echo "[chromeos]"
CROS_DIR="$(stage pptxrecovery-chromeos chromeos)"
write_zip "$CROS_DIR" "$DIST/pptxrecovery-${VERSION}-chromeos.zip"

# Android
echo "[android]"
ANDROID_DIR="$(stage pptxrecovery-android android)"
write_zip "$ANDROID_DIR" "$DIST/pptxrecovery-${VERSION}-android.zip"

# iOS
echo "[ios]"
IOS_DIR="$(stage pptxrecovery-ios ios)"
write_zip "$IOS_DIR" "$DIST/pptxrecovery-${VERSION}-ios.zip"

# Web (just the static site, no launcher)
echo "[web]"
WEB_DIR_STAGE="$(stage pptxrecovery-web web)"
write_zip "$WEB_DIR_STAGE" "$DIST/pptxrecovery-${VERSION}-web.zip"

# Generate SHA-256 sums
echo
echo "Generating SHA256SUMS"
( cd "$DIST" && sha256sum *.zip *.tar.gz 2>/dev/null > SHA256SUMS )
cat "$DIST/SHA256SUMS"

# Cleanup staging
rm -rf "$STAGE"

echo
echo "Done. Artifacts in $DIST"
ls -la "$DIST"
