import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { auctionsApi } from '../api/auctions';
import { useAuctionRoom } from '../realtime/useAuctionRoom';
import { useAuth } from '../hooks/useAuth';
import { PriceDisplay } from '../components/auction/PriceDisplay';
import { CountdownTimer } from '../components/auction/CountdownTimer';
import { PresenceBadge } from '../components/auction/PresenceBadge';
import { BidPanel } from '../components/auction/BidPanel';
import { ActivityFeed } from '../components/auction/ActivityFeed';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import {
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  Zap,
  Info,
  CheckCircle2,
  Trophy,
  WifiOff,
} from 'lucide-react';

export const AuctionRoomPage: React.FC = () => {
  const { auctionId } = useParams<{ auctionId: string }>();
  const { user } = useAuth();
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // Initial auction metadata query
  const { data: auctionData, isLoading: isDetailsLoading } = useQuery({
    queryKey: ['auction-details', auctionId],
    queryFn: () => auctionsApi.getById(auctionId!),
    enabled: !!auctionId,
  });

  // Real-time socket room synchronization hook
  const {
    state,
    activity,
    viewerCount,
    rejection,
    isOutbid,
    outbidInfo,
    clearOutbid,
    connected,
    placeBid,
  } = useAuctionRoom(auctionId);

  if (isDetailsLoading || !state) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 py-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <Skeleton className="lg:col-span-7 h-[460px] rounded-3xl" />
          <Skeleton className="lg:col-span-5 h-[460px] rounded-3xl" />
        </div>
      </div>
    );
  }

  const isLive = state.status === 'OPEN';
  const isSold = state.status === 'SOLD';
  const isUnsold = state.status === 'UNSOLD';
  const isClosed = isSold || isUnsold || state.status === 'CLOSED';
  const isSeller = user?.id === auctionData?.sellerId;

  const images =
    auctionData?.images && auctionData.images.length > 0
      ? auctionData.images
      : ['https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=1200&q=80'];

  const getStatusBadge = () => {
    if (isLive) return <Badge variant="live" dot>Live Auction</Badge>;
    if (isSold) return <Badge variant="sold">Sold</Badge>;
    if (isUnsold) return <Badge variant="unsold">Unsold</Badge>;
    return <Badge variant="neutral">{state.status}</Badge>;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {/* Navigation Breadcrumb & Live Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-amber-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Live Auctions
        </Link>

        {/* Reconnecting Socket Banner (FR9, NFR4) */}
        {!connected && (
          <div
            className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-300 text-xs font-medium animate-pulse"
            role="status"
          >
            <WifiOff className="w-3.5 h-3.5 text-amber-400" />
            <span>Reconnecting WebSocket live feed…</span>
          </div>
        )}
      </div>

      {/* Outbid Toast Notification (BR6, FR8) */}
      {isOutbid && outbidInfo && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-red-950/90 via-red-900/80 to-slate-950 border border-red-500/50 text-red-200 shadow-xl flex items-center justify-between gap-4 animate-outbid-shake">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center border border-red-500/30 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm text-red-100">You've been outbid!</p>
              <p className="text-xs text-red-200/90">
                A higher bid of{' '}
                <strong className="text-white font-mono">
                  ${outbidInfo.newHighestBid.toFixed(2)}
                </strong>{' '}
                was accepted. Bid again to take back the lead!
              </p>
            </div>
          </div>
          <Button size="sm" variant="danger" onClick={clearOutbid}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Main Grid Arena */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Visual Showcase & Specs */}
        <div className="lg:col-span-7 space-y-6">
          {/* Main Media Showcase */}
          <div className="glass-panel rounded-3xl overflow-hidden border border-slate-800 shadow-2xl relative">
            <div className="relative aspect-[16/10] bg-slate-950 flex items-center justify-center overflow-hidden">
              <img
                src={images[activeImageIndex]}
                alt={state.title}
                className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
              />
              <div className="absolute top-4 left-4">{getStatusBadge()}</div>
            </div>

            {/* Thumbnail Carousel */}
            {images.length > 1 && (
              <div className="flex items-center gap-3 p-3 bg-slate-900/80 border-t border-slate-800/80 overflow-x-auto">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImageIndex(idx)}
                    className={`relative w-16 h-12 rounded-xl overflow-hidden border-2 transition-all shrink-0 ${
                      activeImageIndex === idx ? 'border-amber-500 scale-105' : 'border-transparent opacity-60'
                    }`}
                  >
                    <img src={img} alt="thumbnail" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details & Anti-Snipe Information */}
          <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-800/80 space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
                {state.title}
              </h1>
              {auctionData?.seller && (
                <p className="text-xs text-slate-400">
                  Listed by <span className="text-amber-400 font-semibold">{auctionData.seller.email}</span>
                </p>
              )}
            </div>

            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
              {auctionData?.description}
            </p>

            {/* Platform Guarantees & Anti-Snipe Specs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-800/80 text-xs">
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-200 block">Anti-Snipe Protection</span>
                  <span className="text-slate-400">
                    Bids placed in the final 30s automatically extend the clock by +60s.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-200 block">Server-Authoritative</span>
                  <span className="text-slate-400">
                    Every bid is validated with optimistic database-level concurrency locks.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Live Bidding Station */}
        <div className="lg:col-span-5 space-y-6">
          {/* Header Card: Live Price + Presence */}
          <div className="glass-panel rounded-3xl p-6 border border-slate-800 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <PriceDisplay
                amount={state.highestBid}
                startingPrice={state.startingPrice}
              />
              <PresenceBadge count={viewerCount} />
            </div>

            {/* Live Synchronized Countdown Timer */}
            <CountdownTimer endsAt={state.endsAt} />

            {/* Auction Closed Winner Card */}
            {isClosed && (
              <div
                className={`p-5 rounded-2xl border text-center space-y-2 ${
                  isSold
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                    : 'bg-slate-800/60 border-slate-700 text-slate-300'
                }`}
              >
                <Trophy
                  className={`w-8 h-8 mx-auto ${
                    isSold ? 'text-amber-400 animate-bounce' : 'text-slate-500'
                  }`}
                />
                <h3 className="font-bold text-base text-slate-100">
                  {isSold ? '🎉 Auction Ended — Item Sold!' : 'Auction Closed — Reserve Unmet'}
                </h3>
                {state.highestBid && isSold && (
                  <p className="text-xs text-slate-300">
                    Winning Bid:{' '}
                    <strong className="font-mono text-amber-400 font-bold">
                      ${state.highestBid.toFixed(2)}
                    </strong>
                  </p>
                )}
              </div>
            )}

            {/* Interactive Bidding Panel */}
            {isLive && (
              <BidPanel
                currentHighest={state.highestBid}
                startingPrice={state.startingPrice}
                minIncrement={state.minIncrement}
                disabled={!isLive || isSeller}
                disabledReason={
                  isSeller
                    ? 'You are the seller of this auction (BR2: Self-bidding prohibited).'
                    : undefined
                }
                onSubmit={placeBid}
                rejectionReason={rejection}
              />
            )}
          </div>

          {/* Live Activity Stream */}
          <ActivityFeed items={activity} />
        </div>
      </div>
    </div>
  );
};
