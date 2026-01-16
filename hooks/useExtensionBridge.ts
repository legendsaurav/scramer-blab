import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

function resolveToolSlug(rawTool?: string | null): string {
  const safeTool = (rawTool || 'unknown').toString().trim();
  if (!safeTool) return 'unknown';

  const TOOL_FOLDER_MAP: Record<string, string> = {
    Arduino: 'arduino_idle',
    AutoCAD: 'autocad',
    SolidWorks: 'solidworks',
    MATLAB: 'matlab',
    'VS Code': 'vscode',
    Proteus: 'proteus',
    GitHub: 'github',
  };

  if (Object.prototype.hasOwnProperty.call(TOOL_FOLDER_MAP, safeTool)) {
    return TOOL_FOLDER_MAP[safeTool];
  }

  const lower = safeTool.toLowerCase();
  const aliases: { slug: string; names: string[] }[] = [
    { slug: 'arduino_idle', names: ['arduino', 'arduino ide', 'arduino-ide', 'arduino_idle'] },
    { slug: 'autocad', names: ['autocad', 'auto cad'] },
    { slug: 'solidworks', names: ['solidworks', 'solid works'] },
    { slug: 'matlab', names: ['matlab'] },
    { slug: 'vscode', names: ['vs code', 'vscode', 'visual studio code'] },
    { slug: 'proteus', names: ['proteus'] },
    { slug: 'github', names: ['github', 'git hub'] },
  ];

  for (const entry of aliases) {
    if (entry.names.some((name) => name === lower)) {
      return entry.slug;
    }
  }

  return lower.replace(/\s+/g, '_');
}

