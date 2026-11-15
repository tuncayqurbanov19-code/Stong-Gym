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

  if (isInstalled) {
    if (variant === 'full') {
      return (
        <div className="flex items-center gap-2 px-3 py-2 rounded-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span className="truncate">Tətbiq quraşdırılıb</span>
        </div>
      );
    }
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowIOSModal(true);
    }
  };

  if (variant === 'banner') {
    return (
      <>
        <div className={`p-4 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between gap-4 ${className}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-[10px] bg-[#E32636]/10 text-[#E32636] border border-[#E32636]/30 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#171717] dark:text-white truncate">
                {isIOS ? 'iPhone Ana Ekranına Əlavə Et' : 'Proqramı Telefona Quraşdır'}
              </p>
              <p className="text-xs text-[#888888] truncate">
                {isIOS ? 'Safari vasitəsilə tətbiq kimi işə salın' : 'Offline və sürətli kassa təcrübəsi'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClick}
            className="flex-shrink-0 px-3.5 py-2 rounded-[10px] bg-[#E32636] hover:bg-[#c91e2d] text-white font-semibold text-xs transition flex items-center gap-1.5"
          >
            {isInstallable ? <Download className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
            <span>{isIOS ? 'Əlavə Et' : 'Quraşdır'}</span>
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
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center gap-2 rounded-[10px] text-xs font-semibold transition-colors ${
          variant === 'full'
            ? 'w-full justify-center bg-[#F5F5F5] dark:bg-[#222222] hover:bg-[#EBEBEB] dark:hover:bg-[#2B2B2B] text-[#171717] dark:text-white border border-[#E5E5E5] dark:border-[#2E2E2E] py-2 px-3'
            : 'w-9 h-9 justify-center bg-[#F5F5F5] dark:bg-[#222222] hover:bg-[#EBEBEB] dark:hover:bg-[#2B2B2B] text-[#E32636] border border-[#E5E5E5] dark:border-[#262626]'
        } ${className}`}
        title="Proqramı ana ekrana əlavə edin"
      >
        <Smartphone className="w-4 h-4 shrink-0" />
        {variant === 'full' && (
          <span className="truncate">{isIOS ? 'iPhone Ana Ekrana Əlavə Et' : 'Ana Ekrana Əlavə Et'}</span>
        )}
      </button>

      <IosInstallGuideModal
        isOpen={showIOSModal}
        onClose={() => setShowIOSModal(false)}
      />
    </>
  );
};
