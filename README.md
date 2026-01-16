<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1h4FLDhL4PeeysSWsgdB2jYvX7zSvNTYF

## Environment Setup

Create a `.env` file in the project root and set:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
VITE_SITE_URL=http://localhost:5173
VITE_BACKEND_URL=http://localhost:8080
```

Restart the dev server after changes.

Note: If port 8080 is busy, the backend will automatically retry on the next available port (e.g., 8081). Update `VITE_BACKEND_URL` to match the actual backend port, or set `PORT=8080` in `.env` to force a specific port.

## Run Locally

**Prerequisites:** Node.js 18+

1. Install dependencies:
   `npm install`
2. Start the app:
   `npm run dev`

## Build & Preview

1. Build:
   `npm run build`
2. Preview production build:
   `npm run preview`

## Extension Integration (Local)

Load your local extension and verify the SCHMER_* protocol:

- In Chrome, open `chrome://extensions`, enable Developer mode, click "Load unpacked", and select:
  `C:\\Users\\proka\\Downloads\\extension\\screen-recorder-v1.0.0`
- Host permissions: ensure your manifest allows your app host(s), e.g. `http://localhost/*`, `https://localhost/*`, and your deployed domain(s).
- Messaging: app pages send `window.postMessage({ type: 'SCHMER_*', payload }, '*')`; the content script forwards to the service worker and replies via `postMessage`.
- Start flow: page sends `SCHMER_START_RECORDING` with `{ projectId, tool, options }`. If `options.toolUrl` is provided, the service worker opens it.
- Stop flow: page sends `SCHMER_STOP_RECORDING`. The extension replies with `SCHMER_RECORDING_READY` containing `{ blob, filename, projectId, tool }`.
- Upload: the frontend posts the Blob to `VITE_BACKEND_URL/upload`; fallback is a local download if upload isn't configured.

Backend for uploads:

```powershell
cd backend
npm run start
```

Frontend dev:

```powershell
npm run dev
```

## SolidWorks Local Launcher

This app can trigger SolidWorks on a Windows laptop via a minimal localhost launcher. The website never opens any .exe directly.

### Launcher (Python + Flask)

File: [backend/solidworks_launcher.py](backend/solidworks_launcher.py)

Features:
- Stores SLDWORKS.exe path in %APPDATA%/SolidWorksLauncher/config.json.
- Endpoint http://localhost:5000/open-solidworks opens SolidWorks.
- Optional POST /configure sets the path: { "path": "C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS\\SLDWORKS.exe" }.

Run locally (Python 3.10+):

```powershell
python -m pip install flask
python backend/solidworks_launcher.py
```

### Build Windows .exe (hide console)

```powershell
python -m pip install pyinstaller flask
pyinstaller --onefile --noconsole --name SolidWorksLauncher backend/solidworks_launcher.py
```

The executable will be in dist/SolidWorksLauncher.exe and runs without a console window.

Alternative (without PyInstaller): run via pythonw to hide console:

```powershell
pythonw backend/solidworks_launcher.py
```

### Configure SolidWorks Path

Either edit %APPDATA%/SolidWorksLauncher/config.json manually:

```json
{ "solidworksPath": "C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS\\SLDWORKS.exe" }
```

Or POST to the launcher:

```powershell
Invoke-WebRequest -Method POST -ContentType application/json -Body '{"path":"C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS\\SLDWORKS.exe"}' http://localhost:5000/configure
```

### Website Button (HTML + JS demo)

File: [solidworks-demo.html](solidworks-demo.html)

Behavior:
- Clicking the button sends POST to http://localhost:5000/open-solidworks.
- Shows an error if SolidWorks is not configured or if the launcher is not running.

### React Integration

Clicking the SolidWorks icon in the app now calls the local launcher via http://localhost:5000/open-solidworks. If the launcher is offline, you'll see a simple alert.
