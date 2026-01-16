// ============================================
// SERVICE WORKER - LIFECYCLE MANAGER
// ============================================
// Responsibilities:
// 1. Create/destroy offscreen document
// 2. Coordinate messages between popup and offscreen
// 3. Handle file persistence (upload to backend)
// 4. Maintain recording state in storage
//
// WHY NOT IN POPUP:
// Popup closes > service worker stays alive > recording continues
// ============================================

// Backend API base used when no Schmer page is active.
// This should point at the same backend as VITE_BACKEND_URL.
const BACKEND_URL = 'http://localhost:3000';

// Best-effort guess of which engineering tool is being recorded
// based on the current active tab URL. This lets standalone
// recordings land in the same arduino_idle/autocad/... folders
// as Schmer-integrated recordings.
function guessToolFromUrl(url) {
  if (!url || typeof url !== 'string') return 'Screen Recorder';
  const u = url.toLowerCase();

  if (u.includes('arduino.cc')) return 'Arduino';
  if (u.includes('web.autocad.com') || u.includes('autocad.com')) return 'AutoCAD';
  if (u.includes('solidworks')) return 'SolidWorks';
  if (u.includes('mathworks.com') || u.includes('matlab.')) return 'MATLAB';
  if (u.includes('vscode.dev')) return 'VS Code';
  if (u.includes('github.com')) return 'GitHub';
  if (u.includes('labcenter.com') || u.includes('proteus')) return 'Proteus';

  return 'Screen Recorder';
}

let offscreenPort = null;
// Schmer session state (in-memory; minimal persistence kept in storage for UI consistency)
const schmerSession = {
  active: false,
  tabId: null,
  projectId: null,
  tool: null,
  userId: null,
  userName: null,
  autoPaused: false,
  toolTabId: null,
  expectedToolUrl: null
};

// Initialize on install/startup
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({
      recordingState: 'stopped',
      recordingStartTime: null
    });
  } else {
    console.warn('[SW] chrome.storage.local is not available on install');
  }
  console.log('[SW] Extension installed');
});

// Initialize service worker on startup
chrome.runtime.onStartup.addListener(() => {
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({
      recordingState: 'stopped',
      recordingStartTime: null
    });
  } else {
    console.warn('[SW] chrome.storage.local is not available on startup');
  }
  console.log('[SW] Service worker started');
});

// ============================================
// OFFSCREEN DOCUMENT LIFECYCLE
// ============================================

async function ensureOffscreenExists() {
  // Check if offscreen already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) {
    console.log('[SW] Offscreen document already exists');
    return;
  }

  // Create new offscreen document
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DISPLAY_MEDIA'],
      justification: 'Screen recording with MediaRecorder API'
    });
    console.log('[SW] Offscreen document created');
  } catch (error) {
    console.error('[SW] Failed to create offscreen:', error);
  }
}

async function closeOffscreen() {
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) {
      await chrome.offscreen.closeDocument();
      console.log('[SW] Offscreen document closed');
    }
  } catch (error) {
    console.error('[SW] Error closing offscreen:', error);
  }
}

// ============================================
// PORT COMMUNICATION WITH OFFSCREEN
// ============================================

async function connectToOffscreen() {
  if (offscreenPort) return offscreenPort;

  await ensureOffscreenExists();

  // Give offscreen time to initialize
  await new Promise(resolve => setTimeout(resolve, 500));

  try {
    offscreenPort = chrome.runtime.connect({ name: 'offscreen-channel' });

    offscreenPort.onDisconnect.addListener(() => {
      console.log('[SW] Offscreen disconnected');
      offscreenPort = null;
    });

    offscreenPort.onMessage.addListener(handleOffscreenMessage);
    console.log('[SW] Connected to offscreen');
    return offscreenPort;
  } catch (error) {
    console.error('[SW] Failed to connect to offscreen:', error);
    return null;
  }
}

