---
name: zen-brave-ops
description: Operations, testing, Android APK compilation, and container deployment skill for the Zen & Brave Chat ecosystem.
---

# Zen & Brave Operations Skill

This skill provides step-by-step operational workflows and runbooks for testing, building, and deploying components of the Zen & Brave Chat ecosystem.

## 1. Quick Diagnostics & Health Check

Run a health probe against the local relay server and the public domain:

```bash
# Check local Docker container status
docker ps --filter "name=zen-brave-chat"

# Probe local health endpoint
curl -s http://127.0.0.1:3000/health

# Probe public SSL endpoint
curl -s https://zenbrave.myapps.tn/health

# Probe version & changelog API
curl -s https://zenbrave.myapps.tn/api/version
```

## 2. Running Automated Tests

Run the full suite of unit, integration, and multi-client E2E simulation tests:

```bash
export PATH="/home/trc-server/.nvm/versions/node/v20.20.2/bin:$PATH"
npm test
```

## 3. Compiling the Android APK

Build the release-ready debug APK using the host Android SDK (`/mnt/sec_partition/android-env`):

```bash
./scripts/build-apk.sh
```

This compiles `android/app/build/outputs/apk/debug/app-debug.apk` and copies it to `dist/zenbrave-chat.apk`.

## 4. Deploying Updates to Production

To update the running Docker container without rebuilding from scratch:

```bash
# Update APK and server files in container
docker cp dist/zenbrave-chat.apk zen-brave-chat:/app/dist/zenbrave-chat.apk
docker cp server/index.js zen-brave-chat:/app/server/index.js

# Restart container
docker restart zen-brave-chat

# Verify HTTP 200
curl -sI https://zenbrave.myapps.tn/health
```

## 5. Pushing Changes to GitHub

To push commits to the GitHub repository:

```bash
docker run --rm -v /home/trc-server/antigravity/lively-oppenheimer:/workspace -w /workspace alpine sh -c "apk add -q git && git config --global --add safe.directory '*' && git push origin main"
```
This triggers the Jenkins CI/CD pipeline at `https://jenkins.fiscalsuite.tn/job/Zen-Brave-Chat/`.
