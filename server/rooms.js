const fs = require('fs');
const path = require('path');

class RoomManager {
  constructor(options = {}) {
    this.storagePath = options.storagePath || path.join(__dirname, 'data', 'offline-messages.json');
    this.rooms = new Map();
    this.peerToRoom = new Map(); // ws -> { roomId, peerId }
    this.maxQueueSize = options.maxQueueSize || 200;
    this.autoSave = options.autoSave !== false;

    this._ensureStorageDir();
    this._loadStorage();
  }

  _ensureStorageDir() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (e) {
      // Storage directory warning ignored
    }
  }

  _loadStorage() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const data = JSON.parse(raw);
        for (const [roomId, roomData] of Object.entries(data)) {
          this.rooms.set(roomId, {
            id: roomId,
            peers: new Map(),
            messageQueue: Array.isArray(roomData.messageQueue) ? roomData.messageQueue : [],
            createdAt: roomData.createdAt || Date.now(),
            lastActivity: roomData.lastActivity || Date.now()
          });
        }
      }
    } catch (err) {
      // Failed to load existing room storage; start clean
    }
  }

  saveStorage() {
    if (!this.autoSave) return;
    try {
      this._ensureStorageDir();
      const exportData = {};
      for (const [roomId, room] of this.rooms.entries()) {
        exportData[roomId] = {
          id: room.id,
          createdAt: room.createdAt,
          lastActivity: room.lastActivity,
          messageQueue: room.messageQueue.slice(-this.maxQueueSize)
        };
      }
      fs.writeFileSync(this.storagePath, JSON.stringify(exportData, null, 2), 'utf8');
    } catch (err) {
      // Error writing storage
    }
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'ZEN-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  getOrCreateRoom(roomId) {
    const normalized = (roomId || this.generateRoomCode()).trim().toUpperCase();
    if (!this.rooms.has(normalized)) {
      this.rooms.set(normalized, {
        id: normalized,
        peers: new Map(),
        messageQueue: [],
        createdAt: Date.now(),
        lastActivity: Date.now()
      });
      this.saveStorage();
    }
    return this.rooms.get(normalized);
  }

  handleConnection(ws) {
    ws.on('message', (data) => {
      let message;
      try {
        message = typeof data === 'string' ? JSON.parse(data) : JSON.parse(data.toString('utf8'));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON payload' }));
        return;
      }

      this.processMessage(ws, message);
    });

    ws.on('close', () => {
      this.handleDisconnect(ws);
    });
  }

  processMessage(ws, message) {
    const { type } = message;

    switch (type) {
      case 'create-room': {
        const room = this.getOrCreateRoom(message.roomId);
        ws.send({
          type: 'room-created',
          roomId: room.id
        });
        break;
      }

      case 'join-room': {
        const roomId = (message.roomId || '').trim().toUpperCase();
        if (!roomId) {
          ws.send({ type: 'error', error: 'Room ID is required' });
          return;
        }

        // Clean up prior room membership if this socket was already in a room
        if (this.peerToRoom.has(ws)) {
          this.handleDisconnect(ws);
        }

        const room = this.getOrCreateRoom(roomId);
        const peerId = message.peerId || `peer-${Math.random().toString(36).substring(2, 9)}`;
        const peerName = message.name || 'Anonymous';
        const browser = message.browser || 'Unknown';

        // Register peer
        const peer = {
          id: peerId,
          name: peerName,
          browser: browser,
          ws: ws,
          joinedAt: Date.now(),
          lastSeen: Date.now()
        };

        room.peers.set(peerId, peer);
        this.peerToRoom.set(ws, { roomId: room.id, peerId });
        room.lastActivity = Date.now();

        // Get list of other peers currently in room
        const activePeers = [];
        for (const [id, p] of room.peers.entries()) {
          if (id !== peerId) {
            activePeers.push({ id: p.id, name: p.name, browser: p.browser });
          }
        }

        // Notify joining peer of success, active peers, and offline history queue
        ws.send({
          type: 'room-joined',
          roomId: room.id,
          peerId: peerId,
          peers: activePeers,
          history: room.messageQueue
        });

        // Notify other peers that a new peer joined
        this.broadcastToRoom(room.id, {
          type: 'peer-joined',
          roomId: room.id,
          peer: { id: peerId, name: peerName, browser: browser }
        }, peerId);

        break;
      }

      case 'signal': {
        const { roomId, senderId, targetPeerId, payload } = message;
        if (!roomId || !targetPeerId) return;

        const room = this.rooms.get(roomId.toUpperCase());
        if (!room) return;

        const target = room.peers.get(targetPeerId);
        if (target && target.ws) {
          target.ws.send({
            type: 'signal',
            roomId: room.id,
            senderId: senderId,
            payload: payload
          });
        }
        break;
      }

      case 'relay-message': {
        const roomId = (message.roomId || '').trim().toUpperCase();
        const room = this.rooms.get(roomId);
        if (!room) {
          ws.send({ type: 'error', error: 'Room not found' });
          return;
        }

        const peerRecord = this.peerToRoom.get(ws);
        const registeredPeer = peerRecord ? room.peers.get(peerRecord.peerId) : null;
        const msgPayload = message.payload || {};
        const senderId = message.senderId || msgPayload.senderId || (peerRecord ? peerRecord.peerId : 'unknown');
        const senderName = msgPayload.senderName || (registeredPeer ? registeredPeer.name : 'Friend');

        // Handle emoji reaction directly if message payload type is reaction
        if (msgPayload.type === 'reaction') {
          const targetId = msgPayload.targetMessageId || msgPayload.targetId;
          const emoji = msgPayload.emoji;
          if (targetId && emoji) {
            let targetReactions = {};
            const target = room.messageQueue.find(m => m.id === targetId);
            const senderKey = senderName || senderId;

            if (target) {
              target.reactions = target.reactions || {};
              target.reactions[emoji] = target.reactions[emoji] || [];
              const idx = target.reactions[emoji].indexOf(senderKey);
              if (idx >= 0) {
                target.reactions[emoji].splice(idx, 1);
                if (target.reactions[emoji].length === 0) {
                  delete target.reactions[emoji];
                }
              } else {
                target.reactions[emoji].push(senderKey);
              }
              targetReactions = target.reactions;
              room.lastActivity = Date.now();
              this.saveStorage();
            }

            // Broadcast reaction update to all peers in room
            this.broadcastToRoom(room.id, {
              type: 'message-reaction',
              roomId: room.id,
              targetMessageId: targetId,
              reactions: targetReactions,
              emoji: emoji,
              senderId: senderId,
              senderName: senderKey
            });

            ws.send({
              type: 'ack',
              messageId: targetId,
              timestamp: Date.now()
            });
            break;
          }
        }

        const storedMessage = {
          ...msgPayload,
          id: msgPayload.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          type: msgPayload.type || 'text',
          text: msgPayload.text || '',
          url: msgPayload.url || (msgPayload.link ? msgPayload.link.url : null),
          title: msgPayload.title || (msgPayload.link ? msgPayload.link.title : null),
          domain: msgPayload.domain || (msgPayload.link ? msgPayload.link.domain : null),
          link: msgPayload.link || (msgPayload.type === 'link' ? {
            url: msgPayload.url,
            title: msgPayload.title,
            domain: msgPayload.domain,
            favIconUrl: msgPayload.favIconUrl
          } : null),
          media: msgPayload.media || null,
          senderId: senderId,
          senderName: senderName,
          browser: msgPayload.browser || (registeredPeer ? registeredPeer.browser : 'unknown'),
          timestamp: msgPayload.timestamp || Date.now(),
          replyTo: msgPayload.replyTo || null,
          reactions: msgPayload.reactions || {}
        };

        // Add to offline queue
        room.messageQueue.push(storedMessage);
        if (room.messageQueue.length > this.maxQueueSize) {
          room.messageQueue.shift();
        }
        room.lastActivity = Date.now();
        this.saveStorage();

        // Broadcast to all other peers in room
        this.broadcastToRoom(room.id, {
          type: 'relayed-message',
          roomId: room.id,
          message: storedMessage
        }, senderId);

        // Acknowledge receipt to sender
        ws.send({
          type: 'ack',
          messageId: storedMessage.id,
          timestamp: storedMessage.timestamp
        });
        break;
      }

      case 'get-history': {
        const roomId = (message.roomId || '').trim().toUpperCase();
        const room = this.rooms.get(roomId);
        if (room) {
          ws.send({
            type: 'history',
            roomId: room.id,
            messages: room.messageQueue
          });
        }
        break;
      }

      case 'leave-room': {
        const record = this.peerToRoom.get(ws);
        this.handleDisconnect(ws);
        try {
          ws.send({ type: 'room-left', roomId: record ? record.roomId : null });
        } catch (_) {}
        break;
      }

      case 'update-username': {
        const peerRecord = this.peerToRoom.get(ws);
        if (!peerRecord) return;

        const room = this.rooms.get(peerRecord.roomId);
        if (!room) return;

        const peer = room.peers.get(peerRecord.peerId);
        const newName = (message.name || '').trim();
        if (peer && newName) {
          const oldName = peer.name;
          peer.name = newName;
          this.broadcastToRoom(room.id, {
            type: 'peer-updated',
            roomId: room.id,
            peer: { id: peer.id, name: peer.name, browser: peer.browser },
            oldName: oldName
          });
          this.saveStorage();
        }
        break;
      }

      case 'ping': {
        ws.send({ type: 'pong', timestamp: Date.now() });
        break;
      }

      default:
        ws.send({ type: 'unknown-type', originalType: type });
    }
  }

  broadcastToRoom(roomId, message, excludePeerId = null) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const [peerId, peer] of room.peers.entries()) {
      if (peerId !== excludePeerId && peer.ws && !peer.ws.isClosed) {
        try {
          peer.ws.send(message);
        } catch (_) {}
      }
    }
  }

  handleDisconnect(ws) {
    const record = this.peerToRoom.get(ws);
    if (!record) return;

    this.peerToRoom.delete(ws);
    const { roomId, peerId } = record;
    const room = this.rooms.get(roomId);
    if (!room) return;

    const peer = room.peers.get(peerId);
    const peerName = peer ? peer.name : 'Unknown';
    room.peers.delete(peerId);

    // Broadcast peer-left to remaining peers
    this.broadcastToRoom(room.id, {
      type: 'peer-left',
      roomId: room.id,
      peerId: peerId,
      name: peerName
    });

    this.saveStorage();
  }

  getStats() {
    let totalPeers = 0;
    const roomsStats = [];
    for (const [id, room] of this.rooms.entries()) {
      totalPeers += room.peers.size;
      roomsStats.push({
        id: room.id,
        peers: room.peers.size,
        queuedMessages: room.messageQueue.length,
        createdAt: room.createdAt,
        lastActivity: room.lastActivity
      });
    }
    return {
      activeRooms: this.rooms.size,
      activePeers: totalPeers,
      rooms: roomsStats
    };
  }
}

module.exports = {
  RoomManager
};
