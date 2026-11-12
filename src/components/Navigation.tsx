import React, { useState } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  ArrowDownLeft,
  BookOpen,
  DollarSign,
  Settings as SettingsIcon,
  LogOut,
  Sun,
  Moon,
  FileSpreadsheet,
  BellRing,
  Database,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PWAInstallButton } from './PWAInstallButton';
import { SupabaseSyncModal } from './SupabaseSyncModal';
import { Logo } from './Logo';

export type NavTab =
  | 'dashboard'
  | 'pos'
  | 'products'
  | 'purchases'
  | 'debts'
  | 'daily-report'
  | 'expenses'
  | 'admin';

interface NavigationProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
}

export const Sidebar: React.FC<NavigationProps> = ({ activeTab, setActiveTab }) => {
  const {
    currentUser,
    logout,
    theme,
    toggleTheme,
    settings,
    notificationPermission,
    requestPushPermission,
    isSupabaseConnected,
  } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);
  const primaryColor = settings.primaryColor || '#dc2626';

  const navItems: { id: NavTab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    {
      id: 'dashboard',
      label: 'Xülasə (Dashboard)',
      icon: <LayoutDashboard className="w-5 h-5" />,
      adminOnly: true,
    },
    {
      id: 'pos',
      label: 'Satış (Kassa / POS)',
      icon: <ShoppingCart className="w-5 h-5" />,
    },
    {
      id: 'products',
      label: 'Məhsullar və Depo',
      icon: <Package className="w-5 h-5" />,
    },
    {
      id: 'purchases',
      label: 'Mal Qəbulu',
      icon: <ArrowDownLeft className="w-5 h-5" />,
      adminOnly: true,
    },
    {
      id: 'debts',
      label: 'Borclar',
      icon: <BookOpen className="w-5 h-5" />,
    },
    {
      id: 'daily-report',
      label: 'Gündəlik Hesabat',
      icon: <FileSpreadsheet className="w-5 h-5" />,
    },
    {
      id: 'expenses',
      label: 'Xərclər',
      icon: <DollarSign className="w-5 h-5" />,
      adminOnly: true,
    },
    {
      id: 'admin',
      label: 'Admin Paneli',
      icon: <SettingsIcon className="w-5 h-5" />,
      adminOnly: true,
    },
  ];

  const visibleItems = navItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 border-r border-zinc-200 dark:border-zinc-800/80 shrink-0 select-none transition-colors">
      {/* Brand Header */}
      <div className="p-5 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between">
        <Logo variant="lockup" subtitle="İdarəetmə & POS" />
      </div>

      {/* Push Notification Quick Status Bar */}
      {isAdmin && settings.enablePushNotifications && (
        <div className="px-3 pt-3">
          <button
            onClick={() => requestPushPermission()}
            className={`w-full py-1.5 px-3 rounded-xl text-[11px] font-semibold flex items-center justify-between transition-colors border ${
              notificationPermission === 'granted'
                ? 'bg-emerald-50 dark:bg-zinc-900 border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400'
                : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50'
            }`}
            title="Qalıq minimum həddə çatanda brauzer bildirişi"
          >
            <div className="flex items-center gap-1.5">
              <BellRing className="w-3.5 h-3.5 shrink-0" />
              <span>Bildirişlər:</span>
            </div>
            <span className="font-bold">
              {notificationPermission === 'granted' ? 'Aktiv' : 'İcazə Ver'}
            </span>
          </button>
        </div>
      )}

      {/* Supabase Cloud Sync Bar */}
      <div className="px-3 pt-2">
        <button
          onClick={() => setIsSupabaseModalOpen(true)}
          className={`w-full py-1.5 px-3 rounded-xl text-[11px] font-semibold flex items-center justify-between transition-colors border ${
            isSupabaseConnected
              ? 'bg-emerald-50 dark:bg-zinc-900 border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400'
              : 'bg-zinc-100 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
          }`}
          title="Supabase Vahid Baza və Real-vaxt Sinxronizasiya Parametrləri"
        >
          <div className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>Supabase:</span>
          </div>
          <span className="font-bold">
            {isSupabaseConnected ? 'Canlı' : 'Quraşdır'}
          </span>
        </button>
      </div>

      {/* Nav List */}
      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
        {visibleItems.map(item => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={isActive ? { backgroundColor: primaryColor } : undefined}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all text-left ${
                isActive
                  ? 'text-white font-bold shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900'
              }`}
            >
              <span className={isActive ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}>
                {item.icon}
              </span>
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom User & Theme Strip */}
      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800/80 space-y-2">
        <PWAInstallButton variant="full" />

        <div className="flex items-center justify-between px-3 py-2 bg-zinc-100 dark:bg-zinc-900/80 rounded-xl border border-zinc-200 dark:border-zinc-800/60">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div
              style={isAdmin ? { color: primaryColor, borderColor: `${primaryColor}55` } : undefined}
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                isAdmin
                  ? 'bg-red-50 dark:bg-red-950/60 border'
                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
              }`}
            >
              {currentUser?.name.charAt(0) || 'U'}
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                {currentUser?.name}
              </p>
              <p
                style={isAdmin ? { color: primaryColor } : undefined}
                className="text-[10px] uppercase font-semibold tracking-wider text-zinc-500 dark:text-zinc-400"
              >
                {isAdmin ? 'Admin' : 'İşçi'}
              </p>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            aria-label="Rejimi dəyiş"
            className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            title={theme === 'dark' ? 'İşıqlı rejim' : 'Qaranlıq rejim'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-zinc-600" />}
          </button>
        </div>

        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-900/50"
        >
          <LogOut className="w-4 h-4" />
          <span>Sistemdən Çıxış</span>
        </button>
      </div>

      <SupabaseSyncModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
      />
    </aside>
  );
};

