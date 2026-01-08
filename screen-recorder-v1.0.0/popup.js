// ============================================
// POPUP - USER INTERFACE ONLY
// ============================================
// Responsibilities:
// 1. Render UI buttons
// 2. Send messages to service worker
// 3. Update timer
// 4. Handle user clicks
//
// CRITICAL: This file DOES NOT contain:
// ✗ MediaRecorder
// ✗ getUserMedia()
// ✗ Display media API
// ✗ Any DOM media elements
//
// When popup closes, recording continues
// Service worker keeps offscreen alive
// ============================================

// DOM elements
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const resumeBtn = document.getElementById('resumeBtn');
const stopBtnPaused = document.getElementById('stopBtnPaused');

const controlsStart = document.getElementById('controlsStart');
const controlsRecording = document.getElementById('controlsRecording');
const controlsPaused = document.getElementById('controlsPaused');

const timerDisplay = document.getElementById('timer');
const displayModeSelect = document.getElementById('displayMode');
const includeAudioCheckbox = document.getElementById('includeAudio');
const includeMicrophoneCheckbox = document.getElementById('includeMicrophone');
const notice = document.getElementById('notice');

// State
let recordingStartTime = null;
let timerInterval = null;
let recordingState = 'stopped';

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  updateUI();

  // Event listeners
  startBtn.addEventListener('click', handleStartRecording);
  pauseBtn.addEventListener('click', handlePauseRecording);
  stopBtn.addEventListener('click', handleStopRecording);
  resumeBtn.addEventListener('click', handleResumeRecording);
  stopBtnPaused.addEventListener('click', handleStopRecording);
});

// ============================================
// STATE MANAGEMENT
// ============================================

async function loadState() {
  if (chrome.storage && chrome.storage.local) {
    const result = await chrome.storage.local.get([
      'recordingState',
      'recordingStartTime'
    ]);
    recordingState = result.recordingState || 'stopped';
    recordingStartTime = result.recordingStartTime || null;
    console.log('[POPUP] State loaded:', recordingState);
  } else {
    recordingState = 'stopped';
    recordingStartTime = null;
    console.warn('[POPUP] chrome.storage.local is not available');
  }
}

async function saveState() {
  if (chrome.storage && chrome.storage.local) {
    await chrome.storage.local.set({
      recordingState,
      recordingStartTime
    });
  } else {
    console.warn('[POPUP] chrome.storage.local is not available, state not saved');
  }
}

function updateUI() {
  // Hide all control groups
  controlsStart.classList.add('hidden');
  controlsRecording.classList.add('hidden');
  controlsPaused.classList.add('hidden');

  // Show notice only when recording
  if (recordingState === 'recording') {
    notice.style.display = 'block';
  } else {
    notice.style.display = 'none';
  }

  // Show appropriate controls
  switch (recordingState) {
    case 'stopped':
      controlsStart.classList.remove('hidden');
      displayModeSelect.disabled = false;
      includeAudioCheckbox.disabled = false;
      includeMicrophoneCheckbox.disabled = false;
      stopTimer();
      break;

    case 'recording':
      controlsRecording.classList.remove('hidden');
      displayModeSelect.disabled = true;
      includeAudioCheckbox.disabled = true;
      includeMicrophoneCheckbox.disabled = true;
      startTimer();
      break;

    case 'paused':
      controlsPaused.classList.remove('hidden');
      displayModeSelect.disabled = true;
      includeAudioCheckbox.disabled = true;
      includeMicrophoneCheckbox.disabled = true;
      stopTimer();
      break;
  }

  // Update timer display color
  if (recordingState === 'stopped') {
    timerDisplay.classList.add('stopped');
    timerDisplay.classList.remove('paused');
  } else if (recordingState === 'paused') {
    timerDisplay.classList.add('paused');
    timerDisplay.classList.remove('stopped');
  } else {
    timerDisplay.classList.remove('stopped');
    timerDisplay.classList.remove('paused');
  }
}

// ============================================
// TIMER
// ============================================

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    if (recordingStartTime) {
      const elapsed = Date.now() - recordingStartTime;
      const seconds = Math.floor(elapsed / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);

      const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

      timerDisplay.textContent = formattedTime;
    }
  }, 100);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ============================================
// BUTTON HANDLERS
// ============================================

async function handleStartRecording() {
  console.log('[POPUP] Start recording clicked');

  try {
    // Disable button to prevent double-clicks
    startBtn.disabled = true;

    const response = await chrome.runtime.sendMessage({
      action: 'START_RECORDING',
      displayMode: displayModeSelect.value,
      includeAudio: includeAudioCheckbox.checked,
      includeMicrophone: includeMicrophoneCheckbox.checked
    });

    if (response.success) {
      recordingState = 'recording';
      recordingStartTime = Date.now();
      await saveState();
      updateUI();
    } else {
      alert('Error starting recording: ' + response.error);
      startBtn.disabled = false;
    }
  } catch (error) {
    console.error('[POPUP] Error:', error);
    alert('Error: ' + error.message);
    startBtn.disabled = false;
  }
}

async function handlePauseRecording() {
  console.log('[POPUP] Pause recording clicked');

  try {
    pauseBtn.disabled = true;

    const response = await chrome.runtime.sendMessage({
      action: 'PAUSE_RECORDING'
    });

    if (response.success) {
      recordingState = 'paused';
      await saveState();
      updateUI();
    } else {
      alert('Error pausing recording: ' + response.error);
      pauseBtn.disabled = false;
    }
  } catch (error) {
    console.error('[POPUP] Error:', error);
    alert('Error: ' + error.message);
    pauseBtn.disabled = false;
  }
}

async function handleResumeRecording() {
  console.log('[POPUP] Resume recording clicked');

  try {
    resumeBtn.disabled = true;

    const response = await chrome.runtime.sendMessage({
      action: 'RESUME_RECORDING'
    });

    if (response.success) {
      recordingState = 'recording';
      await saveState();
      updateUI();
    } else {
      alert('Error resuming recording: ' + response.error);
      resumeBtn.disabled = false;
    }
  } catch (error) {
    console.error('[POPUP] Error:', error);
    alert('Error: ' + error.message);
    resumeBtn.disabled = false;
  }
}

async function handleStopRecording() {
  console.log('[POPUP] Stop recording clicked');

  try {
    // Disable all stop buttons
    stopBtn.disabled = true;
    stopBtnPaused.disabled = true;

    const response = await chrome.runtime.sendMessage({
      action: 'STOP_RECORDING'
    });

    if (response.success) {
      recordingState = 'stopped';
      recordingStartTime = null;
      await saveState();
      updateUI();

      // Show success message
      timerDisplay.textContent = 'Downloaded!';
      setTimeout(() => {
        timerDisplay.textContent = '00:00:00';
      }, 2000);
    } else {
      alert('Error stopping recording: ' + response.error);
      stopBtn.disabled = false;
      stopBtnPaused.disabled = false;
    }
  } catch (error) {
    console.error('[POPUP] Error:', error);
    alert('Error: ' + error.message);
    stopBtn.disabled = false;
    stopBtnPaused.disabled = false;
  }
}

console.log('[POPUP] Popup script loaded');