function handleOffscreenMessage(message) {
  // ============================================
  // MESSAGE FROM OFFSCREEN: Recording stopped
  // Contains: blobUrl, mimeType, filename
  // ============================================
  if (message.type === 'RECORDING_STOPPED') {
    console.log('[SW] Received RECORDING_STOPPED from offscreen');
    handleRecordingStopped(message);
  }

  if (message.type === 'STATUS_UPDATE') {
    console.log('[SW] Recording status:', message.data);
  }

  if (message.type === 'ERROR') {
    console.error('[SW] Offscreen error:', message.data);
    // Gracefully set state to stopped so UI/content script can recover
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ recordingState: 'stopped' }).catch(() => {});
    }
    // Notify Schmer page, if active
    if (schmerSession.active && schmerSession.tabId != null) {
      chrome.tabs.sendMessage(schmerSession.tabId, { type: 'SCHMER_ERROR', message: message.data || 'Recording error' }).catch(() => {});
      chrome.tabs.sendMessage(schmerSession.tabId, { type: 'SCHMER_STATUS', payload: { state: 'stopped' } }).catch(() => {});
    }
  }
}

// ============================================
// POPUP MESSAGES
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Message from popup.js

  if (message.action === 'START_RECORDING') {
    handleStartRecording(message).then(sendResponse).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async response
  }

  if (message.action === 'PAUSE_RECORDING') {
    handlePauseRecording().then(sendResponse).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message.action === 'RESUME_RECORDING') {
    handleResumeRecording().then(sendResponse).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message.action === 'STOP_RECORDING') {
    handleStopRecording().then(sendResponse).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message.action === 'GET_STATE') {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['recordingState', 'recordingStartTime'], sendResponse);
    } else {
      sendResponse({ recordingState: 'unknown', recordingStartTime: null, error: 'chrome.storage.local not available' });
    }
    return true;
  }

  // ================================
  // SCHMER bridge actions (from schmer-content.js)
  // ================================
  if (message.action === 'SCHMER_HANDSHAKE') {
    const mf = chrome.runtime.getManifest();
    sendResponse({ ok: true, version: mf?.version || null });
    return true;
  }

  if (message.action === 'SCHMER_START_RECORDING') {
    (async () => {
      try {
        // Capture the tab ID of the Schmer page
        if (sender && sender.tab && sender.tab.id != null) {
          schmerSession.tabId = sender.tab.id;
        }
        schmerSession.active = true;
        schmerSession.projectId = message.projectId || null;
        schmerSession.tool = message.tool || null;
        schmerSession.userId = message.userId || null;
        schmerSession.userName = message.userName || null;
        schmerSession.autoPaused = false;
        schmerSession.toolTabId = null;

        // Decide display mode based on tool type
        const toolName = (message.tool || '').toLowerCase();
        const isWebTool = ['arduino', 'autoCAD', 'vs code', 'matlab', 'github'].some(k => toolName.includes(k.toLowerCase()));
        const isDesktopTool = ['proteus', 'solidworks'].some(k => toolName.includes(k.toLowerCase()));

        // Default recording options
        const startMsg = {
          displayMode: isWebTool ? 'tab' : (isDesktopTool ? 'window' : ((message.options && message.options.displayMode) || 'screen')),
          includeAudio: (message.options && message.options.includeAudio) !== false,
          includeMicrophone: false,
          targetTabId: null
        };

        // Prevent double-start if already recording
        const st = chrome.storage && chrome.storage.local ? await chrome.storage.local.get(['recordingState']) : { recordingState: 'stopped' };
        if ((st.recordingState || 'stopped') === 'recording') {
          sendResponse({ success: false, error: 'Recording already in progress' });
          return;
        }

        // Optionally open tool URL in a new tab
        const toolUrl = message.options && message.options.toolUrl;
        const openInExtension = (message.options && message.options.openInExtension);
        if (toolUrl && openInExtension !== false) {
          try {
            const createdTab = await chrome.tabs.create({ url: toolUrl, active: true });
            if (createdTab && typeof createdTab.id === 'number') {
              schmerSession.toolTabId = createdTab.id;
              // Ensure the window is focused so tabCapture can capture the active tab without a picker
              if (typeof createdTab.windowId === 'number') {
                try { await chrome.windows.update(createdTab.windowId, { focused: true }); } catch (e) {}
              }
            }
          } catch (e) {
            console.warn('[SW] Failed to open tool URL:', e);
          }
        } else if (toolUrl) {
          // The page already opened the tool; discover the tab id for auto-stop logic
          schmerSession.expectedToolUrl = toolUrl;
          setTimeout(async () => {
            try {
              const u = new URL(toolUrl);
              const pattern = `${u.protocol}//${u.host}/*`;
              const tabs = await chrome.tabs.query({ url: pattern });
              const match = tabs.find(t => t.url && t.url.startsWith(toolUrl));
              if (match && match.id != null) schmerSession.toolTabId = match.id;
              if (match && typeof match.windowId === 'number') {
                try { await chrome.windows.update(match.windowId, { focused: true }); } catch (e) {}
              }
            } catch (e) {}
          }, 800);
        }
        // If we're in tab mode and have a target tab, start immediately; otherwise fall back
        let resp;
        if (startMsg.displayMode === 'tab' && startMsg.targetTabId != null) {
          resp = await handleStartRecording(startMsg);
        } else if (startMsg.displayMode === 'tab') {
          // Fallback: start with user picker if tab id not found yet
          resp = await handleStartRecording({ ...startMsg, displayMode: 'screen' });
        } else {
          resp = await handleStartRecording(startMsg);
        }

        // Persist basic session metadata for resilience
        if (chrome.storage && chrome.storage.local) {
          await chrome.storage.local.set({
            schmerSession: {
              active: true,
              projectId: schmerSession.projectId,
              tool: schmerSession.tool,
              userId: schmerSession.userId,
              userName: schmerSession.userName,
              tabId: schmerSession.tabId
            }
          });
        }
        sendResponse(resp);
      } catch (e) {
        console.error('[SW] SCHMER_START_RECORDING error:', e);
        sendResponse({ success: false, error: e?.message || 'Failed to start recording' });
      }
    })();
    return true;
  }

  if (message.action === 'SCHMER_STOP_RECORDING') {
    (async () => {
      try {
        const resp = await handleStopRecording();
        if (chrome.storage && chrome.storage.local) {
          await chrome.storage.local.set({ schmerSession: { active: false } });
        }
        sendResponse(resp);
      } catch (e) {
        console.error('[SW] SCHMER_STOP_RECORDING error:', e);
        sendResponse({ success: false, error: e?.message || 'Failed to stop recording' });
      }
    })();
    return true;
  }

  if (message.action === 'SCHMER_VISIBILITY') {
    (async () => {
      try {
        if (!schmerSession.active) { sendResponse({ ok: true }); return; }
        const visible = !!message.visible;
        // Read current state to decide transitions
        const st = chrome.storage && chrome.storage.local ? await chrome.storage.local.get(['recordingState']) : { recordingState: 'stopped' };
        const rs = st.recordingState || 'stopped';

        if (visible) {
          // Auto-pause when back on Schmer tab
          if (rs === 'recording' && !schmerSession.autoPaused) {
            await handlePauseRecording();
            schmerSession.autoPaused = true;
            // Inform content script
            if (schmerSession.tabId != null) {
              chrome.tabs.sendMessage(schmerSession.tabId, { type: 'SCHMER_STATUS', payload: { state: 'auto-paused' } }).catch(() => {});
            }
          }
        } else {
          // Resume when leaving Schmer if we auto-paused before
          if (rs === 'paused' && schmerSession.autoPaused) {
            await handleResumeRecording();
            schmerSession.autoPaused = false;
            if (schmerSession.tabId != null) {
              chrome.tabs.sendMessage(schmerSession.tabId, { type: 'SCHMER_STATUS', payload: { state: 'recording' } }).catch(() => {});
            }
          }
        }
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false });
      }
    })();
    return true;
  }
});

