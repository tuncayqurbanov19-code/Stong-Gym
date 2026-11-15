import React, { useState } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Warehouse,
  ArrowDownLeft,
  Wallet,
  BookOpen,
  FileSpreadsheet,
  DollarSign,
  Users,
  Settings as SettingsIcon,
  LogOut,
  Sun,
  Moon,
  BellRing,
  Database,
  Menu,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PWAInstallButton } from './PWAInstallButton';
import { SupabaseSyncModal } from './SupabaseSyncModal';
import { Logo } from './Logo';

export type NavTab =
  | 'dashboard'
  | 'pos'
  | 'products'
  | 'depo'
  | 'purchases'
  | 'balances'
  | 'debts'
  | 'daily-report'
  | 'expenses'
  | 'staff'
  | 'admin';

interface NavigationProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
}

interface NavGroup {
  title: string;
  items: {
    id: NavTab;
    label: string;
    icon: React.ReactNode;
    adminOnly?: boolean;
  }[];
}

function useNavGroups(): NavGroup[] {
  return [
    {
      title: 'Əsas',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: <LayoutDashboard className="w-[18px] h-[18px]" />,
          adminOnly: true,
        },
        {
          id: 'pos',
          label: 'Satışlar',
          icon: <ShoppingCart className="w-[18px] h-[18px]" />,
        },
        {
          id: 'daily-report',
          label: 'Hesabatlar',
          icon: <FileSpreadsheet className="w-[18px] h-[18px]" />,
        },
      ],
    },
    {
      title: 'Anbar & Məhsul',
      items: [
        {
          id: 'products',
          label: 'Məhsullar',
          icon: <Package className="w-[18px] h-[18px]" />,
        },
        {
          id: 'depo',
          label: 'Depo',
          icon: <Warehouse className="w-[18px] h-[18px]" />,
        },
        {
          id: 'purchases',
          label: 'Mal Qəbulu',
          icon: <ArrowDownLeft className="w-[18px] h-[18px]" />,
          adminOnly: true,
        },
      ],
    },
    {
      title: 'Müştəri & Maliyyə',
      items: [
        {
          id: 'balances',
          label: 'Müştərilər / Balans',
          icon: <Wallet className="w-[18px] h-[18px]" />,
        },
        {
          id: 'debts',
          label: 'Borclar',
          icon: <BookOpen className="w-[18px] h-[18px]" />,
        },
        {
          id: 'expenses',
          label: 'Xərclər',
          icon: <DollarSign className="w-[18px] h-[18px]" />,
          adminOnly: true,
        },
      ],
    },
    {
      title: 'Sistem',
      items: [
        {
          id: 'staff',
          label: 'İşçilər',
          icon: <Users className="w-[18px] h-[18px]" />,
          adminOnly: true,
        },
        {
          id: 'admin',
          label: 'Tənzimləmələr',
          icon: <SettingsIcon className="w-[18px] h-[18px]" />,
          adminOnly: true,
        },
      ],
    },
  ];
}

