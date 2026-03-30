'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';

// 1. USE THE ENVIRONMENT VARIABLE
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// 2. DEFINE STRICT TYPES (No more 'any' abuse!)
interface ClaimItem {
  id: string;
  name: string;
  status?: string;
  date: string;
}

interface DashboardData {
  returned: ClaimItem[];
  saved: ClaimItem[];
  sent: ClaimItem[];
}

export default function SetupPage() {
  const router = useRouter();
  const [isParsing, setIsParsing] = useState(false);
  
  // Folder & Dropdown States
  const [isFolderOpen, setIsFolderOpen] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<'returned' | 'saved' | 'sent' | null>(null);
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'returned' | 'saved' | 'sent'>('saved');
  const [searchQuery, setSearchQuery] = useState('');

  // 3. APPLY TYPES TO STATE
  const [folderData, setFolderData] = useState<DashboardData>({
    returned: [], saved: [], sent: []
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/client/dashboard`, { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          setFolderData({
            returned: data.returned || [],
            saved: data.saved || [],
            sent: data.sent || []
          });
        }
      } catch (error) {
        console.error("Failed to fetch dashboard data", error);
      }
    };
    fetchDashboardData();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsParsing(true);
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch(`${API_BASE}/api/upload`, {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}`);
        }

        const data = await response.json();
        sessionStorage.setItem('draft_aif_state', JSON.stringify(data.extracted_state));
        sessionStorage.setItem('draft_is_complete', String(data.is_complete));
        sessionStorage.setItem('draft_summary', data.message);
        router.push('/chat?draft=true');
      } catch (error) {
        console.error("Upload failed", error);
        toast.error("Failed to parse document. Is your backend running and accessible?");
        setIsParsing(false); 
      }
    }
  };

  const toggleCategory = (category: 'returned' | 'saved' | 'sent') => {
    setExpandedCategory(prev => prev === category ? null : category);
  };

  const openFullModal = (tab: 'returned' | 'saved' | 'sent') => {
    setActiveTab(tab);
    setSearchQuery('');
    setIsModalOpen(true);
    setIsFolderOpen(false); // Close the dropdown
  };

  // Filter items in the modal based on the search query
  const filteredModalItems = useMemo(() => {
    const items = folderData[activeTab] || [];
    if (!searchQuery.trim()) return items;
    return items.filter(item => 
      item.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.id?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [folderData, activeTab, searchQuery]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans">
      
      {/* --- ALL CLAIMS MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col h-[80vh] overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                </div>
                Claims Directory
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-700 bg-white border border-slate-200 rounded-lg shadow-sm transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            {/* Modal Tabs & Search */}
            <div className="px-6 pt-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex gap-6 text-sm font-bold overflow-x-auto custom-scrollbar">
                <button onClick={() => setActiveTab('returned')} className={`pb-4 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'returned' ? 'border-red-500 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  Returned for Edits <span className="ml-1 bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full text-xs">{folderData.returned.length}</span>
                </button>
                <button onClick={() => setActiveTab('saved')} className={`pb-4 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'saved' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  Saved Drafts <span className="ml-1 bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full text-xs">{folderData.saved.length}</span>
                </button>
                <button onClick={() => setActiveTab('sent')} className={`pb-4 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'sent' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  Sent to Tax Team <span className="ml-1 bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full text-xs">{folderData.sent.length}</span>
                </button>
              </div>
              <div className="relative mb-4 sm:mb-0 w-full sm:w-64 shrink-0">
                <svg className="absolute left-3 top-2.5 text-slate-400" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <input 
                  type="text" 
                  placeholder="Search claims..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                />
              </div>
            </div>

            {/* Modal List Area */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
              {filteredModalItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" className="mb-4 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                  <p>No claims found in this category.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredModalItems.map((item: ClaimItem) => (
                    <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between hover:border-blue-300 transition-all group">
                      <div>
                        <h4 className="font-bold text-slate-800 text-lg group-hover:text-blue-600 transition-colors">{item.name}</h4>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-slate-400 font-mono">{item.id}</span>
                          <span className="text-xs text-slate-400">•</span>
                          <span className="text-xs text-slate-500">{item.date}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {item.status && (
                          <span className={`px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded-lg ${
                            item.status === 'Returned' || item.status === 'Action Required' ? 'bg-red-100 text-red-700' :
                            item.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {item.status}
                          </span>
                        )}
                        <button 
                          onClick={() => {
                            if (activeTab === 'saved' || activeTab === 'returned') {
                              router.push(`/chat?session_id=${item.id}`);
                            } else {
                              toast.error("This claim is currently with the tax team and cannot be edited.");
                            }
                          }}
                          className={`px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors ${
                            activeTab === 'saved' || activeTab === 'returned' 
                              ? 'bg-blue-600 text-white hover:bg-blue-700' 
                              : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          {activeTab === 'saved' || activeTab === 'returned' ? 'Resume Session' : 'Locked'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- TOP NAVIGATION BAR --- */}
      <header className="flex-none h-16 bg-white border-b border-slate-200 flex items-center px-8 shadow-sm justify-between relative z-50">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-slate-400 hover:text-blue-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          </Link>
          <div className="h-6 w-px bg-slate-200"></div>
          <h1 className="font-semibold text-slate-800 text-lg">AIF Interviewer</h1>
        </div>

        {/* --- MY DOCUMENTS FOLDER --- */}
        <div className="relative">
          <button 
            onClick={() => setIsFolderOpen(!isFolderOpen)}
            className={`relative p-2.5 rounded-xl flex items-center gap-2 font-semibold transition-all border ${isFolderOpen ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-800 shadow-sm'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            <span className="text-sm">My Claims</span>
            
            {folderData.returned.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 border-2 border-white items-center justify-center text-[8px] text-white font-bold">{folderData.returned.length}</span>
              </span>
            )}
          </button>

          {/* ACCORDION DROPDOWN FLYOUT */}
          {isFolderOpen && (
            <div className="absolute right-0 mt-3 w-80 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
              
              {/* Returned Category */}
              <div className="border-b border-slate-100">
                <button onClick={() => toggleCategory('returned')} className="w-full flex items-center justify-between p-4 bg-red-50/50 hover:bg-red-50 transition-colors">
                  <span className="text-xs font-bold uppercase text-red-700 flex items-center gap-2">
                    Returned for Edits
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="bg-red-200 text-red-800 px-2 py-0.5 rounded text-xs font-bold">{folderData.returned.length}</span>
                    <svg className={`w-4 h-4 text-red-500 transition-transform ${expandedCategory === 'returned' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </button>
                {expandedCategory === 'returned' && (
                  <div className="p-3 bg-white">
                    {folderData.returned.length === 0 ? <p className="text-xs text-slate-400 text-center py-2">No returned claims.</p> : null}
                    {folderData.returned.slice(0, 2).map((item: ClaimItem) => (
                      <button key={item.id} onClick={() => router.push(`/chat?session_id=${item.id}`)} className="w-full text-left bg-white p-3 rounded-lg border border-red-200 shadow-sm hover:border-red-400 transition mb-2 group">
                        <p className="text-sm font-bold text-slate-800 group-hover:text-blue-600 truncate">{item.name}</p>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">{item.date}</p>
                      </button>
                    ))}
                    {folderData.returned.length > 2 && (
                      <button onClick={() => openFullModal('returned')} className="w-full text-center text-xs text-red-600 font-bold hover:underline py-1 transition-all">View all {folderData.returned.length} returned claims</button>
                    )}
                  </div>
                )}
              </div>

              {/* Saved Drafts Category */}
              <div className="border-b border-slate-100">
                <button onClick={() => toggleCategory('saved')} className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors">
                  <span className="text-xs font-bold uppercase text-slate-600">Saved Drafts</span>
                  <div className="flex items-center gap-2">
                    <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-xs font-bold">{folderData.saved.length}</span>
                    <svg className={`w-4 h-4 text-slate-500 transition-transform ${expandedCategory === 'saved' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </button>
                {expandedCategory === 'saved' && (
                  <div className="p-3 bg-white">
                    {folderData.saved.length === 0 ? <p className="text-xs text-slate-400 text-center py-2">No saved drafts.</p> : null}
                    {folderData.saved.slice(0, 2).map((item: ClaimItem) => (
                      <button key={item.id} onClick={() => router.push(`/chat?session_id=${item.id}`)} className="w-full text-left bg-white p-3 rounded-lg border border-slate-200 hover:border-blue-400 transition mb-2 group">
                        <p className="text-sm font-bold text-slate-800 group-hover:text-blue-600 truncate">{item.name}</p>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">{item.date}</p>
                      </button>
                    ))}
                    {folderData.saved.length > 2 && (
                      <button onClick={() => openFullModal('saved')} className="w-full text-center text-xs text-blue-600 font-bold hover:underline py-1 transition-all">View all {folderData.saved.length} saved drafts</button>
                    )}
                    {/* Always give an easy out to the modal if they want to search */}
                    {folderData.saved.length <= 2 && folderData.saved.length > 0 && (
                      <button onClick={() => openFullModal('saved')} className="w-full text-center text-xs text-slate-500 hover:text-slate-700 font-semibold py-1 transition-colors">Open Directory</button>
                    )}
                  </div>
                )}
              </div>

              {/* Sent Category */}
              <div>
                <button onClick={() => toggleCategory('sent')} className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors">
                  <span className="text-xs font-bold uppercase text-slate-600">Sent to Tax Team</span>
                  <div className="flex items-center gap-2">
                    <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-xs font-bold">{folderData.sent.length}</span>
                    <svg className={`w-4 h-4 text-slate-500 transition-transform ${expandedCategory === 'sent' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </button>
                {expandedCategory === 'sent' && (
                  <div className="p-3 bg-white">
                    {folderData.sent.length === 0 ? <p className="text-xs text-slate-400 text-center py-2">No sent claims.</p> : null}
                    {folderData.sent.slice(0, 2).map((item: ClaimItem) => (
                      <div key={item.id} className="w-full text-left bg-slate-50 p-3 rounded-lg border border-slate-100 mb-2 opacity-80 cursor-not-allowed">
                        <div className="flex justify-between items-start">
                          <p className="text-sm font-bold text-slate-700 truncate pr-2">{item.name}</p>
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded whitespace-nowrap ${item.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{item.status}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">{item.date}</p>
                      </div>
                    ))}
                    {folderData.sent.length > 2 && (
                      <button onClick={() => openFullModal('sent')} className="w-full text-center text-xs text-blue-600 font-bold hover:underline py-1 transition-all">View all {folderData.sent.length} sent claims</button>
                    )}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </header>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 flex flex-col items-center justify-center p-6" onClick={() => setIsFolderOpen(false)}>
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">How would you like to begin?</h2>
          <p className="text-slate-600 max-w-lg mx-auto">
            You can upload an existing technical draft for the AI to analyze, or start a guided interview from scratch to build your RDEC claim.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-8 w-full max-w-4xl justify-center">
          
          {/* UPLOAD DRAFT CARD */}
          <div className="relative group w-full sm:w-96 bg-white rounded-2xl shadow-sm border border-slate-200 hover:shadow-xl hover:border-blue-400 transition-all duration-300 overflow-hidden">
            {isParsing && (
              <div className="absolute inset-0 z-10 bg-blue-50/90 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-300">
                <svg className="animate-spin h-12 w-12 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <h3 className="text-xl font-bold text-blue-900 mb-1">Analyzing Document...</h3>
                <p className="text-sm text-blue-700 font-medium">Extracting HMRC entities</p>
              </div>
            )}

            <label className={`flex flex-col h-full p-8 ${isParsing ? 'opacity-0' : 'cursor-pointer'}`}>
              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 transition-transform">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Upload Draft</h2>
              <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                Have a rough document or technical notes? Upload a PDF or Word file and let the AI pre-fill your AIF.
              </p>
              
              <div className="mt-auto flex items-center text-blue-600 font-semibold text-sm group-hover:translate-x-1 transition-transform">
                Browse Files <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
              </div>
              <input 
                type="file" 
                className="hidden" 
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileUpload}
                disabled={isParsing}
              />
            </label>
          </div>

          {/* START FROM SCRATCH CARD */}
          <div className={`relative w-full sm:w-96 bg-white rounded-2xl shadow-sm border border-slate-200 transition-all duration-300 ${isParsing ? 'opacity-50 pointer-events-none' : 'hover:shadow-xl hover:border-emerald-400 group cursor-pointer'}`}>
            <Link href="/chat" className="flex flex-col h-full p-8" onClick={() => {
               sessionStorage.removeItem('draft_aif_state');
               sessionStorage.removeItem('draft_is_complete');
               sessionStorage.removeItem('draft_summary');
            }}>
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 transition-transform">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Start from Scratch</h2>
              <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                Jump straight into a conversation with our AI agent to build your RDEC claim from the ground up.
              </p>
              
              <div className="mt-auto flex items-center text-emerald-600 font-semibold text-sm group-hover:translate-x-1 transition-transform">
                Begin Interview <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
              </div>
            </Link>
          </div>

        </div>
      </main>
    </div>
  );
}