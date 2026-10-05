import { Worker, Job } from 'bullmq';
import { redisClient } from '../../config/redis';
import { prisma } from '../../config/prisma';
import { emailQueue } from '../queue';
import { getIoInstance } from '../../realtime/io';
import { logger } from '../../config/logger';
import { AuctionStatus } from '@prisma/client';

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

      // Broadcast auction:closed event to all room participants
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