const TAB_TITLES: Record<NavTab, string> = {
  dashboard: 'Dashboard',
  pos: 'Satışlar (Kassa / POS)',
  products: 'Məhsullar',
  depo: 'Depo İdarəetməsi',
  purchases: 'Mal Qəbulu',
  balances: 'Müştərilər & Balanslar',
  debts: 'Borclar',
  'daily-report': 'Hesabatlar',
  expenses: 'Xərclər',
  staff: 'İşçilər',
  admin: 'Tənzimləmələr',
};

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
  const primaryColor = settings.primaryColor || '#E32636';
  const navGroups = useNavGroups();

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-white dark:bg-[#171717] text-[#171717] dark:text-white border-r border-[#E5E5E5] dark:border-[#262626] shrink-0 select-none transition-colors duration-150">
      {/* Brand Header */}
      <div className="px-5 py-4 border-b border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between">
        <Logo variant="lockup" subtitle="StrongBar SaaS POS" />
      </div>

      {/* Nav Groups */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => !item.adminOnly || isAdmin);
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.title} className="space-y-1">
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#888888]">
                {group.title}
              </div>
              {visibleItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    style={isActive ? { backgroundColor: primaryColor } : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] transition-all duration-150 text-left whitespace-nowrap ${
                      isActive
                        ? 'text-white font-semibold shadow-xs'
                        : 'text-[#525252] dark:text-[#A3A3A3] font-medium hover:text-[#171717] dark:hover:text-white hover:bg-[#F5F5F5] dark:hover:bg-[#222222]'
                    }`}
                  >
                    <span className={isActive ? 'text-white' : 'text-[#888888]'}>
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Compact Utility & User Footer */}
      <div className="p-3 border-t border-[#E5E5E5] dark:border-[#262626] space-y-2">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setIsSupabaseModalOpen(true)}
            className={`px-2.5 py-1.5 rounded-[10px] text-[11px] font-medium flex items-center justify-between border transition-colors ${
              isSupabaseConnected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                : 'bg-[#F5F5F5] dark:bg-[#222222] border-[#E5E5E5] dark:border-[#2E2E2E] text-[#888888] hover:text-[#171717] dark:hover:text-white'
            }`}
            title="Supabase Sinxronizasiya"
          >
            <span className="inline-flex items-center gap-1 truncate">
              <Database className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Baza</span>
            </span>
            <span className="font-semibold">{isSupabaseConnected ? 'Canlı' : 'Lokal'}</span>
          </button>

          {isAdmin && settings.enablePushNotifications ? (
            <button
              type="button"
              onClick={() => requestPushPermission()}
              className={`px-2.5 py-1.5 rounded-[10px] text-[11px] font-medium flex items-center justify-between border transition-colors ${
                notificationPermission === 'granted'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                  : 'bg-[#F5F5F5] dark:bg-[#222222] border-[#E5E5E5] dark:border-[#2E2E2E] text-[#888888] hover:text-[#171717] dark:hover:text-white'
              }`}
              title="Bildiriş icazəsi"
            >
              <span className="inline-flex items-center gap-1 truncate">
                <BellRing className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Xəbər</span>
              </span>
              <span className="font-semibold">
                {notificationPermission === 'granted' ? 'Aktiv' : 'Aç'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleTheme}
              className="px-2.5 py-1.5 rounded-[10px] text-[11px] font-medium flex items-center justify-between border bg-[#F5F5F5] dark:bg-[#222222] border-[#E5E5E5] dark:border-[#2E2E2E] text-[#171717] dark:text-zinc-300 transition-colors"
            >
              <span>Tema</span>
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-[#888888]" />
              )}
            </button>
          )}
        </div>

        <PWAInstallButton variant="full" />

        <div className="flex items-center justify-between px-3 py-2 bg-[#F5F5F5] dark:bg-[#222222] rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E]">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div
              style={isAdmin ? { backgroundColor: `${primaryColor}1A`, color: primaryColor, borderColor: `${primaryColor}40` } : undefined}
              className={`w-8 h-8 rounded-[8px] flex items-center justify-center text-xs font-bold shrink-0 border ${
                isAdmin
                  ? ''
                  : 'bg-white dark:bg-[#171717] border-[#E5E5E5] dark:border-[#2E2E2E] text-[#171717] dark:text-zinc-300'
              }`}
            >
              {currentUser?.name.charAt(0) || 'U'}
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-[#171717] dark:text-white truncate">
                {currentUser?.name}
              </p>
              <p
                style={isAdmin ? { color: primaryColor } : undefined}
                className="text-[10px] uppercase font-semibold tracking-wider text-[#888888]"
              >
                {isAdmin ? 'Administrator' : 'İşçi'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Rejimi dəyiş"
            className="p-1.5 text-[#888888] hover:text-[#171717] dark:hover:text-white rounded-[8px] hover:bg-white dark:hover:bg-[#171717] transition-colors"
            title={theme === 'dark' ? 'İşıqlı rejim' : 'Qaranlıq rejim'}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-[#525252]" />
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-[#E32636] hover:bg-[#E32636]/10 rounded-[10px] transition-colors whitespace-nowrap"
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
  onOpenDrawer: () => void;
}> = ({ activeTab, onOpenDrawer }) => {
  const { currentUser, settings, theme, toggleTheme, logout, isSupabaseConnected } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);

  return (
    <>
      <header className="lg:hidden sticky top-0 z-30 bg-white/95 dark:bg-[#171717]/95 backdrop-blur-md border-b border-[#E5E5E5] dark:border-[#262626] px-3 sm:px-4 h-14 flex items-center justify-between text-[#171717] dark:text-white transition-colors">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onOpenDrawer}
            aria-label="Menyunu aç"
            className="w-9 h-9 rounded-[10px] border border-[#E5E5E5] dark:border-[#262626] bg-[#F5F5F5] dark:bg-[#222222] flex items-center justify-center text-[#171717] dark:text-white shrink-0"
          >
            <Menu className="w-4 h-4" />
          </button>
          <Logo variant="icon" sizeOverride="sm" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-[#171717] dark:text-white leading-tight truncate">
              {TAB_TITLES[activeTab]}
            </h2>
            <p className="text-[10px] text-[#888888] truncate">
              {settings.barName} ·{' '}
              <span style={{ color: settings.primaryColor || '#E32636' }} className="font-semibold">
                {isAdmin ? 'Admin' : 'İşçi'}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsSupabaseModalOpen(true)}
            className={`w-9 h-9 rounded-[10px] border text-xs flex items-center justify-center ${
              isSupabaseConnected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                : 'bg-[#F5F5F5] dark:bg-[#222222] border-[#E5E5E5] dark:border-[#262626] text-[#888888]'
            }`}
            title="Supabase Sinxronizasiya"
          >
            <Database className="w-4 h-4" />
          </button>

          <PWAInstallButton variant="compact" />

          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Rejim"
            className="w-9 h-9 rounded-[10px] border border-[#E5E5E5] dark:border-[#262626] bg-[#F5F5F5] dark:bg-[#222222] flex items-center justify-center text-[#171717] dark:text-zinc-300"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-[#525252]" />
            )}
          </button>

          <button
            type="button"
            onClick={logout}
            aria-label="Çıxış"
            className="w-9 h-9 rounded-[10px] border border-[#E5E5E5] dark:border-[#262626] bg-[#F5F5F5] dark:bg-[#222222] flex items-center justify-center text-[#E32636]"
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

export const MobileDrawer: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
}> = ({ isOpen, onClose, activeTab, setActiveTab }) => {
  const { currentUser, logout, settings } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const primaryColor = settings.primaryColor || '#E32636';
  const navGroups = useNavGroups();

  if (!isOpen) return null;

  return (
    <div className="lg:hidden fixed inset-0 z-50 flex">
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-xs"
        onClick={onClose}
      />
      <div className="relative z-10 w-72 max-w-[85vw] bg-white dark:bg-[#171717] border-r border-[#E5E5E5] dark:border-[#262626] flex flex-col h-full shadow-2xl">
        <div className="px-4 py-4 border-b border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between">
          <Logo variant="lockup" subtitle="StrongBar Menyu" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Bağla"
            className="w-9 h-9 rounded-[10px] bg-[#F5F5F5] dark:bg-[#222222] flex items-center justify-center text-[#888888] hover:text-[#171717] dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter((item) => !item.adminOnly || isAdmin);
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.title} className="space-y-1">
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#888888]">
                  {group.title}
                </div>
                {visibleItems.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        onClose();
                      }}
                      style={isActive ? { backgroundColor: primaryColor } : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] transition-all text-left min-h-[44px] ${
                        isActive
                          ? 'text-white font-semibold'
                          : 'text-[#525252] dark:text-[#A3A3A3] hover:bg-[#F5F5F5] dark:hover:bg-[#222222]'
                      }`}
                    >
                      <span className={isActive ? 'text-white' : 'text-[#888888]'}>
                        {item.icon}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[#E5E5E5] dark:border-[#262626] space-y-2">
          <PWAInstallButton variant="full" />
          <button
            type="button"
            onClick={() => {
              onClose();
              logout();
            }}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-[#E32636] bg-[#E32636]/10 rounded-[10px]"
          >
            <LogOut className="w-4 h-4" />
            <span>Sistemdən Çıxış</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const BottomNav: React.FC<NavigationProps & { onOpenDrawer?: () => void }> = ({
  activeTab,
  setActiveTab,
  onOpenDrawer,
}) => {
  const { currentUser, settings } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const primaryColor = settings.primaryColor || '#E32636';

  const items = isAdmin
    ? [
        { id: 'dashboard' as NavTab, label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
        { id: 'pos' as NavTab, label: 'Satış', icon: <ShoppingCart className="w-5 h-5" /> },
        { id: 'depo' as NavTab, label: 'Depo', icon: <Warehouse className="w-5 h-5" /> },
        { id: 'debts' as NavTab, label: 'Borclar', icon: <BookOpen className="w-5 h-5" /> },
      ]
    : [
        { id: 'pos' as NavTab, label: 'Satış', icon: <ShoppingCart className="w-5 h-5" /> },
        { id: 'products' as NavTab, label: 'Məhsul', icon: <Package className="w-5 h-5" /> },
        { id: 'debts' as NavTab, label: 'Borclar', icon: <BookOpen className="w-5 h-5" /> },
        { id: 'daily-report' as NavTab, label: 'Hesabat', icon: <FileSpreadsheet className="w-5 h-5" /> },
      ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#171717]/95 backdrop-blur-md border-t border-[#E5E5E5] dark:border-[#262626] pb-safe shadow-lg">
      <div className="grid grid-cols-5 h-[60px] items-center px-1">
        {items.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              style={isActive ? { color: primaryColor } : undefined}
              className={`flex flex-col items-center justify-center min-h-[44px] py-1 transition-colors ${
                isActive
                  ? 'font-semibold'
                  : 'text-[#888888] hover:text-[#171717] dark:hover:text-white'
              }`}
            >
              <div>{item.icon}</div>
              <span className="text-[10px] font-medium tracking-tight mt-0.5 truncate max-w-[64px]">
                {item.label}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenDrawer}
          className="flex flex-col items-center justify-center min-h-[44px] py-1 text-[#888888] hover:text-[#171717] dark:hover:text-white transition-colors"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium tracking-tight mt-0.5 truncate max-w-[64px]">
            Menyu
          </span>
        </button>
      </div>
    </nav>
  );
};
