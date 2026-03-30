'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// DEMO CONSTANTS (Easy to swap out for real env vars later)
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD || 'admin';

export default function Home() {
  const router = useRouter();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // 1. PRO UX: Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showPasswordModal) {
        closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPasswordModal]);

  // 2. PRO UX: Lock background scroll when modal is open
  useEffect(() => {
    if (showPasswordModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [showPasswordModal]);

  const closeModal = () => {
    setShowPasswordModal(false);
    setError('');
    setPassword('');
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    // NOTE FOR HANDOVER: In production, swap this with next-auth or a fetch to /api/auth
    if (password === DEMO_PASSWORD) {
      router.push('/dashboard'); // Assumes your ReviewerHub is at /dashboard
    } else {
      setError('Invalid credentials. Please try again.');
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-linear-to-br from-slate-50 to-slate-200 font-sans relative">
      
      {/* Password Modal Overlay */}
      {showPasswordModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md relative animate-in fade-in zoom-in duration-200">
            <button 
              onClick={closeModal}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            </div>
            
            <h3 className="text-2xl font-bold text-slate-800 mb-1">Tax Team Login</h3>
            
            {/* 3. PRO UX: Helper text so reviewers don't get stuck during the demo */}
            <p className="text-slate-500 text-sm mb-6 flex items-center gap-2">
              Enter your reviewer credentials to access the hub. 
              <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-bold border border-slate-200">Demo Pass: {DEMO_PASSWORD}</span>
            </p>
            
            <form onSubmit={handleLogin}>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password..."
                className={`w-full px-4 py-3 bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 transition-shadow mb-2 ${error ? 'border-red-300 focus:ring-red-500/20' : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20'}`}
                autoFocus
              />
              
              <div className="h-6">
                {error && <p className="text-red-500 text-xs font-medium animate-in slide-in-from-top-1">{error}</p>}
              </div>
              
              <button 
                type="submit" 
                disabled={!password}
                className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 disabled:hover:bg-emerald-600"
              >
                Authenticate
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MOCK NAVBAR --- */}
      <header className="w-full h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-xl shadow-inner">
            R
          </div>
          <span className="font-semibold text-slate-800 text-lg tracking-tight">RDEC Portal</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">v1.0 Demo</span>
          <div className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white shadow-sm"></div>
        </div>
      </header>

      {/* --- MAIN HERO SECTION --- */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 relative z-0">
        
        <div className="text-center mb-16 max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="inline-block mb-4 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-bold uppercase tracking-wider shadow-sm">
            HMRC Compliance Engine
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">
            Streamline your RDEC claims.
          </h1>
          <p className="text-lg text-slate-600">
            Select your workspace below. Use the AI Interviewer to generate compliant AIFs, or access the Reviewer Hub to audit submissions.
          </p>
        </div>
        
        {/* --- CARDS CONTAINER --- */}
        <div className="flex flex-col md:flex-row gap-8 w-full max-w-4xl justify-center animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150 fill-mode-both">
          
          {/* INTERVIEWER CARD */}
          <Link 
            href="/setup" 
            className="group relative flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full md:w-96 hover:shadow-xl hover:-translate-y-1 hover:border-blue-300 transition-all duration-300 cursor-pointer"
          >
            <div className="absolute top-6 right-6 px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-bold uppercase rounded-md tracking-wide">
              Active
            </div>
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-6 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300 shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Interviewer</h2>
            <p className="text-slate-500 leading-relaxed mb-6">
              Start a new guided session. Our AI agent will extract necessary project narratives and financial data to build your draft.
            </p>
            <div className="mt-auto flex items-center text-blue-600 font-semibold text-sm group-hover:translate-x-1 transition-transform">
              Launch Workspace <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
            </div>
          </Link>

          {/* REVIEWER HUB CARD */}
          <div 
            onClick={() => setShowPasswordModal(true)}
            className="group relative flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full md:w-96 hover:shadow-xl hover:-translate-y-1 hover:border-emerald-300 transition-all duration-300 cursor-pointer"
          >
            <div className="absolute top-6 right-6 flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-bold uppercase rounded-md tracking-wide">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              Tax Team Only
            </div>
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-6 group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300 shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Reviewer Hub</h2>
            <p className="text-slate-500 leading-relaxed mb-6">
              Dashboard for the internal tax team to audit generated AIF drafts, review AI confidence flags, and request client amendments.
            </p>
            <div className="mt-auto flex items-center text-emerald-600 font-semibold text-sm group-hover:translate-x-1 transition-transform">
              Access Hub <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
            </div>
          </div>

        </div>
      </main>

      {/* --- MOCK FOOTER --- */}
      <footer className="w-full p-6 text-center text-slate-400 text-xs border-t border-slate-200/50 bg-white/50 backdrop-blur-sm z-10">
        <p>&copy; {new Date().getFullYear()} RDEC Compliance Portal. Secure AI-Assisted Data Extraction.</p>
      </footer>

    </div>
  );
}