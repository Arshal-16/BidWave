import { apiClient } from './client';
import { Auction, AuctionStatus, Bid } from '../types';

export interface ListAuctionsParams {
  status?: AuctionStatus;
  sellerId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ListAuctionsResponse {
  status: string;
  data: {
    items: Auction[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface CreateAuctionInput {
  title: string;
  description: string;
  images?: string[];
  startingPrice: number;
  reservePrice?: number;
  minIncrement?: number;
  startsAt?: string;
  endsAt: string;
  antiSnipeWindowSeconds?: number;
  antiSnipeExtensionSeconds?: number;
}

export const auctionsApi = {
  async list(params?: ListAuctionsParams): Promise<ListAuctionsResponse['data']> {
    const res = await apiClient.get<ListAuctionsResponse>('/auctions', { params });
    return res.data.data;
  },

  async getById(id: string): Promise<Auction> {
    const res = await apiClient.get<{ status: string; data: { auction: Auction } }>(`/auctions/${id}`);
    return res.data.data.auction;
  },

  async create(input: CreateAuctionInput): Promise<Auction> {
    const res = await apiClient.post<{ status: string; data: { auction: Auction } }>('/auctions', input);
    return res.data.data.auction;
  },

  async getBids(auctionId: string, page = 1, limit = 50): Promise<{ bids: Bid[]; total: number }> {
    const res = await apiClient.get<{ status: string; data: { bids: Bid[]; pagination: { total: number } } }>(
      `/auctions/${auctionId}/bids`,
      { params: { page, limit } },
    );
    return {
      bids: res.data.data.bids,
      total: res.data.data.pagination.total,
    };
  },

  async placeRestBid(auctionId: string, amount: number) {
    const res = await apiClient.post(`/auctions/${auctionId}/bids`, { amount });
    return res.data;
  },

  async getMyBids(): Promise<any[]> {
    const res = await apiClient.get('/users/my-bids');
    return res.data.data.bids;
  },
};
