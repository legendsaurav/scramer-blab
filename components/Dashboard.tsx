
import React, { useEffect, useRef, useState, useMemo } from 'react';
// Recharts is loaded lazily via LazyBarChart to avoid early size warnings
import LazyBarChart from './LazyBarChart';
import { TEAM_MODE_ALL } from '../constants';
import { Project, User } from '../types';
import { 
  Clock, Users, Video, Activity, ArrowRight, Zap, Plus, 
  Terminal, ShieldCheck, Cpu, LayoutGrid, ListFilter,
  ArrowUpRight, Monitor, Command
} from 'lucide-react';
import { supabase, isSupabaseConfigured, CONFIG_ERROR_MESSAGE } from '../lib/supabase';

interface DashboardProps {
  user: User;
  projects: Project[];
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string, description: string) => void;
}

const emptyData = Array(7).fill(0).map((_, i) => ({ name: i, hours: 0 }));

const startOfDayIso = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
};

const endOfDayIso = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
};

const startOfNDaysAgoIso = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

const parseDurationSeconds = (value: string | null | undefined) => {
  if (!value) return 0;
  const v = value.trim();
  // HH:MM:SS or MM:SS
  if (v.includes(':')) {
    const parts = v.split(':').map((p) => parseInt(p, 10) || 0);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }
  // 1h 30m 20s style
  const re = /(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?/i;
  const m = v.match(re);
  if (m) {
    const h = parseInt(m[1] || '0', 10);
    const mi = parseInt(m[2] || '0', 10);
    const s = parseInt(m[3] || '0', 10);
    if (h || mi || s) return h * 3600 + mi * 60 + s;
  }
  // Fallback: treat as minutes number
  const asNum = Number(v);
  if (!Number.isNaN(asNum)) return Math.round(asNum * 60);
  return 0;
};

const formatHoursAndMinutes = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const Dashboard: React.FC<DashboardProps> = ({ user, projects, onSelectProject, onCreateProject }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [weeklySeries, setWeeklySeries] = useState<Array<{ name: string; hours: number }>>(emptyData);
  const [weeklyTotalSecs, setWeeklyTotalSecs] = useState(0);
  const [todayTotalSecs, setTodayTotalSecs] = useState(0);
  const [loadingTelemetry, setLoadingTelemetry] = useState(false);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [teamCount, setTeamCount] = useState<number>(0);
  const [teamProfiles, setTeamProfiles] = useState<User[]>([]);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        setChartWidth(w);
      }
    });
    ro.observe(el);
    setChartWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  // Load weekly and today time from Supabase sessions for this user
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!isSupabaseConfigured) return;
      setLoadingTelemetry(true);
      setTelemetryError(null);
      try {
        const sevenDaysAgoIso = startOfNDaysAgoIso(6); // include today + 6 previous days
        const today = new Date();
        const todayStart = startOfDayIso(today);
        const todayEnd = endOfDayIso(today);

        let query = supabase!
          .from('sessions')
          .select('date,total_duration,user_id')
          .gte('date', sevenDaysAgoIso)
          .lte('date', todayEnd);
        if (!TEAM_MODE_ALL) {
          query = query.eq('user_id', user.id);
        }
        const { data, error } = await query;

        if (error) {
          setTelemetryError(error.message);
          return;
        }

        const byDay: Record<string, number> = {};
        // Build 7 days labels (oldest to today)
        const days: string[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const label = d.toLocaleDateString(undefined, { weekday: 'short' });
          days.push(label);
          byDay[label] = 0;
        }

        let weeklySecs = 0;
        let todaySecs = 0;

        (data || []).forEach((row: any) => {
          const d = new Date(row.date);
          const label = d.toLocaleDateString(undefined, { weekday: 'short' });
          const secs = parseDurationSeconds(row.total_duration);
          weeklySecs += secs;
          if (d >= new Date(todayStart) && d <= new Date(todayEnd)) todaySecs += secs;
          if (byDay[label] !== undefined) byDay[label] += secs;
        });

        if (!cancelled) {
          setWeeklyTotalSecs(weeklySecs);
          setTodayTotalSecs(todaySecs);
          setWeeklySeries(days.map((label) => ({ name: label, hours: +(byDay[label] / 3600).toFixed(2) })));
        }
      } catch (e: any) {
        if (!cancelled) setTelemetryError(e?.message || 'Failed to load telemetry');
      } finally {
        if (!cancelled) setLoadingTelemetry(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user.id]);

  // Load team members count from profiles
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!isSupabaseConfigured) return;
      try {
        const { count, error } = await supabase!
          .from('profiles')
          .select('*', { count: 'exact', head: true });
        if (error) return;
        if (!cancelled) setTeamCount(count || 0);
      } catch {}
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Load team member profiles list
  useEffect(() => {
    let cancelled = false;
    const loadProfiles = async () => {
      if (!isSupabaseConfigured) return;
      try {
        const { data, error } = await supabase!
          .from('profiles')
          .select('id,name,email,avatar,role')
          .order('name', { ascending: true });
        if (error) return;
        if (!cancelled) {
          setTeamProfiles((data || []) as unknown as User[]);
          // If count was not yet set, derive from list
          if (!teamCount && Array.isArray(data)) setTeamCount(data.length);
        }
      } catch {}
    };
    loadProfiles();
    return () => { cancelled = true; };
  }, [teamCount]);

  const handleQuickCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    onCreateProject(newProjectName, newProjectDesc);
    setNewProjectName('');
    setNewProjectDesc('');
    setIsCreating(false);
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[1600px] mx-auto p-6 lg:p-12 space-y-10 pb-24">
        
        {/* Superior Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 border-b border-slate-200 dark:border-slate-800 pb-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 text-[10px] font-black uppercase tracking-widest rounded flex items-center gap-1.5">
                <ShieldCheck size={12} />
                Kernel v4.2 Secure
              </span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">• Engineering Intelligence</span>
            </div>
            <h1 className="text-5xl font-extrabold text-slate-900 dark:text-white tracking-tighter">
              Mission <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-500">Control</span>
            </h1>
            <p className="text-slate-500 dark:text-slate-400 font-medium text-lg">
              System initialized for <span className="text-slate-900 dark:text-slate-200 font-bold">{user.name}</span>.
            </p>
          </div>
          
          <div className="flex items-center gap-4">
             <button 
              onClick={() => setIsCreating(true)}
              className="bg-slate-900 dark:bg-white text-white dark:text-slate-950 px-8 py-4 rounded-2xl font-bold text-sm flex items-center gap-3 shadow-2xl shadow-blue-500/20 hover:-translate-y-1 transition-all active:scale-95"
            >
              <Plus size={20} />
              Initialize Project
            </button>
          </div>
        </div>

        {/* Metrics Grid (User Time) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'Active Initiatives', value: projects.length, icon: Cpu, color: 'text-blue-500', bg: 'bg-blue-500/5' },
            { label: 'Weekly Time', value: formatHoursAndMinutes(weeklyTotalSecs), icon: Activity, color: 'text-emerald-500', bg: 'bg-emerald-500/5' },
            { label: 'Syncing Nodes', value: String(teamCount).padStart(2, '0'), icon: Users, color: 'text-purple-500', bg: 'bg-purple-500/5' },
            { label: 'Today Time', value: formatHoursAndMinutes(todayTotalSecs), icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/5' },
          ].map((stat, i) => (
            <div key={i} className="glass-card rounded-[2rem] p-8 group hover:tech-border transition-all duration-300">
              <div className="flex justify-between items-start mb-6">
                <div className={`p-4 rounded-2xl ${stat.bg} ${stat.color}`}>
                  <stat.icon size={24} />
                </div>
                <div className="flex flex-col items-end">
                   <ArrowUpRight size={18} className="text-slate-300 dark:text-slate-700" />
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-1">Status: OK</span>
                </div>
              </div>
              <p className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter mb-1 font-mono">{stat.value}</p>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 pt-4">
          
          {/* Main Workspace Column */}
          <div className="lg:col-span-8 space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                <Command size={24} className="text-blue-500" /> Workspace Archive
              </h2>
              <div className="flex items-center gap-2">
                <button className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                  <ListFilter size={20} />
                </button>
                <div className="h-4 w-px bg-slate-200 dark:bg-slate-800"></div>
                <button className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                  <LayoutGrid size={20} />
                </button>
              </div>
            </div>

            {isCreating ? (
              <form onSubmit={handleQuickCreate} className="bg-white dark:bg-slate-900/80 backdrop-blur-3xl p-10 rounded-[2.5rem] border border-blue-500/30 shadow-3xl animate-in fade-in slide-in-from-bottom-8 duration-500">
                <div className="flex items-center gap-4 mb-10">
                   <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xl shadow-blue-500/20">
                      <Zap size={28} />
                   </div>
                   <div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white">Initialize New Protocol</h3>
                      <p className="text-sm text-slate-500 font-medium">Define the core objectives for this initiative</p>
                   </div>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Initiative Name</label>
                    <input 
                      id="projectName"
                      name="projectName"
                      autoFocus
                      type="text" 
                      placeholder="e.g. Project Phoenix" 
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-6 py-4.5 text-base font-medium focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Technical Scope</label>
                    <textarea 
                      id="projectDesc"
                      name="projectDesc"
                      placeholder="Details, objectives, and parameters..." 
                      value={newProjectDesc}
                      onChange={(e) => setNewProjectDesc(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-6 py-4.5 text-base font-medium focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none h-40 resize-none"
                    />
                  </div>
                  <div className="flex justify-end gap-4 pt-6">
                    <button type="button" onClick={() => setIsCreating(false)} className="px-8 py-4 text-sm font-bold text-slate-500 hover:text-slate-950 dark:hover:text-white">Abort</button>
                    <button type="submit" className="bg-blue-600 text-white px-12 py-4 rounded-2xl text-sm font-bold shadow-2xl shadow-blue-600/30 hover:bg-blue-500 transition-all active:scale-95">Establish initiative</button>
                  </div>
                </div>
              </form>
            ) : projects.length === 0 ? (
              <div className="glass-card rounded-[3rem] p-24 flex flex-col items-center justify-center text-center">
                <div className="w-28 h-28 bg-slate-50 dark:bg-slate-900 rounded-[2rem] flex items-center justify-center mb-10 relative">
                   <div className="absolute inset-0 border-2 border-blue-500/20 rounded-[2rem] animate-pulse-slow"></div>
                   <Monitor className="text-slate-300 dark:text-slate-700" size={48} />
                </div>
                <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-4 tracking-tighter">Standby for Data</h3>
                <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-12 text-lg leading-relaxed font-medium">
                  Schmer is waiting for project initialization. Once active, all engineering telemetry will be indexed here.
                </p>
                <button 
                  onClick={() => setIsCreating(true)}
                  className="group px-12 py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-950 rounded-2xl font-bold text-sm flex items-center gap-3 hover:scale-105 transition-all shadow-3xl"
                >
                  Start First Project <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            ) : (
              <div className="grid gap-6">
                {projects.map(project => (
                  <div 
                    key={project.id}
                    onClick={() => onSelectProject(project.id)}
                    className="group glass-card p-8 rounded-[2rem] hover:tech-border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-8"
                  >
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-4">
                        <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.8)]"></div>
                        <h3 className="font-extrabold text-2xl text-slate-900 dark:text-white group-hover:text-blue-500 transition-colors tracking-tight">{project.name}</h3>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 line-clamp-1 font-medium pl-7 text-sm">{project.description}</p>
                    </div>
                    
                    <div className="flex items-center gap-10 pl-7 sm:pl-0">
                      <div className="text-right hidden md:block">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Telemetry Sync</p>
                        <p className="text-sm font-mono text-slate-700 dark:text-slate-300">ACTIVE_NODE_{project.id.slice(1, 5)}</p>
                      </div>
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all transform group-hover:translate-x-2">
                        <ArrowRight size={24} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lateral Telemetry Section */}
          <div className="lg:col-span-4 space-y-10">
            {/* Team Access Card */}
            <div className="glass-card rounded-[2.5rem] p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Users size={14} /> Team Access
                </h3>
                <span className="text-[10px] font-bold text-slate-500">{String(teamCount).padStart(2,'0')} Members</span>
              </div>
              <div className="space-y-3 max-h-60 overflow-auto pr-1">
                {teamProfiles.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3 min-w-0">
                      <img src={p.avatar} alt={p.name} className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 object-cover" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{p.name}</div>
                        <div className="text-[10px] text-slate-500 truncate">{p.email}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">{p.role || 'MEMBER'}</span>
                  </div>
                ))}
                {teamProfiles.length === 0 && (
                  <div className="text-[11px] text-slate-500">No team members found.</div>
                )}
              </div>
            </div>
            
            <div className="glass-card rounded-[2.5rem] p-8">
              <div className="flex items-center justify-between mb-10">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Terminal size={14} /> Weekly Time Spent
                </h3>
                {!isSupabaseConfigured && (
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-3 py-1 rounded-full">CONFIG</span>
                )}
              </div>
              
              <div ref={chartRef} className="w-full h-64 relative blueprint-bg rounded-2xl border border-slate-100 dark:border-slate-800/50 flex flex-col items-center justify-center overflow-hidden" style={{ minWidth: 1, minHeight: 1 }}>
                <LazyBarChart ready={chartWidth > 10} data={weeklySeries} height={256} />
                {loadingTelemetry && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-[10px] font-mono text-slate-400 uppercase tracking-[0.2em] animate-pulse">Loading...</p>
                  </div>
                )}
                {telemetryError && (
                  <div className="absolute top-2 left-2 right-2">
                    <div className="px-3 py-2 text-[10px] rounded-xl bg-amber-50 text-amber-700 border border-amber-200">{telemetryError}</div>
                  </div>
                )}
              </div>
              <div className="mt-8 space-y-3">
                 <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                    <span>Total (7d)</span>
                    <span>{formatHoursAndMinutes(weeklyTotalSecs)}</span>
                 </div>
                 <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500/20" style={{ width: `${Math.min(100, (weeklyTotalSecs / (7 * 8 * 3600)) * 100)}%` }}></div>
                 </div>
              </div>
            </div>

            <div className="bg-slate-900 dark:bg-white rounded-[2.5rem] p-10 shadow-3xl relative overflow-hidden group">
              <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-600/20 rounded-full blur-[80px] group-hover:bg-blue-600/30 transition-all duration-1000"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></div>
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Deployment Node</span>
                </div>
                <h3 className="text-2xl font-black text-white dark:text-slate-900 mb-4 tracking-tighter leading-none">Bridge Active.</h3>
                <p className="text-slate-400 dark:text-slate-500 text-sm mb-10 font-medium leading-relaxed">
                  The Schmer Extension enables seamless session synchronization with external CAD and IDE environments.
                </p>
                <button className="w-full bg-white/5 dark:bg-slate-100 hover:bg-white/10 dark:hover:bg-slate-200 text-white dark:text-slate-900 py-4 rounded-2xl text-xs font-black border border-white/10 dark:border-slate-200 transition-all group-hover:border-blue-500/50">
                  Update Core v1.0.4
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
