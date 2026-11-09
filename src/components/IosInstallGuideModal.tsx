import React from 'react';
import { Share, PlusSquare, Smartphone, CheckCircle2, X } from 'lucide-react';

interface IosInstallGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IosInstallGuideModal: React.FC<IosInstallGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md rounded-2xl bg-zinc-950 border border-red-500/30 p-6 shadow-2xl text-zinc-100 relative max-h-[90vh] overflow-y-auto"
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

        {/* Header with App Icon */}
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 to-zinc-950 p-0.5 shadow-lg shadow-red-600/30 flex-shrink-0">
            <div className="w-full h-full bg-zinc-950 rounded-[14px] flex items-center justify-center p-1">
              <img src="/icon.svg" alt="Zal Barı" className="w-full h-full object-contain" />
            </div>
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-600/10 border border-red-500/30 text-red-400 text-xs font-semibold mb-1">
              <Smartphone className="w-3.5 h-3.5" />
              iPhone & iPad Bələdçisi
            </div>
            <h3 className="text-lg font-black text-white tracking-wide">
              Ana Ekrana Əlavə Et
            </h3>
            <p className="text-xs text-zinc-400">
              Proqram kimi bir toxunuşla işlətmək üçün
            </p>
          </div>
        </div>

        {/* Benefits banner */}
        <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 mb-5 text-xs text-zinc-300 space-y-1.5">
          <div className="flex items-center gap-2 text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>Brauzer ünvan paneli olmadan tam ekran (Native App)</span>
          </div>
          <div className="flex items-center gap-2 text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>Offline rejimdə sürətli işləmə və daimi yaddaş</span>
          </div>
        </div>

        {/* Step-by-Step Instructions */}
        <div className="space-y-4 mb-6">
          {/* Step 1 */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <div className="w-7 h-7 rounded-lg bg-red-600/20 text-red-400 border border-red-600/30 font-black text-sm flex items-center justify-center flex-shrink-0">
              1
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-white flex items-center gap-2">
                <span>Safari-də</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded text-xs">
                  <Share className="w-3 h-3" /> Paylaş (Share)
                </span>
                <span>düyməsinə vurun</span>
              </p>
              <p className="text-xs text-zinc-400">
                Ekranın alt menyusunda (və ya iPad-də yuxarıda) olan kvadrat və yuxarı ox işarəsinə toxunun.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <div className="w-7 h-7 rounded-lg bg-red-600/20 text-red-400 border border-red-600/30 font-black text-sm flex items-center justify-center flex-shrink-0">
              2
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-white flex items-center gap-2">
                <span>Aşağı diyirləyib</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800 text-zinc-200 border border-zinc-700 rounded text-xs font-semibold">
                  <PlusSquare className="w-3.5 h-3.5 text-red-500" /> Ana Ekrana Əlavə Et
                </span>
              </p>
              <p className="text-xs text-zinc-400">
                (İngiliscə: <em>"Add to Home Screen"</em> / Rusca: <em>«На экран "Домой"»</em>) bəndini seçin.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <div className="w-7 h-7 rounded-lg bg-red-600/20 text-red-400 border border-red-600/30 font-black text-sm flex items-center justify-center flex-shrink-0">
              3
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-white flex items-center gap-2">
                <span>Yuxarı sağ küncdəki</span>
                <span className="px-2 py-0.5 bg-red-600 text-white rounded text-xs font-bold">
                  Əlavə et (Add)
                </span>
                <span>düyməsini sıxın</span>
              </p>
              <p className="text-xs text-zinc-400">
                Təsdiq etdikdən sonra <strong>Zal Barı</strong> ikonu iPhone-un ana ekranına düşəcək və tam proqram kimi açılacaq.
              </p>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold text-sm shadow-lg shadow-red-600/30 transition active:scale-[0.98]"
          >
            Aydındır, Bağla
          </button>
        </div>
      </div>
    </div>
  );
};
