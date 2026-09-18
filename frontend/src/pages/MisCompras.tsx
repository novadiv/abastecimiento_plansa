import { useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { MisComprasProvider, useMisComprasContext } from '@/context/MisComprasContext';
import { ResponsableRequiredNotice } from '@/components/misCompras/ResponsableRequiredNotice';
import { MisComprasKPIs } from '@/components/misCompras/MisComprasKPIs';
import { MisComprasFilters } from '@/components/misCompras/MisComprasFilters';
import { ProductosFrecuentesTable } from '@/components/misCompras/ProductosFrecuentesTable';
import { HistorialRequerimientosTable } from '@/components/misCompras/HistorialRequerimientosTable';
import { PanoramaCompleto } from '@/components/misCompras/panorama/PanoramaCompleto';
import { PlanComprasCompleto } from '@/components/misCompras/planCompras/PlanComprasCompleto';
import { OCRapidaView } from '@/components/misCompras/ocRapida/OCRapidaView';

type Vista = 'normal' | 'panorama' | 'plan-compras' | 'oc-rapida';

function MisComprasContent() {
  const { responsable, usuario } = useMisComprasContext();
  const [vista, setVista] = useState<Vista>('normal');

  if (!responsable) {
    return <ResponsableRequiredNotice usuario={usuario ?? ''} />;
  }

  return (
    <div className="space-y-6">
      <div className="card flex items-center gap-3 border-brand-100 bg-brand-50/50 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
          <ShoppingBag size={18} />
        </div>
        <div>
          <p className="text-sm font-semibold text-brand-900">Mis Compras · {responsable}</p>
          <p className="text-xs text-brand-700/80">
            Qué compro → con qué frecuencia → a quién le compro → cuánto gasto. Esta vista muestra únicamente tus
            requerimientos; el resto de compradores sigue disponible en el Dashboard general.
          </p>
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm">
        <button
          type="button"
          onClick={() => setVista('normal')}
          className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
            vista === 'normal' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          Vista normal
        </button>
        <button
          type="button"
          onClick={() => setVista('panorama')}
          className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
            vista === 'panorama' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          Panorama completo de materiales
        </button>
        <button
          type="button"
          onClick={() => setVista('plan-compras')}
          className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
            vista === 'plan-compras' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          Plan de Compras (2 meses)
        </button>
        <button
          type="button"
          onClick={() => setVista('oc-rapida')}
          className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
            vista === 'oc-rapida' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          ⚡ OC a Generar (rápido)
        </button>
      </div>

      {vista === 'normal' && (
        <>
          <MisComprasKPIs />
          <MisComprasFilters />
          <ProductosFrecuentesTable />
          <HistorialRequerimientosTable />
        </>
      )}
      {vista === 'panorama' && <PanoramaCompleto responsable={responsable} />}
      {vista === 'plan-compras' && <PlanComprasCompleto responsable={responsable} />}
      {vista === 'oc-rapida' && <OCRapidaView responsable={responsable} />}
    </div>
  );
}

export function MisCompras() {
  return (
    <MisComprasProvider>
      <MisComprasContent />
    </MisComprasProvider>
  );
}
