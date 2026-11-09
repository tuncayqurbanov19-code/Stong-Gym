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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl border-2 border-red-600 overflow-hidden flex flex-col animate-in zoom-in-95 text-white">
        <div className="p-6 text-center space-y-4">
          <div className="w-16 h-16 bg-red-950/80 text-red-500 rounded-2xl flex items-center justify-center mx-auto shadow-inner border border-red-800">
            <AlertTriangle className="w-9 h-9" />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-red-400 bg-red-950 px-2.5 py-1 rounded-full border border-red-800">
              Diqqət! Borc Xəbərdarlığı
            </span>
            <h3 className="text-xl font-extrabold text-white">
              {debtorName} adlı müştərinin <span className="text-red-500 font-mono font-black">{formatAZN(totalRemainingDebt)}</span> borcu var idi!
            </h3>
            <p className="text-sm text-zinc-300">
              Bu müştərinin əvvəlki satışlardan qalan ödənilməmiş borcu mövcuddur. Yeni borc yazmazdan əvvəl qalıq borcun ödənilməsini xatırladın.
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
                className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-red-600/30 flex items-center justify-center gap-2"
              >
                <span>Borcu indi ödətdir</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onProceedAnyway}
              className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-sm rounded-xl transition-colors border border-zinc-700"
            >
              Yenə də davam et
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 px-4 text-xs font-medium text-zinc-500 hover:text-white transition-colors"
            >
              Ləğv et
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
