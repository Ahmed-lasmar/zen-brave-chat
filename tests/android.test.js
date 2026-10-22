const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { createServer } = require('../server/index');

async function runTests() {
  console.log('\n📱 Running Android Mobile App & Distribution Unit Tests...\n');
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

  const testStoragePath = path.join(__dirname, 'temp-offline-android-test.json');
  if (fs.existsSync(testStoragePath)) fs.unlinkSync(testStoragePath);

  const app = createServer({ storagePath: testStoragePath });
  const addr = await app.listen(0, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  function httpGet(path, headers = {}) {
    return new Promise((resolve, reject) => {
      http.get(`${baseUrl}${path}`, { headers }, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks)
          });
        });
      }).on('error', reject);
    });
  }

  try {
    // 1. Android APK file exists in dist/
    await test('Compiled zenbrave-chat.apk exists in dist/', async () => {
      const apkPath = path.join(__dirname, '../dist/zenbrave-chat.apk');
      assert.ok(fs.existsSync(apkPath), 'dist/zenbrave-chat.apk should exist');
      const stats = fs.statSync(apkPath);
      assert.ok(stats.size > 1000000, `APK size should be > 1MB, got ${stats.size} bytes`);
    });

    // 2. HTTP GET /download/android
    await test('Server serves /download/android with HTTP 200 and APK Content-Type', async () => {
      const res = await httpGet('/download/android');
      assert.strictEqual(res.statusCode, 200, 'Should return HTTP 200');
      assert.strictEqual(res.headers['content-type'], 'application/vnd.android.package-archive');
      assert.ok(res.headers['content-disposition'].includes('zenbrave-chat.apk'));
      const apkPath = path.join(__dirname, '../dist/zenbrave-chat.apk');
      assert.strictEqual(parseInt(res.headers['content-length'], 10), fs.statSync(apkPath).size);
      assert.strictEqual(res.body.length, fs.statSync(apkPath).size);
    });

    // 3. HTTP GET /download/apk alias
    await test('Server serves /download/apk alias endpoint', async () => {
      const res = await httpGet('/download/apk');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['content-type'], 'application/vnd.android.package-archive');
    });

    // 4. Landing page contains Android download card and button
    await test('Landing page renders Android APK download card and instructions', async () => {
      const res = await httpGet('/', { 'Accept': 'text/html' });
      assert.strictEqual(res.statusCode, 200);
      const html = res.body.toString('utf8');
      assert.ok(html.includes('/download/android'), 'Landing page should link to /download/android');
      assert.ok(html.includes('Android Mobile App'), 'Landing page should have Android Mobile App title');
      assert.ok(html.includes('Download for Android (.apk)'), 'Landing page should have Android download button');
      assert.ok(html.includes('btn-android'), 'Landing page should have .btn-android class');
    });

    // 5. JSON Status API includes android download URL
    await test('Root JSON API contains android download endpoint', async () => {
      const res = await httpGet('/', { 'Accept': 'application/json' });
      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(res.body.toString('utf8'));
      assert.ok(data.downloads, 'JSON should have downloads object');
      assert.ok(data.downloads.android, 'JSON should have android download URL');
      assert.ok(data.downloads.android.includes('/download/android'));
    });

    // 6. AndroidManifest Intent Filters Verification
    await test('AndroidManifest.xml contains SEND and SEND_MULTIPLE intent-filters', async () => {
      const manifestPath = path.join(__dirname, '../android/app/src/main/AndroidManifest.xml');
      assert.ok(fs.existsSync(manifestPath), 'AndroidManifest.xml should exist');
      const content = fs.readFileSync(manifestPath, 'utf8');

      // Check permissions
      assert.ok(content.includes('android.permission.INTERNET'), 'Must declare INTERNET');
      assert.ok(content.includes('android.permission.ACCESS_NETWORK_STATE'), 'Must declare ACCESS_NETWORK_STATE');

      // Check ShareActivity and filters
      assert.ok(content.includes('tn.myapps.zenbrave.ui.ShareActivity') || content.includes('.ui.ShareActivity'));
      assert.ok(content.includes('android.intent.action.SEND'), 'Must have action.SEND');
      assert.ok(content.includes('android.intent.action.SEND_MULTIPLE'), 'Must have action.SEND_MULTIPLE');
      assert.ok(content.includes('text/plain'), 'Must support text/plain');
      assert.ok(content.includes('image/*'), 'Must support image/*');

      // Check MainActivity launcher
      assert.ok(content.includes('tn.myapps.zenbrave.ui.MainActivity') || content.includes('.ui.MainActivity'));
      assert.ok(content.includes('android.intent.action.MAIN'));
      assert.ok(content.includes('android.intent.category.LAUNCHER'));
    });

  } finally {
    await app.close();
    if (fs.existsSync(testStoragePath)) {
      try { fs.unlinkSync(testStoragePath); } catch (_) {}
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
