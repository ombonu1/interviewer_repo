import { useState, useRef, useEffect, ChangeEvent } from 'react';

interface LiveDocProps {
  aifState: any;
  // We add a callback so the parent page can update the state and log the audit!
  onUpdateField: (field: string, value: any) => void; 
}

export default function LiveDocumentViewer({ aifState, onUpdateField }: LiveDocProps) {
  const proj = aifState?.project_narratives?.[0] || {};
  
  // Warning Modal State
  const [hasWarned, setHasWarned] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<{field: string, value: any} | null>(null);

  // Helper to intercept edits
  const handleEditAttempt = (field: string, value: any) => {
    if (!hasWarned) {
      setPendingEdit({ field, value });
      setShowWarning(true);
      return;
    }
    onUpdateField(field, value);
  };

  const confirmEdit = () => {
    setHasWarned(true);
    setShowWarning(false);
    if (pendingEdit) {
      onUpdateField(pendingEdit.field, pendingEdit.value);
      setPendingEdit(null);
    }
  };

  const cancelEdit = () => {
    setShowWarning(false);
    setPendingEdit(null);
  };

  return (
    <div className="w-1/2 flex flex-col bg-slate-200 overflow-y-auto items-center p-8 custom-scrollbar relative">
      
      {/* --- WARNING MODAL OVERLAY --- */}
      {showWarning && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-8">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full border-t-4 border-amber-500 transform transition-all">
            <h3 className="text-xl font-bold text-slate-900 mb-2 flex items-center gap-2">
              <span className="text-amber-500">⚠️</span> Manual Edit Warning
            </h3>
            <p className="text-slate-600 text-[15px] leading-relaxed mb-6">
              You are about to manually edit the AIF. The AI Interviewer will not automatically verify manual changes for HMRC compliance. 
              <br/><br/>
              <strong>Note:</strong> Any manual changes will be explicitly flagged in the final audit log for the Tax Team.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={cancelEdit} className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors">
                Cancel
              </button>
              <button onClick={confirmEdit} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors">
                I Understand, Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      <div id="document-preview" className="w-[198.5mm] min-h-[280.75mm] bg-white shadow-2xl p-16 relative flex flex-col transform origin-top scale-[0.85] 2xl:scale-100">
        <div className="absolute top-0 left-0 w-full h-2 bg-linear-to-r from-blue-600 to-emerald-500"></div>
        
        <div className="flex justify-between items-start mb-10 border-b-2 border-slate-800 pb-4 mt-4">
          <div>
             <h1 className="text-2xl font-bold uppercase tracking-wide font-serif text-black">Technical Project Narrative</h1>
             <p className="text-sm font-serif text-slate-500 mt-1">Internal Tax Team Submission</p>
          </div>
        </div>

        {/* 1. Project Overview */}
        <div className="mb-10 font-serif">
          <h2 className="text-lg font-bold bg-slate-50 p-2 mb-6 border-l-4 border-blue-600 font-sans text-slate-900 flex justify-between items-center">
            <span>1. Project Overview</span>
          </h2>
          <div className="grid grid-cols-2 gap-y-6 gap-x-8 px-2">
            <div className="col-span-2 relative group">
               <span className="font-bold text-slate-500 text-[10px] uppercase block mb-1">Project Name</span> 
               <input 
                 type="text"
                 value={proj.project_name || ''}
                 onChange={(e) => handleEditAttempt('project_name', e.target.value)}
                 className="w-full text-[16px] text-blue-800 font-bold border-b border-dotted border-slate-400 pb-1 min-h-6 bg-transparent focus:outline-none focus:border-blue-500 transition-colors"
                 placeholder="Enter project name..."
               />
            </div>
            <div className="col-span-2 relative group">
               <span className="font-bold text-slate-500 text-[10px] uppercase block mb-1">Lead Competent Professional</span> 
               <input 
                 type="text"
                 value={proj.competent_professional || ''}
                 onChange={(e) => handleEditAttempt('competent_professional', e.target.value)}
                 className="w-full text-[15px] text-blue-800 font-semibold leading-relaxed border-b border-dotted border-slate-400 pb-1 min-h-6 bg-transparent focus:outline-none focus:border-blue-500 transition-colors"
                 placeholder="Enter professional details..."
               />
            </div>
          </div>
        </div>

        {/* 2. Technical Narrative */}
        <div className="mb-10 font-serif flex-1">
          <h2 className="text-lg font-bold bg-slate-50 p-2 mb-6 border-l-4 border-blue-600 font-sans text-slate-900">2. Technical Narrative</h2>
          <div className="space-y-8 text-[15px] leading-relaxed text-slate-800 px-2">
            
            <NarrativeField 
              label="A. Advance Sought" 
              value={proj.advance_sought} 
              onChange={(val) => handleEditAttempt('advance_sought', val)} 
            />
            
            <NarrativeField 
              label="B. Scientific Uncertainties" 
              value={proj.scientific_uncertainties} 
              onChange={(val) => handleEditAttempt('scientific_uncertainties', val)} 
            />
            
            <NarrativeField 
              label="C. Why it was unresolvable by a professional" 
              value={proj.why_unresolvable_by_professional} 
              onChange={(val) => handleEditAttempt('why_unresolvable_by_professional', val)} 
            />
            
            <NarrativeField 
              label="D. Activities & Outcomes" 
              value={proj.activities_undertaken} 
              onChange={(val) => handleEditAttempt('activities_undertaken', val)} 
            />
            
            {/* If there are split outcomes, render them editable too */}
            {proj.outcomes && (
               <NarrativeField 
                 label="Outcomes (Continued)" 
                 value={proj.outcomes} 
                 onChange={(val) => handleEditAttempt('outcomes', val)} 
               />
            )}
            
          </div>
        </div>

        {/* 3. Compliance - Keep as read-only toggles or standard text for now */}
        <div className="font-serif mt-auto pt-8 border-t border-slate-200">
          <h2 className="text-lg font-bold bg-slate-50 p-2 mb-6 border-l-4 border-blue-600 font-sans text-slate-900">3. Compliance Flags</h2>
          <div className="grid grid-cols-2 gap-4 px-2">
             <div className="flex justify-between border-b border-slate-100 pb-2">
               <span className="text-sm text-slate-700">Overseas R&D?</span>
               <span className="font-semibold text-blue-800 text-sm">{aifState?.compliance?.overseas_rnd ? 'Yes' : aifState?.compliance?.overseas_rnd === false ? 'No' : ''}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
               <span className="text-sm text-slate-700">AI Used?</span>
               <span className="font-semibold text-blue-800 text-sm">{aifState?.compliance?.ai_used ? 'Yes' : aifState?.compliance?.ai_used === false ? 'No' : ''}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
               <span className="text-sm text-slate-700">Quantum Used?</span>
               <span className="font-semibold text-blue-800 text-sm">{aifState?.compliance?.quantum_used ? 'Yes' : aifState?.compliance?.quantum_used === false ? 'No' : ''}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Component for Auto-Resizing Textareas that look like static text
function NarrativeField({ label, value, onChange }: { label: string, value: string, onChange: (val: string) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize magic
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  return (
    <div>
      <p className="font-bold text-slate-500 text-[10px] uppercase font-sans mb-1 flex justify-between">
        {label} <span className="text-blue-400/50 hover:text-blue-500 cursor-pointer">✎</span>
      </p>
      <textarea
        ref={textareaRef}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-blue-800 bg-slate-50/50 hover:bg-slate-100/80 p-3 rounded border border-slate-100 focus:border-blue-400 focus:bg-white focus:shadow-sm min-h-10 focus:outline-none resize-none overflow-hidden transition-all duration-200"
        placeholder="Awaiting input..."
        rows={1}
      />
    </div>
  );
}