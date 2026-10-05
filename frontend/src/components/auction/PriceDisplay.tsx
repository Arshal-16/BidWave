import React, { useEffect, useState } from 'react';
import { DollarSign } from 'lucide-react';

interface PriceDisplayProps {
  amount: number | null;
  startingPrice?: number;
  label?: string;
}

export const PriceDisplay: React.FC<PriceDisplayProps> = ({
  amount,
  startingPrice = 0,
  label = 'Current Highest Bid',
}) => {
  const [isFlashing, setIsFlashing] = useState(false);
  const displayValue = amount !== null ? amount : startingPrice;
  const isStarting = amount === null;

  useEffect(() => {
    if (amount !== null) {
      setIsFlashing(true);
      const timer = setTimeout(() => setIsFlashing(false), 800);
      return () => clearTimeout(timer);
    }
  }, [amount]);

  return (
    <div className="flex flex-col space-y-1">
      <span className="text-xs uppercase font-semibold tracking-wider text-slate-400">
        {isStarting ? 'Starting Price' : label}
      </span>
      <div
        aria-live="polite"
        className={`inline-flex items-baseline gap-1 px-3 py-1.5 rounded-xl transition-all duration-300 ${
          isFlashing
            ? 'animate-price-flash bg-amber-500/20 text-amber-300 ring-2 ring-amber-500/50'
            : 'text-amber-400 bg-slate-900/60 border border-slate-800'
        }`}
      >
        <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight flex items-center">
          <DollarSign className="w-5 h-5 sm:w-7 sm:h-7 -mr-1 text-amber-500/80" />
          {displayValue.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
        {isStarting && (
          <span className="text-xs text-slate-400 font-medium ml-1.5">(No bids yet)</span>
        )}
      </div>
    </div>
  );
};
