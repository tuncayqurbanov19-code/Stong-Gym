import React, { useEffect, useState } from 'react';
import {
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
  BellRing,
  Volume2,
  Database,
  Trash,
  Smartphone,
  Radio,
  Image as ImageIcon,
  Camera,
  CheckCircle,
  Palette,
} from 'lucide-react';
import {
  uploadLogoToSupabase,
  deleteLogoFromSupabase,
  validateLogoFile,
} from '../utils/logoUtils';
import { useApp } from '../context/AppContext';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { SupabaseSyncModal } from '../components/SupabaseSyncModal';
import { Logo } from '../components/Logo';
import { LogoSize, User, UserRole } from '../types';
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

const COLOR_PRESETS = [
  { name: 'Qırmızı', hex: '#dc2626' },
  { name: 'Göy', hex: '#2563eb' },
  { name: 'Zümrüd', hex: '#059669' },
  { name: 'Kəhrəba', hex: '#d97706' },
  { name: 'Bənövşəyi', hex: '#7c3aed' },
  { name: 'Qrafit', hex: '#18181b' },
];

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
    customerAccounts,
    dailyReports,
    expenses,
    auditLogs,
    resetToSampleData,
    resetToOriginalBackup,
    clearAllTransactions,
    restoreFromBackup,
    notificationPermission,
    requestPushPermission,
    triggerTestNotification,
    isSupabaseConnected,
    supabaseStatus,
    showToast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'design' | 'settings' | 'users' | 'backup' | 'audit'>('design');
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);

  // User modal state
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [userUsername, setUserUsername] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('isci');
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);

  // Settings form state
  const [minStockThreshold, setMinStockThreshold] = useState(String(settings.minStockThreshold));
  const [autoConfirmSales, setAutoConfirmSales] = useState(settings.autoConfirmSales);
  const [enablePushNotifications, setEnablePushNotifications] = useState(settings.enablePushNotifications);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Change Admin Password state
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState(false);

  // Design & Branding state
  const [appNameInput, setAppNameInput] = useState(settings.barName || 'Zal Barı');
  const [primaryColorInput, setPrimaryColorInput] = useState(settings.primaryColor || '#dc2626');
  const [logoSizeInput, setLogoSizeInput] = useState<LogoSize>(settings.logoSize || 'md');
  const [logoPreview, setLogoPreview] = useState<string | null>(settings.logoUrl || null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isSavingDesign, setIsSavingDesign] = useState(false);
  const [designSuccess, setDesignSuccess] = useState<string | null>(null);
  const [designError, setDesignError] = useState<string | null>(null);
  const [confirmResetLogo, setConfirmResetLogo] = useState(false);
  const [confirmResetAction, setConfirmResetAction] = useState<'none' | 'original' | 'zero' | 'sample'>('none');

  const primaryColor = settings.primaryColor || '#dc2626';

  // Sync local form values when realtime settings change externally
  useEffect(() => {
    setAppNameInput(settings.barName || 'Zal Barı');
    setPrimaryColorInput(settings.primaryColor || '#dc2626');
    setLogoSizeInput(settings.logoSize || 'md');
    if (!logoFile) {
      setLogoPreview(settings.logoUrl || null);
    }
    setMinStockThreshold(String(settings.minStockThreshold));
    setAutoConfirmSales(settings.autoConfirmSales);
    setEnablePushNotifications(settings.enablePushNotifications);
  }, [settings, logoFile]);

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateLogoFile(file);
    if (validationError) {
      setDesignError(validationError);
      setDesignSuccess(null);
      e.target.value = '';
      return;
    }

    setLogoFile(file);
    setDesignError(null);
    setDesignSuccess(null);

    const reader = new FileReader();
    reader.onload = ev => {
      setLogoPreview((ev.target?.result as string) || null);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveBrandingAndDesign = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingDesign(true);
    setDesignError(null);
    setDesignSuccess(null);

    try {
      let finalLogoUrl = settings.logoUrl;

      if (logoFile) {
        if (isSupabaseConnected) {
          const { url, error } = await uploadLogoToSupabase(logoFile, settings.logoUrl);
          if (error) {
            setDesignError(`Storage yükləmə xətası: ${error}`);
            setIsSavingDesign(false);
            return;
          }
          finalLogoUrl = url || undefined;
        } else if (logoPreview) {
          finalLogoUrl = logoPreview;
        }
      }

      const res = await updateSettings({
        barName: appNameInput.trim() || 'Zal Barı',
        primaryColor: primaryColorInput || '#dc2626',
        logoSize: logoSizeInput,
        logoUrl: finalLogoUrl,
      });

      if (!res.success) {
        setDesignError(res.error || 'Ayarlar yadda saxlanılmadı.');
        return;
      }

      setLogoFile(null);
      setDesignSuccess('Brendinq, loqo və dizayn parametrləri bütün sistemdə yeniləndi!');
      showToast('success', 'Dizayn və loqo parametrləri yadda saxlanıldı.');
      setTimeout(() => setDesignSuccess(null), 4000);
    } catch (err: unknown) {
      setDesignError(err instanceof Error ? err.message : 'Xəta baş verdi.');
    } finally {
      setIsSavingDesign(false);
    }
  };

  const handleRemoveLogo = async () => {
    setIsSavingDesign(true);
    setDesignError(null);
    setDesignSuccess(null);
    try {
      if (settings.logoUrl && isSupabaseConnected) {
        await deleteLogoFromSupabase(settings.logoUrl);
      }
      setLogoPreview(null);
      setLogoFile(null);
      setConfirmResetLogo(false);
      await updateSettings({ logoUrl: undefined });
      setDesignSuccess('Loqo silindi və ilkin sistem ikonuna qaytarıldı.');
      showToast('info', 'Loqo ilkin vəziyyətinə qaytarıldı.');
      setTimeout(() => setDesignSuccess(null), 4000);
    } catch (err: unknown) {
      setDesignError(err instanceof Error ? err.message : 'Loqo silinərkən xəta baş verdi.');
    } finally {
      setIsSavingDesign(false);
    }
  };

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

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings({
      minStockThreshold: parseInt(minStockThreshold, 10) || 5,
      autoConfirmSales,
      enablePushNotifications,
    });
    setSettingsSaved(true);
    showToast('success', 'Sistem parametrləri yadda saxlanıldı.');
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

  const handleDownloadFullBackup = () => {
    const backupData = {
      version: '2.1',
      exportedAt: new Date().toISOString(),
      barName: settings.barName,
      settings,
      users,
      products,
      purchases,
      sales,
      debts,
      customerAccounts,
      dailyReports,
      expenses,
    };
    const jsonStr = JSON.stringify(backupData, null, 2);
    downloadFile(jsonStr, `ZalBari_Tam_Baza_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = event => {
        const content = event.target?.result as string;
        if (content) {
          const ok = restoreFromBackup(content);
          if (ok) {
            showToast('success', 'Məlumatlar JSON faylından uğurla bərpa edildi!');
          } else {
            showToast('error', 'JSON faylı oxunarkən xəta baş verdi.');
          }
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>Admin İdarəetmə Paneli</span>
            <span className="text-xs bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 font-bold px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800">
              Admin
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Dinamik loqo və dizayn, bildirişlər, işçi hesabları və daimi baza idarəetməsi
          </p>
        </div>

        {/* Tab selection */}
        <div className="flex items-center p-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-x-auto gap-1">
          {(
            [
              { id: 'design', label: 'Dizayn & Loqo' },
              { id: 'settings', label: 'Bildirişlər & Ayarlar' },
              { id: 'users', label: 'İşçi Hesabları' },
              { id: 'backup', label: 'Daimi Baza & Sıfırlama' },
              { id: 'audit', label: 'Əməliyyat Jurnalı' },
            ] as const
          ).map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={activeTab === t.id ? { backgroundColor: primaryColor } : undefined}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                activeTab === t.id
                  ? 'text-white shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────
          TAB 0: DİZAYN & DİNAMİK LOQO
         ───────────────────────────────────────────────────────── */}
      {activeTab === 'design' && (
        <form onSubmit={handleSaveBrandingAndDesign} className="space-y-6">
          <div className="p-6 bg-white dark:bg-zinc-900/90 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm dark:shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-500 border border-red-200 dark:border-red-900/60 flex items-center justify-center">
                  <Palette className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                    Dinamik Loqo, Rəng və Brendinq İdarəsi
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Loqo Supabase Storage (branding bucket) üzərində saxlanılır və bütün cihazlarda dərhal yenilənir.
                  </p>
                </div>
              </div>

              {designSuccess && (
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 rounded-xl">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{designSuccess}</span>
                </span>
              )}
            </div>

            {designError && (
              <div className="p-3.5 text-xs bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-xl border border-red-200 dark:border-red-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{designError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Live Preview Column */}
              <div className="lg:col-span-5 space-y-4">
                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider block">
                  Canlı Önizləmə (Açıq & Tünd Rejim)
                </span>

                {/* Desktop Header / Sidebar Preview */}
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
                    Menyu & Başlıq Görünüşü
                  </span>
                  <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                    <Logo
                      variant="lockup"
                      sizeOverride={logoSizeInput}
                      previewLogoUrl={logoPreview}
                      previewAppName={appNameInput}
                      previewPrimaryColor={primaryColorInput}
                    />
                    <span
                      style={{ backgroundColor: primaryColorInput }}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-white shrink-0"
                    >
                      Aktiv Düymə
                    </span>
                  </div>
                </div>

                {/* Mobile & Favicon Preview */}
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-around gap-4">
                  <div className="text-center space-y-1.5">
                    <Logo
                      variant="icon"
                      sizeOverride="lg"
                      previewLogoUrl={logoPreview}
                      previewAppName={appNameInput}
                      previewPrimaryColor={primaryColorInput}
                    />
                    <span className="text-[10px] text-zinc-500 block font-medium">
                      iPhone / Android İkonu
                    </span>
                  </div>

                  <div className="text-center space-y-1.5">
                    <Logo
                      variant="icon"
                      sizeOverride={logoSizeInput}
                      previewLogoUrl={logoPreview}
                      previewAppName={appNameInput}
                      previewPrimaryColor={primaryColorInput}
                    />
                    <span className="text-[10px] text-zinc-500 block font-medium">
                      Seçilmiş Ölçü ({logoSizeInput.toUpperCase()})
                    </span>
                  </div>
                </div>
              </div>

              {/* Controls Column */}
              <div className="lg:col-span-7 space-y-5">
                {/* App Name + Primary Color + Logo Size */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                      Proqram / Bar Adı (app_name)
                    </label>
                    <input
                      type="text"
                      value={appNameInput}
                      onChange={e => setAppNameInput(e.target.value)}
                      placeholder="məs: Zal Barı"
                      className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                      Loqo Ölçüsü (logo_size)
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['sm', 'md', 'lg'] as LogoSize[]).map(sz => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setLogoSizeInput(sz)}
                          style={
                            logoSizeInput === sz
                              ? { backgroundColor: primaryColorInput, borderColor: primaryColorInput }
                              : undefined
                          }
                          className={`py-2 rounded-xl border text-xs font-bold uppercase transition-all ${
                            logoSizeInput === sz
                              ? 'text-white shadow-sm'
                              : 'bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800'
                          }`}
                        >
                          {sz === 'sm' ? 'Kiçik' : sz === 'md' ? 'Orta' : 'Böyük'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Primary Color Picker */}
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                    Əsas Brend Rəngi (primary_color)
                  </label>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <input
                      type="color"
                      value={primaryColorInput}
                      onChange={e => setPrimaryColorInput(e.target.value)}
                      aria-label="Əsas rəng seçici"
                      className="w-10 h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 cursor-pointer bg-transparent p-0.5"
                    />
                    <input
                      type="text"
                      value={primaryColorInput}
                      onChange={e => setPrimaryColorInput(e.target.value)}
                      className="w-28 px-3 py-2 text-xs font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      {COLOR_PRESETS.map(c => (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => setPrimaryColorInput(c.hex)}
                          title={c.name}
                          style={{ backgroundColor: c.hex }}
                          className={`w-7 h-7 rounded-lg border-2 transition-transform ${
                            primaryColorInput.toLowerCase() === c.hex
                              ? 'border-zinc-900 dark:border-white scale-110'
                              : 'border-transparent opacity-80 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* File Dropzone */}
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                    Loqo Şəkli Yüklə (PNG, JPG, SVG, WebP · Maks. 2 MB)
                  </label>
                  <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-red-500 rounded-2xl cursor-pointer bg-zinc-50 dark:bg-zinc-950/60 hover:bg-zinc-100 dark:hover:bg-zinc-950 transition-all p-4 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Camera className="w-7 h-7 text-zinc-400 mb-1" />
                      <p className="text-xs text-zinc-700 dark:text-zinc-300 font-semibold">
                        {logoFile ? `Seçildi: ${logoFile.name}` : 'Kompüter və ya telefondan şəkil seçin'}
                      </p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        PNG, JPG, SVG və ya WebP · Maksimum ölçü 2 MB
                      </p>
                    </div>
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.svg,.webp,image/png,image/jpeg,image/svg+xml,image/webp"
                      onChange={handleLogoFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={isSavingDesign}
                    style={{ backgroundColor: primaryColorInput }}
                    className="py-2.5 px-6 hover:opacity-95 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isSavingDesign ? 'Yadda saxlanılır...' : 'Yadda saxla'}</span>
                  </button>

                  {(settings.logoUrl || logoPreview) && (
                    confirmResetLogo ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          disabled={isSavingDesign}
                          className="py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl"
                        >
                          Bəli, Loqonu Sil
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmResetLogo(false)}
                          className="py-2 px-3 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold text-xs rounded-xl"
                        >
                          Ləğv et
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmResetLogo(true)}
                        className="py-2.5 px-4 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold text-xs rounded-xl transition-colors border border-zinc-200 dark:border-zinc-700 flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        <span>Loqonu Sil / Default-a Qaytar</span>
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* iPhone & Mobile PWA Installation Card */}
          <div className="p-6 bg-white dark:bg-gradient-to-r dark:from-zinc-900 dark:to-zinc-950 rounded-3xl border border-zinc-200 dark:border-red-500/30 shadow-sm flex flex-col md:flex-row items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-600/20 text-red-600 dark:text-red-500 border border-red-200 dark:border-red-500/40 flex items-center justify-center shrink-0">
                <Smartphone className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-black text-zinc-900 dark:text-white tracking-wide">
                    iPhone və Mobil Cihazlara Quraşdırma (PWA)
                  </h4>
                  <span className="px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-600/20 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-[10px] font-bold">
                    Ana Ekran İkonu
                  </span>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-300 max-w-2xl">
                  Yüklədiyiniz loqodan iPhone (180x180 apple-touch-icon), Android (192x192 / 512x512 maskable) və brauzer favicon-ları avtomatik yaradılır.
                </p>
              </div>
            </div>
            <div className="shrink-0 w-full md:w-auto">
              <PWAInstallButton variant="full" className="md:w-auto min-w-[220px]" />
            </div>
          </div>
        </form>
      )}

      {/* ─────────────────────────────────────────────────────────
          TAB 1: BİLDİRİŞLƏR & AYARLAR
         ───────────────────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form
            onSubmit={handleSaveSettings}
            className="p-6 bg-white dark:bg-zinc-900/90 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-red-500" />
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Sistem Parametrləri & Qalıq Həddi
                </h3>
              </div>
              {settingsSaved && (
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Check className="w-4 h-4" /> Saxlanıldı
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                Minimum Depo Qalıq Xəbərdarlıq Həddi (ədəd)
              </label>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-1.5">
                Məhsulun aktiv qalığı bu həddə və ya aşağı düşəndə xəbərdarlıq göndərilir.
              </p>
              <input
                type="number"
                min="1"
                value={minStockThreshold}
                onChange={e => setMinStockThreshold(e.target.value)}
                className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-red-950/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BellRing className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-bold text-zinc-900 dark:text-white block">
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
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Depo qalığı minimum həddən ({minStockThreshold} ədəd) aşağı düşdükdə bildiriş verilsin.
              </p>

              <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Status:{' '}
                  <span
                    className={`font-bold ${
                      notificationPermission === 'granted'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : notificationPermission === 'denied'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {notificationPermission === 'granted'
                      ? 'İcazə Verilib'
                      : notificationPermission === 'denied'
                      ? 'Qadağan Edilib'
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
                    className="px-3 py-1 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-[11px] rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-red-500" />
                    <span>Sınaq Bildirişi</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-zinc-900 dark:text-white block">
                    Satışların Avtomatik Təsdiqi
                  </span>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
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
              style={{ backgroundColor: primaryColor }}
              className="py-2.5 px-5 hover:opacity-95 text-white font-bold text-xs rounded-xl transition-all shadow-sm"
            >
              Ayarları Yadda Saxla
            </button>
          </form>

          {/* Change Password Form */}
          <form
            onSubmit={handleChangePassword}
            className="p-6 bg-white dark:bg-zinc-900/90 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-red-500" />
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Admin Şifrəsini Dəyiş
                </h3>
              </div>
              {passSuccess && (
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Check className="w-4 h-4" /> Şifrə yeniləndi
                </span>
              )}
            </div>

            {passError && (
              <div className="p-3 text-xs bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-800">
                {passError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                Cari Şifrə
              </label>
              <input
                type="password"
                required
                value={currentPass}
                onChange={e => setCurrentPass(e.target.value)}
                placeholder="Cari şifrəni yazın"
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                Yeni Şifrə
              </label>
              <input
                type="password"
                required
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                placeholder="Yeni şifrəni yazın (min 4 simvol)"
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <button
              type="submit"
              className="py-2.5 px-5 bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 text-white font-bold text-xs rounded-xl transition-colors"
            >
              Şifrəni Yenilə
            </button>
          </form>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          TAB 2: İŞÇİ HESABLARI
         ───────────────────────────────────────────────────────── */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Sistem İstifadəçiləri və İcazələr ({users.length})
            </h3>
            <button
              onClick={openCreateUserModal}
              style={{ backgroundColor: primaryColor }}
              className="px-4 py-2 text-xs font-bold text-white rounded-xl transition-all shadow-sm flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni İşçi Hesabı Yarat</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.map(u => (
              <div
                key={u.id}
                className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                          u.role === 'admin'
                            ? 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                          {u.name}
                        </h4>
                        <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                          @{u.username}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        u.role === 'admin'
                          ? 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {u.role === 'admin' ? 'Admin' : 'İşçi'}
                    </span>
                  </div>

                  <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1 pt-1">
                    <p>
                      Şifrə: <span className="font-mono text-zinc-700 dark:text-zinc-300">••••••</span>
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {u.role === 'admin'
                        ? 'İcazə: Bütün hesabatlar, xalis mənfəət, xərclər, dizayn və ayarlar'
                        : 'İcazə: POS satış, günün hesabatı və borc ödənişi qəbulu'}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
                  <button
                    onClick={() => openEditUserModal(u)}
                    className="px-3 py-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg flex items-center gap-1"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Düzəliş et</span>
                  </button>

                  {u.id !== currentUser?.id && (
                    confirmDeleteUserId === u.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            deleteUser(u.id);
                            setConfirmDeleteUserId(null);
                          }}
                          className="px-2 py-1 text-xs font-bold bg-red-600 text-white rounded-lg"
                        >
                          Sil
                        </button>
                        <button
                          onClick={() => setConfirmDeleteUserId(null)}
                          className="px-2 py-1 text-xs bg-zinc-200 dark:bg-zinc-800 rounded-lg"
                        >
                          X
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteUserId(u.id)}
                        className="px-3 py-1 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Sil</span>
                      </button>
                    )
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
          <div className="p-6 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-red-500/40 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${
                    isSupabaseConnected
                      ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-amber-600 dark:text-amber-400 border-zinc-200 dark:border-zinc-700'
                  }`}
                >
                  <Radio className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-zinc-900 dark:text-white">
                      Supabase Vahid Baza & Real-Vaxt Sinxronizasiya
                    </h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                        isSupabaseConnected
                          ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                          : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                      }`}
                    >
                      {isSupabaseConnected ? 'Realtime Aktiv' : 'Lokal Rejim'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    İşçi və Admin cihazları eyni mərkəzi bazaya qoşulur. Loqo, borc ödənişləri və satışlar real vaxtda sinxronlaşır.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsSupabaseModalOpen(true)}
                style={{ backgroundColor: primaryColor }}
                className="px-4 py-2 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-2 whitespace-nowrap self-start sm:self-auto"
              >
                <Radio className="w-4 h-4" />
                <span>Supabase Parametrləri & SQL</span>
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/90 border border-zinc-200 dark:border-zinc-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-zinc-500 block uppercase text-[10px]">Realtime Status</span>
                <span className="font-bold text-zinc-800 dark:text-zinc-200">{supabaseStatus}</span>
              </div>
              <div>
                <span className="text-zinc-500 block uppercase text-[10px]">Çoxcihazlı Sinxronizasiya</span>
                <span className="font-bold text-zinc-800 dark:text-zinc-200">
                  {isSupabaseConnected ? 'Avtomatik (PC + iPhone + Android)' : 'Qoşulduqdan sonra aktiv'}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 block uppercase text-[10px]">Storage Bucket</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">branding (Public Read / Admin Write)</span>
              </div>
            </div>
          </div>

          <div className="p-6 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-500 flex items-center justify-center border border-red-200 dark:border-red-900/60">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Daimi Məlumat Bazası (IndexedDB + LocalStorage)
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Bütün əməliyyatlar ikiqat yaddaş mexanizmi ilə saxlanılır.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-zinc-500 block uppercase text-[10px]">Məhsullar</span>
                <span className="font-mono font-bold text-zinc-900 dark:text-white">{products.length} ədəd</span>
              </div>
              <div>
                <span className="text-zinc-500 block uppercase text-[10px]">Aktiv Satışlar</span>
                <span className="font-mono font-bold text-zinc-900 dark:text-white">{sales.length} qeyd</span>
              </div>
              <div>
                <span className="text-zinc-500 block uppercase text-[10px]">Borclar</span>
                <span className="font-mono font-bold text-zinc-900 dark:text-white">{debts.length} qeyd</span>
              </div>
              <div>
                <span className="text-zinc-500 block uppercase text-[10px]">Baza Vəziyyəti</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">Aktiv & Mühafizədə</span>
              </div>
            </div>
          </div>

          <div className="p-6 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-red-950/80 shadow-sm space-y-4">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                Satış və Əməliyyatları Sıfırlama
              </h3>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Məhsulları və istifadəçiləri toxunulmaz saxlayaraq əməliyyatları sıfırlayın və ya orijinal bazanı bərpa edin.
            </p>

            <div className="flex flex-wrap gap-3">
              {confirmResetAction === 'original' ? (
                <div className="flex items-center gap-2 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800">
                  <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                    11.11.2026 bazası bərpa edilsin?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      resetToOriginalBackup();
                      setConfirmResetAction('none');
                      showToast('success', '11.11.2026 tarixli orijinal baza tam bərpa edildi!');
                    }}
                    className="px-3 py-1 bg-amber-600 text-white font-bold text-xs rounded-lg"
                  >
                    Bəli
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResetAction('none')}
                    className="px-2.5 py-1 bg-zinc-200 dark:bg-zinc-800 text-xs rounded-lg"
                  >
                    Ləğv
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmResetAction('original')}
                  className="px-5 py-2.5 bg-amber-50 dark:bg-amber-950 hover:bg-amber-100 dark:hover:bg-amber-900 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 font-bold text-xs rounded-xl transition-colors flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>11.11.2026 Orijinal Bazasını Bərpa Et</span>
                </button>
              )}

              {confirmResetAction === 'zero' ? (
                <div className="flex items-center gap-2 p-2 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800">
                  <span className="text-xs font-semibold text-red-800 dark:text-red-200">
                    Bütün əməliyyatlar sıfırlansın?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      clearAllTransactions();
                      setConfirmResetAction('none');
                      showToast('info', 'Bütün satış və əməliyyat məlumatları sıfırlandı!');
                    }}
                    className="px-3 py-1 bg-red-600 text-white font-bold text-xs rounded-lg"
                  >
                    Sıfırla
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResetAction('none')}
                    className="px-2.5 py-1 bg-zinc-200 dark:bg-zinc-800 text-xs rounded-lg"
                  >
                    Ləğv
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmResetAction('zero')}
                  className="px-5 py-2.5 bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900 text-red-700 dark:text-red-200 border border-red-200 dark:border-red-800 font-bold text-xs rounded-xl transition-colors flex items-center gap-2"
                >
                  <Trash className="w-4 h-4 text-red-600 dark:text-red-400" />
                  <span>Bütün Satış və Hesabatları Sıfırla (0-la)</span>
                </button>
              )}
            </div>
          </div>

          <div className="p-6 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              Excel / CSV Formatında İxrac
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
              {[
                { label: 'Məhsullar', count: `${products.length} sətir`, color: 'text-red-500', onClick: () => exportProductsToCSV(products) },
                { label: 'Satışlar', count: `${sales.length} sətir`, color: 'text-blue-500', onClick: () => exportSalesToCSV(sales) },
                { label: 'Mal Qəbulu', count: `${purchases.length} sətir`, color: 'text-emerald-500', onClick: () => exportPurchasesToCSV(purchases) },
                { label: 'Borclar', count: `${debts.length} sətir`, color: 'text-rose-500', onClick: () => exportDebtsToCSV(debts) },
                { label: 'Xərclər', count: `${expenses.length} sətir`, color: 'text-purple-500', onClick: () => exportExpensesToCSV(expenses) },
                { label: 'Hesabatlar', count: `${dailyReports.length} gün`, color: 'text-amber-500', onClick: () => exportDailyReportsToCSV(dailyReports) },
              ].map(card => (
                <button
                  key={card.label}
                  onClick={card.onClick}
                  className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-left transition-colors"
                >
                  <FileSpreadsheet className={`w-5 h-5 ${card.color} mb-2`} />
                  <div className="text-xs font-bold text-zinc-900 dark:text-white">{card.label}</div>
                  <div className="text-[10px] text-zinc-500">{card.count}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="p-6 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              Tam Sistem Nüsxəsi (JSON Baza Faylı)
            </h3>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={handleDownloadFullBackup}
                style={{ backgroundColor: primaryColor }}
                className="px-4 py-2 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Tam Baza Faylını Endir (JSON)</span>
              </button>

              <label className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-2 cursor-pointer border border-zinc-200 dark:border-zinc-700">
                <Upload className="w-4 h-4 text-red-500" />
                <span>Fayldan Bərpa Et</span>
                <input type="file" accept=".json" onChange={handleRestoreFile} className="hidden" />
              </label>

              {confirmResetAction === 'sample' ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      resetToSampleData();
                      setConfirmResetAction('none');
                      showToast('info', 'İlkin bazaya qaytarıldı.');
                    }}
                    className="px-3 py-1.5 bg-red-600 text-white font-bold text-xs rounded-xl"
                  >
                    Təsdiqlə
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResetAction('none')}
                    className="px-3 py-1.5 bg-zinc-200 dark:bg-zinc-800 text-xs rounded-xl"
                  >
                    Ləğv
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmResetAction('sample')}
                  className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 font-bold text-xs rounded-xl transition-colors flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>İlkin Bazaya Qaytar</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          TAB 4: ƏMƏLİYYAT JURNALI (AUDIT LOG)
         ───────────────────────────────────────────────────────── */}
      {activeTab === 'audit' && (
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                Sistem Əməliyyat Jurnalı
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Kim, nə vaxt, hansı əməliyyatı həyata keçirdi
              </p>
            </div>
            <span className="text-xs text-zinc-500 font-mono">Son {auditLogs.length} əməliyyat</span>
          </div>

          <div className="divide-y divide-zinc-200 dark:divide-zinc-800 max-h-96 overflow-y-auto pr-1">
            {auditLogs.map(log => (
              <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                <div>
                  <span className="font-bold text-zinc-900 dark:text-white">{log.action}</span>
                  <span className="text-zinc-500 dark:text-zinc-400 ml-2">{log.details}</span>
                </div>
                <div className="flex items-center gap-3 text-zinc-500 font-mono text-[11px] shrink-0">
                  <span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-zinc-700 dark:text-zinc-300">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                {editingUserId ? 'İşçi Hesabını Redaktə Et' : 'Yeni İşçi Hesabı Yarat'}
              </h3>
              <button
                onClick={() => setIsUserModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Ad və Soyad
                </label>
                <input
                  type="text"
                  required
                  value={userName}
                  onChange={e => setUserName(e.target.value)}
                  placeholder="məs: Tural Qasımov"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  İstifadəçi Adı (Giriş üçün) *
                </label>
                <input
                  type="text"
                  required
                  value={userUsername}
                  onChange={e => setUserUsername(e.target.value)}
                  placeholder="məs: tural_bar"
                  className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Şifrə *
                </label>
                <input
                  type="text"
                  required
                  value={userPassword}
                  onChange={e => setUserPassword(e.target.value)}
                  placeholder="Şifrə təyin edin"
                  className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Rol və İcazə *
                </label>
                <select
                  value={userRole}
                  onChange={e => setUserRole(e.target.value as UserRole)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="isci">İşçi (POS Satış, Günün Hesabatı, Borc ödənişi qəbulu)</option>
                  <option value="admin">Admin (Tam səlahiyyət, dizayn və hesabatlar)</option>
                </select>
              </div>

              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-xl"
                >
                  Ləğv et
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: primaryColor }}
                  className="px-5 py-2 text-xs font-bold text-white rounded-xl shadow-sm"
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
