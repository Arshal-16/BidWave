import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div
      className={twMerge(
        clsx('animate-pulse rounded-xl bg-slate-800/80 border border-slate-700/30', className),
      )}
    />
  );
};
