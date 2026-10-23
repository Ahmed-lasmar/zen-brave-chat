const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { WebSocketServer } = require('./websocket');
const { RoomManager } = require('./rooms');
const { renderLandingPage } = require('./landing');

function getExtensionVersion() {
  try {
    const manifestPath = path.join(__dirname, '../manifest.common.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.version) return manifest.version;
    }
  } catch (_) {}
  try {
    const pkgPath = path.join(__dirname, '../package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.version) return pkg.version;
    }
  } catch (_) {}
  return '1.0.3';
}

function resolveScheme(req, host) {
  const isHttps = req.headers['x-forwarded-proto'] === 'https' ||
                  req.headers['x-forwarded-ssl'] === 'on' ||
                  Boolean(req.socket && req.socket.encrypted) ||
                  (host && host.includes('myapps.tn'));
  return isHttps ? 'https://' : 'http://';
}

function getZenXpiHash() {
  const xpiPath = path.join(__dirname, '../dist/zen.xpi');
  if (fs.existsSync(xpiPath)) {
    return crypto.createHash('sha256').update(fs.readFileSync(xpiPath)).digest('hex');
  }
  const shaPath = path.join(__dirname, '../dist/zen.xpi.sha256');
  if (fs.existsSync(shaPath)) {
    return fs.readFileSync(shaPath, 'utf8').trim();
  }
  return '';
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}


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

    // Mozilla WebExtension Updates (Zen & Firefox about:addons)
    if (url.pathname === '/updates/zen/updates.json') {
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'zenbrave.myapps.tn';
      const scheme = resolveScheme(req, host);
      const hash = getZenXpiHash();
      const extVersion = getExtensionVersion();

      const updateManifest = {
        addons: {
          'zen-brave-chat@antigravity': {
            updates: [
              {
                version: extVersion,
                update_link: `${scheme}${host}/download/zen.xpi`,
                update_hash: hash ? `sha256:${hash}` : undefined,
                applications: {
                  gecko: {
                    strict_min_version: '109.0'
                  }
                }
              }
            ]
          }
        }
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(updateManifest, null, 2));
      return;
    }

    // Direct Zen / Firefox XPInstall download
    if (url.pathname === '/download/zen.xpi' || url.pathname === '/download/xpi') {
      const filePath = path.join(__dirname, '../dist/zen.xpi');
      if (fs.existsSync(filePath)) {
        res.writeHead(200, {
          'Content-Type': 'application/x-xpinstall',
          'Content-Disposition': 'inline; filename="zen-brave-chat.xpi"',
          'Content-Length': fs.statSync(filePath).size
        });
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        fs.createReadStream(filePath).pipe(res);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'zen.xpi not found. Run npm run build first.' }));
      return;
    }

    // Chromium Omaha Update Manifest (Brave / Chrome)
    if (url.pathname === '/updates/brave/updates.xml') {
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'zenbrave.myapps.tn';
      const scheme = resolveScheme(req, host);
      const codebase = `${scheme}${host}/download/brave.crx`;
      const extVersion = getExtensionVersion();

      const appIds = [];
      const xParams = url.searchParams.getAll('x');
      for (const xp of xParams) {
        const match = xp.match(/id=([a-zA-Z0-9_-]+)/);
        if (match) appIds.push(match[1]);
      }
      if (appIds.length === 0) {
        if (url.searchParams.has('id')) {
          appIds.push(url.searchParams.get('id'));
        } else {
          appIds.push('zen-brave-chat');
        }
      }

      const appsXml = appIds.map(appId => `  <app appid='${escapeXml(appId)}'>
    <updatecheck codebase='${codebase}' version='${extVersion}' />
  </app>`).join('\n');

      const xml = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
${appsXml}
</gupdate>\n`;

      res.writeHead(200, { 'Content-Type': 'application/xml; charset=UTF-8' });
      res.end(xml);
      return;
    }

    // Chromium CRX package download
    if (url.pathname === '/download/brave.crx' || url.pathname === '/download/crx') {
      const filePath = path.join(__dirname, '../dist/brave.crx');
      if (fs.existsSync(filePath)) {
        res.writeHead(200, {
          'Content-Type': 'application/x-chrome-extension',
          'Content-Disposition': 'attachment; filename="zen-brave-chat.crx"',
          'Content-Length': fs.statSync(filePath).size
        });
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        fs.createReadStream(filePath).pipe(res);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'brave.crx not found. Run npm run build first.' }));
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
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'zenbrave.myapps.tn';
      const scheme = resolveScheme(req, host);
      const apkPath = path.join(__dirname, '../dist/zenbrave-chat.apk');
      const apkSize = fs.existsSync(apkPath) ? fs.statSync(apkPath).size : 0;
      const xpiHash = getZenXpiHash();
      const extVersion = getExtensionVersion();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        extension: {
          version: extVersion,
          releaseDate: '2026-10-23',
          changelog: [
            'Native in-browser extension updates for Zen Browser, Firefox, and Brave',
            'Self-hosted XPInstall (.xpi) support with direct browser installation',
            'Chromium Omaha update manifest integration',
            'In-extension Settings Update Center with 1-click update action',
            'Interactive update badge notifications and changelog review'
          ],
          zen: {
            version: extVersion,
            xpiUrl: `${scheme}${host}/download/zen.xpi`,
            updateManifestUrl: `${scheme}${host}/updates/zen/updates.json`,
            sha256: xpiHash
          },
          brave: {
            version: extVersion,
            crxUrl: `${scheme}${host}/download/brave.crx`,
            zipUrl: `${scheme}${host}/download/brave`,
            updateManifestUrl: `${scheme}${host}/updates/brave/updates.xml`
          }
        },
        android: {
          versionCode: 4,
          versionName: '1.0.3',
          releaseDate: '2026-10-23',
          apkSize: apkSize,
          downloadUrl: `${scheme}${host}/download/android`,
          changelog: [
            'Custom username selection, persistence, and live presence synchronization',
            'Native Android high-importance notifications with direct chat room routing',
            'Desktop browser notifications for unfocused/minimized extension sidebar',
            'Display custom sender names cleanly across all message bubbles',
            'Fixed header merging with phone status bar, clock, and camera notch',
            'Text area and input controls now follow the keyboard smoothly',
            'Interactive full-screen image viewer with pinch-to-zoom and pan'
          ]
        },
        server: {
          name: 'Zen & Brave Link & Chat Relay',
          version: '1.0.3',
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
        version: '1.0.3',
        status: 'running',
        wsEndpoint: wsEndpoint,
        stats: roomManager.getStats(),
        downloads: {
          zen: `https://${host}/download/zen`,
          zenXpi: `https://${host}/download/zen.xpi`,
          brave: `https://${host}/download/brave`,
          braveCrx: `https://${host}/download/brave.crx`,
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
