import { createCloseAuctionWorker } from './processors/closeAuction.processor';
import { createSendEmailWorker } from './processors/sendEmail.processor';
import { logger } from '../config/logger';
import { prisma } from '../config/prisma';
import { redisClient } from '../config/redis';

logger.info('🚀 Starting BidWave background job worker process...');

const closeWorker = createCloseAuctionWorker();
const emailWorker = createSendEmailWorker();

closeWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'close-auction job completed');
});

closeWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'close-auction job failed');
});

emailWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'email job completed');
});

emailWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'email job failed');
});

const gracefulShutdown = async (signal: string) => {
  logger.info({ signal }, 'Worker process shutting down gracefully...');
  await closeWorker.close();
  await emailWorker.close();
  await prisma.$disconnect();
  redisClient.disconnect();
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
