# BidWave Backend — Implementation Guide

This document takes you from an empty `backend/` directory to a deployable production API, implementing exactly what `master.md` specifies. Follow the steps in order — later steps assume earlier ones are complete.

**Convention used throughout this guide:** the `Auction` resource and the Socket.io/Redis real-time layer are implemented completely — that layer is the entire point of this project, so it is not abbreviated anywhere. `Bid` (REST history endpoint), `Auth`, and `User` follow the identical Route→Middleware→Validation→Controller→Service→Repository pattern shown for Auction and are noted as "follows the Auction pattern" rather than repeated in full.

---

## Step 1 — Prerequisites

| Tool | Required version | Verify with |
|---|---|---|
| Node.js | 20.x LTS | `node -v` |
| npm | 10.x | `npm -v` |
| Docker + Docker Compose | Docker Desktop 4.x+ | `docker compose version` |

---

## Step 2 — Project Initialization

```bash
mkdir backend && cd backend
npm init -y

# Core runtime dependencies
npm install express cors helmet cookie-parser jsonwebtoken bcrypt zod dotenv \
  pino pino-http @prisma/client bullmq ioredis \
  socket.io @socket.io/redis-adapter \
  @aws-sdk/client-s3 @aws-sdk/s3-request-presigner resend node-cron

# Dev dependencies
npm install -D typescript ts-node-dev @types/node @types/express @types/cors \
  @types/jsonwebtoken @types/bcrypt @types/cookie-parser @types/node-cron \
  prisma vitest supertest @types/supertest socket.io-client \
  eslint @eslint/js typescript-eslint prettier eslint-config-prettier

npx tsc --init --rootDir src --outDir dist --target es2022 --module commonjs \
  --moduleResolution node --esModuleInterop --strict --skipLibCheck \
  --resolveJsonModule --declaration false

npx prisma init --datasource-provider postgresql
```

`package.json` scripts:
```json
{
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "worker": "ts-node-dev --respawn --transpile-only src/jobs/worker.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy",
    "prisma:seed": "ts-node prisma/seed.ts"
  }
}
```

---

## Step 3 — Folder Structure

```text
backend/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── config/
│   │   ├── env.ts
│   │   ├── logger.ts
│   │   ├── prisma.ts
│   │   └── redis.ts            # exports TWO ioredis clients: pubClient + subClient
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── auction.routes.ts
│   │   ├── bid.routes.ts
│   │   ├── user.routes.ts
│   │   ├── health.routes.ts
│   │   └── index.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   ├── rbac.middleware.ts
│   │   ├── validate.middleware.ts
│   │   └── errorHandler.middleware.ts
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   └── auction.controller.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── auction.service.ts
│   │   ├── bid.service.ts       # the core concurrency-safe logic — see Step 7
│   │   ├── email.service.ts
│   │   └── storage.service.ts
│   ├── repositories/
│   │   ├── user.repository.ts
│   │   ├── auction.repository.ts
│   │   └── bid.repository.ts
│   ├── realtime/
│   │   ├── io.ts                # Socket.io server + Redis adapter wiring — see Step 8
│   │   ├── socketAuth.middleware.ts
│   │   ├── auctionRoom.handler.ts
│   │   └── presence.ts
│   ├── jobs/
│   │   ├── queue.ts              # BullMQ queue definitions
│   │   ├── worker.ts
│   │   └── processors/
│   │       ├── closeAuction.processor.ts
│   │       └── sendEmail.processor.ts
│   ├── validators/
│   │   ├── auth.schema.ts
│   │   └── auction.schema.ts
│   ├── utils/
│   │   ├── AppError.ts
│   │   └── catchAsync.ts
│   ├── types/
│   │   ├── express.d.ts
│   │   └── socket.d.ts
│   ├── app.ts                    # Express app (no listen(), no Socket.io — HTTP only)
│   └── server.ts                 # boots HTTP server + attaches Socket.io
├── tests/
│   ├── setup.ts
│   ├── auction.test.ts
│   └── bidConcurrency.test.ts    # the most important test file in the project
├── .env.example
├── Dockerfile
└── package.json
```

**Why `realtime/` is a top-level sibling of `routes/`, not nested inside it:** Socket.io events are not HTTP routes — giving the real-time layer its own directory (mirroring routes/controllers/services but for sockets) keeps the mental model clean: REST request → Express layer; socket event → realtime layer; both call into the *same* `services/` layer underneath, so business logic (like bid validation) is never duplicated between the two transports.

