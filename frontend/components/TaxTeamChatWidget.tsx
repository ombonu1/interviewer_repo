'use client';
import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function TaxTeamChatWidget({ sessionId }: { sessionId: string }) {
  const [isOpen, setIsOpen] = useState(true); // Open by default for returned claims
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Poll for messages
  useEffect(() => {
    if (!sessionId) return;
    const fetchChat = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/chat/human/${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data);
        }
      } catch (err) { console.error("Poll error", err); }
    };
    
    fetchChat();
    const interval = setInterval(fetchChat, 3000);
    return () => clearInterval(interval);
  }, [sessionId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const msg = input.trim();
    setInput('');
    
    // Optimistic UI update
    setMessages(prev => [...prev, { sender: 'client', message: msg, timestamp: new Date().toISOString() }]);

    try {
      await fetch(`${API_BASE}/api/chat/human/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: 'client', message: msg })
      });
    } catch (err) {
      toast.error("Failed to send message to Tax Team");
    }
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-slate-900 text-white p-4 rounded-full shadow-2xl hover:bg-blue-600 transition-all z-50 group flex items-center gap-3"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
        <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs transition-all duration-300 font-bold text-sm">
          Chat with Tax Team
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 bg-white rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.15)] flex flex-col z-50 border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-8">
      {/* Header */}
      <div className="bg-slate-900 p-4 flex justify-between items-center text-white">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
          <h3 className="font-bold text-sm">Tax Team Advisor</h3>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>

      {/* Messages Area */}
      <div className="h-80 overflow-y-auto p-4 bg-slate-50 flex flex-col space-y-3">
        {messages.length === 0 ? (
          <p className="text-center text-slate-400 text-xs italic mt-10">No messages yet. Send a message to your reviewer.</p>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.sender === 'client' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-3 rounded-2xl text-[13px] leading-relaxed shadow-sm ${
                msg.sender === 'client' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none'
              }`}>
                <div className={`text-[9px] font-bold mb-1 uppercase tracking-wider ${msg.sender === 'client' ? 'text-blue-200' : 'text-slate-400'}`}>
                  {msg.sender === 'client' ? 'You' : 'Tax Team'}
                </div>
                {msg.message}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <form onSubmit={sendMessage} className="p-3 bg-white border-t border-slate-200 flex gap-2">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the tax team a question..." 
          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
        />
        <button type="submit" disabled={!input.trim()} className="bg-blue-600 text-white p-2 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
        </button>
      </form>
    </div>
  );
}