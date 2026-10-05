import { useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from './SocketProvider';
import { AuctionRoomState } from '../types';

export interface ActivityItem {
  bidId?: string;
  amount: number;
  bidderId: string;
  timestamp: Date;
}

export function useAuctionRoom(auctionId: string | undefined) {
  const { socket, connected } = useSocket();
  const [state, setState] = useState<AuctionRoomState | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [viewerCount, setViewerCount] = useState(1);
  const [rejection, setRejection] = useState<string | null>(null);
  const [isOutbid, setIsOutbid] = useState(false);
  const [outbidInfo, setOutbidInfo] = useState<{ newHighestBid: number } | null>(null);
  const [isPriceFlashed, setIsPriceFlashed] = useState(false);

  const priceFlashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!socket || !auctionId) return;

    const join = () => {
      socket.emit('auction:join', { auctionId });
    };

    join();
    // Re-emit auction:join on every reconnect to resync state (FR9, NFR4)
    socket.on('connect', join);

    socket.on('auction:state', (snapshot: AuctionRoomState) => {
      setState(snapshot);
      if (snapshot.highestBid) {
        setActivity((prev) => {
          if (prev.length === 0) {
            return [
              {
                amount: snapshot.highestBid!,
                bidderId: snapshot.highestBidderId ? snapshot.highestBidderId.slice(0, 8) : 'bidder',
                timestamp: new Date(),
              },
            ];
          }
          return prev;
        });
      }
    });

    socket.on('bid:accepted', (bid: { bidId: string; amount: number; bidderId: string; endsAt: string }) => {
      setState((s) => (s ? { ...s, highestBid: bid.amount, endsAt: bid.endsAt, bidderCount: s.bidderCount + 1 } : s));
      setActivity((a) => [
        {
          bidId: bid.bidId,
          amount: bid.amount,
          bidderId: bid.bidderId,
          timestamp: new Date(),
        },
        ...a,
      ].slice(0, 30));

      // Trigger brief price highlight flash
      setIsPriceFlashed(true);
      if (priceFlashTimeout.current) clearTimeout(priceFlashTimeout.current);
      priceFlashTimeout.current = setTimeout(() => setIsPriceFlashed(false), 900);
    });

    socket.on('bid:rejected', ({ reason }: { reason: string }) => {
      setRejection(reason);
    });

    socket.on('bid:outbid', (data: { auctionId: string; newHighestBid: number }) => {
      if (data.auctionId === auctionId) {
        setIsOutbid(true);
        setOutbidInfo({ newHighestBid: data.newHighestBid });
      }
    });

    socket.on('auction:extended', ({ newEndsAt }: { auctionId: string; newEndsAt: string }) => {
      setState((s) => (s ? { ...s, endsAt: newEndsAt } : s));
    });

    socket.on('presence:update', ({ viewerCount: count }: { auctionId: string; viewerCount: number }) => {
      setViewerCount(count);
    });

    socket.on('auction:closed', (result: { auctionId: string; outcome: any; finalAmount: number | null }) => {
      setState((s) => (s ? { ...s, status: result.outcome } : s));
    });

    return () => {
      socket.emit('auction:leave', { auctionId });
      socket.off('connect', join);
      socket.off('auction:state');
      socket.off('bid:accepted');
      socket.off('bid:rejected');
      socket.off('bid:outbid');
      socket.off('auction:extended');
      socket.off('presence:update');
      socket.off('auction:closed');
    };
  }, [socket, auctionId]);

  const placeBid = useCallback(
    (amount: number) => {
      setRejection(null);
      setIsOutbid(false);
      if (socket && auctionId) {
        socket.emit('bid:place', { auctionId, amount });
      }
    },
    [socket, auctionId],
  );

  const clearOutbid = useCallback(() => {
    setIsOutbid(false);
    setOutbidInfo(null);
  }, []);

  return {
    state,
    activity,
    viewerCount,
    rejection,
    isOutbid,
    outbidInfo,
    clearOutbid,
    isPriceFlashed,
    connected,
    placeBid,
  };
}
