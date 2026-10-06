import { useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from './SocketProvider';
import { AuctionRoomState } from '../types';

export interface ActivityItem {
  bidId?: string;
  amount: number;
  bidderId: string;
  timestamp: Date;
}

/**
 * ============================================================================
 * REAL-TIME AUCTION ROOM HOOK: useAuctionRoom()
 * ============================================================================
 *
 * Manages WebSocket state and event subscriptions for a live auction screen.
 *
 * Algorithmic Features:
 * 1. AUTOMATIC RECONNECTION RESYNC (FR9, NFR4):
 *    - On initial mount, emits `auction:join`.
 *    - Listens to the `connect` event: if the WebSocket drops and reconnects,
 *      re-emits `auction:join` so the server responds with fresh authoritative `auction:state`,
 *      eliminating stale state without requiring a full browser refresh.
 *
 * 2. LIVE BID BROADCASTS & ANIMATION TRIGGERS:
 *    - Listens to `bid:accepted`: updates current highest price, bidder count, and appends
 *      to the recent activity stream (capped at 30 items).
 *    - Triggers `isPriceFlashed = true` for 900ms to drive visual CSS glow micro-animations.
 *
 * 3. ANTI-SNIPE AUTO-EXTENSION:
 *    - Listens to `auction:extended`: smoothly updates the countdown timer deadline `endsAt`.
 *
 * 4. TARGETED OUTBID ALERTS (FR8):
 *    - Listens to private `bid:outbid`: sets `isOutbid = true` with new highest bid to display
 *      immediate action banners to the outbid user.
 *
 * 5. PRESENCE TRACKING:
 *    - Listens to `presence:update`: updates the live viewer badge count in real time.
 *
 * 6. CLEANUP & LEAVE:
 *    - On unmount, emits `auction:leave` and deregisters all event listeners to avoid memory leaks.
 *
 * @param auctionId - Target auction UUID
 */
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
    // Re-emit auction:join on every reconnect to resync authoritative state (FR9, NFR4)
    socket.on('connect', join);

    // 1. Initial / Resynced authoritative snapshot from server
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

    // 2. Broadcast accepted bid from any client in the room
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

      // Trigger brief price highlight flash animation
      setIsPriceFlashed(true);
      if (priceFlashTimeout.current) clearTimeout(priceFlashTimeout.current);
      priceFlashTimeout.current = setTimeout(() => setIsPriceFlashed(false), 900);
    });

    // 3. Private rejection reason for caller
    socket.on('bid:rejected', ({ reason }: { reason: string }) => {
      setRejection(reason);
    });

    // 4. Targeted private notification for previously-highest bidder
    socket.on('bid:outbid', (data: { auctionId: string; newHighestBid: number }) => {
      if (data.auctionId === auctionId) {
        setIsOutbid(true);
        setOutbidInfo({ newHighestBid: data.newHighestBid });
      }
    });

    // 5. Anti-snipe clock extension
    socket.on('auction:extended', ({ newEndsAt }: { auctionId: string; newEndsAt: string }) => {
      setState((s) => (s ? { ...s, endsAt: newEndsAt } : s));
    });

    // 6. Live viewer presence update
    socket.on('presence:update', ({ viewerCount: count }: { auctionId: string; viewerCount: number }) => {
      setViewerCount(count);
    });

    // 7. Auction closed resolution
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

  /**
   * Place a bid on the active auction over WebSockets.
   */
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

  /**
   * Dismiss the outbid notification banner.
   */
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

