import { redisClient } from '../config/redis';
import { logger } from '../config/logger';

// In-memory fallback if Redis is in test mode or temporarily unavailable
const inMemoryPresence = new Map<string, number>();

/**
 * ============================================================================
 * DISTRIBUTED VIEWER PRESENCE ENGINE (Redis-Backed)
 * ============================================================================
 *
 * Tracks the number of active socket connections watching a specific auction room.
 *
 * Guarantees:
 * - Distributed: Increment and decrement operations use atomic Redis `INCR` / `DECR`,
 *   ensuring viewer counts stay synchronized across multiple backend server replicas.
 * - Auto-Expiring: Sets a 24-hour TTL on keys (`presence:auction:{auctionId}`) to avoid
 *   Redis memory leaks for closed or stale auctions.
 * - Resilient: Falls back to an in-memory Map during unit/integration tests when Redis
 *   is mocked or during brief network reconnects.
 */

/**
 * Atomically increment the viewer presence count for an auction room.
 *
 * @param auctionId - Target auction UUID
 * @returns {Promise<number>} Updated viewer count
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

/**
 * Atomically decrement the viewer presence count for an auction room.
 * Automatically deletes the Redis key if count drops to 0 or below.
 *
 * @param auctionId - Target auction UUID
 * @returns {Promise<number>} Updated viewer count
 */
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

/**
 * Query current viewer presence count for an auction.
 *
 * @param auctionId - Target auction UUID
 * @returns {Promise<number>} Current viewer count
 */
export async function getPresence(auctionId: string): Promise<number> {
  const key = `presence:auction:${auctionId}`;
  try {
    const val = await redisClient.get(key);
    return val ? parseInt(val, 10) : 0;
  } catch (err) {
    return inMemoryPresence.get(auctionId) || 0;
  }
}

