import { ArrowDown } from 'lucide-react';
import { usePlanComprasContext } from '@/context/PlanComprasContext';
import { formatCompactCurrency, formatNumber } from '@/utils/formatters';

/** Sección 11 (KPIs para gerencia) + sección 12 (indicador principal, tipo embudo). */
export function PlanComprasResumenEjecutivo() {
  const { resumen } = usePlanComprasContext();

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-800">Resumen ejecutivo para Gerencia de Compras</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <ResumenStat label="Requerimientos analizados" value={formatNumber(resumen.requerimientosAnalizados)} />
          <ResumenStat label="Requerimientos pendientes" value={formatNumber(resumen.requerimientosPendientesUnicos)} accent="rose" />
          <ResumenStat label="Materiales a comprar" value={formatNumber(resumen.materialesAComprar)} />
          <ResumenStat label="Proveedores involucrados" value={formatNumber(resumen.proveedoresInvolucrados)} />
          <ResumenStat label="OC actuales (histórico)" value={formatNumber(resumen.ocActuales)} />
          <ResumenStat label="OC sin consolidar (1x1)" value={formatNumber(resumen.ocSinConsolidar)} accent="amber" />
          <ResumenStat label="OC recomendadas" value={formatNumber(resumen.ocRecomendadas)} accent="brand" />
          <ResumenStat label="OC que se pueden evitar" value={formatNumber(resumen.ocEvitables)} accent="emerald" />
          <ResumenStat label="Monto estimado de compras" value={formatCompactCurrency(resumen.montoEstimado, 'PEN')} accent="brand" />
        </div>
      </div>

      <div className="card p-6 text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">¿Cuántas OC tengo que generar?</p>
        <div className="flex flex-col items-center gap-2">
          <FunnelStep value={formatNumber(resumen.requerimientosPendientesUnicos)} label="requerimientos pendientes" />
          <ArrowDown size={18} className="text-slate-300" />
          <FunnelStep value={formatNumber(resumen.proveedoresInvolucrados)} label="proveedores" />
          <ArrowDown size={18} className="text-slate-300" />
          <div className="rounded-xl border-2 border-brand-600 bg-brand-50 px-8 py-4">
            <p className="text-3xl font-bold text-brand-700">{formatNumber(resumen.ocRecomendadas)}</p>
            <p className="text-sm font-semibold text-brand-700">OC RECOMENDADAS</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-emerald-700">
          ✅ <strong>{formatNumber(resumen.ocEvitables)} OC potencialmente evitables</strong> mediante consolidación (en vez de generar una OC
          por cada requerimiento pendiente).
        </p>
      </div>
    </div>
  );
}

function FunnelStep({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-6 py-2">
      <span className="text-lg font-semibold text-slate-800">{value}</span> <span className="text-sm text-slate-500">{label}</span>
    </div>
  );
}

function ResumenStat({ label, value, accent }: { label: string; value: string; accent?: 'brand' | 'rose' | 'amber' | 'emerald' }) {
  const colorClass = accent === 'brand' ? 'text-brand-700' : accent === 'rose' ? 'text-rose-700' : accent === 'amber' ? 'text-amber-700' : accent === 'emerald' ? 'text-emerald-700' : 'text-slate-800';
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold ${colorClass}`}>{value}</p>
    </div>
  );
}
