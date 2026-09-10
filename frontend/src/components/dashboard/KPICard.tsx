import {
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Gauge,
  Package,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Users,
  Database,
  type LucideIcon,
} from 'lucide-react';
import type { KPIDefinition } from '@/types/dashboard';

const ICONS: Record<KPIDefinition['icon'], LucideIcon> = {
  database: Database,
  'check-circle': CheckCircle2,
  'alert-triangle': AlertTriangle,
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  'dollar-sign': DollarSign,
  package: Package,
  users: Users,
  gauge: Gauge,
  'shopping-cart': ShoppingCart,
};

const ACCENT_CLASSES: Record<NonNullable<KPIDefinition['accent']>, string> = {
  brand: 'bg-brand-50 text-brand-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
  slate: 'bg-slate-100 text-slate-600',
};

export function KPICard({ kpi }: { kpi: KPIDefinition }) {
  const Icon = ICONS[kpi.icon];
  const accent = ACCENT_CLASSES[kpi.accent ?? 'slate'];

  return (
    <div className="card flex flex-col gap-3 p-4" title={kpi.helpText}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{kpi.label}</p>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accent}`}>
          <Icon size={16} strokeWidth={2} />
        </div>
      </div>
      <p className={`text-2xl font-semibold ${kpi.available ? 'text-slate-800' : 'text-slate-300'}`}>
        {kpi.available ? kpi.value : 'No disponible'}
      </p>
    </div>
  );
}
