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

async function runEndToEndSimulation() {
  console.log('\n======================================================');
  console.log('🌐 Starting End-to-End Multi-Client Connection Simulation');
  console.log('======================================================\n');

  const testStorage = path.join(__dirname, 'e2e-storage.json');
  if (fs.existsSync(testStorage)) fs.unlinkSync(testStorage);

  const app = createServer({ storagePath: testStorage });
  const addr = await app.listen(0, '127.0.0.1');
  const wsUrl = `ws://127.0.0.1:${addr.port}`;

  console.log(`[E2E] Relay server online at ${wsUrl}`);

  try {
    let createdRoomId = null;

    // 1. Connect Client 1: Zen Browser using ConnectionManager
    console.log('[E2E] Connecting Client 1 (Zen Browser ConnectionManager)...');
    const clientZen = new ConnectionManager({
      serverUrl: wsUrl,
      userName: 'Zen Friend',
      peerId: 'peer-zen-01',
      WebSocket: NodeWebSocketAdapter
    });

    let zenReceivedMessages = [];
    let zenPeersList = [];

    clientZen.on('roomJoined', (data) => {
      createdRoomId = data.roomId;
      console.log(`[Zen Client] Joined room: ${data.roomId}`);
    });

    clientZen.on('peerJoined', (peer) => {
      zenPeersList.push(peer);
      console.log(`[Zen Client] Notification: ${peer.name} joined the room`);
    });

    clientZen.on('peerLeft', (peer) => {
      zenPeersList = zenPeersList.filter(p => p.id !== peer.peerId);
      console.log(`[Zen Client] Notification: ${peer.name || peer.peerId} left the room`);
    });

    clientZen.on('message', (msg) => {
      zenReceivedMessages.push(msg);
      console.log(`[Zen Client] Received ${msg.type} from ${msg.senderName}`);
    });

    await clientZen.createRoom('Zen Friend');
    await new Promise(r => setTimeout(r, 120));

    assert.ok(createdRoomId, 'Zen client should have received created room code');
    assert.ok(createdRoomId.startsWith('ZEN-'), 'Room code should start with ZEN-');

    // 2. Connect Client 2: Brave Browser using ConnectionManager
    console.log('[E2E] Connecting Client 2 (Brave Browser ConnectionManager)...');
    const clientBrave = new ConnectionManager({
      serverUrl: wsUrl,
      userName: 'Brave Friend',
      peerId: 'peer-brave-02',
      WebSocket: NodeWebSocketAdapter
    });

    let braveReceivedMessages = [];
    let braveInitialPeers = [];

    clientBrave.on('roomJoined', (data) => {
      braveInitialPeers = data.peers || [];
      console.log(`[Brave Client] Successfully joined ${data.roomId}, peers: ${braveInitialPeers.length}`);
    });

    clientBrave.on('message', (msg) => {
      braveReceivedMessages.push(msg);
      console.log(`[Brave Client] Received ${msg.type} from ${msg.senderName}`);
    });

    await clientBrave.joinRoom(createdRoomId, 'Brave Friend');
    await new Promise(r => setTimeout(r, 120));

    // Verify presence exchange
    assert.strictEqual(braveInitialPeers.length, 1, 'Brave should see Zen in room');
    assert.strictEqual(braveInitialPeers[0].name, 'Zen Friend');
    assert.strictEqual(zenPeersList.length, 1, 'Zen should see Brave in room');
    assert.strictEqual(zenPeersList[0].name, 'Brave Friend');
    console.log('✅ Step 1: Bi-directional room presence verified');

    // 3. Zen Shares Active Tab Link with Brave
    console.log('[E2E] Zen shares tab link: https://zen-browser.app ...');
    const linkPayload = {
      type: 'link',
      id: 'link-e2e-1',
      url: 'https://zen-browser.app',
      title: 'Zen Browser - The beautiful gecko browser',
      domain: 'zen-browser.app',
      favIconUrl: 'https://zen-browser.app/favicon.ico',
      senderName: 'Zen Friend',
      browser: 'Zen Browser',
      timestamp: Date.now()
    };

    clientZen.sendMessage(linkPayload);
    await new Promise(r => setTimeout(r, 100));

    assert.strictEqual(braveReceivedMessages.length, 1, 'Brave should have received 1 message');
    assert.strictEqual(braveReceivedMessages[0].type, 'link');
    assert.strictEqual(braveReceivedMessages[0].url, 'https://zen-browser.app');
    assert.strictEqual(braveReceivedMessages[0].domain, 'zen-browser.app');
    console.log('✅ Step 2: Tab link card received and verified by Brave');

    // 4. Brave Sends Voice Note / Media Payload to Zen
    console.log('[E2E] Brave sends simulated voice note to Zen...');
    const voicePayload = {
      type: 'voice',
      id: 'voice-e2e-2',
      media: {
        type: 'voice',
        mimeType: 'audio/webm',
        duration: 4,
        size: 1024,
        formattedSize: '1.0 KB',
        data: 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAA='
      },
      senderName: 'Brave Friend',
      browser: 'Brave Browser',
      timestamp: Date.now()
    };

    clientBrave.sendMessage(voicePayload);
    await new Promise(r => setTimeout(r, 100));

    assert.strictEqual(zenReceivedMessages.length, 1, 'Zen should have received 1 message');
    assert.strictEqual(zenReceivedMessages[0].type, 'voice');
    assert.strictEqual(zenReceivedMessages[0].media.duration, 4);
    assert.ok(zenReceivedMessages[0].media.data.startsWith('data:audio/webm'));
    console.log('✅ Step 3: Voice note received and verified by Zen');

    // 5. Brave Disconnects (going offline)
    console.log('[E2E] Brave closes connection (going offline)...');
    clientBrave.leaveRoom();
    if (clientBrave.ws) clientBrave.ws.close();
    await new Promise(r => setTimeout(r, 100));

    assert.strictEqual(zenPeersList.length, 0, 'Zen should register Brave left the room');
    console.log('✅ Step 4: Disconnect presence updated');

    // 6. Zen sends link while Brave is offline
    console.log('[E2E] Zen sends link while Brave is offline...');
    const offlineLink = {
      type: 'link',
      id: 'link-offline-3',
      url: 'https://brave.com/search',
      title: 'Brave Search',
      domain: 'brave.com',
      senderName: 'Zen Friend',
      timestamp: Date.now()
    };

    clientZen.sendMessage(offlineLink);
    await new Promise(r => setTimeout(r, 100));

    // 7. Brave Reconnects and Receives Offline Queued Message
    console.log('[E2E] Brave reconnects and requests room session...');
    const clientBrave2 = new ConnectionManager({
      serverUrl: wsUrl,
      userName: 'Brave Friend',
      peerId: 'peer-brave-02',
      WebSocket: NodeWebSocketAdapter
    });

    let reconnectedHistory = null;
    clientBrave2.on('roomJoined', (data) => {
      reconnectedHistory = data.history;
    });

    await clientBrave2.joinRoom(createdRoomId, 'Brave Friend');
    await new Promise(r => setTimeout(r, 120));

    assert.ok(Array.isArray(reconnectedHistory), 'Brave should receive offline history array');
    const offlineReceived = reconnectedHistory.find(m => m.id === 'link-offline-3');
    assert.ok(offlineReceived, 'Brave should have retrieved the link sent while offline');
    assert.strictEqual(offlineReceived.url, 'https://brave.com/search');
    console.log('✅ Step 5: Offline message queue replayed successfully upon reconnection');

    // 8. Real-Time Custom Username Update & Synchronization
    console.log('[E2E] Brave updates custom display name to "Brave PowerUser"...');
    let zenSawPeerUpdate = null;
    clientZen.on('peerUpdated', (data) => {
      zenSawPeerUpdate = data;
    });

    clientBrave2.updateUserName('Brave PowerUser');
    await new Promise(r => setTimeout(r, 100));

    assert.ok(zenSawPeerUpdate, 'Zen should receive peerUpdated event');
    assert.strictEqual(zenSawPeerUpdate.peer.name, 'Brave PowerUser');
    assert.strictEqual(zenSawPeerUpdate.oldName, 'Brave Friend');
    console.log('✅ Step 6: Custom username synchronized live across peers');

    // 9. Reply to Message by Text / Emoji and Reaction Simulation
    console.log('[E2E] Zen replies to Brave with text and emoji...');
    let braveReceivedReply = null;
    clientBrave2.on('message', (msg) => {
      if (msg.replyTo) {
        braveReceivedReply = msg;
      }
    });

    const replyMessage = {
      id: 'msg-reply-e2e-1',
      type: 'text',
      text: 'Thanks for searching! 👍🔥',
      replyTo: {
        id: 'link-offline-3',
        senderName: 'Brave PowerUser',
        text: 'Brave Search Engine',
        type: 'link'
      },
      timestamp: Date.now()
    };
    clientZen.sendMessage(replyMessage);
    await new Promise(r => setTimeout(r, 120));

    assert.ok(braveReceivedReply, 'Brave should receive quoted reply message');
    assert.strictEqual(braveReceivedReply.text, 'Thanks for searching! 👍🔥');
    assert.strictEqual(braveReceivedReply.replyTo.id, 'link-offline-3');

    // Brave reacts with ❤️ emoji to Zen's reply
    console.log('[E2E] Brave reacts to Zen reply with emoji...');
    let zenReceivedReaction = null;
    clientZen.on('reaction', (data) => {
      zenReceivedReaction = data;
    });

    clientBrave2.sendReaction('msg-reply-e2e-1', '❤️');
    await new Promise(r => setTimeout(r, 120));

    assert.ok(zenReceivedReaction, 'Zen should receive reaction update event');
    assert.strictEqual(zenReceivedReaction.targetMessageId, 'msg-reply-e2e-1');
    assert.strictEqual(zenReceivedReaction.emoji, '❤️');
    console.log('✅ Step 7: Reply by text/emoji and emoji reaction verified across peers');

    clientZen.leaveRoom();
    clientBrave2.leaveRoom();
    if (clientZen.ws) clientZen.ws.close();
    if (clientBrave2.ws) clientBrave2.ws.close();

    console.log('\n======================================================');
    console.log('🎉 End-to-End Simulation COMPLETED SUCCESSFULLY (100% Pass)');
    console.log('======================================================\n');
  } finally {
    await app.close();
    if (fs.existsSync(testStorage)) {
      try { fs.unlinkSync(testStorage); } catch (_) {}
    }
  }
}

if (require.main === module) {
  runEndToEndSimulation().catch((err) => {
    console.error('E2E Simulation failed:', err);
    process.exit(1);
  });
}

module.exports = {
  runEndToEndSimulation
};
