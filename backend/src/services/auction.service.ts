import { prisma } from '../config/prisma';
import { auctionRepository } from '../repositories/auction.repository';
import { AppError } from '../utils/AppError';
import { AuctionStatus, Prisma } from '@prisma/client';
import { scheduleCloseJob } from '../jobs/queue';

export class AuctionService {
  async createAuction(sellerId: string, input: {
    title: string;
    description: string;
    images?: string[];
    startingPrice: number;
    reservePrice?: number;
    minIncrement?: number;
    startsAt?: string;
    endsAt: string;
    antiSnipeWindowSeconds?: number;
    antiSnipeExtensionSeconds?: number;
  }) {
    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    const endsAt = new Date(input.endsAt);

    if (endsAt <= startsAt) {
      throw new AppError(400, 'End time must be after start time.');
    }

    const auction = await auctionRepository.create({
      seller: { connect: { id: sellerId } },
      title: input.title,
      description: input.description,
      images: input.images || [],
      startingPrice: input.startingPrice,
      reservePrice: input.reservePrice,
      minIncrement: input.minIncrement ?? 1.0,
      antiSnipeWindowSeconds: input.antiSnipeWindowSeconds ?? 30,
      antiSnipeExtensionSeconds: input.antiSnipeExtensionSeconds ?? 60,
      startsAt,
      endsAt,
      status: AuctionStatus.OPEN,
    });

    // Schedule BullMQ delayed close job for the auction's end time
    await scheduleCloseJob(auction.id, auction.endsAt);

    return auction;
  }

  async listAuctions(params: {
    status?: AuctionStatus;
    sellerId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 12;
    const skip = (page - 1) * limit;

    const { items, total } = await auctionRepository.findMany({
      status: params.status,
      sellerId: params.sellerId,
      search: params.search,
      skip,
      take: limit,
    });

    return {
      items: items.map((item) => ({
        ...item,
        startingPrice: Number(item.startingPrice),
        reservePrice: item.reservePrice ? Number(item.reservePrice) : null,
        minIncrement: Number(item.minIncrement),
        currentHighestBidAmount: item.currentHighestBid ? Number(item.currentHighestBid.amount) : null,
        totalBids: item._count.bids,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAuctionById(id: string) {
    const auction = await auctionRepository.findById(id);
    if (!auction) {
      throw new AppError(404, 'Auction not found.');
    }

    return {
      ...auction,
      startingPrice: Number(auction.startingPrice),
      reservePrice: auction.reservePrice ? Number(auction.reservePrice) : null,
      minIncrement: Number(auction.minIncrement),
      currentHighestBidAmount: auction.currentHighestBid ? Number(auction.currentHighestBid.amount) : null,
      totalBids: auction._count.bids,
    };
  }

  async getAuctionSnapshot(auctionId: string) {
    const auction = await auctionRepository.findById(auctionId);
    if (!auction) {
      throw new AppError(404, 'Auction not found.');
    }

    return {
      id: auction.id,
      title: auction.title,
      status: auction.status,
      highestBid: auction.currentHighestBid ? Number(auction.currentHighestBid.amount) : null,
      highestBidderId: auction.currentHighestBid ? auction.currentHighestBid.bidderId : null,
      bidderCount: auction._count.bids,
      startsAt: auction.startsAt.toISOString(),
      endsAt: auction.endsAt.toISOString(),
      minIncrement: Number(auction.minIncrement),
      startingPrice: Number(auction.startingPrice),
    };
  }

  async updateAuction(
    auctionId: string,
    sellerId: string,
    updates: {
      title?: string;
      description?: string;
      images?: string[];
      startingPrice?: number;
      reservePrice?: number;
      minIncrement?: number;
      endsAt?: string;
    },
  ) {
    const auction = await auctionRepository.findById(auctionId);
    if (!auction) {
      throw new AppError(404, 'Auction not found.');
    }

    if (auction.sellerId !== sellerId) {
      throw new AppError(403, 'You do not have permission to edit this auction.');
    }

    const hasBids = auction._count.bids > 0;

    // BR5: An auction can only be fully edited while it has zero bids.
    // Once a bid exists, price and end-time fields are immutable; only images and description can change.
    if (hasBids) {
      if (updates.startingPrice !== undefined || updates.minIncrement !== undefined || updates.endsAt !== undefined) {
        throw new AppError(409, 'Cannot modify price or end time on an auction with existing bids.');
      }
    }

    const dataToUpdate: Prisma.AuctionUpdateInput = {};
    if (updates.title) dataToUpdate.title = updates.title;
    if (updates.description) dataToUpdate.description = updates.description;
    if (updates.images) dataToUpdate.images = updates.images;
    if (!hasBids && updates.startingPrice !== undefined) dataToUpdate.startingPrice = updates.startingPrice;
    if (updates.reservePrice !== undefined) dataToUpdate.reservePrice = updates.reservePrice;
    if (!hasBids && updates.minIncrement !== undefined) dataToUpdate.minIncrement = updates.minIncrement;
    if (!hasBids && updates.endsAt) {
      dataToUpdate.endsAt = new Date(updates.endsAt);
    }

    const updated = await auctionRepository.update(auctionId, dataToUpdate);

    if (!hasBids && updates.endsAt) {
      await scheduleCloseJob(auctionId, updated.endsAt);
    }

    return updated;
  }

  async cancelAuction(auctionId: string, sellerId: string) {
    const auction = await auctionRepository.findById(auctionId);
    if (!auction) {
      throw new AppError(404, 'Auction not found.');
    }

    if (auction.sellerId !== sellerId) {
      throw new AppError(403, 'You do not have permission to cancel this auction.');
    }

    // FR2: A Seller can cancel before any bid exists
    if (auction._count.bids > 0) {
      throw new AppError(409, 'Cannot cancel an auction that has active bids.');
    }

    return auctionRepository.update(auctionId, {
      status: AuctionStatus.CANCELLED,
    });
  }
}

export const auctionService = new AuctionService();
