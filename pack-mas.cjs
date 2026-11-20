'use strict';

// Mac App Store ONLY. The regular macOS Developer ID release uses pack-mac.cjs.
// QA builds are unsigned and are never suitable for submission to App Store.
const path = require('node:path');
const { packager } = require('@electron/packager');

const signed = process.env.FILEO_MAS_SIGNED === '1';
const arch = 'universal';
const appName = 'FILE-O-Meeting';

const config = {
  dir: __dirname,
  name: appName,
  platform: 'mas',
  arch,
  overwrite: true,
  out: path.join(__dirname, 'dist'),
  icon: path.join(__dirname, 'assets', 'fileo.icns'),
  asar: true,
  prune: true,
  appBundleId: 'com.fileo.meeting',
  appVersion: '1.0',
  buildVersion: '2',
  osxUniversal: { mergeASARs: true },
  appCategoryType: 'public.app-category.productivity',
  extendInfo: {
    CFBundleDisplayName: 'FILE-O Meet',
    NSMicrophoneUsageDescription: 'FILE-O Meet использует микрофон только после вашего разрешения на запись встречи.',
    NSAudioCaptureUsageDescription: 'FILE-O Meet записывает системный звук только после запуска записи пользователем.',
    NSScreenCaptureDescription: 'Системный диалог используется для выбора источника звука; изображение экрана не сохраняется.',
    LSMinimumSystemVersion: '14.2'
  },
  ignore: [
    /^\/dist($|\/)/,
    /^\/tests($|\/)/,
    /^\/build($|\/)/,
    /^\/pack-mas\.cjs$/,
    /^\/pack-mac\.cjs$/,
    /^\/\.git($|\/)/
  ]
};

if (signed) {
  if (process.platform !== 'darwin') throw Error('MAS signing requires macOS');
  const required = ['FILEO_MAS_APP_IDENTITY', 'FILEO_MAS_PROFILE',
    'FILEO_MAS_KEYCHAIN'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) throw Error('Missing MAS signing config: ' + missing.join(', '));

  config.osxSign = {
    identity: process.env.FILEO_MAS_APP_IDENTITY,
    platform: 'mas',
    type: 'distribution',
    keychain: process.env.FILEO_MAS_KEYCHAIN,
    provisioningProfile: process.env.FILEO_MAS_PROFILE,
    optionsForFile(filePath) {
      const mainApp = filePath.endsWith('/' + appName + '.app');
      return {
        entitlements: path.join(__dirname, 'build',
          mainApp ? 'entitlements.mas.plist' : 'entitlements.mas.inherit.plist'),
        hardenedRuntime: false
      };
    }
  };
}

packager(config).then(paths => {
  if (paths.length !== 1) throw Error('Expected a single universal MAS app');
  console.log('MAS_APP_READY', signed ? 'signed' : 'UNSIGNED_QA_ONLY', paths[0]);
}).catch(err => {
  console.error('MAS_APP_FAILED:', err.message);
  process.exitCode = 1;
});
