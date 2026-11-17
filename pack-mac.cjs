'use strict';
const { packager } = require('@electron/packager');
const path = require('node:path');

const arch = process.argv[2] || 'arm64';
if (!['arm64', 'x64'].includes(arch)) throw Error('Unexpected Mac architecture');

const release = process.env.FILEO_MAC_DISTRIBUTE === '1';
const config = {
  dir: __dirname,
  name: 'FILE-O-Meeting',
  platform: 'darwin',
  arch,
  overwrite: true,
  out: path.join(__dirname, 'dist'),
  icon: path.join(__dirname, 'assets', 'fileo.icns'),
  asar: true,
  prune: true,
  appBundleId: 'com.fileo.meeting',
  appCategoryType: 'public.app-category.productivity',
  extendInfo: {
    CFBundleDisplayName: 'FILE-O Meeting',
    NSMicrophoneUsageDescription:
      'FILE-O Meeting использует микрофон только после вашего нажатия «Начать запись», чтобы расшифровать собственную речь.',
    NSAudioCaptureUsageDescription:
      'FILE-O Meeting записывает системный звук видеовстреч только с вашего разрешения для транскрибации и создания протокола.',
    NSScreenCaptureDescription:
      'FILE-O Meeting запрашивает экран для захвата системного звука. Изображение не сохраняется.',
    LSMinimumSystemVersion: '14.2'
  },
  ignore: [
    /^\/dist($|\/)/,
    /^\/tests($|\/)/,
    /^\/pack-mac\.cjs$/,
    /^\/\.git($|\/)/
  ]
};

if (release) {
  if (process.platform !== 'darwin') {
    throw Error('Developer ID release must be built and signed on macOS');
  }
  const required = [
    'FILEO_APPLE_SIGN_IDENTITY', 'FILEO_APPLE_TEAM_ID',
    'FILEO_APPLE_ID', 'FILEO_APPLE_APP_PASSWORD'
  ];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) {
    throw Error('Apple signing and notarization credentials not configured: ' + missing.join(', '));
  }
  config.osxSign = {
    identity: process.env.FILEO_APPLE_SIGN_IDENTITY,
    keychain: process.env.FILEO_MAC_KEYCHAIN,
    continueOnError: false
  };
  config.osxNotarize = {
    appleId: process.env.FILEO_APPLE_ID,
    appleIdPassword: process.env.FILEO_APPLE_APP_PASSWORD,
    teamId: process.env.FILEO_APPLE_TEAM_ID
  };
}

packager(config).then(paths => {
  console.log('MAC_APP_READY', arch,
    release ? 'signed-notarized-release' : 'unsigned-qa-only', paths.join('; '));
}).catch(error => {
  console.error('MAC_APP_FAILED', error.message);
  process.exit(1);
});
