// ============================================
// OFFSCREEN DOCUMENT - MEDIARECORDER CORE
// ============================================
// This is where all media capture happens.
// Offscreen survives tab switches, popup closes, etc.
//
// Why offscreen?
// - getUserMedia() requires user-visible DOM
// - MediaRecorder needs continuous context
// - Audio mixing via Web Audio API needs DOM
// - Display media needs DOM context
//
// Service worker can't do this (no DOM, can suspend)
// ============================================

let mediaRecorder = null;
let recordedChunks = [];
let currentStream = null;
let audioContext = null;
let tabStream = null;
let micStream = null;
let port = null;

// Elements
const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');

// ============================================
// PORT COMMUNICATION
// ============================================

chrome.runtime.onConnect.addListener((incomingPort) => {
  if (incomingPort.name === 'offscreen-channel') {
    port = incomingPort;
    console.log('[OFFSCREEN] Connected to service worker');

    port.onMessage.addListener(handleMessage);
    port.onDisconnect.addListener(() => {
      console.log('[OFFSCREEN] Disconnected from service worker');
      port = null;
      // Don't stop recording on disconnect - user might have minimized popup
    });
  }
});

function sendToServiceWorker(message) {
  if (port) {
    port.postMessage(message);
  } else {
    console.error('[OFFSCREEN] Port not connected');
  }
}

// ============================================
// MESSAGE HANDLERS
// ============================================

async function handleMessage(message) {
  console.log('[OFFSCREEN] Received message:', message.type);

  switch (message.type) {
    case 'START_RECORDING':
      await startRecording(message.data);
      break;

    case 'PAUSE_RECORDING':
      pauseRecording();
      break;

    case 'RESUME_RECORDING':
      resumeRecording();
      break;

    case 'STOP_RECORDING':
      await stopRecording();
      break;

    default:
      console.warn('[OFFSCREEN] Unknown message:', message.type);
  }
}

// ============================================
// RECORDING LOGIC
// ============================================

async function startRecording(config) {
  console.log('[OFFSCREEN] startRecording:', config);

  try {
    // Reset state
    recordedChunks = [];
    
    // Get display media (screen/window/tab)
    const displayStream = await getDisplayMedia(config.displayMode, !!config.includeAudio);
    
    // Get microphone if requested
    let micStream = null;
    if (config.includeMicrophone) {
      try {
        micStream = await getMicrophoneStream();
      } catch (err) {
        console.warn('[OFFSCREEN] Microphone unavailable, continuing without mic:', err?.message || err);
        micStream = null; // continue without mic
      }
    }

    // Combine streams
    currentStream = combineStreams(displayStream, micStream, !!config.includeAudio);

    // Start recording
    startMediaRecorder(currentStream);

    // Notify service worker
    sendToServiceWorker({
      type: 'STATUS_UPDATE',
      data: 'Recording started'
    });

  } catch (error) {
    console.error('[OFFSCREEN] Start recording error:', error);
    sendToServiceWorker({
      type: 'ERROR',
      data: error.message
    });
  }
}

async function getDisplayMedia(displayMode, includeAudio) {
  // displayMode: 'screen', 'window', 'tab'
  try {
    const constraints = {
      audio: includeAudio ? true : false,
      video: {
        frameRate: { ideal: 30, max: 60 }
      }
    };

    const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
    console.log('[OFFSCREEN] Display media obtained:', displayMode);
    
    // Handle stream ending (user clicks stop in browser UI)
    stream.getTracks().forEach(track => {
      track.onended = () => {
        console.log('[OFFSCREEN] User stopped recording from browser UI');
        // Auto-stop if user clicks browser's stop button
        stopRecording();
      };
    });

    return stream;
  } catch (error) {
    console.error('[OFFSCREEN] getDisplayMedia error:', error);
    // Normalize common permission dismissal
    sendToServiceWorker({ type: 'ERROR', data: (error && (error.name || error.message)) || 'Permission dismissed' });
    throw error;
  }
}

async function getMicrophoneStream() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    console.log('[OFFSCREEN] Microphone obtained');
    return stream;
  } catch (error) {
    console.error('[OFFSCREEN] getMicrophoneStream error:', error);
    // Propagate error to caller to decide whether to continue without mic
    throw error;
  }
}

