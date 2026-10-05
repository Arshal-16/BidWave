import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { createTestUser, getTokenFor, createTestAuction } from './setup';
import { prisma } from '../src/config/prisma';
import { Role } from '@prisma/client';
import { placeBid } from '../src/services/bid.service';

describe('Auction Service & REST Endpoints', () => {
  let seller: any;
  let bidder1: any;
  let bidder2: any;
  let sellerToken: string;
  let bidderToken: string;

  beforeAll(async () => {
    // Generate test users
    seller = await createTestUser('test-seller@example.com', Role.SELLER);
    bidder1 = await createTestUser('test-bidder1@example.com', Role.BIDDER);
    bidder2 = await createTestUser('test-bidder2@example.com', Role.BIDDER);

    sellerToken = await getTokenFor(seller);
    bidderToken = await getTokenFor(bidder1);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('GET /api/v1/auctions should return paginated list of auctions', async () => {
    const res = await request(app).get('/api/v1/auctions');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.pagination).toBeDefined();
  });

  it('POST /api/v1/auctions allows a SELLER to create an auction', async () => {
    const now = new Date();
    const endsAt = new Date(now.getTime() + 1000 * 60 * 60);

    const res = await request(app)
      .post('/api/v1/auctions')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        title: 'Rare Vintage Watch',
        description: 'Pristine 1970 chronograph watch in perfect working condition.',
        startingPrice: 500,
        reservePrice: 800,
        minIncrement: 25,
        endsAt: endsAt.toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.auction.title).toBe('Rare Vintage Watch');
  });

  it('POST /api/v1/auctions rejects creation when user is not a SELLER', async () => {
    const now = new Date();
    const res = await request(app)
      .post('/api/v1/auctions')
      .set('Authorization', `Bearer ${bidderToken}`)
      .send({
        title: 'Unauthorized Item',
        description: 'Should fail authorization check.',
        startingPrice: 100,
        endsAt: new Date(now.getTime() + 1000 * 60 * 60).toISOString(),
      });

    expect(res.status).toBe(403);
  });

  it('placeBid rejects bids placed by the auction seller (BR2)', async () => {
    const auction = await createTestAuction(seller.id, { startingPrice: 100 });
    
    await expect(placeBid(auction.id, seller.id, 150)).rejects.toThrow(
      'Sellers cannot bid on their own auction.',
    );
  });

  it('placeBid rejects bids lower than starting price or minIncrement (BR1)', async () => {
    const auction = await createTestAuction(seller.id, {
      startingPrice: 100,
      minIncrement: 10,
    });

    // Starting price is 100; bidding 90 should be rejected
    await expect(placeBid(auction.id, bidder1.id, 90)).rejects.toThrow(
      'Bid must be at least $100.00.',
    );

    // Place first valid bid of 100
    const result1 = await placeBid(auction.id, bidder1.id, 100);
    expect(result1.bid.amount).toBe(100);

    // Next bid must be at least 100 + 10 = 110. Bidding 105 should be rejected
    await expect(placeBid(auction.id, bidder2.id, 105)).rejects.toThrow(
      'Bid must be at least $110.00.',
    );

    // Valid next bid of 115
    const result2 = await placeBid(auction.id, bidder2.id, 115);
    expect(result2.bid.amount).toBe(115);
  });
});
