# Windows release procedure

The portable Windows desktop distribution is a ZIP containing
`FILE-O-Meeting.exe` and the other files in the Electron app directory.
**Do not distribute the EXE by itself**; it depends on adjacent runtime files.

## Build

1. Ensure the tag points to reviewed open-source client code.
2. Trigger **Actions → FILE-O Meet Windows portable (unsigned)**.
3. Download the `FILE-O-Meet-Windows-x64-unsigned` artifact.
4. Verify SHA-256 using `SHA256SUMS` and inspect the archive.
5. Test capture and sign-in on a real Windows 10/11 system.
6. Publish release notes and provenance (commit SHA, version, link to build).
7. Mark binaries as unsigned until SignPath Foundation actually approves and
   signs the exact release artifact.

## Signing plan

We intend to request free OSS signing via
[SignPath Foundation](https://signpath.org/). This requires approval, a public
OSI-licensed repo, a public release, and verifiable build origin.

Only after acceptance:
- install the official SignPath GitHub App on this repository;
- configure its GitHub trusted build system, artifact configuration, policy
  and signing permissions;
- require manual approval for release signatures;
- verify signatures on the final distributed binaries.

The existing `.msix` workflow uses Microsoft Store publisher identity.
It is separate from planned direct-download Authenticode code signing.
