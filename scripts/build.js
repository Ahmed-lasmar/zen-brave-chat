const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const COMMON_MANIFEST_PATH = path.join(ROOT_DIR, 'manifest.common.json');

function copyRecursive(src, dest, filterFn) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);
      if (!filterFn || filterFn(srcPath)) {
        copyRecursive(srcPath, destPath, filterFn);
      }
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    if (typeof fs.rmSync === 'function') {
      fs.rmSync(dir, { recursive: true, force: true });
    } else {
      fs.rmdirSync(dir, { recursive: true });
    }
  }
  fs.mkdirSync(dir, { recursive: true });
}

function validateManifest(distTargetDir, manifest) {
  const errors = [];
  if (!manifest.manifest_version) errors.push('Missing manifest_version');
  if (!manifest.name) errors.push('Missing name');
  if (!manifest.version) errors.push('Missing version');

  // Validate icons exist
  if (manifest.icons) {
    for (const [size, iconRel] of Object.entries(manifest.icons)) {
      const iconPath = path.join(distTargetDir, iconRel);
      if (!fs.existsSync(iconPath)) {
        errors.push(`Icon ${iconRel} (${size}) not found in ${distTargetDir}`);
      }
    }
  }

  // Validate popup exists
  if (manifest.action && manifest.action.default_popup) {
    const popupPath = path.join(distTargetDir, manifest.action.default_popup);
    if (!fs.existsSync(popupPath)) {
      errors.push(`Popup HTML ${manifest.action.default_popup} not found in ${distTargetDir}`);
    }
  }

  // Validate action icons exist
  if (manifest.action && manifest.action.default_icon) {
    if (typeof manifest.action.default_icon === 'string') {
      const iconPath = path.join(distTargetDir, manifest.action.default_icon);
      if (!fs.existsSync(iconPath)) {
        errors.push(`Action icon ${manifest.action.default_icon} not found in ${distTargetDir}`);
      }
    } else if (typeof manifest.action.default_icon === 'object') {
      for (const [size, iconRel] of Object.entries(manifest.action.default_icon)) {
        const iconPath = path.join(distTargetDir, iconRel);
        if (!fs.existsSync(iconPath)) {
          errors.push(`Action icon ${iconRel} (${size}) not found in ${distTargetDir}`);
        }
      }
    }
  }

  // Validate sidebar_action exists
  if (manifest.sidebar_action) {
    if (manifest.sidebar_action.default_panel) {
      const panelPath = path.join(distTargetDir, manifest.sidebar_action.default_panel);
      if (!fs.existsSync(panelPath)) {
        errors.push(`Sidebar panel ${manifest.sidebar_action.default_panel} not found in ${distTargetDir}`);
      }
    }
    if (manifest.sidebar_action.default_icon) {
      const iconPath = path.join(distTargetDir, manifest.sidebar_action.default_icon);
      if (!fs.existsSync(iconPath)) {
        errors.push(`Sidebar icon ${manifest.sidebar_action.default_icon} not found in ${distTargetDir}`);
      }
    }
  }

  // Validate side_panel exists
  if (manifest.side_panel && manifest.side_panel.default_path) {
    const panelPath = path.join(distTargetDir, manifest.side_panel.default_path);
    if (!fs.existsSync(panelPath)) {
      errors.push(`Side panel ${manifest.side_panel.default_path} not found in ${distTargetDir}`);
    }
  }

  // Validate background scripts exist
  if (manifest.background) {
    if (manifest.background.service_worker) {
      const swPath = path.join(distTargetDir, manifest.background.service_worker);
      if (!fs.existsSync(swPath)) {
        errors.push(`Service worker ${manifest.background.service_worker} not found in ${distTargetDir}`);
      }
    }
    if (manifest.background.scripts) {
      for (const scr of manifest.background.scripts) {
        const scrPath = path.join(distTargetDir, scr);
        if (!fs.existsSync(scrPath)) {
          errors.push(`Background script ${scr} not found in ${distTargetDir}`);
        }
      }
    }
  }

  return errors;
}

