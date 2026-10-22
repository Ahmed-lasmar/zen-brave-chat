const http = require('http');
const https = require('https');
const crypto = require('crypto');
const EventEmitter = require('events');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_PAYLOAD_SIZE = 50 * 1024 * 1024; // 50MB protection limit

const OPCODES = {
  CONTINUATION: 0x0,
  TEXT: 0x1,
  BINARY: 0x2,
  CLOSE: 0x8,
  PING: 0x9,
  PONG: 0xA
};

class WebSocketConnection extends EventEmitter {
  constructor(socket, isServer = true) {
    super();
    this.socket = socket;
    this.isServer = isServer;
    this.buffer = Buffer.alloc(0);
    this.isClosed = false;
    this.fragmentedOpcode = null;
    this.fragmentedPayloads = [];

    this.socket.on('data', (chunk) => this._onData(chunk));
    this.socket.on('error', (err) => {
      this.emit('error', err);
    });
    this.socket.on('close', () => {
      if (!this.isClosed) {
        this.isClosed = true;
        this.emit('close', 1006, 'Connection dropped');
      }
    });
    this.socket.on('end', () => {
      if (!this.isClosed) {
        this.isClosed = true;
        this.emit('close', 1000, 'Normal closure');
      }
    });
  }

  send(data) {
    if (this.isClosed || this.socket.destroyed) return false;
    let payload;
    let opcode;

    if (typeof data === 'string') {
      opcode = OPCODES.TEXT;
      payload = Buffer.from(data, 'utf8');
    } else if (Buffer.isBuffer(data)) {
      opcode = OPCODES.BINARY;
      payload = data;
    } else if (typeof data === 'object') {
      opcode = OPCODES.TEXT;
      payload = Buffer.from(JSON.stringify(data), 'utf8');
    } else {
      opcode = OPCODES.TEXT;
      payload = Buffer.from(String(data), 'utf8');
    }

    const frame = this._encodeFrame(opcode, payload, !this.isServer);
    try {
      this.socket.write(frame);
      return true;
    } catch (err) {
      this.emit('error', err);
      return false;
    }
  }

  ping(data = '') {
    if (this.isClosed || this.socket.destroyed) return;
    const payload = Buffer.from(data);
    const frame = this._encodeFrame(OPCODES.PING, payload, !this.isServer);
    try {
      this.socket.write(frame);
    } catch (err) {
      this.emit('error', err);
    }
  }

  pong(data = '') {
    if (this.isClosed || this.socket.destroyed) return;
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const frame = this._encodeFrame(OPCODES.PONG, payload, !this.isServer);
    try {
      this.socket.write(frame);
    } catch (err) {
      this.emit('error', err);
    }
  }

  close(code = 1000, reason = '') {
    if (this.isClosed) return;
    this.isClosed = true;
    const reasonBuf = Buffer.from(reason, 'utf8');
    const payload = Buffer.alloc(2 + reasonBuf.length);
    payload.writeUInt16BE(code, 0);
    reasonBuf.copy(payload, 2);

    const frame = this._encodeFrame(OPCODES.CLOSE, payload, !this.isServer);
    try {
      this.socket.write(frame, () => {
        this.socket.end();
      });
    } catch (e) {
      this.socket.destroy();
    }
    this.emit('close', code, reason);
  }

  _encodeFrame(opcode, payload, mask = false) {
    const length = payload.length;
    let headerLen = 2;
    if (length >= 126 && length <= 65535) {
      headerLen += 2;
    } else if (length > 65535) {
      headerLen += 8;
    }
    if (mask) {
      headerLen += 4;
    }

    const header = Buffer.alloc(headerLen);
    header[0] = 0x80 | (opcode & 0x0F); // FIN bit set

    let offset = 1;
    let maskBit = mask ? 0x80 : 0x00;

    if (length <= 125) {
      header[offset++] = maskBit | length;
    } else if (length <= 65535) {
      header[offset++] = maskBit | 126;
      header.writeUInt16BE(length, offset);
      offset += 2;
    } else {
      header[offset++] = maskBit | 127;
      header.writeBigUInt64BE(BigInt(length), offset);
      offset += 8;
    }

    if (mask) {
      const maskKey = crypto.randomBytes(4);
      maskKey.copy(header, offset);
      offset += 4;

      const maskedPayload = Buffer.allocUnsafe(length);
      for (let i = 0; i < length; i++) {
        maskedPayload[i] = payload[i] ^ maskKey[i % 4];
      }
      return Buffer.concat([header, maskedPayload]);
    }

    return Buffer.concat([header, payload]);
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this._parseFrames();
  }

