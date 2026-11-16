'use strict';
const { packager } = require('@electron/packager');
const path = require('node:path');

const arch = process.argv[2] || 'arm64';
if (!['arm64','x64'].includes(arch)) throw Error('Unexpected Mac architecture');

packager({
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
}).then(paths => {
  console.log('MAC_APP_READY', arch, paths.join('; '));
}).catch(error => {
  console.error('MAC_APP_FAILED', error.message);
  process.exit(1);
});
