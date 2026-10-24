# Zen & Brave Link & Media Chat Extension

A cross-browser WebExtension built for **Zen Browser** (Firefox / Gecko) and **Brave** (Chromium / Blink) that allows you and your friends to instantly share current tab links, send text chats, record voice notes, and transfer media (images, files) peer-to-peer with zero friction.

---

## 🌟 Key Features

- 🦊 **Zen Browser Native Support**: Gecko Manifest V3 with native `sidebar_action` and toolbar popup.
- 🦁 **Brave Browser Native Support**: Chromium Manifest V3 with side panel and toolbar popup.
- 🔗 **Instant Tab Sharing**: 1-click "Share Tab" button extracts active tab URL, page title, and favicon into interactive link cards.
- ⚡ **Hybrid WebRTC P2P + Zero-Dependency Relay**:
  - High-throughput direct WebRTC DataChannel (with packet chunking for large payloads).
  - Seamless fallback to WebSocket relay server when NAT/firewalls block direct P2P.
- 🎤 **Voice Notes**: In-browser audio recorder with timer and custom inline player.
- 🖼️ **Media & File Transfer**: Share images with inline previews and full-screen lightbox modal; attach any document or archive.
- 📚 **Links Hub**: Dedicated catalog tab of all shared links across sessions with search filter and 1-click "Open Tab".
- 📬 **Offline Message Queuing**: Messages sent while a friend's browser is closed are preserved on the relay server and delivered as soon as they reconnect.
- 🎨 **Multiple Themes**: Zen AMOLED (Pitch Black), Dark Slate, and Light Airy.
- 🔔 **Cross-Browser Notifications & Badges**: Desktop notifications and unread message counter badge.

---

## 🏗️ Architecture

```
                               ┌─────────────────────────────────┐
                               │   Zero-Dependency Node Server   │
                               │  (HTTP Health + WebSocket WSS)  │
                               └────────────────┬────────────────┘
                                                │
                       ┌────────────────────────┴────────────────────────┐
                       │ Signaling (SDP/ICE) & Relay Fallback + Queue    │
                       ▼                                                 ▼
        ┌─────────────────────────────┐                   ┌─────────────────────────────┐
        │   Zen Browser (Firefox/MV3) │                   │  Brave Browser (Chromium/MV3│
        │ ├── Core: BrowserAPI / Tab  │<═════════════════>│ ├── Core: BrowserAPI / Tab  │
        │ ├── UI: Popup / Sidebar     │   WebRTC P2P      │ ├── UI: Popup / Side Panel  │
        │ └── BG: Background Script   │   DataChannel     │ └── BG: Service Worker      │
        └─────────────────────────────┘                   └─────────────────────────────┘
```

---

## 📁 Repository Structure

```
lively-oppenheimer/
├── dist/
│   ├── zen/                       # Built extension ready for Zen Browser
│   └── brave/                     # Built extension ready for Brave Browser
├── manifest.common.json           # Shared WebExtension MV3 metadata
├── package.json                   # Build & test scripts
├── scripts/
│   ├── build.js                   # Cross-browser build script (creates dist/zen & dist/brave)
│   ├── generate-icons.js          # Zero-dependency PNG/SVG icon generator
│   └── test-connection.js         # Headless end-to-end multi-client simulation test
├── server/
│   ├── index.js                   # Server entrypoint (HTTP status + WebSocket server)
│   ├── rooms.js                   # Room manager, WebRTC signaling, offline queueing & disk persistence
│   └── websocket.js               # Zero-dependency RFC 6455 WebSocket implementation
├── src/
│   ├── background/
│   │   └── background.js          # Notifications and unread message badge worker
│   ├── core/
│   │   ├── browser-api.js         # Unified chrome.* vs browser.* abstraction layer
│   │   ├── connection.js          # Hybrid WebRTC DataChannel + WebSocket connection manager
│   │   ├── storage.js             # Local settings, recent rooms, and saved links storage
│   │   └── tab-helper.js          # Current active tab metadata extractor
│   ├── manifest.brave.json        # Brave/Chromium specific overrides
│   ├── manifest.zen.json          # Zen/Gecko specific overrides
│   └── ui/
│       ├── icons/                 # Extension icons (SVG, 16px, 32px, 48px, 128px PNG)
│       ├── media.js               # Voice recorder, file processor, and image lightbox
│       ├── popup.css              # Responsive styles for popup and sidebar panels
│       ├── popup.html             # Multi-tab UI markup (Chat, Links, Connect, Settings)
│       └── popup.js               # UI controller and event bindings
└── tests/
    ├── server.test.js             # Automated unit tests for WebSocket & Room protocol
    └── storage.test.js            # Automated unit tests for storage and tab helpers
```

