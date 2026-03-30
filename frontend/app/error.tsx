'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // In production, you'd log this to Sentry or Datadog
    console.error(error);
  }, [error]);

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 p-6">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-red-100">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Something went wrong</h2>
        <p className="text-slate-500 text-sm mb-6">A critical rendering error occurred. Please try reloading the interface.</p>
        <button
          onClick={() => reset()}
          className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-sm"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}