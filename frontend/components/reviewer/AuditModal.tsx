'use client';

export default function AuditModal({ submission, onClose }: { submission: any, onClose: () => void }) {
  const log = submission?.audit_summary?.detailed_log || [];

  return (
    <div className="fixed inset-0 z-150 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
      <div className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-white/20">
        
        {/* Header */}
        <div className="p-6 bg-white border-b border-slate-200 flex justify-between items-center sticky top-0">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Technical Interview Audit Log</h2>
            <p className="text-xs text-slate-500 font-medium mt-1 uppercase tracking-tight">
              Session ID: {submission?.session_id}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors font-bold text-slate-400">✕</button>
        </div>

        {/* Scrollable Log Body */}
        <div className="p-8 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
          
          {/* FALLBACK: If there is no log history at all */}
          {log.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              </div>
              <p className="text-slate-500 font-medium">No audit logs found for this session.</p>
              <p className="text-xs text-slate-400 mt-2">This may be a manually uploaded AIF or the log was not preserved.</p>
            </div>
          ) : (
            log.map((entry: any, i: number) => (
              <div key={i} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative transition-all hover:border-blue-200">
                <div className="absolute top-4 right-6 text-[10px] font-bold text-slate-300 uppercase">
                  {new Date(entry.timestamp).toLocaleString()}
                </div>
                
                {/* SCENARIO A: The entry is an AI Interview Q&A */}
                {entry.ai_question ? (
                  <>
                    <div className="mb-4 pr-16">
                      <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">AI Agent</span>
                      <p className="text-slate-700 text-sm leading-relaxed italic">"{entry.ai_question}"</p>
                    </div>
                    
                    <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                      <span className="text-[10px] font-black uppercase text-blue-600 block mb-1">Client Response</span>
                      <p className="text-blue-900 text-sm font-semibold leading-relaxed">{entry.user_answer}</p>
                    </div>
                    
                    {entry.extracted_fields?.length > 0 && (
                      <div className="mt-4 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                        <span className="text-[10px] font-mono font-bold text-emerald-600 uppercase">
                          Data Parsed: {entry.extracted_fields.join(", ")}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  /* SCENARIO B: The entry is a Unified Master Log event (Approval, Return, Manual Edit) */
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 mt-2">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        entry.actor?.includes('Tax Team') ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {entry.actor || 'System'}
                      </span>
                      <span className="text-xs font-bold text-slate-800">{entry.event_type}</span>
                    </div>
                    <p className="text-sm text-slate-600">{entry.details}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}