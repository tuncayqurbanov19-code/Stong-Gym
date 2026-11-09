import React, { useState } from 'react';
import {
  Settings,
  Users,
  KeyRound,
  Download,
  Upload,
  RotateCcw,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  AlertTriangle,
  Sliders,
  FileSpreadsheet,
  Bell,
  BellRing,
  Volume2,
  Database,
  Trash,
  Smartphone,
  Radio,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { SupabaseSyncModal } from '../components/SupabaseSyncModal';
import { User, UserRole } from '../types';
import { formatDateTimeAZ } from '../utils/dateUtils';
import {
  exportProductsToCSV,
  exportSalesToCSV,
  exportPurchasesToCSV,
  exportDebtsToCSV,
  exportExpensesToCSV,
  exportDailyReportsToCSV,
  downloadFile,
} from '../utils/exportUtils';

export const AdminPanelView: React.FC = () => {
  const {
    currentUser,
    users,
    addUser,
    updateUser,
    deleteUser,
    settings,
    updateSettings,
    products,
    purchases,
    sales,
    debts,
    dailyReports,
    expenses,
    auditLogs,
    resetToSampleData,
    clearAllTransactions,
    restoreFromBackup,
    notificationPermission,
    requestPushPermission,
    triggerTestNotification,
    isSupabaseConnected,
    supabaseStatus,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'users' | 'settings' | 'backup' | 'audit'>('settings');
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);

  // User modal state
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [userUsername, setUserUsername] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('isci');

  // Settings form state
  const [barName, setBarName] = useState(settings.barName);
  const [minStockThreshold, setMinStockThreshold] = useState(String(settings.minStockThreshold));
  const [autoConfirmSales, setAutoConfirmSales] = useState(settings.autoConfirmSales);
  const [enablePushNotifications, setEnablePushNotifications] = useState(settings.enablePushNotifications);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Change Admin Password state
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState(false);

  const openCreateUserModal = () => {
    setEditingUserId(null);
    setUserName('');
    setUserUsername('');
    setUserPassword('');
    setUserRole('isci');
    setIsUserModalOpen(true);
  };

  const openEditUserModal = (u: User) => {
    setEditingUserId(u.id);
    setUserName(u.name);
    setUserUsername(u.username);
    setUserPassword(u.password);
    setUserRole(u.role);
    setIsUserModalOpen(true);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userUsername.trim() || !userPassword.trim()) return;

    if (editingUserId) {
      updateUser(editingUserId, {
        name: userName.trim() || userUsername.trim(),
        username: userUsername.trim(),
        password: userPassword.trim(),
        role: userRole,
      });
    } else {
      addUser({
        name: userName.trim() || userUsername.trim(),
        username: userUsername.trim(),
        password: userPassword.trim(),
        role: userRole,
        isActive: true,
      });
    }

    setIsUserModalOpen(false);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      barName: barName.trim() || 'Zal Barı',
      minStockThreshold: parseInt(minStockThreshold, 10) || 5,
      autoConfirmSales,
      enablePushNotifications,
    });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    setPassSuccess(false);

    if (!currentUser) return;
    if (currentUser.password !== currentPass) {
      setPassError('Cari şifrə yanlışdır.');
      return;
    }
    if (newPass.length < 4) {
      setPassError('Yeni şifrə ən azı 4 simvol olmalıdır.');
      return;
    }

    updateUser(currentUser.id, { password: newPass });
    setPassSuccess(true);
    setCurrentPass('');
    setNewPass('');
    setTimeout(() => setPassSuccess(false), 3000);
  };

  // Full JSON backup download
  const handleDownloadFullBackup = () => {
    const backupData = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      barName: settings.barName,
      settings,
      users,
      products,
      purchases,
      sales,
      debts,
      dailyReports,
      expenses,
    };
    const jsonStr = JSON.stringify(backupData, null, 2);
    downloadFile(jsonStr, `ZalBari_Tam_Baza_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  };

  // JSON Restore
  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = event => {
        const content = event.target?.result as string;
        if (content) {
          const ok = restoreFromBackup(content);
          if (ok) {
            alert('Məlumatlar uğurla bərpa edildi!');
          } else {
            alert('JSON faylı oxunarkən xəta baş verdi.');
          }
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <span>Admin İdarəetmə Paneli</span>
            <span className="text-xs bg-red-950 text-red-400 font-bold px-2 py-0.5 rounded-full border border-red-800">
              Admin
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            Push bildirişlər, daimi məlumat bazası, işçi hesabları və sistem ayarları
          </p>
        </div>

        {/* Tab selection */}
        <div className="flex items-center p-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'settings'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Bildirişlər & Ayarlar
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'users'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            İşçi Hesabları
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'backup'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Daimi Baza & Sıfırlama
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'audit'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Əməliyyat Jurnalı
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────
          TAB 1: BİLDİRİŞLƏR & AYARLAR
         ───────────────────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* General Settings & Push Notification Form */}
          <form
            onSubmit={handleSaveSettings}
            className="p-6 bg-zinc-900/90 rounded-3xl border border-zinc-800 shadow-xl space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-red-500" />
                <h3 className="text-base font-bold text-white">
                  Sistem Parametrləri & Qalıq Həddi
                </h3>
              </div>
              {settingsSaved && (
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                  <Check className="w-4 h-4" /> Saxlanıldı
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                Barın / İdman Zalı Adı
              </label>
              <input
                type="text"
                value={barName}
                onChange={e => setBarName(e.target.value)}
                placeholder="məs: Zal Barı"
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                Minimum Depo Qalıq Xəbərdarlıq Həddi (ədəd)
              </label>
              <p className="text-[11px] text-zinc-400 mb-1.5">
                Məhsulun aktiv qalığı bu həddə və ya aşağı düşəndə qırmızı xəbərdarlıq və brauzer push-bildirişi göndərilir.
              </p>
              <input
                type="number"
                min="1"
                value={minStockThreshold}
                onChange={e => setMinStockThreshold(e.target.value)}
                className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            {/* Browser Push Notifications Card */}
            <div className="p-4 rounded-2xl bg-zinc-950 border border-red-950/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BellRing className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-bold text-white block">
                    Brauzer Push-Bildirişləri
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={enablePushNotifications}
                  onChange={e => setEnablePushNotifications(e.target.checked)}
                  className="w-5 h-5 accent-red-600 rounded cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-zinc-400">
                Depo qalığı minimum həddən ({minStockThreshold} ədəd) aşağı düşdükdə brauzer vasitəsilə bildiriş və səs siqnalı verilsin.
              </p>

              <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] text-zinc-400">
                  Status:{' '}
                  <span className={`font-bold ${
                    notificationPermission === 'granted'
                      ? 'text-emerald-400'
                      : notificationPermission === 'denied'
                      ? 'text-red-400'
                      : 'text-amber-400'
                  }`}>
                    {notificationPermission === 'granted'
                      ? 'İcazə Verilib ✓'
                      : notificationPermission === 'denied'
                      ? 'Qadağan Edilib (Ayarlardan açın)'
                      : 'Gözləmədə'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {notificationPermission !== 'granted' && (
                    <button
                      type="button"
                      onClick={() => requestPushPermission()}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] rounded-lg transition-colors"
                    >
                      İcazə İstə
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={triggerTestNotification}
                    className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-[11px] rounded-lg transition-colors flex items-center gap-1 border border-zinc-700"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-red-400" />
                    <span>Sınaq Bildirişi</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Auto Confirm Sales */}
            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">
                    Satışların Avtomatik Təsdiqi
                  </span>
                  <p className="text-[11px] text-zinc-400">
                    Aktiv olduqda, satılan hər məhsul dərhal depodan çıxılır və gündəlik hesabata yazılır.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={autoConfirmSales}
                  onChange={e => setAutoConfirmSales(e.target.checked)}
                  className="w-5 h-5 accent-red-600 rounded cursor-pointer"
                />
              </div>
            </div>

            <button
              type="submit"
              className="py-2.5 px-5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-red-600/30"
            >
              Ayarları Yadda Saxla
            </button>
          </form>

          {/* Change Password Form */}
          <form
            onSubmit={handleChangePassword}
            className="p-6 bg-zinc-900/90 rounded-3xl border border-zinc-800 shadow-xl space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-red-500" />
                <h3 className="text-base font-bold text-white">
                  Admin Şifrəsini Dəyiş
                </h3>
              </div>
              {passSuccess && (
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                  <Check className="w-4 h-4" /> Şifrə yeniləndi
                </span>
              )}
            </div>

            {passError && (
              <div className="p-3 text-xs bg-red-950 text-red-400 rounded-xl border border-red-800">
                {passError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                Cari Şifrə
              </label>
              <input
                type="password"
                required
                value={currentPass}
                onChange={e => setCurrentPass(e.target.value)}
                placeholder="Cari şifrəni yazın"
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                Yeni Şifrə
              </label>
              <input
                type="password"
                required
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                placeholder="Yeni şifrəni yazın (min 4 simvol)"
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <button
              type="submit"
              className="py-2.5 px-5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl transition-colors border border-zinc-700"
            >
              Şifrəni Yenilə
            </button>
          </form>

          {/* iPhone & Mobile PWA Installation Card */}
          <div className="lg:col-span-2 p-6 bg-gradient-to-r from-zinc-900 to-zinc-950 rounded-3xl border border-red-500/30 shadow-xl flex flex-col md:flex-row items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-red-600/20 text-red-500 border border-red-500/40 flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-600/20">
                <Smartphone className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-black text-white tracking-wide">
                    iPhone və Mobil Cihazlara Quraşdırma (PWA)
                  </h4>
                  <span className="px-2 py-0.5 rounded-full bg-red-600/20 border border-red-500/30 text-red-400 text-[10px] font-bold">
                    Ana Ekran Əlavəedicisi
                  </span>
                </div>
                <p className="text-xs text-zinc-300 max-w-2xl">
                  Proqramı iPhone, iPad və ya Android telefonunuzun ana ekranına birbaşa əlavə edin. Safari və ya Chrome-da brauzer çərçivəsi olmadan tam ekran (tətbiq kimi) açılacaq, kassa daha sürətli işləyəcək.
                </p>
              </div>
            </div>
            <div className="flex-shrink-0 w-full md:w-auto">
              <PWAInstallButton variant="full" className="md:w-auto min-w-[220px]" />
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          TAB 2: İŞÇİ HESABLARI
         ───────────────────────────────────────────────────────── */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-white">
              Sistem İstifadəçiləri və İcazələr ({users.length})
            </h3>
            <button
              onClick={openCreateUserModal}
              className="px-4 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all shadow-md shadow-red-600/30 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni İşçi Hesabı Yarat</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.map(u => (
              <div
                key={u.id}
                className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-md flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                        u.role === 'admin'
                          ? 'bg-red-950 text-red-400 border border-red-800'
                          : 'bg-zinc-800 text-zinc-300'
                      }`}>
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">
                          {u.name}
                        </h4>
                        <span className="text-xs font-mono text-zinc-400">
                          @{u.username}
                        </span>
                      </div>
                    </div>

                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      u.role === 'admin'
                        ? 'bg-red-950 text-red-400 border border-red-900'
                        : 'bg-zinc-800 text-zinc-300'
                    }`}>
                      {u.role === 'admin' ? 'Admin' : 'İşçi'}
                    </span>
                  </div>

                  <div className="text-xs text-zinc-400 space-y-1 pt-1">
                    <p>
                      Şifrə: <span className="font-mono text-zinc-300">••••••</span>
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {u.role === 'admin'
                        ? 'İcazə: Bütün hesabatlar, xalis mənfəət, xərclər, depo və ayarlar'
                        : 'İcazə: Yalnız gündəlik satış daxil etmə, günün hesabatı və borc qeydi'}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-800 flex justify-end gap-2">
                  <button
                    onClick={() => openEditUserModal(u)}
                    className="px-3 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 rounded-lg flex items-center gap-1"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Düzəliş et</span>
                  </button>

                  {u.id !== currentUser?.id && (
                    <button
                      onClick={() => {
                        if (confirm(`"${u.username}" istifadəçisini silmək istədiyinizə əminsiniz?`)) {
                          deleteUser(u.id);
                        }
                      }}
                      className="px-3 py-1 text-xs font-semibold text-red-400 hover:bg-red-950/40 rounded-lg flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Sil</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          TAB 3: DAİMİ BAZA & SIFIRLAMA
         ───────────────────────────────────────────────────────── */}
      {activeTab === 'backup' && (
        <div className="space-y-6">
          {/* Supabase Realtime Cloud Sync Card */}
          <div className="p-6 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 rounded-3xl border border-red-500/40 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${
                  isSupabaseConnected
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800 shadow-lg shadow-emerald-900/30'
                    : 'bg-zinc-800 text-amber-400 border-zinc-700'
                }`}>
                  <Radio className={`w-6 h-6 ${isSupabaseConnected ? 'animate-pulse' : ''}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-white">
                      Supabase Vahid Baza & Real-Vaxt Sinxronizasiya
                    </h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                      isSupabaseConnected
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                        : 'bg-amber-950 text-amber-400 border-amber-800'
                    }`}>
                      {isSupabaseConnected ? 'Realtime Aktiv' : 'Lokal Rejim'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    İşçi və Admin telefonları eyni mərkəzi bazaya qoşulur. İşçinin vurduğu satış dərhal Admin ekranında görünür, su qalığı eyni qalır.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsSupabaseModalOpen(true)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-red-600/30 flex items-center gap-2 whitespace-nowrap self-start sm:self-auto"
              >
                <Radio className="w-4 h-4" />
                <span>Supabase Parametrləri & SQL</span>
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-950/90 border border-zinc-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-zinc-500 block uppercase text-[10px]">Realtime Status</span>
                <span className="font-bold text-zinc-200">{supabaseStatus}</span>
              </div>
              <div>
                <span className="text-zinc-500 block uppercase text-[10px]">Çoxcihazlı Sinxronizasiya</span>
                <span className="font-bold text-zinc-200">
                  {isSupabaseConnected ? 'Avtomatik (PC + iPhone + Android)' : 'Qoşulduqdan sonra aktiv'}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 block uppercase text-[10px]">İşçi İcazə Qorunması</span>
                <span className="font-bold text-emerald-400">Silmə/Dəyişmə Bloklanıb ✓</span>
              </div>
            </div>
          </div>

          {/* Permanent Database Status Card */}
          <div className="p-6 bg-zinc-900 rounded-3xl border border-zinc-800 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-950 text-red-500 flex items-center justify-center border border-red-900/60">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Daimi Məlumat Bazası (IndexedDB + LocalStorage)
                </h3>
                <p className="text-xs text-zinc-400">
                  Bütün əməliyyatlar ikiqat yaddaş mexanizmi ilə saxlanılır. Səhifə yenilənsə və ya proqram yenilənsə belə məlumatlarınız silinmir.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-zinc-500 block uppercase text-[10px]">Məhsullar</span>
                <span className="font-mono font-bold text-white">{products.length} ədəd</span>
              </div>
              <div>
                <span className="text-zinc-500 block uppercase text-[10px]">Aktiv Satışlar</span>
                <span className="font-mono font-bold text-white">{sales.length} qeyd</span>
              </div>
              <div>
                <span className="text-zinc-500 block uppercase text-[10px]">Borclar</span>
                <span className="font-mono font-bold text-white">{debts.length} qeyd</span>
              </div>
              <div>
                <span className="text-zinc-500 block uppercase text-[10px]">Baza Vəziyyəti</span>
                <span className="font-bold text-emerald-400">Aktiv & Mühafizədə</span>
              </div>
            </div>
          </div>

          {/* Reset Action: Zero out transactions */}
          <div className="p-6 bg-zinc-900 rounded-3xl border border-red-950/80 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h3 className="text-base font-bold text-white">
                Satış və Əməliyyatları Sıfırlama
              </h3>
            </div>
            <p className="text-xs text-zinc-400">
              Məhsulları və istifadəçiləri toxunulmaz saxlayaraq, bütün satış, borc, mal qəbulu və gündəlik hesabatları sıfırlayın. Real satışlarınızı təmiz başlamaq üçün istifadə edin.
            </p>

            <button
              onClick={() => {
                if (confirm('Bütün satışları, borcları, mal qəbullarını və hesabatları sıfırlamaq istəyirsiniz? (Məhsullar və istifadəçilər saxlanılacaq)')) {
                  clearAllTransactions();
                  alert('Bütün satış və əməliyyat məlumatları sıfırlandı!');
                }
              }}
              className="px-5 py-2.5 bg-red-950 hover:bg-red-900 text-red-200 border border-red-800 font-bold text-xs rounded-xl transition-colors flex items-center gap-2"
            >
              <Trash className="w-4 h-4 text-red-400" />
              <span>Bütün Satış və Hesabatları Sıfırla (0-la)</span>
            </button>
          </div>

          {/* Excel Export Strip */}
          <div className="p-6 bg-zinc-900 rounded-3xl border border-zinc-800 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-white">
              Excel / CSV Formatında İxrac
            </h3>
            <p className="text-xs text-zinc-400">
              Bütün cədvəlləri Microsoft Excel və ya Google Sheets üçün UTF-8 formatında yükləyin.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
              <button
                onClick={() => exportProductsToCSV(products)}
                className="p-3 rounded-2xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-left transition-colors"
              >
                <FileSpreadsheet className="w-5 h-5 text-red-500 mb-2" />
                <div className="text-xs font-bold text-white">Məhsullar</div>
                <div className="text-[10px] text-zinc-500">{products.length} sətir</div>
              </button>

              <button
                onClick={() => exportSalesToCSV(sales)}
                className="p-3 rounded-2xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-left transition-colors"
              >
                <FileSpreadsheet className="w-5 h-5 text-blue-500 mb-2" />
                <div className="text-xs font-bold text-white">Satışlar</div>
                <div className="text-[10px] text-zinc-500">{sales.length} sətir</div>
              </button>

              <button
                onClick={() => exportPurchasesToCSV(purchases)}
                className="p-3 rounded-2xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-left transition-colors"
              >
                <FileSpreadsheet className="w-5 h-5 text-emerald-500 mb-2" />
                <div className="text-xs font-bold text-white">Mal Qəbulu</div>
                <div className="text-[10px] text-zinc-500">{purchases.length} sətir</div>
              </button>

              <button
                onClick={() => exportDebtsToCSV(debts)}
                className="p-3 rounded-2xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-left transition-colors"
              >
                <FileSpreadsheet className="w-5 h-5 text-rose-500 mb-2" />
                <div className="text-xs font-bold text-white">Borclar</div>
                <div className="text-[10px] text-zinc-500">{debts.length} sətir</div>
              </button>

              <button
                onClick={() => exportExpensesToCSV(expenses)}
                className="p-3 rounded-2xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-left transition-colors"
              >
                <FileSpreadsheet className="w-5 h-5 text-purple-500 mb-2" />
                <div className="text-xs font-bold text-white">Xərclər</div>
                <div className="text-[10px] text-zinc-500">{expenses.length} sətir</div>
              </button>

              <button
                onClick={() => exportDailyReportsToCSV(dailyReports)}
                className="p-3 rounded-2xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-left transition-colors"
              >
                <FileSpreadsheet className="w-5 h-5 text-amber-500 mb-2" />
                <div className="text-xs font-bold text-white">Hesabatlar</div>
                <div className="text-[10px] text-zinc-500">{dailyReports.length} gün</div>
              </button>
            </div>
          </div>

          {/* Full System Backup & Restore */}
          <div className="p-6 bg-zinc-900 rounded-3xl border border-zinc-800 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-white">
              Tam Sistem Nüsxəsi (JSON Baza Faylı)
            </h3>
            <p className="text-xs text-zinc-400">
              Bütün məhsulları, qiymətləri, istifadəçiləri və qeydləri tək bir fayl kimi telefon və ya kompüterinizə endirin.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={handleDownloadFullBackup}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-red-600/30 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Tam Baza Faylını Endir (JSON)</span>
              </button>

              <label className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-2 cursor-pointer border border-zinc-700">
                <Upload className="w-4 h-4 text-red-400" />
                <span>Fayldan Bərpa Et</span>
                <input type="file" accept=".json" onChange={handleRestoreFile} className="hidden" />
              </label>

              <button
                onClick={() => {
                  if (confirm('Bütün məlumatları başlanğıc vəziyyətinə qaytarmaq istəyirsiniz?')) {
                    resetToSampleData();
                    alert('Məlumatlar sıfırlandı.');
                  }
                }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-bold text-xs rounded-xl transition-colors flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>İlkin Bazaya Qaytar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          TAB 4: ƏMƏLİYYAT JURNALI (AUDIT LOG)
         ───────────────────────────────────────────────────────── */}
      {activeTab === 'audit' && (
        <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">
                Sistem Əməliyyat Jurnalı
              </h3>
              <p className="text-xs text-zinc-400">Kim, nə vaxt, hansı əməliyyatı həyata keçirdi</p>
            </div>
            <span className="text-xs text-zinc-500 font-mono">Son {auditLogs.length} əməliyyat</span>
          </div>

          <div className="divide-y divide-zinc-800 max-h-96 overflow-y-auto pr-1">
            {auditLogs.map(log => (
              <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                <div>
                  <span className="font-bold text-white">
                    {log.action}
                  </span>
                  <span className="text-zinc-400 ml-2">{log.details}</span>
                </div>
                <div className="flex items-center gap-3 text-zinc-500 font-mono text-[11px] shrink-0">
                  <span className="bg-zinc-800 px-2 py-0.5 rounded text-zinc-300">
                    @{log.username}
                  </span>
                  <span>{formatDateTimeAZ(log.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Create/Edit User */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in">
          <div className="bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl border border-zinc-800 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                {editingUserId ? 'İşçi Hesabını Redaktə Et' : 'Yeni İşçi Hesabı Yarat'}
              </h3>
              <button
                onClick={() => setIsUserModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Ad və Soyad
                </label>
                <input
                  type="text"
                  required
                  value={userName}
                  onChange={e => setUserName(e.target.value)}
                  placeholder="məs: Tural Qasımov"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  İstifadəçi Adı (Giriş üçün) *
                </label>
                <input
                  type="text"
                  required
                  value={userUsername}
                  onChange={e => setUserUsername(e.target.value)}
                  placeholder="məs: tural_bar"
                  className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Şifrə *
                </label>
                <input
                  type="text"
                  required
                  value={userPassword}
                  onChange={e => setUserPassword(e.target.value)}
                  placeholder="Şifrə təyin edin"
                  className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Rol və İcazə *
                </label>
                <select
                  value={userRole}
                  onChange={e => setUserRole(e.target.value as UserRole)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="isci">İşçi (Yalnız POS Satış, Günün Hesabatı, Borc qeydi)</option>
                  <option value="admin">Admin (Bütün rəqəmlər, xalis mənfəət, xərclər, ayarlar)</option>
                </select>
              </div>

              <div className="pt-3 border-t border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white rounded-xl"
                >
                  Ləğv et
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-md shadow-red-600/30"
                >
                  Hesabı Yadda Saxla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supabase Sync & Setup Modal */}
      <SupabaseSyncModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
      />
    </div>
  );
};
