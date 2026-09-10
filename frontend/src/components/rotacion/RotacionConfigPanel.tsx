import { useState } from 'react';
import { RotateCcw, Settings2 } from 'lucide-react';
import { useRotacionContext } from '@/context/RotacionContext';

export function RotacionConfigPanel() {
  const { config, updateConfig, resetConfig } = useRotacionContext();
  const [open, setOpen] = useState(false);

  return (
    <div className="card p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Settings2 size={16} className="text-brand-600" /> Configuración de criterios de rotación
        </span>
        <span className="text-xs text-slate-400">{open ? 'Ocultar' : 'Ajustar umbrales'}</span>
      </button>

      {open && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Movimientos mínimos para Alta rotación"
            value={config.umbralAlta}
            onChange={(v) => updateConfig({ umbralAlta: v })}
          />
          <Field
            label="Movimientos mínimos para Media rotación"
            value={config.umbralMedia}
            onChange={(v) => updateConfig({ umbralMedia: v })}
          />
          <Field
            label='Días para "sin movimiento reciente"'
            value={config.diasSinMovimiento}
            onChange={(v) => updateConfig({ diasSinMovimiento: v })}
          />
          <Field
            label='Percentil de "alto valor" (0-1)'
            value={config.percentilAltoValor}
            step={0.05}
            onChange={(v) => updateConfig({ percentilAltoValor: Math.min(1, Math.max(0, v)) })}
          />
          <div className="sm:col-span-2 lg:col-span-4">
            <button type="button" onClick={resetConfig} className="btn-ghost">
              <RotateCcw size={14} /> Restaurar valores por defecto
            </button>
            <p className="mt-2 text-xs text-slate-400">
              Los cambios se guardan en este navegador y se aplican al instante sobre el catálogo ya cargado — no hace
              falta modificar código ni volver a consultar el servidor.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <label className="label-text">{label}</label>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input"
      />
    </div>
  );
}
