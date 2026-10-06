import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { catchAsync } from '../utils/catchAsync';
import { AppError } from '../utils/AppError';

/**
 * UserController handles HTTP endpoints for user profile and activity.
 */
export class UserController {
  /**
   * Fetch profile information for the authenticated user along with auction and bid counts.
   *
   * @route   GET /api/v1/users/profile
   * @access  Private (Authenticated User)
   * @returns 200 OK with user profile and aggregate counts.
   * @throws  404 Not Found if user record does not exist.
   */
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

  /**
   * Fetch the 50 most recent bids placed by the authenticated user across all auctions.
   * Calculates `isWinning` dynamically by matching `currentHighestBidId`.
   *
   * @route   GET /api/v1/users/my-bids
   * @access  Private (Authenticated User)
   * @returns 200 OK with array of user bids and auction metadata.
   */
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

