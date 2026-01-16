// Schmer Bridge Content Script
// Listens for window messages from Schmer app and coordinates with extension

(function init() {
  const EXTENSION_NS = 'SCHMER';
  let activeSession = null; // { projectId, tool, userId, userName, source: 'schmer', autoPaused }

  function log(...args) {
    // Comment out to silence
    console.log('[SCHMER-CS]', ...args);
  }

  // Utility: post message to page
  function postToPage(type, payload = {}) {
    window.postMessage({ source: EXTENSION_NS, type, payload }, '*');
  }

  // Visibility-based auto-pause
  function handleVisibilityChange() {
    const visible = document.visibilityState === 'visible';
    chrome.runtime.sendMessage({ action: 'SCHMER_VISIBILITY', visible }).catch(() => {});
  }

  document.addEventListener('visibilitychange', handleVisibilityChange, false);

  // Receive messages from page
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const data = event.data || {};
    if (!data || (typeof data !== 'object')) return;

    // Only handle explicit SCHMER messages
    const type = data.type;
    if (!type || !String(type).startsWith('SCHMER_')) return;

    log('page->ext', type, data.payload || {});

    try {
      switch (type) {
        case 'SCHMER_PING': {
          // Passive detection handshake
          const resp = await chrome.runtime.sendMessage({ action: 'SCHMER_HANDSHAKE' });
          postToPage('SCHMER_PONG', { detected: resp?.ok !== false, version: resp?.version || null });
          break;
        }
        case 'SCHMER_START_RECORDING': {
          const { projectId, tool, userId, userName, options } = data.payload || {};
          activeSession = {
            projectId: projectId || null,
            tool: tool || null,
            userId: userId || null,
            userName: userName || null,
            source: 'schmer',
            autoPaused: false
          };
          const resp = await chrome.runtime.sendMessage({
            action: 'SCHMER_START_RECORDING',
            projectId: activeSession.projectId,
            tool: activeSession.tool,
            userId: activeSession.userId,
            userName: activeSession.userName,
            options: options || {}
          });
          if (resp?.success) {
            postToPage('SCHMER_RECORDING_STARTED', { projectId: activeSession.projectId, tool: activeSession.tool });
          } else {
            postToPage('SCHMER_ERROR', { message: resp?.error || 'Failed to start recording' });
          }
          break;
        }
        case 'SCHMER_STOP_RECORDING': {
          const resp = await chrome.runtime.sendMessage({ action: 'SCHMER_STOP_RECORDING' });
          if (!resp?.success) {
            postToPage('SCHMER_ERROR', { message: resp?.error || 'Failed to stop recording' });
          } else {
            postToPage('SCHMER_RECORDING_STOPPING', {});
          }
          break;
        }
        default:
          break;
      }
    } catch (err) {
      postToPage('SCHMER_ERROR', { message: err?.message || String(err) });
    }
  });

  // Receive messages from background and relay to page
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      if (!message || typeof message !== 'object') return;
      switch (message.type) {
        case 'SCHMER_STATUS':
          postToPage('SCHMER_STATUS', message.payload || {});
          break;
        case 'SCHMER_RECORDING_READY': {
          // message: { blob (Blob)?, blobUrl?, filename, projectId, tool, userId?, userName? }
          try {
            const { blob, blobUrl, filename, projectId, tool, userId, userName } = message;
            postToPage('SCHMER_RECORDING_READY', { blob, blobUrl, filename, projectId, tool, userId, userName });
          } catch (e) {
            postToPage('SCHMER_ERROR', { message: e?.message || 'Failed to deliver recording' });
          }
          break;
        }
        case 'SCHMER_RECORDING_STOPPED':
          postToPage('SCHMER_RECORDING_STOPPED', message.payload || {});
          break;
        case 'SCHMER_ERROR':
          postToPage('SCHMER_ERROR', { message: message.message || 'Unknown error' });
          break;
        default:
          break;
      }
    })();
    return false;
  });

  // Initial ping support: let page know content script is ready
  postToPage('SCHMER_CONTENT_READY', {});
  handleVisibilityChange();
  log('initialized');
})();
