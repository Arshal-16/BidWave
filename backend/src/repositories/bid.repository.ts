import { prisma } from '../config/prisma';
import { Bid } from '@prisma/client';

export class BidRepository {
  async findByAuctionId(auctionId: string, skip = 0, take = 50) {
    const [bids, total] = await Promise.all([
      prisma.bid.findMany({
        where: { auctionId },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          bidder: {
            select: { id: true, email: true },
          },
        },
      }),
      prisma.bid.count({ where: { auctionId } }),
    ]);

    return { bids, total };
  }

  async findById(id: string): Promise<Bid | null> {
    return prisma.bid.findUnique({ where: { id } });
  }
}

export const bidRepository = new BidRepository();
