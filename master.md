# BidWave — Master Specification

This is the single source of truth for the BidWave project. `backend.md` and `frontend.md` implement exactly what is defined here. If either file conflicts with this document, this document wins.

---

## 1. Project Overview

**Name:** BidWave
**One-line description:** A real-time live-auction platform where bidders watch items and bid against each other with sub-second updates across every connected client.

**Detailed description:** BidWave lets Sellers list items with a starting price and a fixed end time. Bidders join an auction's "room," see the current highest bid update live as other bidders act, and place bids that are validated server-side (never trusted from the client) to make race conditions and stale-state exploits impossible. Every bid is broadcast to every connected client watching that auction within milliseconds, viewer presence is shown live, and an anti-sniping rule extends the auction clock if a bid lands in the final seconds. When the auction ends, a winner is determined server-side and notified in real time and by email.

**Problem it solves:** Standard REST-only auction flows (poll every N seconds, or refresh to see the current bid) feel laggy and allow a "stale bid" race: two users submit what they each believe is a winning bid against outdated state, and naive implementations either accept both (data corruption) or silently drop one with no feedback. BidWave solves this with server-authoritative state + real-time push, not client polling.

**Why it matters:** This project is deliberately scoped to prove a skill SupportHub (a prior project) does not: real-time, bidirectional, multi-client state synchronization at low latency, correctly handling concurrent writes to a single contested resource (the current highest bid).

**Target users:**
- Sellers listing one or more items for timed auction
- Bidders competing on open auctions in real time
- Admins moderating listings and resolving disputes

**Core use cases:**
1. A Seller creates an auction (title, description, images, starting price, reserve price, end time).
2. A Bidder opens an auction page, sees the current highest bid update live as others bid, and places their own bid.
3. The server validates and either accepts the bid (broadcasting it to everyone instantly) or rejects it (telling only that bidder why, without disrupting others).
4. When the clock expires with no bid in the last N seconds, the auction closes, a winner is determined, and both the winner and seller are notified.

**Main features (v1):**
- Real-time bid broadcasting via WebSockets (Socket.io), horizontally scaled via Redis adapter/pub-sub
- Server-authoritative bid validation using DB transactions (no lost updates, no accepted-but-invalid bids)
- Live viewer presence count per auction room
- Anti-snipe auto-extension (configurable window, default last 30s triggers +60s extension)
- Automatic outbid notification (real-time toast to the previously-highest bidder + queued email)
- Scheduled auction close via delayed background job (not a polling cron — see §2.4)
- JWT + refresh-token auth; roles: Seller, Bidder, Admin
- Bid history per auction, paginated
- Basic image upload for listings (S3-compatible storage)

