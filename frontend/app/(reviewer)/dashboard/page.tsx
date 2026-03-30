'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';

// 1. USE THE ENVIRONMENT VARIABLE
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// 2. DEFINE STRICT TYPES (Eliminates 'any' abuse)
interface SubmissionSummary {
  id: string;
  project_name: string;
  compliance_score: number;
  status: string;
  has_been_audited: boolean;
}

interface HumanMessage {
  sender: 'tax_team' | 'client';
  message: string;
  timestamp: string;
}

interface AuditLogEntry {
  timestamp: string;
  ai_question: string;
  user_answer: string;
  extracted_fields?: string[];
}

interface CopilotAnalysis {
  confidence_score: number;
  red_flags: string[];
  positive_notes: string[];
  client_email_draft: string;
}

interface FullSubmission {
  session_id: string;
  status: string;
  aif_state: {
    company_details?: { company_name?: string; competent_professional_details?: string };
    financials?: { staff_costs?: number; subcontractor_costs?: number; software?: number; cloud?: number };
    project_narratives?: Array<{ project_name?: string; advance_sought?: string; scientific_uncertainties?: string; outcomes?: string }>;
    compliance?: { overseas_rnd?: boolean; ai_used?: boolean };
  };
  audit_summary: {
    completeness_score: number;
    compliance_score: number;
    summary_text: string;
    detailed_log: AuditLogEntry[];
  };
  reviewer_analysis?: CopilotAnalysis;
}

