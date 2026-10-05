import { Role } from '@prisma/client';

export interface SocketData {
  userId: string;
  email: string;
  role: Role;
}

export interface ClientToServerEvents {
  'auction:join': (payload: { auctionId: string }) => void;
  'auction:leave': (payload: { auctionId: string }) => void;
  'bid:place': (payload: { auctionId: string; amount: number }) => void;
}

export interface ServerToClientEvents {
  'auction:state': (payload: {
    id: string;
    title: string;
    status: string;
    highestBid: number | null;
    highestBidderId: string | null;
    bidderCount: number;
    startsAt: string;
    endsAt: string;
    minIncrement: number;
    startingPrice: number;
  }) => void;
  'bid:accepted': (payload: {
    bidId: string;
    amount: number;
    bidderId: string;
    endsAt: string;
  }) => void;
  'bid:rejected': (payload: {
    reason: string;
    currentHighestBid?: number | null;
  }) => void;
  'bid:outbid': (payload: {
    auctionId: string;
    newHighestBid: number;
  }) => void;
  'auction:extended': (payload: {
    auctionId: string;
    newEndsAt: string;
  }) => void;
  'auction:closed': (payload: {
    auctionId: string;
    winnerId: string | null;
    finalAmount: number | null;
    outcome: string;
  }) => void;
  'presence:update': (payload: {
    auctionId: string;
    viewerCount: number;
  }) => void;
}
