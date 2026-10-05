import { Router } from 'express';
import { authRoutes } from './auth.routes';
import { auctionRoutes } from './auction.routes';
import { bidRoutes } from './bid.routes';
import { userRoutes } from './user.routes';
import { healthRoutes } from './health.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/auctions', auctionRoutes);
router.use('/auctions', bidRoutes);
router.use('/users', userRoutes);

export const apiRouter = router;
