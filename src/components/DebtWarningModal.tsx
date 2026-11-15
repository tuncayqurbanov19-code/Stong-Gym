import React from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { formatAZN } from '../utils/dateUtils';

interface DebtWarningModalProps {
  isOpen: boolean;
  debtorName: string;
  totalRemainingDebt: number;
  onClose: () => void;
  onProceedAnyway: () => void;
  onGoToDebtPay?: () => void;
}

export const DebtWarningModal: React.FC<DebtWarningModalProps> = ({
  isOpen,
  debtorName,
  totalRemainingDebt,
  onClose,
  onProceedAnyway,
  onGoToDebtPay,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#171717] w-full max-w-md rounded-[14px] shadow-2xl border border-[#E32636]/60 overflow-hidden flex flex-col text-[#171717] dark:text-white">
        <div className="p-6 text-center space-y-4">
          <div className="w-12 h-12 bg-[#E32636]/10 text-[#E32636] rounded-[12px] flex items-center justify-center mx-auto border border-[#E32636]/30">
            <AlertTriangle className="w-6 h-6" />
          </div>

          <div className="space-y-2">
            <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-[#E32636] bg-[#E32636]/10 px-2.5 py-1 rounded-[8px] border border-[#E32636]/30">
              Diqqət · Aktiv Borc Xəbərdarlığı
            </span>
            <h3 className="text-lg font-bold text-[#171717] dark:text-white">
              {debtorName} adlı müştərinin{' '}
              <span className="text-[#E32636] font-mono tabular-nums font-bold">
                {formatAZN(totalRemainingDebt)}
              </span>{' '}
              borcu var
            </h3>
            <p className="text-xs text-[#888888] leading-relaxed">
              Bu müştərinin əvvəlki satışlardan qalan ödənilməmiş borcu mövcuddur. Yeni nisyə yazmazdan əvvəl qalıq borcun ödənilməsini xatırladın.
            </p>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            {onGoToDebtPay && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onGoToDebtPay();
                }}
                className="w-full py-2.5 px-4 bg-[#E32636] hover:bg-[#c91e2d] text-white font-semibold text-sm rounded-[10px] transition-colors flex items-center justify-center gap-2"
              >
                <span>Borcu indi ödətdir</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onProceedAnyway}
              className="w-full py-2.5 px-4 bg-[#F5F5F5] dark:bg-[#222222] hover:bg-[#EBEBEB] dark:hover:bg-[#2B2B2B] text-[#171717] dark:text-white font-medium text-sm rounded-[10px] transition-colors border border-[#E5E5E5] dark:border-[#2E2E2E]"
            >
              Yenə də davam et
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 px-4 text-xs font-medium text-[#888888] hover:text-[#171717] dark:hover:text-white transition-colors"
            >
              Ləğv et
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