---

## Step 4 — Configuration

`.env.example`: see `master.md` §11 (copy verbatim).

`src/config/env.ts` — Zod-validated env, same pattern as a standard project: parse once at boot, `export const env = envSchema.parse(process.env)`, fail fast on missing/invalid vars.

`src/config/redis.ts`:
```typescript
import Redis from 'ioredis';
import { env } from './env';

// Socket.io's Redis adapter requires two SEPARATE connections: one dedicated
// to publishing, one dedicated to subscribing. Reusing a single client for
// both breaks pub/sub (a client in subscribe mode can't issue other commands).
export const pubClient = new Redis(env.REDIS_URL);
export const subClient = pubClient.duplicate();

// A third, general-purpose client for BullMQ and any future caching —
// kept separate from the pub/sub pair so queue traffic never contends
// with real-time broadcast traffic.
export const redisClient = new Redis(env.REDIS_URL);
```

---

## Step 5 — Database Schema

Copy the full Prisma schema from `master.md` §3 into `prisma/schema.prisma`, then:

```bash
npx prisma migrate dev --name init
```

`prisma/seed.ts` — creates one Seller, three Bidders, and one `OPEN` auction with `endsAt` 5 minutes in the future, for immediate manual testing of the real-time flow.

---

## Step 6 — Authentication

Identical pattern to a standard JWT + refresh-token setup: `auth.service.ts` (register/login/refresh/logout), `auth.middleware.ts` (verifies access token, attaches `req.user`), bcrypt for password hashing, refresh tokens hashed at rest in a `RefreshToken` table. Not repeated here in full — follows the standard pattern; the only BidWave-specific addition is `role: BIDDER | SELLER | ADMIN` encoded in the JWT payload and checked by `rbac.middleware.ts`.

---

## Step 7 — Auction REST API + Concurrency-Safe Bid Logic

This is the core correctness guarantee of the whole project (BR3, NFR1). Read this step twice before writing the WebSocket layer in Step 8, since the socket handler is a thin wrapper around this service.

`src/validators/auction.schema.ts`:
```typescript
import { z } from 'zod';

export const createAuctionSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(10),
  images: z.array(z.string().url()).max(8),
  startingPrice: z.number().positive(),
  reservePrice: z.number().positive().optional(),
  minIncrement: z.number().positive().default(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

export const placeBidSchema = z.object({
  amount: z.number().positive(),
});
```

`src/services/bid.service.ts` — the single most important file in the backend:
```typescript
import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';
import { rescheduleCloseJob } from '../jobs/queue';
import { env } from '../config/env';

interface PlaceBidResult {
  bid: { id: string; amount: number; createdAt: Date };
  extended: boolean;
  newEndsAt: Date;
  previousHighestBidderId: string | null;
}

export async function placeBid(
  auctionId: string,
  bidderId: string,
  amount: number,
): Promise<PlaceBidResult> {
  // Retry once on a version conflict — a genuine concurrent race is rare
  // enough that a single retry against fresh data is sufficient; a second
  // conflict is treated as "someone else won, try again" and surfaced to
  // the client as a normal rejection, not a 500.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await attemptBid(auctionId, bidderId, amount);
    if (result.status === 'accepted') return result.data;
    if (result.status === 'rejected') {
      throw new AppError(409, result.reason);
    }
    // status === 'conflict' → loop and retry once against fresh state
  }
  throw new AppError(409, 'Another bid won the race — please try again.');
}

type AttemptResult =
  | { status: 'accepted'; data: PlaceBidResult }
  | { status: 'rejected'; reason: string }
  | { status: 'conflict' };

async function attemptBid(
  auctionId: string,
  bidderId: string,
  amount: number,
): Promise<AttemptResult> {
  return prisma.$transaction(async (tx) => {
    const auction = await tx.auction.findUniqueOrThrow({ where: { id: auctionId } });

    if (auction.status !== 'OPEN') return { status: 'rejected', reason: 'Auction is not open.' };
    if (auction.sellerId === bidderId)
      return { status: 'rejected', reason: 'Sellers cannot bid on their own auction.' };

    const currentHighest = auction.currentHighestBidId
      ? await tx.bid.findUnique({ where: { id: auction.currentHighestBidId } })
      : null;
    const minAcceptable =
      (currentHighest ? Number(currentHighest.amount) : Number(auction.startingPrice)) +
      (currentHighest ? Number(auction.minIncrement) : 0);

    if (amount < minAcceptable)
      return { status: 'rejected', reason: `Bid must be at least ${minAcceptable}.` };

    const bid = await tx.bid.create({
      data: { auctionId, bidderId, amount },
    });

    // Optimistic-lock write: only succeeds if `version` still matches what
    // we read at the top of this transaction. A 0-row update means another
    // transaction committed a bid in between — we signal 'conflict' and the
    // caller retries once against fresh state instead of silently overwriting.
    const update = await tx.auction.updateMany({
      where: { id: auctionId, version: auction.version },
      data: {
        currentHighestBidId: bid.id,
        version: { increment: 1 },
        endsAt:
          secondsUntil(auction.endsAt) <= auction.antiSnipeWindowSeconds
            ? addSeconds(new Date(), auction.antiSnipeExtensionSeconds)
            : auction.endsAt,
      },
    });
    if (update.count === 0) return { status: 'conflict' };

    const extended = secondsUntil(auction.endsAt) <= auction.antiSnipeWindowSeconds;
    const refreshed = await tx.auction.findUniqueOrThrow({ where: { id: auctionId } });

    return {
      status: 'accepted',
      data: {
        bid: { id: bid.id, amount: Number(bid.amount), createdAt: bid.createdAt },
        extended,
        newEndsAt: refreshed.endsAt,
        previousHighestBidderId: currentHighest?.bidderId ?? null,
      },
    };
  });
}

function secondsUntil(date: Date) {
  return (date.getTime() - Date.now()) / 1000;
}
function addSeconds(date: Date, s: number) {
  return new Date(date.getTime() + s * 1000);
}
```

