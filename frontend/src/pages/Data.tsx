import { ProductosFilters } from '@/components/dashboard/ProductosFilters';
import { ProductosTable } from '@/components/dashboard/ProductosTable';

export function Data() {
  return (
    <div className="space-y-4">
      <ProductosFilters />
      <ProductosTable />
    </div>
  );
}
