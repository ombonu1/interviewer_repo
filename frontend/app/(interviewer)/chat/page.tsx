'use client';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';

import LiveDocumentViewer from '@/components/LiveDocumentViewer';
import CompletionDashboard from '@/components/CompletionDashboard';
import ChatSidebar from '@/components/ChatSidebar';
import TaxTeamChatWidget from '@/components/TaxTeamChatWidget';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDraft = searchParams.get('draft') === 'true';
  const savedSessionId = searchParams.get('session_id');

  const [sessionId] = useState(savedSessionId || `session_${Math.random().toString(36).substr(2, 9)}`);
  
  const [messages, setMessages] = useState<{role: string, content: string}[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const isReturned = searchParams.get('returned') === 'true';
  
  const [auditSummary, setAuditSummary] = useState<any>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  const [aifState, setAifState] = useState<any>({ 
    project_narratives: [{}], 
    compliance: {}, 
    status: 'Draft',
    _meta: { manual_edits: [], attempts: {} } 
  });

  // --- 1. INITIALIZATION & FAST-TRACKING ---
  useEffect(() => {
    if (initialized.current) return;

    if (savedSessionId) {
      initialized.current = true;
      fetch(`${API_BASE}/api/chat/load/${savedSessionId}`)
        .then(res => res.json())
        .then(data => {
          const loadedState = data.aif_state;
          if (data.status) loadedState.status = data.status; 
          
          setAifState(loadedState);
          setMessages(data.messages || []);
          setAuditLog(data.audit_log || []);
          
          
          if (data.audit_summary && data.audit_summary.compliance_score !== undefined) {
            setAuditSummary(data.audit_summary);
          }
          
          if (data.status === "Returned") {
            toast.error(`Returned for Edits: ${loadedState._meta?.tax_feedback || "Review required."}`, { duration: 6000 });
          }
        })
        .catch(err => toast.error("Failed to load session"));
      return;
    }

    if (isDraft) {
      initialized.current = true;
      const savedDraft = sessionStorage.getItem('draft_aif_state');
      const draftSummary = sessionStorage.getItem('draft_summary') || "Draft parsed.";
      const isDraftComplete = sessionStorage.getItem('draft_is_complete') === 'true';

      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        setAifState(parsed);
        setMessages([{ 
          role: 'assistant', 
          content: isDraftComplete 
            ? 'I’ve reviewed your document and it looks excellent! Ready to finalize?' 
            : `I've started your draft based on the upload: ${draftSummary}. Let's dive into the technical specifics.` 
        }]);
      }
    } else {
      initialized.current = true;
      setMessages([{ role: 'assistant', content: 'Hello! I am your R&D Interviewer. What is the name of the project we are documenting today?' }]);
    }
  }, [isDraft, savedSessionId]);
  
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = ''; // Required for Chrome
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // --- 2. SMART MERGE LOGIC ---
  const updateAifStateFromAI = (updates: any, fullStateFromBackend: any) => {
    setHasUnsavedChanges(true);
    setAifState((prev: any) => {
      const next = JSON.parse(JSON.stringify(prev));
      
      for (const key in updates) {
        if (key === 'project_narratives' && Array.isArray(updates[key])) {
          next.project_narratives[0] = { ...next.project_narratives[0], ...updates.project_narratives[0] };
        } else if (typeof updates[key] === 'object' && updates[key] !== null) {
          next[key] = { ...next[key], ...updates[key] };
        } else {
          next[key] = updates[key];
        }
      }

      if (fullStateFromBackend?._meta) {
        next._meta = fullStateFromBackend._meta;
      }
      return next;
    });
  };

  // --- 3. ACTIONS ---
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat/interviewer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          session_id: sessionId,
          current_aif_state: aifState
        })
      });

      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
      
      if (data.full_updated_state) {
        updateAifStateFromAI(data.aif_updates, data.full_updated_state);
      }

      if (data.is_complete && data.audit_summary) {
        setAuditSummary(data.audit_summary);
      }
    } catch (err) {
      toast.error("Connection lost.");
    } finally {
      setIsLoading(false);
    }
  };

  // 💾 SAVE DRAFT FUNCTION
  const saveProgress = async () => {
    if (isSubmitted || aifState.status === 'In Review') {
      toast.error("Cannot save. This file has already been submitted.");
      return;
    }
    
    try {
      const res = await fetch(`${API_BASE}/api/chat/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, aif_state: aifState, status: 'Draft',messages: messages })
      });
      
      // 2. The JavaScript "Fetch" Fix
      if (!res.ok) {
        throw new Error(`Server responded with a ${res.status} error.`);
      }

      setHasUnsavedChanges(false);
      toast.success("Draft saved to directory.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save draft.");
    }
  };

  const submitToTaxTeam = async () => {
    const narrative = aifState.project_narratives?.[0] || {};
    const weakFields = Object.values(narrative).some(v => typeof v === 'string' && v.includes('[WEAK_DRAFT]'));

    if (weakFields) {
      const proceed = window.confirm("Warning: Some sections are still marked as 'Weak'. Submit anyway?");
      if (!proceed) return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          session_id: sessionId, 
          aif_state: aifState, 
          audit_summary: auditSummary || {} 
        })
      });
      if (res.ok) {
        setIsSubmitted(true);
        setHasUnsavedChanges(false);
        setAifState((prev: any) => ({ ...prev, status: 'In Review' }));
      }
    } catch (err) {
      toast.error("Submission failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadDraftAsWord = () => {
    const documentHTML = document.getElementById('document-preview')?.innerHTML;
    if (!documentHTML) {
      toast.error("Could not find the document to download.");
      return;
    }
    
    const projectName = aifState?.project_narratives?.[0]?.project_name || 'Project_Draft';
    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>${projectName}</title></head>
      <body>${documentHTML}</body>
      </html>
    `;
    
    const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectName.replace(/\s+/g, '_')}_AIF_Draft.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const manualUpdate = (field: string, value: any) => {
    setHasUnsavedChanges(true);
    const next = JSON.parse(JSON.stringify(aifState));
    if (!next.project_narratives[0]) next.project_narratives[0] = {};
    next.project_narratives[0][field] = value;
    
    if (!next._meta.manual_edits) next._meta.manual_edits = [];
    next._meta.manual_edits.push({ field, timestamp: new Date().toISOString() });
    
    setAifState(next);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden relative">
      
      {/* --- RENDER TAX TEAM SIDEBAR ONLY IF RETURNED --- */}
      {isReturned && <TaxTeamChatWidget sessionId={sessionId} />}

      <header className="flex-none h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm z-10">
        <div className="flex items-center gap-4">
          {/* INTERCEPTED NAVIGATION BUTTON */}
          <button 
            onClick={(e) => {
              e.preventDefault();
              if (hasUnsavedChanges) {
                setPendingPath('/setup');
                setShowExitWarning(true);
              } else {
                router.push('/setup');
              }
            }}
            className="p-2 text-slate-400 hover:text-blue-600 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          </button>
          <div>
            <h1 className="font-semibold text-slate-800 leading-tight">Technical Interview</h1>
            <p className="text-xs text-slate-500">{aifState.status === 'Returned' ? '⚠️ Fixing Returned Claim' : 'Active Drafting'}</p>
          </div>
        </div>
        <button 
          onClick={saveProgress} 
          disabled={isSubmitted || aifState.status === 'In Review'}
          className="text-xs font-bold text-slate-500 border px-3 py-1.5 rounded-full hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          Save Progress
        </button>
      </header>

      {/* --- CUSTOM EXIT WARNING MODAL --- */}
      {showExitWarning && (
        <div className="fixed inset-0 z-200 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="p-6 bg-amber-50 border-b border-amber-100 flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Unsaved Changes</h3>
                <p className="text-sm text-slate-600 mt-1">You have unsaved edits in your technical draft.</p>
              </div>
            </div>
            
            <div className="p-6 bg-slate-50 flex flex-col gap-3">
              <button 
                onClick={async () => {
                  await saveProgress(); // Save the progress
                  setShowExitWarning(false);
                  if (pendingPath) router.push(pendingPath); // Then navigate
                }}
                className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-sm"
              >
                Save & Exit
              </button>
              
              <button 
                onClick={() => {
                  setShowExitWarning(false);
                  if (pendingPath) router.push(pendingPath); // Navigate without saving
                }}
                className="w-full py-3 bg-white border border-red-200 text-red-600 font-bold rounded-xl hover:bg-red-50 transition-colors"
              >
                Quit without Saving
              </button>
              
              <button 
                onClick={() => {
                  setShowExitWarning(false);
                  setPendingPath(null); // Cancel everything
                }}
                className="w-full py-2 text-slate-500 font-semibold text-sm hover:text-slate-800 mt-2 transition-colors"
              >
                Cancel, keep editing
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/2 flex flex-col bg-slate-50 border-r border-slate-200 relative">
          {auditSummary ? (
            <CompletionDashboard 
              auditSummary={auditSummary} 
              onDownload={downloadDraftAsWord} 
              onSubmit={submitToTaxTeam} 
              isSubmitting={isSubmitting} 
              isSubmitted={isSubmitted} 
            />
          ) : (
            <ChatSidebar messages={messages} input={input} setInput={setInput} isLoading={isLoading} onSendMessage={sendMessage} messagesEndRef={messagesEndRef} />
          )}
        </div>

        <LiveDocumentViewer aifState={aifState} onUpdateField={manualUpdate} />
      </div>
    </div>
  );
}