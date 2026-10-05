import http from 'http';
import { app } from './app';
import { initSocketServer } from './realtime/io';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/prisma';
import { pubClient, subClient, redisClient } from './config/redis';

const server = http.createServer(app);

// Attach Socket.io server with Redis adapter
const io = initSocketServer(server);

const PORT = env.PORT;

server.listen(PORT, () => {
  logger.info(`⚡ BidWave HTTP & WebSocket Server running on port ${PORT} [${env.NODE_ENV}]`);
  logger.info(`👉 Health check: http://localhost:${PORT}/api/v1/health`);
});

// Graceful shutdown handling
const handleGracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  server.close(async () => {
    logger.info('HTTP server closed.');

    try {
      io.close();
      logger.info('Socket.io server closed.');

      await prisma.$disconnect();
      logger.info('Prisma disconnected.');

      pubClient.disconnect();
      subClient.disconnect();
      redisClient.disconnect();
      logger.info('Redis connections closed.');

      logger.info('Graceful shutdown completed.');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during graceful shutdown');
      process.exit(1);
    }
  });

  // Force close if graceful shutdown takes longer than 10 seconds
  setTimeout(() => {
    logger.error('Shutdown timed out. Forcing process exit.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
