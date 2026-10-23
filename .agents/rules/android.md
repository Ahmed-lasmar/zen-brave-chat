# Android Mobile App Guidelines

## Project Location & Build Tools
- Source code: `android/app/src/main/`
- Target SDK: 35 (Android 15), Min SDK: 26 (Android 8.0)
- Android SDK Root: `/mnt/sec_partition/android-env`
- Cached Gradle: `/home/trc-server/.gradle/wrapper/dists/gradle-9.3.1-bin/`
- Build script: `./scripts/build-apk.sh`

## Critical Implementation Rules

1. **Edge-to-Edge & WindowInsets**:
   - On Android 15 (Target SDK 35), edge-to-edge layout is enforced by the operating system.
   - Always call `WindowCompat.setDecorFitsSystemWindows(window, false)` in `onCreate()`.
   - Apply `WindowInsetsCompat.Type.statusBars() or displayCutout()` as padding to top headers to prevent overlap with the clock, battery icons, or camera hole.
   - Apply `WindowInsetsCompat.Type.ime()` dynamically as bottom padding on input containers (`bottomBar`) so the text input area and buttons smoothly follow the keyboard.

2. **Notifications**:
   - Notification channel ID: `zen_brave_chat_messages`
   - High importance (`IMPORTANCE_HIGH`) with default sound and vibration pattern.
   - Suppress notifications when the chat activity is active in the foreground (`isActivityInForeground`).
   - Use strictly positive notification IDs: `(roomId + message.id).hashCode() and 0x7FFFFFFF`.

3. **File Sharing & Permissions**:
   - Use `androidx.core.content.FileProvider` with authority `${applicationId}.fileprovider`.
   - Paths configured in `android/app/src/main/res/xml/file_paths.xml`.
   - Request `REQUEST_INSTALL_PACKAGES` permission for in-app APK updating.
