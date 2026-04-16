'use client';

interface SubmissionSummary {
  id: string;
  project_name: string;
  compliance_score: number;
  status: string;
  has_been_audited: boolean;
}

interface SubmissionCardProps {
  sub: SubmissionSummary;
  onOpen: (id: string) => void;
  buttonText: string;
}

export default function SubmissionCard({ sub, onOpen, buttonText }: SubmissionCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 flex justify-between items-center hover:shadow-lg transition-all border-l-4 border-l-blue-500 mb-4 group">
      <div>
        <h4 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
          {sub.project_name || 'Unnamed Project'}
        </h4>
        <div className="flex items-center gap-3 mt-1">
          <p className="text-xs text-slate-400 font-mono tracking-tighter">ID: {sub.id}</p>
          <span className="text-slate-300 text-xs">•</span>
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
            sub.status === 'Returned' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'
          }`}>
            {sub.status}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-8">
        <div className="text-center">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">AI Compliance</p>
          <p className={`text-xl font-black ${sub.compliance_score > 80 ? 'text-emerald-500' : 'text-red-500'}`}>
            {sub.compliance_score}%
          </p>
        </div>
        <button 
          onClick={() => onOpen(sub.id)}
          className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-blue-600 transition-all shadow-md active:scale-95"
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
}