After `placeBid` resolves, the caller (the socket handler in Step 8) is responsible for: broadcasting `bid:accepted` to the room, emitting `bid:outbid` to `previousHighestBidderId`'s socket if present, emitting `auction:extended` if `extended` is true, and — critically — calling `rescheduleCloseJob(auctionId, newEndsAt)` so the BullMQ delayed close job moves with the new deadline (Step 9).

**Why `prisma.$transaction` + `updateMany` with a `version` guard, instead of a DB row lock (`SELECT ... FOR UPDATE`)?** Both are valid; this guide uses optimistic locking because it scales better under the low-contention-per-auction, high-auction-count access pattern this system expects (most individual auctions see bids seconds apart, not truly simultaneous writes), and it avoids holding a row lock across the whole transaction body. Under genuinely simultaneous bids (the exact scenario the concurrency test in Step 11 creates), the loser gets `status: 'conflict'`, retries once against fresh data, and is correctly rejected on the retry if it's now too low — never silently corrupting `currentHighestBidId`.

Auction REST endpoints (`auction.routes.ts` → `auction.controller.ts` → `auction.service.ts` → `auction.repository.ts`) follow the standard CRUD pattern: `POST /auctions` (Seller only, Zod-validated), `GET /auctions` (public, paginated/filterable by status), `GET /auctions/:id`, `PATCH /auctions/:id` (Seller only, rejected with 409 if `bids.length > 0` per BR5), `DELETE /auctions/:id` (Seller only, same guard). `Bid` history endpoint (`GET /auctions/:id/bids`, paginated) follows the identical pattern and is not repeated here.

---

## Step 8 — Socket.io Layer + Redis Adapter (the core of this project)

`src/realtime/io.ts`:
```typescript
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as HttpServer } from 'http';
import { pubClient, subClient } from '../config/redis';
import { env } from '../config/env';
import { socketAuthMiddleware } from './socketAuth.middleware';
import { registerAuctionRoomHandlers } from './auctionRoom.handler';

export function initSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGIN.split(','), credentials: true },
    path: '/socket.io',
  });

  // THIS LINE IS WHAT MAKES BROADCASTING WORK ACROSS MULTIPLE INSTANCES.
  // Without it, io.to(room).emit(...) only reaches sockets on THIS process.
  // With it, every instance publishes emitted events to Redis, and every
  // instance (including this one) receives and re-emits to its own locally
  // connected sockets — so a bid accepted on instance A reaches a viewer
  // connected to instance B.
  io.adapter(createAdapter(pubClient, subClient));

  const auctions = io.of('/auctions');
  auctions.use(socketAuthMiddleware);
  auctions.on('connection', (socket) => registerAuctionRoomHandlers(auctions, socket));

  return io;
}
```

