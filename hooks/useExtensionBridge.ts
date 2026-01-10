import { useState, useEffect, useCallback } from 'react';
import { saveLocalRecording } from '../lib/localRecordingStore';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

// Define the message types for type safety
type ExtensionMessage = 
  | { type: 'SCHMER_PONG'; payload?: { version?: string } }
  | { type: 'SCHMER_CONTENT_READY'; payload?: Record<string, any> }
  | { type: 'SCHMER_RECORDING_STARTED'; payload: { tool?: string; software?: string; startTime: number; userId?: string } }
  | { type: 'SCHMER_RECORDING_STOPPING'; payload?: Record<string, any> }
  | { type: 'SCHMER_RECORDING_STOPPED'; payload: any }
  | { type: 'SCHMER_RECORDING_READY'; payload: { blob?: Blob; blobUrl?: string; filename: string; projectId: string; tool: string; userId?: string; startTime?: number } }
  | { type: 'SCHMER_STATUS'; payload?: { state?: 'recording' | 'paused' | 'auto-paused' | 'stopped' } }
  | { type: 'SCHMER_ERROR'; payload: { message: string } };

export interface ExtensionStatus {
  isInstalled: boolean;
  isRecording: boolean;
  currentSession: {
    software: string;
    startTime: number;
  } | null;
  error: string | null;
  version?: string;
}

