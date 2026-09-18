import { useState } from 'react';
import { ProductosFilters } from '@/components/dashboard/ProductosFilters';
import { ProductosTable } from '@/components/dashboard/ProductosTable';
import { ProductosCatalogoCompleto } from '@/components/dashboard/ProductosCatalogoCompleto';

type Vista = 'rapida' | 'completa';

export function Data() {
  const [vista, setVista] = useState<Vista>('rapida');

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm">
        <button
          type="button"
          onClick={() => setVista('rapida')}
          className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
            vista === 'rapida' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          Vista rápida (paginada)
        </button>
        <button
          type="button"
          onClick={() => setVista('completa')}
          className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
            vista === 'completa' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          Ver catálogo completo
        </button>
      </div>

      {vista === 'rapida' ? (
        <>
          <ProductosFilters />
          <ProductosTable />
        </>
      ) : (
        <ProductosCatalogoCompleto />
      )}
    </div>
  );
}
