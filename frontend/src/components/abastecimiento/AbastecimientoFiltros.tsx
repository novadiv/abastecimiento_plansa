import { Filter, RotateCcw, Search } from 'lucide-react';
import type {
  BaseConsumo,
  CatalogosAbastecimiento,
  FiltrosAbastecimiento,
} from '@/types/abastecimiento';

interface Props {
  filtros: FiltrosAbastecimiento;
  catalogos: CatalogosAbastecimiento | null;
  hayCambiosSinAplicar: boolean;
  cargando: boolean;
  busqueda: string;
  onBusqueda: (valor: string) => void;
  onCambio: <C extends keyof FiltrosAbastecimiento>(
    campo: C,
    valor: FiltrosAbastecimiento[C],
  ) => void;
  onAplicar: () => void;
  onRestablecer: () => void;
}

/** Atajos de rango habituales: entrar, pulsar uno y ver qué falta. */
function rangosRapidos(): { etiqueta: string; desde: string; hasta: string }[] {
  const hoy = new Date();
  const iso = (f: Date) => f.toISOString().slice(0, 10);
  const haceDias = (dias: number) => {
    const f = new Date(hoy);
    f.setDate(f.getDate() - dias);
    return iso(f);
  };
  return [
    { etiqueta: 'Año en curso', desde: `${hoy.getFullYear()}-01-01`, hasta: iso(hoy) },
    { etiqueta: 'Últimos 90 días', desde: haceDias(90), hasta: iso(hoy) },
    { etiqueta: 'Últimos 30 días', desde: haceDias(30), hasta: iso(hoy) },
    {
      etiqueta: 'Mes en curso',
      desde: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`,
      hasta: iso(hoy),
    },
  ];
}

export function AbastecimientoFiltros({
  filtros,
  catalogos,
  hayCambiosSinAplicar,
  cargando,
  busqueda,
  onBusqueda,
  onCambio,
  onAplicar,
  onRestablecer,
}: Props) {
  const rangos = rangosRapidos();
  const rangoActivo = rangos.find((r) => r.desde === filtros.desde && r.hasta === filtros.hasta);

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {rangos.map((rango) => (
          <button
            key={rango.etiqueta}
            type="button"
            onClick={() => {
              onCambio('desde', rango.desde);
              onCambio('hasta', rango.hasta);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              rangoActivo?.etiqueta === rango.etiqueta
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {rango.etiqueta}
          </button>
        ))}
      </div>

      {/* El reparto de códigos entre compradores no existe en el ERP: los tres
          ven la misma bandeja. Se deduce de quién emitió cada orden de compra,
          y por eso este filtro va primero y destacado: es el que convierte una
          lista de 4.900 productos en "lo mío". */}
      <div className="mb-3 rounded-lg border border-brand-200 bg-brand-50/60 p-3">
        <label className="label-text !mb-1 !text-brand-800" htmlFor="filtro-comprador">
          Ver los códigos de
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            id="filtro-comprador"
            className="input !w-auto min-w-[220px]"
            value={filtros.comprador}
            onChange={(e) => onCambio('comprador', e.target.value)}
          >
            <option value="">Todos los compradores</option>
            {catalogos?.compradores.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <p className="text-[11px] leading-tight text-brand-900/70">
            El ERP no sabe a quién va dirigido cada requerimiento. El reparto se
            reconstruye a partir de quién emitió la orden de compra de cada código.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label-text" htmlFor="filtro-desde">
            Desde
          </label>
          <input
            id="filtro-desde"
            type="date"
            className="input"
            value={filtros.desde}
            max={filtros.hasta}
            onChange={(e) => onCambio('desde', e.target.value)}
          />
        </div>

        <div>
          <label className="label-text" htmlFor="filtro-hasta">
            Hasta
          </label>
          <input
            id="filtro-hasta"
            type="date"
            className="input"
            value={filtros.hasta}
            min={filtros.desde}
            onChange={(e) => onCambio('hasta', e.target.value)}
          />
        </div>

        <div>
          <label className="label-text" htmlFor="filtro-area">
            Área solicitante
          </label>
          <select
            id="filtro-area"
            className="input"
            value={filtros.area}
            onChange={(e) => onCambio('area', e.target.value)}
          >
            <option value="">Todas las áreas</option>
            {catalogos?.areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label-text" htmlFor="filtro-usuario">
            Usuario solicitante
          </label>
          <select
            id="filtro-usuario"
            className="input"
            value={filtros.usuario}
            onChange={(e) => onCambio('usuario', e.target.value)}
          >
            <option value="">Todos los usuarios</option>
            {catalogos?.usuarios.map((usuario) => (
              <option key={usuario.id} value={usuario.id}>
                {usuario.id}
                {usuario.nombre && usuario.nombre !== usuario.id ? ` — ${usuario.nombre}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label-text" htmlFor="filtro-almacen">
            Almacén
          </label>
          <select
            id="filtro-almacen"
            className="input"
            value={filtros.almacen}
            onChange={(e) => onCambio('almacen', e.target.value)}
          >
            <option value="">Todos los almacenes</option>
            {catalogos?.almacenes.map((almacen) => (
              <option key={almacen.id} value={almacen.id}>
                {almacen.id} — {almacen.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label-text" htmlFor="filtro-base">
            Base de cálculo del ritmo
          </label>
          <select
            id="filtro-base"
            className="input"
            value={filtros.base}
            onChange={(e) => onCambio('base', e.target.value as BaseConsumo)}
          >
            <option value="compras">Compras reales (ingresos 011)</option>
            <option value="consumo">Consumo de almacén (salidas 009)</option>
            <option value="requerimientos">Demanda solicitada (req. 058)</option>
            <option value="ordenes">Órdenes de compra a proveedor</option>
          </select>
          <p className="mt-1 text-[11px] leading-tight text-slate-400">
            Cambia el histórico con el que se proyecta el consumo futuro.
          </p>
        </div>

        <div>
          <label className="label-text" htmlFor="filtro-meses">
            Cobertura objetivo (meses)
          </label>
          <input
            id="filtro-meses"
            type="number"
            className="input"
            min={0.5}
            max={24}
            step={0.5}
            value={filtros.meses}
            onChange={(e) => onCambio('meses', Number(e.target.value) || 2)}
          />
          <p className="mt-1 text-[11px] leading-tight text-slate-400">
            Para cuántos meses quieres quedar abastecido.
          </p>
        </div>

        <div>
          <label className="label-text" htmlFor="filtro-busqueda">
            Buscar producto
          </label>
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              id="filtro-busqueda"
              type="search"
              className="input pl-8"
              placeholder="Código o descripción"
              value={busqueda}
              onChange={(e) => onBusqueda(e.target.value)}
            />
          </div>
          <p className="mt-1 text-[11px] leading-tight text-slate-400">
            Filtra al instante lo ya cargado.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
              checked={filtros.soloPorComprar}
              onChange={(e) => onCambio('soloPorComprar', e.target.checked)}
            />
            Solo lo que hay que comprar
          </label>

          <label
            className="flex cursor-pointer items-center gap-2 text-sm text-slate-600"
            title="Suma al pedido lo solicitado que aún no se ha entregado, además del consumo previsto."
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
              checked={filtros.incluirPendiente}
              onChange={(e) => onCambio('incluirPendiente', e.target.checked)}
            />
            Cubrir además el pendiente sin atender
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={onRestablecer} className="btn-secondary" disabled={cargando}>
            <RotateCcw size={14} /> Restablecer
          </button>
          <button
            type="button"
            onClick={onAplicar}
            className="btn-primary"
            disabled={cargando || !hayCambiosSinAplicar}
          >
            <Filter size={14} />
            {cargando ? 'Consultando…' : hayCambiosSinAplicar ? 'Aplicar filtros' : 'Filtros aplicados'}
          </button>
        </div>
      </div>

      {hayCambiosSinAplicar && !cargando && (
        <p className="mt-2 text-xs text-amber-600">
          Has cambiado los filtros. Pulsa «Aplicar filtros» para volver a consultar el ERP.
        </p>
      )}
    </div>
  );
}
