export type Role = 'BIDDER' | 'SELLER' | 'ADMIN';

export type AuctionStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'CANCELLED' | 'SOLD' | 'UNSOLD';

export interface User {
  id: string;
  email: string;
  role: Role;
}

export interface Auction {
  id: string;
  sellerId: string;
  seller?: {
    id: string;
    email: string;
  };
  title: string;
  description: string;
  images: string[];
  startingPrice: number;
  reservePrice?: number | null;
  minIncrement: number;
  currentHighestBidId?: string | null;
  currentHighestBidAmount?: number | null;
  currentHighestBid?: {
    id: string;
    amount: number;
    bidderId: string;
    bidder?: {
      id: string;
      email: string;
    };
  } | null;
  status: AuctionStatus;
  antiSnipeWindowSeconds: number;
  antiSnipeExtensionSeconds: number;
  startsAt: string;
  endsAt: string;
  version: number;
  totalBids?: number;
  createdAt: string;
}

export interface Bid {
  id: string;
  amount: number;
  createdAt: string;
  bidderId?: string;
  bidder?: {
    id: string;
    email: string;
    maskedId?: string;
  };
}

export interface AuctionRoomState {
  id: string;
  title: string;
  status: AuctionStatus;
  highestBid: number | null;
  highestBidderId: string | null;
  bidderCount: number;
  startsAt: string;
  endsAt: string;
  minIncrement: number;
  startingPrice: number;
}
