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
import { TablePagination } from '../components/TablePagination';
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
  { name: 'StrongBar Qırmızı', hex: '#E32636' },
  { name: 'Göy', hex: '#2563eb' },
  { name: 'Zümrüd', hex: '#059669' },
  { name: 'Kəhrəba', hex: '#d97706' },
  { name: 'Bənövşəyi', hex: '#7c3aed' },
  { name: 'Qrafit', hex: '#171717' },
];

export interface AdminPanelViewProps {
  initialTab?: 'design' | 'settings' | 'users' | 'backup' | 'audit';
}

export const AdminPanelView: React.FC<AdminPanelViewProps> = ({ initialTab = 'design' }) => {
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

  const [activeTab, setActiveTab] = useState<'design' | 'settings' | 'users' | 'backup' | 'audit'>(initialTab);
  const [auditPage, setAuditPage] = useState(1);
  const AUDIT_PAGE_SIZE = 20;
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);

  // Sync activeTab when navigated via sidebar (e.g. 'staff' vs 'admin')
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

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
  const [primaryColorInput, setPrimaryColorInput] = useState(settings.primaryColor || '#E32636');
  const [logoSizeInput, setLogoSizeInput] = useState<LogoSize>(settings.logoSize || 'md');
  const [logoPreview, setLogoPreview] = useState<string | null>(settings.logoUrl || null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isSavingDesign, setIsSavingDesign] = useState(false);
  const [designSuccess, setDesignSuccess] = useState<string | null>(null);
  const [designError, setDesignError] = useState<string | null>(null);
  const [confirmResetLogo, setConfirmResetLogo] = useState(false);
  const [confirmResetAction, setConfirmResetAction] = useState<'none' | 'original' | 'zero' | 'sample'>('none');

  const primaryColor = settings.primaryColor || '#E32636';

  // Sync local form values when realtime settings change externally
  useEffect(() => {
    setAppNameInput(settings.barName || 'Zal Barı');
    setPrimaryColorInput(settings.primaryColor || '#E32636');
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
        primaryColor: primaryColorInput || '#E32636',
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#E5E5E5] dark:border-[#262626]">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#171717] dark:text-white tracking-tight flex items-center gap-2.5">
            <span>Admin İdarəetmə Paneli</span>
            <span className="text-[11px] bg-[#E32636]/10 text-[#E32636] font-semibold px-2.5 py-0.5 rounded-[8px] border border-[#E32636]/25">
              Admin
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-[#888888] mt-0.5">
            Dinamik loqo və dizayn, bildirişlər, işçi hesabları və daimi baza idarəetməsi
          </p>
        </div>

        {/* Tab selection */}
        <div className="flex items-center p-1 bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] rounded-[12px] overflow-x-auto gap-1">
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
              className={`px-3 py-1.5 text-xs font-semibold rounded-[8px] transition-colors duration-150 whitespace-nowrap ${
                activeTab === t.id
                  ? 'text-white'
                  : 'text-[#888888] hover:text-[#171717] dark:hover:text-white'
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
          <div className="p-5 sm:p-6 bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E5E5E5] dark:border-[#262626]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-[10px] bg-[#E32636]/10 text-[#E32636] border border-[#E32636]/25 flex items-center justify-center shrink-0">
                  <Palette className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#171717] dark:text-white">
                    Dinamik Loqo, Rəng və Brendinq İdarəsi
                  </h3>
                  <p className="text-xs text-[#888888]">
                    Loqo Supabase Storage (branding bucket) üzərində saxlanılır və bütün cihazlarda dərhal yenilənir.
                  </p>
                </div>
              </div>

              {designSuccess && (
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 px-3 py-1.5 rounded-[10px]">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{designSuccess}</span>
                </span>
              )}
            </div>

            {designError && (
              <div className="p-3.5 text-xs bg-[#E32636]/10 text-[#E32636] rounded-[10px] border border-[#E32636]/25 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{designError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Live Preview Column */}
              <div className="lg:col-span-5 space-y-4">
                <span className="text-xs font-semibold text-[#888888] uppercase tracking-wider block">
                  Canlı Önizləmə (Açıq & Tünd Rejim)
                </span>

                {/* Desktop Header / Sidebar Preview */}
                <div className="p-4 rounded-[12px] bg-[#F5F5F5] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#2E2E2E] space-y-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#888888] block">
                    Menyu & Başlıq Görünüşü
                  </span>
                  <div className="p-3 rounded-[10px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between gap-2">
                    <Logo
                      variant="lockup"
                      sizeOverride={logoSizeInput}
                      previewLogoUrl={logoPreview}
                      previewAppName={appNameInput}
                      previewPrimaryColor={primaryColorInput}
                    />
                    <span
                      style={{ backgroundColor: primaryColorInput }}
                      className="px-2.5 py-1 rounded-[8px] text-[10px] font-semibold text-white shrink-0 whitespace-nowrap"
                    >
                      Aktiv Düymə
                    </span>
                  </div>
                </div>

                {/* Mobile & Favicon Preview */}
                <div className="p-4 rounded-[12px] bg-[#F5F5F5] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#2E2E2E] flex items-center justify-around gap-4">
                  <div className="text-center space-y-1.5">
                    <Logo
                      variant="icon"
                      sizeOverride="lg"
                      previewLogoUrl={logoPreview}
                      previewAppName={appNameInput}
                      previewPrimaryColor={primaryColorInput}
                    />
                    <span className="text-[10px] text-[#888888] block font-medium">
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
                    <span className="text-[10px] text-[#888888] block font-medium">
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
                    <label className="block text-xs font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                      Proqram / Bar Adı (app_name)
                    </label>
                    <input
                      type="text"
                      value={appNameInput}
                      onChange={e => setAppNameInput(e.target.value)}
                      placeholder="məs: Zal Barı"
                      className="w-full px-3.5 py-2 text-sm rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
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
                          className={`py-2 rounded-[10px] border text-xs font-semibold uppercase transition-colors duration-150 whitespace-nowrap ${
                            logoSizeInput === sz
                              ? 'text-white'
                              : 'bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-neutral-300 border-[#E5E5E5] dark:border-[#2E2E2E]'
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
                  <label className="block text-xs font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                    Əsas Brend Rəngi (primary_color)
                  </label>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <input
                      type="color"
                      value={primaryColorInput}
                      onChange={e => setPrimaryColorInput(e.target.value)}
                      aria-label="Əsas rəng seçici"
                      className="w-10 h-10 rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] cursor-pointer bg-transparent p-0.5"
                    />
                    <input
                      type="text"
                      value={primaryColorInput}
                      onChange={e => setPrimaryColorInput(e.target.value)}
                      className="w-28 px-3 py-2 text-xs font-mono tabular-nums rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      {COLOR_PRESETS.map(c => (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => setPrimaryColorInput(c.hex)}
                          title={c.name}
                          style={{ backgroundColor: c.hex }}
                          className={`w-7 h-7 rounded-[8px] border-2 transition-transform duration-150 ${
                            primaryColorInput.toLowerCase() === c.hex.toLowerCase()
                              ? 'border-[#171717] dark:border-white scale-110'
                              : 'border-transparent opacity-80 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* File Dropzone */}
                <div>
                  <label className="block text-xs font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                    Loqo Şəkli Yüklə (PNG, JPG, SVG, WebP · Maks. 2 MB)
                  </label>
                  <label className="flex flex-col items-center justify-center w-full h-28 border border-dashed border-[#E5E5E5] dark:border-[#2E2E2E] hover:border-[#E32636] rounded-[12px] cursor-pointer bg-[#F5F5F5] dark:bg-[#222222] transition-colors duration-150 p-4 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Camera className="w-6 h-6 text-[#888888] mb-1.5" />
                      <p className="text-xs text-[#171717] dark:text-neutral-200 font-semibold">
                        {logoFile ? `Seçildi: ${logoFile.name}` : 'Kompüter və ya telefondan şəkil seçin'}
                      </p>
                      <p className="text-[11px] text-[#888888] mt-0.5">
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
                    className="py-2.5 px-6 hover:opacity-95 disabled:opacity-50 text-white font-semibold text-xs rounded-[10px] transition-opacity duration-150 flex items-center gap-2 whitespace-nowrap"
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
                          className="py-2 px-4 bg-[#E32636] hover:bg-[#c81f2e] text-white font-semibold text-xs rounded-[10px] whitespace-nowrap"
                        >
                          Bəli, Loqonu Sil
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmResetLogo(false)}
                          className="py-2 px-3 bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-neutral-300 border border-[#E5E5E5] dark:border-[#2E2E2E] font-semibold text-xs rounded-[10px] whitespace-nowrap"
                        >
                          Ləğv et
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmResetLogo(true)}
                        className="py-2.5 px-4 bg-[#F5F5F5] dark:bg-[#222222] hover:bg-neutral-200 dark:hover:bg-[#2a2a2a] text-[#171717] dark:text-neutral-200 font-semibold text-xs rounded-[10px] transition-colors duration-150 border border-[#E5E5E5] dark:border-[#2E2E2E] flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-[#E32636]" />
                        <span>Loqonu Sil / Default-a Qaytar</span>
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* iPhone & Mobile PWA Installation Card */}
          <div className="p-5 sm:p-6 bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] flex flex-col md:flex-row items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-[12px] bg-[#E32636]/10 text-[#E32636] border border-[#E32636]/25 flex items-center justify-center shrink-0">
                <Smartphone className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-bold text-[#171717] dark:text-white tracking-tight">
                    iPhone və Mobil Cihazlara Quraşdırma (PWA)
                  </h4>
                  <span className="px-2 py-0.5 rounded-[8px] bg-[#E32636]/10 border border-[#E32636]/25 text-[#E32636] text-[10px] font-semibold">
                    Ana Ekran İkonu
                  </span>
                </div>
                <p className="text-xs text-[#888888] max-w-2xl">
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
            className="p-5 sm:p-6 bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5] dark:border-[#262626]">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[#E32636]" />
                <h3 className="text-base font-bold text-[#171717] dark:text-white">
                  Sistem Parametrləri & Qalıq Həddi
                </h3>
              </div>
              {settingsSaved && (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Check className="w-4 h-4" /> Saxlanıldı
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#888888] uppercase tracking-wider mb-1">
                Minimum Depo Qalıq Xəbərdarlıq Həddi (ədəd)
              </label>
              <p className="text-[11px] text-[#888888] mb-1.5">
                Məhsulun aktiv qalığı bu həddə və ya aşağı düşəndə xəbərdarlıq göndərilir.
              </p>
              <input
                type="number"
                min="1"
                value={minStockThreshold}
                onChange={e => setMinStockThreshold(e.target.value)}
                className="w-full px-3.5 py-2 text-sm font-mono tabular-nums rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
              />
            </div>

            <div className="p-4 rounded-[12px] bg-[#F5F5F5] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#2E2E2E] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BellRing className="w-4 h-4 text-[#E32636]" />
                  <span className="text-xs font-bold text-[#171717] dark:text-white block">
                    Brauzer Push-Bildirişləri
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={enablePushNotifications}
                  onChange={e => setEnablePushNotifications(e.target.checked)}
                  className="w-5 h-5 accent-[#E32636] rounded cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-[#888888]">
                Depo qalığı minimum həddən ({minStockThreshold} ədəd) aşağı düşdükdə bildiriş verilsin.
              </p>

              <div className="pt-2 border-t border-[#E5E5E5] dark:border-[#2E2E2E] flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] text-[#888888]">
                  Status:{' '}
                  <span
                    className={`font-semibold ${
                      notificationPermission === 'granted'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : notificationPermission === 'denied'
                        ? 'text-[#E32636]'
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
                      className="px-3 py-1 bg-[#E32636] hover:bg-[#c81f2e] text-white font-semibold text-[11px] rounded-[8px] transition-colors whitespace-nowrap"
                    >
                      İcazə İstə
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={triggerTestNotification}
                    className="px-3 py-1 bg-white dark:bg-[#171717] hover:bg-neutral-100 dark:hover:bg-[#2a2a2a] text-[#171717] dark:text-neutral-200 border border-[#E5E5E5] dark:border-[#2E2E2E] font-semibold text-[11px] rounded-[8px] transition-colors flex items-center gap-1 whitespace-nowrap"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-[#E32636]" />
                    <span>Sınaq Bildirişi</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-[12px] bg-[#F5F5F5] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#2E2E2E] space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-[#171717] dark:text-white block">
                    Satışların Avtomatik Təsdiqi
                  </span>
                  <p className="text-[11px] text-[#888888]">
                    Aktiv olduqda, satılan hər məhsul dərhal depodan çıxılır və gündəlik hesabata yazılır.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={autoConfirmSales}
                  onChange={e => setAutoConfirmSales(e.target.checked)}
                  className="w-5 h-5 accent-[#E32636] rounded cursor-pointer shrink-0"
                />
              </div>
            </div>

            <button
              type="submit"
              style={{ backgroundColor: primaryColor }}
              className="py-2.5 px-5 hover:opacity-95 text-white font-semibold text-xs rounded-[10px] transition-opacity duration-150 whitespace-nowrap"
            >
              Ayarları Yadda Saxla
            </button>
          </form>

          {/* Change Password Form */}
          <form
            onSubmit={handleChangePassword}
            className="p-5 sm:p-6 bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5] dark:border-[#262626]">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-[#E32636]" />
                <h3 className="text-base font-bold text-[#171717] dark:text-white">
                  Admin Şifrəsini Dəyiş
                </h3>
              </div>
              {passSuccess && (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Check className="w-4 h-4" /> Şifrə yeniləndi
                </span>
              )}
            </div>

            {passError && (
              <div className="p-3 text-xs bg-[#E32636]/10 text-[#E32636] rounded-[10px] border border-[#E32636]/25">
                {passError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#888888] uppercase tracking-wider mb-1">
                Cari Şifrə
              </label>
              <input
                type="password"
                required
                value={currentPass}
                onChange={e => setCurrentPass(e.target.value)}
                placeholder="Cari şifrəni yazın"
                className="w-full px-3.5 py-2 text-sm rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#888888] uppercase tracking-wider mb-1">
                Yeni Şifrə
              </label>
              <input
                type="password"
                required
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                placeholder="Yeni şifrəni yazın (min 4 simvol)"
                className="w-full px-3.5 py-2 text-sm rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
              />
            </div>

            <button
              type="submit"
              className="py-2.5 px-5 bg-[#171717] dark:bg-[#222222] hover:bg-neutral-800 dark:hover:bg-[#2c2c2c] border border-transparent dark:border-[#2E2E2E] text-white font-semibold text-xs rounded-[10px] transition-colors whitespace-nowrap"
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
          <div className="flex flex-wrap justify-between items-center gap-3">
            <h3 className="text-sm font-bold text-[#171717] dark:text-white">
              Sistem İstifadəçiləri və İcazələr ({users.length})
            </h3>
            <button
              onClick={openCreateUserModal}
              style={{ backgroundColor: primaryColor }}
              className="px-4 py-2 text-xs font-semibold text-white rounded-[10px] transition-opacity duration-150 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni İşçi Hesabı Yarat</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.map(u => (
              <div
                key={u.id}
                className="p-5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-[10px] flex items-center justify-center font-bold text-xs ${
                          u.role === 'admin'
                            ? 'bg-[#E32636]/10 text-[#E32636] border border-[#E32636]/25'
                            : 'bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-neutral-300 border border-[#E5E5E5] dark:border-[#2E2E2E]'
                        }`}
                      >
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-[#171717] dark:text-white">
                          {u.name}
                        </h4>
                        <span className="text-xs font-mono text-[#888888]">
                          @{u.username}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-[8px] uppercase tracking-wider border ${
                        u.role === 'admin'
                          ? 'bg-[#E32636]/10 text-[#E32636] border-[#E32636]/25'
                          : 'bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-neutral-300 border-[#E5E5E5] dark:border-[#2E2E2E]'
                      }`}
                    >
                      {u.role === 'admin' ? 'Admin' : 'İşçi'}
                    </span>
                  </div>

                  <div className="text-xs text-[#888888] space-y-1 pt-1">
                    <p>
                      Şifrə: <span className="font-mono text-[#171717] dark:text-neutral-300">••••••</span>
                    </p>
                    <p className="text-[11px] text-[#888888]">
                      {u.role === 'admin'
                        ? 'İcazə: Bütün hesabatlar, xalis mənfəət, xərclər, dizayn və ayarlar'
                        : 'İcazə: POS satış, günün hesabatı və borc ödənişi qəbulu'}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#E5E5E5] dark:border-[#262626] flex justify-end gap-2">
                  <button
                    onClick={() => openEditUserModal(u)}
                    className="px-3 py-1.5 text-xs font-semibold text-[#171717] dark:text-neutral-200 hover:bg-[#F5F5F5] dark:hover:bg-[#222222] rounded-[8px] flex items-center gap-1 whitespace-nowrap"
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
                          className="px-2.5 py-1 text-xs font-semibold bg-[#E32636] text-white rounded-[8px]"
                        >
                          Sil
                        </button>
                        <button
                          onClick={() => setConfirmDeleteUserId(null)}
                          className="px-2.5 py-1 text-xs bg-[#F5F5F5] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#2E2E2E] rounded-[8px]"
                        >
                          X
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteUserId(u.id)}
                        className="px-3 py-1.5 text-xs font-semibold text-[#E32636] hover:bg-[#E32636]/10 rounded-[8px] flex items-center gap-1 whitespace-nowrap"
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
          <div className="p-5 sm:p-6 bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-[12px] flex items-center justify-center border shrink-0 ${
                    isSupabaseConnected
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/70'
                      : 'bg-[#F5F5F5] dark:bg-[#222222] text-amber-600 dark:text-amber-400 border-[#E5E5E5] dark:border-[#2E2E2E]'
                  }`}
                >
                  <Radio className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-[#171717] dark:text-white">
                      Supabase Vahid Baza & Real-Vaxt Sinxronizasiya
                    </h3>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-[8px] uppercase tracking-wider border ${
                        isSupabaseConnected
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/70'
                          : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/70'
                      }`}
                    >
                      {isSupabaseConnected ? 'Realtime Aktiv' : 'Lokal Rejim'}
                    </span>
                  </div>
                  <p className="text-xs text-[#888888] mt-0.5">
                    İşçi və Admin cihazları eyni mərkəzi bazaya qoşulur. Loqo, borc ödənişləri və satışlar real vaxtda sinxronlaşır.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsSupabaseModalOpen(true)}
                style={{ backgroundColor: primaryColor }}
                className="px-4 py-2 text-white font-semibold text-xs rounded-[10px] transition-opacity duration-150 flex items-center gap-2 whitespace-nowrap self-start sm:self-auto"
              >
                <Radio className="w-4 h-4" />
                <span>Supabase Parametrləri & SQL</span>
              </button>
            </div>

            <div className="p-4 rounded-[12px] bg-[#F5F5F5] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#2E2E2E] grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-[#888888] block uppercase text-[10px]">Realtime Status</span>
                <span className="font-semibold text-[#171717] dark:text-neutral-200">{supabaseStatus}</span>
              </div>
              <div>
                <span className="text-[#888888] block uppercase text-[10px]">Çoxcihazlı Sinxronizasiya</span>
                <span className="font-semibold text-[#171717] dark:text-neutral-200">
                  {isSupabaseConnected ? 'Avtomatik (PC + iPhone + Android)' : 'Qoşulduqdan sonra aktiv'}
                </span>
              </div>
              <div>
                <span className="text-[#888888] block uppercase text-[10px]">Storage Bucket</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">branding (Public Read / Admin Write)</span>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-6 bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[10px] bg-[#E32636]/10 text-[#E32636] flex items-center justify-center border border-[#E32636]/25 shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#171717] dark:text-white">
                  Daimi Məlumat Bazası (IndexedDB + LocalStorage)
                </h3>
                <p className="text-xs text-[#888888]">
                  Bütün əməliyyatlar ikiqat yaddaş mexanizmi ilə saxlanılır.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-[12px] bg-[#F5F5F5] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#2E2E2E] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-[#888888] block uppercase text-[10px]">Məhsullar</span>
                <span className="font-mono tabular-nums font-bold text-[#171717] dark:text-white">{products.length} ədəd</span>
              </div>
              <div>
                <span className="text-[#888888] block uppercase text-[10px]">Aktiv Satışlar</span>
                <span className="font-mono tabular-nums font-bold text-[#171717] dark:text-white">{sales.length} qeyd</span>
              </div>
              <div>
                <span className="text-[#888888] block uppercase text-[10px]">Borclar</span>
                <span className="font-mono tabular-nums font-bold text-[#171717] dark:text-white">{debts.length} qeyd</span>
              </div>
              <div>
                <span className="text-[#888888] block uppercase text-[10px]">Baza Vəziyyəti</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Aktiv & Mühafizədə</span>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-6 bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] space-y-4">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-[#E32636]" />
              <h3 className="text-base font-bold text-[#171717] dark:text-white">
                Satış və Əməliyyatları Sıfırlama
              </h3>
            </div>
            <p className="text-xs text-[#888888]">
              Məhsulları və istifadəçiləri toxunulmaz saxlayaraq əməliyyatları sıfırlayın və ya orijinal bazanı bərpa edin.
            </p>

            <div className="flex flex-wrap gap-3">
              {confirmResetAction === 'original' ? (
                <div className="flex items-center gap-2 p-2 rounded-[10px] bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70">
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
                    className="px-3 py-1 bg-amber-600 text-white font-semibold text-xs rounded-[8px]"
                  >
                    Bəli
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResetAction('none')}
                    className="px-2.5 py-1 bg-[#F5F5F5] dark:bg-[#222222] text-xs rounded-[8px]"
                  >
                    Ləğv
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmResetAction('original')}
                  className="px-4 py-2.5 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/70 font-semibold text-xs rounded-[10px] transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                  <RotateCcw className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>11.11.2026 Orijinal Bazasını Bərpa Et</span>
                </button>
              )}

              {confirmResetAction === 'zero' ? (
                <div className="flex items-center gap-2 p-2 rounded-[10px] bg-[#E32636]/10 border border-[#E32636]/30">
                  <span className="text-xs font-semibold text-[#E32636]">
                    Bütün əməliyyatlar sıfırlansın?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      clearAllTransactions();
                      setConfirmResetAction('none');
                      showToast('info', 'Bütün satış və əməliyyat məlumatları sıfırlandı!');
                    }}
                    className="px-3 py-1 bg-[#E32636] text-white font-semibold text-xs rounded-[8px]"
                  >
                    Sıfırla
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResetAction('none')}
                    className="px-2.5 py-1 bg-[#F5F5F5] dark:bg-[#222222] text-xs rounded-[8px]"
                  >
                    Ləğv
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmResetAction('zero')}
                  className="px-4 py-2.5 bg-[#E32636]/10 hover:bg-[#E32636]/15 text-[#E32636] border border-[#E32636]/25 font-semibold text-xs rounded-[10px] transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                  <Trash className="w-4 h-4 text-[#E32636]" />
                  <span>Bütün Satış və Hesabatları Sıfırla (0-la)</span>
                </button>
              )}
            </div>
          </div>

          <div className="p-5 sm:p-6 bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] space-y-4">
            <h3 className="text-base font-bold text-[#171717] dark:text-white">
              Excel / CSV Formatında İxrac
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
              {[
                { label: 'Məhsullar', count: `${products.length} sətir`, color: 'text-[#E32636]', onClick: () => exportProductsToCSV(products) },
                { label: 'Satışlar', count: `${sales.length} sətir`, color: 'text-blue-500', onClick: () => exportSalesToCSV(sales) },
                { label: 'Mal Qəbulu', count: `${purchases.length} sətir`, color: 'text-emerald-500', onClick: () => exportPurchasesToCSV(purchases) },
                { label: 'Borclar', count: `${debts.length} sətir`, color: 'text-rose-500', onClick: () => exportDebtsToCSV(debts) },
                { label: 'Xərclər', count: `${expenses.length} sətir`, color: 'text-purple-500', onClick: () => exportExpensesToCSV(expenses) },
                { label: 'Hesabatlar', count: `${dailyReports.length} gün`, color: 'text-amber-500', onClick: () => exportDailyReportsToCSV(dailyReports) },
              ].map(card => (
                <button
                  key={card.label}
                  onClick={card.onClick}
                  className="p-3 rounded-[12px] bg-[#F5F5F5] dark:bg-[#222222] hover:bg-neutral-200/70 dark:hover:bg-[#2a2a2a] border border-[#E5E5E5] dark:border-[#2E2E2E] text-left transition-colors"
                >
                  <FileSpreadsheet className={`w-5 h-5 ${card.color} mb-2`} />
                  <div className="text-xs font-bold text-[#171717] dark:text-white">{card.label}</div>
                  <div className="text-[10px] font-mono tabular-nums text-[#888888]">{card.count}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="p-5 sm:p-6 bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] space-y-4">
            <h3 className="text-base font-bold text-[#171717] dark:text-white">
              Tam Sistem Nüsxəsi (JSON Baza Faylı)
            </h3>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={handleDownloadFullBackup}
                style={{ backgroundColor: primaryColor }}
                className="px-4 py-2 text-white font-semibold text-xs rounded-[10px] transition-opacity duration-150 flex items-center gap-2 whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span>Tam Baza Faylını Endir (JSON)</span>
              </button>

              <label className="px-4 py-2 bg-[#F5F5F5] dark:bg-[#222222] hover:bg-neutral-200 dark:hover:bg-[#2a2a2a] text-[#171717] dark:text-white font-semibold text-xs rounded-[10px] transition-colors flex items-center gap-2 cursor-pointer border border-[#E5E5E5] dark:border-[#2E2E2E] whitespace-nowrap">
                <Upload className="w-4 h-4 text-[#E32636]" />
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
                    className="px-3 py-1.5 bg-[#E32636] text-white font-semibold text-xs rounded-[8px]"
                  >
                    Təsdiqlə
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResetAction('none')}
                    className="px-3 py-1.5 bg-[#F5F5F5] dark:bg-[#222222] text-xs rounded-[8px]"
                  >
                    Ləğv
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmResetAction('sample')}
                  className="px-4 py-2 bg-[#F5F5F5] dark:bg-[#222222] hover:bg-neutral-200 dark:hover:bg-[#2a2a2a] text-[#888888] hover:text-[#171717] dark:hover:text-white font-semibold text-xs rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] transition-colors flex items-center gap-2 whitespace-nowrap"
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
        <div className="bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] overflow-hidden">
          <div className="p-5 sm:p-6 pb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E5E5] dark:border-[#262626]">
            <div>
              <h3 className="text-base font-bold text-[#171717] dark:text-white">
                Sistem Əməliyyat Jurnalı
              </h3>
              <p className="text-xs text-[#888888]">
                Kim, nə vaxt, hansı əməliyyatı həyata keçirdi
              </p>
            </div>
            <span className="text-xs text-[#888888] font-mono tabular-nums">
              Cəmi {auditLogs.length} əməliyyat
            </span>
          </div>

          <div className="divide-y divide-[#E5E5E5] dark:divide-[#262626] px-5 sm:px-6">
            {auditLogs.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#888888]">
                Hələ heç bir əməliyyat qeydi yoxdur.
              </div>
            ) : (
              auditLogs
                .slice((auditPage - 1) * AUDIT_PAGE_SIZE, auditPage * AUDIT_PAGE_SIZE)
                .map(log => (
                  <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
                    <div>
                      <span className="font-semibold text-[#171717] dark:text-white">{log.action}</span>
                      <span className="text-[#888888] ml-2">{log.details}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[#888888] font-mono tabular-nums text-[11px] shrink-0">
                      <span className="bg-[#F5F5F5] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#2E2E2E] px-2 py-0.5 rounded-[6px] text-[#171717] dark:text-neutral-300">
                        @{log.username}
                      </span>
                      <span>{formatDateTimeAZ(log.timestamp)}</span>
                    </div>
                  </div>
                ))
            )}
          </div>

          <TablePagination
            totalItems={auditLogs.length}
            pageSize={AUDIT_PAGE_SIZE}
            currentPage={auditPage}
            onPageChange={setAuditPage}
            primaryColor={primaryColor}
          />
        </div>
      )}

      {/* Modal: Create/Edit User */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#171717] w-full max-w-md rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#171717] dark:text-white">
                {editingUserId ? 'İşçi Hesabını Redaktə Et' : 'Yeni İşçi Hesabı Yarat'}
              </h3>
              <button
                onClick={() => setIsUserModalOpen(false)}
                className="p-1.5 text-[#888888] hover:text-[#171717] dark:hover:text-white rounded-[8px]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#888888] uppercase tracking-wider mb-1">
                  Ad və Soyad
                </label>
                <input
                  type="text"
                  required
                  value={userName}
                  onChange={e => setUserName(e.target.value)}
                  placeholder="məs: Tural Qasımov"
                  className="w-full px-3.5 py-2 text-sm rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#888888] uppercase tracking-wider mb-1">
                  İstifadəçi Adı (Giriş üçün) *
                </label>
                <input
                  type="text"
                  required
                  value={userUsername}
                  onChange={e => setUserUsername(e.target.value)}
                  placeholder="məs: tural_bar"
                  className="w-full px-3.5 py-2 text-sm font-mono rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#888888] uppercase tracking-wider mb-1">
                  Şifrə *
                </label>
                <input
                  type="text"
                  required
                  value={userPassword}
                  onChange={e => setUserPassword(e.target.value)}
                  placeholder="Şifrə təyin edin"
                  className="w-full px-3.5 py-2 text-sm font-mono rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#888888] uppercase tracking-wider mb-1">
                  Rol və İcazə *
                </label>
                <select
                  value={userRole}
                  onChange={e => setUserRole(e.target.value as UserRole)}
                  className="w-full px-3.5 py-2 text-sm rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                >
                  <option value="isci">İşçi (POS Satış, Günün Hesabatı, Borc ödənişi qəbulu)</option>
                  <option value="admin">Admin (Tam səlahiyyət, dizayn və hesabatlar)</option>
                </select>
              </div>

              <div className="pt-3 border-t border-[#E5E5E5] dark:border-[#262626] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#888888] hover:text-[#171717] dark:hover:text-white rounded-[10px]"
                >
                  Ləğv et
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: primaryColor }}
                  className="px-5 py-2 text-xs font-semibold text-white rounded-[10px]"
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
