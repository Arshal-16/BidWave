import React, { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { auctionsApi, CreateAuctionInput } from '../api/auctions';
import { X, Gavel, Image as ImageIcon, Clock, DollarSign, ShieldAlert } from 'lucide-react';

interface CreateAuctionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (auctionId: string) => void;
}

export const CreateAuctionModal: React.FC<CreateAuctionModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    imageUrl: '',
    startingPrice: '100',
    reservePrice: '',
    minIncrement: '5',
    durationMinutes: '15',
    antiSnipeWindowSeconds: '30',
    antiSnipeExtensionSeconds: '60',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const durationMs = parseInt(formData.durationMinutes, 10) * 60 * 1000;
      const endsAt = new Date(Date.now() + durationMs).toISOString();

      const payload: CreateAuctionInput = {
        title: formData.title,
        description: formData.description,
        images: formData.imageUrl ? [formData.imageUrl] : [],
        startingPrice: parseFloat(formData.startingPrice),
        reservePrice: formData.reservePrice ? parseFloat(formData.reservePrice) : undefined,
        minIncrement: parseFloat(formData.minIncrement),
        endsAt,
        antiSnipeWindowSeconds: parseInt(formData.antiSnipeWindowSeconds, 10),
        antiSnipeExtensionSeconds: parseInt(formData.antiSnipeExtensionSeconds, 10),
      };

      const auction = await auctionsApi.create(payload);
      onCreated(auction.id);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to create auction');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl glass-panel rounded-3xl p-6 sm:p-8 border border-slate-700/80 shadow-2xl space-y-6 my-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Gavel className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Create Live Listing</h2>
              <p className="text-xs text-slate-400">Launch a real-time timed auction room</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Listing Title"
            required
            placeholder="e.g. 1978 Roland Jupiter-4 Analog Synthesizer"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">Description</label>
            <textarea
              required
              rows={3}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl text-slate-100 text-sm p-3 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
              placeholder="Item condition, provenance, accessories, and warranty details..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <Input
            label="Image URL (Unsplash or direct CDN link)"
            leftIcon={<ImageIcon className="w-4 h-4" />}
            placeholder="https://images.unsplash.com/photo-..."
            value={formData.imageUrl}
            onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Starting Price ($)"
              type="number"
              step="1"
              min="1"
              required
              leftIcon={<DollarSign className="w-4 h-4" />}
              value={formData.startingPrice}
              onChange={(e) => setFormData({ ...formData, startingPrice: e.target.value })}
            />
            <Input
              label="Reserve Price (Optional $)"
              type="number"
              step="1"
              min="1"
              leftIcon={<DollarSign className="w-4 h-4" />}
              placeholder="Hidden reserve"
              value={formData.reservePrice}
              onChange={(e) => setFormData({ ...formData, reservePrice: e.target.value })}
            />
            <Input
              label="Min Increment ($)"
              type="number"
              step="1"
              min="1"
              required
              leftIcon={<DollarSign className="w-4 h-4" />}
              value={formData.minIncrement}
              onChange={(e) => setFormData({ ...formData, minIncrement: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                Duration
              </label>
              <select
                value={formData.durationMinutes}
                onChange={(e) => setFormData({ ...formData, durationMinutes: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl text-slate-100 text-sm px-3 py-2.5 focus:outline-none focus:border-amber-500"
              >
                <option value="5">5 Minutes (Testing)</option>
                <option value="15">15 Minutes</option>
                <option value="60">1 Hour</option>
                <option value="1440">24 Hours</option>
                <option value="4320">3 Days</option>
              </select>
            </div>

            <Input
              label="Anti-Snipe Window (s)"
              type="number"
              min="10"
              max="300"
              value={formData.antiSnipeWindowSeconds}
              onChange={(e) => setFormData({ ...formData, antiSnipeWindowSeconds: e.target.value })}
            />

            <Input
              label="Extension Time (s)"
              type="number"
              min="10"
              max="600"
              value={formData.antiSnipeExtensionSeconds}
              onChange={(e) => setFormData({ ...formData, antiSnipeExtensionSeconds: e.target.value })}
            />
          </div>

          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isLoading}>
              Publish Live Auction
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