export const useExtensionBridge = () => {
  const [status, setStatus] = useState<ExtensionStatus>({
    isInstalled: false,
    isRecording: false,
    currentSession: null,
    error: null,
    version: undefined
  });

  // Use backend only if scheme is safe for current page (avoid HTTPS→HTTP mixed content)
  const rawBackend = (import.meta as any)?.env?.VITE_BACKEND_URL as string | undefined;
  const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const backendUrl = rawBackend && (isHttpsPage && rawBackend.startsWith('http://') ? undefined : rawBackend);

  // Inline recording fallback when extension is not available
  let inlineRecorder: MediaRecorder | null = null;
  let inlineChunks: BlobPart[] = [];
  let inlineStartTime: number | null = null;

  const startInlineRecording = async (projectId: string, tool: string, userId?: string) => {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
      const stream = new MediaStream();
      display.getVideoTracks().forEach(t => stream.addTrack(t));
      if (display.getAudioTracks().length) {
        display.getAudioTracks().forEach(t => stream.addTrack(t));
      } else {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          mic.getAudioTracks().forEach(t => stream.addTrack(t));
        } catch {}
      }

      inlineChunks = [];
      inlineStartTime = Date.now();
      inlineRecorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? { mimeType: 'video/webm;codecs=vp9,opus' } : undefined);
      inlineRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) inlineChunks.push(e.data); };
      inlineRecorder.onstop = () => {
        try {
          const blob = new Blob(inlineChunks, { type: 'video/webm' });
          const blobUrl = URL.createObjectURL(blob);
          // Reuse the same protocol message so upload path stays identical
          window.postMessage({ type: 'SCHMER_RECORDING_READY', payload: { filename: `session-${Date.now()}.webm`, projectId, tool, blobUrl, userId, startTime: inlineStartTime || Date.now() } }, '*');
        } catch {}
      };
      inlineRecorder.start(1000);
    } catch (err) {
      window.postMessage({ type: 'SCHMER_ERROR', payload: { message: 'Failed to start inline recording. ' + String((err as any)?.message || err) } }, '*');
    }
  };

  const uploadBlobToBackend = async (blob: Blob, filename: string, projectId: string, tool: string, autoMerge?: boolean) => {
    if (!backendUrl) return false;
    try {
      const form = new FormData();
      form.append('file', blob, filename);
      form.append('projectId', projectId);
      form.append('tool', tool);
      form.append('date', new Date().toISOString().slice(0,10));
      form.append('segment', String(Date.now()));
      const res = await fetch(`${backendUrl}/upload`, { method: 'POST', body: form, mode: 'cors' });
      const ok = res.ok;
      if (ok && autoMerge) {
        await fetch(`${backendUrl}/merge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ projectId, tool, date: new Date().toISOString().slice(0,10) })
        });
      }
      return ok;
    } catch {
      return false;
    }
  };

  const uploadBlobToSupabase = async (blob: Blob, filename: string, projectId: string, tool: string): Promise<{ ok: boolean; path?: string; publicUrl?: string; error?: any }> => {
    try {
      if (!isSupabaseConfigured || !supabase) return { ok: false };
      const sessionId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? (crypto as any).randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
      const dateFolder = new Date().toISOString().slice(0,10);
      // Storage-only structure: <projectId>/<tool>/<YYYY-MM-DD>/<sessionId>.webm
      const path = `${projectId}/${tool}/${dateFolder}/${sessionId}.webm`;
      const { error: upErr } = await (supabase as any).storage.from('recordings').upload(path, blob, { contentType: 'video/webm', upsert: false, cacheControl: '31536000' });
      if (upErr) return { ok: false, error: upErr };
      const { data: pub } = await (supabase as any).storage.from('recordings').getPublicUrl(path);
      return { ok: true, path, publicUrl: pub?.publicUrl };
    } catch (e) {
      return { ok: false, error: e };
    }
  };

  // Listener for messages FROM the extension (Content Script)
  const handleExtensionMessage = useCallback((event: MessageEvent) => {
    // Security: Only accept messages from the same window
    if (event.source !== window) return;

    const message = event.data as ExtensionMessage;

    switch (message.type) {
      case 'SCHMER_PONG':
        setStatus(prev => ({ ...prev, isInstalled: true, version: (message.payload as any)?.version }));
        break;
      case 'SCHMER_CONTENT_READY':
        // Content script is injected and signaling readiness; treat as installed
        setStatus(prev => ({ ...prev, isInstalled: true }));
        break;
      
      case 'SCHMER_RECORDING_STARTED':
        setStatus(prev => ({
          ...prev,
          isRecording: true,
          error: null,
          currentSession: {
            software: message.payload.tool || message.payload.software || 'unknown',
            startTime: message.payload.startTime || Date.now()
          }
        }));
        break;

      case 'SCHMER_RECORDING_STOPPED':
        setStatus(prev => ({
          ...prev,
          isRecording: false,
          currentSession: null
        }));
        break;

      case 'SCHMER_RECORDING_READY': {
        const { blob, blobUrl, filename, projectId, tool, userId, startTime } = message.payload as any;
        const handleUpload = async () => {
          try {
            let b: Blob | null = blob || null;
            if (!b && blobUrl) {
              try {
                // Fetching a blob: URL should not use CORS mode; Chrome may reject it
                const resp = await fetch(blobUrl);
                b = await resp.blob();
                try { URL.revokeObjectURL(blobUrl); } catch {}
              } catch {}
            }
            if (b) {
              // Always persist locally for immediate UI availability
              try {
                await saveLocalRecording({
                  id: `${projectId}:${tool}:${Date.now()}`,
                  projectId,
                  tool,
                  date: new Date().toISOString().slice(0,10),
                  filename,
                  blob: b
                });
              } catch {}

              // Prefer Supabase Storage if configured
              const supaRes = await uploadBlobToSupabase(b, filename, projectId, tool);
              if (!supaRes.ok) {
                // Fallback to custom backend if configured
                const ok = await uploadBlobToBackend(b, filename, projectId, tool, true);
                if (!ok) {
                  // As a last resort, trigger browser download
                  const url = URL.createObjectURL(b);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                }
                try {
                  window.postMessage({ type: 'SCHMER_UPLOAD_ERR', payload: { projectId, tool, error: String(supaRes.error?.message || supaRes.error || 'Upload failed') } }, '*');
                } catch {}
              } else {
                // Broadcast upload success with public URL for UI/analytics
                try {
                  window.postMessage({ type: 'SCHMER_UPLOAD_OK', payload: { projectId, tool, path: supaRes.path, publicUrl: supaRes.publicUrl } }, '*');
                } catch {}
                // Insert session metadata for Weekly Time Spent dashboard
                try {
                  if (isSupabaseConfigured && supabase) {
                    const started = typeof startTime === 'number' ? startTime : (status.currentSession?.startTime || Date.now());
                    const durationSecs = Math.max(1, Math.floor((Date.now() - started) / 1000));
                    const hh = String(Math.floor(durationSecs / 3600)).padStart(2, '0');
                    const mm = String(Math.floor((durationSecs % 3600) / 60)).padStart(2, '0');
                    const ss = String(durationSecs % 60).padStart(2, '0');
                    const total_duration = `${hh}:${mm}:${ss}`;
                    const dateIso = new Date().toISOString();
                    await (supabase as any).from('sessions').insert({
                      id: (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? (crypto as any).randomUUID() : undefined,
                      project_id: projectId,
                      user_id: userId || null,
                      software: tool,
                      date: dateIso,
                      total_duration,
                      session_count: 1,
                      status: 'ready'
                    });
                  }
                } catch {}
              }
              // Notify UI to refresh sessions regardless of upload path
              window.postMessage({ type: 'SCHMER_REFRESH_SESSIONS', payload: { projectId } }, '*');
            }
          } catch {}
        };
        handleUpload();
        break;
      }

      case 'SCHMER_ERROR':
        setStatus(prev => ({ ...prev, error: message.payload.message }));
        break;

      case 'SCHMER_STATUS': {
        const state = (message.payload && (message.payload as any).state) || undefined;
        if (state) {
          setStatus(prev => ({
            ...prev,
            isRecording: state === 'recording',
          }));
        }
        break;
      }

      case 'SCHMER_RECORDING_STOPPING':
        setStatus(prev => ({ ...prev, isRecording: false }));
        break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleExtensionMessage);

    // Ping the extension repeatedly until we get a Pong
    // This detects if the extension is installed/active
    const pingInterval = setInterval(() => {
      if (!status.isInstalled) {
        window.postMessage({ type: 'SCHMER_PING' }, '*');
      }
    }, 1000);

    return () => {
      window.removeEventListener('message', handleExtensionMessage);
      clearInterval(pingInterval);
    };
  }, [handleExtensionMessage, status.isInstalled]);

  const startSession = (software: string, url: string, projectId: string, options?: Record<string, any>) => {
    // If extension is present, request recording first to preserve user activation
    if (status.isInstalled) {
      window.postMessage({ type: 'SCHMER_START_RECORDING', payload: { projectId, tool: software, userId: options?.userId, options: { ...(options || {}), toolUrl: url, openInExtension: false } } }, '*');
    } else {
      // Fallback: record inline within the page context
      startInlineRecording(projectId, software, options?.userId);
    }

    // Open the tool tab after we request recording
    try { window.open(url, '_blank'); } catch {}
  };

  const stopSession = () => {
    if (status.isInstalled) {
      window.postMessage({ type: 'SCHMER_STOP_RECORDING' }, '*');
    }
    if (inlineRecorder) {
      try { inlineRecorder.stop(); } catch {}
      inlineRecorder = null;
    }
  };

  return {
    extensionStatus: status,
    startSession,
    stopSession
  };
};