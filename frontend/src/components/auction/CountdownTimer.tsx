import React, { useState, useEffect } from 'react';
import { Timer, Zap } from 'lucide-react';

interface CountdownTimerProps {
  endsAt: string | Date;
  onExpire?: () => void;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({ endsAt, onExpire }) => {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    totalSeconds: number;
    isExpired: boolean;
  }>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    totalSeconds: 0,
    isExpired: false,
  });

  useEffect(() => {
    const calculateTime = () => {
      const target = new Date(endsAt).getTime();
      const now = Date.now();
      const diffMs = target - now;

      if (diffMs <= 0) {
        setTimeLeft({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          totalSeconds: 0,
          isExpired: true,
        });
        if (onExpire) onExpire();
        return;
      }

      const totalSeconds = Math.floor(diffMs / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      setTimeLeft({
        days,
        hours,
        minutes,
        seconds,
        totalSeconds,
        isExpired: false,
      });
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [endsAt, onExpire]);

  if (timeLeft.isExpired) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-slate-400 font-mono text-sm">
        <Timer className="w-4 h-4 text-slate-500" />
        <span>Auction Ended</span>
      </div>
    );
  }

  const isUrgent = timeLeft.totalSeconds <= 60;
  const isAntiSnipeZone = timeLeft.totalSeconds <= 30;

  return (
    <div
      className={`flex items-center justify-between p-3.5 rounded-xl border transition-all duration-300 ${
        isAntiSnipeZone
          ? 'bg-red-950/40 border-red-500/50 text-red-400 animate-pulse'
          : isUrgent
          ? 'bg-amber-950/40 border-amber-500/50 text-amber-400'
          : 'bg-slate-900/80 border-slate-800 text-slate-200'
      }`}
    >
      <div className="flex items-center gap-2">
        {isAntiSnipeZone ? (
          <Zap className="w-5 h-5 text-red-400 animate-bounce" />
        ) : (
          <Timer className="w-5 h-5 text-amber-400" />
        )}
        <span className="text-xs uppercase font-semibold tracking-wider">
          {isAntiSnipeZone ? 'Anti-Snipe Zone (Active)' : 'Time Remaining'}
        </span>
      </div>

      <div className="font-mono text-lg sm:text-xl font-bold tracking-wider flex items-center gap-1">
        {timeLeft.days > 0 && <span>{timeLeft.days}d </span>}
        <span>{String(timeLeft.hours).padStart(2, '0')}:</span>
        <span>{String(timeLeft.minutes).padStart(2, '0')}:</span>
        <span className={isUrgent ? 'text-amber-300 font-extrabold' : ''}>
          {String(timeLeft.seconds).padStart(2, '0')}
        </span>
      </div>
    </div>
  );
};
