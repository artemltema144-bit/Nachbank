import React from 'react';
import { Bell, Check, X, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function InvoiceToast({ invoice, onAccept, onDecline }) {
  if (!invoice) return null;

  return (
    <div className="fixed top-6 right-6 z-50 max-w-sm w-full bg-[#1F2833]/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-md overflow-hidden animate-bounce">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-[#FF007F]/10 rounded-xl">
            <Bell className="w-5 h-5 text-[#FF007F] animate-pulse" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-white">Новый счет на оплату!</h4>
            <p className="text-xs text-gray-400 mt-1">
              От: <span className="text-white font-medium">{invoice.senderName}</span> ({invoice.sender_passport})
            </p>
            <div className="text-lg font-extrabold text-white mt-2 flex items-center gap-1">
              {Number(invoice.amount).toFixed(2)} <span className="text-[#FF007F] font-bold">{"}|{"}</span>
            </div>
            {invoice.description && (
              <p className="text-xs italic text-gray-400 mt-1 bg-black/30 p-2 rounded-lg">
                &ldquo;{invoice.description}&rdquo;
              </p>
            )}

            {invoice.is_forced ? (
              <div className="flex items-center gap-1.5 mt-2 bg-[#FFD700]/10 border border-[#FFD700]/20 p-2 rounded-lg text-[10px] text-[#FFD700]">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Безусловный счет компании (списание без подтверждения)</span>
              </div>
            ) : null}
          </div>
        </div>

        {!invoice.is_forced ? (
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => onDecline(invoice)}
              className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 py-2 rounded-xl text-xs font-bold transition-all border border-red-500/20 flex items-center justify-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Отклонить
            </button>
            <button
              onClick={() => onAccept(invoice)}
              className="flex-1 bg-gradient-to-r from-[#FF007F] to-[#7B00FF] text-white py-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1"
            >
              <Check className="w-3.5 h-3.5" /> Оплатить
            </button>
          </div>
        ) : (
          <div className="mt-3 text-center">
            <span className="text-[10px] text-gray-500">Счет оплачен автоматически</span>
          </div>
        )}
      </div>
    </div>
  );
}
