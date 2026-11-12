import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import { NavTab, Sidebar, MobileHeader, BottomNav } from './components/Navigation';
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';
import { PosSalesView } from './views/PosSalesView';
import { ProductsView } from './views/ProductsView';
import { PurchasesView } from './views/PurchasesView';
import { DebtsView } from './views/DebtsView';
import { DailyReportView } from './views/DailyReportView';
import { ExpensesView } from './views/ExpensesView';
import { AdminPanelView } from './views/AdminPanelView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { Logo } from './components/Logo';

function GlobalToast() {
  const { toast, dismissToast } = useApp();
  if (!toast) return null;

  const styles =
    toast.type === 'success'
      ? 'bg-emerald-600 text-white border-emerald-500'
      : toast.type === 'error'
      ? 'bg-red-600 text-white border-red-500'
      : 'bg-zinc-900 dark:bg-zinc-800 text-white border-zinc-700';

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm w-full px-4 pointer-events-none">
      <div
        className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-xl text-xs font-semibold ${styles}`}
      >
        {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
        {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
        {toast.type === 'info' && <Info className="w-4 h-4 shrink-0" />}
        <span className="flex-1">{toast.message}</span>
        <button
          onClick={dismissToast}
          aria-label="Bağla"
          className="p-0.5 rounded hover:bg-white/20 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function MainApp() {
  const { currentUser, settings } = useApp();
  const isAdmin = currentUser?.role === 'admin';

  // Default active tab based on role: Admin starts at dashboard, Employee starts at POS
  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    return isAdmin ? 'dashboard' : 'pos';
  });

  // Protect admin-only tabs if an employee is logged in
  useEffect(() => {
    if (!isAdmin) {
      const adminTabs: NavTab[] = ['dashboard', 'purchases', 'expenses', 'admin'];
      if (adminTabs.includes(activeTab)) {
        setActiveTab('pos');
      }
    }
  }, [isAdmin, activeTab]);

  if (!currentUser) {
    return (
      <>
        <GlobalToast />
        <LoginView />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 flex flex-col lg:flex-row antialiased transition-colors">
      <GlobalToast />

      {/* Desktop Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen bg-zinc-50 dark:bg-black transition-colors">
        {/* Mobile Sticky Header */}
        <MobileHeader activeTab={activeTab} />

        {/* View Content Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto pb-24 lg:pb-8">
          {activeTab === 'dashboard' && isAdmin && (
            <DashboardView onNavigate={(tab) => setActiveTab(tab as NavTab)} />
          )}
          {activeTab === 'pos' && (
            <PosSalesView onNavigateToDebts={() => setActiveTab('debts')} />
          )}
          {activeTab === 'products' && <ProductsView />}
          {activeTab === 'purchases' && isAdmin && <PurchasesView />}
          {activeTab === 'debts' && <DebtsView />}
          {activeTab === 'daily-report' && <DailyReportView />}
          {activeTab === 'expenses' && isAdmin && <ExpensesView />}
          {activeTab === 'admin' && isAdmin && <AdminPanelView />}
        </main>

        {/* Subtle Footer with dynamic Logo */}
        <footer className="hidden lg:flex items-center justify-between px-8 py-3 border-t border-zinc-200 dark:border-zinc-900 text-xs text-zinc-500 dark:text-zinc-500">
          <Logo variant="compact" />
          <span>{settings.barName} · İdarəetmə və Kassa Sistemi</span>
        </footer>

        {/* Mobile Fixed Bottom Navigation Bar */}
        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Global Offline Mode Indicator */}
        <OfflineIndicator />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}
