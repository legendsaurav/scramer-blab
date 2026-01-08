
import React, { useState, useEffect, useRef } from 'react';
import { Project, MeetingRecording, SoftwareSession, Announcement, User } from '../types';
import { SOFTWARE_TOOLS } from '../constants';
import { supabase, isSupabaseConfigured, CONFIG_ERROR_MESSAGE } from '../lib/supabase';
import { FallbackCloud } from '../lib/cloudFallback';
import { 
  Video, Layers, Zap, HelpCircle, Download, ChevronRight, X, Megaphone, ShieldAlert, Check, Send, Bell, Clock, Gauge, Database, Dot
} from 'lucide-react';
import MeetingRepository from './MeetingRepository';
import RecordingStore from './RecordingStore';
import ToolIcon from './ToolIcon';
import { useExtensionBridge } from '../hooks/useExtensionBridge';
import { fetchMeetings, fetchSessions } from '../lib/dataRepository';

interface ProjectDetailProps {
  project: Project;
  meetings: MeetingRecording[];
  sessions: SoftwareSession[];
  announcements: Announcement[];
  currentUser: User;
}

type CenterViewMode = 'DASHBOARD' | 'MEETINGS' | 'SESSIONS';

const ProjectDetail: React.FC<ProjectDetailProps> = ({ 
  project, 
  meetings, 
  sessions,
  announcements: initialAnnouncements,
  currentUser
}) => {
  const [viewMode, setViewMode] = useState<CenterViewMode>('DASHBOARD');
  const [showGuide, setShowGuide] = useState(true);
  const [liveAnnouncements, setLiveAnnouncements] = useState<Announcement[]>(initialAnnouncements);
  const [liveMeetings, setLiveMeetings] = useState<MeetingRecording[]>(meetings);
  const [liveSessions, setLiveSessions] = useState<SoftwareSession[]>(sessions);
  const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false);
  const [announcementInput, setAnnouncementInput] = useState('');
  const announcementLength = announcementInput.trim().length;
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [notification, setNotification] = useState<{message: string, type: 'info' | 'success'} | null>(null);
  const { extensionStatus, startSession } = useExtensionBridge();
  
  const mapAnnouncement = (row: any): Announcement => ({
    id: row.id,
    projectId: row.project_id || row.projectId,
    authorId: row.author_id || row.authorId,
    content: row.content,
    timestamp: row.timestamp,
    reactions: row.reactions || []
  });

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let subscribed = false;
    let channel: any = null;
    const fetchAnnouncements = async () => {
      try {
        const { data, error } = await supabase
          .from('announcements')
          .select('*')
          .eq('project_id', project.id)
          .order('timestamp', { ascending: false });

        if (error) {
          // Cloud disabled or table missing: use local fallback store
          const local = FallbackCloud.getAnnouncements(project.id).map(mapAnnouncement);
          setLiveAnnouncements(local);
          return;
        }
        if (data) {
          setLiveAnnouncements((data as any[]).map(mapAnnouncement));
        }

        channel = supabase
          .channel(`announcements-${project.id}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'announcements', filter: `project_id=eq.${project.id}` },
            (payload) => {
              const newAnn = mapAnnouncement(payload.new);
              setLiveAnnouncements(prev => [newAnn, ...prev]);
              showNotification('System Broadcast Received', 'info');
            }
          )
          .subscribe();
        subscribed = true;
      } catch {
        setLiveAnnouncements([]);
      }
    };

    fetchAnnouncements();

    return () => {
      if (subscribed && channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [project.id]);

  // Fetch meetings and sessions from Supabase for this project
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [m, s] = await Promise.all([
          fetchMeetings(project.id),
          fetchSessions(project.id)
        ]);
        if (!cancelled) {
          setLiveMeetings(m);
          setLiveSessions(s);
        }
      } catch {
        if (!cancelled) {
          setLiveMeetings(meetings);
          setLiveSessions(sessions);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [project.id]);

  const showNotification = (message: string, type: 'info' | 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const formatRelative = (iso: string) => {
    const d = new Date(iso);
    const diffMin = Math.max(1, Math.floor((Date.now() - d.getTime()) / 60000));
    if (diffMin < 60) return `${diffMin}m ago`;
    const h = Math.floor(diffMin / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    return `${days}d ago`;
  };

  const handlePostAnnouncement = async (customContent?: string) => {
    const content = customContent || announcementInput;
    if (!content.trim()) return;
    const record = {
      id: crypto.randomUUID(),
      project_id: project.id,
      author_id: currentUser.id,
      content: content,
      timestamp: new Date().toISOString()
    };

    if (isSupabaseConfigured) {
      const { error } = await supabase.from('announcements').insert(record);
      if (error) {
        // Fallback write on error
        FallbackCloud.addAnnouncement(project.id, record);
      }
    } else {
      FallbackCloud.addAnnouncement(project.id, record);
    }

    setLiveAnnouncements(prev => [mapAnnouncement(record), ...prev]);
    setAnnouncementInput('');
    setIsPostingAnnouncement(false);
    setShowConfirmation(false);
    showNotification(customContent ? 'Meeting Broadcasted' : 'Intelligence Shared', 'success');
  };

  const handleStartInstantMeet = () => {
    const meetUrl = 'https://meet.google.com/nsy-hgfo-tct';
    window.open(meetUrl, '_blank');
    handlePostAnnouncement(`🚀 INSTANT SYNC: ${currentUser.name} requested a priority sync. Join now: ${meetUrl}`);
  };

  const DashboardCenter = () => (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950 overflow-y-auto">
      {notification && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 duration-300">
           <div className={`px-6 py-3 rounded-full shadow-2xl border flex items-center gap-3 backdrop-blur-md ${notification.type === 'success' ? 'bg-emerald-500/90 border-emerald-400 text-white' : 'bg-blue-600/90 border-blue-400 text-white'}`}>
             <Bell size={18} className="animate-bounce" />
             <span className="text-sm font-bold uppercase tracking-widest">{notification.message}</span>
           </div>
        </div>
      )}

      {/* Project Header: Breadcrumb + Tabs */}
      <div className="px-6 pt-6">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <span>Projects</span> <span className="mx-2">›</span> <span className="font-medium text-slate-900 dark:text-slate-100">{project.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleStartInstantMeet} className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold">Sync Live</button>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          {(['OVERVIEW','MEETINGS','SESSIONS'] as const).map(t => (
            <button key={t} onClick={() => {
              if (t === 'OVERVIEW') setViewMode('DASHBOARD');
              if (t === 'MEETINGS') setViewMode('MEETINGS');
              if (t === 'SESSIONS') setViewMode('SESSIONS');
            }} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              (t === 'OVERVIEW' && viewMode==='DASHBOARD') || (t==='MEETINGS' && viewMode==='MEETINGS') || (t==='SESSIONS' && viewMode==='SESSIONS')
              ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}>{t.toLowerCase()}</button>
          ))}
        </div>
      </div>

      {/* Hero Banner */}
      <div className="px-6 mt-6">
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-950 relative">
          <img src={`https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1600&auto=format&fit=crop`} alt="hero" className="w-full h-48 object-cover opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-4 left-6 right-6 text-white">
            <div className="flex items-center gap-3 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white font-bold">ACTIVE R&D</span>
              <span className="opacity-80">Last update: {new Date(project.lastActivity).toLocaleDateString()}</span>
            </div>
            <h1 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight">{project.name}</h1>
            <p className="mt-1 text-sm opacity-80">{project.description || 'Project description'}</p>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="px-6 mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center gap-3">
            <Gauge className="text-blue-600" size={18} />
            <div>
              <div className="text-sm font-semibold">68%</div>
              <div className="text-xs text-slate-500">Completion</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center gap-3">
            <Clock className="text-blue-600" size={18} />
            <div>
              <div className="text-sm font-semibold">142h</div>
              <div className="text-xs text-slate-500">Time Spent</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center gap-3">
            <Database className="text-blue-600" size={18} />
            <div>
              <div className="text-sm font-semibold">24GB</div>
              <div className="text-xs text-slate-500">Resources</div>
            </div>
          </div>
        </div>
      </div>

      {/* Team Access + Phase Status */}
      <div className="px-6 mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="font-semibold mb-2">Team Access</h3>
          <div className="space-y-3">
            {(project.members || []).map((m) => (
              <div key={m} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img className="w-8 h-8 rounded-full" src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(m)}`} />
                  <div>
                    <div className="text-sm font-medium">{m}</div>
                    <div className="text-xs text-slate-500">Member</div>
                  </div>
                </div>
                <div className="text-emerald-500"><Dot /></div>
              </div>
            ))}
            {project.members.length === 0 && <p className="text-sm text-slate-500">No members added yet.</p>}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-blue-600 to-indigo-600 p-4 text-white">
          <h3 className="font-semibold mb-2">Phase II Status</h3>
          <p className="text-xs opacity-90 mb-4">Structural testing is 85% complete. Next milestone: Aerodynamics validation.</p>
          <div className="w-full h-2 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full w-[85%] bg-white rounded-full" />
          </div>
          <div className="mt-2 text-[10px] uppercase font-bold tracking-widest opacity-90">Milestone Progress</div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="px-6 mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="font-semibold mb-2">Recent Activity</h3>
          <div className="space-y-3">
            {liveAnnouncements.slice(0,5).map(a => (
              <div key={a.id} className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-2" />
                <div>
                  <div className="text-sm font-medium">{a.content}</div>
                  <div className="text-xs text-slate-500">{formatRelative(a.timestamp)}</div>
                </div>
              </div>
            ))}
            {liveAnnouncements.length === 0 && (
              <p className="text-sm text-slate-500">No activity yet. Broadcast updates to see them here.</p>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="font-semibold mb-3">Actions</h3>
          <button onClick={() => setIsPostingAnnouncement(true)} className="w-full px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold">Broadcast Update</button>
        </div>
      </div>

      {isPostingAnnouncement && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 backdrop-blur-xl bg-slate-950/40">
           <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-3xl overflow-hidden">
              <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                 <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Broadcast Protocol</h3>
                 <button onClick={() => setIsPostingAnnouncement(false)} className="p-2 text-slate-400"><X size={24} /></button>
              </div>
              <div className="p-8 space-y-6">
                 {!showConfirmation ? (
                   <>
                    <textarea value={announcementInput} onChange={(e) => setAnnouncementInput(e.target.value)} placeholder="Define protocol update..." className="w-full h-40 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-base font-medium outline-none resize-none dark:text-white" />
                    <div className="flex items-center justify-between mt-2 text-xs">
                      <span className="text-slate-500 dark:text-slate-400">{announcementLength} characters</span>
                      {announcementLength > 0 && announcementLength < 2 && (
                        <span className="text-amber-600 dark:text-amber-400">Broadcast needs at least 2 characters</span>
                      )}
                    </div>
                    <button onClick={() => setShowConfirmation(true)} disabled={announcementLength < 2} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl disabled:opacity-60 disabled:cursor-not-allowed">Establish Protocol</button>
                   </>
                 ) : (
                   <div className="py-6 text-center">
                      <div className="w-20 h-20 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-6"><ShieldAlert size={40} /></div>
                      <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Cloud Verification</h4>
                      <p className="text-slate-500 dark:text-slate-400 mb-10 text-sm">Forward transmission to all project nodes?</p>
                      <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => setShowConfirmation(false)} className="py-4 rounded-2xl border border-slate-200 text-slate-500 font-bold uppercase">Abort</button>
                        <button onClick={() => handlePostAnnouncement()} className="py-4 rounded-2xl bg-emerald-600 text-white font-bold uppercase">Execute</button>
                      </div>
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}

      <div className="px-6 mb-2">
        <div className="flex flex-col md:flex-row gap-4 h-32">
          <button onClick={handleStartInstantMeet} className="group w-32 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-center shadow-sm">
             <div className="relative w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl shadow-md flex items-center justify-center border border-slate-100 dark:border-slate-700">
                <Video size={32} className="text-indigo-500 group-hover:scale-110 transition-transform" />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white flex items-center justify-center"><div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div></div>
             </div>
          </button>
          <button onClick={() => setViewMode('MEETINGS')} className="flex-1 bg-gradient-to-r from-amber-300 to-amber-400 rounded-2xl shadow-lg flex items-center justify-between px-8">
            <span className="text-slate-900 font-bold text-2xl tracking-tight">Review Meetings</span>
            <ChevronRight className="text-slate-900" size={24} />
          </button>
          <button onClick={() => setViewMode('SESSIONS')} className="flex-1 bg-gradient-to-r from-blue-300 to-blue-400 rounded-2xl shadow-lg flex items-center justify-between px-8">
            <span className="text-slate-900 font-bold text-2xl tracking-tight">Recording Store</span>
            <ChevronRight className="text-slate-900" size={24} />
          </button>
          {/* Integrated Tools Row */}
          <div className="mt-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Integrated Tools</div>
              <div className="text-[10px] font-black uppercase tracking-widest">
                <span className={`px-2 py-1 rounded-full border ${extensionStatus.isInstalled ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-amber-50 border-amber-200 text-amber-600'}`}>
                  Extension Status: {extensionStatus.isInstalled ? 'Ready' : 'Not Detected'}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {SOFTWARE_TOOLS.map(tool => (
                <button
                  key={tool.id}
                  onClick={() => startSession(tool.id, tool.url, project.id)}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                  title={tool.name}
                >
                  <ToolIcon type={tool.id as any} className="w-10 h-10" />
                  <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate w-full text-center">
                    {tool.name}
                  </span>
                </button>
              ))}
              <a
                href="https://chrome.google.com/webstore"
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all"
              >
                <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center">
                  <span className="text-slate-500">+</span>
                </div>
                <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Add Tool</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex relative overflow-hidden bg-slate-100 dark:bg-slate-950">
      <div className="flex-1 h-full overflow-hidden relative">
        {!isSupabaseConfigured && (
          <div className="absolute top-0 left-0 right-0 p-4 bg-amber-50 text-amber-700 border-b border-amber-200 text-xs z-20">
            {CONFIG_ERROR_MESSAGE}
          </div>
        )}
        {viewMode !== 'DASHBOARD' && (
          <div className="absolute top-6 left-6 z-20">
            <button onClick={() => setViewMode('DASHBOARD')} className="bg-white/90 dark:bg-slate-900/90 px-4 py-2 rounded-full shadow-lg border border-slate-200 flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold uppercase text-xs"><ChevronRight className="rotate-180" size={14} /> Back</button>
          </div>
        )}
        {viewMode === 'DASHBOARD' && <DashboardCenter />}
        {viewMode === 'MEETINGS' && <div className="h-full p-8 pt-24"><MeetingRepository meetings={liveMeetings} /></div>}
        {viewMode === 'SESSIONS' && <div className="h-full p-8 pt-24"><RecordingStore projectId={project.id} /></div>}
      </div>
    </div>
  );
};

export default ProjectDetail;
