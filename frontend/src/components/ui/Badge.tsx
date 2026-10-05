import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface BadgeProps {
  variant?: 'live' | 'upcoming' | 'sold' | 'unsold' | 'draft' | 'neutral' | 'winning' | 'outbid';
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  children,
  className,
  dot = false,
}) => {
  const variants = {
    live: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    upcoming: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    sold: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    unsold: 'bg-slate-700/40 text-slate-400 border-slate-600/40',
    draft: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    neutral: 'bg-slate-800 text-slate-300 border-slate-700',
    winning: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/20',
    outbid: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  };

  const dotColors = {
    live: 'bg-emerald-400 animate-pulse',
    upcoming: 'bg-sky-400',
    sold: 'bg-amber-400',
    unsold: 'bg-slate-400',
    draft: 'bg-purple-400',
    neutral: 'bg-slate-400',
    winning: 'bg-emerald-400 animate-pulse',
    outbid: 'bg-rose-400 animate-ping',
  };

  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border tracking-wide uppercase',
          variants[variant],
          className,
        ),
      )}
    >
      {dot && <span className={clsx('w-1.5 h-1.5 rounded-full', dotColors[variant])} />}
      {children}
    </span>
  );
};
