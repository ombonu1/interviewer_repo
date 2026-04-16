'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

// Sub-components (Ensure these are in your components/reviewer folder)
import SubmissionTable from '../../../components/reviewer/SubmissionTable';
import AuditModal from '../../../components/reviewer/AuditModal';
import { Highlight } from '../../../components/reviewer/Highlight';
import SubmissionCard from '../../../components/reviewer/SubmissionCard';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface SubmissionSummary {
  id: string;
  project_name: string;
  compliance_score: number;
  status: string;
  has_been_audited: boolean;
}

export default function ReviewerHub() {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<any | null>(null);
  
  // AI Copilot & Chat States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [humanMessages, setHumanMessages] = useState<any[]>([]);
  
  // UI & Flow States
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [manualInstruction, setManualInstruction] = useState('');
  const [dismissedIssues, setDismissedIssues] = useState<string[]>([]);
  
  // Approval Flow States
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSuccessOverlay, setIsSuccessOverlay] = useState(false);
  const [countdown, setCountdown] = useState(5);

  // --- 🔄 DATA FETCHING & POLLING ---

  useEffect(() => { fetchSubmissions(); }, []);

  // Human Chat Polling
  useEffect(() => {
    if (!selectedSubmission) return;
    const fetchChat = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/chat/human/${selectedSubmission.session_id}`);
        const data = await res.json();
        setHumanMessages(data);
      } catch (err) { console.error("Poll error", err); }
    };
    fetchChat();
    const interval = setInterval(fetchChat, 3000);
    return () => clearInterval(interval);
  }, [selectedSubmission]);

  // Trigger Copilot on Open
  useEffect(() => {
    if (selectedSubmission && !analysis && !isAnalyzing) runCopilot();
  }, [selectedSubmission]);

  // Redirection Countdown Timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isSuccessOverlay && countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (isSuccessOverlay && countdown === 0) {
      handleBackToQueue();
    }
    return () => clearTimeout(timer);
  }, [isSuccessOverlay, countdown]);

  // --- 🛠️ API ACTIONS ---

  const fetchSubmissions = async () => {
    const res = await fetch(`${API_BASE}/api/submissions`);
    if (res.ok) setSubmissions(await res.json());
  };

  const handleDismissIssue = (id: string) => {
    setDismissedIssues(prev => [...prev, id]);
    setActiveComment(null); 
  };

  const openSubmission = async (id: string) => {
    const res = await fetch(`${API_BASE}/api/submissions/${id}`);
    if (res.ok) {
      setSelectedSubmission(await res.json());
      setAnalysis(null);
      setChatInput('');
      setDismissedIssues([]); // Reset dismissed issues on new open
    }
  };

  const runCopilot = async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${API_BASE}/api/reviewer/analyze/${selectedSubmission.session_id}`, { method: 'POST' });
      const data = await res.json();
      setAnalysis(data);
      setChatInput(data.client_email_draft || '');
    } finally { setIsAnalyzing(false); }
  };

  const handleManualReRun = async () => {
    if (!selectedSubmission) return;

    setIsAnalyzing(true);
    try {
      // 1. If the box is empty, we give the AI a default instruction so it doesn't get confused.
      // 2. We ALWAYS hit the 'analyze-manual' endpoint because it bypasses the cache!
      const instructionToSend = manualInstruction.trim() !== '' 
        ? manualInstruction 
        : "Please perform a standard re-audit of the technical narrative to ensure all compliance scores and flags are accurate and up to date.";

      const res = await fetch(`${API_BASE}/api/reviewer/analyze-manual/${selectedSubmission.session_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: instructionToSend })
      });

      if (!res.ok) throw new Error("Manual re-run failed");

      const newAnalysis = await res.json();
      
      // Update the UI with the fresh data
      setAnalysis(newAnalysis);
      setSelectedSubmission((prev: any) => ({
        ...prev,
        reviewer_analysis: newAnalysis
      }));

      setDismissedIssues([]); 
      setActiveComment(null);

      toast.success("AI Re-audit complete!");
      setManualInstruction(''); // Clear the box after success
    } catch (err) {
      console.error(err);
      toast.error("Failed to re-run AI agent.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput('');
    
    // Optimistic Update
    setHumanMessages(prev => [...prev, { sender: 'tax_team', message: msg, timestamp: new Date().toISOString() }]);

    await fetch(`${API_BASE}/api/chat/human/${selectedSubmission.session_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: 'tax_team', message: msg })
    });
  };

  // --- 🛡️ APPROVAL & RETURN FLOW ---

  const triggerApprovalFlow = () => setShowConfirmModal(true);

  const executeApprove = async () => {
    setShowConfirmModal(false);
    const res = await fetch(`${API_BASE}/api/reviewer/approve/${selectedSubmission.session_id}`, { method: 'POST' });
    if (res.ok) {
      setIsSuccessOverlay(true);
    } else {
      toast.error("Failed to approve submission.");
    }
  };

  const handleReturn = async () => {
    const res = await fetch(`${API_BASE}/api/reviewer/return/${selectedSubmission.session_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_body: chatInput })
    });

    if (res.ok) {
      toast.success("Returned to Client");
      setSelectedSubmission(null);
      fetchSubmissions();
    } else {
      toast.error("Failed to return submission.");
    }
  };

  const handleBackToQueue = () => {
    setIsSuccessOverlay(false);
    setSelectedSubmission(null);
    setCountdown(5);
    fetchSubmissions();
  };

  // State Lock Logic
  const isReturned = selectedSubmission?.status === 'Returned';

  // --- 🖼️ UI RENDER ---

  return (
    <div className="h-screen w-full flex flex-col bg-slate-50 font-sans overflow-hidden relative">
      {isAnalyzing && <LoadingOverlay />}

      {/* 🟢 SUCCESS OVERLAY */}
      {isSuccessOverlay && (
        <div className="fixed inset-0 z-200 bg-slate-900 flex flex-col items-center justify-center text-white animate-in fade-in duration-500">
          <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(16,185,129,0.4)]">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
          </div>
          <h2 className="text-4xl font-bold mb-2">AIF Successfully Approved</h2>
          <p className="text-slate-400 mb-8 text-lg">The file has been moved to the Approved Queries directory.</p>
          <div className="flex gap-4">
            <button onClick={handleBackToQueue} className="px-8 py-3 bg-white text-slate-900 rounded-xl font-bold hover:bg-slate-100 transition-all">
              Return to Triage Queue ({countdown}s)
            </button>
            <button className="px-8 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-all border border-slate-700">
              View Approved Directory
            </button>
          </div>
        </div>
      )}

      {/* 🔴 CONFIRMATION MODAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-150 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-bold text-slate-900 mb-4">Final Approval</h3>
            <div className="space-y-4 mb-8">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex justify-between mb-2">
                  <span className="text-slate-500 text-sm">Confidence Score:</span>
                  <span className={`font-bold ${analysis?.confidence_score > 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {analysis?.confidence_score}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 text-sm">Active AI Flags:</span>
                  <span className="font-bold text-red-500">
                    {Math.max(0, Object.values(analysis?.section_flags || {}).filter(Boolean).length - dismissedIssues.length)}
                  </span>
                </div>
              </div>
              <p className="text-amber-700 bg-amber-50 p-4 rounded-xl text-xs font-medium leading-relaxed border border-amber-200">
                ⚠️ Warning: This action is irreversible. Approving this AIF will lock the document and move it to the final submission archive.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirmModal(false)} className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-all">Cancel</button>
              <button onClick={executeApprove} className="flex-1 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-emerald-600 transition-all shadow-lg">Confirm Approval</button>
            </div>
          </div>
        </div>
      )}

      {!selectedSubmission ? (
        <div className="flex-1 overflow-hidden flex flex-col">
            <header className="flex-none h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-10">
                <div className="flex items-center gap-4">
                    <h1 className="font-bold text-slate-800 text-lg">Reviewer Hub</h1>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-bold border border-emerald-100 hover:bg-emerald-100 transition-all">
                    📁 Approved Queries
                </button>
            </header>
            <QueueView submissions={submissions} onRefresh={fetchSubmissions} onOpen={openSubmission} />
        </div>
      ) : (
        <WorkbenchView 
          submission={selectedSubmission} 
          messages={humanMessages}
          analysis={analysis}
          chatInput={chatInput}
          setChatInput={setChatInput}
          activeComment={activeComment}
          setActiveComment={setActiveComment}
          manualInstruction={manualInstruction}
          setManualInstruction={setManualInstruction}
          handleManualReRun={handleManualReRun}
          isAnalyzing={isAnalyzing}
          onBack={() => setSelectedSubmission(null)}
          onShowAudit={() => setShowAuditModal(true)}
          onSendChat={sendChatMessage}
          onApprove={triggerApprovalFlow}
          onReturn={handleReturn}
          dismissedIssues={dismissedIssues}
          handleDismissIssue={handleDismissIssue}
          isReturned={isReturned}
        />
      )}

      {showAuditModal && (
        <AuditModal 
          submission={selectedSubmission} 
          onClose={() => setShowAuditModal(false)} 
        />
      )}
    </div>
  );
}

