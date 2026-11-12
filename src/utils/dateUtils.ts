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

export function getYesterdayISODate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
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
 * Formats number in unified currency style: "1 250,00 ₼" (0 -> "0,00 ₼")
 */
export function formatAZN(amount: number | null | undefined): string {
  const val = Number(amount) || 0;
  const isNeg = val < 0;
  const absFixed = Math.abs(val).toFixed(2);
  const [intPart, decPart] = absFixed.split('.');
  const groupedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${isNeg ? '-' : ''}${groupedInt},${decPart} ₼`;
}

export const formatMoney = formatAZN;

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
