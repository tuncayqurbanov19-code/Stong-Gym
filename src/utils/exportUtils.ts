import { DailyReport, DebtRecord, Expense, Product, PurchaseIntake, Sale } from '../types';
import { formatDateAZ } from './dateUtils';

/**
 * Downloads a string content as a file in the browser
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/csv;charset=utf-8;'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCsvField(field: unknown): string {
  if (field === null || field === undefined) return '""';
  const stringField = String(field);
  return `"${stringField.replace(/"/g, '""')}"`;
}

/**
 * Exports products to CSV with UTF-8 BOM for Microsoft Excel
 */
export function exportProductsToCSV(products: Product[]): void {
  const headers = ['ID', 'Ad', 'Barkod', 'Kateqoriya', 'Həcm', 'Satış Qiyməti (AZN)', 'Alış Qiyməti (AZN)', 'İlkin Qalıq', 'Xəbərdarlıq Həddi', 'Qeyd'];
  const rows = products.map(p => [
    escapeCsvField(p.id),
    escapeCsvField(p.name),
    escapeCsvField(p.barcode),
    escapeCsvField(p.category),
    escapeCsvField(p.volume || ''),
    escapeCsvField(p.salePrice),
    escapeCsvField(p.buyPrice),
    escapeCsvField(p.initialStock),
    escapeCsvField(p.minStockAlert),
    escapeCsvField(p.note || ''),
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  downloadFile(csvContent, `Mehsullar_${new Date().toISOString().slice(0, 10)}.csv`);
}

/**
 * Exports sales to CSV
 */
export function exportSalesToCSV(sales: Sale[]): void {
  const headers = ['ID', 'Tarix', 'Saat', 'Ödəniş Növü', 'Məhsullar', 'Məbləğ (AZN)', 'Borclu Adı', 'Təsdiqlənib', 'İstifadəçi'];
  const rows = sales.map(s => {
    const itemsSummary = s.items.map(i => `${i.productName} (${i.quantity} əd.)`).join('; ');
    return [
      escapeCsvField(s.id),
      escapeCsvField(formatDateAZ(s.date)),
      escapeCsvField(s.time),
      escapeCsvField(s.paymentType.toUpperCase()),
      escapeCsvField(itemsSummary),
      escapeCsvField(s.totalAmount),
      escapeCsvField(s.debtorName || ''),
      escapeCsvField(s.isConfirmed ? 'Bəli' : 'Xeyr'),
      escapeCsvField(s.createdBy),
    ];
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  downloadFile(csvContent, `Satislar_${new Date().toISOString().slice(0, 10)}.csv`);
}

/**
 * Exports purchases (Mal Qəbulu) to CSV
 */
export function exportPurchasesToCSV(purchases: PurchaseIntake[]): void {
  const headers = ['ID', 'Tarix', 'Məhsul', 'Gələn Say', 'Ödənilən Pul (AZN)', 'Qeyd', 'Qeydiyyatçı'];
  const rows = purchases.map(p => [
    escapeCsvField(p.id),
    escapeCsvField(formatDateAZ(p.date)),
    escapeCsvField(p.productName),
    escapeCsvField(p.quantity),
    escapeCsvField(p.paidAmount),
    escapeCsvField(p.note || ''),
    escapeCsvField(p.createdBy),
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  downloadFile(csvContent, `Mal_Qebulu_${new Date().toISOString().slice(0, 10)}.csv`);
}

/**
 * Exports debts to CSV
 */
export function exportDebtsToCSV(debts: DebtRecord[]): void {
  const headers = ['ID', 'Tarix', 'Borclu', 'Ümumi Məbləğ (AZN)', 'Ödənilən (AZN)', 'Qalıq Borc (AZN)', 'Status', 'Məhsullar'];
  const rows = debts.map(d => {
    const itemsSummary = d.items.map(i => `${i.productName} (${i.quantity} əd.)`).join('; ');
    return [
      escapeCsvField(d.id),
      escapeCsvField(formatDateAZ(d.date)),
      escapeCsvField(d.debtorName),
      escapeCsvField(d.totalAmount),
      escapeCsvField(d.paidAmount),
      escapeCsvField(d.remainingAmount),
      escapeCsvField(d.status === 'borcdadir' ? 'Borcdadır' : 'Ödənilib'),
      escapeCsvField(itemsSummary),
    ];
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  downloadFile(csvContent, `Borclar_${new Date().toISOString().slice(0, 10)}.csv`);
}

/**
 * Exports expenses to CSV
 */
export function exportExpensesToCSV(expenses: Expense[]): void {
  const headers = ['ID', 'Tarix', 'Növ', 'Məbləğ (AZN)', 'Qeyd', 'Qeydiyyatçı'];
  const rows = expenses.map(e => [
    escapeCsvField(e.id),
    escapeCsvField(formatDateAZ(e.date)),
    escapeCsvField(e.category),
    escapeCsvField(e.amount),
    escapeCsvField(e.note || ''),
    escapeCsvField(e.createdBy),
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  downloadFile(csvContent, `Xercler_${new Date().toISOString().slice(0, 10)}.csv`);
}

/**
 * Exports daily reports to CSV
 */
export function exportDailyReportsToCSV(reports: DailyReport[]): void {
  const headers = ['ID', 'Tarix', 'Nağd (AZN)', 'Kart (AZN)', 'POS (AZN)', 'Ümumi Cəm (AZN)', 'Fərq', 'Düzəliş Edilib', 'Qeydlər'];
  const rows = reports.map(r => [
    escapeCsvField(r.id),
    escapeCsvField(formatDateAZ(r.date)),
    escapeCsvField(r.cashAmount),
    escapeCsvField(r.cardAmount),
    escapeCsvField(r.posAmount),
    escapeCsvField(r.totalAmount),
    escapeCsvField(r.difference),
    escapeCsvField(r.isManuallyAdjusted ? 'Bəli' : 'Xeyr'),
    escapeCsvField(r.notes || ''),
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  downloadFile(csvContent, `Gundelik_Hesabatlar_${new Date().toISOString().slice(0, 10)}.csv`);
}

/**
 * Parses simple CSV content back into product objects
 */
export function parseProductsCSV(csvText: string): Partial<Product>[] {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length <= 1) return [];

  // Remove potential BOM
  const firstLine = lines[0].replace(/^\uFEFF/, '');
  const headers = firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  const parsed: Partial<Product>[] = [];

  for (let i = 1; i < lines.length; i++) {
    // Regex matching CSV values taking quotes into account
    const values = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(',');
    const cleanValues = values.map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));

    if (cleanValues.length >= 4) {
      parsed.push({
        name: cleanValues[1] || 'Məhsul',
        barcode: cleanValues[2] || '',
        category: cleanValues[3] || 'Ümumi',
        volume: cleanValues[4] || '',
        salePrice: parseFloat(cleanValues[5]) || 0,
        buyPrice: parseFloat(cleanValues[6]) || 0,
        initialStock: parseInt(cleanValues[7], 10) || 0,
        minStockAlert: parseInt(cleanValues[8], 10) || 5,
        note: cleanValues[9] || '',
      });
    }
  }

  return parsed;
}