function buildTarget(targetName, overrideManifestName) {
  console.log(`\n📦 Building extension for ${targetName.toUpperCase()}...`);
  const targetDist = path.join(DIST_DIR, targetName);
  cleanDir(targetDist);

  // 1. Copy source tree (core, ui, background)
  const subdirs = ['core', 'ui', 'background'];
  for (const sub of subdirs) {
    const srcSub = path.join(SRC_DIR, sub);
    const destSub = path.join(targetDist, sub);
    copyRecursive(srcSub, destSub, (srcPath) => {
      // Exclude tests or temp files if any
      return !srcPath.includes('.test.') && !srcPath.endsWith('.swp');
    });
  }

  // 2. Merge manifest
  const commonManifest = JSON.parse(fs.readFileSync(COMMON_MANIFEST_PATH, 'utf8'));
  const overridePath = path.join(SRC_DIR, overrideManifestName);
  const overrideManifest = JSON.parse(fs.readFileSync(overridePath, 'utf8'));

  const mergedManifest = {
    ...commonManifest,
    ...overrideManifest
  };

  // Merge permissions uniquely
  if (commonManifest.permissions || overrideManifest.permissions) {
    const commonPerms = commonManifest.permissions || [];
    const overridePerms = overrideManifest.permissions || [];
    mergedManifest.permissions = Array.from(new Set([...commonPerms, ...overridePerms]));
  }

  // Merge host_permissions uniquely
  if (commonManifest.host_permissions || overrideManifest.host_permissions) {
    const commonHosts = commonManifest.host_permissions || [];
    const overrideHosts = overrideManifest.host_permissions || [];
    mergedManifest.host_permissions = Array.from(new Set([...commonHosts, ...overrideHosts]));
  }

  const manifestDest = path.join(targetDist, 'manifest.json');
  fs.writeFileSync(manifestDest, JSON.stringify(mergedManifest, null, 2), 'utf8');

  // 3. Validate
  const validationErrors = validateManifest(targetDist, mergedManifest);
  if (validationErrors.length > 0) {
    console.error(`❌ Validation errors for ${targetName}:`);
    validationErrors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log(`✅ ${targetName.toUpperCase()} build complete at: ${targetDist}`);
}

function buildCrx3(zipBuffer, privateKeyPemPath, outputPath) {
  const crypto = require('crypto');
  let privateKey;
  if (fs.existsSync(privateKeyPemPath)) {
    privateKey = crypto.createPrivateKey(fs.readFileSync(privateKeyPemPath, 'utf8'));
  } else {
    const keyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    fs.writeFileSync(privateKeyPemPath, keyPair.privateKey, 'utf8');
    privateKey = crypto.createPrivateKey(keyPair.privateKey);
  }

  const publicKey = crypto.createPublicKey(privateKey);
  const derPub = publicKey.export({ type: 'spki', format: 'der' });
  const crxId = crypto.createHash('sha256').update(derPub).digest().subarray(0, 16);

  function encodeVarint(num) {
    const bytes = [];
    while (num > 0x7f) {
      bytes.push((num & 0x7f) | 0x80);
      num >>>= 7;
    }
    bytes.push(num & 0x7f);
    return Buffer.from(bytes);
  }

  function encodeLengthDelimited(fieldNumber, data) {
    const tag = encodeVarint((fieldNumber << 3) | 2);
    const len = encodeVarint(data.length);
    return Buffer.concat([tag, len, data]);
  }

  // SignedData: field 1 = crx_id (16 bytes)
  const signedHeaderData = encodeLengthDelimited(1, crxId);

  // Sign: "CRX3 SignedData\x00" + len(signedHeaderData) [uint32 LE] + signedHeaderData + zipBuffer
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(Buffer.from('CRX3 SignedData\x00', 'utf8'));
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(signedHeaderData.length, 0);
  sign.update(lenBuf);
  sign.update(signedHeaderData);
  sign.update(zipBuffer);
  const signature = sign.sign(privateKey);

  // AsymmetricKeyProof: field 1 = public_key, field 2 = signature
  const proof = Buffer.concat([
    encodeLengthDelimited(1, derPub),
    encodeLengthDelimited(2, signature)
  ]);

  // CrxFileHeader: field 2 = sha256_with_rsa (proof), field 10000 = signed_header_data
  const header = Buffer.concat([
    encodeLengthDelimited(2, proof),
    encodeLengthDelimited(10000, signedHeaderData)
  ]);

  // Construct CRX3 file: Magic "Cr24", Version 3 (uint32 LE), Header Length (uint32 LE), Header, Zip
  const magic = Buffer.from('Cr24', 'utf8');
  const version = Buffer.alloc(4);
  version.writeUInt32LE(3, 0);
  const headerLen = Buffer.alloc(4);
  headerLen.writeUInt32LE(header.length, 0);

  const crx = Buffer.concat([magic, version, headerLen, header, zipBuffer]);
  fs.writeFileSync(outputPath, crx);

  const idStr = Array.from(crxId).map(b => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 0x0f))).join('');
  return { id: idStr, sha256: crypto.createHash('sha256').update(crx).digest('hex') };
}

