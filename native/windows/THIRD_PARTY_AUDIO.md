# FILE-O Meet — Windows system audio (WASAPI)

The Windows version captures the sound played through the system's default
playback endpoint using WASAPI Loopback. It does not request access to a screen,
window, camera, microphone or Apple's Speech Recognition feature for
system-audio-only recording.

Bundled dependency: NAudio 2.2.1 by Mark Heath and contributors.
Source: https://github.com/naudio/NAudio
Copyright (c) Mark Heath.
License: MIT.

MIT License

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

The native helper receives only a command to record the system output and
streams 16-bit PCM, 16 kHz mono audio over stdout. It receives no account
tokens, source documents, URLs or private files. The main desktop app handles
media encoding, encryption and upload. No WAV files are written locally.

The helper can capture only the currently selected Windows playback output
device. Audio routed to an independent device or a separate virtual output
may not be present in the mix. Microphone requires a separate explicit choice.

The Windows MSIX built by GitHub Actions is unsigned until a Windows
certificate is configured. The portable ZIP does not require that MSIX
certificate, but antivirus/SmartScreen may show a publisher warning until
the executable is code-signed.
