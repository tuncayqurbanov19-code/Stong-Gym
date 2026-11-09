import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-16 lg:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600/95 text-white px-3.5 py-2 text-xs font-semibold shadow-2xl backdrop-blur-sm border border-amber-400/40 animate-in fade-in slide-in-from-bottom-2">
      <WifiOff className="w-4 h-4 shrink-0 animate-pulse text-amber-200" />
      <span>Oflayn Rejim — Məlumatlar yerli daimi bazada qorunur.</span>
    </div>
  );
};
