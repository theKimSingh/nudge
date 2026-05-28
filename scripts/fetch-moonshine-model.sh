#!/usr/bin/env bash
# Downloads the Moonshine Base EN int8 model archive (sherpa-onnx layout) into
# src/assets/models/. The ~239MB .tar.bz2 is gitignored (like the Whisper .pte)
# so it must be fetched after a fresh clone before building. Idempotent — skips
# if the archive is already present.
#
# Unlike Whisper we keep the COMPRESSED archive: it's bundled into the app via a
# Metro require() in moonshine-asr.ts and extracted to DocumentDirectory on first
# launch by sherpa-onnx's native extractTarBz2 (no network at runtime).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/src/assets/models"
URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-moonshine-base-en-int8.tar.bz2"
OUT="$DIR/moonshine-base-en-int8.tar.bz2"

mkdir -p "$DIR"

if [ ! -f "$OUT" ]; then
  echo "Downloading Moonshine Base EN int8 (~239MB)…"
  curl -fL "$URL" -o "$OUT"
else
  echo "Moonshine archive already present, skipping."
fi

echo "Done. Archive at $OUT"
