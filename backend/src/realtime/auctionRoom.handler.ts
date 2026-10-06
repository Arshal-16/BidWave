import { Namespace, Socket } from 'socket.io';
import { placeBid } from '../services/bid.service';
import { auctionService } from '../services/auction.service';
import { incrementPresence, decrementPresence } from './presence';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';
import { emailQueue } from '../jobs/queue';

/**
 * ============================================================================
 * REAL-TIME AUCTION ROOM HANDLER: registerAuctionRoomHandlers()
 * ============================================================================
 *
 * Architecture & Event Dispatching Model:
 * ----------------------------------------------------------------------------
 * Powered by Socket.io and scaled horizontally across backend nodes via the
 * `@socket.io/redis-adapter`.
 *
 * Channels & Rooms:
 * 1. `auction:{auctionId}`: Public room for all viewers of a specific auction.
 *    Broadcasts state updates, accepted bids, clock extensions, and viewer counts.
 * 2. `user:{userId}`: Private scoped room for targeted notifications (e.g. `bid:outbid`).
 *
 * Event Lifecycles:
 * - `auction:join`:
 *     1. Joins socket to `auction:{auctionId}` room.
 *     2. Atomically increments Redis presence counter.
 *     3. Emits `auction:state` snapshot ONLY to the joining socket (FR3, FR9, NFR4).
 *     4. Broadcasts `presence:update` with new viewer count to all room participants.
 *
 * - `auction:leave`:
 *     1. Leaves `auction:{auctionId}` room.
 *     2. Decrements Redis presence counter and broadcasts updated count.
 *
 * - `bid:place`:
 *     1. Calls `placeBid()` with OCC atomic version check.
 *     2. If accepted -> broadcasts `bid:accepted` to `auction:{auctionId}` room (FR5, NFR2).
 *     3. If anti-snipe triggered -> broadcasts `auction:extended` to room (FR6, BR4).
 *     4. If previous highest bidder exists -> emits targeted `bid:outbid` to `user:{prevId}` (FR8).
 *     5. If rejected/conflict -> emits `bid:rejected` ONLY to the placing socket (NFR1).
 *
 * - `disconnect`:
 *     Cleans up presence counters across all joined auction rooms.
 */
export function registerAuctionRoomHandlers(nsp: Namespace, socket: Socket) {
  const userId = socket.data.userId;
  const joinedRooms = new Set<string>();

  // Automatically join user's private channel for targeted private notifications (e.g. outbid alerts)
  socket.join(`user:${userId}`);

  socket.on('auction:join', async ({ auctionId }: { auctionId: string }) => {
    try {
      const room = roomName(auctionId);
      socket.join(room);
      joinedRooms.add(auctionId);

      const [count, snapshot] = await Promise.all([
        incrementPresence(auctionId),
        auctionService.getAuctionSnapshot(auctionId),
      ]);

      // 1. Authoritative snapshot sent ONLY to the joining socket (FR3, FR9, NFR4)
      socket.emit('auction:state', snapshot);

      // 2. Broadcast updated viewer presence to entire room
      nsp.to(room).emit('presence:update', { auctionId, viewerCount: count });
    } catch (err) {
      logger.error({ err, auctionId, userId }, 'Error handling auction:join');
    }
  });

  socket.on('auction:leave', async ({ auctionId }: { auctionId: string }) => {
    try {
      const room = roomName(auctionId);
      socket.leave(room);
      joinedRooms.delete(auctionId);

      const count = await decrementPresence(auctionId);
      nsp.to(room).emit('presence:update', { auctionId, viewerCount: count });
    } catch (err) {
      logger.error({ err, auctionId, userId }, 'Error handling auction:leave');
    }
  });

  socket.on('bid:place', async ({ auctionId, amount }: { auctionId: string; amount: number }) => {
    try {
      const result = await placeBid(auctionId, userId, amount);
      const room = roomName(auctionId);

      // 1. Broadcast accepted bid to entire auction room (FR5, NFR2)
      nsp.to(room).emit('bid:accepted', {
        bidId: result.bid.id,
        amount: result.bid.amount,
        bidderId: maskId(userId),
        endsAt: result.newEndsAt.toISOString(),
      });

      // 2. Broadcast anti-snipe clock extension if triggered (FR6, BR4)
      if (result.extended) {
        nsp.to(room).emit('auction:extended', {
          auctionId,
          newEndsAt: result.newEndsAt.toISOString(),
        });
      }

      // 3. Send real-time outbid event to the previous highest bidder's socket only (FR8, BR6)
      if (result.previousHighestBidderId && result.previousHighestBidderId !== userId) {
        nsp.to(`user:${result.previousHighestBidderId}`).emit('bid:outbid', {
          auctionId,
          newHighestBid: result.bid.amount,
        });

        // Queue transactional outbid email in background
        emailQueue.add('send-email', {
          type: 'outbid',
          bidderId: result.previousHighestBidderId,
          auctionId,
          auctionTitle: result.auctionTitle,
          newHighestBid: result.bid.amount,
        }).catch((e) => logger.warn({ e }, 'Failed to queue outbid email'));
      }
    } catch (err) {
      const reason = err instanceof AppError ? err.message : 'Bid could not be processed.';
      // Rejection sent ONLY to the sender (NFR1)
      socket.emit('bid:rejected', { reason });
    }
  });

  socket.on('disconnect', async () => {
    for (const auctionId of joinedRooms) {
      try {
        const count = await decrementPresence(auctionId);
        nsp.to(roomName(auctionId)).emit('presence:update', { auctionId, viewerCount: count });
      } catch (err) {
        // Ignore disconnect cleanup errors
      }
    }
    joinedRooms.clear();
  });
}

function roomName(auctionId: string): string {
  return `auction:${auctionId}`;
}

function maskId(id: string): string {
  return id ? id.slice(0, 8) : 'bidder';
}

