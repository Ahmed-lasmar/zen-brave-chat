const http = require('http');
const { WebSocketServer } = require('./websocket');
const { RoomManager } = require('./rooms');

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

    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name: 'Zen & Brave Link & Chat Relay Server',
        version: '1.0.0',
        status: 'running',
        wsEndpoint: 'ws://' + (req.headers.host || 'localhost:3000'),
        stats: roomManager.getStats()
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
