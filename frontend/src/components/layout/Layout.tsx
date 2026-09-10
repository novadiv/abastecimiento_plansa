import { useState, type ReactNode } from 'react';
import type { Route } from '@/hooks/useHashRoute';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface LayoutProps {
  route: Route;
  onNavigate: (route: Route) => void;
  children: ReactNode;
}

export function Layout({ route, onNavigate, children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar currentRoute={route} onNavigate={onNavigate} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-h-screen flex-1 flex-col">
        <Header title={route} onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
