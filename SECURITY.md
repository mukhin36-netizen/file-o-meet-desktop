# Security policy — FILE-O Meet

## Security reports

Do not publish credentials, private audio, proof-of-concept exploits, or
account identifiers in public GitHub issues. Use the FILE-O contact form:
https://file-o.com/contact

Please provide the affected version, operating system, minimal reproduction
steps, and impact without exposing user data.

## Data handling

- Meeting audio capture is user-initiated, not automatic at launch.
- During pending uploads, audio chunks are encrypted before local storage
  using the platform's secure storage where available.
- The desktop client transmits encrypted-in-transit audio fragments and
  requests only to the FILE-O service configured in source code.
- The online recognition and meeting service are external to this repository.
- Read the full https://file-o.com/privacy for data handling and providers.

## Signed releases

An unsigned ZIP or EXE is not a cryptographically authenticated publisher.
Do not describe FILE-O Meet as SignPath-signed unless SignPath Foundation has
approved the project and a real signed artifact has been verified.