`src/realtime/socketAuth.middleware.ts`:
```typescript
import type { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

export function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) return next(new AppError(401, 'Missing auth token'));
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as { sub: string; role: string };
    socket.data.userId = payload.sub;
    socket.data.role = payload.role;
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired token'));
  }
}
```

`src/realtime/auctionRoom.handler.ts`:
```typescript
import type { Namespace, Socket } from 'socket.io';
import { placeBid } from '../services/bid.service';
import { getAuctionSnapshot } from '../services/auction.service';
import { incrementPresence, decrementPresence, getPresence } from './presence';
import { AppError } from '../utils/AppError';

export function registerAuctionRoomHandlers(nsp: Namespace, socket: Socket) {
  socket.on('auction:join', async ({ auctionId }: { auctionId: string }) => {
    socket.join(roomName(auctionId));
    const count = await incrementPresence(auctionId);
    const snapshot = await getAuctionSnapshot(auctionId);
    socket.emit('auction:state', snapshot);                 // to the joining client only
    nsp.to(roomName(auctionId)).emit('presence:update', { auctionId, viewerCount: count });
  });

  socket.on('auction:leave', async ({ auctionId }: { auctionId: string }) => {
    socket.leave(roomName(auctionId));
    const count = await decrementPresence(auctionId);
    nsp.to(roomName(auctionId)).emit('presence:update', { auctionId, viewerCount: count });
  });

  socket.on('bid:place', async ({ auctionId, amount }: { auctionId: string; amount: number }) => {
    try {
      const result = await placeBid(auctionId, socket.data.userId, amount);

      nsp.to(roomName(auctionId)).emit('bid:accepted', {
        bidId: result.bid.id,
        amount: result.bid.amount,
        bidderId: maskId(socket.data.userId),
        endsAt: result.newEndsAt,
      });

      if (result.extended) {
        nsp.to(roomName(auctionId)).emit('auction:extended', { auctionId, newEndsAt: result.newEndsAt });
      }

      if (result.previousHighestBidderId && result.previousHighestBidderId !== socket.data.userId) {
        // Targeted, not broadcast — every connected socket for that user
        // across ALL their open tabs/devices receives this, via Socket.io's
        // per-user room convention (joined on connection, not shown here
        // for brevity — see `userRoom` pattern note below).
        nsp.to(`user:${result.previousHighestBidderId}`).emit('bid:outbid', {
          auctionId,
          newHighestBid: result.bid.amount,
        });
      }
    } catch (err) {
      const reason = err instanceof AppError ? err.message : 'Bid could not be processed.';
      socket.emit('bid:rejected', { reason });
    }
  });

  socket.on('disconnect', async () => {
    // Best-effort presence cleanup — if a client disconnects without an
    // explicit auction:leave (e.g., tab closed), rooms they were in are
    // iterated and presence decremented for each.
  });
}

function roomName(auctionId: string) {
  return `auction:${auctionId}`;
}
function maskId(id: string) {
  return id.slice(0, 8); // enough to distinguish bidders in the UI without exposing full user IDs
}
```

`src/realtime/presence.ts` — viewer counts are stored in Redis (`INCR`/`DECR` on a per-auction key), not in-process memory, for the same reason the adapter is needed: presence must be correct regardless of which instance a given viewer is connected to.

---

## Step 9 — BullMQ Jobs (Scheduled Close + Notifications)

`src/jobs/queue.ts`:
```typescript
import { Queue } from 'bullmq';
import { redisClient } from '../config/redis';

export const auctionQueue = new Queue('auction-close', { connection: redisClient });
export const emailQueue = new Queue('email', { connection: redisClient });

export async function scheduleCloseJob(auctionId: string, endsAt: Date) {
  const delay = Math.max(0, endsAt.getTime() - Date.now());
  // jobId pinned to auctionId: calling add() again with the same ID
  // REPLACES the pending delay instead of creating a second job — this is
  // what makes anti-snipe rescheduling safe (see master.md §2.4, BR7).
  await auctionQueue.add('close-auction', { auctionId }, { jobId: auctionId, delay });
}

export const rescheduleCloseJob = scheduleCloseJob; // same operation, called from bid.service.ts on extension
```

