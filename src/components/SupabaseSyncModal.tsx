import React, { useState, useEffect } from 'react';
import {
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  X,
  ExternalLink,
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
    reloadFromSupabase,
    currentUser,
  } = useApp();

  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    if (isOpen) {
      const cfg = getSupabaseConfig();
      setUrl(cfg.url);
      setAnonKey(cfg.anonKey);
      setTestResult(null);
      setSyncMessage(null);
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
    if (confirm('Supabase parametrlərini silib lokal rejimə qayıtmaq istəyirsiniz?')) {
      clearSupabaseConfig();
      setUrl('');
      setAnonKey('');
      window.location.reload();
    }
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
    } catch (e: any) {
      setSyncMessage(`Xəta: ${e?.message || 'Gözlənilməz xəta'}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleCopySql = () => {
    const sqlText = `-- Supabase SQL skripti layihənin kök qovluğundakı "supabase_schema.sql" faylındadır.
-- Onu Supabase Dashboard -> SQL Editor pəncərəsində işə salın.`;
    navigator.clipboard.writeText(sqlText);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl rounded-3xl bg-zinc-950 border border-zinc-800 p-6 shadow-2xl text-zinc-100 relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
          aria-label="Bağla"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30 flex-shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-white tracking-tight">
                Supabase Vahid Baza & Real-vaxt Sinxronizasiya
              </h3>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  isSupabaseConnected
                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40'
                    : 'bg-amber-950/80 text-amber-400 border border-amber-500/40'
                }`}
              >
                <Radio className={`w-3 h-3 ${isSupabaseConnected ? 'animate-pulse text-emerald-400' : ''}`} />
                {isSupabaseConnected ? 'Canlı Qoşulub' : 'Quraşdırma Gözləyir'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Admin və işçi telefonlarında eyni anda satış, su qalığı və hesabatların dərhal yenilənməsi
            </p>
          </div>
        </div>

        {/* Realtime Status Overview */}
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 mb-5 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Real-vaxt Vəziyyəti:</span>
            <span className="font-bold text-white flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  isSupabaseConnected ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'
                }`}
              />
              {supabaseStatus}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Çox-cihazlı Dəstək:</span>
            <span className="font-semibold text-emerald-400 flex items-center gap-1">
              <Smartphone className="w-3.5 h-3.5" /> iPhone, Android və Kompüter eyni anda sinxronlaşır
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">İcazələr:</span>
            <span className="font-semibold text-zinc-300 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" /> İşçi yalnız satış daxil edə bilər, admin məlumatlarını silə bilməz
            </span>
          </div>
        </div>

        {/* Connection Form (Visible or editable by Admin) */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
              Supabase Project URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-project.supabase.co"
              disabled={!isAdmin}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-900 text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Supabase Dashboard &gt; Project Settings &gt; API &gt; Project URL
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
              Supabase Anon / Public API Key
            </label>
            <input
              type="password"
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              disabled={!isAdmin}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-900 text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Supabase Dashboard &gt; Project Settings &gt; API &gt; anon public key
            </p>
          </div>

          {/* Test connection result message */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 border ${
                testResult.success
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                  : 'bg-red-950/60 border-red-800 text-red-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              )}
              <div className="leading-relaxed">{testResult.message}</div>
            </div>
          )}

          {/* Action buttons */}
          {isAdmin ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !url.trim() || !anonKey.trim()}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 border border-zinc-700"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                <span>{testing ? 'Yoxlanılır...' : 'Bağlantını Yoxla'}</span>
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={!url.trim() || !anonKey.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition shadow-md shadow-emerald-600/30 flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Yadda Saxla və Qoşul</span>
              </button>

              {(getSupabaseConfig().url || getSupabaseConfig().anonKey) && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="px-3 py-2 text-zinc-400 hover:text-red-400 text-xs font-semibold rounded-xl transition ml-auto"
                >
                  Tənzimləməni Sil
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-400 italic">
              Supabase bağlantı parametrlərini yalnız Admin redaktə edə bilər.
            </p>
          )}
        </div>

        {/* Sync & Setup Guide for Supabase */}
        <div className="border-t border-zinc-800 pt-5 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-400" />
            <span>Quraşdırma və SQL Skripti (1 Dəqiqəlik)</span>
          </h4>

          <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2 text-xs text-zinc-300">
            <ol className="list-decimal list-inside space-y-1.5 text-zinc-300">
              <li>
                <strong>supabase.com</strong> saytında pulsuz layihə yaradın.
              </li>
              <li>
                Sol menyudan <strong>SQL Editor</strong> bölməsinə keçin.
              </li>
              <li>
                Layihənizdəki <code>supabase_schema.sql</code> faylının məzmununu ora yapışdırıb <strong>Run</strong> düyməsinə basın.
              </li>
              <li>
                <strong>Project Settings &gt; API</strong> bölməsindən <strong>URL</strong> və <strong>anon key</strong>-i yuxarıdakı xanalara yazın (və ya Render-də <code>VITE_SUPABASE_URL</code> olaraq təyin edin).
              </li>
            </ol>
          </div>

          {/* Sync Local Data to Supabase Button */}
          {isSupabaseConnected && isAdmin && (
            <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-emerald-300">
                  Lokal Məlumatları Supabase-ə Göçür
                </p>
                <p className="text-[11px] text-zinc-400">
                  Hazırda brauzerdə olan məhsulları, ayarları və istifadəçiləri Supabase bazasına ötürün.
                </p>
                {syncMessage && (
                  <p className="text-xs font-semibold text-emerald-400 mt-1.5">
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
