import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface TablePaginationProps {
  totalItems: number;
  pageSize?: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  primaryColor?: string;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  totalItems,
  pageSize = 15,
  currentPage,
  onPageChange,
  primaryColor = '#E32636',
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize) return null;

  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startItem = (safePage - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, safePage * pageSize);

  // Build compact page number list with ellipsis
  const pages: (number | 'ellipsis')[] = [];
  for (let p = 1; p <= totalPages; p += 1) {
    if (p === 1 || p === totalPages || (p >= safePage - 1 && p <= safePage + 1)) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== 'ellipsis') {
      pages.push('ellipsis');
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-4 py-3 border-t border-[#E5E5E5] dark:border-[#262626] bg-[#FAFAFA] dark:bg-[#141414]">
      <div className="text-xs text-[#888888] font-mono tabular-nums">
        {startItem}–{endItem} / {totalItems} qeyd
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          aria-label="Öncəki səhifə"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[10px] text-xs font-medium border border-[#E5E5E5] dark:border-[#262626] bg-white dark:bg-[#222222] text-[#171717] dark:text-white hover:bg-[#F5F5F5] dark:hover:bg-[#2B2B2B] disabled:opacity-40 transition-colors whitespace-nowrap"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Öncəki</span>
        </button>

        {pages.map((item, idx) =>
          item === 'ellipsis' ? (
            <span
              key={`ellipsis-${idx}`}
              className="px-1.5 text-xs text-[#888888] select-none"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              style={item === safePage ? { backgroundColor: primaryColor, borderColor: primaryColor } : undefined}
              className={`min-w-[30px] h-[30px] px-2 rounded-[10px] text-xs font-mono tabular-nums font-semibold border transition-colors ${
                item === safePage
                  ? 'text-white shadow-xs'
                  : 'border-[#E5E5E5] dark:border-[#262626] bg-white dark:bg-[#222222] text-[#171717] dark:text-zinc-300 hover:bg-[#F5F5F5] dark:hover:bg-[#2B2B2B]'
              }`}
            >
              {item}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages}
          aria-label="Sonrakı səhifə"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[10px] text-xs font-medium border border-[#E5E5E5] dark:border-[#262626] bg-white dark:bg-[#222222] text-[#171717] dark:text-white hover:bg-[#F5F5F5] dark:hover:bg-[#2B2B2B] disabled:opacity-40 transition-colors whitespace-nowrap"
        >
          <span className="hidden sm:inline">Sonrakı</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
