import { Router } from 'express';
import { bidController } from '../controllers/bid.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { placeBidSchema } from '../validators/auction.schema';

/**
 * Bid Route Module (/api/v1/auctions/:auctionId/bids)
 *
 * Provides endpoints for retrieving bid history and fallback REST bidding.
 * (Note: The primary bidding interface is WebSocket `bid:place` via Socket.io).
 */
const router = Router();

/**
 * @route   GET /api/v1/auctions/:auctionId/bids
 * @desc    Fetch paginated historical bids for an auction
 * @access  Public
 * @param   auctionId - Auction UUID
 * @query   { page?: number, limit?: number }
 * @res     200 { status: 'success', data: { bids: Bid[], pagination: { page, limit, total, totalPages } } }
 */
router.get('/:auctionId/bids', bidController.getHistory);

/**
 * @route   POST /api/v1/auctions/:auctionId/bids
 * @desc    REST fallback endpoint to place a bid on an active auction
 * @access  Private (Requires authenticated user with BIDDER, SELLER, or ADMIN role)
 * @param   auctionId - Auction UUID
 * @body    { amount: number } (Validated by placeBidSchema)
 * @res     201 { status: 'success', data: PlaceBidResult }
 * @errors  400 (Validation failed), 401 (Unauthorized), 409 (Race condition conflict / bid below minimum / self-bidding)
 */
router.post('/:auctionId/bids', requireAuth, validateBody(placeBidSchema), bidController.placeRestBid);

export const bidRoutes = router;

