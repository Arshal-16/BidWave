import { Request, Response } from 'express';
import { bidRepository } from '../repositories/bid.repository';
import { placeBid } from '../services/bid.service';
import { catchAsync } from '../utils/catchAsync';

export class BidController {
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

  // REST fallback for placing a bid
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
