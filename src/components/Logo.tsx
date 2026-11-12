import React, { useState, useEffect } from 'react';
import { Dumbbell } from 'lucide-react';
import { useSetting } from '../hooks/useSetting';
import { LogoSize } from '../types';

export interface LogoProps {
  variant?: 'icon' | 'lockup' | 'compact';
  sizeOverride?: LogoSize;
  subtitle?: string;
  className?: string;
  previewLogoUrl?: string | null;
  previewAppName?: string;
  previewPrimaryColor?: string;
}

const SIZE_MAP: Record<LogoSize, { box: string; icon: string; title: string }> = {
  sm: { box: 'w-8 h-8 rounded-lg', icon: 'w-4 h-4', title: 'text-sm' },
  md: { box: 'w-10 h-10 rounded-xl', icon: 'w-5 h-5', title: 'text-base' },
  lg: { box: 'w-12 h-12 rounded-2xl', icon: 'w-6 h-6', title: 'text-lg' },
};

export const Logo: React.FC<LogoProps> = ({
  variant = 'lockup',
  sizeOverride,
  subtitle = 'İdarəetmə & POS',
  className = '',
  previewLogoUrl,
  previewAppName,
  previewPrimaryColor,
}) => {
  const { value: settingLogoUrl, isLoading } = useSetting('logo_url');
  const { value: settingAppName } = useSetting('app_name');
  const { value: settingLogoSize } = useSetting('logo_size');
  const { value: settingPrimaryColor } = useSetting('primary_color');

  const logoUrl = previewLogoUrl !== undefined ? previewLogoUrl || undefined : settingLogoUrl;
  const appName = previewAppName !== undefined ? previewAppName : settingAppName;
  const logoSize = sizeOverride || settingLogoSize || 'md';
  const primaryColor = previewPrimaryColor || settingPrimaryColor || '#dc2626';

  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [logoUrl]);

  const sizeTokens =
    variant === 'compact'
      ? { box: 'w-7 h-7 rounded-lg', icon: 'w-3.5 h-3.5', title: 'text-xs' }
      : SIZE_MAP[logoSize] || SIZE_MAP.md;

  const iconBox = isLoading && !previewLogoUrl ? (
    <div
      className={`${sizeTokens.box} bg-zinc-200 dark:bg-zinc-800 animate-pulse shrink-0`}
      aria-label="Loqo yüklənir"
    />
  ) : logoUrl && !imgError ? (
    <div
      className={`${sizeTokens.box} bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center overflow-hidden shrink-0 shadow-sm`}
    >
      <img
        src={logoUrl}
        alt={appName}
        onError={() => setImgError(true)}
        className="w-full h-full object-contain p-0.5"
      />
    </div>
  ) : (
    <div
      style={{ backgroundColor: primaryColor }}
      className={`${sizeTokens.box} text-white flex items-center justify-center font-bold overflow-hidden shrink-0 shadow-sm`}
    >
      <Dumbbell className={`${sizeTokens.icon} stroke-[2.2]`} />
    </div>
  );

  if (variant === 'icon') {
    return <div className={`inline-flex items-center justify-center ${className}`}>{iconBox}</div>;
  }

  return (
    <div className={`inline-flex items-center gap-2.5 min-w-0 ${className}`}>
      {iconBox}
      <div className="min-w-0">
        <div
          className={`${sizeTokens.title} font-extrabold text-zinc-900 dark:text-white tracking-tight leading-tight truncate`}
        >
          {appName}
        </div>
        {variant === 'lockup' && subtitle && (
          <div
            style={{ color: primaryColor }}
            className="text-[11px] font-semibold leading-tight truncate"
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
};
