# FILE-O Meet — Mac App Store preparation

This is **not** the separately notarized Developer ID application distributed at
https://file-o.com/meeting. Existing downloads and the Microsoft Store workflow
are unaffected.

## Apple record
- App Store Connect application: **FILE-O Meet**, platform **macOS**, version **1.0**
- Bundle ID: `com.fileo.meeting`
- Team ID: `RWWC682LU6`
- Client source: MIT, published here. FILE-O processing/billing services remain separate.

## What this repository has prepared
- `pack-mas.cjs`: Electron `mas` platform, universal architecture (Apple Silicon + Intel).
- `build/entitlements.mas.plist`: App Sandbox, client networking, microphone and V8 JIT.
- `build/entitlements.mas.inherit.plist`: inherited sandbox for helper processes.
- `process.mas` policy: remove the external Pricing button from MAS builds and
  reject direct app requests for the `/pricing` page.
- `.github/workflows/macos-app-store.yml`: unsigned QA by default; signed
  App Store `.pkg` only when **separate Apple Distribution and Installer
  Distribution certificates**, provisioning profile and explicit manual
  approval exist.

## What is not yet verified
- Physical Mac App Store sandbox behavior of the system audio capture path
  (Electron CoreAudio Tap and OS-level System Audio Recording permission).
- Apple App Review approval of the existing sign-in and external service model.
  Existing FILE-O customers can sign in, and paid meeting processing is supplied
  by an external service. Apple may require changes under App Review guideline 3.1.
- App Store Connect privacy answers, screenshots, tax/business agreement state,
  review test account and final upload acceptance.
- Mac App Store certificates and provisioning profile **have not yet been added**.
- A successful unsigned QA artifact **cannot** be submitted or installed as an
  App Store distribution build.

## Certificates (distinct from Developer ID)
Create through https://developer.apple.com/account/resources/certificates/list:
1. **Apple Distribution** for signing the MAS `.app`.
2. **Mac Installer Distribution** for signing the submission `.pkg`.
3. A **Mac App Store distribution provisioning profile** tied to App ID
   `com.fileo.meeting` and Apple Distribution certificate.

The private keys must remain private. Generate CSR/key locally, import downloaded
`.cer` into the same OS identity, export encrypted P12. Never commit or post
P12, private key, base64 or passwords. The existing **Developer ID Application**
P12 cannot substitute for either distribution certificate.

### GitHub Repository Secrets for signed submission
When ready, add:
- `FILEO_MAS_DIST_P12_BASE64` — base64 of Apple Distribution P12
- `FILEO_MAS_DIST_P12_PASSWORD` — password for the P12
- `FILEO_MAS_INSTALLER_P12_BASE64` — base64 of Mac Installer Distribution P12
- `FILEO_MAS_INSTALLER_P12_PASSWORD` — password for that P12
- `FILEO_MAS_APP_IDENTITY` — exact codesign identity from the Apple Distribution cert
- `FILEO_MAS_INSTALLER_IDENTITY` — exact Mac Installer Distribution identity
- `FILEO_MAS_PROFILE_BASE64` — base64 of App Store provisioning profile

GitHub Actions → **FILE-O Meet Mac App Store** → **Run workflow** →
`signed_release: true`. The signed mode is deliberately blocked until all
required secrets are present. Only manually triggered workflows may sign.
The submission `.pkg` is created by `productbuild` and verified; a separate
manual App Store Connect/Transporter upload is still required.

## Test protocol before submission
1. Complete the signed build, check `codesign --verify --deep --strict`.
2. Verify App Sandbox and microphone entitlements with `codesign -d --entitlements`.
3. Have a real Mac user test microphone, CoreAudio Tap, pause/stop, reconnection,
   encrypted queue, permission denial, login code and history in a **MAS
   development build**, on macOS 14.2+.
4. Provide Apple App Review with a fully functional demo account, accurate
   notes about paid backend features and a recording-consent flow.
5. Review App Store rules for external payments. The pricing shortcut is removed
   in MAS but account/billing flows must still be reviewed.
6. Upload the signed installer with Transporter or Apple's supported API and
   select the processed build in App Store Connect; **do not** send to review
   until real sandbox tests and compliance checks pass.
