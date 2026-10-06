import { Request, Response } from 'express';
import { auctionService } from '../services/auction.service';
import { catchAsync } from '../utils/catchAsync';
import { storageService } from '../services/storage.service';

/**
 * AuctionController manages HTTP endpoints for the auction lifecycle.
 *
 * Responsibilities:
 * - Unpacking REST requests for listing, filtering, detail retrieval, creation, updates, and cancellations.
 * - Enforcing caller identity from `req.user` for ownership checks.
 * - Delegating presigned S3 upload requests to `StorageService`.
 */
export class AuctionController {
  /**
   * Create and publish a new timed auction listing.
   *
   * @route   POST /api/v1/auctions
   * @access  Private (SELLER or ADMIN)
   * @body    CreateAuctionInput (title, description, startingPrice, reservePrice?, minIncrement?, endsAt, antiSnipeWindowSeconds?, antiSnipeExtensionSeconds?, images?)
   * @returns 201 Created with newly created auction record.
   * @throws  400 Bad Request if end time is before start time.
   */
  create = catchAsync(async (req: Request, res: Response) => {
    const sellerId = req.user!.id;
    const auction = await auctionService.createAuction(sellerId, req.body);

    res.status(201).json({
      status: 'success',
      data: { auction },
    });
  });

  /**
   * List auctions with optional filtering and pagination.
   *
   * @route   GET /api/v1/auctions
   * @access  Public
   * @query   status, sellerId, search, page (default 1), limit (default 12)
   * @returns 200 OK with paginated list of auctions and total count.
   */
  list = catchAsync(async (req: Request, res: Response) => {
    const result = await auctionService.listAuctions({
      status: req.query.status as any,
      sellerId: req.query.sellerId as string,
      search: req.query.search as string,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 12,
    });

    res.status(200).json({
      status: 'success',
      data: result,
    });
  });

  /**
   * Fetch complete details of a specific auction.
   *
   * @route   GET /api/v1/auctions/:id
   * @access  Public
   * @param   id - Auction UUID
   * @returns 200 OK with auction object including seller details and current highest bid.
   * @throws  404 Not Found if auction does not exist.
   */
  getById = catchAsync(async (req: Request, res: Response) => {
    const auction = await auctionService.getAuctionById(req.params.id);

    res.status(200).json({
      status: 'success',
      data: { auction },
    });
  });

  /**
   * Update metadata (title, description, images) of an auction before bidding has begun.
   *
   * @route   PATCH /api/v1/auctions/:id
   * @access  Private (Seller owner or Admin)
   * @param   id - Auction UUID
   * @body    UpdateAuctionInput (title?, description?, images?)
   * @returns 200 OK with updated auction record.
   * @throws  400 Bad Request if bids have already been placed or auction is not open.
   * @throws  403 Forbidden if user is not the auction owner.
   * @throws  404 Not Found if auction does not exist.
   */
  update = catchAsync(async (req: Request, res: Response) => {
    const sellerId = req.user!.id;
    const updated = await auctionService.updateAuction(req.params.id, sellerId, req.body);

    res.status(200).json({
      status: 'success',
      data: { auction: updated },
    });
  });

  /**
   * Cancel an auction listing before any bids have been placed.
   *
   * @route   DELETE /api/v1/auctions/:id
   * @access  Private (Seller owner or Admin)
   * @param   id - Auction UUID
   * @returns 200 OK with cancelled auction record.
   * @throws  400 Bad Request if bids have already been placed or auction is already closed.
   * @throws  403 Forbidden if user is not the auction owner.
   * @throws  404 Not Found if auction does not exist.
   */
  cancel = catchAsync(async (req: Request, res: Response) => {
    const sellerId = req.user!.id;
    const cancelled = await auctionService.cancelAuction(req.params.id, sellerId);

    res.status(200).json({
      status: 'success',
      data: { auction: cancelled },
    });
  });

  /**
   * Generate a presigned S3/R2 PUT URL for direct-to-storage image uploads.
   *
   * @route   POST /api/v1/auctions/upload-url
   * @access  Private (SELLER or ADMIN)
   * @body    { filename?: string, contentType?: string }
   * @returns 200 OK with `{ uploadUrl, publicUrl, key }`.
   */
  getUploadUrl = catchAsync(async (req: Request, res: Response) => {
    const { filename, contentType } = req.body;
    const result = await storageService.generateUploadUrl(
      filename || 'image.jpg',
      contentType || 'image/jpeg',
    );

    res.status(200).json({
      status: 'success',
      data: result,
    });
  });
}

export const auctionController = new AuctionController();

