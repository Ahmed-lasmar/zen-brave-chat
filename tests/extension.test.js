const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('\n🧩 Running Browser Extension Manifest & Toolbar Integration Tests...\n');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`  • ${name}... `);
    const start = Date.now();
    try {
      await fn();
      const ms = Date.now() - start;
      console.log(`\x1b[32mPASSED\x1b[0m (${ms}ms)`);
      passed++;
    } catch (err) {
      console.log(`\x1b[31mFAILED\x1b[0m`);
      console.error(err);
      failed++;
    }
  }

  const rootDir = path.resolve(__dirname, '..');
  const distDir = path.join(rootDir, 'dist');
  const zenDist = path.join(distDir, 'zen');
  const braveDist = path.join(distDir, 'brave');
  const zenManifestPath = path.join(zenDist, 'manifest.json');
  const braveManifestPath = path.join(braveDist, 'manifest.json');

  try {
    // 1. Zen Manifest Exists & Valid JSON
    await test('Zen manifest.json exists and is valid JSON', () => {
      assert.ok(fs.existsSync(zenManifestPath), 'dist/zen/manifest.json must exist');
      const content = fs.readFileSync(zenManifestPath, 'utf8');
      const manifest = JSON.parse(content);
      assert.strictEqual(manifest.manifest_version, 3);
      assert.strictEqual(manifest.version, '1.0.3');
      assert.strictEqual(manifest.name, 'Zen & Brave Link & Chat');
    });

    // 2. Zen Registers Interactive Action Button with Navbar Default Area
    await test('Zen manifest registers interactive action button with default_area: "navbar"', () => {
      const manifest = JSON.parse(fs.readFileSync(zenManifestPath, 'utf8'));
      assert.ok(manifest.action, 'Manifest must have action object');
      assert.strictEqual(manifest.action.default_title, 'Zen & Brave Link & Chat');
      assert.strictEqual(manifest.action.default_area, 'navbar', 'Must direct browser to mount icon on top navigation bar');
      assert.strictEqual(manifest.action.default_popup, 'ui/popup.html');
    });

    // 3. Zen Action Icons & Popup HTML Exist on Disk
    await test('Zen action icons and default_popup point to existing files relative to manifest.json', () => {
      const manifest = JSON.parse(fs.readFileSync(zenManifestPath, 'utf8'));
      
      // Popup verification
      const popupPath = path.join(zenDist, manifest.action.default_popup);
      assert.ok(fs.existsSync(popupPath), `Popup file must exist at ${popupPath}`);
      assert.ok(fs.statSync(popupPath).size > 0, 'Popup HTML must not be empty');

      // Icon verification
      assert.ok(manifest.action.default_icon, 'Action must have default_icon');
      const requiredSizes = ['16', '32', '48', '128'];
      for (const size of requiredSizes) {
        const iconRel = manifest.action.default_icon[size];
        assert.ok(iconRel, `Missing icon for size ${size}`);
        const iconPath = path.join(zenDist, iconRel);
        assert.ok(fs.existsSync(iconPath), `Icon ${size} must exist at ${iconPath}`);
        assert.ok(fs.statSync(iconPath).size > 0, `Icon ${size} must be non-empty`);
      }
    });

    // 4. Zen Preserves Sidebar Action & Gecko ID with update_url
    await test('Zen preserves sidebar_action, gecko ID, and update_url for about:addons', () => {
      const manifest = JSON.parse(fs.readFileSync(zenManifestPath, 'utf8'));
      assert.ok(manifest.sidebar_action, 'Must retain sidebar_action for Zen sidebar');
      assert.strictEqual(manifest.sidebar_action.default_panel, 'ui/popup.html');
      assert.ok(fs.existsSync(path.join(zenDist, manifest.sidebar_action.default_icon)));

      assert.ok(manifest.browser_specific_settings?.gecko, 'Must contain gecko settings');
      assert.strictEqual(manifest.browser_specific_settings.gecko.id, 'zen-brave-chat@antigravity');
      assert.strictEqual(
        manifest.browser_specific_settings.gecko.update_url,
        'https://zenbrave.myapps.tn/updates/zen/updates.json',
        'Gecko settings must point to self-hosted updates.json'
      );
    });

    // 5. Brave Manifest Action, SidePanel, and Omaha update_url
    await test('Brave manifest registers action, Chromium side_panel, and update_url', () => {
      assert.ok(fs.existsSync(braveManifestPath), 'dist/brave/manifest.json must exist');
      const manifest = JSON.parse(fs.readFileSync(braveManifestPath, 'utf8'));
      assert.strictEqual(manifest.manifest_version, 3);
      assert.strictEqual(manifest.version, '1.0.3');
      assert.ok(manifest.action, 'Brave must have action object');
      assert.strictEqual(manifest.action.default_popup, 'ui/popup.html');
      assert.ok(manifest.side_panel, 'Brave must have side_panel object');
      assert.strictEqual(manifest.side_panel.default_path, 'ui/popup.html');
      assert.strictEqual(
        manifest.update_url,
        'https://zenbrave.myapps.tn/updates/brave/updates.xml',
        'Brave manifest must define Omaha update_url'
      );
    });

    // 6. Background Script Contains Action Click Listener
    await test('Background script registers action.onClicked toolbar click listener', () => {
      const bgPath = path.join(rootDir, 'src/background/background.js');
      assert.ok(fs.existsSync(bgPath), 'background.js must exist');
      const code = fs.readFileSync(bgPath, 'utf8');
      assert.ok(code.includes('actionApi.onClicked') || code.includes('action.onClicked'), 'Must have action.onClicked listener');
      assert.ok(code.includes('Toolbar action clicked in tab:'), 'Must log toolbar action click');
    });

    // 7. Distribution Zip Packages Exist
    await test('Extension ZIP archives exist in dist/ for direct distribution', () => {
      const zenZip = path.join(distDir, 'zen-extension.zip');
      const braveZip = path.join(distDir, 'brave-extension.zip');
      assert.ok(fs.existsSync(zenZip), 'zen-extension.zip must exist');
      assert.ok(fs.existsSync(braveZip), 'brave-extension.zip must exist');
      assert.ok(fs.statSync(zenZip).size > 1000, 'zen-extension.zip must be > 1KB');
      assert.ok(fs.statSync(braveZip).size > 1000, 'brave-extension.zip must be > 1KB');
    });

    // 8. Zen XPInstall (.xpi) Archive Verification
    await test('dist/zen.xpi exists and contains manifest.json at archive root', () => {
      const zenXpi = path.join(distDir, 'zen.xpi');
      assert.ok(fs.existsSync(zenXpi), 'dist/zen.xpi must exist');
      assert.ok(fs.statSync(zenXpi).size > 1000, 'zen.xpi must be > 1KB');
      const { execSync } = require('child_process');
      const fileList = execSync(`unzip -l "${zenXpi}"`, { encoding: 'utf8' });
      assert.ok(fileList.includes(' manifest.json'), 'manifest.json must be at the root of zen.xpi');
      assert.ok(fileList.includes(' ui/popup.html'), 'ui/popup.html must be inside zen.xpi');
      assert.ok(fs.existsSync(path.join(distDir, 'zen.xpi.sha256')), 'zen.xpi.sha256 must exist');
    });

    // 9. Brave Signed CRX3 Package Verification
    await test('dist/brave.crx exists and is a valid signed CRX3 package', () => {
      const braveCrx = path.join(distDir, 'brave.crx');
      assert.ok(fs.existsSync(braveCrx), 'dist/brave.crx must exist');
      assert.ok(fs.statSync(braveCrx).size > 1000, 'brave.crx must be > 1KB');

      const buf = fs.readFileSync(braveCrx);
      // Magic number: 'Cr24' (0x43 0x72 0x32 0x34)
      const magic = buf.subarray(0, 4).toString('utf8');
      assert.strictEqual(magic, 'Cr24', 'CRX file must start with Cr24 magic number');

      // Version: 3 (4 bytes LE)
      const version = buf.readUInt32LE(4);
      assert.strictEqual(version, 3, 'CRX file must be version 3 format');

      // Header length
      const headerLen = buf.readUInt32LE(8);
      assert.ok(headerLen > 0, 'CRX3 header length must be greater than 0');
      assert.ok(buf.length > 12 + headerLen, 'CRX3 must contain payload after header');
    });

    // 10. In-Extension Settings Update Center UI & Controller Verification
    await test('popup.html and popup.js contain In-Extension Update Center UI and logic', () => {
      const popupHtmlPath = path.join(rootDir, 'src/ui/popup.html');
      const popupJsPath = path.join(rootDir, 'src/ui/popup.js');
      const html = fs.readFileSync(popupHtmlPath, 'utf8');
      const js = fs.readFileSync(popupJsPath, 'utf8');

      assert.ok(html.includes('id="check-updates-btn"'), 'Must have Check for Updates button');
      assert.ok(html.includes('id="update-status-badge"'), 'Must have update status badge');
      assert.ok(html.includes('id="update-available-box"'), 'Must have update available box');
      assert.ok(html.includes('id="update-now-btn"'), 'Must have Update Now button');
      assert.ok(html.includes('id="settings-update-dot"'), 'Must have Settings update dot indicator');

      assert.ok(js.includes('checkForExtensionUpdates'), 'Must contain checkForExtensionUpdates function');
      assert.ok(js.includes('triggerExtensionUpdate'), 'Must contain triggerExtensionUpdate function');
      assert.ok(js.includes('compareVersions'), 'Must contain compareVersions function');
      assert.ok(!js.includes('BrowserAPI.isChromium()'), 'Must not call isChromium as a function');
    });

    // 11. BrowserAPI properties and runtime updater methods
    await test('BrowserAPI exposes boolean flags and runtime updater methods without errors', () => {
      const BrowserAPI = require(path.join(rootDir, 'src/core/browser-api'));
      assert.strictEqual(typeof BrowserAPI.isChromium, 'boolean', 'isChromium must be boolean');
      assert.strictEqual(typeof BrowserAPI.isFirefox, 'boolean', 'isFirefox must be boolean');
      assert.strictEqual(typeof BrowserAPI.runtime.getManifest, 'function', 'getManifest must be function');
      assert.strictEqual(typeof BrowserAPI.runtime.reload, 'function', 'reload must be function');
      assert.strictEqual(typeof BrowserAPI.runtime.requestUpdateCheck, 'function', 'requestUpdateCheck must be function');
    });

  } catch (e) {
    console.error('Fatal error during extension tests:', e);
    failed++;
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
