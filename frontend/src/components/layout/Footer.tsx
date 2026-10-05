import React from 'react';
import { Waves, Heart, Shield, Terminal } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-slate-800/80 bg-slate-950/60 backdrop-blur-md py-12 mt-20 text-slate-400 text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Waves className="w-5 h-5" />
            </div>
            <span className="font-bold text-slate-100 font-mono tracking-tight text-lg">
              BidWave
            </span>
            <span className="text-xs text-slate-500">
              — Server-Authoritative Live Auction Platform
            </span>
          </div>

          <div className="flex items-center gap-6 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Optimistic Concurrency Locked</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-amber-400" />
              <span>Redis Distributed Pub/Sub</span>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} BidWave Inc. All rights reserved.</p>
          <p className="flex items-center gap-1">
            Engineered for high-frequency live real-time bidding
          </p>
        </div>
      </div>
    </footer>
  );
};
