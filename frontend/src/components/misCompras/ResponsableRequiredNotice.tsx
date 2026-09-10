import { useState } from 'react';
import { UserCog } from 'lucide-react';
import { setResponsableOverride } from '@/config/responsableMapping';
import { useRequerimientosFiltros } from '@/hooks/useRequerimientosFiltros';
import { EmptyState } from '@/components/common/EmptyState';

/** Se muestra cuando el usuario logueado no tiene un `responsable` de Requerimientos asignado todavía. */
export function ResponsableRequiredNotice({ usuario }: { usuario: string }) {
  const { responsables } = useRequerimientosFiltros();
  const [seleccion, setSeleccion] = useState('');
  const [guardado, setGuardado] = useState(false);

  function handleGuardar() {
    if (!seleccion) return;
    setResponsableOverride(usuario, seleccion);
    setGuardado(true);
    window.location.reload();
  }

  return (
    <div className="space-y-4">
      <EmptyState
        icon={UserCog}
        title="Tu usuario no tiene un responsable asignado todavía"
        description={`El sistema no relaciona automáticamente tu usuario ("${usuario}") con un "responsable" de Requerimientos. Selecciónalo una vez y quedará guardado en este navegador.`}
      />
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[240px]">
          <label className="label-text">Tu nombre en "Responsable"</label>
          <select value={seleccion} onChange={(e) => setSeleccion(e.target.value)} className="input">
            <option value="">Selecciona...</option>
            {responsables.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn-primary" onClick={handleGuardar} disabled={!seleccion}>
          Guardar y continuar
        </button>
        {guardado && <span className="text-sm text-emerald-600">Guardado, recargando…</span>}
      </div>
    </div>
  );
}