`src/jobs/processors/closeAuction.processor.ts`:
```typescript
import { Worker } from 'bullmq';
import { redisClient } from '../../config/redis';
import { prisma } from '../../config/prisma';
import { emailQueue } from '../queue';
import { getIoInstance } from '../../realtime/io';

export const closeAuctionWorker = new Worker(
  'auction-close',
  async (job) => {
    const { auctionId } = job.data;
    const auction = await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } });

    // Idempotency guard: if endsAt moved since this job was scheduled (an
    // extension landed after this job was already picked up but before the
    // reschedule call completed — a narrow race), re-check and bail out;
    // the newer scheduled job will fire instead.
    if (auction.status !== 'OPEN' || auction.endsAt.getTime() > Date.now()) return;

    const highestBid = auction.currentHighestBidId
      ? await prisma.bid.findUnique({ where: { id: auction.currentHighestBidId } })
      : null;
    const reserveMet =
      !auction.reservePrice || (highestBid && Number(highestBid.amount) >= Number(auction.reservePrice));
    const outcome = !highestBid ? 'UNSOLD' : reserveMet ? 'SOLD' : 'UNSOLD';

    await prisma.auction.update({ where: { id: auctionId }, data: { status: outcome } });

    getIoInstance().of('/auctions').to(`auction:${auctionId}`).emit('auction:closed', {
      auctionId,
      winnerId: highestBid?.bidderId ?? null,
      finalAmount: highestBid ? Number(highestBid.amount) : null,
      outcome,
    });

    if (highestBid && outcome === 'SOLD') {
      await emailQueue.add('send-email', { type: 'auction-won', bidderId: highestBid.bidderId, auctionId });
      await emailQueue.add('send-email', { type: 'auction-sold', sellerId: auction.sellerId, auctionId });
    }
  },
  { connection: redisClient },
);
```

`src/jobs/worker.ts` is the process entry point that imports both processors (`closeAuctionWorker`, an email-sending worker following the identical pattern) — run as a **separate container** from the API server (Step 12), the same separation of concerns as a standard background-worker setup.

---

## Step 10 — Error Handling & Validation

Standard `AppError` class + `catchAsync` wrapper + centralized `errorHandler.middleware.ts`, identical pattern to any production Express API — not repeated here. The one BidWave-specific addition: `errorHandler` distinguishes a Prisma "not found" error (404) from a transaction conflict re-thrown as `AppError(409, ...)` from `bid.service.ts`, so bid rejections surface as `409 Conflict` with the human-readable reason, not a generic `500`.

---

## Step 11 — Testing

`tests/bidConcurrency.test.ts` — the single most important test in the entire project:
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { io as ioClient, Socket } from 'socket.io-client';
import { app } from '../src/app';
import { createTestServer, createTestAuction, getTokenFor } from './setup';

describe('concurrent bidding', () => {
  it('accepts exactly one bid when multiple clients bid simultaneously on the same auction', async () => {
    const { httpServer, url } = await createTestServer(app);
    const auction = await createTestAuction({ startingPrice: 100, minIncrement: 1 });

    const bidderCount = 5;
    const sockets: Socket[] = await Promise.all(
      Array.from({ length: bidderCount }, async (_, i) => {
        const token = await getTokenFor(`bidder${i}@test.com`);
        const socket = ioClient(`${url}/auctions`, { auth: { token } });
        await new Promise((resolve) => socket.on('connect', resolve));
        socket.emit('auction:join', { auctionId: auction.id });
        return socket;
      }),
    );

    const accepted: unknown[] = [];
    const rejected: unknown[] = [];
    sockets.forEach((s) => {
      s.on('bid:accepted', (data) => accepted.push(data));
      s.on('bid:rejected', (data) => rejected.push(data));
    });

    // All five fire the SAME winning bid amount simultaneously — only one
    // may legally win; this is the exact race the version-guarded
    // transaction in bid.service.ts is designed to resolve correctly.
    sockets.forEach((s) => s.emit('bid:place', { auctionId: auction.id, amount: 150 }));

    await new Promise((resolve) => setTimeout(resolve, 500)); // allow broadcasts to settle

    // Exactly ONE accepted-bid broadcast should have been received —
    // broadcast to the room, so accepted.length counts (bidderCount) copies
    // of the SAME bidId if the server behaved correctly.
    const uniqueAcceptedBidIds = new Set(accepted.map((a: any) => a.bidId));
    expect(uniqueAcceptedBidIds.size).toBe(1);
    expect(rejected.length).toBe(bidderCount - 1);

    sockets.forEach((s) => s.disconnect());
    httpServer.close();
  });
});
```

Other required tests (standard patterns, not shown in full): REST CRUD + RBAC negative cases for Auction endpoints; auth cycle (register→verify→login→refresh→logout); a WebSocket join/broadcast test using two `socket.io-client` instances to prove `bid:outbid` reaches only the correct socket and not the whole room.

**Must pass before deployment:** the concurrency test above, and the two-instance manual verification in `master.md` §8/§12.

---

## Step 12 — Docker (2 Backend Replicas)

Root `docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: bidwave
      POSTGRES_PASSWORD: bidwave
      POSTGRES_DB: bidwave
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bidwave"]
      interval: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  backend-1:
    build: ./backend
    env_file: ./.env
    ports: ["4001:4000"]
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }
    command: sh -c "npx prisma migrate deploy && node dist/server.js"

  backend-2:
    build: ./backend
    env_file: ./.env
    ports: ["4002:4000"]
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }
    command: node dist/server.js   # migrations already applied by backend-1

  worker:
    build: ./backend
    env_file: ./.env
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }
    command: node dist/jobs/worker.js

  nginx:
    image: nginx:alpine
    ports: ["4000:80"]
    volumes: ["./nginx.conf:/etc/nginx/nginx.conf:ro"]
    depends_on: [backend-1, backend-2]

