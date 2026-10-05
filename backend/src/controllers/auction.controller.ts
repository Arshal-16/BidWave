import { Request, Response } from 'express';
import { auctionService } from '../services/auction.service';
import { catchAsync } from '../utils/catchAsync';
import { storageService } from '../services/storage.service';

export class AuctionController {
  create = catchAsync(async (req: Request, res: Response) => {
    const sellerId = req.user!.id;
    const auction = await auctionService.createAuction(sellerId, req.body);

    res.status(201).json({
      status: 'success',
      data: { auction },
    });
  });

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

  getById = catchAsync(async (req: Request, res: Response) => {
    const auction = await auctionService.getAuctionById(req.params.id);

    res.status(200).json({
      status: 'success',
      data: { auction },
    });
  });

  update = catchAsync(async (req: Request, res: Response) => {
    const sellerId = req.user!.id;
    const updated = await auctionService.updateAuction(req.params.id, sellerId, req.body);

    res.status(200).json({
      status: 'success',
      data: { auction: updated },
    });
  });

  cancel = catchAsync(async (req: Request, res: Response) => {
    const sellerId = req.user!.id;
    const cancelled = await auctionService.cancelAuction(req.params.id, sellerId);

    res.status(200).json({
      status: 'success',
      data: { auction: cancelled },
    });
  });

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
