import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { auctionsApi } from '../api/auctions';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Plus,
  Gavel,
  DollarSign,
  TrendingUp,
  Package,
  ExternalLink,
  Timer,
} from 'lucide-react';

export const SellerDashboardPage: React.FC<{ onOpenCreateModal: () => void }> = ({
  onOpenCreateModal,
}) => {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['seller-auctions', user?.id],
    queryFn: () =>
      auctionsApi.list({
        sellerId: user?.id,
        limit: 50,
      }),
    enabled: !!user?.id,
  });

  const auctions = data?.items || [];
  const activeAuctions = auctions.filter((a) => a.status === 'OPEN');
  const soldAuctions = auctions.filter((a) => a.status === 'SOLD');
  const totalRevenue = soldAuctions.reduce(
    (acc, item) => acc + (item.currentHighestBidAmount || 0),
    0,
  );
  const totalBids = auctions.reduce((acc, item) => acc + (item.totalBids || 0), 0);

  return (
    <div className="space-y-8 pb-16">
      {/* Header & Stats Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 flex items-center gap-2.5">
            <LayoutDashboard className="w-7 h-7 text-amber-500" />
            Seller Management Portal
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Monitor active live rooms, bids incoming across backend replicas, and completed sales.
          </p>
        </div>

        <Button onClick={onOpenCreateModal} size="md">
          <Plus className="w-4 h-4 mr-1.5" />
          Create New Listing
        </Button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-5 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
            <span>Total Listings</span>
            <Package className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-3xl font-extrabold font-mono text-slate-100">{auctions.length}</p>
        </div>

        <div className="glass-panel rounded-2xl p-5 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
            <span>Live Auctions</span>
            <Timer className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-3xl font-extrabold font-mono text-emerald-400">{activeAuctions.length}</p>
        </div>

        <div className="glass-panel rounded-2xl p-5 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
            <span>Total Bids Received</span>
            <Gavel className="w-4 h-4 text-sky-400" />
          </div>
          <p className="text-3xl font-extrabold font-mono text-sky-400">{totalBids}</p>
        </div>

        <div className="glass-panel rounded-2xl p-5 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
            <span>Total Sold Volume</span>
            <DollarSign className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-3xl font-extrabold font-mono text-amber-400">
            ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Listings Table */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-slate-800 shadow-2xl">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-100">Your Auction Inventory</h2>
          <span className="text-xs text-slate-500 font-mono">{auctions.length} total</span>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : auctions.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Package className="w-8 h-8 mx-auto text-slate-500" />
            <p className="text-sm font-semibold text-slate-300">You haven't listed any auctions yet</p>
            <Button size="sm" onClick={onOpenCreateModal}>
              Create Your First Listing
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-900/80 text-slate-400 uppercase font-mono text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-6">Item</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6">Current Bid</th>
                  <th className="py-3.5 px-6">Total Bids</th>
                  <th className="py-3.5 px-6">Deadline</th>
                  <th className="py-3.5 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {auctions.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <img
                          src={
                            item.images && item.images.length > 0
                              ? item.images[0]
                              : 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=100&q=80'
                          }
                          alt={item.title}
                          className="w-10 h-10 rounded-xl object-cover border border-slate-700/60"
                        />
                        <div>
                          <span className="font-semibold text-slate-100 block line-clamp-1">
                            {item.title}
                          </span>
                          <span className="text-[11px] text-slate-500">ID: {item.id.slice(0, 8)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <Badge
                        variant={
                          item.status === 'OPEN'
                            ? 'live'
                            : item.status === 'SOLD'
                            ? 'sold'
                            : 'neutral'
                        }
                      >
                        {item.status}
                      </Badge>
                    </td>
                    <td className="py-4 px-6 font-mono font-bold text-amber-400">
                      $
                      {(item.currentHighestBidAmount || item.startingPrice).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-4 px-6 font-mono text-slate-300">{item.totalBids || 0}</td>
                    <td className="py-4 px-6 text-slate-400 text-xs">
                      {new Date(item.endsAt).toLocaleDateString()}{' '}
                      {new Date(item.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <Link to={`/auctions/${item.id}`}>
                        <Button variant="outline" size="sm" className="text-xs">
                          <span>Enter Room</span>
                          <ExternalLink className="w-3.5 h-3.5 ml-1" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
