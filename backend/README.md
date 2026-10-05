# 🌊 BidWave Backend — Architecture & Code Navigation Guide

The **BidWave Backend** is a high-performance, real-time auction engine built with **Node.js, TypeScript, Express, Socket.io, Redis, PostgreSQL (Prisma), and BullMQ**.

It is engineered to solve the **contested-resource concurrent write problem** in live auctions, ensuring sub-150ms real-time state synchronization across horizontally scaled backend replicas with zero lost updates.

---

## 🗺️ Codebase Directory Map

```text
backend/
├── prisma/
│   ├── schema.prisma            # PostgreSQL schema with optimistic locking & relations
│   └── seed.ts                  # Development seed script (Seller, Bidders, Active Auctions)
├── src/
│   ├── config/                  # Singleton infrastructure configs & env validation
│   │   ├── env.ts               # Zod-validated environment configuration
│   │   ├── logger.ts            # Pino high-performance structured logger
│   │   ├── prisma.ts            # Prisma client connection singleton
│   │   └── redis.ts             # Dedicated pubClient, subClient, and redisClient instances
│   ├── middleware/              # Express HTTP request filters
│   │   ├── auth.middleware.ts   # JWT access-token verification
│   │   ├── rbac.middleware.ts   # Role-based access control (SELLER, BIDDER, ADMIN)
│   │   ├── validate.middleware.ts # Zod body & query validator
│   │   └── errorHandler.middleware.ts # Centralized operational error & Prisma code formatter
│   ├── validators/              # Zod input schemas for runtime boundary safety
│   │   ├── auth.schema.ts       # Register, Login, Refresh validation
│   │   └── auction.schema.ts    # Auction CRUD, bidding, and query parameter schemas
│   ├── repositories/            # Direct database queries & persistence layer
│   │   ├── user.repository.ts   # User & RefreshToken DB queries
│   │   ├── auction.repository.ts # Auction CRUD and pagination queries
│   │   └── bid.repository.ts    # Historical bid queries
│   ├── services/                # Core domain business logic
│   │   ├── auth.service.ts      # Authentication, password hashing, JWT rotation
│   │   ├── auction.service.ts   # Auction lifecycle, status transitions, immutable rules
│   │   ├── bid.service.ts       # 🔥 Concurrency-safe bidding engine (optimistic locking)
│   │   ├── email.service.ts     # Resend email notifications (outbid, won, sold)
│   │   └── storage.service.ts   # S3/R2 presigned upload URL generation
│   ├── controllers/             # HTTP request unmarshalling & response formatting
│   │   ├── auth.controller.ts   # Auth routes controller (cookies + JSON)
│   │   ├── auction.controller.ts# Auction CRUD controller
│   │   ├── bid.controller.ts    # Bid history & REST bid endpoint
│   │   └── user.controller.ts   # Profile and user's bid history
│   ├── routes/                  # Express HTTP route definitions
│   │   ├── auth.routes.ts       # /api/v1/auth/*
│   │   ├── auction.routes.ts    # /api/v1/auctions/*
│   │   ├── bid.routes.ts        # /api/v1/auctions/:id/bids
│   │   ├── user.routes.ts       # /api/v1/users/*
│   │   ├── health.routes.ts     # /api/v1/health
│   │   └── index.ts             # Aggregated API router
│   ├── realtime/                # ⚡ Socket.io WebSocket Layer
│   │   ├── io.ts                # Socket.io initialization + Redis pub/sub adapter wiring
│   │   ├── socketAuth.middleware.ts # Socket handshake JWT verification
│   │   ├── auctionRoom.handler.ts # Room join/leave, bid:place, presence, and broadcasts
│   │   └── presence.ts          # Redis-backed live viewer count tracker
│   ├── jobs/                    # ⏳ BullMQ Background Jobs
│   │   ├── queue.ts             # Queue definitions & delayed job scheduler (with jobId pinning)
│   │   ├── worker.ts            # Independent worker process entrypoint
│   │   └── processors/
│   │       ├── closeAuction.processor.ts # Idempotent auction close & winner resolution
│   │       └── sendEmail.processor.ts    # Asynchronous email delivery worker
│   ├── utils/                   # Shared utility classes
│   │   ├── AppError.ts          # Operational HTTP error with status codes
│   │   └── catchAsync.ts        # Async route handler error wrapper
│   ├── types/                   # TypeScript interfaces & namespace augmentations
│   │   ├── express.d.ts         # Augmented Request with user context
│   │   └── socket.d.ts          # Strongly typed client/server WebSocket event contracts
│   ├── app.ts                   # Express app configuration (middleware, routes, error handling)
│   └── server.ts                # HTTP & Socket.io server boot with graceful shutdown
├── tests/                       # Test suites
│   ├── setup.ts                 # Test helpers (server spawner, user & token generators)
│   ├── auction.test.ts          # Service rules, minimum increment, RBAC, REST endpoints
│   └── bidConcurrency.test.ts   # 💥 5-way simultaneous race condition test
├── Dockerfile                   # Multi-stage production container build
├── tsconfig.json                # TypeScript compiler configuration
└── package.json
```

---

## 🔄 Request & Event Lifecycles

