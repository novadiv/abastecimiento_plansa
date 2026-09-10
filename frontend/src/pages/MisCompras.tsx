import { ShoppingBag } from 'lucide-react';
import { MisComprasProvider, useMisComprasContext } from '@/context/MisComprasContext';
import { ResponsableRequiredNotice } from '@/components/misCompras/ResponsableRequiredNotice';
import { MisComprasKPIs } from '@/components/misCompras/MisComprasKPIs';
import { MisComprasFilters } from '@/components/misCompras/MisComprasFilters';
import { ProductosFrecuentesTable } from '@/components/misCompras/ProductosFrecuentesTable';
import { HistorialRequerimientosTable } from '@/components/misCompras/HistorialRequerimientosTable';

function MisComprasContent() {
  const { responsable, usuario } = useMisComprasContext();

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

      <MisComprasKPIs />
      <MisComprasFilters />
      <ProductosFrecuentesTable />
      <HistorialRequerimientosTable />
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
