import React, { useState, useEffect } from 'react';
import {
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Check,
  X,
  ShieldCheck,
  Smartphone,
  Globe,
  Radio,
} from 'lucide-react';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
  testSupabaseConnection,
} from '../lib/supabase';
import { useApp } from '../context/AppContext';

interface SupabaseSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupabaseSyncModal: React.FC<SupabaseSyncModalProps> = ({ isOpen, onClose }) => {
  const {
    isSupabaseConnected,
    supabaseStatus,
    syncAllLocalDataToSupabase,
    currentUser,
  } = useApp();

  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    if (isOpen) {
      const cfg = getSupabaseConfig();
      setUrl(cfg.url);
      setAnonKey(cfg.anonKey);
      setTestResult(null);
      setSyncMessage(null);
      setConfirmClear(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const res = await testSupabaseConnection(url.trim(), anonKey.trim());
    setTestResult(res);
    setTesting(false);
  };

  const handleSave = () => {
    saveSupabaseConfig(url.trim(), anonKey.trim());
    setTestResult({
      success: true,
      message: 'Parametrlər yadda saxlanıldı! Sistem Supabase-ə qoşulur...',
    });
    setTimeout(() => {
      window.location.reload();
    }, 1200);
  };

  const handleClear = () => {
    clearSupabaseConfig();
    setUrl('');
    setAnonKey('');
    window.location.reload();
  };

  const handleSyncLocalToCloud = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await syncAllLocalDataToSupabase();
      if (res.success) {
        setSyncMessage('Bütün lokal məhsullar, istifadəçilər və əməliyyatlar Supabase-ə yükləndi!');
      } else {
        setSyncMessage(`Xəta: ${res.error || 'Yükləmə uğursuz oldu'}`);
      }
    } catch (e: unknown) {
      setSyncMessage(`Xəta: ${e instanceof Error ? e.message : 'Gözlənilməz xəta'}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl rounded-3xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl text-zinc-900 dark:text-zinc-100 relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition"
          aria-label="Bağla"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg flex-shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-black text-zinc-900 dark:text-white tracking-tight">
                Supabase Vahid Baza & Real-vaxt Sinxronizasiya
              </h3>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  isSupabaseConnected
                    ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/40'
                    : 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/40'
                }`}
              >
                <Radio className="w-3 h-3" />
                {isSupabaseConnected ? 'Canlı Qoşulub' : 'Quraşdırma Gözləyir'}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Admin və işçi telefonlarında eyni anda satış, su qalığı və hesabatların dərhal yenilənməsi
            </p>
          </div>
        </div>

        {/* Realtime Status Overview */}
        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/80 mb-5 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500 dark:text-zinc-400">Real-vaxt Vəziyyəti:</span>
            <span className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  isSupabaseConnected ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              {supabaseStatus}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-500 dark:text-zinc-400">Çox-cihazlı Dəstək:</span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
              <Smartphone className="w-3.5 h-3.5" /> iPhone, Android və Kompüter eyni anda sinxronlaşır
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-500 dark:text-zinc-400">İcazələr:</span>
            <span className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" /> İşçi yalnız satış daxil edə bilər, admin məlumatlarını silə bilməz
            </span>
          </div>
        </div>

        {/* Connection Form */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
              Supabase Project URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-project.supabase.co"
              disabled={!isAdmin}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-white font-mono placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Supabase Dashboard &gt; Project Settings &gt; API &gt; Project URL
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
              Supabase Anon / Public API Key
            </label>
            <input
              type="password"
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              disabled={!isAdmin}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-white font-mono placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Supabase Dashboard &gt; Project Settings &gt; API &gt; anon public key
            </p>
          </div>

          {testResult && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 border ${
                testResult.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              )}
              <div className="leading-relaxed">{testResult.message}</div>
            </div>
          )}

          {isAdmin ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !url.trim() || !anonKey.trim()}
                className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 text-zinc-900 dark:text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 border border-zinc-300 dark:border-zinc-700"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                <span>{testing ? 'Yoxlanılır...' : 'Bağlantını Yoxla'}</span>
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={!url.trim() || !anonKey.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition shadow-md flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Yadda Saxla və Qoşul</span>
              </button>

              {(getSupabaseConfig().url || getSupabaseConfig().anonKey) && (
                confirmClear ? (
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleClear}
                      className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg"
                    >
                      Sil və Lokal Rejimə Keç
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      className="px-2.5 py-1.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold rounded-lg"
                    >
                      Ləğv et
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    className="px-3 py-2 text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 text-xs font-semibold rounded-xl transition ml-auto"
                  >
                    Tənzimləməni Sil
                  </button>
                )
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 italic">
              Supabase bağlantı parametrlərini yalnız Admin redaktə edə bilər.
            </p>
          )}
        </div>

        {/* Sync & Setup Guide for Supabase */}
        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-5 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Quraşdırma və SQL Skripti</span>
          </h4>

          <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
            <ol className="list-decimal list-inside space-y-1.5">
              <li>
                <strong>supabase.com</strong> saytında layihə yaradın və ya mövcud layihəni açın.
              </li>
              <li>
                Sol menyudan <strong>SQL Editor</strong> bölməsinə keçin.
              </li>
              <li>
                <code>supabase_schema.sql</code> və ya <code>supabase/migrations/20261112_dynamic_branding_reports_debts.sql</code> skriptini çalışdırın (<strong>Run</strong>).
              </li>
              <li>
                <strong>Project Settings &gt; API</strong> bölməsindən <strong>URL</strong> və <strong>anon key</strong>-i yuxarıdakı xanalara yazın.
              </li>
            </ol>
          </div>

          {isSupabaseConnected && isAdmin && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  Lokal Məlumatları Supabase-ə Göçür
                </p>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                  Hazırda brauzerdə olan məhsulları, ayarları və istifadəçiləri Supabase bazasına ötürün.
                </p>
                {syncMessage && (
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mt-1.5">
                    {syncMessage}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleSyncLocalToCloud}
                disabled={syncing}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'Yüklənir...' : 'İlkin Sinxronlaşdır'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
