import { useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useAbastecimiento } from '@/hooks/useAbastecimiento';
import { exportToCSV } from '@/services/exportService';
import { formatDate, formatNumber } from '@/utils/formatters';
import { LoadingState } from '@/components/common/LoadingState';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { AbastecimientoFiltros } from '@/components/abastecimiento/AbastecimientoFiltros';
import { AbastecimientoKPIs } from '@/components/abastecimiento/AbastecimientoKPIs';
import { ConsolidadoTable } from '@/components/abastecimiento/ConsolidadoTable';
import { DetalleRequerimientosModal } from '@/components/abastecimiento/DetalleRequerimientosModal';
import { HistorialProductoModal } from '@/components/abastecimiento/HistorialProductoModal';
import { SustentoModal } from '@/components/abastecimiento/SustentoModal';
import { ProveedoresModal } from '@/components/abastecimiento/ProveedoresModal';
import { PlanOrdenesView } from '@/components/abastecimiento/PlanOrdenesView';
import type { ItemConsolidado } from '@/types/abastecimiento';
import { ESTADOS_ORDENADOS, etiquetaEstado } from '@/components/abastecimiento/EstadoBadge';

const COLUMNAS_EXPORT = [
  { key: 'codigo', label: 'Código' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'comprador', label: 'Comprador' },
  { key: 'unidad', label: 'Unidad' },
  { key: 'familia', label: 'Familia' },
  { key: 'solicitado', label: 'Solicitado' },
  { key: 'atendido', label: 'Atendido' },
  { key: 'pendiente', label: 'Pendiente' },
  { key: 'stock_actual', label: 'Stock actual' },
  { key: 'en_camino', label: 'Ya pedido sin llegar' },
  { key: 'ordenado_periodo', label: 'Ordenado en el periodo' },
  { key: 'ritmo_mensual', label: 'Ritmo mensual' },
  { key: 'cobertura_meses', label: 'Cobertura (meses)' },
  { key: 'fecha_quiebre', label: 'Se agota el' },
  { key: 'sugerido_comprar', label: 'Cantidad a comprar' },
  { key: 'costo_unitario', label: 'Costo unitario (S/)' },
  { key: 'importe_estimado', label: 'Importe estimado (S/)' },
  { key: 'estado', label: 'Estado' },
  { key: 'documentos', label: 'N.º requerimientos' },
];

