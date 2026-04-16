import { RefObject, useEffect, useRef } from 'react';

interface ChatProps {
  messages: any[];
  input: string;
  setInput: (val: string) => void;
  isLoading: boolean;
  onSendMessage: (e: React.FormEvent | React.KeyboardEvent) => void;
  messagesEndRef: RefObject<HTMLDivElement | null>;
}

export default function ChatSidebar({ messages, input, setInput, isLoading, onSendMessage, messagesEndRef }: ChatProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 1. AUTO-SCROLL FIX: Keeps the chat at the bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, messagesEndRef]);

  // 2. AUTO-RESIZE FIX: Makes the textarea grow with the text
  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to auto to properly shrink when text is deleted
      textareaRef.current.style.height = 'auto';
      // Set the height to match the scroll height (content height), capped by our max-h Tailwind class
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  // 3. MULTI-LINE FIX: Submit on Enter, New Line on Shift+Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevents adding a new line
      if (input.trim() && !isLoading) {
        onSendMessage(e);
      }
    }
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm text-[15px] leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'}`}>
              {m.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 text-slate-500 rounded-2xl p-4 shadow-sm flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"></span>
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-slate-200">
        <form onSubmit={onSendMessage} className="relative flex items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message the AI Interviewer..."
            /* min-h-[52px] keeps it looking like a standard input. max-h-[200px] stops it from growing out of control. overflow-y-auto adds a scrollbar if they type past the max height. */
            className="w-full pl-4 pr-20 py-3.5 text-slate-800 bg-slate-100 rounded-xl border focus:border-blue-500 outline-none resize-none min-h-13 max-h-50 overflow-y-auto"
            disabled={isLoading}
            rows={1}
          />
          <button 
            type="submit" 
            disabled={isLoading || !input.trim()} 
            className="absolute right-2 bottom-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-opacity mb-0.5"
          >
            Send
          </button>
        </form>
      </div>
    </>
  );
}