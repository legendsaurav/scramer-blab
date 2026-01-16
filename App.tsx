
import React, { useState, useEffect, useRef } from 'react';
import { isSupabaseConfigured, diagnoseSupabaseConnectivity } from './lib/supabase';
import { AppState, ViewState, Project } from './types';
import { MOCK_MEETINGS, MOCK_SESSIONS, MOCK_CHAT, MOCK_ANNOUNCEMENTS } from './constants';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import ProjectDetail from './components/ProjectDetail';
import LoginPage from './components/LoginPage';
import ChatInterface from './components/ChatInterface';
import { useAuth } from './hooks/useAuth';
import { X, Mail, Camera, Edit2 } from 'lucide-react';
import { fetchProjects, createProject as createProjectCloud } from './lib/dataRepository';

const PROJECTS_STORAGE_KEY = 'schmer_projects_v1';

function App() {
  const auth = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // App view and UI state
  const [state, setState] = useState<AppState>({
    currentView: 'DASHBOARD',
    selectedProjectId: null,
    activeTab: 'overview',
    darkMode: true
  });

  // Data state
  const [projects, setProjects] = useState<Project[]>([]);
  const [showProfileSidebar, setShowProfileSidebar] = useState(false);
  const [showChatSidebar, setShowChatSidebar] = useState(false);

  // Load projects from Supabase after auth/session is ready
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!isSupabaseConfigured) return;
      if (!auth.currentUser) return; // wait for login/session
      const cloud = await fetchProjects();
      if (!cancelled) setProjects(cloud);
    };
    run();
    return () => { cancelled = true; };
  }, [auth.currentUser]);
  
  // Optional: run a quick connectivity check in production
  useEffect(() => {
    if (isSupabaseConfigured) {
      diagnoseSupabaseConnectivity();
    }
  }, []);

  // Dark mode
  useEffect(() => {
    if (state.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [state.darkMode]);

  const handleCreateProject = async (name: string, description: string) => {
    if (!auth.currentUser) return;
    const created = await createProjectCloud(name, description, auth.currentUser.id);
    if (created) setProjects(prev => [created, ...prev]);
  };

  const handleSelectProject = (projectId: string) => {
    setState(prev => ({
      ...prev,
      currentView: 'PROJECT_DETAIL',
      selectedProjectId: projectId
    }));
  };

  const handleViewChange = (view: ViewState) => {
    setState(prev => ({
      ...prev,
      currentView: view,
      selectedProjectId: view === 'DASHBOARD' ? null : prev.selectedProjectId
    }));
    setShowProfileSidebar(false);
    setShowChatSidebar(false);
  };

  const handleProfileImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        auth.updateAvatar(base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleDarkMode = () => {
    setState(prev => ({ ...prev, darkMode: !prev.darkMode }));
  };

  // Expose current Supabase user globally so recording bridge
  // can always derive a username for filenames, even when
  // components forget to pass user info explicitly.
  useEffect(() => {
    try {
      (window as any).SCHMER_CURRENT_USER_ID = auth.currentUser?.id || null;
      (window as any).SCHMER_CURRENT_USER_NAME = auth.currentUser?.name || null;
    } catch {}
  }, [auth.currentUser]);

  // Gate UI until auth state resolves to avoid flicker to login
  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-slate-500 dark:text-slate-400 font-medium">Loading…</div>
      </div>
    );
  }

  if (!auth.currentUser) {
    return <LoginPage onLoginSuccess={() => {}} authHook={auth} />;
  }

  const currentProject = state.selectedProjectId 
    ? projects.find(p => p.id === state.selectedProjectId)
    : null;

  return (
    <Layout 
      user={auth.currentUser} 
      darkMode={state.darkMode} 
      toggleDarkMode={toggleDarkMode}
      currentView={state.currentView}
      onChangeView={handleViewChange}
      onToggleProfile={() => {
        setShowProfileSidebar(prev => !prev);
        setShowChatSidebar(false);
      }}
      onToggleChat={() => {
        setShowChatSidebar(prev => !prev);
        setShowProfileSidebar(false);
      }}
    >
      <div className="absolute top-4 right-20 z-50">
         <button 
          onClick={auth.logout}
          className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-500 px-3 py-1 rounded-full border border-red-500/20 transition-colors font-medium shadow-sm"
         >
           Logout
         </button>
      </div>

      {/* Main Content Area */}
      <div className="relative h-full">
        {state.currentView === 'DASHBOARD' && (
          <Dashboard 
            user={auth.currentUser} 
            projects={projects}
            onSelectProject={handleSelectProject}
            onCreateProject={handleCreateProject}
          />
        )}

        {state.currentView === 'PROJECT_DETAIL' && currentProject && (
          <ProjectDetail 
            project={currentProject}
            meetings={[]}
            sessions={[]}
            chatMessages={MOCK_CHAT.filter(c => c.projectId === currentProject.id)}
            announcements={MOCK_ANNOUNCEMENTS.filter(a => a.projectId === currentProject.id)}
            currentUser={auth.currentUser}
          />
        )}

        {/* Global Sidebar Overlays */}
        {(showProfileSidebar || showChatSidebar) && (
          <div 
            className="fixed inset-0 z-[60] bg-slate-950/20 backdrop-blur-sm transition-all duration-500"
            onClick={() => { setShowProfileSidebar(false); setShowChatSidebar(false); }}
          />
        )}

        {/* Global Profile Sidebar */}
        <div className={`fixed top-20 bottom-0 left-0 w-80 z-[70] transform transition-transform duration-500 ease-in-out bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl ${showProfileSidebar ? 'translate-x-0' : '-translate-x-full'}`}>
           <div className="h-full flex flex-col">
              <div className="h-32 bg-gradient-to-br from-blue-600 to-indigo-700 relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                <button onClick={() => setShowProfileSidebar(false)} className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/30 text-white rounded-full transition-colors backdrop-blur-sm">
                  <X size={18} />
                </button>
              </div>

              <div className="px-8 pb-8 flex flex-col items-center text-center -mt-16">
                <input 
                  id="profileImage"
                  name="profileImage"
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*" 
                  className="hidden" 
                />
                
                <div 
                  className="group relative w-32 h-32 rounded-full p-1.5 bg-white dark:bg-slate-900 shadow-xl mb-4 cursor-pointer overflow-hidden transition-transform active:scale-95"
                  onClick={handleProfileImageClick}
                >
                  <img 
                    src={auth.currentUser.avatar} 
                    alt="Profile" 
                    className="w-full h-full rounded-full object-cover border border-slate-100 dark:border-slate-800 group-hover:opacity-40 transition-opacity" 
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/40 rounded-full">
                    <Camera className="text-white" size={24} />
                  </div>
                </div>
                
                <div className="flex items-center gap-2 group cursor-pointer" onClick={handleProfileImageClick}>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white group-hover:text-blue-500 transition-colors">{auth.currentUser.name}</h2>
                  <Edit2 size={14} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                
                <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 text-xs font-bold uppercase tracking-wider mt-2 mb-6">
                  {auth.currentUser.role}
                </span>

                <div className="w-full space-y-4">
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4 text-left shadow-sm">
                    <div className="p-2 bg-white dark:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-300 shadow-sm">
                      <Mail size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-400 uppercase font-bold">Node Identity</p>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{auth.currentUser.email}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-auto p-6 border-t border-slate-200 dark:border-slate-800 text-center">
                <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-black">Secure Transmission Active</p>
              </div>
           </div>
        </div>

        {/* Global Chat Sidebar */}
        <div className={`fixed top-20 bottom-0 right-0 w-full max-w-[450px] z-[70] transform transition-transform duration-500 ease-in-out bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl ${showChatSidebar ? 'translate-x-0' : 'translate-x-full'}`}>
           <ChatInterface 
             projectId={state.selectedProjectId || 'global'} 
             currentUserId={auth.currentUser.id} 
           />
           <button 
             onClick={() => setShowChatSidebar(false)}
             className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors z-20"
           >
             <X size={20} />
           </button>
        </div>
      </div>
    </Layout>
  );
}

export default App;
