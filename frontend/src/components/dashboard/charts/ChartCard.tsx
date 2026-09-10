import type { ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function ChartCard({ title, subtitle, children }: ChartCardProps) {
  return (
    <div className="card flex flex-col p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
      <div className="h-72 w-full">{children}</div>
    </div>
  );
}
