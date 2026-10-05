import http from 'http';
import { Express } from 'express';
import { initSocketServer } from '../src/realtime/io';
import { prisma } from '../src/config/prisma';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';
import { Role, AuctionStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

export async function createTestServer(expressApp: Express) {
  const httpServer = http.createServer(expressApp);
  const io = initSocketServer(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve());
  });

  const address = httpServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to get test server port');
  }

  const url = `http://localhost:${address.port}`;
  return { httpServer, io, url, port: address.port };
}

export async function createTestUser(email: string, role: Role = Role.BIDDER) {
  const passwordHash = await bcrypt.hash('Password123!', 8);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      role,
      emailVerified: true,
    },
  });
}

export async function getTokenFor(userOrEmail: string | { id: string; email: string; role: Role }) {
  let user: { id: string; email: string; role: Role };

  if (typeof userOrEmail === 'string') {
    user = await createTestUser(userOrEmail);
  } else {
    user = userOrEmail;
  }

  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );
}

export async function createTestAuction(sellerId: string, overrides: Record<string, any> = {}) {
  const now = new Date();
  return prisma.auction.create({
    data: {
      sellerId,
      title: 'Test Auction Item',
      description: 'Test auction description for concurrency test',
      startingPrice: 100.0,
      minIncrement: 5.0,
      status: AuctionStatus.OPEN,
      startsAt: new Date(now.getTime() - 1000 * 60),
      endsAt: new Date(now.getTime() + 1000 * 60 * 10),
      antiSnipeWindowSeconds: 30,
      antiSnipeExtensionSeconds: 60,
      version: 0,
      ...overrides,
    },
  });
}
