import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { catchAsync } from '../utils/catchAsync';
import { AppError } from '../utils/AppError';

export class UserController {
  getProfile = catchAsync(async (req: Request, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        role: true,
        emailVerified: true,
        createdAt: true,
        _count: {
          select: {
            auctions: true,
            bids: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError(404, 'User not found.');
    }

    res.status(200).json({
      status: 'success',
      data: { user },
    });
  });

  getMyBids = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const bids = await prisma.bid.findMany({
      where: { bidderId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        auction: {
          select: {
            id: true,
            title: true,
            status: true,
            endsAt: true,
            currentHighestBidId: true,
          },
        },
      },
    });

    res.status(200).json({
      status: 'success',
      data: {
        bids: bids.map((b) => ({
          id: b.id,
          amount: Number(b.amount),
          createdAt: b.createdAt,
          auction: b.auction,
          isWinning: b.auction.currentHighestBidId === b.id,
        })),
      },
    });
  });
}

export const userController = new UserController();
