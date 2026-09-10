import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title = 'Ocurrió un error.', message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
        <AlertTriangle size={22} strokeWidth={1.75} />
      </div>
      <h3 className="text-sm font-semibold text-rose-700">{title}</h3>
      <p className="max-w-sm text-sm text-rose-600">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary mt-1 border-rose-200 text-rose-700 hover:bg-rose-100">
          Intentar de nuevo
        </button>
      )}
    </div>
  );
}
