import { AlertTriangle, Info, TrendingUp } from 'lucide-react';
import { useProductosContext } from '@/context/ProductosContext';
import { LoadingState } from '@/components/common/LoadingState';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import type { AnalysisInsight } from '@/types/dashboard';

const TONE_STYLES: Record<AnalysisInsight['tone'], { icon: typeof Info; classes: string }> = {
  neutral: { icon: Info, classes: 'bg-brand-50 text-brand-600' },
  positive: { icon: TrendingUp, classes: 'bg-emerald-50 text-emerald-600' },
  warning: { icon: AlertTriangle, classes: 'bg-amber-50 text-amber-600' },
};

export function Analysis() {
  const { insights, analysisBlocks, totales, error, loading, refetch } = useProductosContext();

  if (error && !totales) return <ErrorState message={error} onRetry={refetch} />;
  if (!totales && loading) return <LoadingState message="Calculando análisis..." />;

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">Conclusiones automáticas</h2>
        <p className="mb-4 text-xs text-slate-400">
          Generadas dinámicamente a partir de los agregados que calcula el servidor sobre los productos filtrados.
        </p>

        {insights.length === 0 ? (
          <EmptyState title="Sin información suficiente para generar conclusiones" />
        ) : (
          <ul className="space-y-3">
            {insights.map((insight) => {
              const { icon: Icon, classes } = TONE_STYLES[insight.tone];
              return (
                <li key={insight.id} className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${classes}`}>
                    <Icon size={14} />
                  </div>
                  <p className="text-sm text-slate-600">{insight.text}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {analysisBlocks.map((block) => (
          <div key={block.id} className="card p-5">
            <h3 className="text-sm font-semibold text-slate-800">{block.title}</h3>
            <p className="mb-3 text-xs text-slate-400">{block.subtitle}</p>
            <dl className="divide-y divide-slate-100">
              {block.rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <dt className="text-slate-500">{row.label}</dt>
                  <dd className="font-medium text-slate-700">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
