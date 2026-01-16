(function () {
  let mediaRecorder = null;
  let chunks = [];
  let capturing = false;

  function post(type, payload) {
    try { window.postMessage({ type, payload }, "*"); } catch {}
  }

  function resolveToolSlug(rawTool) {
    const safeTool = (rawTool || 'unknown').toString().trim();
    if (!safeTool) return 'unknown';

    const TOOL_FOLDER_MAP = {
      'Arduino': 'arduino_idle',
      'AutoCAD': 'autocad',
      'SolidWorks': 'solidworks',
      'MATLAB': 'matlab',
      'VS Code': 'vscode',
      'Proteus': 'proteus',
      'GitHub': 'github'
    };

    if (Object.prototype.hasOwnProperty.call(TOOL_FOLDER_MAP, safeTool)) {
      return TOOL_FOLDER_MAP[safeTool];
    }

    const lower = safeTool.toLowerCase();
    const aliases = [
      { slug: 'arduino_idle', names: ['arduino', 'arduino ide', 'arduino-ide', 'arduino_idle'] },
      { slug: 'autocad', names: ['autocad', 'auto cad'] },
      { slug: 'solidworks', names: ['solidworks', 'solid works'] },
      { slug: 'matlab', names: ['matlab'] },
      { slug: 'vscode', names: ['vs code', 'vscode', 'visual studio code'] },
      { slug: 'proteus', names: ['proteus'] },
      { slug: 'github', names: ['github', 'git hub'] }
    ];

    for (const entry of aliases) {
      if (entry.names.some((name) => name === lower)) {
        return entry.slug;
      }
    }

    return lower.replace(/\s+/g, '_');
  }

  function buildSessionFilename(userName, rawTool) {
    const safeUser = (userName || 'user').toString().trim().toLowerCase();
    const userSlug = safeUser
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'user';

    const toolSlug = resolveToolSlug(rawTool || 'unknown');

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

    return `session-${date}_${time}_${userSlug}_${toolSlug}.webm`;
  }

  // Immediately announce presence
  console.log("[schmer-ext] content-script injected");
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
    // Stamp a start time if not provided
    if (!opts?.startTime) {
      try { opts.startTime = Date.now(); } catch {}
    }

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
      console.log("[schmer-ext] recording stopped, chunks:", chunks.length);
      try {
        const blob = new Blob(chunks, { type: mime || "video/webm" });
        const blobUrl = URL.createObjectURL(blob);
        const tool = opts?.tool || "unknown";
        const filename = buildSessionFilename(opts?.userName, tool);
        post("SCHMER_RECORDING_READY", {
          filename,
          projectId: opts?.projectId || "unknown",
          tool,
          blobUrl,
          userId: opts?.userId,
          userName: opts?.userName,
          startTime: opts?.startTime,
          // Also send the blob directly to avoid blob: URL fetch issues
          blob
        });
      } catch {}
    };

    mediaRecorder.start(1000); // gather chunks every second
    console.log("[schmer-ext] recording started");
  }

  function stopRecording() {
    if (!capturing) return;
    capturing = false;
    try {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(t => t.stop());
    } catch {}
    console.log("[schmer-ext] stopRecording invoked");
  }

  // Listen to page → extension messages
  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "SCHMER_PING":
        console.log("[schmer-ext] <- SCHMER_PING");
        post("SCHMER_PONG", { version: "1.0.0" });
        break;
      case "SCHMER_START_RECORDING":
        console.log("[schmer-ext] <- SCHMER_START_RECORDING", msg.payload);
        try {
          await startRecording(msg.payload || {});
          post("SCHMER_RECORDING_STARTED", { tool: msg.payload?.tool, userId: msg.payload?.userId, startTime: Date.now() });
        } catch (e) {
          console.error("[schmer-ext] startRecording error", e);
          post("SCHMER_ERROR", { message: String(e?.message || e || "Failed to start recording") });
        }
        break;
      case "SCHMER_STOP_RECORDING":
        console.log("[schmer-ext] <- SCHMER_STOP_RECORDING");
        stopRecording();
        post("SCHMER_RECORDING_STOPPED", {});
        break;
    }
  }, false);
})();
