import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { requireAuth } from '../middleware/auth.middleware';

/**
 * User Route Module (/api/v1/users)
 *
 * Provides endpoints for retrieving authenticated user account details and user bid history.
 */
const router = Router();

/**
 * @route   GET /api/v1/users/profile
 * @desc    Fetch authenticated user's profile and aggregated counts (total auctions listed, total bids placed)
 * @access  Private (Requires valid JWT access token)
 * @res     200 { status: 'success', data: { user } }
 * @errors  401 (Unauthorized), 404 (User not found)
 */
router.get('/profile', requireAuth, userController.getProfile);

/**
 * @route   GET /api/v1/users/my-bids
 * @desc    Fetch recent bids placed by the authenticated user across all auctions (with win status)
 * @access  Private (Requires valid JWT access token)
 * @res     200 { status: 'success', data: { bids: Array<{ id, amount, createdAt, auction, isWinning }> } }
 * @errors  401 (Unauthorized)
 */
router.get('/my-bids', requireAuth, userController.getMyBids);

export const userRoutes = router;