function main() {
  console.log('🚀 Starting Cross-Browser Extension Build Process...');

  // Ensure icons are present before building
  const iconScript = path.join(__dirname, 'generate-icons.js');
  if (fs.existsSync(iconScript)) {
    require('./generate-icons');
  }

  buildTarget('zen', 'manifest.zen.json');
  buildTarget('brave', 'manifest.brave.json');

  // Package zip archives and browser add-on packages
  try {
    const { execSync } = require('child_process');
    const crypto = require('crypto');

    // 1. Package zip distributions
    const zenZipPath = path.join(DIST_DIR, 'zen-extension.zip');
    const braveZipPath = path.join(DIST_DIR, 'brave-extension.zip');
    if (fs.existsSync(zenZipPath)) fs.unlinkSync(zenZipPath);
    if (fs.existsSync(braveZipPath)) fs.unlinkSync(braveZipPath);

    execSync(`cd "${DIST_DIR}" && zip -r -q zen-extension.zip zen/ && zip -r -q brave-extension.zip brave/`, { stdio: 'ignore' });
    console.log('📦 Packaged zip downloads: dist/zen-extension.zip & dist/brave-extension.zip');

    // 2. Package Zen/Firefox .xpi (files must be at the archive root)
    const xpiPath = path.join(DIST_DIR, 'zen.xpi');
    if (fs.existsSync(xpiPath)) fs.unlinkSync(xpiPath);
    execSync(`cd "${path.join(DIST_DIR, 'zen')}" && zip -r -q "${xpiPath}" .`, { stdio: 'ignore' });

    // Compute SHA-256 of zen.xpi
    const xpiBuf = fs.readFileSync(xpiPath);
    const xpiSha256 = crypto.createHash('sha256').update(xpiBuf).digest('hex');
    fs.writeFileSync(path.join(DIST_DIR, 'zen.xpi.sha256'), xpiSha256, 'utf8');
    console.log(`🦊 Packaged Zen/Firefox XPInstall: dist/zen.xpi (SHA-256: ${xpiSha256})`);

    // 3. Package Brave/Chromium .crx archive (CRX3 with RSA-SHA256 signature)
    const braveZipBuf = execSync(`cd "${path.join(DIST_DIR, 'brave')}" && zip -r -q - .`);
    const crxPath = path.join(DIST_DIR, 'brave.crx');
    const pemPath = path.join(__dirname, 'brave.pem');
    const crxInfo = buildCrx3(braveZipBuf, pemPath, crxPath);
    console.log(`🦁 Packaged Brave/Chromium CRX3 package: dist/brave.crx (ID: ${crxInfo.id}, SHA-256: ${crxInfo.sha256})`);
  } catch (err) {
    console.error('Packaging warning:', err.message);
  }

  console.log('\n======================================================');
  console.log('🎉 All extension builds generated successfully!');
  console.log('------------------------------------------------------');
  console.log('🦊 Zen Browser (Firefox / Gecko):');
  console.log('   1. Open Zen Browser -> navigate to about:debugging#/runtime/this-firefox');
  console.log('   2. Click "Load Temporary Add-on..."');
  console.log(`   3. Select file: ${path.join(DIST_DIR, 'zen', 'manifest.json')}`);
  console.log('------------------------------------------------------');
  console.log('🦁 Brave Browser (Chromium / Blink):');
  console.log('   1. Open Brave -> navigate to brave://extensions');
  console.log('   2. Enable "Developer mode" toggle (top-right)');
  console.log('   3. Click "Load unpacked" and select:');
  console.log(`      ${path.join(DIST_DIR, 'brave')}`);
  console.log('======================================================\n');
}

if (require.main === module) {
  main();
}

module.exports = {
  buildTarget,
  validateManifest
};
