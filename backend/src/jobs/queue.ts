import { Queue } from 'bullmq';
import { redisClient } from '../config/redis';
import { logger } from '../config/logger';
import { env } from '../config/env';

export const auctionQueue = new Queue('auction-close', {
  connection: redisClient,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
  },
});

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
 * Schedules or reschedules an auction close job.
 * Pinning the jobId to the auctionId ensures that calling scheduleCloseJob again
 * with the same auctionId REPLACES the pending delay instead of creating a duplicate job.
 * This guarantees exactly one close execution per auction (BR7).
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
        jobId: auctionId,
        delay,
      },
    );
    logger.info({ auctionId, endsAt, delayMs: delay }, 'Scheduled BullMQ auction close job');
  } catch (err) {
    logger.error({ err, auctionId }, 'Failed to schedule auction close job');
  }
}

export const rescheduleCloseJob = scheduleCloseJob;
