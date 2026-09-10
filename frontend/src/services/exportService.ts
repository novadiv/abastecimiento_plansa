import type { Producto } from '@/types/producto';

/**
 * Exportación de los productos actualmente visualizados (ya filtrados/paginados)
 * a CSV. Implementado sin dependencias externas — la librería `xlsx` fue
 * retirada del proyecto por vulnerabilidades conocidas sin parche (ver README).
 */

export interface ExportColumn {
  key: keyof Producto | string;
  label: string;
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}


export function exportToCSV(rows: Producto[], columns: ExportColumn[], fileName = 'productos.csv'): void {
  const header = columns.map((c) => escapeCsvValue(c.label)).join(';');
  const lines = rows.map((row) => columns.map((c) => escapeCsvValue(row[c.key as string])).join(';'));
  const csv = [header, ...lines].join('\r\n');


  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
