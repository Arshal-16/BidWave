import React from 'react';
import { ActivityItem } from '../../realtime/useAuctionRoom';
import { ArrowUpRight, History, ShieldCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ActivityFeedProps {
  items: ActivityItem[];
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ items }) => {
  if (items.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-6 border border-slate-700/50 text-center space-y-2">
        <History className="w-8 h-8 mx-auto text-slate-500 opacity-60" />
        <p className="text-sm font-medium text-slate-300">No Bids Placed Yet</p>
        <p className="text-xs text-slate-500">Be the first to jump into the action!</p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-5 border border-slate-700/50 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <History className="w-4 h-4 text-amber-500" />
          Live Bidding Activity
        </h4>
        <span className="text-xs font-mono text-slate-500">{items.length} bids recorded</span>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {items.map((item, index) => {
          const isLatest = index === 0;

          return (
            <div
              key={item.bidId || `${item.bidderId}-${index}`}
              className={`flex items-center justify-between p-2.5 rounded-xl transition-all duration-300 ${
                isLatest
                  ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200'
                  : 'bg-slate-900/40 hover:bg-slate-800/60 border border-slate-800/60 text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs font-bold ${
                    isLatest
                      ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <ArrowUpRight className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-semibold text-slate-200">
                      bidder-{item.bidderId}
                    </span>
                    {isLatest && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold uppercase tracking-wider border border-amber-500/30">
                        Highest
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {item.timestamp
                      ? formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })
                      : 'Recently'}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="font-mono font-bold text-sm sm:text-base text-slate-100">
                  ${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
                <div className="flex items-center justify-end gap-1 text-[10px] text-emerald-400">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Verified</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
