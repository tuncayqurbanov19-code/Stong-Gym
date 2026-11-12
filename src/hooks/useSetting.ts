import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { AppSettings, LogoSize } from '../types';

export type SettingKey =
  | 'logo_url'
  | 'primary_color'
  | 'logo_size'
  | 'app_name'
  | 'min_stock_threshold'
  | 'auto_confirm_sales'
  | 'enable_push_notifications'
  | keyof AppSettings;

export interface UseSettingResult<T = string> {
  value: T;
  isLoading: boolean;
}

export function useSetting(key: 'logo_url'): UseSettingResult<string | undefined>;
export function useSetting(key: 'primary_color'): UseSettingResult<string>;
export function useSetting(key: 'logo_size'): UseSettingResult<LogoSize>;
export function useSetting(key: 'app_name'): UseSettingResult<string>;
export function useSetting<T = unknown>(key: SettingKey): UseSettingResult<T>;
export function useSetting(key: SettingKey): UseSettingResult<unknown> {
  const { settings, settingsLoading } = useApp();

  const value = useMemo(() => {
    switch (key) {
      case 'logo_url':
      case 'logoUrl':
        return settings.logoUrl;
      case 'primary_color':
      case 'primaryColor':
        return settings.primaryColor || '#dc2626';
      case 'logo_size':
      case 'logoSize':
        return settings.logoSize || 'md';
      case 'app_name':
      case 'barName':
        return settings.barName || 'Zal Barı';
      case 'min_stock_threshold':
      case 'minStockThreshold':
        return settings.minStockThreshold;
      case 'auto_confirm_sales':
      case 'autoConfirmSales':
        return settings.autoConfirmSales;
      case 'enable_push_notifications':
      case 'enablePushNotifications':
        return settings.enablePushNotifications;
      default:
        return undefined;
    }
  }, [key, settings]);

  return { value, isLoading: settingsLoading };
}