  _parseFrames() {
    while (this.buffer.length >= 2) {
      const byte0 = this.buffer[0];
      const byte1 = this.buffer[1];

      const fin = (byte0 & 0x80) !== 0;
      const opcode = byte0 & 0x0F;
      const masked = (byte1 & 0x80) !== 0;
      let payloadLen = byte1 & 0x7F;
      let headerLen = 2;

      if (payloadLen === 126) {
        if (this.buffer.length < 4) return;
        payloadLen = this.buffer.readUInt16BE(2);
        headerLen += 2;
      } else if (payloadLen === 127) {
        if (this.buffer.length < 10) return;
        payloadLen = Number(this.buffer.readBigUInt64BE(2));
        headerLen += 8;
      }

      if (payloadLen > MAX_PAYLOAD_SIZE) {
        this.close(1009, 'Message too big');
        return;
      }

      let maskKey = null;
      if (masked) {
        if (this.buffer.length < headerLen + 4) return;
        maskKey = this.buffer.slice(headerLen, headerLen + 4);
        headerLen += 4;
      }

      if (this.buffer.length < headerLen + payloadLen) {
        // Wait for more data
        return;
      }

      let payload = this.buffer.slice(headerLen, headerLen + payloadLen);
      this.buffer = this.buffer.slice(headerLen + payloadLen);

      if (masked && maskKey) {
        const unmasked = Buffer.allocUnsafe(payloadLen);
        for (let i = 0; i < payloadLen; i++) {
          unmasked[i] = payload[i] ^ maskKey[i % 4];
        }
        payload = unmasked;
      }

      this._handleFrame(fin, opcode, payload);
    }
  }

  _handleFrame(fin, opcode, payload) {
    if (opcode === OPCODES.PING) {
      this.pong(payload);
      return;
    }
    if (opcode === OPCODES.PONG) {
      this.emit('pong', payload);
      return;
    }
    if (opcode === OPCODES.CLOSE) {
      let code = 1000;
      let reason = '';
      if (payload.length >= 2) {
        code = payload.readUInt16BE(0);
        reason = payload.slice(2).toString('utf8');
      }
      this.close(code, reason);
      return;
    }

    if (opcode === OPCODES.CONTINUATION) {
      this.fragmentedPayloads.push(payload);
      if (fin) {
        const fullPayload = Buffer.concat(this.fragmentedPayloads);
        const resolvedOpcode = this.fragmentedOpcode;
        this.fragmentedPayloads = [];
        this.fragmentedOpcode = null;
        this._dispatchMessage(resolvedOpcode, fullPayload);
      }
      return;
    }

    if (!fin) {
      this.fragmentedOpcode = opcode;
      this.fragmentedPayloads = [payload];
      return;
    }

    this._dispatchMessage(opcode, payload);
  }

  _dispatchMessage(opcode, payload) {
    if (opcode === OPCODES.TEXT) {
      const text = payload.toString('utf8');
      this.emit('message', text);
    } else if (opcode === OPCODES.BINARY) {
      this.emit('message', payload);
    }
  }
}

class WebSocketServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.server = options.server || null;
    this.clients = new Set();
    this.heartbeatInterval = options.heartbeatInterval || 30000;

    if (this.server) {
      this._attachServer(this.server);
    }

    if (this.heartbeatInterval > 0) {
      this.heartbeatTimer = setInterval(() => {
        for (const ws of this.clients) {
          if (ws.isAlive === false) {
            ws.close(1001, 'Heartbeat timeout');
            this.clients.delete(ws);
          } else {
            ws.isAlive = false;
            ws.ping();
          }
        }
      }, this.heartbeatInterval);
      if (this.heartbeatTimer.unref) {
        this.heartbeatTimer.unref();
      }
    }
  }

  _attachServer(server) {
    server.on('upgrade', (req, socket, head) => {
      this._handleUpgrade(req, socket, head);
    });
  }

  _handleUpgrade(req, socket, head) {
    const upgradeHeader = req.headers['upgrade'];
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      socket.destroy();
      return;
    }

    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const acceptKey = crypto
      .createHash('sha1')
      .update(key + WS_GUID)
      .digest('base64');

    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '\r\n'
    ];

    socket.write(headers.join('\r\n'));

    const ws = new WebSocketConnection(socket, true);
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    this.clients.add(ws);

    ws.on('close', () => {
      this.clients.delete(ws);
    });

    if (head && head.length > 0) {
      ws._onData(head);
    }

    this.emit('connection', ws, req);
  }

  close() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const ws of this.clients) {
      ws.close(1001, 'Server shutting down');
    }
    this.clients.clear();
  }
}

function connectWebSocket(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isSecure = parsed.protocol === 'https:' || parsed.protocol === 'wss:';
    const clientModule = isSecure ? https : http;
    const key = crypto.randomBytes(16).toString('base64');
    const port = parsed.port || (isSecure ? 443 : 80);

    const req = clientModule.request({
      hostname: parsed.hostname,
      port: port,
      path: parsed.pathname + parsed.search,
      headers: {
        'Connection': 'Upgrade',
        'Upgrade': 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
        'Host': `${parsed.hostname}:${port}`
      }
    });

    req.on('upgrade', (res, socket, head) => {
      const ws = new WebSocketConnection(socket, false);
      if (head && head.length > 0) {
        ws._onData(head);
      }
      resolve(ws);
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

module.exports = {
  WebSocketConnection,
  WebSocketServer,
  connectWebSocket,
  OPCODES
};
