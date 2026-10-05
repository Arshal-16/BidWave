import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/profile', requireAuth, userController.getProfile);
router.get('/my-bids', requireAuth, userController.getMyBids);

export const userRoutes = router;
