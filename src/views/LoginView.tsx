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

  const primaryColor = settings.primaryColor || '#dc2626';

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
    <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-100 dark:bg-gradient-to-br dark:from-black dark:via-zinc-950 dark:to-zinc-900 text-zinc-900 dark:text-white transition-colors relative">
      {/* Theme Toggle on Login */}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Rejimi dəyiş"
        className="absolute top-4 right-4 p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
      >
        {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-zinc-700" />}
      </button>

      <div className="w-full max-w-md bg-white dark:bg-zinc-900/90 rounded-3xl shadow-xl dark:shadow-2xl border border-zinc-200 dark:border-zinc-800 p-8 space-y-6 backdrop-blur-md">
        {/* Brand header */}
        <div className="text-center space-y-2.5">
          <div className="flex justify-center">
            <Logo variant="icon" sizeOverride="lg" />
          </div>
          <h1 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
            {settings.barName}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            İdman Zalı Barı İdarəetmə və Satış Sistemi
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
              İstifadəçi Adı
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400 dark:text-zinc-500">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="İstifadəçi adı (məs: admin və ya isci)"
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
              Şifrə
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400 dark:text-zinc-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
              />
            </div>
          </div>

          <button
            type="submit"
            style={{ backgroundColor: primaryColor }}
            className="w-full py-3 px-4 hover:opacity-95 text-white font-bold text-sm rounded-xl transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2 mt-2"
          >
            <span>Daxil Ol</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Demo Credentials */}
        <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-2.5">
          <p className="text-[11px] font-semibold text-zinc-500 text-center uppercase tracking-wider">
            Sürətli Giriş (Nümunə Hesablar)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin('admin', 'admin2025')}
              className="p-2.5 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-xl transition-colors text-left flex items-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-red-500 shrink-0" />
              <div className="truncate">
                <div className="text-xs font-bold truncate">Admin Girişi</div>
                <div className="text-[10px] text-zinc-500 truncate">admin / admin2025</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('isci', 'isci123')}
              className="p-2.5 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-xl transition-colors text-left flex items-center gap-2"
            >
              <UserCheck className="w-4 h-4 text-blue-500 shrink-0" />
              <div className="truncate">
                <div className="text-xs font-bold truncate">İşçi Girişi</div>
                <div className="text-[10px] text-zinc-500 truncate">isci / isci123</div>
              </div>
            </button>
          </div>
        </div>

        {/* PWA Home Screen Installation trigger */}
        <div className="pt-2">
          <PWAInstallButton variant="full" />
        </div>
      </div>
    </div>
  );
};
