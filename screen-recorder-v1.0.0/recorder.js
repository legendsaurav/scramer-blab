// Offscreen recorder: manages getDisplayMedia, mic capture, MediaRecorder lifecycle, and download.
let displayStream = null;
let micStream = null;
let mixedStream = null;
let mediaRecorder = null;
let audioContext = null;
let destinationNode = null;
let chunks = [];
let startedAt = null;
let pausedAt = null;
let runningStart = null; // Timestamp when the current recording segment began (resets after resume)
let elapsedMs = 0; // Accumulated recording time excluding the currently running segment
let stopping = false;
let lastStopReason = 'stop-requested';

function sendState(patch) {
  chrome.runtime.sendMessage({ type: 'offscreen-state', state: patch }).catch(() => {});
}

function sendError(message) {
  chrome.runtime.sendMessage({ type: 'offscreen-error', error: message }).catch(() => {});
}

function cleanupStreams() {
  displayStream?.getTracks().forEach((t) => t.stop());
  micStream?.getTracks().forEach((t) => t.stop());
  mixedStream?.getTracks().forEach((t) => t.stop());
  displayStream = null;
  micStream = null;
  mixedStream = null;
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
    destinationNode = null;
  }
}

function buildFileName() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `screen_recording_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.webm`;
}

async function triggerDownload(blob) {
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({
    url,
    filename: buildFileName(),
    saveAs: false
  });
  // Revoke after download kick-off; Chrome keeps internal reference.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function attachTrackEndHandlers(stream) {
  stream?.getTracks().forEach((track) => {
    track.onended = () => {
      if (!stopping) {
        stopping = true;
        sendError('Capture source ended (window/tab closed or permission revoked).');
        stopRecording('Capture source ended (window/tab closed or permission revoked).');
      }
    };
  });
}

function chooseMimeType() {
  const preferred = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return preferred.find((mime) => MediaRecorder.isTypeSupported(mime)) || '';
}