function combineStreams(displayStream, micStream, includeTabAudio) {
  // ============================================
  // CRITICAL: Audio mixing using Web Audio API
  // MediaRecorder only records the FIRST audio track
  // So we must mix all audio into a single track
  // ============================================

  // Start with display video tracks
  const videoTracks = displayStream.getVideoTracks();
  const displayAudioTracks = displayStream.getAudioTracks();
  
  const finalStream = new MediaStream(videoTracks);

  // ============================================
  // Audio mixing strategy:
  // 1. If tab audio + mic: mix together using Web Audio API
  // 2. If just mic: use mic directly
  // 3. If just tab audio: use tab directly
  // 4. Use Web Audio for best compatibility
  // ============================================

  if (displayAudioTracks.length > 0 || micStream) {
    // Initialize audio context if not already done
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    const destination = audioContext.createMediaStreamDestination();

    // Add display audio if available
    if (displayAudioTracks.length > 0 && includeTabAudio) {
      const displayAudioStream = new MediaStream(displayAudioTracks);
      const displayAudioSource = audioContext.createMediaStreamSource(displayAudioStream);
      displayAudioSource.connect(destination);
      console.log('[OFFSCREEN] Tab audio added to mix');
    }

    // Add microphone audio if available
    if (micStream) {
      const micAudioSource = audioContext.createMediaStreamSource(micStream);
      micAudioSource.connect(destination);
      console.log('[OFFSCREEN] Microphone audio added to mix');
    }

    // Add mixed audio tracks to final stream
    destination.stream.getAudioTracks().forEach(track => {
      finalStream.addTrack(track);
    });
  }

  console.log('[OFFSCREEN] Stream combined - video tracks:', videoTracks.length, 
              'audio tracks:', finalStream.getAudioTracks().length);

  return finalStream;
}

function startMediaRecorder(stream) {
  // ============================================
  // CRITICAL: This is the actual MediaRecorder
  // It MUST be in this offscreen document
  // Service worker cannot do this (no DOM)
  // ============================================

  // Choose codec carefully - VP8 + Opus for maximum compatibility
  const mimeType = 'video/webm;codecs=vp8,opus';
  
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    console.warn('[OFFSCREEN] Preferred MIME type not supported, using default');
  }

  mediaRecorder = new MediaRecorder(stream, { mimeType });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
      console.log('[OFFSCREEN] Data chunk received:', event.data.size, 'bytes');
    }
  };

  mediaRecorder.onerror = (event) => {
    console.error('[OFFSCREEN] MediaRecorder error:', event.error);
    sendToServiceWorker({
      type: 'ERROR',
      data: 'Recording error: ' + event.error
    });
  };

  mediaRecorder.onstop = () => {
    console.log('[OFFSCREEN] MediaRecorder stopped');
  };

  mediaRecorder.start(1000); // Collect data every 1 second
  console.log('[OFFSCREEN] MediaRecorder started');
}

function pauseRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.pause();
    console.log('[OFFSCREEN] Recording paused');
  }
}

function resumeRecording() {
  if (mediaRecorder && mediaRecorder.state === 'paused') {
    mediaRecorder.resume();
    console.log('[OFFSCREEN] Recording resumed');
  }
}

async function stopRecording() {
  if (!mediaRecorder) {
    console.warn('[OFFSCREEN] No active recording to stop');
    // Inform SW to reset state gracefully
    sendToServiceWorker({ type: 'STATUS_UPDATE', data: 'No active recording' });
    return;
  }

  try {
    // Stop media recorder
    await new Promise((resolve) => {
      mediaRecorder.onstop = resolve;
      mediaRecorder.stop();
    });

    console.log('[OFFSCREEN] MediaRecorder stopped, chunks:', recordedChunks.length);

    // Stop all tracks
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
    }

    // Create blob from chunks
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
    console.log('[OFFSCREEN] Blob created:', blob.size, 'bytes');

    // Create download URL
    const blobUrl = URL.createObjectURL(blob);

    // Generate timestamped filename
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `screen-recording-${dateStr}.webm`;

    // Send to service worker for download
    sendToServiceWorker({
      type: 'RECORDING_STOPPED',
      data: {
        blobUrl,
        mimeType: mediaRecorder.mimeType,
        filename
      }
    });

    // Reset state
    mediaRecorder = null;
    recordedChunks = [];
    currentStream = null;

  } catch (error) {
    console.error('[OFFSCREEN] Stop recording error:', error);
    sendToServiceWorker({
      type: 'ERROR',
      data: 'Stop recording error: ' + error.message
    });
  }
}

console.log('[OFFSCREEN] Offscreen document loaded and ready');
