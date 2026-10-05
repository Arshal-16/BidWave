import React from 'react';
import { Link } from 'react-router-dom';
import { Auction } from '../../types';
import { Badge } from '../ui/Badge';
import { Gavel, Timer, ArrowRight, User as UserIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface AuctionCardProps {
  auction: Auction;
}

export const AuctionCard: React.FC<AuctionCardProps> = ({ auction }) => {
  const isLive = auction.status === 'OPEN';
  const isSold = auction.status === 'SOLD';
  const isClosed = auction.status === 'CLOSED' || auction.status === 'UNSOLD';
  const isDraft = auction.status === 'DRAFT';

  const defaultImage =
    'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=800&q=80';
  const imageUrl = auction.images && auction.images.length > 0 ? auction.images[0] : defaultImage;

  const currentPrice =
    auction.currentHighestBidAmount !== null && auction.currentHighestBidAmount !== undefined
      ? auction.currentHighestBidAmount
      : auction.startingPrice;

  const getBadge = () => {
    if (isLive) return <Badge variant="live" dot>Live Auction</Badge>;
    if (isSold) return <Badge variant="sold">Sold</Badge>;
    if (isDraft) return <Badge variant="draft">Draft</Badge>;
    if (isClosed) return <Badge variant="unsold">Closed</Badge>;
    return <Badge variant="neutral">{auction.status}</Badge>;
  };

  return (
    <Link
      to={`/auctions/${auction.id}`}
      className="group flex flex-col glass-panel glass-panel-hover rounded-2xl overflow-hidden border border-slate-800 transition-all duration-300 h-full"
    >
      {/* Image Banner */}
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-900">
        <img
          src={imageUrl}
          alt={auction.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />

        <div className="absolute top-3 left-3">{getBadge()}</div>

        {auction.totalBids !== undefined && auction.totalBids > 0 && (
          <div className="absolute top-3 right-3 px-2 py-1 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-700/60 text-[11px] font-mono font-medium text-slate-300 flex items-center gap-1">
            <Gavel className="w-3 h-3 text-amber-500" />
            <span>{auction.totalBids} {auction.totalBids === 1 ? 'bid' : 'bids'}</span>
          </div>
        )}

        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-slate-300">
          {isLive ? (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-950/70 backdrop-blur-sm border border-slate-700/40">
              <Timer className="w-3.5 h-3.5 text-amber-400" />
              <span>Ends {formatDistanceToNow(new Date(auction.endsAt), { addSuffix: true })}</span>
            </div>
          ) : (
            <span className="text-slate-400 text-xs">
              {isSold ? 'Winner decided' : 'Auction completed'}
            </span>
          )}
        </div>
      </div>

      {/* Body Details */}
      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
        <div className="space-y-1.5">
          <h3 className="font-bold text-lg text-slate-100 group-hover:text-amber-400 transition-colors line-clamp-1">
            {auction.title}
          </h3>
          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
            {auction.description}
          </p>
        </div>

        {/* Pricing & Footer Action */}
        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium block">
              {auction.currentHighestBidAmount ? 'Current Bid' : 'Starting Price'}
            </span>
            <span className="font-mono text-lg font-bold text-amber-400">
              ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300 group-hover:text-amber-400 group-hover:translate-x-1 transition-all">
            {isLive ? 'Enter Room' : 'View Details'}
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
};
