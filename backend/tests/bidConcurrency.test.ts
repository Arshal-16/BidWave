import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as ioClient, Socket } from 'socket.io-client';
import { app } from '../src/app';
import { createTestServer, createTestAuction, getTokenFor, createTestUser } from './setup';
import { prisma } from '../src/config/prisma';
import { Role } from '@prisma/client';

describe('Concurrent Bidding & Real-Time Conflict Resolution', () => {
  let seller: any;

  beforeAll(async () => {
    seller = await createTestUser('concurrency-seller@bidwave.com', Role.SELLER);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('accepts exactly one bid when multiple clients bid simultaneously on the same auction (NFR1)', async () => {
    const { httpServer, url } = await createTestServer(app);
    const auction = await createTestAuction(seller.id, {
      startingPrice: 100,
      minIncrement: 1,
    });

    const bidderCount = 5;
    const sockets: Socket[] = await Promise.all(
      Array.from({ length: bidderCount }, async (_, i) => {
        const bidder = await createTestUser(`race-bidder-${i}@bidwave.com`, Role.BIDDER);
        const token = await getTokenFor(bidder);
        const socket = ioClient(`${url}/auctions`, {
          auth: { token },
          transports: ['websocket'],
          reconnection: false,
        });

        await new Promise<void>((resolve) => {
          socket.on('connect', () => resolve());
        });
        socket.emit('auction:join', { auctionId: auction.id });
        return socket;
      }),
    );

    const accepted: any[] = [];
    const rejected: any[] = [];

    sockets.forEach((s) => {
      s.on('bid:accepted', (data) => accepted.push(data));
      s.on('bid:rejected', (data) => rejected.push(data));
    });

    // All five fire the SAME winning bid amount simultaneously — only one
    // may legally win; this is the exact race the version-guarded
    // transaction in bid.service.ts is designed to resolve correctly.
    await Promise.all(
      sockets.map(
        (s) =>
          new Promise<void>((resolve) => {
            s.emit('bid:place', { auctionId: auction.id, amount: 150 });
            resolve();
          }),
      ),
    );

    // Allow network roundtrips and broadcasts to settle
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Exactly ONE accepted-bid broadcast should have been received by the room.
    // Each connected socket in the room receives the broadcast, so we verify that all received
    // `bid:accepted` events point to the identical unique bidId.
    const uniqueAcceptedBidIds = new Set(accepted.map((a: any) => a.bidId));
    expect(uniqueAcceptedBidIds.size).toBe(1);

    // Exactly (bidderCount - 1) = 4 sockets should have received a private rejection event
    expect(rejected.length).toBe(bidderCount - 1);

    // Clean up
    sockets.forEach((s) => s.disconnect());
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });
});
