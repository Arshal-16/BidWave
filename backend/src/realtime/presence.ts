import { redisClient } from '../config/redis';
import { logger } from '../config/logger';

// In-memory fallback if Redis is in test mode or temporarily unavailable
const inMemoryPresence = new Map<string, number>();

/**
 * Real-time presence tracking backed by Redis.
 * Ensures viewer counts remain accurate across all load-balanced backend instances.
 */
export async function incrementPresence(auctionId: string): Promise<number> {
  const key = `presence:auction:${auctionId}`;
  try {
    const count = await redisClient.incr(key);
    // Expire presence keys after 24h of inactivity to avoid memory leaks
    await redisClient.expire(key, 86400);
    return count;
  } catch (err) {
    const count = (inMemoryPresence.get(auctionId) || 0) + 1;
    inMemoryPresence.set(auctionId, count);
    return count;
  }
}

export async function decrementPresence(auctionId: string): Promise<number> {
  const key = `presence:auction:${auctionId}`;
  try {
    const count = await redisClient.decr(key);
    if (count <= 0) {
      await redisClient.del(key);
      return 0;
    }
    return count;
  } catch (err) {
    const count = Math.max(0, (inMemoryPresence.get(auctionId) || 1) - 1);
    inMemoryPresence.set(auctionId, count);
    return count;
  }
}

export async function getPresence(auctionId: string): Promise<number> {
  const key = `presence:auction:${auctionId}`;
  try {
    const val = await redisClient.get(key);
    return val ? parseInt(val, 10) : 0;
  } catch (err) {
    return inMemoryPresence.get(auctionId) || 0;
  }
}
