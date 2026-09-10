/** Paleta de colores compartida por todos los gráficos: sobria, corporativa y con contraste suficiente. */
export const CHART_COLORS = [
  '#3b64f5', // brand
  '#0ea5a3', // teal
  '#f59e0b', // amber
  '#64748b', // slate
  '#ef4444', // rose
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#0284c7', // sky
];

export function colorAt(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}
