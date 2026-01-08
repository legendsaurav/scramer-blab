# Schmer Recorder (Chrome Extension, MV3)

Implements the SCHMER_* protocol used by your site to start/stop screen recordings and hand the captured video back to the page.

## Files
- `manifest.json`: MV3 manifest (content script + background worker)
- `content-script.js`: Listens for messages from the page, manages recording via `getDisplayMedia` + `MediaRecorder`, posts back `SCHMER_RECORDING_READY`
- `background.js`: Minimal service worker; kept simple for now

## Permissions
- `scripting`, `activeTab` – required to run content script and interact with the current tab
- `host_permissions` – matches the site where the content script runs:
  - `https://scramer-blab.vercel.app/*`
  - `http://localhost:5173/*` (for local dev)

## Load Unpacked (Dev)
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `extension/` folder in this repo
4. Navigate to your site (production or localhost)

You should see your site’s UI show Extension Status: Ready (your app pings `SCHMER_PING` and expects `SCHMER_PONG`).

## How It Works
- The site posts messages like:
  - `SCHMER_START_RECORDING` with `{ projectId, tool, toolUrl }`
  - `SCHMER_STOP_RECORDING`
- The content script:
  - Calls `getDisplayMedia({ video: { frameRate: 30 }, audio: true })`
  - Adds mic if display stream has no audio
  - Records with `MediaRecorder`
  - On stop, posts `SCHMER_RECORDING_READY` with `{ filename, projectId, tool, blobUrl }`
- The page fetches `blobUrl` and uploads to your backend (`VITE_BACKEND_URL`) as implemented in `hooks/useExtensionBridge.ts`

## Notes
- User gesture required: trigger `SCHMER_START_RECORDING` directly from a button click in your UI
- Audio: enabling `audio: true` captures tab/system audio if available; we add mic if there’s no audio track
- MIME: tries `vp9`, then `vp8`, then plain `webm` to maximize compatibility
- Cleanup: page revokes blob URLs after upload

## Optional Enhancements
- Add icons in `icons/` and reference them in `manifest.json`
- Capture tab only via `chrome.tabCapture` (requires additional permissions)
- Upload directly from the extension (bypassing page) – then emit `SCHMER_REFRESH_SESSIONS` to refresh the UI
