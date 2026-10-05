import React, { useState, useEffect } from 'react';
import { Gavel, AlertCircle, Plus } from 'lucide-react';
import { Button } from '../ui/Button';

interface BidPanelProps {
  currentHighest: number | null;
  startingPrice: number;
  minIncrement: number;
  disabled?: boolean;
  disabledReason?: string;
  onSubmit: (amount: number) => void;
  rejectionReason: string | null;
}

export const BidPanel: React.FC<BidPanelProps> = ({
  currentHighest,
  startingPrice,
  minIncrement,
  disabled = false,
  disabledReason,
  onSubmit,
  rejectionReason,
}) => {
  const minRequiredBid =
    currentHighest !== null ? currentHighest + minIncrement : startingPrice;

  const [bidAmount, setBidAmount] = useState<number>(minRequiredBid);

  // Auto-update default input value when highest bid changes
  useEffect(() => {
    setBidAmount(minRequiredBid);
  }, [minRequiredBid]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (bidAmount < minRequiredBid) return;
    onSubmit(bidAmount);
  };

  const handleQuickAdd = (increment: number) => {
    setBidAmount((prev) => Math.max(minRequiredBid, prev + increment));
  };

  const isBelowMinimum = bidAmount < minRequiredBid;

  return (
    <div className="glass-panel rounded-2xl p-5 border border-slate-700/60 shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Gavel className="w-4 h-4 text-amber-500" />
          Place Your Bid
        </h3>
        <span className="text-xs text-slate-400 font-mono">
          Min bid: <strong className="text-amber-400">${minRequiredBid.toFixed(2)}</strong>
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Quick Increment Chips */}
        {!disabled && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400 mr-1">Quick add:</span>
            {[minIncrement, minIncrement * 2, minIncrement * 5, minIncrement * 10].map(
              (inc, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleQuickAdd(inc)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-amber-500/20 hover:text-amber-300 hover:border-amber-500/40 text-xs font-mono font-medium text-slate-300 border border-slate-700 transition-all active:scale-95 flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" />
                  ${inc}
                </button>
              ),
            )}
          </div>
        )}

        {/* Input & Action Button */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono font-bold text-lg">
              $
            </span>
            <input
              type="number"
              step={minIncrement < 1 ? minIncrement : 1}
              min={minRequiredBid}
              value={bidAmount || ''}
              onChange={(e) => setBidAmount(parseFloat(e.target.value) || 0)}
              disabled={disabled}
              className={`w-full bg-slate-900 border rounded-xl pl-8 pr-4 py-3 text-lg font-mono font-bold text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 transition-all ${
                isBelowMinimum
                  ? 'border-red-500/70 focus:ring-red-500/30'
                  : 'border-slate-700 focus:border-amber-500 focus:ring-amber-500/20'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              placeholder={minRequiredBid.toString()}
            />
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={disabled || isBelowMinimum}
            className="sm:w-48 py-3 h-auto text-base uppercase tracking-wider"
          >
            <Gavel className="w-5 h-5 mr-1" />
            Bid Now
          </Button>
        </div>

        {/* Inline Feedback Alerts */}
        {rejectionReason && (
          <div
            className="flex items-start gap-2.5 p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-red-300 text-xs animate-outbid-shake"
            role="alert"
          >
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Bid Not Accepted</p>
              <p className="text-red-200/90">{rejectionReason}</p>
            </div>
          </div>
        )}

        {disabled && disabledReason && (
          <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-400 text-xs text-center">
            {disabledReason}
          </div>
        )}
      </form>
    </div>
  );
};
