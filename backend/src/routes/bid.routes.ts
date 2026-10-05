import { Router } from 'express';
import { bidController } from '../controllers/bid.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { placeBidSchema } from '../validators/auction.schema';

const router = Router();

router.get('/:auctionId/bids', bidController.getHistory);
router.post('/:auctionId/bids', requireAuth, validateBody(placeBidSchema), bidController.placeRestBid);

export const bidRoutes = router;