// ============================================
// RECORDING HANDLERS
// ============================================

async function handleStartRecording(message) {
  console.log('[SW] handleStartRecording:', message);

  const port = await connectToOffscreen();
  if (!port) throw new Error('Failed to connect to offscreen');

  // Record start time
  const startTime = Date.now();
  if (chrome.storage && chrome.storage.local) {
    await chrome.storage.local.set({
      recordingState: 'recording',
      recordingStartTime: startTime
    });
  }

  // Send configuration to offscreen
  // Forward config to offscreen; microphone explicitly disabled
  port.postMessage({
    type: 'START_RECORDING',
    data: {
      displayMode: message.displayMode || 'screen', // 'screen', 'window', 'tab'
      includeAudio: message.includeAudio !== false,
      includeMicrophone: false,
      audioTrackId: message.audioTrackId || null
    }
  });

  return { success: true };
}

async function handlePauseRecording() {
  console.log('[SW] handlePauseRecording');

  const port = await connectToOffscreen();
  if (!port) throw new Error('Failed to connect to offscreen');

  if (chrome.storage && chrome.storage.local) {
    await chrome.storage.local.set({ recordingState: 'paused' });
  }

  port.postMessage({ type: 'PAUSE_RECORDING' });

  return { success: true };
}

async function handleResumeRecording() {
  console.log('[SW] handleResumeRecording');

  const port = await connectToOffscreen();
  if (!port) throw new Error('Failed to connect to offscreen');

  if (chrome.storage && chrome.storage.local) {
    await chrome.storage.local.set({ recordingState: 'recording' });
  }

  port.postMessage({ type: 'RESUME_RECORDING' });

  return { success: true };
}

