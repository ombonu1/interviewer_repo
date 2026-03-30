export default function Loading() {
  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50">
      <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
      <p className="text-slate-500 font-medium animate-pulse">Loading workspace...</p>
    </div>
  );
}