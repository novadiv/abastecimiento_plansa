import type { RotacionNivel } from '@/types/rotacion';
import { useRotacionContext } from '@/context/RotacionContext';
import { RankingMaterialesTable } from './RankingMaterialesTable';
import { formatNumber } from '@/utils/formatters';

const NIVEL_INFO: Record<RotacionNivel, { titulo: string; descripcion: string }> = {
  alta: {
    titulo: '🔴 Materiales de alta rotación',
    descripcion: 'Los materiales que más salen y con mayor frecuencia de solicitud — prioridad alta de abastecimiento.',
  },
  media: {
    titulo: '🟡 Materiales de media rotación',
    descripcion: 'Movimiento intermedio — candidatos a seguimiento periódico.',
  },
  baja: {
    titulo: '⚪ Materiales de baja / poca rotación',
    descripcion: 'Pocas solicitudes, pero con movimiento reciente — revisar la necesidad real de mantener stock.',
  },
  sinRotacion: {
    titulo: '⚫ Materiales sin rotación',
    descripcion: 'Sin movimiento reciente — revisar posible inmovilización de stock o material obsoleto.',
  },
};

/** Secciones que representan "Materiales de Baja Rotación" en el sentido del requerimiento: baja + sin rotación. */
export function NivelSection({ nivel }: { nivel: RotacionNivel }) {
  const { materiales } = useRotacionContext();
  const info = NIVEL_INFO[nivel];
  const filtrados = materiales.filter((m) => m.nivel === nivel);

  const conStockInmovilizado =
    nivel === 'baja' || nivel === 'sinRotacion' ? filtrados.filter((m) => m.stockActual !== null && m.stockActual > 0) : [];

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{info.titulo}</h3>
        <p className="text-xs text-slate-400">{info.descripcion}</p>
        {conStockInmovilizado.length > 0 && (
          <p className="mt-1 text-xs font-medium text-amber-600">
            ⚠️ {formatNumber(conStockInmovilizado.length)} de estos materiales aún tienen stock — posible stock inmovilizado.
          </p>
        )}
      </div>
      <RankingMaterialesTable materiales={filtrados} titulo={info.titulo} />
    </div>
  );
}
