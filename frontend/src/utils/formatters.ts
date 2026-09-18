/**
 * Funciones puras de formateo de valores para presentación en UI.
 * No contienen lógica de negocio ni acceden a datos externos.
 */

const NOT_AVAILABLE = 'No disponible';

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('es-PE', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatCurrency(
  value: number | null | undefined,
  currency: 'USD' | 'PEN' = 'USD',
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCompactCurrency(
  value: number | null | undefined,
  currency: 'USD' | 'PEN' = 'USD',
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${formatNumber(value, decimals)}%`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return NOT_AVAILABLE;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return NOT_AVAILABLE;
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/** Detecta una fecha sin hora: "2026-09-14". */
const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatDate(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';

  // `new Date("2026-09-14")` interpreta la cadena como medianoche UTC. Al
  // mostrarla en Perú (UTC-5) retrocede al día anterior, así que el usuario
  // filtraba "14/09" y leía "13 set." — parecía un error de datos y restaba
  // credibilidad justo donde se están sustentando cifras. Cuando la cadena
  // no lleva hora se construye la fecha en horario local, que es lo que el
  // usuario escribió. Las marcas de tiempo completas no se tocan: ahí el
  // desplazamiento horario sí es correcto.
  if (typeof value === 'string') {
    const partes = SOLO_FECHA.exec(value);
    if (partes) {
      const local = new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
      return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(local);
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(date);
}

export function truncateText(text: string, maxLength = 40): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function formatCellValue(value: string | number | boolean | null, type: 'numeric' | 'date' | string): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? formatNumber(value) : formatNumber(value, 2);
  }
  if (type === 'date') return formatDate(value);
  return value;
}
