'use client';

interface Submission {
  id: string;
  project_name: string;
  compliance_score: number;
  status: string;
  has_been_audited: boolean;
}

export default function SubmissionTable({ submissions, onOpen }: { submissions: Submission[], onOpen: (id: string) => void }) {
  return (
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
            <tr>
              <td colSpan={4} className="p-8 text-center text-slate-400 italic">
                No submissions pending review.
              </td>
            </tr>
          ) : (
            submissions.map((sub) => (
              <tr key={sub.id} className="hover:bg-slate-50 transition-colors group">
                <td className="p-4 font-semibold text-slate-800">{sub.project_name || 'Unnamed Project'}</td>
                <td className="p-4">
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                    sub.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 
                    sub.status === 'Returned' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {sub.status}
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className={`text-lg font-black ${sub.compliance_score < 85 ? 'text-red-500' : 'text-emerald-500'}`}>
                    {sub.compliance_score}%
                  </span>
                </td>
                <td className="p-4 text-right">
                  <button 
                    onClick={() => onOpen(sub.id)} 
                    className="px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded hover:bg-slate-800 transition shadow-sm group-hover:scale-105 active:scale-95"
                  >
                    {sub.status === 'Approved' ? 'View Final' : 'Audit Claim'}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}