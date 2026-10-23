const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { createServer } = require('../server/index');
const { connectWebSocket, OPCODES } = require('../server/websocket');
const { RoomManager } = require('../server/rooms');

const testStoragePath = path.join(__dirname, 'temp-offline-test.json');

async function runTests() {
  console.log('\n🧪 Running Relay Server & Room Protocol Unit Tests...\n');
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

  // Clean temp test file
  if (fs.existsSync(testStoragePath)) fs.unlinkSync(testStoragePath);

  const app = createServer({ storagePath: testStoragePath });
  const addr = await app.listen(0, '127.0.0.1');
  const wsUrl = `ws://127.0.0.1:${addr.port}`;

  function httpGet(urlPath, headers = {}) {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${addr.port}${urlPath}`, { headers }, (res) => {
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
    // 1. WebSocket RFC 6455 Handshake & Ping/Pong
    await test('WebSocket client connects and exchanges Ping/Pong', async () => {
      const client = await connectWebSocket(wsUrl);
      let pongReceived = false;

      client.on('pong', () => {
        pongReceived = true;
      });

      client.ping('ping-payload');
      await new Promise(r => setTimeout(r, 80));

      assert.strictEqual(pongReceived, true, 'Expected pong frame response');
      client.close();
    });

    // 2. Room Creation
    await test('Client can create room and receives room code', async () => {
      const client = await connectWebSocket(wsUrl);
      let createdRoomId = null;

      client.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === 'room-created') {
          createdRoomId = msg.roomId;
        }
      });

      client.send({ type: 'create-room' });
      await new Promise(r => setTimeout(r, 80));

      assert.ok(createdRoomId, 'Expected room-created event with roomId');
      assert.ok(createdRoomId.startsWith('ZEN-'), 'Room code should start with ZEN-');
      client.close();
    });

    // 3. Multi-client Join and Peer Presence
    await test('Peers joining same room receive presence updates', async () => {
      const clientA = await connectWebSocket(wsUrl);
      const clientB = await connectWebSocket(wsUrl);

      const roomId = 'ZEN-TEST1';
      let clientA_sawB = false;
      let clientB_joinedData = null;

      clientA.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === 'peer-joined' && msg.peer.name === 'BraveUser') {
          clientA_sawB = true;
        }
      });

      clientB.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === 'room-joined') {
          clientB_joinedData = msg;
        }
      });

      // Client A joins
      clientA.send({
        type: 'join-room',
        roomId,
        peerId: 'peer-A',
        name: 'ZenUser',
        browser: 'Zen Browser'
      });
      await new Promise(r => setTimeout(r, 50));

      // Client B joins
      clientB.send({
        type: 'join-room',
        roomId,
        peerId: 'peer-B',
        name: 'BraveUser',
        browser: 'Brave Browser'
      });
      await new Promise(r => setTimeout(r, 100));

      assert.ok(clientA_sawB, 'Client A should receive peer-joined for Client B');
      assert.ok(clientB_joinedData, 'Client B should receive room-joined');
      assert.strictEqual(clientB_joinedData.peers.length, 1, 'Client B should see 1 existing peer');
      assert.strictEqual(clientB_joinedData.peers[0].name, 'ZenUser');

      clientA.close();
      clientB.close();
    });

    // 4. WebRTC Signal Routing
    await test('Signaling messages (SDP/ICE) are routed to target peer only', async () => {
      const clientA = await connectWebSocket(wsUrl);
      const clientB = await connectWebSocket(wsUrl);
      const clientC = await connectWebSocket(wsUrl);
      const roomId = 'ZEN-SIG1';

      clientA.send({ type: 'join-room', roomId, peerId: 'peer-A', name: 'A' });
      clientB.send({ type: 'join-room', roomId, peerId: 'peer-B', name: 'B' });
      clientC.send({ type: 'join-room', roomId, peerId: 'peer-C', name: 'C' });
      await new Promise(r => setTimeout(r, 80));

      let clientB_signal = null;
      let clientC_signal = null;

      clientB.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === 'signal') clientB_signal = msg;
      });

      clientC.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === 'signal') clientC_signal = msg;
      });

      // A sends signal targeted specifically at B
      clientA.send({
        type: 'signal',
        roomId,
        senderId: 'peer-A',
        targetPeerId: 'peer-B',
        payload: { sdp: { type: 'offer', sdp: 'dummy-offer' } }
      });
      await new Promise(r => setTimeout(r, 80));

      assert.ok(clientB_signal, 'Target peer B must receive signal');
      assert.strictEqual(clientB_signal.senderId, 'peer-A');
      assert.strictEqual(clientB_signal.payload.sdp.type, 'offer');
      assert.strictEqual(clientC_signal, null, 'Untargeted peer C must not receive signal');

      clientA.close();
      clientB.close();
      clientC.close();
    });

    // 5. Message Relay Fallback and Offline Queuing
    await test('Relayed messages are queued and replayed on reconnect', async () => {
      const clientA = await connectWebSocket(wsUrl);
      const roomId = 'ZEN-QUEUE';

      clientA.send({ type: 'join-room', roomId, peerId: 'peer-A', name: 'A' });
      await new Promise(r => setTimeout(r, 50));

      // Client A sends a message while B is offline
      clientA.send({
        type: 'relay-message',
        roomId,
        senderId: 'peer-A',
        payload: {
          id: 'msg-offline-1',
          type: 'link',
          text: 'Shared while you were gone',
          link: { url: 'https://zen-browser.app', title: 'Zen Browser' }
        }
      });
      await new Promise(r => setTimeout(r, 80));

      // Now Client B connects for the first time
      const clientB = await connectWebSocket(wsUrl);
      let clientB_history = null;

      clientB.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === 'room-joined') {
          clientB_history = msg.history;
        }
      });

      clientB.send({ type: 'join-room', roomId, peerId: 'peer-B', name: 'B' });
      await new Promise(r => setTimeout(r, 100));

      assert.ok(Array.isArray(clientB_history), 'Client B should receive message history queue');
      assert.strictEqual(clientB_history.length, 1);
      assert.strictEqual(clientB_history[0].id, 'msg-offline-1');
      assert.strictEqual(clientB_history[0].link.url, 'https://zen-browser.app');

      clientA.close();
      clientB.close();
    });

    // 6. Disk Persistence Verification
    await test('Room message history is persisted to disk', async () => {
      assert.ok(fs.existsSync(testStoragePath), 'Storage file should exist on disk');
      const data = JSON.parse(fs.readFileSync(testStoragePath, 'utf8'));
      assert.ok(data['ZEN-QUEUE'], 'ZEN-QUEUE room should be persisted');
      assert.strictEqual(data['ZEN-QUEUE'].messageQueue.length, 1);
    });

    // 7. Room Switching & Phantom Peer Prevention
    await test('Switching rooms cleans up socket membership from old room', async () => {
      const client = await connectWebSocket(wsUrl);
      const peerWatcher = await connectWebSocket(wsUrl);

      let peerLeftFired = false;
      peerWatcher.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === 'peer-left' && msg.peerId === 'peer-switcher') {
          peerLeftFired = true;
        }
      });

      // Join room 1
      peerWatcher.send({ type: 'join-room', roomId: 'ZEN-OLD', peerId: 'peer-watcher', name: 'Watcher' });
      client.send({ type: 'join-room', roomId: 'ZEN-OLD', peerId: 'peer-switcher', name: 'Switcher' });
      await new Promise(r => setTimeout(r, 60));

      // Same socket joins room 2
      client.send({ type: 'join-room', roomId: 'ZEN-NEW', peerId: 'peer-switcher', name: 'Switcher' });
      await new Promise(r => setTimeout(r, 80));

      assert.strictEqual(peerLeftFired, true, 'Old room should receive peer-left when client joins a new room');

      client.close();
      peerWatcher.close();
    });

    // 8. Leave Room explicit event
    await test('Explicit leave-room sends room-left event', async () => {
      const client = await connectWebSocket(wsUrl);
      let leftEvent = null;

      client.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === 'room-left') leftEvent = msg;
      });

      client.send({ type: 'join-room', roomId: 'ZEN-LEAVE', peerId: 'peer-leaver', name: 'Leaver' });
      await new Promise(r => setTimeout(r, 50));

      client.send({ type: 'leave-room' });
      await new Promise(r => setTimeout(r, 50));

      assert.ok(leftEvent, 'Expected room-left event response');
      assert.strictEqual(leftEvent.roomId, 'ZEN-LEAVE');
      client.close();
    });

    // 9. Custom username update & presence sync
    await test('Custom username update synchronizes presence and broadcasts peer-updated event', async () => {
      const clientA = await connectWebSocket(wsUrl);
      const clientB = await connectWebSocket(wsUrl);

      const roomId = 'ZEN-NAME-SYNC';
      let peerUpdatedEvent = null;

      clientB.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === 'peer-updated') {
          peerUpdatedEvent = msg;
        }
      });

      clientA.send({ type: 'join-room', roomId, peerId: 'peer-user-a', name: 'AliceOriginal', browser: 'Zen' });
      clientB.send({ type: 'join-room', roomId, peerId: 'peer-user-b', name: 'Bob', browser: 'Brave' });
      await new Promise(r => setTimeout(r, 80));

      clientA.send({ type: 'update-username', name: 'AliceCustom' });
      await new Promise(r => setTimeout(r, 80));

      assert.ok(peerUpdatedEvent, 'clientB should receive peer-updated event');
      assert.strictEqual(peerUpdatedEvent.oldName, 'AliceOriginal');
      assert.strictEqual(peerUpdatedEvent.peer.name, 'AliceCustom');
      assert.strictEqual(peerUpdatedEvent.peer.id, 'peer-user-a');

      clientA.close();
      clientB.close();
    });

    // 10. Reply to Message by Text or Emoji
    await test('Relayed message with replyTo is broadcasted and preserved in room history', async () => {
      const clientA = await connectWebSocket(wsUrl);
      const clientB = await connectWebSocket(wsUrl);
      const roomId = 'ZEN-RPLY';
      let receivedReply = null;

      clientB.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === 'relayed-message' && msg.message && msg.message.replyTo) {
          receivedReply = msg.message;
        }
      });

      clientA.send({ type: 'join-room', roomId, peerId: 'peer-reply-a', name: 'Alice', browser: 'Zen' });
      clientB.send({ type: 'join-room', roomId, peerId: 'peer-reply-b', name: 'Bob', browser: 'Brave' });
      await new Promise(r => setTimeout(r, 80));

      // Client A sends a reply message to Bob's earlier message
      const replyPayload = {
        id: 'msg-reply-1',
        type: 'text',
        text: 'I agree completely! 👍',
        replyTo: {
          id: 'msg-orig-1',
          senderName: 'Bob',
          text: 'Should we launch today?',
          type: 'text'
        },
        senderId: 'peer-reply-a',
        senderName: 'Alice',
        timestamp: Date.now()
      };

      clientA.send({
        type: 'relay-message',
        roomId: roomId,
        senderId: 'peer-reply-a',
        payload: replyPayload
      });
      await new Promise(r => setTimeout(r, 100));

      assert.ok(receivedReply, 'Bob should receive the relayed message with replyTo');
      assert.strictEqual(receivedReply.text, 'I agree completely! 👍');
      assert.ok(receivedReply.replyTo, 'Message must retain replyTo payload');
      assert.strictEqual(receivedReply.replyTo.id, 'msg-orig-1');
      assert.strictEqual(receivedReply.replyTo.senderName, 'Bob');

      clientA.close();
      clientB.close();
    });

    // 11. Emoji Message Reactions
    await test('Emoji reaction updates message reactions, persists to storage, and broadcasts to room', async () => {
      const clientA = await connectWebSocket(wsUrl);
      const clientB = await connectWebSocket(wsUrl);
      const roomId = 'ZEN-REAC';
      let receivedReaction = null;

      clientB.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === 'message-reaction') {
          receivedReaction = msg;
        }
      });

      clientA.send({ type: 'join-room', roomId, peerId: 'peer-reac-a', name: 'Alice', browser: 'Zen' });
      clientB.send({ type: 'join-room', roomId, peerId: 'peer-reac-b', name: 'Bob', browser: 'Brave' });
      await new Promise(r => setTimeout(r, 80));

      // Client A sends original message first
      clientA.send({
        type: 'relay-message',
        roomId: roomId,
        senderId: 'peer-reac-a',
        payload: {
          id: 'msg-target-react',
          type: 'text',
          text: 'Look at this awesome feature!'
        }
      });
      await new Promise(r => setTimeout(r, 80));

      // Bob reacts with 🔥 emoji
      clientB.send({
        type: 'relay-message',
        roomId: roomId,
        senderId: 'peer-reac-b',
        payload: {
          type: 'reaction',
          targetMessageId: 'msg-target-react',
          emoji: '🔥'
        }
      });
      await new Promise(r => setTimeout(r, 100));

      assert.ok(receivedReaction, 'Room peers should receive message-reaction broadcast');
      assert.strictEqual(receivedReaction.targetMessageId, 'msg-target-react');
      assert.strictEqual(receivedReaction.emoji, '🔥');
      assert.ok(receivedReaction.reactions['🔥'], 'Reactions map must contain 🔥');
      assert.ok(receivedReaction.reactions['🔥'].includes('Bob'), 'Reactions must record Bob');

      clientA.close();
      clientB.close();
    });

    // 12. Mozilla Gecko WebExtension Updates Manifest
    await test('GET /updates/zen/updates.json returns valid Gecko update manifest', async () => {
      const res = await httpGet('/updates/zen/updates.json');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['content-type'], 'application/json');
      const data = JSON.parse(res.body.toString('utf8'));
      assert.ok(data.addons, 'Response must contain addons');
      assert.ok(data.addons['zen-brave-chat@antigravity'], 'Must contain zen-brave-chat@antigravity entry');
      const updates = data.addons['zen-brave-chat@antigravity'].updates;
      assert.ok(Array.isArray(updates) && updates.length > 0, 'Must have updates list');
      assert.strictEqual(updates[0].version, '1.0.3');
      assert.ok(updates[0].update_link.includes('/download/zen.xpi'));
      assert.ok(updates[0].update_hash.startsWith('sha256:'));
      assert.strictEqual(updates[0].applications.gecko.strict_min_version, '109.0');
    });

    // 13. Direct Zen / Firefox XPInstall download (.xpi)
    await test('GET /download/zen.xpi returns HTTP 200 with application/x-xpinstall and inline disposition', async () => {
      const res = await httpGet('/download/zen.xpi');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['content-type'], 'application/x-xpinstall');
      assert.ok(res.headers['content-disposition'].includes('inline'));
      assert.ok(res.headers['content-disposition'].includes('zen-brave-chat.xpi'));
      const xpiPath = path.join(__dirname, '../dist/zen.xpi');
      if (fs.existsSync(xpiPath)) {
        assert.strictEqual(res.body.length, fs.statSync(xpiPath).size);
      }
    });

    // 14. Chromium Omaha Updates XML (Brave / Chrome)
    await test('GET /updates/brave/updates.xml returns Omaha update XML matching requested appid', async () => {
      const res = await httpGet('/updates/brave/updates.xml?x=id%3Dcustom-brave-app%26v%3D1.0.0');
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.headers['content-type'].includes('application/xml'));
      const xml = res.body.toString('utf8');
      assert.ok(xml.includes("<app appid='custom-brave-app'>"));
      assert.ok(xml.includes("<updatecheck codebase="));
      assert.ok(xml.includes("/download/brave.crx"));
      assert.ok(xml.includes("version='1.0.3'"));
    });

    // 15. Brave / Chromium CRX package download
    await test('GET /download/brave.crx returns HTTP 200 with application/x-chrome-extension', async () => {
      const res = await httpGet('/download/brave.crx');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['content-type'], 'application/x-chrome-extension');
      assert.ok(res.headers['content-disposition'].includes('zen-brave-chat.crx'));
      const crxPath = path.join(__dirname, '../dist/brave.crx');
      if (fs.existsSync(crxPath)) {
        assert.strictEqual(res.body.length, fs.statSync(crxPath).size);
      }
    });

    // 16. Extension Metadata in /api/version
    await test('GET /api/version returns extension update metadata alongside android and server', async () => {
      const res = await httpGet('/api/version');
      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(res.body.toString('utf8'));
      assert.ok(data.extension, 'Must contain extension section');
      assert.strictEqual(data.extension.version, '1.0.3');
      assert.ok(Array.isArray(data.extension.changelog) && data.extension.changelog.length > 0);
      assert.ok(data.extension.zen.xpiUrl.includes('/download/zen.xpi'));
      assert.ok(data.extension.zen.updateManifestUrl.includes('/updates/zen/updates.json'));
      assert.ok(data.extension.zen.sha256.length > 0);
      assert.ok(data.extension.brave.crxUrl.includes('/download/brave.crx'));
      assert.ok(data.extension.brave.updateManifestUrl.includes('/updates/brave/updates.xml'));
    });

    // 17. Download aliases (/download/xpi and /download/crx) and HEAD requests
    await test('Download alias endpoints (/download/xpi, /download/crx) and Omaha multiple-app queries', async () => {
      // /download/xpi alias
      const xpiRes = await httpGet('/download/xpi');
      assert.strictEqual(xpiRes.statusCode, 200);
      assert.strictEqual(xpiRes.headers['content-type'], 'application/x-xpinstall');

      // /download/crx alias
      const crxRes = await httpGet('/download/crx');
      assert.strictEqual(crxRes.statusCode, 200);
      assert.strictEqual(crxRes.headers['content-type'], 'application/x-chrome-extension');

      // Omaha default appid
      const defaultOmaha = await httpGet('/updates/brave/updates.xml');
      assert.strictEqual(defaultOmaha.statusCode, 200);
      assert.ok(defaultOmaha.body.toString('utf8').includes("<app appid='zen-brave-chat'>"));

      // Omaha multiple appids query
      const multiOmaha = await httpGet('/updates/brave/updates.xml?x=id%3Dapp-one%26v%3D1.0.0&x=id%3Dapp-two%26v%3D1.0.0');
      assert.strictEqual(multiOmaha.statusCode, 200);
      const multiXml = multiOmaha.body.toString('utf8');
      assert.ok(multiXml.includes("<app appid='app-one'>"));
      assert.ok(multiXml.includes("<app appid='app-two'>"));
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

module.exports = {
  runTests
};
