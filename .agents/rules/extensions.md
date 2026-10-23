# Desktop Browser Extensions Guidelines

## Target Browsers
- **Zen Browser**: Firefox Gecko engine based.
- **Brave Browser**: Chromium Blink engine based.

## Manifest V3 Compatibility Differences
1. **Zen (Firefox Gecko)**:
   - Uses `sidebar_action` for the persistent sidebar panel (`default_panel: "ui/popup.html"`).
   - Requires explicit Gecko ID in `manifest.json`:
     ```json
     "browser_specific_settings": {
       "gecko": {
         "id": "zen-brave-chat@antigravity"
       }
     }
     ```
   - Background script declared as:
     ```json
     "background": {
       "scripts": ["background/background.js"]
     }
     ```

2. **Brave (Chromium Blink)**:
   - Uses `side_panel` with `default_path: "ui/popup.html"`.
   - Requires `sidePanel` permission.
   - Background script declared as service worker:
     ```json
     "background": {
       "service_worker": "background/background.js"
     }
     ```

## Build Process
- Build script: `scripts/build.js` (executed via `npm run build`).
- Output bundles:
  - `dist/zen/` & `dist/zen-extension.zip`
  - `dist/brave/` & `dist/brave-extension.zip`
- Served directly via relay endpoints `/download/zen` and `/download/brave`.