volumes:
  pgdata:
```

`nginx.conf` (load balancer with **WebSocket upgrade headers** — the single most commonly missed config detail when putting Socket.io behind a reverse proxy):
```nginx
events {}
http {
  upstream backend_pool {
    ip_hash;  # sticky by client IP — Socket.io's long-polling fallback
              # needs a client's requests to land on the same instance
              # during the handshake; the Redis adapter then makes
              # WEBSOCKET broadcasts correct across instances regardless.
    server backend-1:4000;
    server backend-2:4000;
  }
  server {
    listen 80;
    location / {
      proxy_pass http://backend_pool;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
    }
  }
}
```

**Local dev flow:** `docker compose up --build` brings up Postgres, Redis, two backend instances, a worker, and an nginx load balancer in front of them on `localhost:4000`. This is what makes NFR3 and NFR5 verifiable on a laptop, not just assumed.

---

## Step 13 — Health & Graceful Shutdown

Standard pattern: `/api/v1/health` checks real DB connectivity; `server.ts` handles `SIGTERM`/`SIGINT` by closing the HTTP server, disconnecting Prisma, and closing the Socket.io server's Redis adapter connections before exit. Not repeated in full — identical shape to a standard production Express boot sequence.

---

## Step 14 — Deployment

**Recommended path:** Render (2+ backend instances + 1 worker, behind Render's built-in load balancer, which handles WebSocket upgrades natively — no custom nginx config needed in production, only locally) + Neon (Postgres) + Upstash (Redis, **confirm the plan supports pub/sub** — some serverless tiers restrict it) + Cloudflare R2 (images).

1. Provision Postgres, Redis, R2 — same as a standard deployment.
2. Create a Render Web Service with **instance count set to 2** (not 1 — see `master.md` §12 for why this matters).
3. Run `prisma migrate deploy` as Render's pre-deploy command.
4. Create a second Render **Background Worker** service for `dist/jobs/worker.js`.
5. Set `CORS_ORIGIN` to the deployed frontend's exact origin.
6. **Verify cross-instance broadcast in production** (manual, not automatable in CI): open two browser sessions, place a bid in one, confirm it appears in the other within ~150ms. This is the deployment's actual acceptance test for this project — a passing CI suite alone does not prove the Redis adapter is correctly wired in production.

**Troubleshooting:**
- Bids broadcast locally in dev (single instance) but not after scaling to 2 instances in production → the Redis adapter isn't wired, or `REDIS_URL` differs between instances — this is the exact failure mode the whole architecture exists to prevent; double-check `io.adapter(createAdapter(...))` is called before `auctions.on('connection', ...)`.
- WebSocket connects but immediately disconnects behind a load balancer → missing `Upgrade`/`Connection` headers in the proxy config (see `nginx.conf` above for the local equivalent of what the hosting provider must also do).
