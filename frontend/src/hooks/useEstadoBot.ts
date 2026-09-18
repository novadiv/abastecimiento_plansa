import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchEstadoBot } from '@/services/botService';
import type { EstadoBot } from '@/types/bot';

/**
 * El estado del bot, refrescado solo.
 *
 * Mientras hay una corrida en marcha se consulta cada 3 segundos, para que
 * la barra de progreso se mueva de verdad; en reposo, cada 30, que es más
 * que suficiente para ver llegar un envío nuevo. La diferencia importa: el
 * backend y el bot comparten el mismo SQLite, y machacarlo a consultas
 * mientras el bot escribe no le hace ningún favor a nadie.
 *
 * El ritmo vive en un `ref` y no en las dependencias del efecto a
 * propósito. Si dependiera del estado, cada refresco cambiaría el progreso,
 * el efecto se volvería a montar y lanzaría otro refresco de inmediato: un
 * bucle de consultas sin pausa durante toda la corrida, que es justo lo
 * contrario de lo que se busca.
 *
 * Con la pestaña en segundo plano no se consulta nada: no tiene sentido
 * preguntar por el progreso de algo que nadie está mirando.
 */

const PAUSA_CORRIENDO = 3_000;
const PAUSA_REPOSO = 30_000;

export function useEstadoBot(activo = true) {
  const [estado, setEstado] = useState<EstadoBot | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const temporizador = useRef<number | null>(null);
  const hayCorrida = useRef(false);
  const vivo = useRef(true);

  const refrescar = useCallback(async () => {
    try {
      const datos = await fetchEstadoBot();
      if (!vivo.current) return;
      hayCorrida.current = datos.ejecucion_viva != null;
      setEstado(datos);
      setError(null);
    } catch (err) {
      if (!vivo.current) return;
      setError(err instanceof Error ? err.message : 'No se pudo consultar el estado del bot.');
    } finally {
      if (vivo.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!activo) return;
    vivo.current = true;

    function programar() {
      if (temporizador.current !== null) window.clearTimeout(temporizador.current);
      // Con la pestaña oculta no se reprograma: el listener de visibilidad
      // retoma el ciclo cuando alguien vuelve a mirar.
      if (document.hidden || !vivo.current) return;
      temporizador.current = window.setTimeout(
        () => {
          void refrescar().then(programar);
        },
        hayCorrida.current ? PAUSA_CORRIENDO : PAUSA_REPOSO,
      );
    }

    void refrescar().then(programar);

    function alCambiarVisibilidad() {
      if (document.hidden) {
        if (temporizador.current !== null) window.clearTimeout(temporizador.current);
      } else {
        void refrescar().then(programar);
      }
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad);

    return () => {
      vivo.current = false;
      if (temporizador.current !== null) window.clearTimeout(temporizador.current);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    };
  }, [activo, refrescar]);

  /** Refresco manual, sin alterar el ciclo automático. */
  const refrescarAhora = useCallback(() => {
    void refrescar();
  }, [refrescar]);

  return { estado, cargando, error, refrescar: refrescarAhora };
}
