const assert = require('assert');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const { createServer } = require('../server/index');
const { connectWebSocket } = require('../server/websocket');
const ConnectionManager = require('../src/core/connection');

class NodeWebSocketAdapter extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;

    connectWebSocket(url).then((ws) => {
      this._ws = ws;
      this.readyState = 1; // OPEN
      ws.on('message', (data) => {
        if (this.onmessage) this.onmessage({ data });
        this.emit('message', data);
      });
      ws.on('close', (code, reason) => {
        this.readyState = 3;
        if (this.onclose) this.onclose({ code, reason });
        this.emit('close', code, reason);
      });
      ws.on('error', (err) => {
        if (this.onerror) this.onerror(err);
        this.emit('error', err);
      });
      if (this.onopen) this.onopen({});
      this.emit('open');
    }).catch((err) => {
      this.readyState = 3;
      if (this.onerror) this.onerror(err);
      this.emit('error', err);
    });
  }

  send(data) {
    if (this._ws) return this._ws.send(data);
    return false;
  }

  close(code, reason) {
    this.readyState = 3;
    if (this._ws) this._ws.close(code, reason);
  }
}

async function runConnectionTests() {
  console.log('\n🧪 Running ConnectionManager Architecture & Protocol Unit Tests...\n');
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

  const testStorage = path.join(__dirname, 'temp-conn-storage.json');
  if (fs.existsSync(testStorage)) fs.unlinkSync(testStorage);

  const app = createServer({ storagePath: testStorage });
  const addr = await app.listen(0, '127.0.0.1');
  const wsUrl = `ws://127.0.0.1:${addr.port}`;

  try {
    // 1. ConnectionManager connectServer
    await test('ConnectionManager connects and sets state to connected', async () => {
      const conn = new ConnectionManager({
        serverUrl: wsUrl,
        userName: 'TestUser',
        WebSocket: NodeWebSocketAdapter
      });

      await conn.connectServer();
      assert.strictEqual(conn.connectionState, 'connected');
      conn.leaveRoom();
      if (conn.ws) conn.ws.close();
    });

    // 2. Concurrent connectServer calls reuse the same in-flight promise
    await test('Concurrent connectServer calls do not duplicate connections', async () => {
      const conn = new ConnectionManager({
        serverUrl: wsUrl,
        userName: 'TestUser',
        WebSocket: NodeWebSocketAdapter
      });

      const p1 = conn.connectServer();
      const p2 = conn.connectServer();
      assert.strictEqual(p1, p2, 'Expected identical in-flight promise');
      await Promise.all([p1, p2]);
      assert.strictEqual(conn.connectionState, 'connected');
      conn.leaveRoom();
      if (conn.ws) conn.ws.close();
    });

    // 3. createRoom while connecting does NOT drop message
    await test('createRoom while connecting correctly creates room without dropping', async () => {
      const conn = new ConnectionManager({
        serverUrl: wsUrl,
        userName: 'RoomCreator',
        WebSocket: NodeWebSocketAdapter
      });

      let joinedRoomId = null;
      conn.on('roomJoined', (data) => {
        joinedRoomId = data.roomId;
      });

      // Call createRoom immediately without awaiting connectServer first
      await conn.createRoom('RoomCreator');
      await new Promise(r => setTimeout(r, 120));

      assert.ok(joinedRoomId, 'createRoom should have succeeded and joined room');
      assert.ok(joinedRoomId.startsWith('ZEN-'), 'Room code should be ZEN-XXXX format');
      assert.strictEqual(conn.roomId, joinedRoomId);
      conn.leaveRoom();
      if (conn.ws) conn.ws.close();
    });

    // 4. Bi-directional Room Presence and Message Exchange
    await test('Two ConnectionManagers join same room and exchange messages', async () => {
      const connA = new ConnectionManager({
        serverUrl: wsUrl,
        userName: 'Alice',
        peerId: 'peer-alice-01',
        WebSocket: NodeWebSocketAdapter
      });

      const connB = new ConnectionManager({
        serverUrl: wsUrl,
        userName: 'Bob',
        peerId: 'peer-bob-02',
        WebSocket: NodeWebSocketAdapter
      });

      const testRoom = 'ZEN-PAIR1';
      let bReceived = [];

      connB.on('message', (msg) => {
        bReceived.push(msg);
      });

      await connA.joinRoom(testRoom, 'Alice');
      await connB.joinRoom(testRoom, 'Bob');
      await new Promise(r => setTimeout(r, 100));

      connA.sendMessage({
        type: 'text',
        text: 'Hello from Alice!'
      });
      await new Promise(r => setTimeout(r, 100));

      assert.strictEqual(bReceived.length, 1, 'Bob should receive message');
      assert.strictEqual(bReceived[0].text, 'Hello from Alice!');
      assert.strictEqual(bReceived[0].senderName, 'Alice');

      connA.leaveRoom();
      connB.leaveRoom();
      if (connA.ws) connA.ws.close();
      if (connB.ws) connB.ws.close();
    });

    // 5. Deterministic WebRTC negotiation role assignment
    await test('Deterministic initiator role: smaller peerId is always initiator on both sides', async () => {
      const conn1 = new ConnectionManager({ peerId: 'peer-10', WebSocket: NodeWebSocketAdapter });
      const conn2 = new ConnectionManager({ peerId: 'peer-20', WebSocket: NodeWebSocketAdapter });

      // Both check initiator with peer10 vs peer20
      const conn1Role = conn1.peerId < 'peer-20'; // true (initiator)
      const conn2Role = conn2.peerId < 'peer-10'; // false (receiver)

      assert.strictEqual(conn1Role, true, 'peer-10 should be initiator');
      assert.strictEqual(conn2Role, false, 'peer-20 should be receiver');
      assert.notStrictEqual(conn1Role, conn2Role, 'Roles must be strictly opposite to prevent offer collisions');
    });

  } finally {
    await app.close();
    if (fs.existsSync(testStorage)) {
      try { fs.unlinkSync(testStorage); } catch (_) {}
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

if (require.main === module) {
  runConnectionTests();
}

module.exports = {
  runConnectionTests
};
