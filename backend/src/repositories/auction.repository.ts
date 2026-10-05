import { prisma } from '../config/prisma';
import { Auction, AuctionStatus, Prisma } from '@prisma/client';

export class AuctionRepository {
  async findById(id: string) {
    return prisma.auction.findUnique({
      where: { id },
      include: {
        seller: {
          select: { id: true, email: true, role: true },
        },
        currentHighestBid: {
          include: {
            bidder: {
              select: { id: true, email: true },
            },
          },
        },
        _count: {
          select: { bids: true },
        },
      },
    });
  }

  async findMany(params: {
    status?: AuctionStatus;
    sellerId?: string;
    search?: string;
    skip?: number;
    take?: number;
  }) {
    const { status, sellerId, search, skip = 0, take = 12 } = params;

    const where: Prisma.AuctionWhereInput = {};
    if (status) where.status = status;
    if (sellerId) where.sellerId = sellerId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.auction.findMany({
        where,
        skip,
        take,
        orderBy: { endsAt: 'asc' },
        include: {
          seller: { select: { id: true, email: true } },
          currentHighestBid: true,
          _count: { select: { bids: true } },
        },
      }),
      prisma.auction.count({ where }),
    ]);

    return { items, total };
  }

  async create(data: Prisma.AuctionCreateInput): Promise<Auction> {
    return prisma.auction.create({ data });
  }

  async update(id: string, data: Prisma.AuctionUpdateInput): Promise<Auction> {
    return prisma.auction.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<Auction> {
    return prisma.auction.delete({
      where: { id },
    });
  }
}

export const auctionRepository = new AuctionRepository();