export default function ReviewerHub() {
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<FullSubmission | null>(null);
  
  // Copilot States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<CopilotAnalysis | null>(null);
  const [chatInput, setChatInput] = useState('');
  
  // UI States
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [humanMessages, setHumanMessages] = useState<HumanMessage[]>([]);

  // INITIAL FETCH
  useEffect(() => {
    fetchSubmissions();
  }, []);

  // REAL-TIME POLLING FOR HUMAN CHAT
  useEffect(() => {
    if (!selectedSubmission) return;
    
    // Initial fetch
    const fetchChat = () => {
      fetch(`${API_BASE}/api/chat/human/${selectedSubmission.session_id}`)
        .then(res => res.json())
        .then(data => setHumanMessages(data))
        .catch(err => console.error("Failed to load chat", err));
    };
    
    fetchChat();
    
    // Poll every 3 seconds for new messages
    const interval = setInterval(fetchChat, 3000);
    return () => clearInterval(interval); // Cleanup to prevent memory leaks
  }, [selectedSubmission]);

  // AUTO-RUN THE AI WHEN A FILE IS OPENED
  useEffect(() => {
    if (selectedSubmission && !analysis && !isAnalyzing) {
      runCopilot();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubmission]);

  // --- API FUNCTIONS ---

  const fetchSubmissions = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/submissions`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data);
      }
    } catch (e) {
      console.error("Failed to fetch submissions", e);
    }
  };

  const openSubmission = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/submissions/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedSubmission(data);
        setAnalysis(null); 
        setChatInput('');
        setActiveComment(null);
      }
    } catch (e) {
      console.error("Failed to fetch details", e);
    }
  };

  const runCopilot = async () => {
    if (!selectedSubmission) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${API_BASE}/api/reviewer/analyze/${selectedSubmission.session_id}`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        setAnalysis(data);
        setChatInput(data.client_email_draft);
      }
    } catch (e) {
      console.error("Copilot failed", e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const returnToClient = async () => {
    if (!selectedSubmission) return;
    
    const fallbackMessage = "The Tax Team has returned this AIF for further clarification.";
    const messageToSend = chatInput.trim() ? chatInput : fallbackMessage;

    try {
      await fetch(`${API_BASE}/api/reviewer/return/${selectedSubmission.session_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_body: messageToSend })
      });
      toast.success("Message sent to client! Returning to queue...");
      setSelectedSubmission(null);
      fetchSubmissions(); 
    } catch (e) {
      console.error("Failed to return submission", e);
    }
  };

  const approveAIF = async () => {
    if (!selectedSubmission) return;
    try {
      await fetch(`${API_BASE}/api/reviewer/approve/${selectedSubmission.session_id}`, { method: 'POST' });
      toast.success("AIF Approved! Audit log updated.");
      setSelectedSubmission(null);
      fetchSubmissions(); 
    } catch (e) {
      console.error("Failed to approve", e);
    }
  };

  const sendChatMessage = async () => {
    if (!selectedSubmission || !chatInput.trim()) return;
    
    const messageText = chatInput.trim();
    setChatInput(''); 
    
    // Optimistic UI update
    const optimisticMsg: HumanMessage = {
      sender: 'tax_team',
      message: messageText,
      timestamp: new Date().toISOString()
    };
    setHumanMessages(prev => [...prev, optimisticMsg]);

    try {
      await fetch(`${API_BASE}/api/chat/human/${selectedSubmission.session_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: 'tax_team', message: messageText })
      });
    } catch (e) {
      console.error("Failed to send chat", e);
    }
  };

  // --- EXPORT FUNCTIONS ---

  const downloadAuditAsWord = () => {
    if (!selectedSubmission?.audit_summary?.detailed_log) return;
    
    const projectName = selectedSubmission.aif_state.project_narratives?.[0]?.project_name || 'Unnamed_Project';
    
    let htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Audit Log</title></head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #1e293b;">RDEC Interview Audit Log: ${projectName}</h2>
        <p style="color: #64748b; font-size: 12px;">
          <strong>Session ID:</strong> ${selectedSubmission.session_id}<br/>
          <strong>Exported:</strong> ${new Date().toLocaleString()}
        </p>
        <hr style="border: 1px solid #e2e8f0; margin-bottom: 20px;"/>
    `;

    selectedSubmission.audit_summary.detailed_log.forEach((entry: AuditLogEntry) => {
      htmlContent += `
        <div style="margin-bottom: 24px;">
          <p style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">${new Date(entry.timestamp).toLocaleString()}</p>
          <p style="margin-top: 0;"><strong>AI Question:</strong><br/>${entry.ai_question}</p>
          <p style="color: #1d4ed8;"><strong>Client Answer:</strong><br/>${entry.user_answer}</p>
          ${entry.extracted_fields && entry.extracted_fields.length > 0 
            ? `<p style="font-size: 11px; color: #059669; font-family: monospace;">[Extracted Fields: ${entry.extracted_fields.join(", ")}]</p>` 
            : ''}
        </div>
        <hr style="border: 1px dashed #e2e8f0;"/>
      `;
    });

    htmlContent += `</body></html>`;

    const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Audit_Log_${projectName.replace(/[^a-zA-Z0-9]/g, '_')}.doc`; 
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- SMART HIGHLIGHT COMPONENT ---
  const Highlight = ({ children, issueId, text }: { children: React.ReactNode, issueId: string, text: string }) => {
    const hasFlags = analysis && analysis.red_flags && analysis.red_flags.length > 0;
    if (!hasFlags) return <span className="font-semibold text-slate-900">{children}</span>;

    const isActive = activeComment === issueId;
    const isAnythingActive = activeComment !== null;

    return (
      <span className="relative inline-flex items-center">
        <span 
          onClick={(e) => {
            e.stopPropagation();
            setActiveComment(isActive ? null : issueId);
          }}
          className={`cursor-pointer transition-colors duration-200 rounded px-1.5 py-0.5 font-semibold text-slate-900
            ${isActive ? 'bg-amber-300 shadow-sm' : 'bg-amber-100 hover:bg-amber-200'} 
            ${!isAnythingActive ? 'animate-pulse' : ''}
          `}
          title="Click to view AI comment"
        >
          {children}
        </span>

        {isActive && (
          <div 
            className="absolute left-[calc(100%+16px)] top-1/2 -translate-y-1/2 w-[320px] bg-white border border-amber-200 shadow-2xl rounded-xl p-4 z-50 animate-in fade-in slide-in-from-left-2 cursor-default"
            onClick={(e) => e.stopPropagation()} 
          >
            <div className="absolute top-1/2 -translate-y-1/2 -left-2 w-4 h-4 bg-white border-l border-b border-amber-200 rotate-45"></div>
            
            <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-2">
              <div className="w-6 h-6 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center font-bold text-[10px]">AI</div>
              <span className="font-bold text-sm text-slate-800">Agent Review</span>
            </div>
            
            <p className="text-sm text-slate-700 leading-relaxed font-sans mb-4">
              {issueId === 'financials' 
                ? "AI Flag: Ensure these software costs strictly relate to R&D activities and are not general enterprise licenses. Verify against the narrative."
                : analysis.red_flags[0] || "AI Flag: This technical justification appears weak. Consider requesting more specific examples of experimental failure."
              }
            </p>
            
            <div className="flex justify-end">
              <button 
                onClick={(e) => { e.stopPropagation(); setActiveComment(null); }} 
                className="text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </span>
    );
  };

  return (
    <div className="h-screen w-full flex flex-col bg-slate-50 font-sans overflow-hidden">
      
      {/* --- DARK LOADING OVERLAY --- */}
      {isAnalyzing && (
        <div className="fixed inset-0 z-100 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-200">
          <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center">
            <svg className="animate-spin h-12 w-12 text-blue-600 mb-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Agent is Auditing</h2>
            <p className="text-slate-500 text-sm">Cross-referencing technical narratives and financials...</p>
          </div>
        </div>
      )}

      {/* HEADER */}
      {!selectedSubmission && (
        <header className="flex-none h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 shadow-md z-10 text-white">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            </Link>
            <div className="h-6 w-px bg-slate-700"></div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-500/20 text-emerald-400 rounded flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              </div>
              <h1 className="font-semibold text-white tracking-wide">Reviewer Hub</h1>
            </div>
          </div>
        </header>
      )}

      <div className="flex-1 flex overflow-hidden">
        
        {!selectedSubmission ? (
          /* --- THE QUEUE VIEW --- */
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-5xl mx-auto">
              <div className="flex justify-between items-end mb-8">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 mb-2">AIF Triage Queue</h2>
                  <p className="text-slate-500">Review and audit client submissions before generating official HMRC documents.</p>
                </div>
                <button onClick={fetchSubmissions} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg shadow-sm hover:bg-slate-50 text-sm font-semibold flex items-center gap-2 transition-colors">
                  Refresh Queue
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                      <th className="p-4">Project Name</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-center">AI Compliance Score</th>
                      <th className="p-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {submissions.length === 0 ? (
                      <tr><td colSpan={4} className="p-8 text-center text-slate-400 italic">No submissions pending review.</td></tr>
                    ) : (
                      submissions.map((sub, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4 font-semibold text-slate-800">{sub.project_name}</td>
                          <td className="p-4">
                            <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${sub.status === 'Needs Review' ? 'bg-amber-100 text-amber-700' : sub.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                              {sub.status}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`text-lg font-black ${sub.compliance_score < 90 ? 'text-red-500' : 'text-emerald-500'}`}>
                              {sub.compliance_score}%
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <button onClick={() => openSubmission(sub.id)} className={`px-4 py-2 text-sm font-semibold rounded transition shadow-sm ${sub.status === 'Approved' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                              {sub.status === 'Approved' ? 'View Approved' : (sub.has_been_audited ? 'Continue Auditing' : 'Start Audit')}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          /* --- THE WORKBENCH VIEW --- */
          <div className="flex-1 flex w-full h-full overflow-hidden">
            
            {/* LEFT COLUMN: Teams-style Chat Sidebar */}
            <div className="w-112.5 flex-none bg-slate-50 border-r border-slate-200 flex flex-col shadow-xl z-10 h-full">
              
              {/* Header */}
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white shadow-sm z-10 gap-4">
                
                {/* LEFT SIDE: Action Buttons Grouped Together */}
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setSelectedSubmission(null)} 
                    className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded hover:bg-slate-200 text-xs font-bold flex items-center gap-1 transition-colors shrink-0"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                    Queue
                  </button>

                  <button 
                    onClick={() => setShowAuditModal(true)}
                    className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded hover:bg-slate-50 text-xs font-bold shadow-sm flex items-center gap-1.5 transition-colors shrink-0"
                    title="View Full AI Audit Log"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    Audit Log
                  </button>
                </div>

                {/* RIGHT SIDE: Title */}
                <div className="text-right overflow-hidden">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reviewing</p>
                  <p className="text-sm font-bold text-slate-800 truncate max-w-37.5" title={selectedSubmission.aif_state.project_narratives?.[0]?.project_name}>
                    {selectedSubmission.aif_state.project_narratives?.[0]?.project_name || 'Unnamed Project'}
                  </p>
                </div>
              </div>

              {/* Chat History Area */}
              <div className="flex-1 overflow-y-auto p-6 bg-slate-50 flex flex-col space-y-4">
                <div className="flex justify-center mb-2">
                  <div className="bg-white border border-slate-200 rounded-full px-4 py-1.5 text-xs font-bold text-slate-500 shadow-sm flex gap-4">
                    <span>Completeness: <span className="text-emerald-600">{selectedSubmission.audit_summary.completeness_score}%</span></span>
                    <span>Compliance: <span className="text-amber-600">{selectedSubmission.audit_summary.compliance_score}%</span></span>
                  </div>
                </div>

                {/* MAPPED HUMAN CHAT MESSAGES */}
                {humanMessages.length === 0 ? (
                  <div className="text-center text-sm text-slate-400 italic my-auto">
                    No messages yet. Send a chat to the client below.
                  </div>
                ) : (
                  humanMessages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.sender === 'tax_team' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl p-3.5 shadow-sm text-[13px] leading-relaxed whitespace-pre-wrap ${
                        msg.sender === 'tax_team' 
                          ? 'bg-blue-600 text-white rounded-br-none' 
                          : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none'
                      }`}>
                        <div className={`text-[10px] font-bold mb-1 uppercase tracking-wider ${msg.sender === 'tax_team' ? 'text-blue-200' : 'text-slate-400'}`}>
                          {msg.sender === 'tax_team' ? 'You (Tax Team)' : 'Client'}
                        </div>
                        {msg.message}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Compose Box */}
              <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                <div className="border border-slate-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow bg-white flex flex-col">
                  
                  <textarea 
                    className="w-full h-32 p-4 text-[13px] text-slate-800 bg-white focus:outline-none resize-none custom-scrollbar leading-relaxed"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type a message to the client..."
                  />
                  
                  <div className="flex justify-between items-center p-3 border-t border-slate-100 bg-slate-50">
                     
                     {/* LEFT SIDE: Formal Document Actions */}
                     <div className="flex gap-2">
                       <button 
                          onClick={approveAIF}
                          className="text-xs font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded transition-colors flex items-center gap-1"
                          title="Formally approve this AIF"
                       >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          Approve
                       </button>
                       <button 
                          onClick={returnToClient}
                          className="text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded transition-colors flex items-center gap-1"
                          title="Return document to client's queue"
                       >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5"></path><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"></path></svg>
                          Return AIF
                       </button>
                     </div>
                     
                    {/* RIGHT SIDE: Send Chat Button */}
                    <button 
                      onClick={sendChatMessage}
                      disabled={!chatInput.trim()}
                      className="px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm disabled:opacity-50 text-xs font-bold flex items-center gap-2"
                    >
                      Send Chat
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: The Physical Document Viewer */}
            <div 
              className="flex-1 bg-[#E2E8F0] overflow-y-auto p-12 custom-scrollbar relative flex justify-center"
              onClick={() => setActiveComment(null)} 
            >
              <div className="w-198.5 min-w-198.5 flex-none relative" style={{ marginRight: activeComment ? '350px' : '0', transition: 'margin 0.3s ease-in-out' }}>
                <div className="flex flex-col gap-12">
                  
                  {/* PROJECT SUBMISSION DOCUMENT */}
                  <div className="w-full min-h-280.75 bg-white shadow-xl p-16 relative flex flex-col">
                    <div className="flex justify-between items-start mb-10 border-b-2 border-slate-800 pb-4">
                      <div>
                         <h1 className="text-2xl font-bold uppercase tracking-wide font-serif text-black">RDEC Project Contribution</h1>
                         <p className="text-sm font-serif text-slate-500 mt-1">Internal Tax Team Submission</p>
                      </div>
                      <span className="text-xs text-slate-500 font-sans uppercase">Confidential</span>
                    </div>

                    {/* Section 1: Project Overview */}
                    <div className="mb-10 font-serif">
                      <h2 className="text-lg font-bold bg-slate-100 p-2 mb-6 border-l-4 border-slate-800 font-sans text-slate-900">1. Project Overview</h2>
                      <div className="grid grid-cols-2 gap-y-6 gap-x-8 px-2">
                        <div className="col-span-2">
                           <span className="font-bold text-slate-500 text-[10px] uppercase block mb-1">Project Name</span> 
                           <span className="text-[16px] text-slate-900 font-bold">{selectedSubmission.aif_state.project_narratives?.[0]?.project_name || 'Unnamed Project'}</span>
                        </div>
                        <div className="col-span-2">
                           <span className="font-bold text-slate-500 text-[10px] uppercase block mb-1">Lead Competent Professional</span> 
                           <span className="text-[15px] text-slate-900 font-semibold leading-relaxed">{selectedSubmission.aif_state.company_details?.competent_professional_details || 'Not provided'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Project Financials */}
                    <div className="mb-10 font-serif">
                      <h2 className="text-lg font-bold bg-slate-100 p-2 mb-6 border-l-4 border-slate-800 font-sans text-slate-900">2. Project Financials</h2>
                      <div className="px-2">
                          <table className="w-2/3 text-left text-[15px] border-collapse">
                            <tbody className="divide-y divide-slate-200">
                              <tr><td className="py-3 text-slate-700">Staff Costs</td><td className="py-3 text-right font-semibold text-slate-900">£{selectedSubmission.aif_state.financials?.staff_costs || '0'}</td></tr>
                              <tr><td className="py-3 text-slate-700">Subcontractors</td><td className="py-3 text-right font-semibold text-slate-900">£{selectedSubmission.aif_state.financials?.subcontractor_costs || '0'}</td></tr>
                              <tr>
                                <td className="py-3 text-slate-700">Software</td>
                                <td className="py-3 text-right">
                                   <Highlight issueId="financials" text="Software Costs">
                                     £{selectedSubmission.aif_state.financials?.software || '0'}
                                   </Highlight>
                                </td>
                              </tr>
                              <tr><td className="py-3 text-slate-700">Cloud Computing</td><td className="py-3 text-right font-semibold text-slate-900">£{selectedSubmission.aif_state.financials?.cloud || '0'}</td></tr>
                            </tbody>
                          </table>
                      </div>
                    </div>

                    {/* Section 3: Technical Narrative */}
                    <div className="mb-10 font-serif flex-1">
                      <h2 className="text-lg font-bold bg-slate-100 p-2 mb-6 border-l-4 border-slate-800 font-sans text-slate-900">3. Technical Narrative</h2>
                      
                      {(() => {
                        const proj = selectedSubmission.aif_state.project_narratives?.[0] || {};
                        return (
                          <div className="space-y-8 text-[15px] leading-relaxed text-slate-800 px-2">
                            <div>
                              <p className="font-bold text-slate-500 text-[10px] uppercase font-sans mb-1">A. Advance Sought</p>
                              <p>{proj.advance_sought || 'Not provided'}</p>
                            </div>
                            <div>
                              <p className="font-bold text-slate-500 text-[10px] uppercase font-sans mb-1">B. Scientific Uncertainties & Professional Baseline</p>
                              <p>
                                <Highlight issueId="narrative" text="Scientific Uncertainties">
                                  {proj.scientific_uncertainties || 'Not provided'}
                                </Highlight>
                              </p>
                            </div>
                            <div>
                              <p className="font-bold text-slate-500 text-[10px] uppercase font-sans mb-1">C. Activities & Outcomes (Including Failures)</p>
                              <p>
                                <Highlight issueId="activities" text="Activities & Outcomes">
                                  {proj.outcomes || 'Not provided'}
                                </Highlight>
                              </p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Section 4: Compliance Flags */}
                    <div className="font-serif mt-auto pt-8 border-t border-slate-200">
                      <h2 className="text-lg font-bold bg-slate-100 p-2 mb-6 border-l-4 border-slate-800 font-sans text-slate-900">4. Project Compliance Flags</h2>
                      <div className="grid grid-cols-2 gap-4 px-2">
                         <div className="flex justify-between border-b border-slate-100 pb-2">
                           <span className="text-sm text-slate-700">Overseas R&D?</span>
                           <span className="font-semibold text-slate-900 text-sm">{selectedSubmission.aif_state.compliance?.overseas_rnd ? 'Yes' : 'No'}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-2">
                           <span className="text-sm text-slate-700">AI / Machine Learning Used?</span>
                           <span className="font-semibold text-slate-900 text-sm">{selectedSubmission.aif_state.compliance?.ai_used ? 'Yes' : 'No'}</span>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- AUDIT LOG MODAL --- */}
      {showAuditModal && selectedSubmission && (
        <div className="fixed inset-0 z-100 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-6 bg-white border-b border-slate-200 flex justify-between items-center z-10">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Document Creation Audit Log</h2>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Raw audit log for {selectedSubmission.aif_state.project_narratives?.[0]?.project_name || 'Unnamed Project'}
                </p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={downloadAuditAsWord}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 shadow-sm flex items-center gap-2 transition"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  Export to Word
                </button>
                <button 
                  onClick={() => setShowAuditModal(false)}
                  className="px-4 py-2 bg-white border border-slate-300 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-100 transition"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Modal Body: Formatted Q&A */}
            <div className="p-8 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
              {selectedSubmission.audit_summary?.detailed_log?.map((log: AuditLogEntry, i: number) => (
                <div key={i} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
                  <div className="absolute top-4 right-6 text-xs font-semibold text-slate-400">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  
                  <div className="mb-4 pr-16">
                    <span className="text-xs font-black uppercase text-slate-400 block mb-1 tracking-wider">AI Interviewer</span>
                    <p className="text-slate-800 text-[15px] leading-relaxed">{log.ai_question}</p>
                  </div>
                  
                  <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 mb-3">
                    <span className="text-xs font-black uppercase text-blue-600 block mb-1 tracking-wider">Client Response</span>
                    <p className="text-blue-900 text-[15px] leading-relaxed">{log.user_answer}</p>
                  </div>
                  
                  {log.extracted_fields && log.extracted_fields.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                      <svg className="text-emerald-500" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                      <span className="text-[11px] font-mono font-bold text-emerald-600 uppercase">
                        Fields Extracted: {log.extracted_fields.join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
          </div>
        </div>
      )}

    </div>
  );
}