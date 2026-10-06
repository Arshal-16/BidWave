import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { redisClient } from '../config/redis';

/**
 * Health Check Route Module (/api/v1/health)
 *
 * Provides system liveness and readiness monitoring endpoints for load balancers (e.g. Nginx, Docker healthchecks).
 */
const router = Router();

/**
 * @route   GET /api/v1/health
 * @desc    Check liveness and connectivity of PostgreSQL database and Redis cluster
 * @access  Public
 * @res     200 { status: 'healthy', timestamp, uptime, services: { database: 'ok', redis: 'ok' } }
 * @res     503 { status: 'degraded', timestamp, uptime, services: { ... } } if any dependency is unreachable
 */
router.get('/', async (_req: Request, res: Response) => {
  let dbStatus = 'ok';
  let redisStatus = 'ok';

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = 'unhealthy';
  }

  try {
    const pong = await redisClient.ping();
    if (pong !== 'PONG') redisStatus = 'unhealthy';
  } catch {
    redisStatus = 'unhealthy';
  }

  const isHealthy = dbStatus === 'ok' && redisStatus === 'ok';

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: dbStatus,
      redis: redisStatus,
    },
  });
});

export const healthRoutes = router;

