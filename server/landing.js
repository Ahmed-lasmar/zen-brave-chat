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
      /* Base neutral palette tokens (WCAG 2.2 AAA compliant) */
      --bg: rgb(11, 15, 25);
      --surface-card: rgb(17, 24, 39);
      --surface-elevated: rgb(30, 41, 59);
      --surface-code: rgb(15, 23, 42);
      --surface-callout: rgb(19, 29, 46);
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-strong: rgb(51, 65, 85);
      --border-callout: rgb(35, 53, 77);
      --text-primary: rgb(248, 250, 252);
      --text-secondary: rgb(203, 213, 225);
      --text-muted: rgb(148, 163, 184);
      --focus-ring: rgb(99, 102, 241);

      /* Brand action tokens (WCAG 2.2 AA compliant for button text) */
      --accent-zen: rgb(109, 40, 217);
      --accent-zen-hover: rgb(91, 33, 182);
      --accent-brave: rgb(194, 65, 12);
      --accent-brave-hover: rgb(154, 52, 18);
      --accent-android: rgb(4, 120, 87);
      --accent-android-hover: rgb(6, 95, 70);
      --status-emerald: rgb(52, 211, 153);
      --status-emerald-bg: rgba(16, 185, 129, 0.12);
      --status-emerald-border: rgba(16, 185, 129, 0.32);

      /* Spacing Scale (4px base unit) */
      --space-1: 4px;
      --space-2: 8px;
      --space-3: 12px;
      --space-4: 16px;
      --space-5: 20px;
      --space-6: 24px;
      --space-8: 32px;
      --space-10: 40px;
      --space-12: 48px;

      /* Radius Language */
      --radius-sm: 4px;
      --radius-md: 6px;
      --radius-lg: 10px;
      --radius-xl: 14px;
      --radius-2xl: 18px;
      --radius-full: 9999px;

      /* Elevation & Shadows */
      --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.2);
      --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.25);
      --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.35);

      /* Typography */
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

      /* Motion */
      --transition-fast: 150ms ease;
      --transition-base: 200ms ease;
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
      padding: var(--space-12) var(--space-5);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }

    .container {
      max-width: 1040px;
      width: 100%;
    }

    header {
      text-align: center;
      margin-bottom: var(--space-12);
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-4);
      border-radius: var(--radius-full);
      background: var(--status-emerald-bg);
      border: 1px solid var(--status-emerald-border);
      color: var(--status-emerald);
      font-size: 13px;
      font-weight: 500;
      margin-bottom: var(--space-5);
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
      font-size: clamp(28px, 5vw, 44px);
      font-weight: 800;
      letter-spacing: -0.03em;
      margin-bottom: var(--space-3);
      color: var(--text-primary);
      line-height: 1.15;
    }

    .subtitle {
      font-size: 17px;
      color: var(--text-secondary);
      max-width: 680px;
      margin: 0 auto;
      line-height: 1.6;
    }

    /* Section Headers */
    .section-title {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-primary);
      margin-bottom: var(--space-2);
    }

    .section-subtitle {
      font-size: 14px;
      color: var(--text-muted);
      margin-bottom: var(--space-6);
    }

    /* Asymmetric Downloads Grid */
    .downloads-section {
      margin-bottom: var(--space-12);
    }

    .cards-grid {
      display: grid;
      grid-template-columns: 1.25fr 1fr 1fr;
      gap: var(--space-5);
      align-items: stretch;
    }

    .download-card {
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-2xl);
      padding: var(--space-6);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: transform var(--transition-base), border-color var(--transition-base), box-shadow var(--transition-base);
      position: relative;
    }

    .download-card:hover {
      transform: translateY(-2px);
      border-color: rgba(255, 255, 255, 0.18);
      box-shadow: var(--shadow-lg);
    }

    .download-card.zen-lead {
      border-color: rgba(109, 40, 217, 0.45);
      background: linear-gradient(180deg, rgba(109, 40, 217, 0.08) 0%, var(--surface-card) 26%);
    }

    .download-card.zen-lead:hover {
      border-color: rgba(109, 40, 217, 0.7);
    }

    .lead-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: rgb(196, 181, 253);
      background: rgba(109, 40, 217, 0.22);
      border: 1px solid rgba(109, 40, 217, 0.4);
      padding: 3px 10px;
      border-radius: var(--radius-full);
      margin-bottom: var(--space-3);
    }

    .card-top {
      margin-bottom: var(--space-5);
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }

    .card-icon-wrap {
      width: 46px;
      height: 46px;
      border-radius: var(--radius-lg);
      background: var(--surface-elevated);
      border: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .card-icon-wrap.icon-zen {
      color: rgb(196, 181, 253);
      background: rgba(109, 40, 217, 0.16);
      border-color: rgba(109, 40, 217, 0.35);
    }

    .card-icon-wrap.icon-brave {
      color: rgb(253, 186, 116);
      background: rgba(194, 65, 12, 0.16);
      border-color: rgba(194, 65, 12, 0.35);
    }

    .card-icon-wrap.icon-android {
      color: rgb(110, 231, 183);
      background: rgba(4, 120, 87, 0.16);
      border-color: rgba(4, 120, 87, 0.35);
    }

    .card-title {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-primary);
    }

    .card-meta {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 2px;
    }

    .code-tag {
      background: var(--surface-code);
      border: 1px solid rgba(255, 255, 255, 0.12);
      padding: 2px 6px;
      border-radius: var(--radius-sm);
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-primary);
      word-break: break-all;
    }

    /* Zen Configuration Callout Box */
    .config-callout {
      background: var(--surface-callout);
      border: 1px solid var(--border-callout);
      border-radius: var(--radius-xl);
      padding: var(--space-4);
      margin-top: var(--space-3);
      margin-bottom: var(--space-3);
      font-size: 13px;
    }

    .config-callout-header {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-weight: 700;
      color: rgb(147, 197, 253);
      margin-bottom: var(--space-2);
      font-size: 13px;
    }

    .config-callout-desc {
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.45;
      margin-bottom: var(--space-3);
    }

    .config-rows {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-bottom: var(--space-3);
    }

    .config-code-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      background: var(--surface-code);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      padding: var(--space-2) var(--space-3);
    }

    .code-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .code-meta-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      font-weight: 600;
    }

    .config-code-row code {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-primary);
      word-break: break-all;
    }

    .btn-copy {
      background: var(--surface-elevated);
      border: 1px solid var(--border-strong);
      color: var(--text-secondary);
      min-height: 38px;
      padding: var(--space-1) var(--space-3);
      border-radius: var(--radius-md);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
      flex-shrink: 0;
      touch-action: manipulation;
    }

    .btn-copy:hover {
      background: rgb(51, 65, 85);
      border-color: rgb(71, 85, 105);
      color: var(--text-primary);
    }

    .btn-copy:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }

    .btn-copy.copied {
      background: var(--status-emerald-bg);
      border-color: var(--status-emerald);
      color: var(--status-emerald);
    }

    .steps-compact {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      font-size: 12px;
      color: var(--text-secondary);
    }

    .steps-compact li {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
      line-height: 1.45;
    }

    .step-badge {
      background: var(--surface-elevated);
      border: 1px solid var(--border-strong);
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      color: var(--text-secondary);
      flex-shrink: 0;
      margin-top: 1px;
    }

    /* Standard Step List */
    .steps {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      font-size: 14px;
      color: var(--text-secondary);
      margin-top: var(--space-2);
    }

    .steps li {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
      line-height: 1.45;
    }

    .step-num {
      background: var(--surface-elevated);
      border: 1px solid var(--border-strong);
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      color: var(--text-secondary);
      flex-shrink: 0;
      margin-top: 1px;
    }

    .card-actions {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-top: var(--space-5);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      min-height: 48px;
      padding: var(--space-3) var(--space-5);
      border-radius: var(--radius-xl);
      font-size: 15px;
      font-weight: 600;
      text-decoration: none;
      transition: background-color var(--transition-fast), transform var(--transition-fast), box-shadow var(--transition-fast);
      cursor: pointer;
      border: none;
      color: rgb(255, 255, 255);
      text-align: center;
      touch-action: manipulation;
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
      box-shadow: 0 4px 14px rgba(109, 40, 217, 0.4);
    }

    .btn-brave {
      background-color: var(--accent-brave);
    }
    .btn-brave:hover {
      background-color: var(--accent-brave-hover);
      box-shadow: 0 4px 14px rgba(194, 65, 12, 0.4);
    }

    .btn-android {
      background-color: var(--accent-android);
    }
    .btn-android:hover {
      background-color: var(--accent-android-hover);
      box-shadow: 0 4px 14px rgba(4, 120, 87, 0.4);
    }

    .sub-link {
      text-align: center;
      font-size: 13px;
      color: var(--text-muted);
      text-decoration: none;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-2) var(--space-3);
      transition: color var(--transition-fast);
    }

    .sub-link:hover {
      color: var(--text-primary);
      text-decoration: underline;
    }

    .sub-link:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
      border-radius: var(--radius-sm);
    }

    .meta-tag-pill {
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-2) var(--space-3);
    }

    /* Process Flow Sequence (Variance Mandate: connected horizontal workflow) */
    .process-section {
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-2xl);
      padding: var(--space-8);
      margin-bottom: var(--space-12);
    }

    .flow-track {
      display: grid;
      grid-template-columns: 1fr auto 1fr auto 1fr;
      align-items: center;
      gap: var(--space-4);
      margin-top: var(--space-4);
    }

    .flow-card {
      background: var(--surface-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-xl);
      padding: var(--space-5);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .flow-marker {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: rgb(165, 180, 252);
    }

    .flow-num {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: rgba(99, 102, 241, 0.2);
      border: 1px solid rgba(99, 102, 241, 0.4);
      color: rgb(199, 210, 254);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
    }

    .flow-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .flow-desc {
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    .flow-arrow {
      color: var(--text-muted);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Asymmetric Bento Showcase (Variance Mandate) */
    .capabilities-section {
      margin-bottom: var(--space-12);
    }

    .bento-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: var(--space-5);
    }

    .bento-hero-tile {
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-2xl);
      padding: var(--space-6);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      grid-row: span 2;
    }

    .bento-side-tile {
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-2xl);
      padding: var(--space-6);
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .tile-header {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin-bottom: var(--space-3);
    }

    .tile-icon-box {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-md);
      background: var(--surface-elevated);
      border: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgb(165, 180, 252);
    }

    .tile-title {
      font-size: 17px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .tile-desc {
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.55;
    }

    .tab-beam-demo {
      background: var(--surface-code);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-xl);
      padding: var(--space-4);
      margin-top: var(--space-5);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .demo-pill {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .demo-preview-card {
      background: var(--surface-elevated);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-md);
      padding: var(--space-3);
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .demo-site-icon {
      width: 24px;
      height: 24px;
      border-radius: var(--radius-sm);
      background: rgba(99, 102, 241, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgb(199, 210, 254);
      flex-shrink: 0;
    }

    .demo-content {
      min-width: 0;
    }

    .demo-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .demo-url {
      font-size: 11px;
      color: var(--text-muted);
      font-family: var(--font-mono);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Footer */
    footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: var(--space-6);
      border-top: 1px solid var(--border-subtle);
      font-size: 13px;
      color: var(--text-muted);
      flex-wrap: wrap;
      gap: var(--space-3);
    }

    .footer-links {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    footer a {
      color: var(--text-secondary);
      text-decoration: none;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      padding: var(--space-1) var(--space-2);
      transition: color var(--transition-fast);
    }

    footer a:hover {
      color: var(--text-primary);
      text-decoration: underline;
    }

    footer a:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
      border-radius: var(--radius-sm);
    }

    .toast-msg {
      position: fixed;
      bottom: var(--space-6);
      right: var(--space-6);
      background: var(--surface-elevated);
      border: 1px solid var(--border-strong);
      color: var(--text-primary);
      padding: var(--space-3) var(--space-5);
      border-radius: var(--radius-lg);
      font-size: 13px;
      font-weight: 500;
      box-shadow: var(--shadow-lg);
      opacity: 0;
      transform: translateY(10px);
      transition: opacity var(--transition-base), transform var(--transition-base);
      pointer-events: none;
      z-index: 100;
    }

    .toast-msg.show {
      opacity: 1;
      transform: translateY(0);
    }

    /* Responsive Adaptation */
    @media (max-width: 960px) {
      .cards-grid {
        grid-template-columns: 1fr;
      }
      .flow-track {
        grid-template-columns: 1fr;
        gap: var(--space-3);
      }
      .flow-arrow {
        transform: rotate(90deg);
        margin: var(--space-1) 0;
      }
      .bento-grid {
        grid-template-columns: 1fr;
      }
      .bento-hero-tile {
        grid-row: auto;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .pulse-dot {
        animation: none;
      }
      .download-card, .btn, .btn-copy, .toast-msg {
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
        <span>Relay Online: ${escapeHtml(wsEndpoint)} &bull; ${activeRooms} rooms active &bull; ${activePeers} peers</span>
      </div>
      <h1>Zen &amp; Brave Link &amp; Media Chat</h1>
      <p class="subtitle">Direct peer-to-peer browser communication. Beam active tabs, exchange instant messages, record voice notes, and transfer media in real-time with zero cloud lock-in.</p>
    </header>

    <main role="main">
      <!-- Downloads Matrix -->
      <section class="downloads-section" aria-labelledby="downloads-title">
        <div class="cards-grid">
          <!-- Zen Browser Lead Card -->
          <article class="download-card zen-lead" aria-labelledby="title-zen">
            <div class="card-top">
              <span class="lead-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
                Primary Target
              </span>
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

              <!-- Zen Requirement Callout Box -->
              <div class="config-callout" role="region" aria-label="Zen Browser configuration guide">
                <div class="config-callout-header">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <span>Required Zen Browser Setup</span>
                </div>
                <p class="config-callout-desc">Zen Browser blocks self-hosted and offline add-ons by default. Toggle one preference in <span class="code-tag">about:config</span> to enable installation:</p>

                <div class="config-rows">
                  <div class="config-code-row">
                    <div class="code-info">
                      <span class="code-meta-label">Address</span>
                      <code>about:config</code>
                    </div>
                    <button type="button" class="btn-copy" onclick="copyPreference(this, 'about:config')" aria-label="Copy about:config">
                      <svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                      <span class="btn-copy-label">Copy</span>
                    </button>
                  </div>

                  <div class="config-code-row">
                    <div class="code-info">
                      <span class="code-meta-label">Preference</span>
                      <code>xpinstall.signatures.required</code>
                    </div>
                    <button type="button" class="btn-copy" onclick="copyPreference(this, 'xpinstall.signatures.required')" aria-label="Copy xpinstall.signatures.required">
                      <svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                      <span class="btn-copy-label">Copy</span>
                    </button>
                  </div>
                </div>

                <ol class="steps-compact">
                  <li><span class="step-badge">1</span> Open a new tab, paste <span class="code-tag">about:config</span>, press Enter &amp; accept risk</li>
                  <li><span class="step-badge">2</span> Search <span class="code-tag">xpinstall.signatures.required</span> and toggle it to <span class="code-tag">false</span></li>
                  <li><span class="step-badge">3</span> Return here and click <strong>Install / Update in Zen (.xpi)</strong> below</li>
                  <li><span class="step-badge">4</span> When Zen displays the add-on prompt, click <strong>Add</strong> to activate</li>
                </ol>
              </div>
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
              <span class="meta-tag-pill">Requires Android 8.0 or newer</span>
            </div>
          </article>
        </div>
      </section>

      <!-- How Peer Connection Works: Continuous Process Strip (Variance Mandate) -->
      <section class="process-section" aria-labelledby="process-title">
        <h2 id="process-title" class="section-title">How Peer Connection Works</h2>
        <p class="section-subtitle">Three straightforward steps to establish end-to-end communication across devices.</p>
        <div class="flow-track">
          <div class="flow-card">
            <div class="flow-marker">
              <span class="flow-num">1</span>
              <span>Initiate</span>
            </div>
            <div class="flow-title">Create Room Code</div>
            <div class="flow-desc">Open the extension, switch to the <strong>Connect</strong> tab, and generate a secure code like <span class="code-tag">ZEN-8921</span>.</div>
          </div>
          <div class="flow-arrow" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </div>
          <div class="flow-card">
            <div class="flow-marker">
              <span class="flow-num">2</span>
              <span>Connect</span>
            </div>
            <div class="flow-title">Join from Peer Device</div>
            <div class="flow-desc">Your friend opens their desktop extension or mobile app, enters the room code, and joins instantly.</div>
          </div>
          <div class="flow-arrow" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </div>
          <div class="flow-card">
            <div class="flow-marker">
              <span class="flow-num">3</span>
              <span>Transmit</span>
            </div>
            <div class="flow-title">Direct Beam &amp; Chat</div>
            <div class="flow-desc">Direct WebRTC signaling connects both peers. Click <strong>Share Tab</strong> to beam web pages, audio clips, and files.</div>
          </div>
        </div>
      </section>

      <!-- Architecture Capabilities: Bento Showcase (Variance Mandate) -->
      <section class="capabilities-section" aria-labelledby="capabilities-title">
        <h2 id="capabilities-title" class="section-title">Core Capabilities</h2>
        <p class="section-subtitle">Engineered for frictionless everyday cross-device link sharing.</p>
        <div class="bento-grid">
          <div class="bento-hero-tile">
            <div>
              <div class="tile-header">
                <div class="tile-icon-box" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                  </svg>
                </div>
                <div class="tile-title">1-Click Tab Beaming</div>
              </div>
              <p class="tile-desc">Instantly beam your current active tab to connected devices. Extracts page title, favicon, and canonical URL into structured cards without manual copy-pasting.</p>
            </div>
            <div class="tab-beam-demo" aria-hidden="true">
              <div class="demo-pill">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
                <span>Live Card Preview</span>
              </div>
              <div class="demo-preview-card">
                <div class="demo-site-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                  </svg>
                </div>
                <div class="demo-content">
                  <div class="demo-title">Zen Browser — The privacy-focused Firefox fork</div>
                  <div class="demo-url">https://zen-browser.app</div>
                </div>
              </div>
            </div>
          </div>

          <div class="bento-side-tile">
            <div class="tile-header">
              <div class="tile-icon-box" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
              </div>
              <div class="tile-title">Voice Notes &amp; Media Lightbox</div>
            </div>
            <p class="tile-desc">Record voice messages directly in the sidebar or Android app. Inspect transferred photos in an interactive pinch-to-zoom full-screen viewer.</p>
          </div>

          <div class="bento-side-tile">
            <div class="tile-header">
              <div class="tile-icon-box" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </div>
              <div class="tile-title">Zero-Telemetry Privacy</div>
            </div>
            <p class="tile-desc">Rooms run in volatile memory with peer signaling. No tracking scripts, analytics, or permanent cloud storage of your communications.</p>
          </div>
        </div>
      </section>
    </main>

    <footer role="contentinfo">
      <div>Zen &amp; Brave Link &amp; Media Chat &bull; Relay Server v1.0.3</div>
      <div class="footer-links">
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
      function onSuccess() {
        if (btn) {
          btn.classList.add('copied');
          var label = btn.querySelector('.btn-copy-label');
          var originalLabel = label ? label.textContent : 'Copy';
          if (label) label.textContent = 'Copied!';
          btn.setAttribute('aria-label', text + ' copied to clipboard');
          setTimeout(function() {
            btn.classList.remove('copied');
            if (label) label.textContent = originalLabel;
            btn.setAttribute('aria-label', 'Copy ' + text);
          }, 2000);
        }
        showToast(text + ' copied to clipboard');
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(onSuccess).catch(function() {
          fallbackCopy(btn, text, onSuccess);
        });
      } else {
        fallbackCopy(btn, text, onSuccess);
      }
    }

    function fallbackCopy(btn, text, onSuccess) {
      var textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        var ok = document.execCommand('copy');
        if (ok && onSuccess) {
          onSuccess();
        } else {
          showToast('Copied: ' + text);
        }
      } catch (err) {
        showToast('Failed to copy. Please copy manually.');
      }
      document.body.removeChild(textarea);
    }

    function showToast(msg) {
      var toast = document.getElementById('toast');
      if (!toast) return;
      if (msg) toast.textContent = msg;
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
