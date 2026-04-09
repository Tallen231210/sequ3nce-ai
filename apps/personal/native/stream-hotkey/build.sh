#!/bin/bash
# Build the Sequ3nce Stream hotkey hook dylib for macOS.
# Runs automatically via apps/personal/scripts/build-native.sh during npm install
# on macOS. Skipped on other platforms.
set -euo pipefail
cd "$(dirname "$0")"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "[stream-hotkey] Skipping build — not macOS"
  exit 0
fi

echo "[stream-hotkey] Building stream-hotkey.dylib (arm64 + x86_64 universal)..."
clang -dynamiclib \
  -arch arm64 -arch x86_64 \
  -mmacosx-version-min=11.0 \
  -framework ApplicationServices \
  -framework Carbon \
  -framework Foundation \
  -O2 \
  -o stream-hotkey.dylib \
  stream-hotkey-macos.c

echo "[stream-hotkey] Built: $(pwd)/stream-hotkey.dylib"
