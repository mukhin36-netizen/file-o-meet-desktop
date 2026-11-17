# FILE-O Meet — Open Source desktop client

FILE-O Meet is a desktop app for recording **meeting audio**, viewing speech
transcriptions, and preparing meeting minutes, action items and highlights.
Built with Electron for Windows and macOS.

**Source code:** https://github.com/mukhin36-netizen/file-o-meet-desktop  
**Product and downloads:** https://file-o.com/meeting  
**Privacy policy:** https://file-o.com/privacy  
**Support:** https://file-o.com/contact

## What is open source?

This repository contains the **desktop client only**, including its UI, recording
coordination, encrypted local upload queue, and GitHub Actions build scripts.
The FILE-O website, account system, billing, server-side recognition and meeting
processing are **separate services** and are not included in this repository.

The desktop app is free to download. Use of the online meeting processing
service may require an eligible FILE-O plan.

## Features

- System audio capture and optional microphone recording, only after user action
- User confirmation that participants have been notified and permissions obtained
- Private transcription, timestamps, highlights, decisions, and tasks
- Export options via the FILE-O account (including TXT, DOCX, SRT, ZIP)
- Encrypted local queue for pending uploads during network interruptions
- Windows tray / macOS menu-bar background operation during recording

Recording behavior depends on OS permissions, sound devices and browser or
meeting application. The app does not host calls and does not save screen video.

## Security and privacy

FILE-O Meet sends meeting audio fragments to **https://file-o.com** when the
user explicitly starts recording. User sign-in uses a one-time pairing code from
the FILE-O website. Meeting documents stay in the user's account. The service
and its subprocessors are described in the [privacy policy](https://file-o.com/privacy).

Never post real meeting recordings, access tokens, customer data or account
credentials in issues or pull requests. For security reports, see [SECURITY.md](SECURITY.md).

## Building from source

Requires Node.js 22+ and npm 10+. From the root directory:

```sh
npm ci
npm test
npm start
```

Windows portable app from source:

```sh
npm run pack:windows
```

On GitHub, **Actions → FILE-O Meet Windows portable (unsigned)** produces
an unsigned Windows x64 ZIP together with SHA-256 checksum data. It builds
on a Windows-hosted runner; Windows is not needed on your Mac to start the job.

For the existing Store MSIX package, see `.github/workflows/windows-msix.yml`.
The Store package's publisher identity must not be reused with a different
signing certificate for direct distribution.

## Windows download and signatures

**Signing status: UNSIGNED.** A successful build is **not** a trusted
Authenticode signature. Windows SmartScreen may warn about unsigned downloads.

We intend to apply to SignPath Foundation for free open-source signing.
**No SignPath approval or certificate has been issued yet.** A verified signature
will be announced only after the provider approves and signs a release.

Read the [Code signing policy](CODE_SIGNING_POLICY.md) and
[release instructions](RELEASE.md) before distributing binaries.

## License

The source code and included assets in this repository are licensed under
[MIT](LICENSE). Third-party dependencies retain their respective licenses;
Electron ships with required third-party notices. FILE-O brand names and
trademarks are not licensed for unrelated branding by this software license.

Copyright © 2026 Alexander Mukhin.
