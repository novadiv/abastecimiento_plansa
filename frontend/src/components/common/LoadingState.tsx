import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Procesando archivo...' }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-16 text-center shadow-card">
      <Loader2 size={28} className="animate-spin text-brand-600" />
      <p className="text-sm font-medium text-slate-600">{message}</p>
    </div>
  );
}

export function InlineSpinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" />;
}