---

## 🚀 Getting Started

### 1. Start the Relay Server

The server has **zero npm dependencies** and uses Node.js built-ins (`http`, `crypto`, `events`, `zlib`).

```bash
# Run the relay server (listens on port 3000 by default)
npm start
```

Health check:
```bash
curl http://localhost:3000/health
```

### 2. Build the Extension Packages

```bash
npm run build
```
This produces:
- `dist/zen/` for Zen Browser
- `dist/brave/` for Brave Browser

---

## 📥 Loading into Browsers

### 🦊 Loading into Zen Browser

#### Option A: Direct 1-Click Install (.xpi)
1. In Zen Browser, navigate to `about:config` and click **"Accept the Risk and Continue"**.
2. Search for:
   ```
   xpinstall.signatures.required
   ```
3. Toggle the value to `false` (this allows Zen to install self-hosted / offline `.xpi` add-ons).
4. Download or open `https://zenbrave.myapps.tn/download/zen.xpi` (or `dist/zen.xpi`).
5. When Zen prompts **"Add Zen & Brave Link & Chat?"**, click **Add** to install permanently.

#### Option B: Developer Mode / Temporary Load
1. Launch **Zen Browser**.
2. Open a tab and navigate to:
   ```
   about:debugging#/runtime/this-firefox
   ```
3. Click the **"Load Temporary Add-on..."** button.
4. Select the file:
   ```
   dist/zen/manifest.json
   ```
5. The extension is now loaded! You can open it from:
   - The toolbar extension icon popup.
   - The **Zen Browser Sidebar** panel for a persistent chat side-by-side with your browsing.

### 🦁 Loading into Brave Browser

1. Launch **Brave Browser**.
2. Open a tab and navigate to:
   ```
   brave://extensions
   ```
3. Toggle **"Developer mode"** in the top-right corner.
4. Click **"Load unpacked"**.
5. Select the directory:
   ```
   dist/brave
   ```
6. The extension is now loaded! You can open it from:
   - The toolbar puzzle piece icon -> click to pin **Zen & Brave Link & Chat**.
   - The Brave Side Panel.

---

## 👥 How to Connect with a Friend

1. **Create or Join a Room**:
   - In Zen Browser: Open the extension, click the **Connect** tab -> click **"Create New Room"**.
   - A short room code will be generated (e.g. `ZEN-4821`). Click **"Copy Code"** and send it to your friend.
   - In Brave Browser: Open the extension, navigate to the **Connect** tab, enter `ZEN-4821` and click **"Join"**.
2. **Status Indicator**:
   - The indicator in the top right turns green:
     - `🟢 P2P Direct`: Direct WebRTC DataChannel connection established between browsers.
     - `🟢 Relay`: Connected through the relay server fallback.
3. **Share Links**:
   - Click **"Share Tab"** in the top header or the chat banner to instantly send your active webpage to your friend.
   - Links show the favicon, page title, domain, and an **"Open Tab"** button.
4. **Chat & Media**:
   - Type messages or paste URLs.
   - Click the 📎 paperclip to send images (with full-size lightbox preview) or documents.
   - Click the 🎤 microphone to record a voice note and send an audio clip.
5. **Links Hub**:
   - Switch to the **Links** tab to view, search, and reopen any link ever shared during your conversations.

---

## 🌐 Custom Relay Server Deployment

To share across different internet connections (outside localhost), deploy `server/index.js` to any cloud provider:

- **Render / Railway / Fly.io / Heroku**:
  - Deploy this repository or the `server/` directory.
  - Set environment variable `PORT=3000` (or the host-assigned port).
- In the extension:
  - Open the **Settings** tab.
  - Change **Relay / Signaling Server URL** to your deployment (e.g., `wss://your-relay.onrender.com`).
  - Click **"Test"** and then **"Save Changes"**.

---

## 🧪 Automated Testing

Run the entire test suite (WebSocket RFC 6455 unit tests, storage unit tests, and the end-to-end multi-client simulation):

```bash
npm test
```

Or run individual suites:
```bash
npm run test:server       # Tests WebSocket server protocol, room routing & persistence
npm run test:storage      # Tests TabHelper and storage deduplication
npm run test:manager      # Tests ConnectionManager architecture, auto-reconnect & deterministic signaling
npm run test:connection   # Multi-client headless simulation test
```
