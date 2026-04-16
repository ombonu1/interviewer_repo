import { useState } from 'react';

interface DashboardProps {
  auditSummary: any;
  onDownload: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  isSubmitted: boolean;
}

export default function CompletionDashboard({ auditSummary, onDownload, onSubmit, isSubmitting, isSubmitted }: DashboardProps) {
  const [showDetailedLog, setShowDetailedLog] = useState(false);

  return (
    <div className="flex-1 flex flex-col p-8 overflow-y-auto animate-in fade-in">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-slate-800 mb-2">Narrative Complete</h2>
        <p className="text-slate-600">{auditSummary.summary_text}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <button onClick={onDownload} className="py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 shadow-sm">
          Download Draft (.doc)
        </button>
        <button onClick={() => setShowDetailedLog(!showDetailedLog)} className="py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 shadow-sm">
          {showDetailedLog ? "Hide Audit Log" : "View Audit Log"}
        </button>
      </div>

      <button 
        onClick={onSubmit}
        disabled={isSubmitting || isSubmitted}
        className={`w-full py-4 font-bold rounded-xl shadow-md transition ${isSubmitted ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
      >
        {isSubmitting ? "Sending..." : isSubmitted ? "Successfully Submitted!" : "Send to Tax Team"}
      </button>

      {showDetailedLog && (
        <div className="mt-6 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 border-b pb-2">Full Audit Trail</h3>
          {auditSummary.detailed_log.map((entry: any, i: number) => (
            <div key={i} className="mb-4 text-sm border-l-2 border-blue-200 pl-3">
              <p className="font-semibold text-slate-700">AI: {entry.ai_question}</p>
              <p className="text-slate-600 mb-1">User: {entry.user_answer}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}