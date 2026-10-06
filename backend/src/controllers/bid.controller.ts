import { Request, Response } from 'express';
import { bidRepository } from '../repositories/bid.repository';
import { placeBid } from '../services/bid.service';
import { catchAsync } from '../utils/catchAsync';

/**
 * BidController handles REST endpoints for auction bids.
 *
 * Provides:
 * - Paginated bid history with masked bidder identifiers.
 * - HTTP fallback for placing bids (delegates directly to `placeBid` concurrency engine).
 */
export class BidController {
  /**
   * Fetch historical bids for an auction with pagination.
   *
   * @route   GET /api/v1/auctions/:auctionId/bids
   * @access  Public
   * @param   auctionId - Auction UUID
   * @query   page (default 1), limit (default 50)
   * @returns 200 OK with list of formatted bids and pagination metadata.
   */
  getHistory = catchAsync(async (req: Request, res: Response) => {
    const { auctionId } = req.params;
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const skip = (page - 1) * limit;

    const { bids, total } = await bidRepository.findByAuctionId(auctionId, skip, limit);

    res.status(200).json({
      status: 'success',
      data: {
        bids: bids.map((bid) => ({
          id: bid.id,
          amount: Number(bid.amount),
          createdAt: bid.createdAt,
          bidder: {
            id: bid.bidder.id,
            email: bid.bidder.email,
            maskedId: bid.bidder.id.slice(0, 8),
          },
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  });

  /**
   * REST fallback endpoint for placing a bid.
   *
   * Uses the same optimistic-concurrency `placeBid` engine as the WebSocket handler.
   *
   * @route   POST /api/v1/auctions/:auctionId/bids
   * @access  Private (Authenticated User)
   * @param   auctionId - Auction UUID
   * @body    { amount: number }
   * @returns 201 Created with accepted bid metadata.
   * @throws  409 Conflict if bid is out of date, below increment, or fails race retry.
   */
  placeRestBid = catchAsync(async (req: Request, res: Response) => {
    const { auctionId } = req.params;
    const bidderId = req.user!.id;
    const { amount } = req.body;

    const result = await placeBid(auctionId, bidderId, amount);

    res.status(201).json({
      status: 'success',
      data: result,
    });
  });
}

export const bidController = new BidController();

