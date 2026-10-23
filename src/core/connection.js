/**
 * Hybrid Connection Manager: WebRTC DataChannel (Direct P2P) + WebSocket Relay Fallback
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const BrowserAPI = require('./browser-api');
    module.exports = factory(BrowserAPI);
  } else {
    root.ConnectionManager = factory(root.BrowserAPI);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (BrowserAPI) {
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ];

  const CHUNK_SIZE = 32000; // Safe chunk size for RTCDataChannel

  class ConnectionManager {
    constructor(options = {}) {
      this.serverUrl = options.serverUrl || 'wss://zenbrave.myapps.tn';
      this.userName = options.userName || 'Anonymous';
      this.peerId = options.peerId || ('peer-' + Math.random().toString(36).substring(2, 9));
      this.roomId = null;
      this.ws = null;
      this.customWebSocket = options.WebSocket || null;

      // WebRTC peer connection
      this.peerConnection = null;
      this.dataChannel = null;
      this.remotePeerId = null;
      this.pendingIceCandidates = [];
      this.connectionMode = 'disconnected'; // 'disconnected' | 'relay' | 'p2p'
      this.connectionState = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'

      // Incoming chunk reassembler: transferId -> { chunks: [], total: num, meta: {} }
      this.chunkBuffers = new Map();

      // Event handlers
      this.handlers = {
        statusChange: [],
        message: [],
        reaction: [],
        peerJoined: [],
        peerLeft: [],
        peerUpdated: [],
        roomJoined: [],
        error: []
      };

      this.reconnectAttempts = 0;
      this.maxReconnectAttempts = 8;
      this.reconnectTimer = null;
      this.intentionalClose = false;
      this.connectPromise = null;
      this._isReconnecting = false;
    }

    on(event, cb) {
      if (this.handlers[event]) {
        this.handlers[event].push(cb);
      }
    }

    emit(event, ...args) {
      if (this.handlers[event]) {
        for (const cb of this.handlers[event]) {
          try {
            cb(...args);
          } catch (e) {
            console.error(`Error in event handler for ${event}:`, e);
          }
        }
      }
    }

    _updateState(state, mode, error = null) {
      this.connectionState = state;
      if (mode) this.connectionMode = mode;
      this.emit('statusChange', {
        state: this.connectionState,
        mode: this.connectionMode,
        roomId: this.roomId,
        peerId: this.peerId,
        remotePeerId: this.remotePeerId,
        error: error
      });
    }

    connectServer(customUrl) {
      if (customUrl && customUrl !== this.serverUrl) {
        this.serverUrl = customUrl;
        if (this.ws) {
          try { this.ws.close(); } catch (_) {}
          this.ws = null;
        }
        this.connectPromise = null;
      }

      if (this.ws && this.ws.readyState === 1) {
        return Promise.resolve();
      }

      if (this.connectPromise) {
        return this.connectPromise;
      }

      this._updateState('connecting', 'disconnected');

      this.connectPromise = new Promise((resolve, reject) => {
        try {
          const WSConstructor = this.customWebSocket || (typeof WebSocket !== 'undefined'
            ? WebSocket
            : (typeof globalThis !== 'undefined' && globalThis.WebSocket));

          if (!WSConstructor) {
            const err = new Error('WebSocket is not supported in this runtime');
            this.connectPromise = null;
            this._updateState('disconnected', 'disconnected', err.message);
            return reject(err);
          }

          this.ws = new WSConstructor(this.serverUrl);

          this.ws.onopen = () => {
            this.connectPromise = null;
            this.reconnectAttempts = 0;
            if (this.roomId && this._isReconnecting) {
              this._isReconnecting = false;
              this._sendJoinRoom();
              this._updateState('connected', 'relay');
            } else {
              this._updateState('connected', this.roomId ? 'relay' : 'disconnected');
            }
            resolve();
          };

          this.ws.onmessage = (event) => {
            this._handleWsMessage(event.data);
          };

          this.ws.onerror = (err) => {
            if (this.connectPromise) {
              this.connectPromise = null;
              reject(err);
            }
            this.emit('error', err);
          };

          this.ws.onclose = () => {
            this.connectPromise = null;
            this._cleanupP2P();
            this._updateState('disconnected', 'disconnected');
            if (!this.intentionalClose && this.roomId) {
              this._scheduleReconnect();
            }
          };
        } catch (err) {
          this.connectPromise = null;
          this._updateState('disconnected', 'disconnected', err.message);
          reject(err);
        }
      });

      return this.connectPromise;
    }

    _scheduleReconnect() {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

      const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 15000);
      this.reconnectAttempts++;
      this._isReconnecting = true;

      this.reconnectTimer = setTimeout(() => {
        if (!this.intentionalClose && this.roomId) {
          this.connectServer().catch(() => {});
        }
      }, delay);
    }

    joinRoom(roomId, userName) {
      this.intentionalClose = false;
      this._isReconnecting = false;
      this.roomId = (roomId || '').trim().toUpperCase();
      if (userName) this.userName = userName;

      return this.connectServer().then(() => {
        this._sendJoinRoom();
      });
    }

    createRoom(userName) {
      this.intentionalClose = false;
      if (userName) this.userName = userName;
      return this.connectServer().then(() => {
        this._sendWs({
          type: 'create-room',
          peerId: this.peerId,
          name: this.userName
        });
      });
    }

    updateUserName(newName) {
      if (!newName) return;
      this.userName = newName.trim();
      if (this.ws && this.ws.readyState === 1 && this.roomId) {
        this._sendWs({
          type: 'update-username',
          roomId: this.roomId,
          peerId: this.peerId,
          name: this.userName
        });
      }
    }

    leaveRoom() {
      this.intentionalClose = true;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (this.roomId) {
        this._sendWs({
          type: 'leave-room',
          roomId: this.roomId,
          peerId: this.peerId
        });
      }
      this.roomId = null;
      this.remotePeerId = null;
      this._cleanupP2P();
      this._updateState('disconnected', 'disconnected');
    }

    _sendJoinRoom() {
      this._sendWs({
        type: 'join-room',
        roomId: this.roomId,
        peerId: this.peerId,
        name: this.userName,
        browser: BrowserAPI.detectBrowserName()
      });
    }

    _sendWs(obj) {
      if (this.ws && this.ws.readyState === 1) {
        this.ws.send(JSON.stringify(obj));
        return true;
      }
      return false;
    }

    _handleWsMessage(rawData) {
      let msg;
      try {
        msg = typeof rawData === 'string' ? JSON.parse(rawData) : JSON.parse(new TextDecoder().decode(rawData));
      } catch (e) {
        return;
      }

      switch (msg.type) {
        case 'room-created': {
          this.roomId = msg.roomId;
          this.joinRoom(msg.roomId);
          break;
        }

        case 'room-joined': {
          this.roomId = msg.roomId;
          this.peerId = msg.peerId;
          this._updateState('connected', 'relay');

          this.emit('roomJoined', {
            roomId: msg.roomId,
            peerId: msg.peerId,
            peers: msg.peers || [],
            history: msg.history || []
          });

          // If there are other peers already in the room, negotiate WebRTC deterministically
          if (msg.peers && msg.peers.length > 0) {
            const peer = msg.peers[0];
            this.remotePeerId = peer.id;
            const isInitiator = this.peerId < peer.id;
            this._setupPeerConnection(peer.id, isInitiator);
          }
          break;
        }

        case 'peer-joined': {
          this.remotePeerId = msg.peer.id;
          this.emit('peerJoined', msg.peer);

          // Deterministic initiator: peer with lexicographically smaller ID initiates
          const isInitiator = this.peerId < msg.peer.id;
          this._setupPeerConnection(msg.peer.id, isInitiator);
          break;
        }

        case 'peer-left': {
          if (this.remotePeerId === msg.peerId) {
            this._cleanupP2P();
            this.remotePeerId = null;
            this._updateState('connected', 'relay');
          }
          this.emit('peerLeft', msg);
          break;
        }

        case 'peer-updated': {
          this.emit('peerUpdated', {
            peer: msg.peer,
            oldName: msg.oldName
          });
          break;
        }

        case 'signal': {
          this._handleRemoteSignal(msg.senderId, msg.payload);
          break;
        }

        case 'relayed-message': {
          this.emit('message', msg.message);
          break;
        }

        case 'message-reaction': {
          this.emit('reaction', {
            targetMessageId: msg.targetMessageId,
            reactions: msg.reactions,
            emoji: msg.emoji,
            senderId: msg.senderId,
            senderName: msg.senderName
          });
          break;
        }

        case 'history': {
          if (Array.isArray(msg.messages)) {
            for (const m of msg.messages) {
              this.emit('message', m);
            }
          }
          break;
        }

        case 'error': {
          this.emit('error', msg.error);
          break;
        }
      }
    }

    _setupPeerConnection(targetPeerId, isInitiator) {
      if (typeof RTCPeerConnection === 'undefined') {
        // Environment does not support WebRTC (e.g. headless without RTC), stay on relay
        this._updateState('connected', 'relay');
        return;
      }

      this._cleanupP2P();
      this.remotePeerId = targetPeerId;

      try {
        this.peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

        this.peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            this._sendWs({
              type: 'signal',
              roomId: this.roomId,
              senderId: this.peerId,
              targetPeerId: targetPeerId,
              payload: { candidate: event.candidate }
            });
          }
        };

        this.peerConnection.onconnectionstatechange = () => {
          if (this.peerConnection) {
            const state = this.peerConnection.connectionState;
            if (state === 'connected') {
              this._updateState('connected', 'p2p');
            } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
              this._updateState('connected', 'relay');
            }
          }
        };

        if (isInitiator) {
          const dc = this.peerConnection.createDataChannel('chat', { ordered: true });
          this._bindDataChannel(dc);

          this.peerConnection.createOffer().then((offer) => {
            return this.peerConnection.setLocalDescription(offer);
          }).then(() => {
            this._sendWs({
              type: 'signal',
              roomId: this.roomId,
              senderId: this.peerId,
              targetPeerId: targetPeerId,
              payload: { sdp: this.peerConnection.localDescription }
            });
          }).catch((err) => {
            this._updateState('connected', 'relay');
          });
        } else {
          this.peerConnection.ondatachannel = (event) => {
            this._bindDataChannel(event.channel);
          };
        }
      } catch (err) {
        this._updateState('connected', 'relay');
      }
    }

    _bindDataChannel(dc) {
      this.dataChannel = dc;

      dc.onopen = () => {
        this._updateState('connected', 'p2p');
      };

      dc.onclose = () => {
        this._updateState('connected', 'relay');
      };

      dc.onerror = () => {
        this._updateState('connected', 'relay');
      };

      dc.onmessage = (event) => {
        this._handleDataChannelMessage(event.data);
      };
    }

    _cleanupP2P() {
      this.pendingIceCandidates = [];
      if (this.dataChannel) {
        try { this.dataChannel.close(); } catch (_) {}
        this.dataChannel = null;
      }
      if (this.peerConnection) {
        try { this.peerConnection.close(); } catch (_) {}
        this.peerConnection = null;
      }
    }

    async _handleRemoteSignal(senderId, payload) {
      if (!this.peerConnection) {
        this._setupPeerConnection(senderId, false);
      }
      if (!this.peerConnection) return;

      try {
        if (payload.sdp) {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          if (payload.sdp.type === 'offer') {
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            this._sendWs({
              type: 'signal',
              roomId: this.roomId,
              senderId: this.peerId,
              targetPeerId: senderId,
              payload: { sdp: this.peerConnection.localDescription }
            });
          }

          // Drain queued ICE candidates received before remoteDescription was set
          if (this.pendingIceCandidates && this.pendingIceCandidates.length > 0) {
            for (const cand of this.pendingIceCandidates) {
              try {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
              } catch (_) {}
            }
            this.pendingIceCandidates = [];
          }
        } else if (payload.candidate) {
          if (this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } else {
            this.pendingIceCandidates.push(payload.candidate);
          }
        }
      } catch (err) {
        // Signaling negotiation error, fallback to relay
        this._updateState('connected', 'relay');
      }
    }

    _handleDataChannelMessage(rawData) {
      let parsed;
      try {
        parsed = JSON.parse(rawData);
      } catch (e) {
        return;
      }

      if (parsed.envelope === 'direct') {
        this.emit('message', parsed.payload);
      } else if (parsed.envelope === 'chunk-start') {
        this.chunkBuffers.set(parsed.id, {
          totalChunks: parsed.totalChunks,
          receivedChunks: new Array(parsed.totalChunks),
          receivedCount: 0,
          timestamp: Date.now()
        });
      } else if (parsed.envelope === 'chunk') {
        const buf = this.chunkBuffers.get(parsed.id);
        if (buf) {
          if (buf.receivedChunks[parsed.index] === undefined) {
            buf.receivedChunks[parsed.index] = parsed.chunk;
            buf.receivedCount++;
          }
          if (buf.receivedCount === buf.totalChunks) {
            const fullString = buf.receivedChunks.join('');
            this.chunkBuffers.delete(parsed.id);
            try {
              const fullPayload = JSON.parse(fullString);
              this.emit('message', fullPayload);
            } catch (err) {}
          }
        }
      }
    }

    sendMessage(payload) {
      const linkData = payload.link || (payload.type === 'link' ? {
        url: payload.url,
        title: payload.title,
        domain: payload.domain,
        favIconUrl: payload.favIconUrl
      } : null);

      const fullMessage = {
        id: payload.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        type: payload.type || 'text',
        text: payload.text || '',
        url: payload.url || (linkData ? linkData.url : null),
        title: payload.title || (linkData ? linkData.title : null),
        domain: payload.domain || (linkData ? linkData.domain : null),
        favIconUrl: payload.favIconUrl || (linkData ? linkData.favIconUrl : null),
        link: linkData,
        media: payload.media || null,
        senderId: this.peerId,
        senderName: this.userName,
        browser: BrowserAPI.detectBrowserName(),
        timestamp: payload.timestamp || Date.now(),
        replyTo: payload.replyTo || null,
        reactions: payload.reactions || {}
      };

      const hasP2P = this.dataChannel && this.dataChannel.readyState === 'open';

      if (hasP2P) {
        const jsonStr = JSON.stringify(fullMessage);
        if (jsonStr.length <= CHUNK_SIZE) {
          try {
            this.dataChannel.send(JSON.stringify({
              envelope: 'direct',
              payload: fullMessage
            }));
            return fullMessage;
          } catch (e) {
            // Failed over P2P, fallback to WebSocket below
          }
        } else {
          // Send in chunks over DataChannel
          try {
            const transferId = 'xfer-' + Math.random().toString(36).substring(2, 9);
            const totalChunks = Math.ceil(jsonStr.length / CHUNK_SIZE);

            this.dataChannel.send(JSON.stringify({
              envelope: 'chunk-start',
              id: transferId,
              totalChunks: totalChunks
            }));

            for (let i = 0; i < totalChunks; i++) {
              const slice = jsonStr.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
              this.dataChannel.send(JSON.stringify({
                envelope: 'chunk',
                id: transferId,
                index: i,
                chunk: slice
              }));
            }
            return fullMessage;
          } catch (e) {
            // Fallback to WebSocket relay below
          }
        }
      }

      // WebSocket relay fallback (guaranteed delivery)
      const sent = this._sendWs({
        type: 'relay-message',
        roomId: this.roomId,
        senderId: this.peerId,
        payload: fullMessage
      });

      if (!sent && !hasP2P) {
        throw new Error('Not connected to room');
      }

      return fullMessage;
    }
  }

  return ConnectionManager;
});
