'use client';
import { useState } from 'react';

export default function ClaimsDirectory({ data, onClose, onOpenClaim }: any) {
  const [activeTab, setActiveTab] = useState<'returned' | 'saved' | 'sent'>('saved');

  // Helper to render the lists based on the active tab
  const renderList = (type: 'returned' | 'saved' | 'sent') => {
    const list = data[type];
    
    if (!list || list.length === 0) {
      return <p className="text-slate-400 italic text-sm p-4">No claims found in this folder.</p>;
    }

    return (
      <div className="space-y-3">
        {list.map((item: any, i: number) => (
          <div key={i} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all group">
            <div>
              <h4 className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                {item.project_name || "Unnamed Project"}
              </h4>
              <p className="text-xs text-slate-400 font-mono mt-1">ID: {item.session_id}</p>
            </div>
            
            {/* Dynamic Buttons based on Type */}
            {type === 'returned' && (
              <button 
                onClick={() => onOpenClaim(item, 'returned')}
                className="px-4 py-2 bg-red-50 text-red-600 font-bold text-xs rounded-lg border border-red-100 hover:bg-red-100 transition-colors"
              >
                View Feedback & Edit
              </button>
            )}
            {type === 'saved' && (
              <button 
                onClick={() => onOpenClaim(item, 'saved')}
                className="px-4 py-2 bg-slate-900 text-white font-bold text-xs rounded-lg hover:bg-slate-800 transition-colors"
              >
                {item.is_complete ? "Review Dashboard" : "Resume Draft"}
              </button>
            )}
            {type === 'sent' && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg cursor-not-allowed select-none">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-blue-700 font-bold text-[11px] uppercase tracking-wider">In Review</span>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex justify-end animate-in fade-in">
      <div className="w-125 h-full bg-slate-50 shadow-2xl flex flex-col animate-in slide-in-from-right-8 duration-300">
        
        {/* Header */}
        <div className="p-6 bg-white border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-xl font-extrabold text-slate-800">My Claims Directory</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-4 space-x-6 border-b border-slate-200 bg-white">
          {(['returned', 'saved', 'sent'] as const).map((tab) => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-bold capitalize relative ${activeTab === tab ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {tab} Drafts
              {tab === 'returned' && data.returned.length > 0 && (
                <span className="absolute -top-1 -right-3 w-2 h-2 bg-red-500 rounded-full"></span>
              )}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-md"></div>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {renderList(activeTab)}
        </div>

      </div>
    </div>
  );
}