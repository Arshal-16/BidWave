import { prisma } from '../config/prisma';
import { auctionRepository } from '../repositories/auction.repository';
import { AppError } from '../utils/AppError';
import { AuctionStatus, Prisma } from '@prisma/client';
import { scheduleCloseJob } from '../jobs/queue';

/**
 * ============================================================================
 * AUCTION DOMAIN SERVICE: AuctionService
 * ============================================================================
 *
 * Implements business rules and state lifecycle transitions for auctions.
 *
 * Business Rules & Invariants:
 * - BR1: Status begins at `OPEN` upon creation.
 * - BR2: A Seller can cancel an auction only before any bids exist (FR2).
 * - BR5: An auction's financial parameters (`startingPrice`, `minIncrement`, `endsAt`)
 *   can only be edited when zero bids exist. Once bidding commences, only metadata
 *   (`title`, `description`, `images`) may be updated.
 * - BullMQ Integration: Automatically schedules delayed close job on creation/reschedule.
 */
export class AuctionService {
  /**
   * Create and publish a new auction listing.
   * Automatically schedules a BullMQ delayed job to trigger at `endsAt`.
   *
   * @param sellerId - User ID of the listing creator
   * @param input    - Auction configuration parameters
   * @returns Newly created Auction database record
   * @throws  400 Bad Request if `endsAt <= startsAt`
   */
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

  /**
   * Query auctions with optional status, seller, search keyword, and pagination.
   *
   * @param params - Filtering and pagination parameters
   * @returns Paginated list of formatted auctions with numeric prices and total counts
   */
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

  /**
   * Fetch complete record for a single auction by UUID.
   *
   * @param id - Auction UUID
   * @returns Auction object with numeric price conversions
   * @throws  404 Not Found if auction does not exist
   */
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

  /**
   * Generates a lightweight authoritative state snapshot for WebSocket `auction:state` responses.
   *
   * @param auctionId - Target auction UUID
   * @returns AuctionRoomState snapshot
   * @throws  404 Not Found if auction does not exist
   */
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

  /**
   * Update auction properties before bidding starts or update non-financial fields if bids exist (BR5).
   *
   * @param auctionId - Target auction UUID
   * @param sellerId  - Requesting user ID for ownership validation
   * @param updates   - Fields to update
   * @returns Updated auction record
   * @throws  403 Forbidden if user is not owner
   * @throws  404 Not Found if auction does not exist
   * @throws  409 Conflict if attempting to modify pricing or deadlines on active bidding
   */
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

  /**
   * Cancel an open auction listing before any bids exist (FR2).
   *
   * @param auctionId - Target auction UUID
   * @param sellerId  - Requesting user ID for ownership validation
   * @returns Updated auction record with status CANCELLED
   * @throws  403 Forbidden if not owner
   * @throws  404 Not Found if auction does not exist
   * @throws  409 Conflict if auction already has bids placed
   */
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

