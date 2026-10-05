import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auctionsApi } from '../api/auctions';
import { AuctionCard } from '../components/auction/AuctionCard';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { AuctionStatus } from '../types';
import { Search, Flame, Sparkles, Filter, Gavel, Radio } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export const AuctionListPage: React.FC<{ onOpenCreateModal?: () => void }> = ({
  onOpenCreateModal,
}) => {
  const { user } = useAuth();
  const [selectedStatus, setSelectedStatus] = useState<AuctionStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['auctions', selectedStatus, searchQuery],
    queryFn: () =>
      auctionsApi.list({
        status: selectedStatus === 'ALL' ? undefined : selectedStatus,
        search: searchQuery || undefined,
        limit: 24,
      }),
    refetchInterval: 10000, // Background refresh every 10s for listing grid
  });

  const auctions = data?.items || [];
  const liveCount = auctions.filter((a) => a.status === 'OPEN').length;

  return (
    <div className="space-y-10 pb-16">
      {/* Hero Header Section */}
      <section className="relative overflow-hidden rounded-3xl glass-panel p-8 sm:p-12 border border-slate-800 shadow-2xl bg-gradient-to-b from-slate-900/90 via-slate-900/60 to-slate-950/80">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold uppercase tracking-wider">
            <Radio className="w-3.5 h-3.5 animate-pulse text-amber-400" />
            <span>Server-Authoritative Real-Time Platform</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-100 leading-tight">
            Bid Live with <span className="bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 bg-clip-text text-transparent">Sub-Second Precision</span>
          </h1>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Experience concurrent, race-condition-free live bidding powered by optimistic locking, distributed Redis pub/sub, and automatic anti-snipe clock extensions.
          </p>

          <div className="pt-3 flex flex-wrap items-center gap-3">
            {onOpenCreateModal && (user?.role === 'SELLER' || user?.role === 'ADMIN') && (
              <Button onClick={onOpenCreateModal} size="lg">
                <Gavel className="w-4 h-4 mr-1.5" />
                List an Item for Auction
              </Button>
            )}
            <Button
              variant="outline"
              size="lg"
              onClick={() => setSelectedStatus('OPEN')}
              className={selectedStatus === 'OPEN' ? 'border-amber-500 text-amber-400' : ''}
            >
              <Flame className="w-4 h-4 mr-1.5 text-amber-500" />
              Watch Live Auctions ({liveCount})
            </Button>
          </div>
        </div>
      </section>

      {/* Filter & Search Bar */}
      <section className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800/80 w-full sm:w-auto overflow-x-auto">
          {[
            { label: 'All Listings', value: 'ALL' },
            { label: '🔥 Live Now', value: 'OPEN' },
            { label: '🏁 Sold / Ended', value: 'SOLD' },
            { label: '📝 Drafts', value: 'DRAFT' },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setSelectedStatus(tab.value as any)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                selectedStatus === tab.value
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search items, brands, models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
          />
        </div>
      </section>

      {/* Grid of Auctions */}
      <section>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="glass-panel rounded-2xl p-4 space-y-4">
                <Skeleton className="aspect-[16/10] w-full rounded-xl" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <div className="flex justify-between pt-2">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : auctions.length === 0 ? (
          <div className="glass-panel rounded-3xl p-12 text-center border border-slate-800/80 space-y-4 max-w-lg mx-auto my-12">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <Gavel className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-200">No Auctions Found</h3>
            <p className="text-xs text-slate-400">
              {searchQuery
                ? `No active items match "${searchQuery}". Try a different keyword.`
                : 'There are currently no listings in this category.'}
            </p>
            {onOpenCreateModal && (user?.role === 'SELLER' || user?.role === 'ADMIN') && (
              <Button onClick={onOpenCreateModal} size="sm">
                Create First Auction
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {auctions.map((auction) => (
              <AuctionCard key={auction.id} auction={auction} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
