const assert = require('assert');
const path = require('path');
const fs = require('fs');
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
