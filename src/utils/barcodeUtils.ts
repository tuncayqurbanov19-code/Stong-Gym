import { Product } from '../types';

/**
 * Barkod mətnini təmizləyir (boşluqlar, CR/LF/TAB və nəzarət simvolları silinir)
 */
export function normalizeBarcode(raw: string): string {
  return raw
    .replace(/[\r\n\t\0]+/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Verilmiş barkoda uyğun məhsulu tapır:
 * 1. Dəqiq (case-insensitive) uyğunluq
 * 2. Boşluqsuz uyğunluq
 * 3. Başındakı sıfırlar atılmış uyğunluq (məs. EAN-13 "0..." <-> UPC-A 12 rəqəm)
 */
export function findProductByBarcode(products: Product[], rawCode: string): Product | undefined {
  const clean = normalizeBarcode(rawCode);
  if (!clean) return undefined;

  const exact = products.find(p => normalizeBarcode(p.barcode) === clean);
  if (exact) return exact;

  const compact = clean.replace(/\s+/g, '');
  const compactMatch = products.find(p => normalizeBarcode(p.barcode).replace(/\s+/g, '') === compact);
  if (compactMatch) return compactMatch;

  const stripped = compact.replace(/^0+/, '');
  if (stripped) {
    return products.find(p => {
      const prodStripped = normalizeBarcode(p.barcode).replace(/\s+/g, '').replace(/^0+/, '');
      return prodStripped.length > 0 && prodStripped === stripped;
    });
  }

  return undefined;
}

/**
 * Avtomatik barkod əlavə etmədən əvvəl daha uzun başqa bir məhsul barkodunun
 * bu prefikslə başlayıb-başlamadığını yoxlayır (əl ilə yazarkən vaxtından əvvəl əlavənin qarşısını alır).
 */
export function hasLongerBarcodePrefix(products: Product[], rawCode: string, matchedId: string): boolean {
  const clean = normalizeBarcode(rawCode).replace(/\s+/g, '');
  if (!clean) return false;
  return products.some(p => {
    if (p.id === matchedId) return false;
    const pCode = normalizeBarcode(p.barcode).replace(/\s+/g, '');
    return pCode.length > clean.length && pCode.startsWith(clean);
  });
}

/**
 * Klaviatura vaxt fərqlərinə əsasən girişin aparat barkod skanerindən gəlib-gəlmədiyini qiymətləndirir.
 */
export function isRapidScanSequence(charIntervalsMs: number[]): boolean {
  if (charIntervalsMs.length < 2) return false;
  const total = charIntervalsMs.reduce((sum, v) => sum + v, 0);
  const avg = total / charIntervalsMs.length;
  const max = Math.max(...charIntervalsMs);
  return avg <= 75 && max <= 180;
}
