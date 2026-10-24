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
  const activeRooms = stats.activeRooms || 0;
  const activePeers = stats.activePeers || 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zen &amp; Brave Link &amp; Media Chat</title>
  <meta name="description" content="Share browser tabs, instant messages, voice notes, and media peer-to-peer between Zen Browser, Brave, and Android.">
  <style>
    :root {
      --bg: #0b0f19;
      --surface-card: #111827;
      --surface-elevated: #162032;
      --surface-code: #172033;
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-strong: #1e293b;
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --accent-zen: #7c3aed;
      --accent-zen-hover: #6d28d9;
      --accent-brave: #ea580c;
      --accent-brave-hover: #c2410c;
      --accent-android: #059669;
      --accent-android-hover: #047857;
      --status-emerald: #10b981;
      --focus-ring: #6366f1;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html {
      color-scheme: dark;
    }

    body {
      background-color: var(--bg);
      color: var(--text-primary);
      font-family: var(--font-sans);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px 20px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }

    .container {
      max-width: 960px;
      width: 100%;
    }

    header {
      text-align: center;
      margin-bottom: 48px;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      border-radius: 9999px;
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.28);
      color: var(--status-emerald);
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 20px;
    }

    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--status-emerald);
      animation: status-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      flex-shrink: 0;
    }

    @keyframes status-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    h1 {
      font-size: clamp(28px, 5vw, 42px);
      font-weight: 800;
      letter-spacing: -0.03em;
      margin-bottom: 14px;
      color: var(--text-primary);
      line-height: 1.15;
    }

    .subtitle {
      font-size: 17px;
      color: var(--text-secondary);
      max-width: 640px;
      margin: 0 auto;
      line-height: 1.6;
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-bottom: 36px;
      align-items: stretch;
    }

    .download-card {
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 16px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
      position: relative;
    }

    .download-card:hover {
      transform: translateY(-2px);
      border-color: rgba(255, 255, 255, 0.16);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
    }

    .download-card.zen-lead {
      border-color: rgba(124, 58, 237, 0.35);
      background: linear-gradient(180deg, rgba(124, 58, 237, 0.05) 0%, var(--surface-card) 30%);
    }

    .download-card.zen-lead:hover {
      border-color: rgba(124, 58, 237, 0.6);
    }

    .card-top {
      margin-bottom: 24px;
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 18px;
    }

    .card-icon-wrap {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: var(--surface-elevated);
      border: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: var(--text-primary);
    }

    .card-icon-wrap.icon-zen {
      color: #a78bfa;
      background: rgba(124, 58, 237, 0.12);
      border-color: rgba(124, 58, 237, 0.25);
    }

    .card-icon-wrap.icon-brave {
      color: #fb923c;
      background: rgba(234, 88, 12, 0.12);
      border-color: rgba(234, 88, 12, 0.25);
    }

    .card-icon-wrap.icon-android {
      color: #34d399;
      background: rgba(5, 150, 105, 0.12);
      border-color: rgba(5, 150, 105, 0.25);
    }

    .card-title {
      font-size: 19px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-primary);
    }

    .card-meta {
      font-size: 13px;
      color: var(--text-secondary);
      margin-top: 2px;
    }

    .steps {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 12px;
      font-size: 14px;
      color: var(--text-secondary);
      margin-top: 8px;
    }

    .steps li {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      line-height: 1.45;
    }

    .step-num {
      background: var(--surface-elevated);
      border: 1px solid var(--border-strong);
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      color: var(--text-secondary);
      flex-shrink: 0;
      margin-top: 2px;
    }

    .code-tag {
      background: var(--surface-code);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-primary);
      word-break: break-all;
    }

    /* Zen Configuration Callout Box */
    .config-callout {
      background: #131d2e;
      border: 1px solid #23354d;
      border-radius: 10px;
      padding: 14px;
      margin-top: 14px;
      font-size: 13px;
    }

    .config-callout-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      color: #93c5fd;
      margin-bottom: 8px;
    }

    .config-callout p {
      color: #cbd5e1;
      font-size: 12px;
      line-height: 1.45;
      margin-bottom: 10px;
    }

    .config-code-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      background: #0b1120;
      border: 1px solid #1e293b;
      border-radius: 6px;
      padding: 6px 10px;
    }

    .config-code-row code {
      font-family: var(--font-mono);
      font-size: 12px;
      color: #f1f5f9;
      word-break: break-all;
    }

    .btn-copy {
      background: #1e293b;
      border: 1px solid #334155;
      color: #e2e8f0;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: background 0.15s, border-color 0.15s;
      flex-shrink: 0;
    }

    .btn-copy:hover {
      background: #334155;
      border-color: #475569;
    }

    .btn-copy:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }

    .card-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 18px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      min-height: 46px;
      padding: 12px 20px;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      text-decoration: none;
      transition: background-color 0.15s ease, transform 0.1s ease;
      cursor: pointer;
      border: none;
      color: var(--text-primary);
      text-align: center;
    }

    .btn:active {
      transform: scale(0.98);
    }

    .btn:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }

    .btn-zen {
      background-color: var(--accent-zen);
    }
    .btn-zen:hover {
      background-color: var(--accent-zen-hover);
    }

    .btn-brave {
      background-color: var(--accent-brave);
    }
    .btn-brave:hover {
      background-color: var(--accent-brave-hover);
    }

    .btn-android {
      background-color: var(--accent-android);
    }
    .btn-android:hover {
      background-color: var(--accent-android-hover);
    }

    .sub-link {
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
      text-decoration: none;
      padding: 4px 8px;
      transition: color 0.15s ease;
      display: inline-block;
    }

    .sub-link:hover {
      color: var(--text-secondary);
      text-decoration: underline;
    }

    .sub-link:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
      border-radius: 4px;
    }

    /* How-to Guide Section */
    .section-guide {
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 16px;
      padding: 32px 28px;
      margin-bottom: 36px;
    }

    .section-guide h2 {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 20px;
      color: var(--text-primary);
    }

    .how-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }

    .how-item {
      background: var(--surface-elevated);
      border: 1px solid var(--border-subtle);
      padding: 20px;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
    }

    .how-step {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #818cf8;
      margin-bottom: 8px;
    }

    .how-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--text-primary);
    }

    .how-desc {
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    /* Capabilities Matrix */
    .capabilities-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 36px;
    }

    .capability-card {
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 18px;
    }

    .capability-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 6px;
    }

    .capability-desc {
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.45;
    }

    footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 24px;
      border-top: 1px solid var(--border-subtle);
      font-size: 13px;
      color: var(--text-muted);
      flex-wrap: wrap;
      gap: 12px;
    }

    footer a {
      color: var(--text-secondary);
      text-decoration: none;
      transition: color 0.15s;
    }

    footer a:hover {
      color: var(--text-primary);
      text-decoration: underline;
    }

    footer a:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
      border-radius: 2px;
    }

    .toast-msg {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1e293b;
      border: 1px solid #334155;
      color: #f8fafc;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      pointer-events: none;
      z-index: 100;
    }

    .toast-msg.show {
      opacity: 1;
      transform: translateY(0);
    }

    @media (max-width: 880px) {
      .cards-grid {
        grid-template-columns: 1fr;
      }
      .how-grid {
        grid-template-columns: 1fr;
      }
      .capabilities-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .pulse-dot {
        animation: none;
      }
      .download-card, .btn, .toast-msg {
        transition: none;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header role="banner">
      <div class="status-badge" role="status">
        <span class="pulse-dot" aria-hidden="true"></span>
        <span>Relay Online: ${escapeHtml(wsEndpoint)} &bull; ${activeRooms} rooms active</span>
      </div>
      <h1>Zen &amp; Brave Link &amp; Media Chat</h1>
      <p class="subtitle">Real-time peer-to-peer browser communication. Beam active tabs, exchange instant messages, record voice clips, and transfer images with zero cloud lock-in.</p>
    </header>

    <main role="main">
      <div class="cards-grid">
        <!-- Zen Browser Card -->
        <article class="download-card zen-lead" aria-labelledby="title-zen">
          <div class="card-top">
            <div class="card-header">
              <div class="card-icon-wrap icon-zen" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                </svg>
              </div>
              <div>
                <h2 id="title-zen" class="card-title">Zen Browser / Firefox</h2>
                <div class="card-meta">Gecko Engine &bull; Sidebar Action &amp; Popup</div>
              </div>
            </div>

            <!-- Zen Required Preference Callout -->
            <div class="config-callout" role="region" aria-label="Zen Browser setup instructions">
              <div class="config-callout-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>Zen Requirement: Unsigned Add-ons</span>
              </div>
              <p>Zen requires toggling one preference in <span class="code-tag">about:config</span> to allow offline and self-hosted <span class="code-tag">.xpi</span> add-on installations:</p>
              <div class="config-code-row">
                <code>xpinstall.signatures.required</code>
                <button type="button" class="btn-copy" onclick="copyPreference(this, 'xpinstall.signatures.required')" aria-label="Copy xpinstall preference name">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  <span>Copy</span>
                </button>
              </div>
            </div>

            <ol class="steps">
              <li><span class="step-num">1</span> Set <span class="code-tag">xpinstall.signatures.required</span> to <span class="code-tag">false</span> in <span class="code-tag">about:config</span></li>
              <li><span class="step-num">2</span> Click <strong>"Install / Update Add-on (.xpi)"</strong> below</li>
              <li><span class="step-num">3</span> Click <strong>Add</strong> on the prompt to activate</li>
            </ol>
          </div>

          <div class="card-actions">
            <a href="/download/zen.xpi" class="btn btn-zen">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Install / Update in Zen (.xpi)
            </a>
            <a href="/download/zen" class="sub-link">or download offline .zip archive</a>
          </div>
        </article>

        <!-- Brave Browser Card -->
        <article class="download-card" aria-labelledby="title-brave">
          <div class="card-top">
            <div class="card-header">
              <div class="card-icon-wrap icon-brave" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
              </div>
              <div>
                <h2 id="title-brave" class="card-title">Brave / Chrome</h2>
                <div class="card-meta">Chromium Engine &bull; Side Panel &amp; Popup</div>
              </div>
            </div>

            <ol class="steps">
              <li><span class="step-num">1</span> Download the signed <span class="code-tag">.crx</span> package</li>
              <li><span class="step-num">2</span> Open <span class="code-tag">brave://extensions</span> and turn <strong>Developer mode</strong> ON</li>
              <li><span class="step-num">3</span> Drag &amp; drop the file into extensions to install</li>
            </ol>
          </div>

          <div class="card-actions">
            <a href="/download/brave.crx" class="btn btn-brave">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download Signed CRX (.crx)
            </a>
            <a href="/download/brave" class="sub-link">or download offline .zip archive</a>
          </div>
        </article>

        <!-- Android Mobile App Card -->
        <article class="download-card" aria-labelledby="title-android">
          <div class="card-top">
            <div class="card-header">
              <div class="card-icon-wrap icon-android" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                  <line x1="12" y1="18" x2="12.01" y2="18"></line>
                </svg>
              </div>
              <div>
                <h2 id="title-android" class="card-title">Android Mobile App</h2>
                <div class="card-meta">System Share Sheet &bull; Voice Notes &bull; Gallery</div>
              </div>
            </div>

            <ol class="steps">
              <li><span class="step-num">1</span> Download and install <span class="code-tag">zenbrave-chat.apk</span></li>
              <li><span class="step-num">2</span> Open any link in YouTube, X/Twitter, or Chrome</li>
              <li><span class="step-num">3</span> Tap <strong>Share</strong> and pick <strong>Zen &amp; Brave</strong> to beam directly</li>
            </ol>
          </div>

          <div class="card-actions">
            <a href="/download/android" class="btn btn-android">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download for Android (.apk)
            </a>
            <span class="sub-link" style="cursor: default;">Requires Android 8.0 or newer</span>
          </div>
        </article>
      </div>

      <!-- Quick Setup Sequence -->
      <section class="section-guide" aria-labelledby="guide-title">
        <h2 id="guide-title">How Peer Connection Works</h2>
        <div class="how-grid">
          <div class="how-item">
            <div class="how-step">Step 1</div>
            <div class="how-title">Create Room Code</div>
            <div class="how-desc">Open the extension, switch to the <strong>Connect</strong> tab, and generate a secure session code such as <span class="code-tag">ZEN-8921</span>.</div>
          </div>
          <div class="how-item">
            <div class="how-step">Step 2</div>
            <div class="how-title">Join from Peer Device</div>
            <div class="how-desc">Your friend opens their desktop extension or mobile app, enters the room code, and connects instantly.</div>
          </div>
          <div class="how-item">
            <div class="how-step">Step 3</div>
            <div class="how-title">Direct Beam &amp; Chat</div>
            <div class="how-desc">Both clients establish direct peer signaling. Click <strong>Share Tab</strong> to transmit active web pages, voice notes, or files.</div>
          </div>
        </div>
      </section>

      <!-- Architecture Capabilities -->
      <section class="capabilities-grid" aria-label="Core Capabilities">
        <div class="capability-card">
          <div class="capability-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            <span>1-Click Tab Beaming</span>
          </div>
          <div class="capability-desc">Instantly extract title, favicon, and URL into interactive rich cards on recipient screens.</div>
        </div>
        <div class="capability-card">
          <div class="capability-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
            <span>Audio &amp; Gallery Lightbox</span>
          </div>
          <div class="capability-desc">Record clear voice notes and inspect transferred media in a full-screen pinch-to-zoom viewer.</div>
        </div>
        <div class="capability-card">
          <div class="capability-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span>Ephemeral &amp; Private</span>
          </div>
          <div class="capability-desc">Rooms run in memory with optional offline replay. No analytics, tracking, or cloud storage.</div>
        </div>
      </section>
    </main>

    <footer role="contentinfo">
      <div>Zen &amp; Brave Link &amp; Media Chat &bull; Relay Server v1.0.3</div>
      <div>
        <a href="https://github.com/Ahmed-lasmar/zen-brave-chat" target="_blank" rel="noopener">GitHub</a> &bull;
        <a href="/api/version">Version API</a> &bull;
        <a href="/health">Health Status</a> &bull;
        <a href="/?json=1">JSON Summary</a>
      </div>
    </footer>
  </div>

  <div id="toast" class="toast-msg" role="status" aria-live="polite">Preference copied to clipboard</div>

  <script>
    function copyPreference(btn, text) {
      if (!navigator.clipboard) {
        fallbackCopy(text);
        return;
      }
      navigator.clipboard.writeText(text).then(showToast).catch(function() {
        fallbackCopy(text);
      });
    }

    function fallbackCopy(text) {
      var textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand('copy');
        showToast();
      } catch (err) {}
      document.body.removeChild(textarea);
    }

    function showToast() {
      var toast = document.getElementById('toast');
      if (!toast) return;
      toast.classList.add('show');
      setTimeout(function() {
        toast.classList.remove('show');
      }, 2500);
    }
  </script>
</body>
</html>`;
}

module.exports = {
  renderLandingPage
};