export function Abastecimiento() {
  const {
    filtros,
    filtrosAplicados,
    actualizarFiltro,
    aplicarFiltros,
    restablecerFiltros,
    hayCambiosSinAplicar,
    catalogos,
    datos,
    itemsVisibles,
    cargando,
    error,
    busqueda,
    setBusqueda,
    estadoFiltro,
    setEstadoFiltro,
    orden,
    setOrden,
  } = useAbastecimiento();

  // Dos formas de mirar lo mismo: por material (para decidir cantidades) y
  // por proveedor (para girar las órdenes). La segunda es la que mira la
  // gerencia, así que va escrita en lenguaje llano.
  const [vista, setVista] = useState<'materiales' | 'ordenes'>('materiales');
  const [excluirMateriaPrima, setExcluirMateriaPrima] = useState(true);

  const [codigoDetalle, setCodigoDetalle] = useState<string | null>(null);
  const [codigoHistorial, setCodigoHistorial] = useState<string | null>(null);
  const [codigoSustento, setCodigoSustento] = useState<string | null>(null);
  // Se guarda el ítem entero, no solo el código: el modal de proveedores
  // necesita la cantidad sugerida para estimar el costo de cada opción.
  const [itemProveedores, setItemProveedores] = useState<ItemConsolidado | null>(null);

  function exportar() {
    exportToCSV(
      itemsVisibles,
      COLUMNAS_EXPORT,
      `plan_abastecimiento_${filtrosAplicados.desde}_${filtrosAplicados.hasta}.csv`,
    );
  }

  const opcionesPlan = {
    desde: filtrosAplicados.desde,
    hasta: filtrosAplicados.hasta,
    base: filtrosAplicados.base,
    meses: filtrosAplicados.meses,
    comprador: filtrosAplicados.comprador,
    // 07 = materia prima (incluye molidos, pigmentos y tintas), 14 = aceros.
    excluirTipos: excluirMateriaPrima ? ['07', '14'] : [],
    costoOrden: 45,
    tasaAlmacen: 0.22,
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-3xl text-sm text-slate-500">
          {vista === 'materiales'
            ? 'Requerimientos de almacén consolidados por producto, cruzados con el stock actual y el histórico de compras, para comprar una sola vez sin quedarse corto ni pasarse.'
            : 'La misma información agrupada por proveedor: una sola orden para todo lo que se le compre, con la frecuencia que conviene a cada uno.'}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={aplicarFiltros}
            className="btn-secondary"
            disabled={cargando}
            title="Vuelve a consultar el ERP con los filtros actuales"
          >
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> Actualizar
          </button>
          {vista === 'materiales' && (
            <button
              type="button"
              onClick={exportar}
              className="btn-secondary"
              disabled={itemsVisibles.length === 0}
            >
              <Download size={14} /> Exportar CSV
            </button>
          )}
        </div>
      </header>

      {/* Dos maneras de mirar el mismo plan. Por material se decide cuánto
          comprar de cada cosa; por proveedor se decide qué documentos girar,
          que es donde está la reducción de órdenes. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
        <nav className="flex gap-1" aria-label="Vistas del plan">
          {(
            [
              ['materiales', 'Qué comprar, material por material'],
              ['ordenes', 'Órdenes a girar, por proveedor'],
            ] as const
          ).map(([id, etiqueta]) => (
            <button
              key={id}
              type="button"
              onClick={() => setVista(id)}
              aria-current={vista === id ? 'page' : undefined}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                vista === id
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </nav>

        <label className="flex cursor-pointer items-center gap-2 pb-2 text-xs text-slate-600">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
            checked={excluirMateriaPrima}
            onChange={(e) => setExcluirMateriaPrima(e.target.checked)}
          />
          Dejar fuera materia prima y aceros
        </label>
      </div>

      <AbastecimientoFiltros
        filtros={filtros}
        catalogos={catalogos}
        hayCambiosSinAplicar={hayCambiosSinAplicar}
        cargando={cargando}
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        onCambio={actualizarFiltro}
        onAplicar={aplicarFiltros}
        onRestablecer={restablecerFiltros}
      />

      {vista === 'ordenes' && (
        <PlanOrdenesView
          opciones={opcionesPlan}
          etiquetasExcluidas={excluirMateriaPrima ? ['materia prima', 'aceros'] : []}
        />
      )}

      {vista === 'materiales' && cargando && (
        <div className="card p-10">
          <LoadingState message="Consultando los requerimientos en el ERP… La primera consulta de un periodo amplio puede tardar hasta un minuto." />
        </div>
      )}

      {vista === 'materiales' && error && !cargando && <ErrorState message={error} />}

      {vista === 'materiales' && !cargando && !error && datos && (
        <>
          <AbastecimientoKPIs
            resumen={datos.resumen}
            estadoFiltro={estadoFiltro}
            onEstadoFiltro={setEstadoFiltro}
          />

          <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-xs text-slate-500">
            <span>
              Periodo:{' '}
              <strong className="text-slate-700">
                {formatDate(datos.resumen.desde)} – {formatDate(datos.resumen.hasta)}
              </strong>{' '}
              ({formatNumber(datos.resumen.meses_periodo, 1)} meses)
            </span>
            <span>
              Ritmo calculado sobre:{' '}
              <strong className="text-slate-700">{datos.resumen.base_consumo_etiqueta}</strong>
            </span>
            <span>
              Cobertura objetivo:{' '}
              <strong className="text-slate-700">{datos.resumen.meses_objetivo} meses</strong>
            </span>
            {datos.resumen.incluir_pendiente && (
              <span className="text-brand-700">Incluye el pendiente sin atender</span>
            )}
            {datos.resumen.con_pedido_en_camino > 0 && (
              <span className="text-amber-700">
                {formatNumber(datos.resumen.con_pedido_en_camino)} productos ya tienen pedido en
                camino; se descuenta de lo que hay que comprar
              </span>
            )}
            {datos.resumen.stock_negativo > 0 && (
              <span className="text-rose-600">
                {formatNumber(datos.resumen.stock_negativo)} productos con saldo negativo (kardex
                descuadrado); se cuentan como stock cero
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Filtrar por estado
            </span>
            <button
              type="button"
              onClick={() => setEstadoFiltro('todos')}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                estadoFiltro === 'todos'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todos
            </button>
            {ESTADOS_ORDENADOS.map((estado) => (
              <button
                key={estado}
                type="button"
                onClick={() => setEstadoFiltro(estado)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  estadoFiltro === estado
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {etiquetaEstado(estado)}
              </button>
            ))}
          </div>

          {itemsVisibles.length === 0 ? (
            <EmptyState
              title="Sin resultados"
              description="Ningún producto coincide con los filtros aplicados. Prueba a ampliar el rango de fechas o a desmarcar «Solo lo que hay que comprar»."
            />
          ) : (
            <ConsolidadoTable
              items={itemsVisibles}
              orden={orden}
              onOrden={setOrden}
              onVerDetalle={setCodigoDetalle}
              onVerHistorial={setCodigoHistorial}
              onVerSustento={setCodigoSustento}
              onVerProveedores={setItemProveedores}
            />
          )}
        </>
      )}

      <DetalleRequerimientosModal
        codigo={codigoDetalle}
        filtros={filtrosAplicados}
        onCerrar={() => setCodigoDetalle(null)}
      />

      <HistorialProductoModal
        codigo={codigoHistorial}
        desde={filtrosAplicados.desde}
        hasta={filtrosAplicados.hasta}
        onCerrar={() => setCodigoHistorial(null)}
      />

      <SustentoModal
        codigo={codigoSustento}
        desde={filtrosAplicados.desde}
        hasta={filtrosAplicados.hasta}
        base={filtrosAplicados.base}
        meses={filtrosAplicados.meses}
        onCerrar={() => setCodigoSustento(null)}
      />

      <ProveedoresModal
        codigo={itemProveedores?.codigo ?? null}
        desde={filtrosAplicados.desde}
        hasta={filtrosAplicados.hasta}
        cantidad={itemProveedores?.sugerido_comprar}
        onCerrar={() => setItemProveedores(null)}
      />
    </div>
  );
}
