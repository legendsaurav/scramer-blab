# Screen Recorder Pro (Schmer-Ready)

This MV3 extension records screen/window/tab with audio in an offscreen document and integrates with the Schmer website via a content script bridge.

## Features
- Offscreen recording engine (stable across popup closes and tab switches)
- Start/Pause/Resume/Stop from popup or via Schmer messages
- Auto-pause when Schmer tab is visible, auto-resume when you switch away
- Delivers final Blob back to Schmer page for upload; falls back to local download otherwise
- Optional: opens the requested tool URL in a new tab when provided by Schmer

## Installation (Developer Mode)
1. Open Chrome → `chrome://extensions`.
2. Enable "Developer mode" (top-right).
3. Click "Load unpacked" and select the `screen-recorder-v1.0.0/` folder.

## Testing (No Schmer backend required)
1. Load the extension as above.
2. Open the local test page by dragging `test-schmer.html` into Chrome.
3. In that page:
   - Click "Ping" → status should log `SCHMER_PONG`.
   - Click "Start Recording" → browser prompts to choose a screen/window/tab.
   - Work in any app; return and click "Stop & Upload".
   - The page receives `SCHMER_RECORDING_READY` with a Blob and shows a fallback download link.

## Integrating on Schmer Website
On your Schmer page, send/receive messages:

```html
<script>
  function schmerPost(type, payload) {
    window.postMessage({ type, payload }, '*');
  }

  window.addEventListener('message', async (e) => {
    const { type, payload, version, blob, filename } = e.data || {};
    if (!type || !String(type).startsWith('SCHMER_')) return;

    if (type === 'SCHMER_PONG') {
      // Flip UI: Ready (Green)
    }
    if (type === 'SCHMER_RECORDING_STARTED') {
      // Optionally open tool URL
    }
    if (type === 'SCHMER_STATUS') {
      // payload.state: 'auto-paused' | 'recording'
    }
    if (type === 'SCHMER_RECORDING_READY') {
      const form = new FormData();
      form.append('file', blob, filename || 'recap.webm');
      form.append('projectId', payload?.projectId || '');
      form.append('tool', payload?.tool || '');
      await fetch('/api/session-library/upload', { method: 'POST', body: form });
    }
  });

  // Examples
  schmerPost('SCHMER_PING');
  // schmerPost('SCHMER_START_RECORDING', { projectId: 'P123', tool: 'MATLAB', options: { toolUrl: 'https://www.mathworks.com/products/matlab.html' } });
  // schmerPost('SCHMER_STOP_RECORDING');
</script>
```

## Store Submission Notes
- `content_scripts.matches` and `host_permissions` are set to `<all_urls>` for development. For production, restrict these to your Schmer domain (e.g., `https://schmer.example/*`).
- Offscreen API requires Chrome 109+ (manifest enforces this)
- No remote code; all scripts are bundled locally
- Icons are referenced from `icons/`

## Permissions
- `offscreen`: offscreen recording document
- `desktopCapture` / `tabCapture`: screen/tab capture
- `downloads`: fallback local save of recordings
- `storage`: preserve UI state
- `host_permissions`: set to `<all_urls>` for development; restrict in prod

## Troubleshooting
- If Blob transfer fails on some browsers, we can switch to ArrayBuffer messages.
- If auto-pause doesn’t trigger, ensure the content script runs on the Schmer page and the page is not in an iframe or blocked by CSP.
