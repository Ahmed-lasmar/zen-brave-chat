#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "======================================================"
echo "🔨 Building Zen & Brave Android Mobile App (APK)..."
echo "======================================================"

mkdir -p "$PROJECT_ROOT/dist"

docker run --rm --privileged --net=host \
  -v /:/host \
  -v /mnt/sec_partition:/mnt/sec_partition \
  ubuntu:22.04 chroot /host /bin/bash -c "
    export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
    export ANDROID_HOME=/mnt/sec_partition/android-env
    export GRADLE_USER_HOME=/home/trc-server/.gradle
    cd /home/trc-server/antigravity/lively-oppenheimer/android
    ./gradlew assembleDebug
  "

cp "$PROJECT_ROOT/android/app/build/outputs/apk/debug/app-debug.apk" "$PROJECT_ROOT/dist/zenbrave-chat.apk"

echo "✅ Android APK successfully built and copied to dist/zenbrave-chat.apk"
ls -lh "$PROJECT_ROOT/dist/zenbrave-chat.apk"
