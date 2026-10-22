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
      assert.ok(content.includes('android.permission.RECORD_AUDIO'), 'Must declare RECORD_AUDIO for voice notes');
      assert.ok(content.includes('text/*'), 'Must declare text/* mimeType data tag');
    });

    // 7. Voice Note Layout & MessageAdapter Support
    await test('Voice note layout exists and MessageAdapter supports voice messages', async () => {
      const voiceLayoutPath = path.join(__dirname, '../android/app/src/main/res/layout/item_message_voice.xml');
      assert.ok(fs.existsSync(voiceLayoutPath), 'item_message_voice.xml must exist');
      const layoutContent = fs.readFileSync(voiceLayoutPath, 'utf8');
      assert.ok(layoutContent.includes('btnVoicePlay'), 'Voice layout must include play button');
      assert.ok(layoutContent.includes('tvVoiceTitle'), 'Voice layout must include title');

      const adapterPath = path.join(__dirname, '../android/app/src/main/java/tn/myapps/zenbrave/ui/MessageAdapter.kt');
      const adapterContent = fs.readFileSync(adapterPath, 'utf8');
      assert.ok(adapterContent.includes('TYPE_VOICE'), 'MessageAdapter must have TYPE_VOICE view type');
      assert.ok(adapterContent.includes('VoiceViewHolder'), 'MessageAdapter must have VoiceViewHolder');
      assert.ok(adapterContent.includes('MediaPlayer'), 'MessageAdapter must use MediaPlayer for audio');
    });

    // 8. URL Extraction trailing punctuation cleanup verification
    await test('URL extraction logic cleans trailing punctuation from social app messages', async () => {
      const prefsPath = path.join(__dirname, '../android/app/src/main/java/tn/myapps/zenbrave/data/RoomPreferences.kt');
      const prefsContent = fs.readFileSync(prefsPath, 'utf8');
      assert.ok(prefsContent.includes('url.endsWith'), 'extractUrl must clean trailing punctuation');

      // Verify regex logic
      const urlRegex = /https?:\/\/[\w\-.~:?#\[\]@!$&'()*+,;=\/%]+/g;
      function cleanUrl(text) {
        const matches = text.match(urlRegex);
        if (!matches || !matches[0]) return null;
        let u = matches[0];
        while (u.endsWith('.') || u.endsWith(',') || u.endsWith(')') || u.endsWith(']') || u.endsWith('!') || u.endsWith(';')) {
          u = u.slice(0, -1);
        }
        return u;
      }

      assert.strictEqual(cleanUrl('Check https://zen-browser.app/.'), 'https://zen-browser.app/');
      assert.strictEqual(cleanUrl('(https://youtube.com/watch?v=1234)!'), 'https://youtube.com/watch?v=1234');
      assert.strictEqual(cleanUrl('Visit https://zenbrave.myapps.tn/download/android,'), 'https://zenbrave.myapps.tn/download/android');
    });

    // 9. Bi-directional WebSocket Voice Note Relaying & Server ACK
    await test('Relay server accepts mobile voice message and sends ACK to sender', async () => {
      const { connectWebSocket } = require('../server/websocket');
      const sender = await connectWebSocket(`ws://127.0.0.1:${addr.port}`);
      const receiver = await connectWebSocket(`ws://127.0.0.1:${addr.port}`);

      const testRoom = 'ZEN-VOICE';
      let receiverGotVoice = false;
      let senderGotAck = false;

      receiver.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === 'relayed-message' && msg.message && msg.message.type === 'voice') {
          if (msg.message.media && msg.message.media.mimeType === 'audio/mp4') {
            receiverGotVoice = true;
          }
        }
      });

      sender.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === 'ack' && msg.messageId === 'msg-voice-test-123') {
          senderGotAck = true;
        }
      });

      // Join room
      receiver.send(JSON.stringify({ type: 'join-room', roomId: testRoom, name: 'Desktop Zen' }));
      sender.send(JSON.stringify({ type: 'join-room', roomId: testRoom, name: 'Mobile Android' }));
      await new Promise(r => setTimeout(r, 60));

      // Send voice note
      sender.send(JSON.stringify({
        type: 'relay-message',
        roomId: testRoom,
        senderId: 'android-peer',
        payload: {
          id: 'msg-voice-test-123',
          type: 'voice',
          text: '🎤 Voice note (4s)',
          media: {
            type: 'voice',
            mimeType: 'audio/mp4',
            data: 'data:audio/mp4;base64,AAAAHGZ0eXBNNEEgAAAA...',
            name: 'voice_123.m4a'
          },
          browser: 'Android'
        }
      }));

      await new Promise(r => setTimeout(r, 100));

      assert.strictEqual(receiverGotVoice, true, 'Desktop peer must receive the relayed voice note');
      assert.strictEqual(senderGotAck, true, 'Sender must receive server ACK confirmation');

      sender.close();
      receiver.close();
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
