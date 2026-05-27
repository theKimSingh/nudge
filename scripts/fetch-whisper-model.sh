#!/usr/bin/env bash
# Downloads the bundled Whisper Tiny EN Quantized model + tokenizer into
# src/assets/models/. These are gitignored (the .pte is ~168MB) so they must
# be fetched after a fresh clone before building. Idempotent — skips files
# that already exist.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/src/assets/models"
BASE="https://huggingface.co/software-mansion/react-native-executorch-whisper-tiny-quantized.en/resolve/v0.8.0"

mkdir -p "$DIR"

if [ ! -f "$DIR/whisper-tiny-en-q.pte" ]; then
  echo "Downloading model (~168MB)…"
  curl -fL "$BASE/xnnpack/whisper_tiny_en_quantized_xnnpack.pte" -o "$DIR/whisper-tiny-en-q.pte"
else
  echo "Model already present, skipping."
fi

if [ ! -f "$DIR/whisper-tiny-en-q-tokenizer.bin" ]; then
  echo "Downloading tokenizer (~2MB)…"
  curl -fL "$BASE/tokenizer.json" -o "$DIR/whisper-tiny-en-q-tokenizer.bin"
else
  echo "Tokenizer already present, skipping."
fi

echo "Done. Model files in $DIR"