async function handleStopRecording() {
  console.log('[SW] handleStopRecording');

  const port = await connectToOffscreen();
  if (!port) throw new Error('Failed to connect to offscreen');

  port.postMessage({ type: 'STOP_RECORDING' });

  if (chrome.storage && chrome.storage.local) {
    await chrome.storage.local.set({ recordingState: 'stopped' });
  }

  return { success: true };
}

// ============================================
// FILE DOWNLOAD HANDLER
// ============================================

async function handleRecordingStopped(message) {
  const { blobUrl, mimeType, filename } = message.data;

  console.log('[SW] Recording complete:', filename);

  try {
    if (schmerSession.active && schmerSession.tabId != null) {
      // Fetch blob and deliver back to Schmer content script to upload
      const res = await fetch(blobUrl);
      const blob = await res.blob();
      // Relay to content script
      await chrome.tabs.sendMessage(schmerSession.tabId, {
        type: 'SCHMER_RECORDING_READY',
        blob,
        blobUrl, // provide as fallback for page-side upload
        filename,
        projectId: schmerSession.projectId,
        tool: schmerSession.tool,
        userId: schmerSession.userId,
        userName: schmerSession.userName
      }).catch(() => {});

      // Notify stopped
      chrome.tabs.sendMessage(schmerSession.tabId, {
        type: 'SCHMER_RECORDING_STOPPED',
        payload: { filename }
      }).catch(() => {});
    } else {
      // No active Schmer session: prefer backend upload, but fall back to download.
      console.log('[SW] No active Schmer session, uploading to backend.');
      let uploadedToBackend = false;
      try {
        // Fetch the blob from the offscreen document
        const res = await fetch(blobUrl);
        const blob = await res.blob();

        // Try to infer which tool is being recorded from the active tab URL
        let inferredTool = 'Screen Recorder';
        try {
          const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (tabs && tabs.length > 0) {
            inferredTool = guessToolFromUrl(tabs[0].url || '');
          }
        } catch (e) {
          console.warn('[SW] Failed to infer tool from URL:', e);
        }

        if (BACKEND_URL) {
          const form = new FormData();
          form.append('video', blob, filename);
          // Use a generic project id, but a tool name that
          // matches the backend TOOL_FOLDER_MAP so files land
          // under arduino_idle/autocad/... on disk.
          form.append('project_id', 'global');
          form.append('tool', inferredTool);
          try {
            form.append('session_id', crypto.randomUUID());
          } catch {
            // ignore if randomUUID is unavailable
          }

          const uploadRes = await fetch(`${BACKEND_URL}/api/upload`, {
            method: 'POST',
            body: form,
            mode: 'cors'
          });

          if (!uploadRes.ok) {
            console.error('[SW] Backend upload failed:', uploadRes.status, uploadRes.statusText);
          } else {
            console.log('[SW] Backend upload successful');
            uploadedToBackend = true;
          }
        } else {
          console.warn('[SW] BACKEND_URL not set; skipping upload.');
        }
      } catch (e) {
        console.error('[SW] Error during backend upload:', e);
      }

      // If backend upload failed for any reason, fall back to a local download
      if (!uploadedToBackend) {
        try {
          console.log('[SW] Falling back to local download.');
          const downloadId = await chrome.downloads.download({
            url: blobUrl,
            filename,
            saveAs: false
          });
          console.log('[SW] Download started with ID:', downloadId);
        } catch (e) {
          console.error('[SW] Download fallback failed:', e);
        }
      }
    }
  } catch (error) {
    console.error('[SW] Post-processing failed:', error);
  } finally {
    // Revoke and close offscreen
    try {
      setTimeout(() => {
        try { URL.revokeObjectURL(blobUrl); } catch (e) {}
      }, 10000);
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
    await closeOffscreen();

    // Reset schmer session after stop
    schmerSession.active = false;
    schmerSession.autoPaused = false;
    schmerSession.projectId = null;
    schmerSession.tool = null;
    schmerSession.expectedToolUrl = null;
    schmerSession.toolTabId = null;
    // Leave tabId so future messages can still be posted until page refresh
  }
}

// ============================================
// TAB CLOSE -> AUTO STOP RECORDING
// ============================================
chrome.tabs.onRemoved.addListener(async (closedTabId) => {
  try {
    if (!schmerSession.active) return;
    if (schmerSession.toolTabId == null) return;
    if (closedTabId !== schmerSession.toolTabId) return;

    console.log('[SW] Tool tab closed, stopping recording');
    try {
      await handleStopRecording();
    } catch (e) {
      console.warn('[SW] Failed to stop on tab close:', e);
    }
  } catch (e) {
    // no-op
  }
});

// ============================================
// DISCOVER TOOL TAB WHEN PAGE OPENS IT FIRST
// ============================================
function urlMatchesExpected(url) {
  try {
    if (!schmerSession.expectedToolUrl || !url) return false;
    const want = new URL(schmerSession.expectedToolUrl);
    const got = new URL(url);
    return want.host === got.host && got.href.startsWith(want.href);
  } catch { return false; }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  try {
    if (!schmerSession.active) return;
    if (schmerSession.toolTabId != null) return;
    if (!schmerSession.expectedToolUrl) return;
    if (changeInfo.status === 'complete' || changeInfo.url) {
      const url = changeInfo.url || tab?.url;
      if (urlMatchesExpected(url)) {
        schmerSession.toolTabId = tabId;
      }
    }
  } catch {}
});

chrome.tabs.onCreated.addListener((tab) => {
  try {
    if (!schmerSession.active) return;
    if (schmerSession.toolTabId != null) return;
    if (!schmerSession.expectedToolUrl) return;
    if (tab?.url && urlMatchesExpected(tab.url) && tab.id != null) {
      schmerSession.toolTabId = tab.id;
    }
  } catch {}
});
