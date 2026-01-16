
import React from 'react';
import { 
  LayoutDashboard, 
  FolderKanban, 
  Settings, 
  Moon, 
  Sun,
  Menu,
  X,
  MessageSquare,
  Activity
} from 'lucide-react';
import { User } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  user: User;
  darkMode: boolean;
  toggleDarkMode: () => void;
  currentView: string;
  onChangeView: (view: any) => void;
  onToggleProfile: () => void;
  onToggleChat: () => void;
}

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  user, 
  darkMode, 
  toggleDarkMode,
  currentView,
  onChangeView,
  onToggleProfile,
  onToggleChat
}) => {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  return (
    <div className={`min-h-screen flex ${darkMode ? 'dark' : ''} font-sans selection:bg-blue-500/30`}>
      <div className="flex w-full text-slate-900 dark:text-slate-100 transition-colors duration-500">
        
        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[60] lg:hidden animate-in fade-in duration-300"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`
          fixed inset-y-0 left-0 z-[70] w-72 transform transition-all duration-500 ease-in-out
          bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border-r border-slate-200 dark:border-slate-800/50
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:static lg:block'} 
          shadow-2xl lg:shadow-none
        `}>
          <div className="h-full flex flex-col">
            <div className="h-20 px-8 flex items-center justify-between border-b border-slate-200 dark:border-slate-800/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <Activity size={18} className="text-white" />
                </div>
                <span className="font-extrabold text-xl tracking-tighter text-slate-900 dark:text-white">SCHMER</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-2 text-slate-400">
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 px-4 py-8 space-y-2">
              <button 
                onClick={() => { onChangeView('DASHBOARD'); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-xl transition-all ${
                  currentView === 'DASHBOARD' 
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' 
                    : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <LayoutDashboard size={20} />
                Mission Control
              </button>
              <button 
                onClick={() => { onChangeView('DASHBOARD'); setSidebarOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-xl text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all"
              >
                <FolderKanban size={20} />
                Global Workspace
              </button>
              <div className="pt-4 px-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Maintenance</span>
              </div>
              <button className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-xl text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all">
                <Settings size={20} />
                System Settings
              </button>
            </nav>

            <div className="p-6 border-t border-slate-200 dark:border-slate-800/50">
               <div className="flex items-center justify-between mb-6 px-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Interface</span>
                  <button 
                    onClick={toggleDarkMode}
                    className="p-2 text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 rounded-xl hover:scale-110 transition-transform"
                  >
                    {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                  </button>
               </div>
               <div 
                  className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                  onClick={onToggleProfile}
               >
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-200 dark:bg-slate-800">
                      <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{user.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">ID: {user.id.slice(0, 6)}</p>
                    </div>
                  </div>
               </div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">
          <header className="h-20 bg-white/70 dark:bg-slate-950/70 backdrop-blur-2xl border-b border-slate-200 dark:border-slate-800/50 flex items-center justify-between px-6 lg:px-10 z-50">
            <div className="flex items-center gap-6">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                <Menu size={24} />
              </button>
              <div className="flex items-center gap-3">
                 <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                 <h2 className="text-sm font-medium text-slate-600 dark:text-slate-300">Network Active</h2>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button 
                onClick={onToggleChat}
                className="p-2.5 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 rounded-xl hover:text-blue-500 dark:hover:text-blue-400 transition-all hover:scale-105"
              >
                <MessageSquare size={20} />
              </button>
              <button 
                onClick={onToggleProfile}
                className="w-10 h-10 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 hover:scale-105 transition-transform bg-slate-200 dark:bg-slate-800"
              >
                <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto relative custom-scrollbar">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

export default Layout;
