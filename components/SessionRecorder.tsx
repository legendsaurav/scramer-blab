import React, { useState, useEffect } from 'react';
import { SoftwareSession, SoftwareType } from '../types';
import { SOFTWARE_TOOLS } from '../constants';
import { useExtensionBridge } from '../hooks/useExtensionBridge';
import { 
  Play, Pause, FastForward, Rewind, Layers, Monitor, MonitorPlay, ExternalLink, Activity, XCircle, DownloadCloud, AlertCircle
} from 'lucide-react';

const SoftwareIcon = ({ type, className = "w-8 h-8" }: { type: SoftwareType, className?: string }) => {
  const tool = SOFTWARE_TOOLS.find(t => t.id === type);
  
  if (tool && tool.logoUrl) {
    return (
      <div className={`${className} bg-white dark:bg-slate-800 rounded p-1 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700`}>
        <img src={tool.logoUrl} alt={tool.name} className="w-full h-full object-contain" />
      </div>
    );
  }

  // Fallback
  return <Monitor className={`${className} text-slate-500`} />;
};

type MergedSession = { tool: string; date: string; paths: Record<string,string> };

const SessionRecorder: React.FC<{ sessions: SoftwareSession[]; projectId: string }> = ({ sessions, projectId }) => {
  const [selectedSession, setSelectedSession] = useState<SoftwareSession | null>(null);
  const [mergedSessions, setMergedSessions] = useState<MergedSession[]>([]);
  const [selectedMerged, setSelectedMerged] = useState<MergedSession | null>(null);
  const [playVariant, setPlayVariant] = useState<'1x'|'2x'|'5x'|'10x'>('1x');
  const { extensionStatus, startSession, stopSession } = useExtensionBridge();
  
  // Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [progress, setProgress] = useState(0);

  // Simulation of video progress (for legacy demo sessions)
  useEffect(() => {
    let interval: any;
    if (isPlaying && progress < 100) {
      interval = setInterval(() => {
        setProgress(p => Math.min(p + (0.5 * playbackSpeed), 100));
      }, 100);
    } else if (progress >= 100) {
      setIsPlaying(false);
    }
    return () => clearInterval(interval);
  }, [isPlaying, progress, playbackSpeed]);

  // Fetch merged sessions from backend
  useEffect(() => {
    const backendUrl = (import.meta as any)?.env?.VITE_BACKEND_URL as string | undefined;
    if (!backendUrl || !projectId) return;
    fetch(`${backendUrl}/sessions?projectId=${encodeURIComponent(projectId)}`)
      .then(r => r.json())
      .then((json) => {
        if (json?.ok && Array.isArray(json.sessions)) {
          setMergedSessions(json.sessions as MergedSession[]);
        }
      })
      .catch(() => {});
  }, [projectId, extensionStatus.isRecording]);

  const handleLaunch = (toolId: SoftwareType, url: string) => {
    // Always attempt to start a session. If the extension isn't installed,
    // useExtensionBridge will fall back to inline recording automatically.
    startSession(toolId, url, projectId);
    if (!extensionStatus.isInstalled) {
      // Optional: lightweight notice without blocking recording.
      console.warn('[schmer] Extension not detected, using inline recording fallback.');
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-[calc(100vh-250px)]">
      
      {/* Left Column: Library & History */}
      <div className="xl:col-span-1 flex flex-col gap-6">
        
        {/* Extension Missing Alert */}
        {!extensionStatus.isInstalled && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
             <AlertCircle className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={20} />
             <div>
               <h3 className="font-bold text-amber-800 dark:text-amber-200 text-sm">Extension Not Detected</h3>
               <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                 To record sessions, please install the Schmer Chrome Extension.
               </p>
               <button className="mt-2 text-xs font-bold bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 px-3 py-1.5 rounded-lg hover:opacity-90">
                 Get Extension
               </button>
             </div>
          </div>
        )}

        {/* Extension Debug Panel */}
        {extensionStatus.isInstalled && (
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-center justify-between">
            <div className="text-emerald-700 dark:text-emerald-300 text-sm font-medium">
              Extension Ready {extensionStatus.version ? `• v${extensionStatus.version}` : ''}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => startSession(SoftwareType.VSCODE, 'https://vscode.dev', projectId, { debug: true })}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Test Start
              </button>
              <button
                onClick={stopSession}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white"
              >
                Test Stop
              </button>
            </div>
          </div>
        )}

        {/* Active Recording Status Card */}
        {extensionStatus.isRecording && extensionStatus.currentSession && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 animate-pulse">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-red-600 dark:text-red-400 font-bold flex items-center gap-2">
                <Activity size={18} />
                Recording Active
              </h3>
              <span className="text-xs font-mono text-red-600">
                {/* Simple timer calc could go here */}
                REC
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              Recording <strong>{extensionStatus.currentSession.software}</strong> via Extension. 
              Switching tabs will auto-pause.
            </p>
            <button 
              onClick={stopSession}
              className="w-full bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <XCircle size={16} /> Stop & Upload
            </button>
          </div>
        )}

        {/* Daily Sessions List (Merged from backend) */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col flex-1">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Daily Sessions</h3>
              <p className="text-xs text-slate-500 mt-1">Auto-merged per tool and date</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const backendUrl = (import.meta as any)?.env?.VITE_BACKEND_URL as string | undefined;
                  if (!backendUrl || !projectId) return;
                  // Merge today's clips for all tools (simple trigger)
                  const today = new Date().toISOString().slice(0,10);
                  const tools = Array.from(new Set(mergedSessions.map(s => s.tool)));
                  Promise.all(tools.map(t => fetch(`${backendUrl}/merge`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectId, tool: t, date: today })
                  }))).then(() => {
                    // refetch
                    fetch(`${backendUrl}/sessions?projectId=${encodeURIComponent(projectId)}`)
                      .then(r => r.json())
                      .then(json => { if (json?.ok) setMergedSessions(json.sessions); });
                  });
                }}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
              >
                Merge Today
              </button>
            </div>
          </div>
          <div className="overflow-y-auto flex-1 p-2 space-y-2">
            {mergedSessions.map(s => (
              <div
                key={`${s.tool}-${s.date}`}
                onClick={() => setSelectedMerged(s)}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedMerged?.tool === s.tool && selectedMerged?.date === s.date ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 ring-1 ring-blue-500' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-400'}`}
              >
                <div className="flex items-center gap-3">
                  {/* Tool logo */}
                  <SoftwareIcon type={s.tool as unknown as SoftwareType} />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between">
                      <p className="font-medium text-sm truncate">{s.tool}</p>
                      <span className="text-xs text-slate-500">{s.date}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1"><Layers size={10} /> Final</span>
                      <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">1x / 2x / 5x / 10x</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Column: Launcher & Player */}
      <div className="xl:col-span-2 flex flex-col gap-6">
        
        {/* Launcher Area (Only if no session selected) */}
        {!selectedSession && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {SOFTWARE_TOOLS.map(tool => (
              <div key={tool.id} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-white/5 to-white/0 -mr-10 -mt-10 rounded-full transition-transform group-hover:scale-150`}></div>
                
                <div className="flex items-start justify-between mb-4">
                  <SoftwareIcon type={tool.id} className="w-10 h-10" />
                  <ExternalLink className="text-slate-300 group-hover:text-blue-500 transition-colors" size={18} />
                </div>
                
                <h4 className="font-bold text-lg mb-1">{tool.name}</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 h-10 line-clamp-2">{tool.description}</p>
                
                <button 
                  onClick={() => handleLaunch(tool.id, tool.url)}
                  disabled={extensionStatus.isRecording}
                  className={`
                    w-full py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2 font-medium
                    ${extensionStatus.isRecording 
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed' 
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 dark:hover:bg-blue-600 hover:text-white text-slate-900 dark:text-slate-200'}
                  `}
                >
                  <MonitorPlay size={16} />
                  Launch & Record
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Video Player */}
        <div className={`flex-1 bg-slate-900 rounded-xl overflow-hidden flex flex-col relative shadow-2xl min-h-[400px] border border-slate-800`}>
          {selectedMerged ? (
            <>
              <div className="flex-1 bg-black relative">
                <video
                  src={selectedMerged.paths[playVariant] || selectedMerged.paths['1x']}
                  controls
                  style={{ width: '100%', height: '100%' }}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onRateChange={(e) => setPlaybackSpeed((e.currentTarget as HTMLVideoElement).playbackRate)}
                  onLoadedData={(e) => { (e.currentTarget as HTMLVideoElement).playbackRate = playVariant === '1x' ? 1 : parseInt(playVariant); }}
                />
              </div>
              <div className="h-24 bg-slate-950 border-t border-slate-800 p-4 flex items-center justify-between">
                <div className="text-white text-sm font-medium">{selectedMerged.tool} • {selectedMerged.date}</div>
                <div className="flex items-center gap-2">
                  {(['1x','2x','5x','10x'] as const).map(v => (
                    <button key={v} onClick={() => setPlayVariant(v)} className={`text-xs font-bold px-3 py-1.5 rounded transition-all border ${playVariant === v ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/50' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800 hover:border-slate-600'}`}>{v}</button>
                  ))}
                </div>
              </div>
            </>
          ) : selectedSession ? (
            <>
              <div className="flex-1 bg-black relative flex items-center justify-center group">
                 {/* This represents the merged video file */}
                 <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none z-10"></div>
                 
                 <div className="text-slate-700 font-mono text-4xl font-bold opacity-20 select-none flex flex-col items-center">
                   <SoftwareIcon type={selectedSession.software} className="w-24 h-24 mb-4 opacity-50" />
                   {selectedSession.software} TIMELAPSE
                   <span className="text-lg font-normal mt-2 tracking-widest">DAILY MERGE • {selectedSession.date}</span>
                 </div>
                 
                 <button 
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="absolute z-20 w-16 h-16 bg-white/20 hover:bg-white/30 backdrop-blur rounded-full flex items-center justify-center text-white transition-all transform hover:scale-110"
                 >
                   {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" className="ml-1" />}
                 </button>

                 {/* Speed Indicator Overlay */}
                 <div className="absolute top-6 right-6 z-20 bg-black/50 backdrop-blur px-3 py-1 rounded-full text-xs font-bold text-white border border-white/10">
                   {playbackSpeed}x SPEED
                 </div>

                 <div className="absolute bottom-24 left-6 z-20">
                   <h2 className="text-white text-xl font-bold">{selectedSession.software} Daily Recap</h2>
                   <p className="text-slate-300 text-sm">Merged from {selectedSession.sessionCount} sessions • Total work: {selectedSession.totalDuration}</p>
                 </div>
              </div>

              {/* Controls */}
              <div className="h-24 bg-slate-950 border-t border-slate-800 p-4">
                <div className="w-full h-1.5 bg-slate-800 rounded-full mb-4 cursor-pointer relative group" onClick={(e) => {
                   const rect = e.currentTarget.getBoundingClientRect();
                   const x = e.clientX - rect.left;
                   setProgress((x / rect.width) * 100);
                }}>
                  <div 
                    className="h-full bg-blue-500 rounded-full relative" 
                    style={{ width: `${progress}%` }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow cursor-grab scale-0 group-hover:scale-100 transition-transform"></div>
                  </div>
                </div>

                <div className="flex justify-between items-center text-white">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setIsPlaying(!isPlaying)} className="hover:text-blue-400 transition-colors">
                      {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                    </button>
                    <button onClick={() => setProgress(0)} className="hover:text-blue-400 transition-colors"><Rewind size={20} /></button>
                    <button onClick={() => setProgress(100)} className="hover:text-blue-400 transition-colors"><FastForward size={20} /></button>
                    <span className="text-xs font-mono text-slate-400 ml-2">
                      {Math.floor((progress / 100) * 10)}:{(Math.floor((progress / 100) * 600) % 60).toString().padStart(2, '0')} / 10:00
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-wider mr-2">Playback Rate</span>
                    {[1, 2, 5, 10].map(speed => (
                      <button
                        key={speed}
                        onClick={() => setPlaybackSpeed(speed)}
                        className={`
                          text-xs font-bold px-3 py-1.5 rounded transition-all border
                          ${playbackSpeed === speed 
                            ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/50' 
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800 hover:border-slate-600'}
                        `}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
             <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
               <MonitorPlay size={64} className="mb-4 opacity-20" />
               <p className="text-lg font-medium">Select a daily session from the list</p>
               <p className="text-sm opacity-50">or launch a new recording above</p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SessionRecorder;