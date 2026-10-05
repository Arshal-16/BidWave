import { Router } from 'express';
import { auctionController } from '../controllers/auction.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { validateBody, validateQuery } from '../middleware/validate.middleware';
import { createAuctionSchema, updateAuctionSchema, listAuctionsQuerySchema } from '../validators/auction.schema';
import { Role } from '@prisma/client';

const router = Router();

router.get('/', validateQuery(listAuctionsQuerySchema), auctionController.list);
router.get('/:id', auctionController.getById);

// Seller/Admin protected routes
router.post(
  '/',
  requireAuth,
  requireRole(Role.SELLER, Role.ADMIN),
  validateBody(createAuctionSchema),
  auctionController.create,
);

router.patch(
  '/:id',
  requireAuth,
  requireRole(Role.SELLER, Role.ADMIN),
  validateBody(updateAuctionSchema),
  auctionController.update,
);

router.delete(
  '/:id',
  requireAuth,
  requireRole(Role.SELLER, Role.ADMIN),
  auctionController.cancel,
);

router.post(
  '/upload-url',
  requireAuth,
  requireRole(Role.SELLER, Role.ADMIN),
  auctionController.getUploadUrl,
);

export const auctionRoutes = router;