// --- 🏗️ SUB-COMPONENTS ---

function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-250 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center">
        <div className="animate-spin h-12 w-12 text-blue-600 mb-6 border-4 border-slate-200 border-t-blue-600 rounded-full"></div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Agent is Auditing</h2>
        <p className="text-slate-500 text-sm">Cross-referencing technical narratives and guidelines...</p>
      </div>
    </div>
  );
}

const QueueView = ({ submissions, onOpen, onRefresh }: any) => {
  const inProgress = submissions.filter((s: any) => s.has_been_audited && s.status !== 'Returned');
  const newArrivals = submissions.filter((s: any) => !s.has_been_audited && s.status !== 'Returned');
  const returned = submissions.filter((s: any) => s.status === 'Returned');

  return (
    <div className="flex-1 p-8 space-y-12 overflow-y-auto">
      <div className="flex justify-between items-end max-w-5xl mx-auto">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">AIF Triage Queue</h2>
          <p className="text-slate-500">Review and audit client submissions before generating official HMRC documents.</p>
        </div>
        <button onClick={onRefresh} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg shadow-sm hover:bg-slate-50 text-sm font-semibold transition-colors">
          Refresh Queue
        </button>
      </div>

      <div className="max-w-5xl mx-auto space-y-12">
        {/* 🟢 NEW ARRIVALS */}
        <section>
          <h3 className="text-xs font-black uppercase text-slate-400 mb-4 tracking-widest">New Arrivals</h3>
          <div className="grid grid-cols-1 gap-4">
            {newArrivals.length === 0 ? <p className="text-sm text-slate-400 italic">No new submissions.</p> : null}
            {newArrivals.map((sub: SubmissionSummary) => (
              <SubmissionCard key={sub.id} sub={sub} onOpen={onOpen} buttonText="Start Audit" />
            ))}
          </div>
        </section>

        {/* 🔴 RETURNED FOR EDITS */}
        <section>
          <h3 className="text-xs font-black uppercase text-slate-400 mb-4 tracking-widest">Awaiting Client Edits (Returned)</h3>
          <div className="grid grid-cols-1 gap-4">
            {returned.length === 0 ? <p className="text-sm text-slate-400 italic">No returned submissions.</p> : null}
            {returned.map((sub: SubmissionSummary) => (
              <SubmissionCard key={sub.id} sub={sub} onOpen={onOpen} buttonText="View Sent Docs" />
            ))}
          </div>
        </section>

        {/* 🔵 IN PROGRESS */}
        <section>
          <h3 className="text-xs font-black uppercase text-slate-400 mb-4 tracking-widest">Currently Auditing</h3>
          <div className="grid grid-cols-1 gap-4">
            {inProgress.length === 0 ? <p className="text-sm text-slate-400 italic">No audits in progress.</p> : null}
            {inProgress.map((sub: SubmissionSummary) => (
              <SubmissionCard key={sub.id} sub={sub} onOpen={onOpen} buttonText="Continue Review" />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

function WorkbenchView({ 
  submission, messages, analysis, chatInput, setChatInput, activeComment, setActiveComment, 
  onBack, onShowAudit, onSendChat, onApprove, onReturn, manualInstruction, setManualInstruction, 
  handleManualReRun, isAnalyzing, dismissedIssues, handleDismissIssue, isReturned 
}: any) {
  const proj = submission.aif_state.project_narratives?.[0] || {};

  // Local state for toggling the AI Steerage controls
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  
  return (
    <div className="flex-1 flex w-full h-full overflow-hidden">
      
      {/* --- Sidebar Chat --- */}
      <div className="w-112.5 flex-none bg-slate-50 border-r border-slate-200 flex flex-col shadow-xl z-10 h-full">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white shadow-sm z-10">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded hover:bg-slate-200 text-xs font-bold">Queue</button>
            <button onClick={onShowAudit} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded text-xs font-bold shadow-sm">Audit Log</button>
          </div>
          <div className="flex items-center gap-4 text-right">
             <div className="hidden lg:block relative group cursor-help">
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Confidence</p>
                 <p className={`text-sm font-black ${analysis?.confidence_score > 80 ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {analysis?.confidence_score || 0}%
                 </p>
                 
                 {/* The Hover Tooltip */}
                 {analysis?.confidence_explanation && (
                   <div className="absolute right-0 top-full mt-2 w-72 p-4 bg-slate-800 text-slate-100 text-[11px] rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all shadow-2xl z-50 text-left cursor-default">
                     <p className="font-bold text-blue-400 mb-1.5 uppercase tracking-wider text-[9px]">Score Rationale</p>
                     <p className="leading-relaxed mb-3">{analysis.confidence_explanation}</p>
                     
                     {/* AI Disclaimer */}
                     <div className="pt-2.5 border-t border-slate-700">
                        <p className="text-[9px] text-slate-400 italic leading-snug flex items-start gap-1.5">
                          <svg className="w-3 h-3 shrink-0 mt-px text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                          <span>AI can make mistakes. This score is automated guidance—please apply professional discretion before final approval.</span>
                        </p>
                     </div>

                     {/* Triangle Pointer */}
                     <div className="absolute -top-1 right-6 w-3 h-3 bg-slate-800 rotate-45"></div>
                   </div>
                 )}
             </div>
             <div className="w-px h-6 bg-slate-200"></div>
             <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reviewing</p>
                <p className="text-sm font-bold text-slate-800 truncate max-w-37.5">{proj.project_name || 'Unnamed'}</p>
             </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 flex flex-col space-y-4">
          {messages.map((msg: any, i: number) => (
             <div key={i} className={`flex ${msg.sender === 'tax_team' ? 'justify-end' : 'justify-start'}`}>
               <div className={`max-w-[85%] rounded-2xl p-3.5 shadow-sm text-[13px] leading-relaxed ${msg.sender === 'tax_team' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none'}`}>
                 <div className={`text-[10px] font-bold mb-1 uppercase tracking-wider ${msg.sender === 'tax_team' ? 'text-blue-200' : 'text-slate-400'}`}>
                   {msg.sender === 'tax_team' ? 'Tax Team' : 'Client'}
                 </div>
                 {msg.message}
               </div>
             </div>
          ))}
        </div>

        <div className="p-4 bg-white border-t border-slate-200 shadow-inner">
          <textarea 
            className="w-full h-32 p-4 text-[13px] border text-slate-800 border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none mb-3"
            value={chatInput} 
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Type message..." 
          />
          <div className="flex justify-between">
            <div className="flex gap-2">
               <button 
                 onClick={onApprove} 
                 disabled={isReturned}
                 className={`text-xs font-bold px-3 py-1.5 rounded transition-colors ${isReturned ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200'}`}
               >
                 Approve
               </button>
               <button 
                 onClick={onReturn} 
                 disabled={isReturned}
                 className={`text-xs font-bold px-3 py-1.5 rounded transition-colors ${isReturned ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'text-amber-700 bg-amber-100 hover:bg-amber-200'}`}
               >
                 Return AIF
               </button>
            </div>
            <button onClick={onSendChat} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-bold">Send Chat</button>
          </div>
        </div>
      </div>

      {/* --- Document Viewer --- */}
      <div className={`flex-1 bg-[#E2E8F0] overflow-y-auto p-12 custom-scrollbar relative flex justify-center ${isReturned ? 'grayscale opacity-75' : ''}`} onClick={() => setActiveComment(null)}>
          
          {/* AI Steerage Toggle & Box */}
          <div className={`fixed top-24 right-12 z-30 transition-all ${isReturned ? 'opacity-50 pointer-events-none' : ''}`}>
            {!isControlsOpen ? (
              <div className="group relative flex items-center">
                {/* Tooltip */}
                <div className="absolute right-full mr-4 px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0 pointer-events-none whitespace-nowrap shadow-lg">
                  Re-run Agent Analysis
                  <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
                </div>
                {/* Floating Action Button */}
                <button 
                  onClick={() => setIsControlsOpen(true)}
                  className="w-14 h-14 bg-white border border-slate-200 shadow-xl rounded-full flex items-center justify-center text-blue-600 hover:bg-blue-50 hover:scale-105 transition-all active:scale-95"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                </button>
              </div>
            ) : (
              <div className="w-80 bg-white/95 backdrop-blur-md border border-slate-200 shadow-2xl rounded-2xl p-5 animate-in zoom-in-95 duration-200 origin-top-right">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                    </span>
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-widest">Agent Controls</span>
                  </div>
                  <button 
                    onClick={() => setIsControlsOpen(false)} 
                    className="text-slate-400 hover:text-slate-600 transition-colors bg-slate-100 hover:bg-slate-200 rounded-full p-1.5"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>

                <textarea 
                  value={manualInstruction}
                  onChange={(e) => setManualInstruction(e.target.value)}
                  disabled={isReturned}
                  placeholder="Add specific context or leave blank for a standard re-scan..."
                  className="w-full text-[13px] p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none resize-none text-slate-700 placeholder:text-slate-400 transition-all shadow-inner mb-3"
                  rows={3}
                />
                
                <button 
                  onClick={() => {
                    handleManualReRun();
                  }}
                  disabled={isAnalyzing || isReturned}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-[13px] font-bold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95"
                >
                  {isAnalyzing ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Re-Analyzing...
                    </>
                  ) : 'Run Analysis'}
                </button>

                <p className="text-[10px] text-slate-400 mt-3 text-center leading-relaxed">
                  {isReturned ? "AIF is locked while awaiting client edits." : "Re-evaluate the document to update compliance scores and active flags."}
                </p>
              </div>
            )}
          </div>

          {/* The Physical Paper */}
          <div className={`w-187.5 bg-white shadow-2xl p-16 pb-24 h-fit shrink-0 min-h-264 relative text-slate-900 ${isReturned ? 'pointer-events-none' : 'pointer-events-auto'}`} style={{ marginRight: activeComment ? '350px' : '0', transition: 'margin 0.3s' }}>
            <div className="flex justify-between items-start mb-10 border-b-2 border-slate-800 pb-4">
              <div>
                <h1 className="text-2xl font-bold uppercase tracking-wide font-serif text-black">Technical Project Narrative</h1>
                <p className="text-sm font-serif text-slate-500 mt-1">Internal Tax Team Submission</p>
              </div>
              <span className="text-xs text-slate-400 font-sans uppercase font-bold">Confidential</span>
            </div>
            
            {/* 1. Project Overview */}
            <h2 className="text-lg font-bold bg-slate-100 p-2 mb-6 border-l-4 border-slate-800 text-slate-900 font-sans">1. Project Overview</h2>
            <div className="grid grid-cols-2 gap-y-6 gap-x-8 px-2 mb-10">
              <div className="col-span-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Project Name</p>
                <p className="font-bold text-slate-900 text-lg">{proj.project_name || 'Unnamed Project'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Lead Competent Professional</p>
                <Highlight 
                  issueId="competent_professional" 
                  analysis={analysis} 
                  activeComment={activeComment} 
                  setActiveComment={setActiveComment} 
                  isDismissed={dismissedIssues.includes('competent_professional')} 
                  onDismiss={handleDismissIssue}
                >
                  <span className="font-semibold text-slate-800 leading-relaxed">
                    {proj.competent_professional || 'No technical lead identified'}
                  </span>
                </Highlight>
              </div>
            </div>

            {/* 2. Technical Narrative */}
            <h2 className="text-lg font-bold bg-slate-100 p-2 mb-6 border-l-4 border-slate-800 text-slate-900 font-sans">2. Technical Narrative</h2>
            <div className="space-y-8 text-[15px] leading-relaxed text-slate-800 px-2">
              <div>
                <p className="font-bold text-slate-500 text-[10px] uppercase font-sans mb-1">A. Advance Sought</p>
                <Highlight issueId="advance" analysis={analysis} activeComment={activeComment} setActiveComment={setActiveComment} isDismissed={dismissedIssues.includes('advance')} onDismiss={handleDismissIssue}> 
                  {proj.advance_sought || 'Not provided'}
                </Highlight>
              </div>

              <div>
                <p className="font-bold text-slate-500 text-[10px] uppercase font-sans mb-1">B. Scientific Uncertainties</p>
                <Highlight issueId="uncertainties" analysis={analysis} activeComment={activeComment} setActiveComment={setActiveComment} isDismissed={dismissedIssues.includes('uncertainties')} onDismiss={handleDismissIssue}>
                  {proj.scientific_uncertainties || 'Not provided'}
                </Highlight>
              </div>

              <div>
                <p className="font-bold text-slate-500 text-[10px] uppercase font-sans mb-1">C. Why it was unresolvable</p>
                <Highlight issueId="unresolvable" analysis={analysis} activeComment={activeComment} setActiveComment={setActiveComment} isDismissed={dismissedIssues.includes('unresolvable')} onDismiss={handleDismissIssue}>
                  {proj.why_unresolvable_by_professional || 'Not provided'}
                </Highlight>
              </div>

              <div>
                <p className="font-bold text-slate-500 text-[10px] uppercase font-sans mb-1">D. Activities Undertaken</p>
                <Highlight issueId="activities" analysis={analysis} activeComment={activeComment} setActiveComment={setActiveComment} isDismissed={dismissedIssues.includes('activities')} onDismiss={handleDismissIssue}>
                  {proj.activities_undertaken || 'Not provided'}
                </Highlight>
              </div>

              <div>
                <p className="font-bold text-slate-500 text-[10px] uppercase font-sans mb-1">E. Project Outcomes</p>
                <Highlight issueId="outcomes" analysis={analysis} activeComment={activeComment} setActiveComment={setActiveComment} isDismissed={dismissedIssues.includes('outcomes')} onDismiss={handleDismissIssue}>
                  {proj.outcomes || 'Not provided'}
                </Highlight>
              </div>
            </div>

            {/* 3. Compliance Flags */}
            <div className="mt-12 pt-8 border-t border-slate-200">
              <h2 className="text-lg font-bold bg-slate-100 p-2 mb-6 border-l-4 border-slate-800 text-slate-900 font-sans">3. Compliance Flags</h2>
              <div className="grid grid-cols-2 gap-x-12 gap-y-4 px-2">
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-sm text-slate-600">Overseas R&D?</span>
                  <span className="font-bold text-slate-900 text-sm">{submission.aif_state.compliance?.overseas_rnd ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-sm text-slate-600">AI Used?</span>
                  <span className="font-bold text-slate-900 text-sm">{submission.aif_state.compliance?.ai_used ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-sm text-slate-600">Quantum Used?</span>
                  <span className="font-bold text-slate-900 text-sm">{submission.aif_state.compliance?.quantum_used ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </div>
          </div>
      </div>
    </div>
  );
}