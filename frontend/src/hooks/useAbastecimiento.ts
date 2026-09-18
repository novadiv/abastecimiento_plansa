/**
 * Estado del módulo de Abastecimiento.
 *
 * El consolidado es una consulta cara (el ERP agrega decenas de miles de
 * líneas del lado de FoxPro). Por eso se separan los filtros que el usuario
 * está editando de los que ya se enviaron: la consulta solo se dispara al
 * pulsar "Aplicar", no con cada tecla. El buscador de texto, en cambio, es
 * local y filtra al instante sobre lo ya descargado.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ErrorAbastecimiento,
  fetchCatalogos,
  fetchConsolidado,
} from '@/services/abastecimientoService';
import type {
  CatalogosAbastecimiento,
  EstadoAbastecimiento,
  FiltrosAbastecimiento,
  ItemConsolidado,
  RespuestaConsolidado,
} from '@/types/abastecimiento';

function aIsoFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

export function filtrosPorDefecto(): FiltrosAbastecimiento {
  const hoy = new Date();
  return {
    desde: `${hoy.getFullYear()}-01-01`,
    hasta: aIsoFecha(hoy),
    area: '',
    usuario: '',
    almacen: '',
    base: 'compras',
    meses: 2,
    soloPorComprar: true,
    incluirPendiente: false,
    comprador: '',
  };
}

export type OrdenTabla =
  | 'importe'
  | 'sugerido'
  | 'solicitado'
  | 'pendiente'
  | 'cobertura'
  | 'codigo';

export function useAbastecimiento() {
  const [filtros, setFiltros] = useState<FiltrosAbastecimiento>(filtrosPorDefecto);
  const [filtrosAplicados, setFiltrosAplicados] = useState<FiltrosAbastecimiento>(filtrosPorDefecto);
  const [datos, setDatos] = useState<RespuestaConsolidado | null>(null);
  const [catalogos, setCatalogos] = useState<CatalogosAbastecimiento | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtros locales, sin volver a consultar al servidor.
  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoAbastecimiento | 'todos'>('todos');
  const [orden, setOrden] = useState<OrdenTabla>('importe');

  useEffect(() => {
    let cancelado = false;
    fetchCatalogos()
      .then((resultado) => {
        if (!cancelado) setCatalogos(resultado);
      })
      .catch(() => {
        // Sin catálogos los desplegables quedan vacíos, pero la tabla
        // principal sigue funcionando: no se bloquea la pantalla por esto.
        if (!cancelado) setCatalogos(null);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);

    fetchConsolidado(filtrosAplicados)
      .then((resultado) => {
        if (!cancelado) setDatos(resultado);
      })
      .catch((err: unknown) => {
        if (cancelado) return;
        setError(
          err instanceof ErrorAbastecimiento
            ? err.message
            : 'No fue posible cargar el consolidado de requerimientos.',
        );
        setDatos(null);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [filtrosAplicados]);

  const aplicarFiltros = useCallback(() => {
    setFiltrosAplicados({ ...filtros });
  }, [filtros]);

  const restablecerFiltros = useCallback(() => {
    const limpios = filtrosPorDefecto();
    setFiltros(limpios);
    setFiltrosAplicados(limpios);
    setBusqueda('');
    setEstadoFiltro('todos');
  }, []);

  const actualizarFiltro = useCallback(
    <C extends keyof FiltrosAbastecimiento>(campo: C, valor: FiltrosAbastecimiento[C]) => {
      setFiltros((previos) => ({ ...previos, [campo]: valor }));
    },
    [],
  );

  const hayCambiosSinAplicar = useMemo(
    () => JSON.stringify(filtros) !== JSON.stringify(filtrosAplicados),
    [filtros, filtrosAplicados],
  );

  const itemsVisibles = useMemo(() => {
    if (!datos) return [];
    const texto = busqueda.trim().toLowerCase();

    const filtrados = datos.items.filter((item) => {
      if (estadoFiltro !== 'todos' && item.estado !== estadoFiltro) return false;
      if (!texto) return true;
      return (
        item.codigo.toLowerCase().includes(texto) ||
        item.descripcion.toLowerCase().includes(texto) ||
        item.familia.toLowerCase().includes(texto)
      );
    });

    return ordenar(filtrados, orden);
  }, [datos, busqueda, estadoFiltro, orden]);

  return {
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
  };
}

function ordenar(items: ItemConsolidado[], orden: OrdenTabla): ItemConsolidado[] {
  const copia = [...items];
  switch (orden) {
    case 'sugerido':
      return copia.sort((a, b) => b.sugerido_comprar - a.sugerido_comprar);
    case 'solicitado':
      return copia.sort((a, b) => b.solicitado - a.solicitado);
    case 'pendiente':
      return copia.sort((a, b) => b.pendiente - a.pendiente);
    case 'codigo':
      return copia.sort((a, b) => a.codigo.localeCompare(b.codigo));
    case 'cobertura':
      // Lo que antes se agota, primero. Sin ritmo conocido va al final.
      return copia.sort((a, b) => {
        const ca = a.cobertura_meses ?? Number.POSITIVE_INFINITY;
        const cb = b.cobertura_meses ?? Number.POSITIVE_INFINITY;
        return ca - cb;
      });
    case 'importe':
    default:
      return copia.sort((a, b) => b.importe_estimado - a.importe_estimado);
  }
}
