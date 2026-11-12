import React from 'react';
import { Share, PlusSquare, Smartphone, CheckCircle2, X } from 'lucide-react';
import { Logo } from './Logo';
import { useApp } from '../context/AppContext';

interface IosInstallGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IosInstallGuideModal: React.FC<IosInstallGuideModalProps> = ({ isOpen, onClose }) => {
  const { settings } = useApp();
  const appName = settings.barName || 'Zal Barı';
  const primaryColor = settings.primaryColor || '#dc2626';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-950 border border-red-200 dark:border-red-500/30 p-6 shadow-2xl text-zinc-900 dark:text-zinc-100 relative max-h-[90vh] overflow-y-auto"
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

        {/* Header with Dynamic Logo */}
        <div className="flex items-center gap-4 mb-5">
          <Logo variant="icon" sizeOverride="lg" />
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400 text-xs font-semibold mb-1">
              <Smartphone className="w-3.5 h-3.5" />
              iPhone & iPad Bələdçisi
            </div>
            <h3 className="text-lg font-black text-zinc-900 dark:text-white tracking-wide">
              Ana Ekrana Əlavə Et
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Proqram kimi bir toxunuşla işlətmək üçün
            </p>
          </div>
        </div>

        {/* Benefits banner */}
        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 mb-5 text-xs text-zinc-700 dark:text-zinc-300 space-y-1.5">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>Brauzer ünvan paneli olmadan tam ekran (Native App)</span>
          </div>
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>Offline rejimdə sürətli işləmə və daimi yaddaş</span>
          </div>
        </div>

        {/* Step-by-Step Instructions */}
        <div className="space-y-4 mb-6">
          <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80">
            <div className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-600/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-600/30 font-black text-sm flex items-center justify-center flex-shrink-0">
              1
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2 flex-wrap">
                <span>Safari-də</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-600/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 rounded text-xs">
                  <Share className="w-3 h-3" /> Paylaş (Share)
                </span>
                <span>düyməsinə vurun</span>
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Ekranın alt menyusunda (və ya iPad-də yuxarıda) olan kvadrat və yuxarı ox işarəsinə toxunun.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80">
            <div className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-600/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-600/30 font-black text-sm flex items-center justify-center flex-shrink-0">
              2
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2 flex-wrap">
                <span>Aşağı diyirləyib</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 rounded text-xs font-semibold">
                  <PlusSquare className="w-3.5 h-3.5 text-red-500" /> Ana Ekrana Əlavə Et
                </span>
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                (İngiliscə: <em>"Add to Home Screen"</em> / Rusca: <em>«На экран "Домой"»</em>) bəndini seçin.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80">
            <div className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-600/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-600/30 font-black text-sm flex items-center justify-center flex-shrink-0">
              3
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2 flex-wrap">
                <span>Yuxarı sağ küncdəki</span>
                <span style={{ backgroundColor: primaryColor }} className="px-2 py-0.5 text-white rounded text-xs font-bold">
                  Əlavə et (Add)
                </span>
                <span>düyməsini sıxın</span>
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Təsdiq etdikdən sonra <strong>{appName}</strong> ikonu iPhone-un ana ekranına düşəcək və tam proqram kimi açılacaq.
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            style={{ backgroundColor: primaryColor }}
            className="w-full py-2.5 px-4 rounded-xl text-white font-bold text-sm shadow-lg transition hover:opacity-90 active:scale-[0.98]"
          >
            Aydındır, Bağla
          </button>
        </div>
      </div>
    </div>
  );
};
