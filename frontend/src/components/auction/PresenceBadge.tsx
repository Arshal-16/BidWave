import React from 'react';
import { Users, Eye } from 'lucide-react';

interface PresenceBadgeProps {
  count: number;
}

export const PresenceBadge: React.FC<PresenceBadgeProps> = ({ count }) => {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/60 shadow-sm">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
        <Eye className="w-3.5 h-3.5 text-slate-400" />
        <span className="font-mono font-semibold text-emerald-400">{count}</span>
        <span className="text-slate-400 hidden sm:inline">{count === 1 ? 'watching' : 'watching live'}</span>
      </div>
    </div>
  );
};
