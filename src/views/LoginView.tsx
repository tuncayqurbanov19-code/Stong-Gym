import React, { useState } from 'react';
import { Lock, User, ArrowRight, ShieldCheck, UserCheck, AlertCircle, Sun, Moon } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { Logo } from '../components/Logo';

export const LoginView: React.FC = () => {
  const { login, settings, theme, toggleTheme } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const primaryColor = settings.primaryColor || '#E32636';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim()) {
      setError('İstifadəçi adını daxil edin.');
      return;
    }
    if (!password) {
      setError('Şifrəni daxil edin.');
      return;
    }

    const res = login(username, password);
    if (!res.success) {
      setError(res.error || 'Giriş uğursuz oldu.');
    }
  };

  const handleQuickLogin = (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    const res = login(user, pass);
    if (!res.success) {
      setError(res.error || 'Giriş uğursuz oldu.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#F5F5F5] dark:bg-[#111111] text-[#171717] dark:text-white transition-colors duration-150 relative">
      {/* Subtle red top accent bar */}
      <div
        style={{ backgroundColor: primaryColor }}
        className="fixed top-0 left-0 right-0 h-1 z-20"
      />

      {/* Theme Toggle on Login */}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Rejimi dəyiş"
        className="absolute top-4 right-4 p-2.5 rounded-[10px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] text-[#525252] dark:text-zinc-300 shadow-xs hover:bg-[#FAFAFA] dark:hover:bg-[#222222] transition-colors"
      >
        {theme === 'dark' ? (
          <Sun className="w-4 h-4 text-amber-400" />
        ) : (
          <Moon className="w-4 h-4 text-[#171717]" />
        )}
      </button>

      <div className="w-full max-w-md bg-white dark:bg-[#171717] rounded-[14px] shadow-lg dark:shadow-2xl border border-[#E5E5E5] dark:border-[#262626] p-7 sm:p-8 space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-2.5">
          <div className="flex justify-center">
            <Logo variant="icon" sizeOverride="lg" />
          </div>
          <h1 className="text-2xl font-bold text-[#171717] dark:text-white tracking-tight">
            {settings.barName}
          </h1>
          <p className="text-xs text-[#888888]">
            İdman Zalı Barı İdarəetmə və Satış Sistemi
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 rounded-[10px] bg-[#E32636]/10 border border-[#E32636]/30 text-[#E32636] text-xs flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-[#525252] dark:text-[#A3A3A3] uppercase tracking-wider mb-1.5">
              İstifadəçi Adı
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#888888]">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin və ya isci"
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]/30 focus:border-[#E32636] transition-all placeholder:text-[#888888]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#525252] dark:text-[#A3A3A3] uppercase tracking-wider mb-1.5">
              Şifrə
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#888888]">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]/30 focus:border-[#E32636] transition-all placeholder:text-[#888888]"
              />
            </div>
          </div>

          <button
            type="submit"
            style={{ backgroundColor: primaryColor }}
            className="w-full py-2.5 px-4 hover:opacity-95 text-white font-semibold text-sm rounded-[10px] transition-all shadow-sm active:scale-[0.99] flex items-center justify-center gap-2 mt-2"
          >
            <span>Daxil Ol</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Demo Credentials */}
        <div className="pt-4 border-t border-[#E5E5E5] dark:border-[#262626] space-y-2.5">
          <p className="text-[10px] font-semibold text-[#888888] text-center uppercase tracking-wider">
            Sürətli Giriş
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleQuickLogin('admin', 'admin2025')}
              className="p-2.5 bg-[#F5F5F5] dark:bg-[#222222] hover:bg-[#EBEBEB] dark:hover:bg-[#2A2A2A] border border-[#E5E5E5] dark:border-[#2E2E2E] text-[#171717] dark:text-white rounded-[10px] transition-colors text-left flex items-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-[#E32636] shrink-0" />
              <div className="truncate">
                <div className="text-xs font-semibold truncate">Admin</div>
                <div className="text-[10px] font-mono text-[#888888] truncate">admin2025</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('isci', 'isci123')}
              className="p-2.5 bg-[#F5F5F5] dark:bg-[#222222] hover:bg-[#EBEBEB] dark:hover:bg-[#2A2A2A] border border-[#E5E5E5] dark:border-[#2E2E2E] text-[#171717] dark:text-white rounded-[10px] transition-colors text-left flex items-center gap-2"
            >
              <UserCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <div className="truncate">
                <div className="text-xs font-semibold truncate">İşçi</div>
                <div className="text-[10px] font-mono text-[#888888] truncate">isci123</div>
              </div>
            </button>
          </div>
        </div>

        {/* PWA Home Screen Installation trigger */}
        <div className="pt-1">
          <PWAInstallButton variant="full" />
        </div>
      </div>
    </div>
  );
};
