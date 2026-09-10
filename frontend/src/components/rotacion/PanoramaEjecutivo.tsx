import { Compass } from 'lucide-react';
import { useRotacionContext } from '@/context/RotacionContext';
import { EmptyState } from '@/components/common/EmptyState';

export function PanoramaEjecutivo() {
  const { panorama } = useRotacionContext();

  return (
    <div className="card p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Compass size={16} className="text-brand-600" /> Panorama de materiales
      </h2>
      <p className="mb-4 text-xs text-slate-400">
        Generado automáticamente a partir del catálogo cargado y los filtros aplicados — nada de esto está escrito a mano.
      </p>
      {panorama.length === 0 ? (
        <EmptyState title="Sin información suficiente para generar el panorama" />
      ) : (
        <ul className="space-y-2">
          {panorama.map((frase, idx) => (
            <li key={idx} className="flex items-start gap-2 text-sm text-slate-600">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              {frase}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
