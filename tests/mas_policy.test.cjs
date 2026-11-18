'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
test('Mac App Store uses the dedicated MAS Electron platform and Bundle ID', () => {
  const source = read('pack-mas.cjs');
  assert.match(source, /platform: 'mas'/);
  assert.match(source, /arch = 'universal'/);
  assert.match(source, /appBundleId: 'com\.fileo\.meeting'/);
  assert.match(source, /appVersion: '1\.0'/);
  assert.match(source, /UNSIGNED_QA_ONLY/);
  assert.match(source, /provisioningProfile: process\.env\.FILEO_MAS_PROFILE/);
});
test('Mac App Store entitlements declare sandbox, outbound network and microphone', () => {
  const main = read('build/entitlements.mas.plist');
  const child = read('build/entitlements.mas.inherit.plist');
  for (const key of ['com.apple.security.app-sandbox','com.apple.security.network.client',
    'com.apple.security.device.microphone','com.apple.security.cs.allow-jit']) {
    assert.ok(main.includes('<key>' + key + '</key>'), key);
  }
  assert.ok(child.includes('<key>com.apple.security.inherit</key>'));
});
test('Mac App Store client hides pricing link and native bridge blocks it', () => {
  assert.match(read('preload.cjs'), /isMacAppStore: process\.mas === true/);
  assert.match(read('renderer.js'), /if \(BRIDGE\.isMacAppStore\) \$\('openPricing'\)\.remove\(\)/);
  assert.match(read('main.cjs'), /process\.mas === true && parsed\.pathname\.startsWith\('\/pricing'\)/);
});
