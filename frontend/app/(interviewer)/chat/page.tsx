'use client';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

// 1. USE THE ENVIRONMENT VARIABLE FOR THE API BASE URL
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDraft = searchParams.get('draft') === 'true';
  const savedSessionId = searchParams.get('session_id');

  const [sessionId] = useState(savedSessionId || `session_${Math.random().toString(36).substr(2, 9)}`);
  
  // AI Interview States
  const [messages, setMessages] = useState<{role: string, content: string}[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  
  // Human Chat States (NEW)
  const [humanMessages, setHumanMessages] = useState<any[]>([]);
  const [humanInput, setHumanInput] = useState('');
  const [activeTab, setActiveTab] = useState<'ai' | 'human'>('ai');
  const humanMessagesEndRef = useRef<HTMLDivElement>(null);

  // Audit Log & Submit States
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [auditSummary, setAuditSummary] = useState<any>(null);
  const [showDetailedLog, setShowDetailedLog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const [aifState, setAifState] = useState<any>({
    company_details: {},
    project_summary: {},
    financials: {},
    project_narratives: [],
    compliance: {}
  });

  // Scroll handlers
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    humanMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [humanMessages]);

  // INITIALIZATION: Load Draft, Scratch, or Saved Session
  useEffect(() => {
    if (initialized.current) return;

    if (savedSessionId) {
      initialized.current = true;
      fetch(`${API_BASE}/api/chat/load/${savedSessionId}`)
        .then(res => res.json())
        .then(data => {
          setAifState(data.aif_state);
          setMessages(data.messages);
          setAuditLog(data.audit_log);
        })
        .catch(err => console.error("Failed to load session", err));
      return;
    }

    const savedDraft = sessionStorage.getItem('draft_aif_state');
    const draftSummary = sessionStorage.getItem('draft_summary') || "Draft parsed successfully.";
    const isDraftComplete = sessionStorage.getItem('draft_is_complete') === 'true';

    if (isDraft && savedDraft) {
      initialized.current = true;
      try {
        const parsedDraft = JSON.parse(savedDraft);
        setAifState(parsedDraft); 

        const populatedSections = Object.keys(parsedDraft).filter(key => {
          const section = parsedDraft[key];
          if (Array.isArray(section)) return section.length > 0;
          if (typeof section === 'object' && section !== null) return Object.keys(section).length > 0;
          return false;
        });

        setAuditLog([{
          timestamp: new Date().toISOString(),
          ai_question: `Draft Analysis: ${draftSummary}`,
          user_answer: "User uploaded an existing draft document.",
          extracted_fields: populatedSections
        }]);
        
        if (isDraftComplete) {
          setMessages([
            { role: 'assistant', content: 'I have reviewed your uploaded document, and it is incredibly thorough! I have all the required HMRC information. Simply type "Generate" to finalize your AIF and view your Audit Log.' }
          ]);
        } else {
          setMessages([
            { role: 'assistant', content: 'I have reviewed your uploaded draft! I extracted most of the data to the right, but we still need a few details to be fully compliant. What were the specific scientific uncertainties for your first project?' }
          ]);
        }
      } catch (e) {
        console.error("Failed to parse draft state from storage", e);
      }
    } else if (!isDraft) {
      initialized.current = true;
      setMessages([
        { role: 'assistant', content: 'Hello! I am here to help you document your R&D project for the central Tax Team. To get started, what is the name of the project you are submitting?' }
      ]);
      setAuditLog([{
        timestamp: new Date().toISOString(),
        ai_question: "System Initialized",
        user_answer: "User elected to start a new AIF interview from scratch.",
        extracted_fields: [] as string[]
      }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDraft, savedSessionId]);

  // POLLING: Check for new Tax Team Messages every 3 seconds
  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(() => {
      fetch(`${API_BASE}/api/chat/human/${sessionId}`)
        .then(res => res.json())
        .then(data => {
          // If we have new messages, update state and optionally switch tabs
          if (data.length > humanMessages.length) {
            setHumanMessages(data);
          }
        })
        .catch(err => console.error("Polling error", err));
    }, 3000);
    return () => clearInterval(interval);
  }, [sessionId, humanMessages.length]);

  // --- ACTIONS ---

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    const lastAiQuestion = messages.length > 0 ? messages[messages.length - 1].content : "Initial Question";
    
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/chat/interviewer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          session_id: sessionId,
          current_aif_state: aifState
        })
      });

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
      
      if (data.turn_log) {
        const correctedLog = { ...data.turn_log, ai_question: lastAiQuestion };
        setAuditLog(prev => [...prev, correctedLog]);
      }

      if (data.is_complete && data.audit_summary) {
        setAuditSummary({
           ...data.audit_summary,
           detailed_log: [...auditLog, { ...data.turn_log, ai_question: lastAiQuestion }]
        });
      }

      if (data.aif_updates && Object.keys(data.aif_updates).length > 0) {
        setAifState((prevState: any) => {
          const newState = { ...prevState };
          for (const key in data.aif_updates) {
            if (typeof data.aif_updates[key] === 'object' && !Array.isArray(data.aif_updates[key])) {
              newState[key] = { ...newState[key], ...data.aif_updates[key] };
            } else {
              newState[key] = data.aif_updates[key];
            }
          }
          return newState;
        });
      }
    } catch (error) {
      console.error("Error:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I am having trouble connecting to the server." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const sendHumanMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!humanInput.trim()) return;

    const messageText = humanInput.trim();
    setHumanInput('');
    
    // Optimistic UI update
    setHumanMessages(prev => [...prev, { sender: 'client', message: messageText, timestamp: new Date().toISOString() }]);

    try {
      await fetch(`${API_BASE}/api/chat/human/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: 'client', message: messageText })
      });
    } catch (error) {
      console.error("Error sending message to tax team:", error);
    }
  };

  const saveAndExit = async () => {
    try {
      await fetch(`${API_BASE}/api/chat/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          aif_state: aifState,
          messages: messages,
          audit_log: auditLog
        })
      });
      router.push('/setup');
    } catch (error) {
      console.error("Failed to save session", error);
      toast.error("Failed to save. Please check your connection.");
    }
  };

  const submitToTaxTeam = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/api/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          aif_state: aifState,
          audit_summary: auditSummary
        })
      });

      if (response.ok) {
        setIsSubmitted(true);
        sessionStorage.removeItem('draft_aif_state');
        sessionStorage.removeItem('draft_is_complete');
        sessionStorage.removeItem('draft_summary');
      }
    } catch (error) {
      console.error("Submission failed", error);
      toast.error("Failed to send to Tax Team.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
      
      {/* --- TOP NAVIGATION BAR --- */}
      <header className="flex-none h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm z-10">
        <div className="flex items-center gap-4">
          <Link 
            href="/setup" 
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Back to Setup"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          </Link>
          <div className="h-6 w-px bg-slate-200"></div>
          <div>
            <h1 className="font-semibold text-slate-800 leading-tight">AIF Interview Session</h1>
            <p className="text-xs text-slate-500">
              {aifState.company_details?.company_name ? `Drafting for ${aifState.company_details.company_name}` : 'New Company Draft'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isDraft && <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-medium">Draft Loaded</span>}
          
          <button 
            onClick={saveAndExit}
            className="text-xs font-bold text-slate-500 hover:text-blue-600 bg-white border border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-full shadow-sm transition-all"
          >
            Save & Exit
          </button>

          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Agent Active
          </div>
        </div>
      </header>

      {/* --- MAIN WORKSPACE --- */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT COLUMN: Chat & Controls */}
        <div className="w-1/2 flex flex-col bg-slate-50 border-r border-slate-200 relative">
          
          {/* TABS (Only show if we are still chatting / not on the completion screen) */}
          {!auditSummary && (
            <div className="flex bg-white border-b border-slate-200 p-2 gap-2 shadow-sm z-10">
              <button 
                onClick={() => setActiveTab('ai')}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${activeTab === 'ai' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                AI Interviewer
              </button>
              <button 
                onClick={() => setActiveTab('human')}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors relative flex justify-center items-center gap-2 ${activeTab === 'human' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                Tax Team Messages
                {humanMessages.length > 0 && activeTab !== 'human' && (
                  <span className="flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                  </span>
                )}
              </button>
            </div>
          )}

          {/* VIEW RENDERER */}
          {auditSummary && activeTab === 'ai' ? (
            /* --- COMPLETION SUMMARY DASHBOARD --- */
            <div className="flex-1 flex flex-col p-8 overflow-y-auto animate-in fade-in">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <h2 className="text-3xl font-bold text-slate-800 mb-2">Interview Complete</h2>
                <p className="text-slate-600">{auditSummary.summary_text}</p>
              </div>

              <div className="flex gap-4 mb-8">
                <div className="flex-1 bg-white border border-slate-200 p-6 rounded-xl shadow-sm text-center">
                  <p className="text-sm font-bold uppercase text-slate-500 mb-2">Completeness</p>
                  <div className={`text-4xl font-black ${auditSummary.completeness_score > 80 ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {auditSummary.completeness_score}%
                  </div>
                </div>
                <div className="flex-1 bg-white border border-slate-200 p-6 rounded-xl shadow-sm text-center">
                  <p className="text-sm font-bold uppercase text-slate-500 mb-2">Compliance Rating</p>
                  <div className={`text-4xl font-black ${auditSummary.compliance_score > 80 ? 'text-blue-500' : 'text-amber-500'}`}>
                    {auditSummary.compliance_score}%
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <button 
                  onClick={() => setShowDetailedLog(!showDetailedLog)}
                  className="w-full py-3 bg-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-300 transition"
                >
                  {showDetailedLog ? "Hide Detailed Audit Log" : "View Detailed Audit Log"}
                </button>
                
                <button 
                  onClick={submitToTaxTeam}
                  disabled={isSubmitting || isSubmitted}
                  className={`w-full py-4 font-bold rounded-xl shadow-md transition flex justify-center items-center gap-2 ${
                    isSubmitted 
                      ? 'bg-emerald-500 text-white' 
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {isSubmitting ? "Sending..." : isSubmitted ? "Successfully Submitted!" : "Send to Tax Team"}
                  {!isSubmitting && !isSubmitted && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                  )}
                  {isSubmitted && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  )}
                </button>
              </div>

              {showDetailedLog && (
                <div className="mt-6 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-4 border-b pb-2">Full Audit Trail</h3>
                  {auditSummary.detailed_log.map((entry: any, i: number) => (
                    <div key={i} className="mb-4 text-sm border-l-2 border-blue-200 pl-3">
                      <p className="text-xs text-slate-400 mb-1">
                        {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : 'Unknown Time'}
                      </p>
                      <p className="font-semibold text-slate-700">AI: {entry.ai_question}</p>
                      <p className="text-slate-600 mb-1">User: {entry.user_answer}</p>
                      {entry.extracted_fields && entry.extracted_fields.length > 0 && (
                        <p className="text-xs font-mono text-emerald-600 bg-emerald-50 inline-block px-1 rounded mt-1">
                          Extracted: {entry.extracted_fields.join(", ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'ai' ? (
            /* --- AI CHAT VIEW --- */
            <>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {m.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-3 shrink-0 mt-1 shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"></path><rect x="4" y="8" width="16" height="12" rx="2"></rect><path d="M2 14h2"></path><path d="M20 14h2"></path><path d="M15 13v2"></path><path d="M9 13v2"></path></svg>
                      </div>
                    )}
                    <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm text-[15px] leading-relaxed ${
                      m.role === 'user' 
                        ? 'bg-blue-600 text-white rounded-tr-none' 
                        : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                    }`}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-3 shrink-0 shadow-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"></path><rect x="4" y="8" width="16" height="12" rx="2"></rect></svg>
                    </div>
                    <div className="bg-white border border-slate-200 text-slate-500 rounded-2xl rounded-tl-none p-4 shadow-sm flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"></span>
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"></span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                <form onSubmit={sendMessage} className="relative flex items-center">
                  <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Message the AI Interviewer..."
                    className="w-full pl-4 pr-24 py-3.5 bg-slate-100 border-transparent focus:bg-white rounded-xl border focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-slate-800"
                    disabled={isLoading}
                  />
                  <div className="absolute right-2 flex items-center gap-1">
                    <button type="submit" disabled={isLoading || !input.trim()} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-all shadow-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            /* --- HUMAN CHAT VIEW (TAX TEAM) --- */
            <>
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50">
                {humanMessages.length === 0 ? (
                  <div className="text-center text-sm text-slate-400 italic mt-20">
                    No messages from the Tax Team yet.
                  </div>
                ) : (
                  humanMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.sender === 'client' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl p-3.5 shadow-sm text-[13px] leading-relaxed whitespace-pre-wrap ${
                        msg.sender === 'client' 
                          ? 'bg-emerald-600 text-white rounded-br-none' 
                          : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                      }`}>
                         <div className={`text-[10px] font-bold mb-1 uppercase tracking-wider ${msg.sender === 'client' ? 'text-emerald-200' : 'text-slate-400'}`}>
                          {msg.sender === 'client' ? 'You' : 'Tax Team'}
                        </div>
                        {msg.message}
                      </div>
                    </div>
                  ))
                )}
                <div ref={humanMessagesEndRef} />
              </div>

              <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                <form onSubmit={sendHumanMessage} className="relative flex items-center">
                  <input
                    type="text"
                    value={humanInput}
                    onChange={e => setHumanInput(e.target.value)}
                    placeholder="Reply to the Tax Team..."
                    className="w-full pl-4 pr-16 py-3.5 bg-slate-100 border-transparent focus:bg-white rounded-xl border focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all text-slate-800"
                  />
                  <div className="absolute right-2 flex items-center gap-1">
                    <button type="submit" disabled={!humanInput.trim()} className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600 transition-all shadow-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}

        </div>

        {/* RIGHT COLUMN: Live Document Viewer */}
        <div className="w-1/2 flex flex-col bg-slate-200 overflow-y-auto items-center p-8 custom-scrollbar relative">
          {/* PROJECT SUBMISSION DOCUMENT */}
          <div className="w-198.5 min-h-280.75 bg-white shadow-2xl p-16 relative flex flex-col transform origin-top scale-[0.85] 2xl:scale-100">
            <div className="absolute top-0 left-0 w-full h-2 bg-linear-to-r from-blue-600 to-emerald-500"></div>

            <div className="flex justify-between items-start mb-10 border-b-2 border-slate-800 pb-4 mt-4">
              <div>
                 <h1 className="text-2xl font-bold uppercase tracking-wide font-serif text-black">RDEC Project Contribution</h1>
                 <p className="text-sm font-serif text-slate-500 mt-1">Internal Tax Team Submission</p>
              </div>
              <span className="text-xs text-slate-500 font-sans uppercase bg-slate-100 px-2 py-1 rounded border border-slate-200">Live Draft</span>
            </div>

            {/* Section 1: Project Overview */}
            <div className="mb-10 font-serif">
              <h2 className="text-lg font-bold bg-slate-50 p-2 mb-6 border-l-4 border-blue-600 font-sans text-slate-900">1. Project Overview</h2>
              <div className="grid grid-cols-2 gap-y-6 gap-x-8 px-2">
                <div className="col-span-2">
                   <span className="font-bold text-slate-500 text-[10px] uppercase block mb-1">Project Name</span> 
                   <span className="text-[16px] text-blue-800 font-bold border-b border-dotted border-slate-400 block pb-1 min-h-6">
                     {aifState?.project_narratives?.[0]?.project_name}
                   </span>
                </div>
                <div className="col-span-2">
                   <span className="font-bold text-slate-500 text-[10px] uppercase block mb-1">Lead Competent Professional</span> 
                   <span className="text-[15px] text-blue-800 font-semibold leading-relaxed border-b border-dotted border-slate-400 block pb-1 min-h-6">
                     {aifState?.company_details?.competent_professional_details}
                   </span>
                </div>
              </div>
            </div>

            {/* Section 2: Project Financials */}
            <div className="mb-10 font-serif">
              <h2 className="text-lg font-bold bg-slate-50 p-2 mb-6 border-l-4 border-blue-600 font-sans text-slate-900">2. Project Financials</h2>
              <div className="px-2">
                  <table className="w-2/3 text-left text-[15px] border-collapse">
                    <tbody className="divide-y divide-slate-200">
                      <tr><td className="py-3 text-slate-700">Staff Costs</td><td className="py-3 text-right font-semibold text-blue-800 border-b border-dotted border-transparent min-w-25">£{aifState?.financials?.staff_costs || '0'}</td></tr>
                      <tr><td className="py-3 text-slate-700">Subcontractors</td><td className="py-3 text-right font-semibold text-blue-800 border-b border-dotted border-transparent">£{aifState?.financials?.subcontractor_costs || '0'}</td></tr>
                      <tr><td className="py-3 text-slate-700">Software</td><td className="py-3 text-right font-semibold text-blue-800 border-b border-dotted border-transparent">£{aifState?.financials?.software || '0'}</td></tr>
                      <tr><td className="py-3 text-slate-700">Cloud Computing</td><td className="py-3 text-right font-semibold text-blue-800 border-b border-dotted border-transparent">£{aifState?.financials?.cloud || '0'}</td></tr>
                    </tbody>
                  </table>
              </div>
            </div>

            {/* Section 3: Technical Narrative */}
            <div className="mb-10 font-serif flex-1">
              <h2 className="text-lg font-bold bg-slate-50 p-2 mb-6 border-l-4 border-blue-600 font-sans text-slate-900">3. Technical Narrative</h2>
              
              {(() => {
                const proj = aifState?.project_narratives?.[0] || {};
                return (
                  <div className="space-y-8 text-[15px] leading-relaxed text-slate-800 px-2">
                    <div>
                      <p className="font-bold text-slate-500 text-[10px] uppercase font-sans mb-1">A. Advance Sought</p>
                      <p className="text-blue-800 bg-slate-50/50 p-3 rounded border border-slate-100 min-h-10">{proj.advance_sought}</p>
                    </div>
                    <div>
                      <p className="font-bold text-slate-500 text-[10px] uppercase font-sans mb-1">B. Scientific Uncertainties & Professional Baseline</p>
                      <p className="text-blue-800 bg-slate-50/50 p-3 rounded border border-slate-100 min-h-10">{proj.scientific_uncertainties}</p>
                    </div>
                    <div>
                      <p className="font-bold text-slate-500 text-[10px] uppercase font-sans mb-1">C. Activities & Outcomes (Including Failures)</p>
                      <p className="text-blue-800 bg-slate-50/50 p-3 rounded border border-slate-100 min-h-10">{proj.outcomes}</p>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Section 4: Compliance Flags */}
            <div className="font-serif mt-auto pt-8 border-t border-slate-200">
              <h2 className="text-lg font-bold bg-slate-50 p-2 mb-6 border-l-4 border-blue-600 font-sans text-slate-900">4. Project Compliance Flags</h2>
              <div className="grid grid-cols-2 gap-4 px-2">
                 <div className="flex justify-between border-b border-slate-100 pb-2">
                   <span className="text-sm text-slate-700">Overseas R&D?</span>
                   <span className="font-semibold text-blue-800 text-sm">{aifState?.compliance?.overseas_rnd ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                   <span className="text-sm text-slate-700">AI / Machine Learning Used?</span>
                   <span className="font-semibold text-blue-800 text-sm">{aifState?.compliance?.ai_used ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}