**Nice-to-have / future features (explicitly not in v1):**
- Payment processing / escrow (no money changes hands in v1 — winner determination only)
- Proxy/auto-bidding (bid up to a max on the user's behalf)
- Multi-currency support
- Native mobile apps
- Seller payout / marketplace fee logic

**Project goals:**
- Prove correct handling of concurrent writes to a single contested resource under real traffic patterns
- Demonstrate WebSocket architecture that scales horizontally (multiple server instances, one logical auction room) rather than a single-process toy demo
- Ship a fully working REST + WebSocket API and SPA frontend, independently deployable
- Demonstrate production real-time patterns: room-based broadcast, presence, reconnection/state resync, backpressure-safe event design

**Non-goals:**
- Payments/escrow — no money changes hands in v1
- Native mobile apps
- Proxy bidding — manual bids only
- Multi-region / multi-region active-active — single-region deployment, horizontally scaled within that region only

**Functional requirements:**
- FR1: Users can register, verify email, log in, log out, reset password
- FR2: A Seller can create, edit (before any bid exists), and cancel (before any bid exists) an auction listing
- FR3: A Bidder can join an auction's live room and see current state (highest bid, bidder count, time remaining) immediately on connect, without waiting for the next event
- FR4: A Bidder can place a bid; it is accepted only if it exceeds the current highest bid by at least the minimum increment, and the auction is still open
- FR5: Every accepted bid is broadcast to all clients in that auction's room within the same event loop tick it's committed — no polling
- FR6: A bid placed within the anti-snipe window extends the auction's end time
- FR7: When an auction's end time passes with no further extension, it closes exactly once and a winner is determined
- FR8: The previously-highest bidder is notified in real time when outbid
- FR9: Reconnecting clients (e.g., after a dropped WebSocket) receive the current authoritative state on reconnect, not a stale cached view
- FR10: Admins can suspend a listing or ban a user

**Non-functional requirements:**
- NFR1: Two bids racing for the same auction can never both be accepted as "highest" — enforced via a DB-level mechanism (optimistic locking / transaction), not application-level locking in a single process, because the system must be correct even with multiple backend instances
- NFR2: A bid's accept/reject decision and broadcast to other clients must complete in under 150ms at p95 under normal load
- NFR3: The system must work correctly with 2+ backend instances behind a load balancer — a client connected to instance A must see a bid placed by a client connected to instance B in real time
- NFR4: WebSocket reconnection after a network blip must not require a full page reload to resync state
- NFR5: The application must be runnable locally via a single `docker-compose up`, including a demonstration of 2 backend replicas sharing state via Redis

**Assumptions and constraints:**
- Single-region deployment, horizontally scaled within region
- English-only UI for v1
- Email delivery uses a third-party transactional provider (Resend)
- Image storage is an S3-compatible provider (Cloudflare R2)

---

## 2. Product Logic

### 2.1 User journeys

**Bidder journey:**
`Sign up → verify email → log in → browse open auctions → open an auction room (WebSocket connects) → watch live bids and viewer count → place a bid → see instant confirmation or rejection reason → get outbid → receive real-time + email notification → auction closes → see win/loss result`

**Seller journey:**
`Log in → create listing (title, description, images, start price, reserve, end time) → publish → watch bids come in live on own dashboard → auction closes → see final price and winner (or "reserve not met")`

**Admin journey:**
`Log in → view flagged/reported listings → suspend a listing or ban a user → listing immediately removed from active rooms, connected clients notified`

### 2.2 Core workflows

**Auction lifecycle (state machine):**
```
   create (draft)
        │
        ▼
   ┌─────────┐   publish    ┌────────┐   end time reached,   ┌─────────┐
   │  draft   │────────────►│  open   │──  no extension  ───►│  closed  │
   └─────────┘              └────────┘                       └─────────┘
        │                        │  bid in last N sec              │
        │ cancel (no bids yet)   │  (extend end time)               │ reserve not met
        ▼                        └──────────┐                       ▼
   ┌───────────┐                            ▼                 ┌───────────┐
   │ cancelled  │                      (stays open)            │ unsold     │
   └───────────┘                                                └───────────┘
                                                                       │ reserve met
                                                                       ▼
                                                                 ┌───────────┐
                                                                 │  sold      │
                                                                 └───────────┘
```
Rules: `open → closed` transition happens exactly once, triggered by a BullMQ **delayed job** scheduled at publish time (and *re-scheduled*, not polled, on every anti-snipe extension — see BR7). `closed` immediately branches to `sold` (highest bid ≥ reserve price, or no reserve set) or `unsold` (highest bid < reserve price, or zero bids).

### 2.3 Business rules

- BR1: A bid must exceed `auction.currentHighestBid + auction.minIncrement` (or `auction.startingPrice` if no bids yet) to be accepted.
- BR2: A Seller cannot bid on their own auction.
- BR3: A bid is accepted or rejected inside a single DB transaction that re-reads the current highest bid at transaction time — the accept/reject decision is never made against data read before the transaction opened (prevents the lost-update race).
- BR4: If a bid is placed with less than `auction.antiSnipeWindowSeconds` (default 30s) remaining, `auction.endsAt` is extended by `auction.antiSnipeExtensionSeconds` (default 60s), and the scheduled close job is rescheduled to the new `endsAt`.
- BR5: An auction can only be edited by its Seller while it has zero bids; once a bid exists, title/price/end-time fields are immutable (images and description may still be edited).
- BR6: A Bidder outbid by someone else receives a real-time event (`bid:outbid`) scoped only to their own socket, not broadcast to the room.
- BR7: Auction closing is driven by a single scheduled job per auction (BullMQ delayed job keyed by `auctionId`), not a polling cron — rescheduling on extension means at most one close job is ever pending per auction (enforced via BullMQ job ID = `auctionId`, so re-adding with the same ID replaces the prior delay rather than creating a duplicate).
- BR8: Reserve price (if set) is never exposed to Bidders before the auction closes — only "reserve met" / "reserve not met" after close.

### 2.4 Why a delayed job instead of a cron poll

A cron that polls "any auctions past `endsAt`?" every N seconds has two problems this project is explicitly designed to avoid: (1) close latency bounded by the poll interval, not the actual end time, and (2) it doesn't naturally handle the anti-snipe reschedule. A BullMQ delayed job scheduled for exactly `endsAt`, with the job ID pinned to `auctionId`, means re-adding the job on extension (`queue.add('close-auction', {...}, { jobId: auctionId, delay: newDelayMs })`) automatically replaces the pending delay — no duplicate-close risk, no polling, and the close fires within milliseconds of the true deadline.

---

## 3. Data Model

```prisma
// prisma/schema.prisma (core models — see backend.md Step 5 for the full file)

enum Role {
  BIDDER
  SELLER
  ADMIN
}

enum AuctionStatus {
  DRAFT
  OPEN
  CLOSED
  CANCELLED
  SOLD
  UNSOLD
}

model User {
  id            String    @id @default(uuid())
  email         String    @unique
  passwordHash  String
  role          Role      @default(BIDDER)
  emailVerified Boolean   @default(false)
  isBanned      Boolean   @default(false)
  createdAt     DateTime  @default(now())

  auctions      Auction[] @relation("SellerAuctions")
  bids          Bid[]
}

model Auction {
  id                       String        @id @default(uuid())
  sellerId                 String
  seller                   User          @relation("SellerAuctions", fields: [sellerId], references: [id])
  title                    String
  description              String
  images                   String[]
  startingPrice            Decimal       @db.Decimal(10, 2)
  reservePrice             Decimal?      @db.Decimal(10, 2)
  minIncrement             Decimal       @default(1.00) @db.Decimal(10, 2)
  currentHighestBidId      String?       @unique
  currentHighestBid        Bid?          @relation("HighestBid", fields: [currentHighestBidId], references: [id])
  status                   AuctionStatus @default(DRAFT)
  antiSnipeWindowSeconds   Int           @default(30)
  antiSnipeExtensionSeconds Int          @default(60)
  startsAt                 DateTime
  endsAt                   DateTime
  version                  Int           @default(0)   // optimistic-lock counter, see backend.md Step 7
  createdAt                DateTime      @default(now())

  bids                     Bid[]         @relation("AuctionBids")

  @@index([status, endsAt])
}

model Bid {
  id         String   @id @default(uuid())
  auctionId  String
  auction    Auction  @relation("AuctionBids", fields: [auctionId], references: [id])
  bidderId   String
  bidder     User     @relation(fields: [bidderId], references: [id])
  amount     Decimal  @db.Decimal(10, 2)
  createdAt  DateTime @default(now())

  highestFor Auction? @relation("HighestBid")

  @@index([auctionId, amount])
}
```

Note on `version`: incremented on every accepted bid; the accept transaction's `UPDATE` includes `WHERE version = :readVersion`, and a `0`-row-affected result means another bid won the race in between — the transaction retries once against fresh state before rejecting. Full logic in `backend.md` Step 7.

---

## 4. Real-Time Event Contract

Namespace: `/auctions`. Clients join a room named `auction:{auctionId}` after authenticating the socket handshake with the same JWT used for REST calls.

**Client → Server events:**
| Event | Payload | Behavior |
|---|---|---|
| `auction:join` | `{ auctionId }` | Joins the room; server replies with `auction:state` (current authoritative snapshot) |
| `auction:leave` | `{ auctionId }` | Leaves the room, decrements presence count |
| `bid:place` | `{ auctionId, amount }` | Server validates and either broadcasts `bid:accepted` or emits `bid:rejected` to the sender only |

**Server → Client events:**
| Event | Payload | Scope |
|---|---|---|
| `auction:state` | `{ highestBid, bidderCount, endsAt, status }` | To the joining client only — sent on every join/reconnect so state is never assumed from stale cache |
| `bid:accepted` | `{ bidId, amount, bidderId (masked), endsAt }` | Broadcast to entire room |
| `bid:rejected` | `{ reason, currentHighestBid }` | To the bidding client only |
| `bid:outbid` | `{ auctionId, yourBid, newHighestBid }` | To the specific previously-highest bidder's socket only |
| `auction:extended` | `{ auctionId, newEndsAt }` | Broadcast to entire room |
| `auction:closed` | `{ auctionId, winnerId (masked), finalAmount, outcome }` | Broadcast to entire room |
| `presence:update` | `{ auctionId, viewerCount }` | Broadcast to entire room on join/leave |

**Reconnection contract:** on any `connect` event (including automatic reconnects), the client re-emits `auction:join` for whatever auction it was viewing; it never assumes its last-known local state is current. This is what satisfies NFR4.

---

## 5. Architecture

```
                         ┌──────────────┐
                         │   Frontend    │  (React + Socket.io-client)
                         └──────┬───────┘
                                │ WSS + HTTPS
                      ┌─────────▼─────────┐
                      │   Load Balancer     │
                      └────────┬┬──────────┘
                     ┌─────────┘└──────────┐
             ┌───────▼───────┐     ┌───────▼───────┐
             │  Backend  #1   │     │  Backend  #2   │   (stateless, N replicas)
             │ (Express+Socket.io)│ │ (Express+Socket.io)│
             └───────┬────────┘     └───────┬────────┘
                     │                       │
           ┌─────────┴───────────────────────┴─────────┐
           │                                            │
   ┌───────▼────────┐                          ┌────────▼────────┐
   │   PostgreSQL    │                          │      Redis       │
   │ (bids, auctions,│                          │ Socket.io adapter │
   │  users)         │                          │ (pub/sub across   │
   └─────────────────┘                          │  instances)       │
                                                 │ + BullMQ queues   │
                                                 └───────────────────┘
```

**Why Redis is load-bearing, not optional:** without the `@socket.io/redis-adapter`, `io.to(room).emit(...)` only reaches sockets connected to *that process*. A bidder on instance #1 would never see a bid placed by someone on instance #2. The Redis adapter turns every instance's pub/sub into a shared broadcast bus, making `io.to(...)` work correctly regardless of which instance a given client is attached to. This is the architectural piece that proves "real-time at scale" rather than "real-time in a single-process demo," and `docker-compose.yml` runs 2 backend replicas specifically to make this verifiable locally.

---

## 6. Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 20 + TypeScript |
| HTTP framework | Express |
| Real-time | Socket.io + `@socket.io/redis-adapter` |
| Database | PostgreSQL + Prisma |
| Cache / pub-sub / queue backend | Redis (ioredis) |
| Background jobs | BullMQ |
| Auth | JWT (access + refresh), bcrypt |
| Validation | Zod |
| File storage | S3-compatible (Cloudflare R2) |
| Email | Resend |
| Frontend | React + Vite + TypeScript |
| Frontend state | TanStack Query (REST) + a thin Socket.io context (real-time) |
| Styling | Tailwind + shadcn/ui |
| Testing | Vitest + Supertest + `socket.io-client` (for WS integration tests) |
| Containerization | Docker + docker-compose (2 backend replicas + 1 worker + Postgres + Redis) |

---

## 7. Security & Auth

- JWT access tokens (15m) + refresh tokens (7d, hashed at rest), same pattern as prior project.
- Socket.io handshake authenticates via the access token passed in `auth: { token }` on connection — a socket that fails auth is disconnected before joining any room.
- RBAC: `SELLER`-only routes for listing CRUD; `ADMIN`-only routes for suspension/bans — enforced via middleware on REST routes and an equivalent check before processing `bid:place`/room-admin socket events.
- Bid amounts are **never** trusted from any client-displayed "current price" — every accept/reject decision re-reads the DB inside the transaction (BR3), so a client with stale state cannot force an invalid bid through.
- Rate limiting on `bid:place` per socket (e.g., max 5 bids/10s) to prevent bid-spam DoS on a single auction.

---

## 8. Testing Strategy

- **Unit tests (Vitest):** bid-acceptance logic (amount vs. increment rules), anti-snipe extension calculation, winner/reserve determination.
- **Integration tests (Vitest + Supertest):** REST CRUD for auctions (create/edit/cancel), auth cycle, RBAC negative cases.
- **Concurrency test (the single most important test in the suite):** fire N simultaneous `bid:place` events (via multiple `socket.io-client` instances) with bid amounts that only one can legally win; assert exactly one `bid:accepted` is broadcast and all others receive `bid:rejected` with the correct reason — proves NFR1 under real concurrent load, not just in theory.
- **WebSocket integration tests:** using `socket.io-client` against a real server instance — join room, place bid, assert broadcast received by a second connected client; assert `bid:outbid` is scoped to only the correct socket.
- **Multi-instance test (manual/documented, not automated in CI):** run `docker-compose up` with 2 backend replicas, connect two browser tabs to different instances via the load balancer, verify a bid from one tab appears in the other — this is the concrete, demonstrable proof of NFR3.

---

## 9. UI/UX Requirements

- **Design direction:** energetic, live-feeling — subtle motion on bid updates (flash/highlight the price on change), not a static dashboard. Auction room is the centerpiece screen.
- **Color system:** Tailwind slate/zinc neutrals, single accent (amber-500, evoking "going once, going twice"), semantic: `emerald` = you're winning, `red` = you've been outbid, `gray` = closed.
- **Live elements:** countdown timer re-renders every second client-side but is always re-synced from server `endsAt` on every `bid:accepted`/`auction:extended` event — never drifts from authoritative server time.
- **Connection state:** a visible (small, non-intrusive) indicator when the socket is reconnecting, so users never silently watch a stale price.
- **Accessibility:** price updates announced via an `aria-live="polite"` region, not purely visual flash; all interactive elements keyboard-reachable.
- **Mobile behavior:** auction room stacks image → price/timer → bid input → activity feed vertically; bid input stays reachable without scrolling via `position: sticky`.

---

## 10. Development Workflow

1. **Initialize repository** — monorepo root, `.gitignore`, README.
2. **Configure tooling** — root `.env.example`, `docker-compose.yml` skeleton (including 2 backend replicas).
3. **Set up backend** — `backend.md` Steps 1–4.
4. **Set up database** — `backend.md` Step 5 (schema, migrations, seed).
5. **Implement authentication** — `backend.md` Step 6.
6. **Build REST APIs** — `backend.md` Step 7 (Auction resource fully; Bid/Auth follow the same pattern).
7. **Build Socket.io layer + Redis adapter** — `backend.md` Step 8. *(the core of this project — do not shortcut this step)*
8. **Build BullMQ jobs (close-auction, notifications)** — `backend.md` Step 9.
9. **Set up frontend** — `frontend.md` Steps 1–3.
10. **Build auction room UI + Socket.io client context** — `frontend.md` Steps 4–6.
11. **Add testing, including the concurrency test** — `backend.md` Step 11.
12. **Add Docker (2 backend replicas + worker)** — `backend.md` Step 12.
13. **Verify multi-instance broadcast locally** — manual step, see §8.
14. **Deploy** — `backend.md` Step 14, `frontend.md` Step 16.

---

## 11. Environment Variables

```bash
# ── Database ──────────────────────────────────────────────
DATABASE_URL=postgresql://bidwave:bidwave@localhost:5432/bidwave

# ── Redis (pub/sub for Socket.io adapter + BullMQ + cache) ──
REDIS_URL=redis://localhost:6379

# ── Auth ──────────────────────────────────────────────────
JWT_ACCESS_SECRET=replace-with-a-long-random-string
JWT_REFRESH_SECRET=replace-with-a-different-long-random-string
JWT_ACCESS_EXPIRY=15m
REFRESH_TOKEN_EXPIRY_DAYS=7

# ── Email (Resend) ────────────────────────────────────────
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=auctions@yourdomain.com

# ── Object Storage (S3-compatible) ───────────────────────
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=xxxxxxxxxxxx
S3_SECRET_ACCESS_KEY=xxxxxxxxxxxx
S3_BUCKET=bidwave-images

# ── Server ────────────────────────────────────────────────
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# ── Auction defaults ──────────────────────────────────────
DEFAULT_ANTI_SNIPE_WINDOW_SECONDS=30
DEFAULT_ANTI_SNIPE_EXTENSION_SECONDS=60

# ── Frontend (VITE_ prefix = safe to expose to the browser) ─
VITE_API_BASE_URL=http://localhost:4000/api/v1
VITE_WS_URL=http://localhost:4000
```

---

## 12. Deployment

**Frontend hosting:** Vercel.
**Backend hosting:** Render or Railway — **2 instances minimum**, since a single-instance deployment would silently hide any Redis-adapter bugs (it would "work" even if the adapter were missing, which defeats the point of this project).
**Database hosting:** Neon or Railway Postgres.
**Redis hosting:** Upstash or Railway Redis — must support pub/sub (confirm the provider's plan allows it; some serverless Redis tiers restrict pub/sub channels).
**Object storage:** Cloudflare R2.

**Critical production check not present in a typical CRUD deploy:** after deploying with 2+ instances, manually verify cross-instance broadcast in production the same way as the local multi-instance test (§8) — open two browser sessions, confirm the load balancer can route them to different instances (or force it via two different regions/connections), and verify a bid from one is visible in the other within ~150ms. A green CI pipeline does not prove this; only this manual check does.

Full step-by-step in `backend.md` Step 14 and `frontend.md` Step 16.
