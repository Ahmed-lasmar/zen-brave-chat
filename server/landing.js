function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderLandingPage(wsEndpoint, stats = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zen & Brave Link & Media Chat</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --card-border: #1f293d;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #6366f1;
      --success: #10b981;
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px 20px;
    }
    .container {
      max-width: 860px;
      width: 100%;
    }
    header {
      text-align: center;
      margin-bottom: 40px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 9999px;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: var(--success);
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 16px;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    h1 {
      font-size: 36px;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin-bottom: 12px;
      background: linear-gradient(135deg, #fff 0%, #cbd5e1 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    p.subtitle {
      font-size: 17px;
      color: var(--text-muted);
      max-width: 600px;
      margin: 0 auto;
      line-height: 1.5;
    }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-bottom: 30px;
    }
    @media (max-width: 820px) {
      .cards-grid { grid-template-columns: 1fr; }
    }
    .download-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: transform 0.2s, border-color 0.2s;
    }
    .download-card:hover {
      transform: translateY(-2px);
      border-color: #374151;
    }
    .card-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .card-icon {
      font-size: 28px;
    }
    .card-title {
      font-size: 20px;
      font-weight: 700;
    }
    .card-meta {
      font-size: 13px;
      color: var(--text-muted);
    }
    .steps {
      list-style: none;
      margin: 16px 0 24px 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      font-size: 14px;
      color: #d1d5db;
    }
    .steps li {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      line-height: 1.4;
    }
    .step-num {
      background: #1f2937;
      border: 1px solid #374151;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: bold;
      color: #9ca3af;
      flex-shrink: 0;
      margin-top: 1px;
    }
    code {
      background: #1f2937;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      color: #e5e7eb;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 20px;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      text-decoration: none;
      transition: background 0.2s;
      cursor: pointer;
      border: none;
    }
    .btn-zen {
      background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%);
      color: #fff;
    }
    .btn-zen:hover { background: linear-gradient(135deg, #9333ea 0%, #6d28d9 100%); }
    .btn-brave {
      background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
      color: #fff;
    }
    .btn-brave:hover { background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%); }
    .btn-android {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #fff;
    }
    .btn-android:hover { background: linear-gradient(135deg, #059669 0%, #047857 100%); }
    .how-to {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 30px;
    }
    .how-to h2 {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 16px;
      color: #fff;
    }
    .how-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    @media (max-width: 680px) {
      .how-grid { grid-template-columns: 1fr; }
    }
    .how-item {
      background: #0f172a;
      border: 1px solid #1e293b;
      padding: 16px;
      border-radius: 12px;
    }
    .how-step { font-size: 12px; font-weight: 700; color: var(--accent); margin-bottom: 6px; }
    .how-title { font-size: 15px; font-weight: 600; margin-bottom: 6px; }
    .how-desc { font-size: 13px; color: var(--text-muted); line-height: 1.4; }
    footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 20px;
      border-top: 1px solid var(--card-border);
      font-size: 13px;
      color: var(--text-muted);
    }
    footer a { color: var(--text-muted); text-decoration: none; }
    footer a:hover { color: #fff; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="badge">
        <span class="dot"></span>
        <span>Relay Online: ${escapeHtml(wsEndpoint)}</span>
      </div>
      <h1>Zen & Brave Link & Media Chat</h1>
      <p class="subtitle">Share current browser tabs with 1 click, send instant text messages, record voice notes, and transfer media between friends.</p>
    </header>

    <div class="cards-grid">
      <!-- Zen Card -->
      <div class="download-card">
        <div>
          <div class="card-header">
            <span class="card-icon">🦊</span>
            <div>
              <div class="card-title">Zen Browser / Firefox</div>
              <div class="card-meta">Gecko Engine &bull; Native Sidebar & Popup</div>
            </div>
          </div>
          <ul class="steps">
            <li><span class="step-num">1</span> Click <strong>"Install / Update Add-on (.xpi)"</strong> below</li>
            <li><span class="step-num">2</span> Zen prompts: <strong>"Add Zen &amp; Brave Link &amp; Chat?"</strong></li>
            <li><span class="step-num">3</span> Click <strong>Add</strong> to install or update instantly!</li>
          </ul>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <a href="/download/zen.xpi" class="btn btn-zen">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Install / Update in Zen (.xpi)
          </a>
          <a href="/download/zen" style="text-align: center; font-size: 12px; color: var(--text-muted); text-decoration: none; padding: 4px;">
            or download offline .zip archive
          </a>
        </div>
      </div>

      <!-- Brave Card -->
      <div class="download-card">
        <div>
          <div class="card-header">
            <span class="card-icon">🦁</span>
            <div>
              <div class="card-title">Brave / Chrome</div>
              <div class="card-meta">Chromium Engine &bull; Side Panel & Popup</div>
            </div>
          </div>
          <ul class="steps">
            <li><span class="step-num">1</span> Download the signed <code>.crx</code> package (or zip)</li>
            <li><span class="step-num">2</span> Open <code>brave://extensions</code> &amp; toggle <strong>Developer mode</strong> ON</li>
            <li><span class="step-num">3</span> Drag &amp; drop <code>zen-brave-chat.crx</code> to install, or load unpacked zip</li>
          </ul>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <a href="/download/brave.crx" class="btn btn-brave">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Download Signed CRX (.crx)
          </a>
          <a href="/download/brave" style="text-align: center; font-size: 12px; color: var(--text-muted); text-decoration: none; padding: 4px;">
            or download offline .zip archive
          </a>
        </div>
      </div>

      <!-- Android Card -->
      <div class="download-card">
        <div>
          <div class="card-header">
            <span class="card-icon">📱</span>
            <div>
              <div class="card-title">Android Mobile App</div>
              <div class="card-meta">System Share Target &bull; Mobile Chat &bull; Voice Notes</div>
            </div>
          </div>
          <ul class="steps">
            <li><span class="step-num">1</span> Download & install <code>.apk</code> on your phone</li>
            <li><span class="step-num">2</span> Open YouTube, X/Twitter, Chrome, or TikTok</li>
            <li><span class="step-num">3</span> Tap <strong>"Share"</strong> &amp; choose <strong>Zen &amp; Brave</strong> to beam directly!</li>
          </ul>
        </div>
        <a href="/download/android" class="btn btn-android">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          Download for Android (.apk)
        </a>
      </div>
    </div>

    <!-- How to connect -->
    <div class="how-to">
      <h2>How You and Your Friend Connect (3 Steps)</h2>
      <div class="how-grid">
        <div class="how-item">
          <div class="how-step">STEP 1</div>
          <div class="how-title">Create a Room</div>
          <div class="how-desc">Open the extension, go to the <strong>Connect</strong> tab, and click <strong>Create New Room</strong> to generate a code (e.g. <code>ZEN-8921</code>).</div>
        </div>
        <div class="how-item">
          <div class="how-step">STEP 2</div>
          <div class="how-title">Send Code to Friend</div>
          <div class="how-desc">Send the code to your friend. They enter it in their extension's <strong>Connect</strong> tab and click <strong>Join</strong>.</div>
        </div>
        <div class="how-item">
          <div class="how-step">STEP 3</div>
          <div class="how-title">Share & Chat Instantly</div>
          <div class="how-desc">Both browsers turn green! Click <strong>Share Tab</strong> to send web pages, record voice notes, or chat directly.</div>
        </div>
      </div>
    </div>

    <footer>
      <div>Zen & Brave Link & Media Chat &bull; Relay Server v1.0.3</div>
      <div>
        <a href="https://github.com/Ahmed-lasmar/zen-brave-chat" target="_blank" rel="noopener">GitHub</a> &bull;
        <a href="/?json=1">JSON API Status</a>
      </div>
    </footer>
  </div>
</body>
</html>`;
}

module.exports = {
  renderLandingPage
};
