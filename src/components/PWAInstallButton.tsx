import React, { useState } from 'react';
import { Download, Smartphone, CheckCircle } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { IosInstallGuideModal } from './IosInstallGuideModal';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'full' | 'banner';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'compact', className = '' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  // If already running inside standalone app mode
  if (isInstalled) {
    if (variant === 'full') {
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
          <CheckCircle className="w-4 h-4" />
          <span>Ana ekrana quraşdırılıb (Tətbiq Rejimi)</span>
        </div>
      );
    }
    return null;
  }

  // Click handler
  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      // For iOS or browsers without native prompt, open guided instructions
      setShowIOSModal(true);
    }
  };

  if (variant === 'banner') {
    return (
      <>
        <div className={`p-4 rounded-2xl bg-gradient-to-r from-zinc-900 to-zinc-950 border border-red-500/30 flex items-center justify-between gap-4 shadow-lg ${className}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 text-red-400 border border-red-600/30 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">
                {isIOS ? "iPhone Ana Ekranına Əlavə Et" : "Proqramı Telefona Quraşdır"}
              </p>
              <p className="text-xs text-zinc-400 truncate">
                {isIOS ? "Safari vasitəsilə tətbiq kimi işə salın" : "Offline və sürətli kassa təcrübəsi"}
              </p>
            </div>
          </div>
          <button
            onClick={handleClick}
            className="flex-shrink-0 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md shadow-red-600/30 transition active:scale-95 flex items-center gap-1.5"
          >
            {isInstallable ? <Download className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
            <span>{isIOS ? "iPhone-a Əlavə Et" : "Quraşdır"}</span>
          </button>
        </div>

        <IosInstallGuideModal
          isOpen={showIOSModal}
          onClose={() => setShowIOSModal(false)}
        />
      </>
    );
  }

  return (
    <>
      <button
        onClick={handleClick}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 ${
          variant === 'full'
            ? 'w-full justify-center bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white shadow-md shadow-red-600/30 py-2.5'
            : 'bg-zinc-900 hover:bg-zinc-800 text-red-400 border border-red-500/30 hover:border-red-500/60'
        } ${className}`}
        title="Proqramı iPhone və ya kompüterin ana ekranına əlavə edin"
      >
        <Smartphone className="w-3.5 h-3.5" />
        <span>{isIOS ? "iPhone Ana Ekrana Əlavə Et" : "Ana Ekrana Əlavə Et"}</span>
      </button>

      <IosInstallGuideModal
        isOpen={showIOSModal}
        onClose={() => setShowIOSModal(false)}
      />
    </>
  );
};
