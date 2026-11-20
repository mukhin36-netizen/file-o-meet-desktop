# Native Mac system-audio component

FILE-O Meet's signed, website-distributed macOS app can capture the complete
system-audio mix without choosing a screen or window by launching a bundled
Core Audio Process Tap recorder. It never captures images.

Third-party native recorder: AudioTee, by Nick Payne.
Source: https://github.com/makeusabrew/audiotee
Pinned source commit: 56ac954369a09318e46b88a6eec33c2d2b0d32a3
Licensing: MIT, as documented in the project's README.

Copyright (c) 2025 Nick Payne.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

The recorder receives Apple's first-use system audio permission. It does not
need microphone or Speech Recognition access and must not silently start.

The binary must be built and signed on macOS with the same Developer ID
distribution workflow as the containing FILE-O Meet app. The existing signed
0.6.3 app must not be replaced until both Apple Silicon and Intel outputs have
passed codesign verification, notarization and a real Mac recording test.

The Mac App Store sandbox does not support this direct process-tap method.
Its separate sandboxed app remains on the explicit Apple system-picker path.
