import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { redisClient } from '../config/redis';

const router = Router();

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
