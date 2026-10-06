import { Router } from 'express';
import { auctionController } from '../controllers/auction.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { validateBody, validateQuery } from '../middleware/validate.middleware';
import { createAuctionSchema, updateAuctionSchema, listAuctionsQuerySchema } from '../validators/auction.schema';
import { Role } from '@prisma/client';

/**
 * Auction Route Module (/api/v1/auctions)
 *
 * Handles auction listing, detail viewing, creation, metadata editing,
 * cancellation, and presigned image upload URL generation.
 */
const router = Router();

/**
 * @route   GET /api/v1/auctions
 * @desc    List auctions with optional status filtering, search term, and pagination
 * @access  Public
 * @query   { status?: AuctionStatus, sellerId?: string, search?: string, page?: number, limit?: number }
 * @res     200 { status: 'success', data: { items: Auction[], pagination: { total, page, limit, totalPages } } }
 */
router.get('/', validateQuery(listAuctionsQuerySchema), auctionController.list);

/**
 * @route   GET /api/v1/auctions/:id
 * @desc    Fetch comprehensive details for a specific auction (including seller and current highest bid)
 * @access  Public
 * @param   id - Auction UUID
 * @res     200 { status: 'success', data: { auction } }
 * @errors  404 (Auction not found)
 */
router.get('/:id', auctionController.getById);

/**
 * @route   POST /api/v1/auctions
 * @desc    Create and publish a new timed auction listing
 * @access  Private (Requires SELLER or ADMIN role)
 * @body    { title, description, startingPrice, reservePrice?, minIncrement?, endsAt, antiSnipeWindowSeconds?, antiSnipeExtensionSeconds?, images? }
 * @res     201 { status: 'success', data: { auction } }
 * @errors  400 (Validation failed / invalid dates), 401 (Unauthorized), 403 (Forbidden - requires SELLER/ADMIN)
 */
router.post(
  '/',
  requireAuth,
  requireRole(Role.SELLER, Role.ADMIN),
  validateBody(createAuctionSchema),
  auctionController.create,
);

/**
 * @route   PATCH /api/v1/auctions/:id
 * @desc    Update editable metadata (title, description, images) of an auction before bidding begins
 * @access  Private (Requires SELLER owner or ADMIN role)
 * @param   id - Auction UUID
 * @body    { title?, description?, images? }
 * @res     200 { status: 'success', data: { auction } }
 * @errors  400 (Validation failed / bidding already commenced), 403 (Not owner), 404 (Not found)
 */
router.patch(
  '/:id',
  requireAuth,
  requireRole(Role.SELLER, Role.ADMIN),
  validateBody(updateAuctionSchema),
  auctionController.update,
);

/**
 * @route   DELETE /api/v1/auctions/:id
 * @desc    Cancel an open auction before any bids are placed (FR2, BR2)
 * @access  Private (Requires SELLER owner or ADMIN role)
 * @param   id - Auction UUID
 * @res     200 { status: 'success', data: { auction } }
 * @errors  400 (Cannot cancel auction with active bids), 403 (Not owner), 404 (Not found)
 */
router.delete(
  '/:id',
  requireAuth,
  requireRole(Role.SELLER, Role.ADMIN),
  auctionController.cancel,
);

/**
 * @route   POST /api/v1/auctions/upload-url
 * @desc    Generate a presigned S3/R2 PUT URL for direct client-side image uploading
 * @access  Private (Requires SELLER or ADMIN role)
 * @body    { filename?: string, contentType?: string }
 * @res     200 { status: 'success', data: { uploadUrl, publicUrl, key } }
 */
router.post(
  '/upload-url',
  requireAuth,
  requireRole(Role.SELLER, Role.ADMIN),
  auctionController.getUploadUrl,
);

export const auctionRoutes = router;

