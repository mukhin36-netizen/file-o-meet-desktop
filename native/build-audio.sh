#!/bin/bash
set -euo pipefail
# FILE-O Meet: pinned MIT-licensed AudioTee source, built only on macOS.
# Do not execute mutable upstream scripts or build from a floating branch.
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "AudioTee must be built on macOS." >&2
  exit 2
fi
readonly BASE="$(cd "$(dirname "$0")/.." && pwd)"
readonly SHA="56ac954369a09318e46b88a6eec33c2d2b0d32a3"
readonly TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
git clone --quiet --no-checkout https://github.com/makeusabrew/audiotee.git "$TEMP/audiotee"
git -C "$TEMP/audiotee" checkout --quiet --detach "$SHA"
test "$(git -C "$TEMP/audiotee" rev-parse HEAD)" = "$SHA"
cd "$TEMP/audiotee"
for arch in arm64 x86_64; do
  target="$arch-apple-macosx14.2"
  swift build -c release --triple "$target" --product audiotee
  bin="$(swift build -c release --triple "$target" --show-bin-path)/audiotee"
  test -x "$bin"
  cp "$bin" "$TEMP/audiotee-$arch"
done
mkdir -p "$BASE/native/bin"
lipo -create "$TEMP/audiotee-arm64" "$TEMP/audiotee-x86_64" \
  -output "$BASE/native/bin/fileo-system-audio"
chmod 755 "$BASE/native/bin/fileo-system-audio"
lipo -verify_arch arm64 x86_64 "$BASE/native/bin/fileo-system-audio"
file "$BASE/native/bin/fileo-system-audio"
echo "NATIVE_SYSTEM_AUDIO_READY_UNIVERSAL $SHA"
