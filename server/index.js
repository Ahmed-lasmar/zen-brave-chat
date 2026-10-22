const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('./websocket');
const { RoomManager } = require('./rooms');
const { renderLandingPage } = require('./landing');

function createServer(options = {}) {
  const roomManager = new RoomManager(options);

  const server = http.createServer((req, res) => {
    // Enable CORS for testing / web clients
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/health' || url.pathname === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: Date.now(),
        ...roomManager.getStats()
      }));
      return;
    }

    if (url.pathname === '/download/zen') {
      const filePath = path.join(__dirname, '../dist/zen-extension.zip');
      if (fs.existsSync(filePath)) {
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="zen-chat-extension.zip"',
          'Content-Length': fs.statSync(filePath).size
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'zen-extension.zip not found. Run npm run build first.' }));
      return;
    }

    if (url.pathname === '/download/brave') {
      const filePath = path.join(__dirname, '../dist/brave-extension.zip');
      if (fs.existsSync(filePath)) {
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="brave-chat-extension.zip"',
          'Content-Length': fs.statSync(filePath).size
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'brave-extension.zip not found. Run npm run build first.' }));
      return;
    }

    if (url.pathname === '/download/android' || url.pathname === '/download/apk') {
      const filePath = path.join(__dirname, '../dist/zenbrave-chat.apk');
      if (fs.existsSync(filePath)) {
        res.writeHead(200, {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Disposition': 'attachment; filename="zenbrave-chat.apk"',
          'Content-Length': fs.statSync(filePath).size
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'zenbrave-chat.apk not found. Build the Android app first.' }));
      return;
    }

    if (url.pathname === '/api/version' || url.pathname === '/download/version' || url.pathname === '/version.json') {
      const isHttps = req.headers['x-forwarded-proto'] === 'https' ||
                      req.headers['x-forwarded-ssl'] === 'on' ||
                      Boolean(req.socket && req.socket.encrypted);
      const host = req.headers.host || 'zenbrave.myapps.tn';
      const scheme = isHttps ? 'https://' : 'http://';
      const apkPath = path.join(__dirname, '../dist/zenbrave-chat.apk');
      const apkSize = fs.existsSync(apkPath) ? fs.statSync(apkPath).size : 0;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        android: {
          versionCode: 2,
          versionName: '1.0.1',
          releaseDate: '2026-10-22',
          apkSize: apkSize,
          downloadUrl: `${scheme}${host}/download/android`,
          changelog: [
            'Interactive full-screen image viewer with pinch-to-zoom and pan',
            '1-tap save images to Gallery & share to other apps',
            'In-app update check and 1-tap installation',
            'Bug fixes for null text and link cards'
          ]
        },
        server: {
          name: 'Zen & Brave Link & Chat Relay',
          version: '1.0.1',
          uptime: Math.round(process.uptime())
        }
      }, null, 2));
      return;
    }

    if (url.pathname === '/') {
      const isHttps = req.headers['x-forwarded-proto'] === 'https' ||
                      req.headers['x-forwarded-ssl'] === 'on' ||
                      Boolean(req.socket && req.socket.encrypted);
      const wsProto = isHttps ? 'wss://' : 'ws://';
      const host = req.headers.host || 'localhost:3000';
      const wsEndpoint = wsProto + host;

      const wantsHtml = req.headers.accept &&
                        req.headers.accept.includes('text/html') &&
                        !url.searchParams.has('json');

      if (wantsHtml) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderLandingPage(wsEndpoint, roomManager.getStats()));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name: 'Zen & Brave Link & Chat Relay Server',
        version: '1.0.0',
        status: 'running',
        wsEndpoint: wsEndpoint,
        stats: roomManager.getStats(),
        downloads: {
          zen: `https://${host}/download/zen`,
          brave: `https://${host}/download/brave`,
          android: `https://${host}/download/android`
        }
      }, null, 2));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    roomManager.handleConnection(ws);
  });

  return {
    server,
    wss,
    roomManager,
    listen: (port, host) => {
      return new Promise((resolve) => {
        server.listen(port, host, () => {
          const address = server.address();
          resolve(address);
        });
      });
    },
    close: () => {
      return new Promise((resolve) => {
        wss.close();
        server.close(() => {
          resolve();
        });
      });
    }
  };
}

if (require.main === module) {
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';
  const app = createServer();

  app.listen(port, host).then((addr) => {
    console.log(`\n======================================================`);
    console.log(`🚀 Zen & Brave Relay Server listening on http://${host}:${addr.port}`);
    console.log(`📡 WebSocket endpoint ready at ws://${host}:${addr.port}`);
    console.log(`======================================================\n`);
  });

  const shutdown = () => {
    console.log('\nGracefully shutting down...');
    app.close().then(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = {
  createServer
};
