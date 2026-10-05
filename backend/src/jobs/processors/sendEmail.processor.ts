import { Worker, Job } from 'bullmq';
import { redisClient } from '../../config/redis';
import { emailService } from '../../services/email.service';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';

export function createSendEmailWorker(): Worker {
  return new Worker(
    'email',
    async (job: Job) => {
      const data = job.data;
      logger.info({ type: data.type }, 'Processing send-email background job');

      if (data.type === 'outbid') {
        const user = await prisma.user.findUnique({ where: { id: data.bidderId } });
        if (user) {
          await emailService.sendOutbidNotification(user.email, data.auctionTitle, data.newHighestBid);
        }
      } else if (data.type === 'auction-won') {
        await emailService.sendAuctionWonNotification(data.email, data.title, data.amount);
      } else if (data.type === 'auction-sold') {
        await emailService.sendAuctionSoldNotification(data.email, data.title, data.amount);
      }
    },
    { connection: redisClient },
  );
}