function buildSessionFilename(userName: string | undefined, rawTool: string | undefined): string {
  const safeUser = (userName || 'user').toString().trim().toLowerCase();
  const userSlug = safeUser
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'user';

  const toolSlug = resolveToolSlug(rawTool || 'unknown');

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

  return `session-${date}_${time}_${userSlug}_${toolSlug}.webm`;
}

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
    version: undefined,
  });

  // Use a static import.meta.env access so Vite can inline VITE_BACKEND_URL.
  // If it's not set, fall back to the local backend so uploads still work
  // without extra env configuration.
  const backendUrl = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:3000';

  let inlineRecorder: MediaRecorder | null = null;
  let inlineChunks: BlobPart[] = [];
  let inlineStartTime: number | null = null;
  // Remember the last resolved user identity for the active recording,
  // so we can attach it to SCHMER_RECORDING_READY payloads that don't
  // explicitly include userId/userName from the extension bridge.
  let lastUserId: string | undefined;
  let lastUserName: string | undefined;

  const startInlineRecording = async (projectId: string, tool: string, userId?: string, userName?: string) => {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
      const stream = new MediaStream();
      display.getVideoTracks().forEach((t) => stream.addTrack(t));
      if (display.getAudioTracks().length) {
        display.getAudioTracks().forEach((t) => stream.addTrack(t));
      } else {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          mic.getAudioTracks().forEach((t) => stream.addTrack(t));
        } catch {}
      }

      inlineChunks = [];
      inlineStartTime = Date.now();
      inlineRecorder = new MediaRecorder(
        stream,
        MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? { mimeType: 'video/webm;codecs=vp9,opus' }
          : undefined,
      );
      inlineRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) inlineChunks.push(e.data);
      };
      inlineRecorder.onstop = () => {
        try {
          const blob = new Blob(inlineChunks, { type: 'video/webm' });
          const blobUrl = URL.createObjectURL(blob);
          const filename = buildSessionFilename(userName, tool);
          window.postMessage(
            {
              type: 'SCHMER_RECORDING_READY',
              payload: {
                filename,
                projectId,
                tool,
                blobUrl,
                userId,
                userName,
                startTime: inlineStartTime || Date.now(),
              },
            },
            '*',
          );
        } catch {}
      };
      inlineRecorder.start(1000);
    } catch (err) {
      window.postMessage(
        {
          type: 'SCHMER_ERROR',
          payload: { message: 'Failed to start inline recording. ' + String((err as any)?.message || err) },
        },
        '*',
      );
    }
  };

  const uploadBlobToBackend = async ({
    blob,
    filename,
    projectId,
    tool,
    userId,
    userName,
    autoMerge,
  }: {
    blob: Blob;
    filename: string;
    projectId: string;
    tool: string;
    userId?: string;
    userName?: string;
    autoMerge?: boolean;
  }): Promise<{ ok: boolean; url?: string }> => {
    if (!backendUrl) return { ok: false };
    try {
      const form = new FormData();
      // Minimal contract: just send the blob and IDs; backend handles disk write.
      form.append('video', blob, filename);
      form.append('project_id', projectId);
      form.append('tool', tool);
      form.append('session_id', crypto.randomUUID());
      if (userId) form.append('user_id', userId);
      if (userName) form.append('user_name', userName);

      const res = await fetch(`${backendUrl}/api/upload`, { method: 'POST', body: form, mode: 'cors' });
      const ok = res.ok;
      let url: string | undefined;
      if (ok) {
        try {
          const json = await res.json();
          if (json && typeof json.url === 'string') {
            url = json.url as string;
          }
        } catch {}
      }

      if (ok && autoMerge) {
        try {
          await fetch(`${backendUrl}/merge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ projectId, tool, date: new Date().toISOString().slice(0, 10) }),
          });
        } catch {}
      }
      return { ok, url };
    } catch {
      return { ok: false };
    }
  };

  const handleExtensionMessage = useCallback((event: MessageEvent) => {
    if (event.source !== window) return;
    const message = event.data as ExtensionMessage;

    switch (message.type) {
      case 'SCHMER_PONG':
        setStatus((prev) => ({ ...prev, isInstalled: true, version: (message.payload as any)?.version }));
        break;
      case 'SCHMER_CONTENT_READY':
        setStatus((prev) => ({ ...prev, isInstalled: true }));
        break;
      case 'SCHMER_RECORDING_STARTED':
        setStatus((prev) => ({
          ...prev,
          isRecording: true,
          error: null,
          currentSession: {
            software: message.payload.tool || message.payload.software || 'unknown',
            startTime: message.payload.startTime || Date.now(),
          },
        }));
        break;
      case 'SCHMER_RECORDING_STOPPED':
        setStatus((prev) => ({ ...prev, isRecording: false, currentSession: null }));
        break;
      case 'SCHMER_RECORDING_READY': {
        const { blob, blobUrl, filename, projectId, tool, userId, userName } = message.payload as any;
        const effectiveUserId = userId || lastUserId;
        const effectiveUserName = userName || lastUserName;
        (async () => {
          try {
            let b: Blob | null = blob || null;
            if (!b && blobUrl) {
              try {
                const resp = await fetch(blobUrl);
                b = await resp.blob();
                try {
                  URL.revokeObjectURL(blobUrl);
                } catch {}
              } catch {}
            }
            if (!b) return;

            const { ok, url } = await uploadBlobToBackend({
              blob: b,
              filename,
              projectId,
              tool,
              userId: effectiveUserId,
              userName: effectiveUserName,
              autoMerge: true,
            });

            // No browser download or local saving: just notify UI about success/failure
            if (ok) {
              try {
                window.postMessage({ type: 'SCHMER_UPLOAD_OK', payload: { projectId, tool, url } }, '*');
              } catch {}
            } else {
              try {
                window.postMessage({ type: 'SCHMER_UPLOAD_ERR', payload: { projectId, tool, error: 'Upload failed' } }, '*');
              } catch {}
            }

            window.postMessage({ type: 'SCHMER_REFRESH_SESSIONS', payload: { projectId } }, '*');
          } catch {}
        })();
        break;
      }
      case 'SCHMER_ERROR':
        setStatus((prev) => ({ ...prev, error: message.payload.message }));
        break;
      case 'SCHMER_STATUS': {
        const state = message.payload?.state;
        if (state) {
          setStatus((prev) => ({ ...prev, isRecording: state === 'recording' }));
        }
        break;
      }
      case 'SCHMER_RECORDING_STOPPING':
        setStatus((prev) => ({ ...prev, isRecording: false }));
        break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleExtensionMessage);
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

  const startSession = async (software: string, url: string, projectId: string, options?: Record<string, any>) => {
    // Derive user identity from options, global App-level vars, or Supabase session
    let userId = options?.userId as string | undefined;
    let userName = options?.userName as string | undefined;

    try {
      const anyWin = window as any;
      if (!userId && anyWin.SCHMER_CURRENT_USER_ID) {
        userId = String(anyWin.SCHMER_CURRENT_USER_ID || '');
      }
      if (!userName && anyWin.SCHMER_CURRENT_USER_NAME) {
        userName = String(anyWin.SCHMER_CURRENT_USER_NAME || '');
      }
    } catch {}

    // Final fallback: query Supabase directly for current user profile
    if ((!userId || !userName) && isSupabaseConfigured && supabase) {
      try {
        const { data: sessionRes } = await supabase.auth.getSession();
        const u = sessionRes?.session?.user;
        if (u) {
          if (!userId) userId = u.id;
          if (!userName) {
            const metaName = (u.user_metadata?.full_name as string | undefined) || '';
            userName = metaName || (u.email ? u.email.split('@')[0] : 'user');
          }
        }
      } catch {}
    }

    const effectiveOptions = { ...(options || {}), userId, userName };
    // Cache on the bridge so we can attach identity to
    // SCHMER_RECORDING_READY events that don't carry it.
    lastUserId = userId;
    lastUserName = userName;

    if (status.isInstalled) {
      const toolName = (software || '').toLowerCase();
      const webTools = ['arduino', 'autocad', 'vs code', 'matlab', 'github'];
      const desktopTools = ['proteus', 'solidworks'];
      const isWebTool = webTools.some((k) => toolName.includes(k.toLowerCase()));
      const isDesktopTool = desktopTools.some((k) => toolName.includes(k.toLowerCase()));
      const displayMode = isWebTool ? 'tab' : isDesktopTool ? 'window' : 'screen';

      window.postMessage(
        {
          type: 'SCHMER_START_RECORDING',
          payload: {
            projectId,
            tool: software,
            userId,
            userName,
            options: { ...effectiveOptions, toolUrl: url, openInExtension: false, displayMode },
          },
        },
        '*',
      );
    } else {
      startInlineRecording(projectId, software, userId, userName);
    }

    try {
      if (typeof url === 'string' && /^https?:\/\/localhost(?::\d+)?\/open-solidworks(\/?|$)/.test(url)) {
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
          .then(async (res) => {
            if (!res.ok) {
              const body = await res.json().catch(() => ({} as any));
              const msg = (body as any)?.error || 'Failed to open SolidWorks';
              alert(msg);
            }
          })
          .catch(() => {
            alert('SolidWorks launcher not running on localhost');
          });
      } else {
        window.open(url, '_blank');
      }
    } catch {}
  };

  const stopSession = () => {
    if (status.isInstalled) {
      window.postMessage({ type: 'SCHMER_STOP_RECORDING' }, '*');
    }
    if (inlineRecorder) {
      try {
        inlineRecorder.stop();
      } catch {}
      inlineRecorder = null;
    }
  };

  return { extensionStatus: status, startSession, stopSession };
};