'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import ClaimsDirectory from '@/components/ClaimsDirectory';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function SetupPage() {
  const router = useRouter();
  const [isParsing, setIsParsing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [folderData, setFolderData] = useState({ returned: [], saved: [], sent: [] });

  // Fetch dashboard data on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/client/dashboard`)
      .then(res => res.json())
      .then(data => {
        // 🛑 DEDUPLICATION GUARDRAIL
        // Ensure that if a submission is in 'sent' or 'returned', it NEVER appears in 'saved'
        const sentIds = new Set(data.sent.map((s: any) => s.session_id));
        const returnedIds = new Set(data.returned.map((s: any) => s.session_id));
        
        const strictSaved = data.saved.filter(
          (s: any) => !sentIds.has(s.session_id) && !returnedIds.has(s.session_id)
        );

        setFolderData({
          returned: data.returned,
          sent: data.sent,
          saved: strictSaved // Use the clean array
        });
      })
      .catch(() => console.error("Could not load claims history."));
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setIsParsing(true);
    const formData = new FormData();
    formData.append('file', e.target.files[0]);

    try {
      const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      
      sessionStorage.setItem('draft_aif_state', JSON.stringify(data.extracted_state));
      sessionStorage.setItem('draft_is_complete', String(data.is_complete));
      sessionStorage.setItem('draft_summary', data.message);
      
      router.push('/chat?draft=true');
    } catch (err) {
      toast.error("Failed to parse document. Check backend connection.");
      setIsParsing(false);
    }
  };

  // 🚦 SMART ROUTER: Handles where the user goes based on the claim's status
  const handleOpenClaim = (claim: any, type: 'returned' | 'saved' | 'sent') => {
    
    // 1. Keep the session ID tracking
    sessionStorage.setItem('current_session_id', claim.session_id);

      // 2. If the claim is currently under review, block access to the chat and show a toast
    if (type === 'sent') {
      toast("This claim is currently locked for Tax Team review.", { icon: '🔒' });
      return;
    }

    setIsModalOpen(false);
    
    if (type === 'returned') {
      router.push(`/chat?session_id=${claim.session_id}&returned=true`);
    } 
    else if (type === 'saved') {
      router.push(`/chat?session_id=${claim.session_id}`);
    } 
};

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      
      {/* 1. THE CLAIMS DIRECTORY MODAL */}
      {isModalOpen && (
        <ClaimsDirectory 
          data={folderData} 
          onClose={() => setIsModalOpen(false)} 
          onOpenClaim={handleOpenClaim}
        />
      )}

      {/* 2. THE RESTORED NAVIGATION HEADER */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center px-8 justify-between shadow-sm sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          </Link>
          <div className="h-6 w-px bg-slate-200"></div>
          <h1 className="font-bold text-slate-800 tracking-tight">RDEC Draft Intelligence</h1>
        </div>

        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-600 transition-all shadow-md group"
        >
          <svg className="w-4 h-4 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
          My Claims Directory
          {folderData.returned.length > 0 && (
            <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse ml-1"></span>
          )}
        </button>
      </header>

      {/* 3. MAIN WORKSPACE */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 space-y-12">
        <div className="text-center space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">How would you like to begin?</h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">Transform your technical data into an HMRC-compliant narrative.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
          
          {/* OPTION A: UPLOAD */}
          <div className="relative group">
            {isParsing && (
               <div className="absolute inset-0 z-20 bg-white/90 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center border-2 border-blue-500 animate-pulse">
                  <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                  <span className="font-bold text-blue-700 uppercase tracking-widest text-xs">Analyzing Draft...</span>
               </div>
            )}
            <label className="flex flex-col h-full bg-white p-10 rounded-3xl border-2 border-slate-200 hover:border-blue-500 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer group">
              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 transition-transform">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-2">Import Technical Draft</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-8">AI will scan your PDF or Word notes to pre-fill the interview and build the technical foundation.</p>
              <div className="mt-auto flex items-center text-blue-600 font-bold text-sm uppercase tracking-wide group-hover:translate-x-2 transition-transform">
                Browse Files <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
              </div>
              <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.docx" disabled={isParsing} />
            </label>
          </div>

          {/* OPTION B: SCRATCH */}
          <Link 
            href="/chat" 
            onClick={() => {
               sessionStorage.removeItem('draft_aif_state');
               sessionStorage.removeItem('draft_summary');
            }}
            className="flex flex-col h-full bg-white p-10 rounded-3xl border-2 border-slate-200 hover:border-emerald-500 hover:shadow-2xl hover:-translate-y-1 transition-all group"
          >
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2">Guided Interview</h3>
            <p className="text-slate-500 text-sm leading-relaxed mb-8">Don't have a document? Walk through a structured session with our agent to build your claim from scratch.</p>
            <div className="mt-auto flex items-center text-emerald-600 font-bold text-sm uppercase tracking-wide group-hover:translate-x-2 transition-transform">
              Start Session <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
            </div>
          </Link>

        </div>
      </main>
    </div>
  );
}