export const MobileHeader: React.FC<{
  activeTab: NavTab;
}> = ({ activeTab }) => {
  const { currentUser, settings, theme, toggleTheme, logout, isSupabaseConnected } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);

  const tabTitles: Record<NavTab, string> = {
    dashboard: 'Xülasə',
    pos: 'Kassa (POS)',
    products: 'Məhsullar & Depo',
    purchases: 'Mal Qəbulu',
    debts: 'Borclar',
    'daily-report': 'Gündəlik Hesabat',
    expenses: 'Xərclər',
    admin: 'Admin Paneli',
  };

  return (
    <>
      <header className="lg:hidden sticky top-0 z-30 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800/80 px-4 h-14 flex items-center justify-between text-zinc-900 dark:text-white transition-colors">
        <div className="flex items-center gap-2.5 min-w-0">
          <Logo variant="icon" sizeOverride="sm" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white leading-tight truncate">
              {tabTitles[activeTab]}
            </h2>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
              {settings.barName} ·{' '}
              <span style={{ color: settings.primaryColor || '#dc2626' }} className="font-semibold">
                {isAdmin ? 'Admin' : 'İşçi'}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setIsSupabaseModalOpen(true)}
            className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 ${
              isSupabaseConnected
                ? 'bg-emerald-50 dark:bg-zinc-900 border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400'
                : 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400'
            }`}
            title="Supabase Canlı Sinxronizasiya"
          >
            <Database className="w-3.5 h-3.5" />
          </button>

          <PWAInstallButton variant="compact" />
          <button
            onClick={toggleTheme}
            aria-label="Rejim"
            className="p-2 text-zinc-600 dark:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-zinc-600" />}
          </button>
          <button
            onClick={logout}
            aria-label="Çıxış"
            className="p-2 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40"
            title="Çıxış"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <SupabaseSyncModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
      />
    </>
  );
};

export const BottomNav: React.FC<NavigationProps> = ({ activeTab, setActiveTab }) => {
  const { currentUser, settings } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const primaryColor = settings.primaryColor || '#dc2626';

  const items = isAdmin
    ? [
        { id: 'dashboard' as NavTab, label: 'Xülasə', icon: <LayoutDashboard className="w-5 h-5" /> },
        { id: 'pos' as NavTab, label: 'POS', icon: <ShoppingCart className="w-5 h-5" /> },
        { id: 'products' as NavTab, label: 'Depo', icon: <Package className="w-5 h-5" /> },
        { id: 'debts' as NavTab, label: 'Borclar', icon: <BookOpen className="w-5 h-5" /> },
        { id: 'admin' as NavTab, label: 'Admin', icon: <SettingsIcon className="w-5 h-5" /> },
      ]
    : [
        { id: 'pos' as NavTab, label: 'Kassa (POS)', icon: <ShoppingCart className="w-5 h-5" /> },
        { id: 'debts' as NavTab, label: 'Borclar', icon: <BookOpen className="w-5 h-5" /> },
        { id: 'daily-report' as NavTab, label: 'Hesabat', icon: <FileSpreadsheet className="w-5 h-5" /> },
        { id: 'products' as NavTab, label: 'Məhsullar', icon: <Package className="w-5 h-5" /> },
      ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 pb-safe shadow-xl">
      <div className={`grid ${isAdmin ? 'grid-cols-5' : 'grid-cols-4'} h-14 items-center px-1`}>
        {items.map(item => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={isActive ? { color: primaryColor } : undefined}
              className={`flex flex-col items-center justify-center py-1 transition-all ${
                isActive
                  ? 'font-bold scale-105'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <div>{item.icon}</div>
              <span className="text-[10px] font-medium tracking-tight mt-0.5 truncate max-w-[64px]">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
