import React, { useEffect, useMemo, useState } from 'react';
import { SOFTWARE_TOOLS } from '../constants';
import { SoftwareType } from '../types';
import ToolIcon from './ToolIcon';
import { Layers, MonitorPlay, ExternalLink, ChevronDown, DownloadCloud } from 'lucide-react';
import { toMergedSessions } from '../lib/localRecordingStore';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

type MergedSession = { tool: string; date: string; paths: Record<string,string> };


const RecordingStore: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [mergedSessions, setMergedSessions] = useState<MergedSession[]>([]);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [selected, setSelected] = useState<MergedSession | null>(null);
  const [variant, setVariant] = useState<'1x'|'2x'|'5x'|'10x'>('1x');

  useEffect(() => {
    const raw = (import.meta as any)?.env?.VITE_BACKEND_URL as string | undefined;
    const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const backendUrl = raw && (isHttpsPage && raw.startsWith('http://') ? undefined : raw);
    if (!projectId) return;
    const refresh = async () => {
      const local = await toMergedSessions(projectId).catch(() => []);
      let supa: MergedSession[] = [];
      if (isSupabaseConfigured && supabase) {
        try {
          // Storage-only listing. Path schema: <projectId>/<tool>/<YYYY-MM-DD>/<sessionId>.webm
          const tools = SOFTWARE_TOOLS.map(t => t.id as unknown as string);
          const out: MergedSession[] = [];
          for (const tool of tools) {
            // list date folders under projectId/tool
            const { data: dateEntries } = await (supabase as any).storage.from('recordings').list(`${projectId}/${tool}`, { limit: 1000, sortBy: { column: 'name', order: 'desc' } });
            if (!Array.isArray(dateEntries)) continue;
            for (const d of dateEntries) {
              const date = (d.name || '').replace(/\/$/, '');
              // list files under each date folder
              const { data: files } = await (supabase as any).storage.from('recordings').list(`${projectId}/${tool}/${date}`, { limit: 1000, sortBy: { column: 'name', order: 'desc' } });
              if (!Array.isArray(files)) continue;
              for (const f of files) {
                const path = `${projectId}/${tool}/${date}/${f.name}`;
                if (!/\.webm$/i.test(path)) continue;
                try {
                  // For a public bucket, use a permanent public URL
                  const { data: pub } = await (supabase as any).storage.from('recordings').getPublicUrl(path);
                  const url = pub?.publicUrl || '';
                  if (url) out.push({ tool, date, paths: { '1x': url, '2x': url, '5x': url, '10x': url } });
                } catch {}
              }
            }
          }
          supa = out;
        } catch {}
      }
      if (backendUrl) {
        try {
          const r = await fetch(`${backendUrl}/sessions?projectId=${encodeURIComponent(projectId)}`, { mode: 'cors' });
          const json = await r.json();
          if (json?.ok && Array.isArray(json.sessions)) {
            const combined: MergedSession[] = [...(local as any), ...supa, ...(json.sessions as MergedSession[])];
            setMergedSessions(combined);
            return;
          }
        } catch {}
      }
      setMergedSessions([...(supa as any), ...(local as any)]);
    };

    refresh();

    const handler = (event: MessageEvent) => {
      if (event.source !== window) return;
      const type = (event.data && event.data.type) || '';
      if (type === 'SCHMER_REFRESH_SESSIONS' || type === 'SCHMER_RECORDING_STOPPED') refresh();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [projectId]);

  const grouped = useMemo(() => {
    const map = new Map<string, MergedSession[]>();
    for (const s of mergedSessions) {
      const arr = map.get(s.tool) || [];
      arr.push(s);
      map.set(s.tool, arr);
    }
    return map;
  }, [mergedSessions]);

  const toolsOrder = useMemo(() => SOFTWARE_TOOLS.map(t => t.id), []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-250px)]">
      <div className="lg:col-span-1 space-y-4">
        {toolsOrder.map(toolId => {
          const sessions = grouped.get(toolId as unknown as string) || [];
          const tool = SOFTWARE_TOOLS.find(t => t.id === toolId);
          if (!tool) return null;
          const isOpen = expandedTool === toolId;
          return (
            <div key={toolId} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <button onClick={() => setExpandedTool(isOpen ? null : (toolId as unknown as string))} className="w-full p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ToolIcon type={toolId} />
                  <div>
                    <div className="font-semibold text-sm">{tool.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{sessions.length} recordings</div>
                  </div>
                </div>
                <ChevronDown className={`text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} size={18} />
              </button>
              {isOpen && (
                <div className="border-t border-slate-200 dark:border-slate-800 p-2 space-y-2">
                  {sessions.length === 0 && (
                    <div className="p-3 text-xs text-slate-500">No recordings yet.</div>
                  )}
                  {sessions.map(s => (
                    <div key={`${s.tool}-${s.date}`} className="p-3 rounded-lg border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-400 cursor-pointer" onClick={() => { setSelected(s); setVariant('1x'); }}>
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">{s.date}</div>
                        <span className="text-xs text-slate-500 flex items-center gap-1"><Layers size={10} /> Final</span>
                      </div>
                      <div className="mt-1 text-xs font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">1x / 2x / 5x / 10x</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="lg:col-span-2 flex flex-col gap-4">
        <div className="flex-1 bg-slate-900 rounded-xl overflow-hidden flex flex-col relative shadow-2xl min-h-[400px] border border-slate-800">
          {selected ? (
            <>
              <div className="flex-1 bg-black relative">
                <video
                  src={selected.paths[variant] || selected.paths['1x']}
                  controls
                  style={{ width: '100%', height: '100%' }}
                  onLoadedData={(e) => { (e.currentTarget as HTMLVideoElement).playbackRate = variant === '1x' ? 1 : parseInt(variant); }}
                />
              </div>
              <div className="h-20 bg-slate-950 border-t border-slate-800 p-4 flex items-center justify-between">
                <div className="text-white text-sm font-medium flex items-center gap-2">
                  <ToolIcon type={selected.tool as unknown as SoftwareType} className="w-6 h-6" />
                  {selected.tool} • {selected.date}
                </div>
                <div className="flex items-center gap-2">
                  {(['1x','2x','5x','10x'] as const).map(v => (
                    <button key={v} onClick={() => setVariant(v)} className={`text-xs font-bold px-3 py-1.5 rounded transition-all border ${variant === v ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/50' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800 hover:border-slate-600'}`}>{v}</button>
                  ))}
                  <a href={selected.paths[variant] || selected.paths['1x']} target="_blank" rel="noreferrer" className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white hover:bg-slate-800 flex items-center gap-2">
                    <DownloadCloud size={16} /> Download
                  </a>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
              <MonitorPlay size={64} className="mb-4 opacity-20" />
              <p className="text-lg font-medium">Select a tool and a recording</p>
              <p className="text-sm opacity-50">Recordings are grouped under each icon</p>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600 dark:text-slate-300">Open the original tool</div>
            {selected && (
              <a href={SOFTWARE_TOOLS.find(t => t.id === (selected.tool as unknown as SoftwareType))?.url || '#'} target="_blank" rel="noreferrer" className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2">
                <ExternalLink size={16} /> Open
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecordingStore;
