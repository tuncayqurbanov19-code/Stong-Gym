/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
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

function MainApp() {
  const { currentUser } = useApp();
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
    return <LoginView />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 dark:bg-black text-zinc-100 flex flex-col lg:flex-row antialiased">
      {/* Desktop Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen bg-zinc-950 dark:bg-black">
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
