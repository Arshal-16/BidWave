import { z } from 'zod';
import { AuctionStatus } from '@prisma/client';

export const createAuctionSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(120),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  images: z.array(z.string().url('Invalid image URL')).max(8).default([]),
  startingPrice: z.number().positive('Starting price must be greater than 0'),
  reservePrice: z.number().positive('Reserve price must be greater than 0').optional(),
  minIncrement: z.number().positive('Minimum increment must be greater than 0').default(1),
  startsAt: z.string().datetime({ message: 'Invalid startsAt ISO datetime string' }).optional(),
  endsAt: z.string().datetime({ message: 'Invalid endsAt ISO datetime string' }),
  antiSnipeWindowSeconds: z.number().int().min(10).max(300).default(30),
  antiSnipeExtensionSeconds: z.number().int().min(10).max(600).default(60),
});

export const updateAuctionSchema = z.object({
  title: z.string().min(3).max(120).optional(),
  description: z.string().min(10).optional(),
  images: z.array(z.string().url()).max(8).optional(),
  startingPrice: z.number().positive().optional(),
  reservePrice: z.number().positive().optional(),
  minIncrement: z.number().positive().optional(),
  endsAt: z.string().datetime().optional(),
});

export const placeBidSchema = z.object({
  amount: z.number().positive('Bid amount must be positive'),
});

export const listAuctionsQuerySchema = z.object({
  status: z.nativeEnum(AuctionStatus).optional(),
  sellerId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(12),
  search: z.string().optional(),
});
