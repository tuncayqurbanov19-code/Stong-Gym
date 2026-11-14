import { DailyReport, DebtRecord, Expense, Product, PurchaseIntake, Sale } from '../types';
import { formatAZN, formatDateAZ } from './dateUtils';
import { DailyStaffBreakdownSummary } from './financialCalculations';

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
  const headers = [
    'ID',
    'Satış Tarixi',
    'Saat',
    'Ödəniş Növü',
    'Məhsullar',
    'Ara Cəm (AZN)',
    'Endirim (AZN)',
    'Yekun Məbləğ (AZN)',
    'Borclu / Müştəri',
    'Telefon',
    'Təsdiqlənib',
    'Məsul',
    'Faktiki Daxilolma',
  ];
  const rows = sales.map(s => {
    const itemsSummary = s.items.map(i => `${i.productName} (${i.quantity} əd. × ${i.unitPrice})`).join('; ');
    return [
      escapeCsvField(s.id),
      escapeCsvField(formatDateAZ(s.date)),
      escapeCsvField(s.time),
      escapeCsvField(s.paymentType.toUpperCase()),
      escapeCsvField(itemsSummary),
      escapeCsvField(s.subtotalAmount ?? s.totalAmount + (s.discountAmount || 0)),
      escapeCsvField(s.discountAmount || 0),
      escapeCsvField(s.totalAmount),
      escapeCsvField(s.debtorName || ''),
      escapeCsvField(s.debtorPhone || ''),
      escapeCsvField(s.isConfirmed ? 'Bəli' : 'Xeyr'),
      escapeCsvField(s.createdBy),
      escapeCsvField(s.createdAt ? new Date(s.createdAt).toLocaleString('az-AZ') : ''),
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
  const headers = [
    'ID',
    'Yaranma Tarixi',
    'Borclu Ad Soyad',
    'Telefon',
    'Ümumi Məbləğ (AZN)',
    'Ödənilən (AZN)',
    'Qalıq Borc (AZN)',
    'Son Ödəniş Tarixi',
    'Status',
    'Məhsullar',
  ];
  const rows = debts.map(d => {
    const itemsSummary = d.items.map(i => `${i.productName} (${i.quantity} əd.)`).join('; ');
    const lastPay = (d.payments || [])
      .map(p => (p.paidAt || p.date || '').split('T')[0])
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a))[0];
    return [
      escapeCsvField(d.id),
      escapeCsvField(formatDateAZ(d.date)),
      escapeCsvField(d.debtorName),
      escapeCsvField(d.debtorPhone || ''),
      escapeCsvField(d.totalAmount),
      escapeCsvField(d.paidAmount),
      escapeCsvField(d.remainingAmount),
      escapeCsvField(lastPay ? formatDateAZ(lastPay) : '-'),
      escapeCsvField(d.status === 'odanilib' ? 'Tam ödənilib' : d.status === 'qismen' ? 'Qismən ödənilib' : 'Aktiv'),
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
 * Exports Məsul × Ödəniş növü breakdown table to Excel-compatible CSV
 */
export function exportStaffBreakdownToCSV(
  summary: DailyStaffBreakdownSummary,
  startDate: string,
  endDate: string
): void {
  const headers = [
    'Məsul Şəxs',
    'İstifadəçi',
    'Nağd (AZN)',
    'Kart (AZN)',
    'POS/Köçürmə (AZN)',
    'Balans (AZN)',
    'Nisyə (AZN)',
    'Satış Sayı',
    'Orta Çek (AZN)',
    'Satışdan Gələn (AZN)',
    'Borc Ödənişindən (AZN)',
    'Ümumi Daxilolma (AZN)',
  ];

  const rows = summary.rows.map(r => [
    escapeCsvField(r.staffName),
    escapeCsvField(r.staffUsername),
    escapeCsvField(r.naqd.toFixed(2)),
    escapeCsvField(r.kart.toFixed(2)),
    escapeCsvField(r.pos.toFixed(2)),
    escapeCsvField(r.balans.toFixed(2)),
    escapeCsvField(r.nisye.toFixed(2)),
    escapeCsvField(r.salesCount),
    escapeCsvField(r.avgCheck.toFixed(2)),
    escapeCsvField(r.salesInflow.toFixed(2)),
    escapeCsvField(r.debtInflow.toFixed(2)),
    escapeCsvField(r.totalInflow.toFixed(2)),
  ]);

  const t = summary.totals;
  rows.push([
    escapeCsvField('CƏMİ'),
    escapeCsvField('-'),
    escapeCsvField(t.naqd.toFixed(2)),
    escapeCsvField(t.kart.toFixed(2)),
    escapeCsvField(t.pos.toFixed(2)),
    escapeCsvField(t.balans.toFixed(2)),
    escapeCsvField(t.nisye.toFixed(2)),
    escapeCsvField(t.salesCount),
    escapeCsvField(t.avgCheck.toFixed(2)),
    escapeCsvField(t.salesInflow.toFixed(2)),
    escapeCsvField(t.debtInflow.toFixed(2)),
    escapeCsvField(t.totalInflow.toFixed(2)),
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const rangeLabel = startDate === endDate ? startDate : `${startDate}_${endDate}`;
  downloadFile(csvContent, `Mesul_Odenis_Hesabati_${rangeLabel}.csv`);
}

/**
 * Generates a print-ready PDF view via a hidden iframe (avoids window.open popup blocks)
 */
export function exportStaffBreakdownToPDF(
  summary: DailyStaffBreakdownSummary,
  appName: string,
  startDate: string,
  endDate: string
): void {
  if (typeof document === 'undefined') return;

  const periodText =
    startDate === endDate
      ? formatDateAZ(startDate)
      : `${formatDateAZ(startDate)} — ${formatDateAZ(endDate)}`;

  const escapeHtml = (val: string) =>
    val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const rowsHtml = summary.rows
    .map(
      r => `
      <tr>
        <td><strong>${escapeHtml(r.staffName)}</strong><br/><span style="color:#64748b;font-size:10px">@${escapeHtml(r.staffUsername)}</span></td>
        <td class="num">${formatAZN(r.naqd)}</td>
        <td class="num">${formatAZN(r.kart)}</td>
        <td class="num">${formatAZN(r.pos)}</td>
        <td class="num">${formatAZN(r.balans)}</td>
        <td class="num">${formatAZN(r.nisye)}</td>
        <td class="num">${r.salesCount}</td>
        <td class="num">${formatAZN(r.avgCheck)}</td>
        <td class="num">${formatAZN(r.salesInflow)}</td>
        <td class="num">${formatAZN(r.debtInflow)}</td>
        <td class="num"><strong>${formatAZN(r.totalInflow)}</strong></td>
      </tr>`
    )
    .join('');

  const t = summary.totals;
  const html = `<!doctype html>
  <html lang="az">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(appName)} — Məsul və Ödəniş Növü Hesabatı</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; padding: 24px; font-size: 12px; }
        h1 { font-size: 18px; margin: 0 0 4px 0; }
        p.sub { margin: 0 0 16px 0; color: #475569; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid #cbd5e1; padding: 7px 8px; text-align: left; }
        th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
        td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
        tfoot td { background: #f8fafc; font-weight: 700; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(appName)} — Məsul × Ödəniş Növü Hesabatı</h1>
      <p class="sub">Dövr: ${escapeHtml(periodText)} · Çap tarixi: ${new Date().toLocaleString('az-AZ')}</p>
      <table>
        <thead>
          <tr>
            <th>Məsul</th>
            <th class="num">Nağd</th>
            <th class="num">Kart</th>
            <th class="num">POS/Köç.</th>
            <th class="num">Balans</th>
            <th class="num">Nisyə</th>
            <th class="num">Say</th>
            <th class="num">Orta Çek</th>
            <th class="num">Satışdan</th>
            <th class="num">Borcdan</th>
            <th class="num">Cəm Daxil.</th>
          </tr>
        </thead>
        <tbody>${rowsHtml || '<tr><td colspan="11" style="text-align:center;padding:16px">Məlumat yoxdur</td></tr>'}</tbody>
        <tfoot>
          <tr>
            <td>CƏMİ</td>
            <td class="num">${formatAZN(t.naqd)}</td>
            <td class="num">${formatAZN(t.kart)}</td>
            <td class="num">${formatAZN(t.pos)}</td>
            <td class="num">${formatAZN(t.balans)}</td>
            <td class="num">${formatAZN(t.nisye)}</td>
            <td class="num">${t.salesCount}</td>
            <td class="num">${formatAZN(t.avgCheck)}</td>
            <td class="num">${formatAZN(t.salesInflow)}</td>
            <td class="num">${formatAZN(t.debtInflow)}</td>
            <td class="num">${formatAZN(t.totalInflow)}</td>
          </tr>
        </tfoot>
      </table>
    </body>
  </html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        }, 1000);
      }
    }, 250);
  } else {
    document.body.removeChild(iframe);
  }
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
