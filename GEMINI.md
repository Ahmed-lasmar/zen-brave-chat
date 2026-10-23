# Zen & Brave Link & Media Chat

Welcome to the **Zen & Brave Chat** Antigravity project workspace. This document serves as the primary technical reference and guidelines for Antigravity AI agents working in this repository.

---

## 1. Project Overview & Architecture

The project connects desktop browsers (**Zen Browser** and **Brave**) with mobile devices (**Android**) to share links, send text messages, record voice notes, and transfer images/files in real-time.

```
                    ┌────────────────────────┐
                    │   zenbrave.myapps.tn   │
                    │   (Apache 2.4 + SSL)   │
                    └───────────┬────────────┘
                                │ :3000 (ProxyPass / WebSocket)
                    ┌───────────▼────────────┐
                    │  Docker: zen-brave-chat│
                    │  (Node.js stdlib Relay)│
                    └───────┬────────┬───────┘
                            │        │
           ┌────────────────┘        └────────────────┐
           ▼                                          ▼
┌──────────────────────┐                   ┌──────────────────────┐
│  Desktop Extensions  │                   │  Android Mobile App  │
│  - Zen (Gecko)       │                   │  - Kotlin / M3       │
│  - Brave (Chromium)  │                   │  - System Share Sheet│
│  - Sidebar / Panel   │                   │  - Background Notifs │
└──────────────────────┘                   └──────────────────────┘
```

### Components:
1. **WebSocket Relay Server (`server/`)**:
   - Zero-dependency Node.js HTTP + WebSocket server (`http`, `crypto`, `fs`, `path`).
   - Manages room lifecycle, peer presence, WebRTC SDP/ICE signaling, and persistent message queuing.
   - Serves web landing page (`/`), health checks (`/health`), version API (`/api/version`), and downloads (`/download/android`, `/download/zen`, `/download/brave`).
2. **Desktop Browser Extensions (`src/`)**:
   - `dist/zen/`: Firefox/Gecko Manifest V3 with `sidebar_action` and Gecko ID `zen-brave-chat@antigravity`.
   - `dist/brave/`: Chromium Manifest V3 with `side_panel` and background service worker.
   - Built via `npm run build` into `dist/zen-extension.zip` and `dist/brave-extension.zip`.
3. **Native Android Application (`android/`)**:
   - Written in Kotlin with Material Components / Material 3.
   - Native system share target (`Intent.ACTION_SEND` and `ACTION_SEND_MULTIPLE`).
   - Interactive full-screen image viewer (`ImageViewerActivity`) with pinch-to-zoom, device gallery save, and share intent.
   - Native background notifications via `NotificationManagerCompat` on channel `zen_brave_chat_messages`.
   - WindowInsets edge-to-edge support for status bar padding and soft keyboard (IME) following.
   - In-app version check and 1-tap APK updater (`AppUpdateManager`).

---

## 2. Infrastructure & Live Endpoints

- **Public Subdomain**: `https://zenbrave.myapps.tn`
- **Secure WebSocket Endpoint**: `wss://zenbrave.myapps.tn`
- **Health Check**: `https://zenbrave.myapps.tn/health`
- **In-App Version API**: `https://zenbrave.myapps.tn/api/version`
- **Direct APK Download**: `https://zenbrave.myapps.tn/download/android`
- **GitHub Repository**: `https://github.com/Ahmed-lasmar/zen-brave-chat` (Branch: `main`)
- **Jenkins CI/CD Pipeline**: `https://jenkins.fiscalsuite.tn/job/Zen-Brave-Chat/`
- **Docker Hub Image**: `ahmedtnlasmar/zen-brave-chat:latest`

---

## 3. Essential Commands & Runbooks

### Run Automated Tests:
```bash
npm test
```
Executes all 34 unit and E2E simulation tests across:
- `tests/server.test.js` (Relay & room protocol)
- `tests/storage.test.js` (Storage & tab parsing)
- `tests/connection.test.js` (ConnectionManager & protocol)
- `tests/android.test.js` (Android distribution, insets, notifications, and APK checks)
- `scripts/test-connection.js` (Multi-client E2E simulation)

### Compile the Android APK:
The Android SDK is located at `/mnt/sec_partition/android-env`. Compile using the helper script:
```bash
./scripts/build-apk.sh
```
Or via Docker host chroot:
```bash
docker run --rm --privileged --net=host -v /:/host -v /mnt/sec_partition:/mnt/sec_partition ubuntu chroot /host bash -c 'export GRADLE_USER_HOME=/home/trc-server/.gradle && export ANDROID_HOME=/mnt/sec_partition/android-env && cd /home/trc-server/antigravity/lively-oppenheimer/android && ./gradlew --offline assembleDebug'
```
Always copy the resulting APK to `dist/zenbrave-chat.apk`:
```bash
cp android/app/build/outputs/apk/debug/app-debug.apk dist/zenbrave-chat.apk
```

### Build Extensions:
```bash
npm run build
```

### Deploy Container to Host:
```bash
docker cp dist/zenbrave-chat.apk zen-brave-chat:/app/dist/zenbrave-chat.apk
docker cp server/index.js zen-brave-chat:/app/server/index.js
docker restart zen-brave-chat
```

### Git Commits & Pushing:
Because the terminal sandbox mounts `.git` in read-only mode, perform git write/push operations via Docker or unsandboxed commands:
```bash
docker run --rm -v /home/trc-server/antigravity/lively-oppenheimer:/workspace -w /workspace alpine sh -c "apk add -q git && git config --global --add safe.directory '*' && git add -A && git commit -m '...' && git push origin main"
```

---

## 4. Development & Coding Guidelines

1. **Zero External Dependencies in Relay Server**:
   The relay server must remain strictly zero external npm dependencies. Use only Node.js standard libraries (`http`, `crypto`, `fs`, `path`).
2. **WindowInsets in Android**:
   Always handle `WindowInsetsCompat.Type.statusBars()` and `WindowInsetsCompat.Type.ime()` on root views to prevent header merging with the system status bar and to ensure text inputs follow the soft keyboard.
3. **Positive Notification IDs**:
   When generating notification IDs from string hashes, mask with `and 0x7FFFFFFF` to prevent negative IDs on OEM devices.
4. **Desktop Notification Deduplication**:
   Do not trigger both HTML5 DOM notifications and WebExtension background notifications simultaneously.
