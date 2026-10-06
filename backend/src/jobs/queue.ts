import { Queue } from 'bullmq';
import { redisClient } from '../config/redis';
import { logger } from '../config/logger';
import { env } from '../config/env';

/**
 * BullMQ Auction Lifecycle Queue
 *
 * Used for precise, event-driven auction closing without polling database tables.
 */
export const auctionQueue = new Queue('auction-close', {
  connection: redisClient,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
  },
});

/**
 * BullMQ Transactional Email Queue
 *
 * Handles asynchronous notification delivery (outbid alerts, auction-won, auction-sold).
 * Configured with 3 attempts and exponential backoff.
 */
export const emailQueue = new Queue('email', {
  connection: redisClient,
  defaultJobOptions: {
    removeOnComplete: true,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

/**
 * ============================================================================
 * BULLMQ DELAYED SCHEDULING & DYNAMIC PINNING: scheduleCloseJob()
 * ============================================================================
 *
 * Algorithmic Rationale:
 * ----------------------------------------------------------------------------
 * Polling databases with `cron` every N seconds causes latency jitter (up to N seconds)
 * and generates heavy, wasteful database queries under high listing counts.
 *
 * BullMQ delayed jobs solve this by waking up at the exact millisecond `endsAt` expires:
 * 1. Pinning `jobId = auctionId`: In BullMQ, adding a job with a pre-existing `jobId`
 *    replaces or deduplicates the pending delayed job.
 * 2. When anti-snipe triggers an extension (e.g. +60 seconds), `rescheduleCloseJob(auctionId, newEndsAt)`
 *    is called with the identical `jobId`. BullMQ shifts the timer to the new deadline.
 * 3. Guarantees that each auction closes exactly once (BR7).
 *
 * @param auctionId - Target auction UUID
 * @param endsAt    - Target expiration Date
 */
export async function scheduleCloseJob(auctionId: string, endsAt: Date) {
  if (env.NODE_ENV === 'test') {
    logger.debug({ auctionId, endsAt }, 'Test env: Skipping BullMQ job schedule');
    return;
  }

  try {
    const delay = Math.max(0, endsAt.getTime() - Date.now());
    await auctionQueue.add(
      'close-auction',
      { auctionId },
      {
        jobId: auctionId, // Pin jobId to auctionId to support atomic rescheduling
        delay,
      },
    );
    logger.info({ auctionId, endsAt, delayMs: delay }, 'Scheduled BullMQ auction close job');
  } catch (err) {
    logger.error({ err, auctionId }, 'Failed to schedule auction close job');
  }
}

export const rescheduleCloseJob = scheduleCloseJob;