### 1. HTTP REST Flow
```
Client Request ──► app.ts
                     │
                     ▼
            auth.middleware.ts (Verify JWT)
                     │
                     ▼
            validate.middleware.ts (Zod Schema Validation)
                     │
                     ▼
            auction.controller.ts (Unpack request)
                     │
                     ▼
            auction.service.ts (Enforce domain & business rules)
                     │
                     ▼
            auction.repository.ts (Execute Prisma queries)
                     │
                     ▼
            PostgreSQL Database
```

---

### 2. Real-Time Bidding & Multi-Instance Synchronization Flow

When a bidder places a bid over WebSockets:

```
[Client Tab A] (Connected to Backend Replica #1)
      │
      │ emit('bid:place', { auctionId, amount })
      ▼
auctionRoom.handler.ts
      │
      ▼
bid.service.ts ──► placeBid()
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ Database Transaction (Prisma $transaction)                  │
│ 1. Read auction & current highest bid inside transaction    │
│ 2. Check rules: status == OPEN, endsAt > now, seller != user│
│ 3. Check minIncrement: amount >= currentHighest + increment │
│ 4. Insert new Bid record                                    │
│ 5. Atomic Update:                                           │
│    UPDATE auctions SET currentHighestBidId = bid.id,        │
│                        version = version + 1,               │
│                        endsAt = newEndsAt                   │
│    WHERE id = :auctionId AND version = :readVersion         │
│                                                             │
│ If update.count === 0 (race detected) ──► retry once        │
└─────────────────────────────────────────────────────────────┘
      │
      ├───────────────────────────────┬───────────────────────────────┐
      │ Broadcast to Room             │ Anti-Snipe Extension          │ Scoped Outbid Event
      ▼                               ▼                               ▼
nsp.to('auction:id').emit(      If within 30s window:          nsp.to('user:prevBidderId')
  'bid:accepted', { ... }       - Update endsAt in DB          .emit('bid:outbid', { ... })
)                               - nsp.emit('auction:extended') + Queue async email
      │                         - BullMQ: rescheduleCloseJob()
      ▼
Redis Pub/Sub Adapter
      │
      ├───────────────────────────────┐
      ▼                               ▼
[Backend Replica #1]           [Backend Replica #2]
      │                               │
      ▼                               ▼
Local Sockets (Tab A)          Local Sockets (Tab B - Other viewers)
```

---

## ⚡ Concurrency & Anti-Snipe Details

1. **Optimistic Locking (`version` column)**:
   - Each auction row maintains a `version: Int` counter.
   - Updates are gated with `WHERE id = auctionId AND version = readVersion`.
   - When 5 users bid simultaneously, only 1 write succeeds on that version. The remaining 4 hit `update.count === 0` and trigger a single retry loop against fresh state. If the new bid amount is now below the accepted bid, it is cleanly rejected with a 409 Conflict reason.

2. **BullMQ Delayed Close Jobs (No Cron Polling)**:
   - When an auction is created or published, a job is added to `auction-close` queue with `delay = endsAt - now` and **`jobId = auctionId`**.
   - Pinning `jobId` ensures that when an anti-snipe extension triggers `rescheduleCloseJob()`, BullMQ replaces the pending timer with the new delayed deadline.
   - The close job runs with zero polling overhead and fires within milliseconds of the true deadline.

---

## 📡 Real-Time WebSocket Contract

* **Namespace**: `/auctions`
* **Handshake Auth**: `{ auth: { token: "<JWT_ACCESS_TOKEN>" } }`

| Event Name | Direction | Payload | Description |
|---|---|---|---|
| `auction:join` | Client $\rightarrow$ Server | `{ auctionId: string }` | Joins room, replies with `auction:state`, broadcasts updated viewer presence. |
| `auction:leave` | Client $\rightarrow$ Server | `{ auctionId: string }` | Leaves room, decrements presence. |
| `bid:place` | Client $\rightarrow$ Server | `{ auctionId: string, amount: number }` | Attempts to place a validated bid. |
| `auction:state` | Server $\rightarrow$ Client | `{ id, title, status, highestBid, bidderCount, startsAt, endsAt, minIncrement, startingPrice }` | Authoritative state snapshot sent **only to joining socket**. |
| `bid:accepted` | Server $\rightarrow$ Room | `{ bidId, amount, bidderId (masked), endsAt }` | Broadcast to all room viewers. |
| `bid:rejected` | Server $\rightarrow$ Client | `{ reason: string }` | Sent **only to bidding socket** on validation/race failure. |
| `bid:outbid` | Server $\rightarrow$ User | `{ auctionId, newHighestBid }` | Targeted event sent to the outbid user's private channel (`user:{userId}`). |
| `auction:extended` | Server $\rightarrow$ Room | `{ auctionId, newEndsAt }` | Broadcast when anti-snipe triggers clock extension. |
| `auction:closed` | Server $\rightarrow$ Room | `{ auctionId, winnerId, finalAmount, outcome }` | Broadcast when BullMQ worker resolves auction close. |
| `presence:update` | Server $\rightarrow$ Room | `{ auctionId, viewerCount }` | Broadcast when viewer joins or leaves room. |

---

## 🧪 Testing & Validation

Run unit, integration, and concurrency tests:
```bash
cd backend
npm test
```

### Concurrency Test (`tests/bidConcurrency.test.ts`)
This test instantiates a live test server, creates 5 independent WebSocket client sockets, and fires simultaneous winning bids against the same auction. It asserts:
- Exactly **1** accepted bid is broadcast to the room.
- Exactly **4** client sockets receive private `bid:rejected` failure reasons.
- Zero state corruption or duplicate accepts occur.
