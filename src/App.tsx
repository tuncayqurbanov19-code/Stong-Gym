import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import {
  NavTab,
  Sidebar,
  MobileHeader,
  MobileDrawer,
  BottomNav,
} from './components/Navigation';
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
      ? 'bg-[#E32636] text-white border-red-400/50'
      : 'bg-[#171717] dark:bg-[#222222] text-white border-[#2E2E2E]';

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm w-full px-4 pointer-events-none">
      <div
        className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-[12px] border shadow-xl text-xs font-semibold ${styles}`}
      >
        {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
        {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
        {toast.type === 'info' && <Info className="w-4 h-4 shrink-0" />}
        <span className="flex-1">{toast.message}</span>
        <button
          type="button"
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

  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    return isAdmin ? 'dashboard' : 'pos';
  });
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Protect admin-only tabs if an employee is logged in
  useEffect(() => {
    if (!isAdmin) {
      const adminTabs: NavTab[] = ['dashboard', 'purchases', 'expenses', 'staff', 'admin'];
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
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-[#111111] text-[#171717] dark:text-white flex flex-col lg:flex-row antialiased transition-colors duration-150 overflow-x-hidden">
      <GlobalToast />

      {/* Desktop Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Mobile Drawer */}
      <MobileDrawer
        isOpen={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen bg-[#F5F5F5] dark:bg-[#111111] transition-colors duration-150">
        {/* Mobile Sticky Header */}
        <MobileHeader
          activeTab={activeTab}
          onOpenDrawer={() => setMobileDrawerOpen(true)}
        />

        {/* View Content Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto pb-24 lg:pb-8">
          <div className="max-w-[1440px] mx-auto">
            {activeTab === 'dashboard' && isAdmin && (
              <DashboardView onNavigate={(tab) => setActiveTab(tab as NavTab)} />
            )}
            {activeTab === 'pos' && (
              <PosSalesView onNavigateToDebts={() => setActiveTab('debts')} />
            )}
            {(activeTab === 'products' || activeTab === 'depo') && (
              <ProductsView initialSection={activeTab === 'depo' ? 'depo' : 'catalog'} />
            )}
            {activeTab === 'purchases' && isAdmin && <PurchasesView />}
            {(activeTab === 'debts' || activeTab === 'balances') && (
              <DebtsView initialTab={activeTab === 'balances' ? 'balances' : 'active_debtors'} />
            )}
            {activeTab === 'daily-report' && <DailyReportView />}
            {activeTab === 'expenses' && isAdmin && <ExpensesView />}
            {(activeTab === 'admin' || activeTab === 'staff') && isAdmin && (
              <AdminPanelView initialTab={activeTab === 'staff' ? 'users' : 'design'} />
            )}
          </div>
        </main>

        {/* Subtle Footer */}
        <footer className="hidden lg:flex items-center justify-between px-8 py-3 border-t border-[#E5E5E5] dark:border-[#262626] text-xs text-[#888888]">
          <Logo variant="compact" />
          <span>{settings.barName} · StrongBar İdarəetmə Sistemi</span>
        </footer>

        {/* Mobile Fixed Bottom Navigation Bar */}
        <BottomNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenDrawer={() => setMobileDrawerOpen(true)}
        />

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