async function startRecording(options) {
  if (mediaRecorder) {
    await stopRecording();
  }
  stopping = false;
  lastStopReason = 'stop-requested';
  chunks = [];
  startedAt = null;
  pausedAt = null;
  runningStart = null;
  elapsedMs = 0;

  try {
    const displayConstraints = {
      video: {
        frameRate: 30,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        // preferCurrentTab is honored when captureMode === 'tab' to reduce user clicks.
        preferCurrentTab: options.captureMode === 'tab'
      },
      audio: options.systemAudio ? { echoCancellation: false, noiseSuppression: false } : false
    };

    displayStream = await navigator.mediaDevices.getDisplayMedia(displayConstraints);
    attachTrackEndHandlers(displayStream);
  } catch (err) {
    sendError(err?.message || 'User cancelled display capture.');
    sendState({ status: 'idle', liveStart: null, lastError: err?.message || 'Capture cancelled.' });
    return;
  }

  if (options.useMic) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 2
        }
      });
      attachTrackEndHandlers(micStream);
    } catch (err) {
      sendError(err?.message || 'Microphone unavailable.');
      sendState({ status: 'idle', liveStart: null, lastError: err?.message || 'Microphone unavailable.' });
      cleanupStreams();
      return;
    }
  }

  const videoTracks = displayStream.getVideoTracks();
  if (!videoTracks.length) {
    sendError('No video track found in display stream.');
    cleanupStreams();
    return;
  }

  // Mix audio tracks (system + mic) into a single destination for MediaRecorder.
  const hasDisplayAudio = displayStream.getAudioTracks().length > 0;
  const hasMicAudio = micStream?.getAudioTracks().length > 0;
  if (hasDisplayAudio || hasMicAudio) {
    audioContext = new AudioContext();
    destinationNode = audioContext.createMediaStreamDestination();

    if (hasDisplayAudio) {
      const displaySource = audioContext.createMediaStreamSource(displayStream);
      displaySource.connect(destinationNode);
    }
    if (hasMicAudio) {
      const micSource = audioContext.createMediaStreamSource(micStream);
      micSource.connect(destinationNode);
    }
    mixedStream = new MediaStream([
      ...videoTracks,
      ...destinationNode.stream.getAudioTracks()
    ]);
  } else {
    mixedStream = new MediaStream([...videoTracks]);
  }

  const mimeType = chooseMimeType();
  try {
    mediaRecorder = new MediaRecorder(mixedStream, mimeType ? { mimeType } : undefined);
  } catch (err) {
    sendError('MediaRecorder unsupported in this browser.');
    cleanupStreams();
    return;
  }

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  mediaRecorder.onstart = () => {
    startedAt = Date.now();
    runningStart = startedAt;
    elapsedMs = 0;
    sendState({ status: 'recording', startedAt, pausedAt: null, elapsedMs, liveStart: runningStart, lastError: null });
  };

  mediaRecorder.onpause = () => {
    const now = Date.now();
    elapsedMs += now - runningStart;
    pausedAt = now;
    runningStart = null;
    sendState({ status: 'paused', startedAt, pausedAt, elapsedMs, liveStart: null, lastError: null });
  };

  mediaRecorder.onresume = () => {
    if (pausedAt) {
      runningStart = Date.now();
      pausedAt = null;
    }
    sendState({ status: 'recording', startedAt, pausedAt: null, elapsedMs, liveStart: runningStart, lastError: null });
  };

  mediaRecorder.onerror = (event) => {
    sendError(event.error?.message || 'Recording error occurred.');
    stopRecording('Recorder error');
  };

  mediaRecorder.onstop = async () => {
    if (!pausedAt && runningStart) {
      elapsedMs += Date.now() - runningStart;
    }
    const totalElapsed = elapsedMs;
    const finalError = lastStopReason !== 'stop-requested' ? lastStopReason : null;
    sendState({ status: 'stopping', startedAt, pausedAt, elapsedMs: totalElapsed, liveStart: null, lastError: finalError });
    if (chunks.length) {
      const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
      await triggerDownload(blob);
    }
    cleanupStreams();
    chunks = [];
    mediaRecorder = null;
    startedAt = null;
    pausedAt = null;
    runningStart = null;
    elapsedMs = 0;
    stopping = false;
    const clearedReason = lastStopReason;
    lastStopReason = 'stop-requested';
    sendState({ status: 'idle', startedAt: null, pausedAt: null, elapsedMs: 0, liveStart: null, lastError: clearedReason !== 'stop-requested' ? clearedReason : null });
  };

  mediaRecorder.start(250); // gather data every 250ms for quick flush
}

async function pauseRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.pause();
  }
}

async function resumeRecording() {
  if (mediaRecorder && mediaRecorder.state === 'paused') {
    mediaRecorder.resume();
  }
}

async function stopRecording(reason = 'stop-requested') {
  stopping = true;
  lastStopReason = reason || 'stop-requested';
  try {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    } else {
      cleanupStreams();
      sendState({ status: 'idle', liveStart: null, lastError: reason });
    }
  } catch (err) {
    sendError(err?.message || 'Failed to stop recording');
    cleanupStreams();
    sendState({ status: 'idle', liveStart: null, lastError: err?.message || null });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.target !== 'offscreen') return;
    try {
      switch (message.type) {
        case 'start-recording':
          await startRecording(message.options || {});
          sendResponse({ ok: true });
          return;
        case 'pause-recording':
          await pauseRecording();
          sendResponse({ ok: true });
          return;
        case 'resume-recording':
          await resumeRecording();
          sendResponse({ ok: true });
          return;
        case 'stop-recording':
          await stopRecording();
          sendResponse({ ok: true });
          return;
        default:
          break;
      }
    } catch (err) {
      sendError(err?.message || 'Unhandled error in offscreen recorder.');
    }
  })();
  return true; // keep channel alive for async
});
