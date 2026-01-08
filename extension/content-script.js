(function () {
  let mediaRecorder = null;
  let chunks = [];
  let capturing = false;

  function post(type, payload) {
    try { window.postMessage({ type, payload }, "*"); } catch {}
  }

  // Immediately announce presence
  post("SCHMER_PONG", { version: "1.0.0" });

  function pickMime() {
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported?.(c)) return c;
    }
    return undefined;
  }

  async function buildCaptureStream(opts) {
    // Get screen/tab + (optionally) mic
    const display = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true
    });

    let finalStream = new MediaStream();
    display.getVideoTracks().forEach(t => finalStream.addTrack(t));

    // If display has no audio track, try mic
    if (!display.getAudioTracks().length) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        mic.getAudioTracks().forEach(t => finalStream.addTrack(t));
      } catch {}
    } else {
      display.getAudioTracks().forEach(t => finalStream.addTrack(t));
    }

    return finalStream;
  }

  async function startRecording(opts) {
    if (capturing) return;

    const stream = await buildCaptureStream(opts);
    chunks = [];
    capturing = true;

    const mime = pickMime();
    try {
      mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch (e) {
      mediaRecorder = new MediaRecorder(stream);
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      try {
        const blob = new Blob(chunks, { type: mime || "video/webm" });
        const blobUrl = URL.createObjectURL(blob);
        post("SCHMER_RECORDING_READY", {
          filename: `session-${Date.now()}.webm`,
          projectId: opts?.projectId || "unknown",
          tool: opts?.tool || "unknown",
          blobUrl
          // Alternatively, send the blob directly:
          // blob
        });
      } catch {}
    };

    mediaRecorder.start(1000); // gather chunks every second
  }

  function stopRecording() {
    if (!capturing) return;
    capturing = false;
    try {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(t => t.stop());
    } catch {}
  }

  // Listen to page → extension messages
  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "SCHMER_PING":
        post("SCHMER_PONG", { version: "1.0.0" });
        break;
      case "SCHMER_START_RECORDING":
        try {
          await startRecording(msg.payload || {});
          post("SCHMER_RECORDING_STARTED", { tool: msg.payload?.tool, startTime: Date.now() });
        } catch (e) {
          post("SCHMER_ERROR", { message: String(e?.message || e || "Failed to start recording") });
        }
        break;
      case "SCHMER_STOP_RECORDING":
        stopRecording();
        post("SCHMER_RECORDING_STOPPED", {});
        break;
    }
  }, false);
})();
