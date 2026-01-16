
import React, { useState } from 'react';
import { ArrowRight, Lock, Mail, Loader2, Zap, User as UserIcon, HelpCircle, ArrowLeft, KeyRound } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { isSupabaseConfigured, CONFIG_ERROR_MESSAGE } from '../lib/supabase';

interface LoginPageProps {
  onLoginSuccess: () => void;
  authHook: ReturnType<typeof useAuth>;
}

type AuthMode = 'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD';

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, authHook }) => {
  const [mode, setMode] = useState<AuthMode>('LOGIN');
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hintResult, setHintResult] = useState<string | null>(null);

  // Form States
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [hint, setHint] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    setHintResult(null);

    try {
      let result: { success: boolean; message?: string } | undefined;

      if (mode === 'LOGIN') {
        result = await authHook.login(email, password);
      } else if (mode === 'REGISTER') {
        result = await authHook.register(name, email, password, hint);
        if (result?.success) {
          // Show success, then auto-switch to login
          setRegisterSuccess(true);
          setTimeout(() => {
            setRegisterSuccess(false);
            setMode('LOGIN');
            setName('');
            setPassword('');
            setHint('');
          }, 1800);
          return;
        }
      } else if (mode === 'FORGOT_PASSWORD') {
        const foundHint = await authHook.getPasswordHint(email);
        if (foundHint) {
          setHintResult(foundHint);
          return;
        } else {
          result = { success: false, message: 'Email not found.' };
        }
      }

      if (result?.success) {
        if (mode !== 'FORGOT_PASSWORD') {
          onLoginSuccess();
        }
      } else {
        setError(result?.message || 'An error occurred');
      }
    } catch (err) {
      setError('An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError(null);
    setHintResult(null);
    setRegisterSuccess(false);
    // Keep email if switching between login/forgot
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 relative overflow-hidden font-sans">
      
      {/* Background Ambience */}
      <div className="absolute top-0 -left-4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-blob"></div>
      <div className="absolute top-0 -right-4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-32 left-20 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-blob animation-delay-4000"></div>
      
      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 pointer-events-none"></div>

      {/* Main Card */}
      <div className="relative z-10 w-full max-w-md p-6 transition-all duration-700 ease-in-out transform animate-fade-in">
        <div className={`backdrop-blur-xl bg-slate-900/60 border border-slate-700/50 shadow-2xl rounded-3xl p-8 md:p-10 relative overflow-hidden group transition-all duration-700 ease-in-out ${mode === 'REGISTER' ? 'animate-slide-in-left' : mode === 'LOGIN' ? 'animate-slide-in-right' : ''}`}>
                    {/* Registration Success Message */}
                    {registerSuccess && (
                      <div className="mb-6 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm text-center font-medium animate-fade-in-down">
                        Account created! Redirecting to sign in...
                      </div>
                    )}
          
          {/* Top light reflection */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50"></div>
          
          {/* Logo Section */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-lg shadow-blue-500/30 mb-4 transform group-hover:scale-110 transition-transform duration-500">
              <Zap className="text-white w-7 h-7" fill="currentColor" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Schmer</h1>
            <p className="text-slate-400 text-xs tracking-widest uppercase font-medium">
              {mode === 'LOGIN' && 'Engineering Intelligence'}
              {mode === 'REGISTER' && 'Create Your ID'}
              {mode === 'FORGOT_PASSWORD' && 'Account Recovery'}
            </p>
          </div>

          {/* Config Warning */}
          {!isSupabaseConfigured && (
            <div className="mb-6 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-sm text-center">
              {CONFIG_ERROR_MESSAGE}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center font-medium animate-pulse">
              {error}
            </div>
          )}

           {/* Hint Result */}
           {hintResult && (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center animate-fade-in-down">
              <p className="text-emerald-400 text-xs uppercase font-bold tracking-wider mb-1">Your Password Hint</p>
              <p className="text-white font-medium">"{hintResult}"</p>
              <button 
                onClick={() => switchMode('LOGIN')}
                className="mt-3 text-xs text-emerald-400 hover:text-emerald-300 underline"
              >
                Return to Login
              </button>
            </div>
          )}

          {/* Form */}
          {!hintResult && !registerSuccess && (
            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* Name Field (Register Only) */}
              {mode === 'REGISTER' && (
                <div className="space-y-1 animate-fade-in">
                  <div className="relative group/input">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <UserIcon className="h-5 w-5 text-slate-500 group-focus-within/input:text-blue-500 transition-colors" />
                    </div>
                    <input
                      id="registerFullName"
                      name="fullName"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="block w-full pl-11 pr-4 py-3 bg-slate-950/50 border border-slate-700/50 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm font-medium"
                      placeholder="Full Name"
                    />
                  </div>
                </div>
              )}

              {/* Email Field */}
              <div className="space-y-1">
                <div className="relative group/input">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-500 group-focus-within/input:text-blue-500 transition-colors" />
                  </div>
                  <input
                    id="authEmail"
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-11 pr-4 py-3 bg-slate-950/50 border border-slate-700/50 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm font-medium"
                    placeholder="name@schmer.io"
                  />
                </div>
              </div>

              {/* Password Field (Not for Forgot Password) */}
              {mode !== 'FORGOT_PASSWORD' && (
                <div className="space-y-1">
                  <div className="relative group/input">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-slate-500 group-focus-within/input:text-blue-500 transition-colors" />
                    </div>
                    <input
                      id="authPassword"
                      name="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-11 pr-4 py-3 bg-slate-950/50 border border-slate-700/50 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm font-medium"
                      placeholder={mode === 'REGISTER' ? "Choose password" : "Password"}
                    />
                  </div>
                  {mode === 'LOGIN' && (
                    <div className="flex justify-end">
                      <button 
                        type="button"
                        onClick={() => switchMode('FORGOT_PASSWORD')}
                        className="text-xs text-slate-500 hover:text-blue-400 transition-colors"
                      >
                        Forgot Password?
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Hint Field (Register Only) */}
              {mode === 'REGISTER' && (
                <div className="space-y-1 animate-fade-in">
                  <div className="relative group/input">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <HelpCircle className="h-5 w-5 text-slate-500 group-focus-within/input:text-blue-500 transition-colors" />
                    </div>
                    <input
                      id="registerHint"
                      name="passwordHint"
                      type="text"
                      required
                      value={hint}
                      onChange={(e) => setHint(e.target.value)}
                      className="block w-full pl-11 pr-4 py-3 bg-slate-950/50 border border-slate-700/50 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm font-medium"
                      placeholder="Password Hint (Required)"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 px-1">Used to recover your account if you forget your password.</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !isSupabaseConfigured}
                className={`
                  w-full relative group/btn flex items-center justify-center gap-2 py-3.5 px-4 
                  bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 
                  text-white rounded-xl font-semibold shadow-lg shadow-blue-500/25 transition-all duration-200 
                  transform active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed
                `}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    {mode === 'LOGIN' && 'Sign In'}
                    {mode === 'REGISTER' && 'Create Account'}
                    {mode === 'FORGOT_PASSWORD' && 'Get Password Hint'}
                    <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Footer Toggles */}
          <div className="mt-8 pt-6 border-t border-slate-800 text-center">
            {mode === 'LOGIN' && (
              <p className="text-slate-500 text-sm">
                New to Schmer?{' '}
                <button onClick={() => switchMode('REGISTER')} className="text-blue-400 hover:text-white font-semibold transition-colors">
                  Create Account
                </button>
              </p>
            )}
            {mode === 'REGISTER' && (
              <p className="text-slate-500 text-sm">
                Already have an ID?{' '}
                <button onClick={() => switchMode('LOGIN')} className="text-blue-400 hover:text-white font-semibold transition-colors">
                  Sign In
                </button>
              </p>
            )}
            {mode === 'FORGOT_PASSWORD' && (
               <button onClick={() => switchMode('LOGIN')} className="flex items-center justify-center gap-2 w-full text-slate-400 hover:text-white text-sm transition-colors">
                  <ArrowLeft size={14} /> Back to Login
               </button>
            )}
          </div>
        </div>
        
        <div className="text-center mt-6 opacity-40">
           <p className="text-[10px] text-slate-500 font-mono tracking-widest">SECURE STORAGE • LOCAL VAULT</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
