/**
 * Tipos genéricos de presentación del dashboard (KPIs, gráficos, análisis,
 * filtros). Son independientes del origen de los datos — hoy los alimenta
 * la API de productos, pero cualquier componente que los consuma
 * (KPICard, Charts, Analysis) no sabe ni le importa de dónde vienen.
 */

export type KPIIcon =
  | 'database'
  | 'check-circle'
  | 'alert-triangle'
  | 'trending-up'
  | 'trending-down'
  | 'dollar-sign'
  | 'package'
  | 'users'
  | 'gauge'
  | 'shopping-cart';

export interface KPIDefinition {
  id: string;
  label: string;
  value: string;
  rawValue: number | null;
  available: boolean;
  icon: KPIIcon;
  helpText?: string;
  accent?: 'brand' | 'emerald' | 'amber' | 'rose' | 'slate';
}

export interface ChartDatum {
  name: string;
  [seriesKey: string]: string | number;
}

export interface ChartSeriesConfig {
  key: string;
  label: string;
}

export type ChartKind = 'bar' | 'line' | 'pie' | 'area';

export interface ChartConfig {
  id: string;
  kind: ChartKind;
  title: string;
  subtitle: string;
  data: ChartDatum[];
  series: ChartSeriesConfig[];
  nameKey: string;
  valueFormat?: 'number' | 'currency' | 'percent';
}

export interface AnalysisInsight {
  id: string;
  text: string;
  tone: 'neutral' | 'positive' | 'warning';
}

export interface AnalysisBlock {
  id: string;
  title: string;
  subtitle: string;
  rows: { label: string; value: string }[];
}

export type LoadStatus = 'idle' | 'loading' | 'success' | 'error';
