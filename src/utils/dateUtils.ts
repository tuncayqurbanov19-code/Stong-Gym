/**
 * Date and currency formatting utilities for Zal Barı
 */

export function getTodayISODate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentTimeHHMM(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Formats YYYY-MM-DD or ISO timestamp into Azerbaijani date format GG.AA.İİİİ
 */
export function formatDateAZ(isoDateString?: string | null): string {
  if (!isoDateString) return '-';
  const clean = isoDateString.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}.${m}.${y}`;
  }
  return isoDateString;
}

/**
 * Formats date and time into GG.AA.İİİİ HH:mm
 */
export function formatDateTimeAZ(isoString?: string | null): string {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return formatDateAZ(isoString);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

/**
 * Formats number as AZN currency with 2 decimals
 */
export function formatAZN(amount: number | null | undefined): string {
  const val = Number(amount) || 0;
  return `${val.toFixed(2)} AZN`;
}

/**
 * Returns current month key as YYYY-MM
 */
export function getCurrentMonthKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Month names in Azerbaijani
 */
export const AZ_MONTHS: { key: string; label: string }[] = [
  { key: '01', label: 'Yanvar' },
  { key: '02', label: 'Fevral' },
  { key: '03', label: 'Mart' },
  { key: '04', label: 'Aprel' },
  { key: '05', label: 'May' },
  { key: '06', label: 'İyun' },
  { key: '07', label: 'İyul' },
  { key: '08', label: 'Avqust' },
  { key: '09', label: 'Sentyabr' },
  { key: '10', label: 'Oktyabr' },
  { key: '11', label: 'Noyabr' },
  { key: '12', label: 'Dekabr' },
];

export function getMonthLabelAZ(yearMonthKey: string): string {
  const [year, month] = yearMonthKey.split('-');
  const found = AZ_MONTHS.find(m => m.key === month);
  return `${found ? found.label : month} ${year}`;
}
