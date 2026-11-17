# Code signing policy

**Project:** FILE-O Meet desktop client  
**Repository:** https://github.com/mukhin36-netizen/file-o-meet-desktop  
**Official download page:** https://file-o.com/meeting

**Current status:** Not yet signed by SignPath Foundation. We intend to apply.
Do not assume builds are trusted or signed until that status changes.

**Free code signing provided by SignPath.io, certificate by SignPath Foundation**
— this attribution describes the intended OSS signing provider, and does not
claim that our application has been approved.

## Source and build integrity

- Release artifacts must originate from this public GitHub repository.
- The Windows x64 portable build runs on GitHub-hosted Windows runners from
  pinned package-lock dependencies using `npm ci`.
- Tests must succeed before creating release artifacts.
- Published hashes (SHA-256) are for integrity verification; **hashes alone
  do not authenticate an unsigned publisher**.
- Once approved, SignPath signing requests will be tied to GitHub-origin
  artifacts and protected release tags/policies, with manual release approval.
- We will never sign arbitrary user-provided binaries or upstream executables
  with our project's signing policy.

## Roles and reviews

- **Committers and reviewers:** Repository maintainer/owner,
  [mukhin36-netizen](https://github.com/mukhin36-netizen).
- **Release/signing approver:** Repository owner, after review of a tagged
  build, dependencies, release notes and output hashes.
- External pull requests require maintainer review. The person approving the
  signing request must verify the version and origin before approval.
- Maintainers must use multi-factor authentication on GitHub and SignPath.

## Privacy and outbound requests

This desktop client sends user-requested audio and meeting metadata to the
FILE-O service at https://file-o.com after the user explicitly initiates
recording. The client itself does not silently record calls. For data
retention and service processors consult https://file-o.com/privacy.

## Reporting problems

See [SECURITY.md](SECURITY.md). Contact:
https://file-o.com/contact

## Status and signature verification

Until a future signed release is explicitly announced, release files are
unsigned. After signing, verify the Authenticode signer and cryptographic
signature on Windows:

```powershell
Get-AuthenticodeSignature .\FILE-O-Meeting.exe | Format-List Status,SignerCertificate
```

The desired signer after external approval is **SignPath Foundation**;
Windows will not display the FILE-O business name as certificate subject.
