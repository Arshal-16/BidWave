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
 * ============================================================================
 * CONCURRENCY & BIDDING ENGINE: placeBid()
 * ============================================================================
 *
 * Algorithm Overview (Optimistic Concurrency Control with Auto-Retry):
 * ----------------------------------------------------------------------------
 * In a distributed, multi-replica environment, multiple bidders may submit bids
 * simultaneously. Application-level locks (e.g. mutexes in memory) fail because
 * bidders connect to different backend instances (Instance A vs Instance B).
 *
 * To guarantee zero lost updates and prevent two users from both being told they
 * won the highest bid (NFR1, BR3), we employ Database-Level Optimistic Concurrency
 * Control (OCC) using an atomic `version` column:
 *
 * 1. TRANSACTION READ & VALIDATION:
 *    - Inside a Prisma interactive transaction (`$transaction`), read the auction
 *      and its current highest bid.
 *    - Validate invariants: auction is OPEN, current time < endsAt, bidder != seller,
 *      and bid amount >= currentHighestBid + minIncrement.
 *
 * 2. ANTI-SNIPE WINDOW CHECK:
 *    - Calculate `secondsRemaining = endsAt - now`.
 *    - If `secondsRemaining <= antiSnipeWindowSeconds` (e.g., within the last 30s),
 *      dynamically calculate `newEndsAt = now + antiSnipeExtensionSeconds` (e.g. +60s).
 *
 * 3. RECORD CREATION & ATOMIC CONDITIONAL UPDATE:
 *    - Insert the new `Bid` record.
 *    - Execute a guarded update:
 *        UPDATE "Auction"
 *        SET "currentHighestBidId" = :bidId,
 *            "version" = "version" + 1,
 *            "endsAt" = :newEndsAt
 *        WHERE "id" = :auctionId AND "version" = :readVersion;
 *
 * 4. COLLISION DETECTION & RETRY LOOP:
 *    - If `update.count === 1`: The transaction succeeded without collision.
 *      If anti-snipe was triggered, reschedule the BullMQ close job to the new deadline.
 *    - If `update.count === 0`: Another transaction incremented the `version` between
 *      our read and write. The transaction aborts with status 'conflict'.
 *    - `placeBid` catches the conflict and retries ONCE (attempt = 0, 1) against the
 *      freshly committed database state. If the second attempt fails or the new amount
 *      is now below the new highest bid, it returns a 409 Conflict with a clean message.
 *
 * @param auctionId - The UUID of the auction being bid on.
 * @param bidderId  - The UUID of the authenticated user placing the bid.
 * @param amount    - The monetary amount of the bid.
 * @returns {Promise<PlaceBidResult>} Accepted bid metadata including anti-snipe extension status.
 * @throws  {AppError} 409 if validation fails or concurrency retry is exhausted.
 */
export async function placeBid(
  auctionId: string,
  bidderId: string,
  amount: number,
): Promise<PlaceBidResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await attemptBid(auctionId, bidderId, amount);

    if (result.status === 'accepted') {
      // If the bid extended the auction deadline, dynamically update the BullMQ delayed close job
      if (result.data.extended) {
        await rescheduleCloseJob(auctionId, result.data.newEndsAt);
      }
      return result.data;
    }

    if (result.status === 'rejected') {
      throw new AppError(409, result.reason);
    }

    // Version conflict detected (another concurrent transaction updated the auction version first)
    logger.warn({ auctionId, bidderId, attempt }, 'Version conflict detected on bid attempt; retrying...');
  }

  throw new AppError(409, 'Another bid won the race — please try again.');
}

/**
 * Executes a single atomic attempt to validate and write a bid within a database transaction.
 *
 * @param auctionId - Target auction UUID
 * @param bidderId  - Bidding user UUID
 * @param amount    - Bid amount
 * @returns {Promise<AttemptResult>} 'accepted', 'rejected' with reason, or 'conflict' for OCC retry
 */
async function attemptBid(
  auctionId: string,
  bidderId: string,
  amount: number,
): Promise<AttemptResult> {
  return prisma.$transaction(async (tx) => {
    // 1. Read authoritative auction state inside transaction
    const auction = await tx.auction.findUnique({
      where: { id: auctionId },
    });

    if (!auction) {
      return { status: 'rejected', reason: 'Auction not found.' };
    }

    // 2. Validate business rules (BR1, BR2, BR5)
    if (auction.status !== 'OPEN') {
      return { status: 'rejected', reason: 'Auction is not open for bidding.' };
    }

    if (new Date() >= auction.endsAt) {
      return { status: 'rejected', reason: 'Auction has already closed.' };
    }

    if (auction.sellerId === bidderId) {
      return { status: 'rejected', reason: 'Sellers cannot bid on their own auction.' };
    }

    // 3. Calculate minimum acceptable bid
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

    // 4. Anti-snipe calculation (FR6, BR4):
    // If a bid lands within the anti-snipe window before `endsAt`, extend the auction clock
    const secondsRemaining = (auction.endsAt.getTime() - Date.now()) / 1000;
    const isAntiSnipeTriggered = secondsRemaining <= auction.antiSnipeWindowSeconds;
    const newEndsAt = isAntiSnipeTriggered
      ? new Date(Date.now() + auction.antiSnipeExtensionSeconds * 1000)
      : auction.endsAt;

    // 5. Create the immutable bid record
    const bid = await tx.bid.create({
      data: {
        auctionId,
        bidderId,
        amount,
      },
    });

    // 6. Optimistic-lock conditional update:
    // Only succeeds if `version` still equals what we read at the start of this transaction.
    // If update.count === 0, a racing transaction completed first; signal 'conflict' to retry.
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

