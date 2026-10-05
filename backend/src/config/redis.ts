import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

/**
 * Socket.io Redis Adapter requires two dedicated Redis connections:
 * - pubClient: Dedicated to publishing events across instances
 * - subClient: Dedicated to subscribing to incoming events
 * Reusing a single client for pub/sub breaks because clients in subscribe mode
 * cannot execute other standard Redis commands.
 */
export const pubClient = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: env.NODE_ENV === 'test',
  retryStrategy: (times) => {
    if (env.NODE_ENV === 'test') return null;
    return Math.min(times * 100, 3000);
  },
});

export const subClient = pubClient.duplicate();

/**
 * Third, general-purpose client for BullMQ job queues and presence tracking.
 * Kept separate so queue/presence traffic never contends with high-frequency
 * real-time broadcast pub/sub streams.
 */
export const redisClient = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: env.NODE_ENV === 'test',
  retryStrategy: (times) => {
    if (env.NODE_ENV === 'test') return null;
    return Math.min(times * 100, 3000);
  },
});

pubClient.on('error', (err) => {
  if (env.NODE_ENV !== 'test') logger.error({ err }, 'Redis pubClient error');
});

subClient.on('error', (err) => {
  if (env.NODE_ENV !== 'test') logger.error({ err }, 'Redis subClient error');
});

redisClient.on('error', (err) => {
  if (env.NODE_ENV !== 'test') logger.error({ err }, 'Redis redisClient error');
});
