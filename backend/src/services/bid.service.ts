import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';
import { rescheduleCloseJob } from '../jobs/queue';
import { logger } from '../config/logger';

export interface PlaceBidResult {
  bid: {
    id: string;
    amount: number;
    createdAt: Date;
    bidderId: string;
  };
  extended: boolean;
  newEndsAt: Date;
  previousHighestBidderId: string | null;
  auctionTitle: string;
}

type AttemptResult =
  | { status: 'accepted'; data: PlaceBidResult }
  | { status: 'rejected'; reason: string }
  | { status: 'conflict' };

/**
 * Places a bid with database-level optimistic concurrency control (NFR1, BR3).
 * If another concurrent transaction updates the auction version in the microsecond
 * window between read and write, attemptBid signals 'conflict' and we retry once
 * against fresh authoritative state.
 */
export async function placeBid(
  auctionId: string,
  bidderId: string,
  amount: number,
): Promise<PlaceBidResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await attemptBid(auctionId, bidderId, amount);

    if (result.status === 'accepted') {
      // If the bid extended the auction deadline, reschedule the BullMQ delayed close job
      if (result.data.extended) {
        await rescheduleCloseJob(auctionId, result.data.newEndsAt);
      }
      return result.data;
    }

    if (result.status === 'rejected') {
      throw new AppError(409, result.reason);
    }

    logger.warn({ auctionId, bidderId, attempt }, 'Version conflict detected on bid attempt; retrying...');
  }

  throw new AppError(409, 'Another bid won the race — please try again.');
}

async function attemptBid(
  auctionId: string,
  bidderId: string,
  amount: number,
): Promise<AttemptResult> {
  return prisma.$transaction(async (tx) => {
    const auction = await tx.auction.findUnique({
      where: { id: auctionId },
    });

    if (!auction) {
      return { status: 'rejected', reason: 'Auction not found.' };
    }

    if (auction.status !== 'OPEN') {
      return { status: 'rejected', reason: 'Auction is not open for bidding.' };
    }

    if (new Date() >= auction.endsAt) {
      return { status: 'rejected', reason: 'Auction has already closed.' };
    }

    if (auction.sellerId === bidderId) {
      return { status: 'rejected', reason: 'Sellers cannot bid on their own auction.' };
    }

    const currentHighest = auction.currentHighestBidId
      ? await tx.bid.findUnique({ where: { id: auction.currentHighestBidId } })
      : null;

    const minAcceptable =
      (currentHighest ? Number(currentHighest.amount) : Number(auction.startingPrice)) +
      (currentHighest ? Number(auction.minIncrement) : 0);

    if (amount < minAcceptable) {
      return {
        status: 'rejected',
        reason: `Bid must be at least $${minAcceptable.toFixed(2)}.`,
      };
    }

    // Anti-snipe calculation:
    // If bid arrives within the anti-snipe window before endsAt, extend the auction clock
    const secondsRemaining = (auction.endsAt.getTime() - Date.now()) / 1000;
    const isAntiSnipeTriggered = secondsRemaining <= auction.antiSnipeWindowSeconds;
    const newEndsAt = isAntiSnipeTriggered
      ? new Date(Date.now() + auction.antiSnipeExtensionSeconds * 1000)
      : auction.endsAt;

    // Create the bid entry
    const bid = await tx.bid.create({
      data: {
        auctionId,
        bidderId,
        amount,
      },
    });

    // Optimistic-lock write:
    // Only succeeds if `version` still matches what we read in this transaction.
    // A 0-row update means another transaction committed a bid in between, so we
    // return 'conflict' to trigger a retry.
    const update = await tx.auction.updateMany({
      where: {
        id: auctionId,
        version: auction.version,
      },
      data: {
        currentHighestBidId: bid.id,
        version: { increment: 1 },
        endsAt: newEndsAt,
      },
    });

    if (update.count === 0) {
      return { status: 'conflict' };
    }

    return {
      status: 'accepted',
      data: {
        bid: {
          id: bid.id,
          amount: Number(bid.amount),
          createdAt: bid.createdAt,
          bidderId: bid.bidderId,
        },
        extended: isAntiSnipeTriggered,
        newEndsAt,
        previousHighestBidderId: currentHighest?.bidderId ?? null,
        auctionTitle: auction.title,
      },
    };
  });
}
