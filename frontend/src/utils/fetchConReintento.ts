/**
 * La API interna de Requerimientos tiene latencia MUY variable (medido
 * directamente: la misma consulta tardó entre 2.5s y 40s según el momento) —
 * un solo pico de lentitud no debe tumbar toda una vista. Envuelve cualquier
 * función de fetch con reintentos automáticos antes de propagar el error.
 */
const MAX_INTENTOS_POR_DEFECTO = 3;
const ESPERA_ENTRE_REINTENTOS_MS = 2000;

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchConReintento<T>(fn: () => Promise<T>, maxIntentos = MAX_INTENTOS_POR_DEFECTO): Promise<T> {
  let ultimoError: unknown;
  for (let intento = 1; intento <= maxIntentos; intento += 1) {
    try {
      return await fn();
    } catch (err) {
      ultimoError = err;
      if (intento < maxIntentos) await esperar(ESPERA_ENTRE_REINTENTOS_MS);
    }
  }
  throw ultimoError;
}
