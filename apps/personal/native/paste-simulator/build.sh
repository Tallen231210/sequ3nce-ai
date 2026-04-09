#!/bin/bash
# Build the Sequ3nce Stream paste simulator dylib for macOS.
set -euo pipefail
cd "$(dirname "$0")"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "[paste-simulator] Skipping build — not macOS"
  exit 0
fi

echo "[paste-simulator] Building paste-simulator.dylib (arm64 + x86_64 universal)..."
clang -dynamiclib \
  -arch arm64 -arch x86_64 \
  -mmacosx-version-min=11.0 \
  -framework ApplicationServices \
  -O2 \
  -o paste-simulator.dylib \
  paste-simulator-macos.c

echo "[paste-simulator] Built: $(pwd)/paste-simulator.dylib"
