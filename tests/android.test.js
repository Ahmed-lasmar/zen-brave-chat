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

    // 6. In-App Version & Update Check API
    await test('Server serves /api/version with versionCode, versionName, downloadUrl, and changelog', async () => {
      const res = await httpGet('/api/version');
      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(res.body.toString('utf8'));
      assert.ok(data.android, 'Response must have android version object');
      assert.strictEqual(data.android.versionCode, 4, 'Version code should match build 4');
      assert.strictEqual(data.android.versionName, '1.0.3', 'Version name should be 1.0.3');
      assert.ok(data.android.downloadUrl.includes('/download/android'), 'Must have direct APK downloadUrl');
      assert.ok(Array.isArray(data.android.changelog), 'Changelog must be array');
      assert.ok(data.android.changelog.length > 0, 'Changelog must not be empty');

      // Test alias endpoints
      const resAlias1 = await httpGet('/download/version');
      assert.strictEqual(resAlias1.statusCode, 200);
      const resAlias2 = await httpGet('/version.json');
      assert.strictEqual(resAlias2.statusCode, 200);
    });

    // 7. Edge-to-Edge Status Bar Insets & Soft Keyboard Following
    await test('MainActivity handles WindowInsets for status bar and soft keyboard', async () => {
      const mainActivityPath = path.join(__dirname, '../android/app/src/main/java/tn/myapps/zenbrave/ui/MainActivity.kt');
      assert.ok(fs.existsSync(mainActivityPath));
      const code = fs.readFileSync(mainActivityPath, 'utf8');
      assert.ok(code.includes('setupWindowInsets'), 'MainActivity must have setupWindowInsets');
      assert.ok(code.includes('WindowInsetsCompat.Type.statusBars()'), 'Must handle statusBars insets');
      assert.ok(code.includes('WindowInsetsCompat.Type.ime()'), 'Must handle IME soft keyboard insets');
      assert.ok(code.includes('setOnApplyWindowInsetsListener'), 'Must use setOnApplyWindowInsetsListener');

      const mainLayoutPath = path.join(__dirname, '../android/app/src/main/res/layout/activity_main.xml');
      const layout = fs.readFileSync(mainLayoutPath, 'utf8');
      assert.ok(layout.includes('android:id="@+id/rootMainLayout"'), 'Must have rootMainLayout ID');
      assert.ok(layout.includes('android:id="@+id/topBar"'), 'Must have topBar ID');
      assert.ok(layout.includes('android:id="@+id/bottomBar"'), 'Must have bottomBar ID');
    });

    // 8. AndroidManifest Intent Filters & Permissions Verification
    await test('AndroidManifest.xml contains SEND and SEND_MULTIPLE intent-filters and install permission', async () => {
      const manifestPath = path.join(__dirname, '../android/app/src/main/AndroidManifest.xml');
      assert.ok(fs.existsSync(manifestPath), 'AndroidManifest.xml should exist');
      const content = fs.readFileSync(manifestPath, 'utf8');

      // Check permissions
      assert.ok(content.includes('android.permission.INTERNET'), 'Must declare INTERNET');
      assert.ok(content.includes('android.permission.ACCESS_NETWORK_STATE'), 'Must declare ACCESS_NETWORK_STATE');
      assert.ok(content.includes('android.permission.REQUEST_INSTALL_PACKAGES'), 'Must declare REQUEST_INSTALL_PACKAGES for in-app updates');
      assert.ok(content.includes('android.permission.POST_NOTIFICATIONS'), 'Must declare POST_NOTIFICATIONS for Android 13+ alerts');

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

      // Check Fullscreen ImageViewerActivity & FileProvider
      assert.ok(content.includes('ImageViewerActivity'), 'Must declare ImageViewerActivity in manifest');
      assert.ok(content.includes('androidx.core.content.FileProvider'), 'Must declare FileProvider in manifest');
      const filePathsXml = path.join(__dirname, '../android/app/src/main/res/xml/file_paths.xml');
      assert.ok(fs.existsSync(filePathsXml), 'file_paths.xml must exist for FileProvider');
    });

    // 9. Native Android Notifications & Channel Configuration
    await test('Native Android notification channel zen_brave_chat_messages and background suppression logic exist', async () => {
      const notifHelperPath = path.join(__dirname, '../android/app/src/main/java/tn/myapps/zenbrave/util/NotificationHelper.kt');
      assert.ok(fs.existsSync(notifHelperPath), 'NotificationHelper.kt must exist');
      const notifCode = fs.readFileSync(notifHelperPath, 'utf8');
      assert.ok(notifCode.includes('zen_brave_chat_messages'), 'Channel ID must be zen_brave_chat_messages');
      assert.ok(notifCode.includes('NotificationManager.IMPORTANCE_HIGH'), 'Channel must have high importance');
      assert.ok(notifCode.includes('enableVibration(true)'), 'Channel must enable vibration');
      assert.ok(notifCode.includes('MainActivity::class.java'), 'Notification intent must target MainActivity');
      assert.ok(notifCode.includes('MainActivity.EXTRA_ROOM_ID'), 'Must pass EXTRA_ROOM_ID in PendingIntent');

      const mainActivityPath = path.join(__dirname, '../android/app/src/main/java/tn/myapps/zenbrave/ui/MainActivity.kt');
      const mainCode = fs.readFileSync(mainActivityPath, 'utf8');
      assert.ok(mainCode.includes('isChatInForeground'), 'MainActivity must track isChatInForeground');
      assert.ok(mainCode.includes('isAppBackgroundedOrScreenLocked'), 'MainActivity must check background/screen lock state');
      assert.ok(mainCode.includes('NotificationHelper.showMessageNotification'), 'MainActivity must trigger NotificationHelper on incoming messages');
      assert.ok(mainCode.includes('handleNotificationOrRoomIntent'), 'MainActivity must route notification intents directly into room');
    });

    // 10. Custom Username Selection & Clean Sender Formatting on Android
    await test('Android supports custom username editing, persistence, and clean sender display', async () => {
      const prefsPath = path.join(__dirname, '../android/app/src/main/java/tn/myapps/zenbrave/data/RoomPreferences.kt');
      const prefsCode = fs.readFileSync(prefsPath, 'utf8');
      assert.ok(prefsCode.includes('var userName: String'), 'RoomPreferences must persist userName');

      const layoutPath = path.join(__dirname, '../android/app/src/main/res/layout/activity_main.xml');
      const layoutCode = fs.readFileSync(layoutPath, 'utf8');
      assert.ok(layoutCode.includes('btnEditUserName'), 'Layout must have btnEditUserName top-bar button');
      assert.ok(layoutCode.includes('etMainUserName'), 'Layout must have etMainUserName input');
      assert.ok(layoutCode.includes('btnSaveUserName'), 'Layout must have btnSaveUserName button');

      const mainActivityPath = path.join(__dirname, '../android/app/src/main/java/tn/myapps/zenbrave/ui/MainActivity.kt');
      const mainCode = fs.readFileSync(mainActivityPath, 'utf8');
      assert.ok(mainCode.includes('saveAndApplyUserName'), 'MainActivity must have saveAndApplyUserName');
      assert.ok(mainCode.includes('showEditUsernameDialog'), 'MainActivity must have showEditUsernameDialog');
      assert.ok(mainCode.includes('onPeerUpdated'), 'MainActivity must handle onPeerUpdated presence sync');

      const adapterPath = path.join(__dirname, '../android/app/src/main/java/tn/myapps/zenbrave/ui/MessageAdapter.kt');
      const adapterCode = fs.readFileSync(adapterPath, 'utf8');
      assert.ok(adapterCode.includes('formatSender'), 'MessageAdapter must use formatSender for clean sender display');
    });

    // 7. Interactive Image Viewer and Lightbox Support
    await test('Interactive full-screen ImageViewerActivity exists with zoom, save, and share actions', async () => {
      const viewerActivityPath = path.join(__dirname, '../android/app/src/main/java/tn/myapps/zenbrave/ui/ImageViewerActivity.kt');
      assert.ok(fs.existsSync(viewerActivityPath), 'ImageViewerActivity.kt must exist');
      const viewerCode = fs.readFileSync(viewerActivityPath, 'utf8');
      assert.ok(viewerCode.includes('setupInteractiveZoom'), 'Must support interactive zoom/pinch gesture');
      assert.ok(viewerCode.includes('openInExternalGallery'), 'Must support opening image in device gallery');
      assert.ok(viewerCode.includes('saveImageToGallery'), 'Must support saving image to device Pictures');
      assert.ok(viewerCode.includes('shareImage'), 'Must support sharing image via Android Share Sheet');

      const viewerLayoutPath = path.join(__dirname, '../android/app/src/main/res/layout/activity_image_viewer.xml');
      assert.ok(fs.existsSync(viewerLayoutPath), 'activity_image_viewer.xml layout must exist');
      const layoutCode = fs.readFileSync(viewerLayoutPath, 'utf8');
      assert.ok(layoutCode.includes('ivFullPreview'), 'Layout must have ivFullPreview');
      assert.ok(layoutCode.includes('btnViewerOpenExternal'), 'Layout must have gallery button');
      assert.ok(layoutCode.includes('btnViewerSave'), 'Layout must have save button');
      assert.ok(layoutCode.includes('btnViewerShare'), 'Layout must have share button');

      const adapterPath = path.join(__dirname, '../android/app/src/main/java/tn/myapps/zenbrave/ui/MessageAdapter.kt');
      const adapterCode = fs.readFileSync(adapterPath, 'utf8');
      assert.ok(adapterCode.includes('ImageViewerActivity::class.java'), 'MessageAdapter must launch ImageViewerActivity on image tap');
    });

    // 8. Voice Note Layout & MessageAdapter Support
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

    // 15. Message Reply & Emoji Reaction Architecture on Android
    await test('Android supports replying by text or emoji and message reactions', async () => {
      // 1. Model support
      const modelsPath = path.join(__dirname, '../android/app/src/main/java/tn/myapps/zenbrave/model/MessageModels.kt');
      const modelsCode = fs.readFileSync(modelsPath, 'utf8');
      assert.ok(modelsCode.includes('data class ReplyPayload'), 'Must define ReplyPayload data class');
      assert.ok(modelsCode.includes('val replyTo: ReplyPayload?'), 'ChatMessage must include replyTo field');
      assert.ok(modelsCode.includes('val reactions: Map<String, List<String>>'), 'ChatMessage must include reactions map');

      // 2. Layout support
      const mainLayoutPath = path.join(__dirname, '../android/app/src/main/res/layout/activity_main.xml');
      const mainLayoutCode = fs.readFileSync(mainLayoutPath, 'utf8');
      assert.ok(mainLayoutCode.includes('layoutReplyPreview'), 'activity_main.xml must include layoutReplyPreview');
      assert.ok(mainLayoutCode.includes('layoutReplyQuickEmojis'), 'activity_main.xml must include quick emoji reply bar');
      assert.ok(mainLayoutCode.includes('btnEmojiPicker'), 'activity_main.xml must include btnEmojiPicker');

      const textLayoutPath = path.join(__dirname, '../android/app/src/main/res/layout/item_message_text.xml');
      const textLayoutCode = fs.readFileSync(textLayoutPath, 'utf8');
      assert.ok(textLayoutCode.includes('llQuotedReply'), 'item_message_text.xml must include llQuotedReply');
      assert.ok(textLayoutCode.includes('llReactions'), 'item_message_text.xml must include llReactions');

      // 3. Adapter & Networking
      const adapterPath = path.join(__dirname, '../android/app/src/main/java/tn/myapps/zenbrave/ui/MessageAdapter.kt');
      const adapterCode = fs.readFileSync(adapterPath, 'utf8');
      assert.ok(adapterCode.includes('bindQuotedReply'), 'MessageAdapter must bind quoted replies');
      assert.ok(adapterCode.includes('bindReactions'), 'MessageAdapter must bind reaction pills');
      assert.ok(adapterCode.includes('updateReactions'), 'MessageAdapter must support updateReactions');

      const clientPath = path.join(__dirname, '../android/app/src/main/java/tn/myapps/zenbrave/net/RelayWebSocketClient.kt');
      const clientCode = fs.readFileSync(clientPath, 'utf8');
      assert.ok(clientCode.includes('sendReaction'), 'RelayWebSocketClient must implement sendReaction');
      assert.ok(clientCode.includes('onReactionReceived'), 'RelayListener must have onReactionReceived');
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
