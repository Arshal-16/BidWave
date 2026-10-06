import { Worker, Job } from 'bullmq';
import { redisClient } from '../../config/redis';
import { prisma } from '../../config/prisma';
import { emailQueue } from '../queue';
import { getIoInstance } from '../../realtime/io';
import { logger } from '../../config/logger';
import { AuctionStatus } from '@prisma/client';

/**
 * ============================================================================
 * AUCTION CLOSE WORKER: createCloseAuctionWorker()
 * ============================================================================
 *
 * Algorithmic Execution Steps:
 * ----------------------------------------------------------------------------
 * When the delayed job fires upon auction expiration:
 *
 * 1. DATABASE LOOKUP & IDEMPOTENCY GUARD:
 *    - Fetch the auction from PostgreSQL.
 *    - Check if `auction.status !== OPEN` or `auction.endsAt > Date.now()`.
 *      If a late anti-snipe bid extended the deadline while this job was being
 *      dequeued, this job exits cleanly — the rescheduled job will handle closing.
 *
 * 2. WINNER & RESERVE EVALUATION:
 *    - Fetch `currentHighestBidId`.
 *    - If no bids exist -> Outcome is `UNSOLD`.
 *    - If highest bid >= `reservePrice` (or no reserve was configured) -> Outcome is `SOLD`.
 *    - If highest bid < `reservePrice` -> Outcome is `UNSOLD` (reserve not met).
 *
 * 3. STATE TRANSITION:
 *    - Update auction status in DB to `SOLD` or `UNSOLD`.
 *
 * 4. REAL-TIME BROADCAST:
 *    - Emit `auction:closed` event to `auction:{auctionId}` room across all
 *      cluster nodes via the Redis pub/sub adapter.
 *
 * 5. TRANSACTIONAL EMAIL QUEUING:
 *    - If `SOLD`: queue `auction-won` email to highest bidder and `auction-sold` to seller.
 */
export function createCloseAuctionWorker(): Worker {
  return new Worker(
    'auction-close',
    async (job: Job<{ auctionId: string }>) => {
      const { auctionId } = job.data;
      logger.info({ auctionId }, 'Processing close-auction background job');

      const auction = await prisma.auction.findUnique({
        where: { id: auctionId },
        include: { seller: true },
      });

      if (!auction) {
        logger.warn({ auctionId }, 'Auction not found during close job execution');
        return;
      }

      // Idempotency guard: if endsAt moved since this job was scheduled (an anti-snipe extension
      // landed after this job was picked up), re-check and bail out; the rescheduled job will fire.
      if (auction.status !== AuctionStatus.OPEN || auction.endsAt.getTime() > Date.now()) {
        logger.info({ auctionId, status: auction.status, endsAt: auction.endsAt }, 'Auction deadline extended or status changed; skipping close');
        return;
      }

      const highestBid = auction.currentHighestBidId
        ? await prisma.bid.findUnique({
            where: { id: auction.currentHighestBidId },
            include: { bidder: true },
          })
        : null;

      // Reserve price validation (BR8)
      const reserveMet =
        !auction.reservePrice ||
        (highestBid && Number(highestBid.amount) >= Number(auction.reservePrice));

      const outcome: AuctionStatus = !highestBid
        ? AuctionStatus.UNSOLD
        : reserveMet
        ? AuctionStatus.SOLD
        : AuctionStatus.UNSOLD;

      // Update database status
      await prisma.auction.update({
        where: { id: auctionId },
        data: { status: outcome },
      });

      logger.info({ auctionId, outcome, highestBid: highestBid?.amount }, 'Auction closed successfully');

      // Broadcast auction:closed event to all room participants across cluster
      try {
        getIoInstance()
          .of('/auctions')
          .to(`auction:${auctionId}`)
          .emit('auction:closed', {
            auctionId,
            winnerId: highestBid?.bidderId ?? null,
            finalAmount: highestBid ? Number(highestBid.amount) : null,
            outcome,
          });
      } catch (err) {
        logger.warn({ err }, 'Could not broadcast auction:closed event (Socket server might not be running in this worker process)');
      }

      // Queue transactional notifications if sold
      if (highestBid && outcome === AuctionStatus.SOLD) {
        await emailQueue.add('send-email', {
          type: 'auction-won',
          email: highestBid.bidder.email,
          title: auction.title,
          amount: Number(highestBid.amount),
        });

        await emailQueue.add('send-email', {
          type: 'auction-sold',
          email: auction.seller.email,
          title: auction.title,
          amount: Number(highestBid.amount),
        });
      }
    },
    { connection: redisClient },
  );
}

