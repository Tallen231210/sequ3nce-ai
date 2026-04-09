#!/bin/bash
# Compile all Sequ3nce Stream native dylibs for macOS.
# Wired into the package.json "build:native" script and called from
# electron-forge's generateAssets hook so the dylibs exist before packaging.
# No-op on non-Darwin platforms.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname)" != "Darwin" ]]; then
  echo "[build-native] Skipping — not macOS"
  exit 0
fi

if ! command -v clang >/dev/null 2>&1; then
  echo "[build-native] clang not found — install Xcode Command Line Tools"
  exit 1
fi

echo "[build-native] Building Sequ3nce Stream native dylibs..."
bash native/stream-hotkey/build.sh
bash native/paste-simulator/build.sh
echo "[build-native] Done"
