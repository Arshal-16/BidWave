# 🌊 BidWave — Real-Time Live Auction Platform

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.7-black.svg?style=flat-square&logo=socket.io)](https://socket.io/)
[![Redis](https://img.shields.io/badge/Redis-7.x-red.svg?style=flat-square&logo=redis)](https://redis.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748.svg?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?style=flat-square&logo=react)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC.svg?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)

**BidWave** is a production-grade, sub-second live auction platform engineered to handle **concurrent contested writes** across horizontally scaled backend replicas. 

Bidders join live rooms, watch real-time bid streams and presence counts, and compete against other clients without lost updates or race condition exploits. When a bid arrives in the final seconds, an automated **anti-snipe engine** dynamically extends the auction clock.

---

## ⚡ Key Highlights & Guarantees

* **🛡️ Zero Lost Updates (Optimistic Concurrency Control)**: High-concurrency writes are protected at the database transaction layer using atomic `version` increment guards. Racing bids are resolved server-side with zero data corruption.
* **🌐 Distributed Horizontal Broadcasts**: Powered by `@socket.io/redis-adapter` with dedicated pub/sub connections. A bid placed on **Backend Instance A** is broadcast to viewers connected to **Backend Instance B** within milliseconds.
* **⏳ Precision Scheduling (No Cron Polling)**: Auction closing is driven by **BullMQ delayed jobs** pinned by `auctionId`. Clock extensions replace pending timers dynamically rather than polling the database every $N$ seconds.
* **⚡ Anti-Snipe Auto-Extension**: Bids placed within the anti-snipe window (default: last 30s) automatically extend `endsAt` (default: +60s) and reschedule the delayed close job.
* **🔔 Targeted Outbid Alerts**: The previously-highest bidder instantly receives a private real-time notification (`bid:outbid`) and an asynchronous queued email.
* **🔄 Reconnection State Resync**: Reconnecting clients automatically receive fresh authoritative state snapshots without full page reloads.

---

## 🏗️ System Architecture

```
                                 ┌──────────────┐
                                 │   Frontend   │  (React 18 + Vite + Tailwind)
                                 └──────┬───────┘
                                        │ WSS + HTTPS
                               ┌────────▼────────┐
                               │   Nginx Proxy   │  (Sticky ip_hash + WS upgrades)
                               └────────┬┬───────┘
                     ┌──────────────────┘└──────────────────┐
             ┌───────▼───────┐                      ┌───────▼───────┐
             │  Backend  #1  │                      │  Backend  #2  │  (Stateless Replicas)
             │ (Express + WS)│                      │ (Express + WS)│
             └───────┬───────┘                      └───────┬───────┘
                     │                                      │
            ┌────────┴──────────────────────────────────────┴────────┐
            │                                                        │
    ┌───────▼────────┐                                      ┌────────▼────────┐
    │   PostgreSQL   │                                      │      Redis      │
    │  (Prisma ORM)  │                                      │ Socket.io PubSub│
    │ Bids, Auctions │                                      │ + BullMQ Queues │
    └────────────────┘                                      └────────┬────────┘
                                                                     │
                                                            ┌────────▼────────┐
                                                            │  Worker Process │
                                                            │ (BullMQ Worker) │
                                                            └─────────────────┘
```

---

## 📂 Repository Structure

```text
.
├── backend/                     # Express + Socket.io + Prisma + BullMQ API
│   ├── prisma/                  # Schema, migrations & seed scripts
│   ├── src/
│   │   ├── config/              # Redis, Prisma, Logger, Env singletons
│   │   ├── controllers/         # REST API endpoint handlers
│   │   ├── jobs/                # BullMQ queue & background worker processors
│   │   ├── middleware/          # JWT Auth, RBAC, Zod Validation, Error Handler
│   │   ├── realtime/            # Socket.io server, Auth middleware & Room handler
│   │   ├── repositories/        # Database query persistence layer
│   │   ├── routes/              # Express API route modules
│   │   ├── services/            # Domain logic (Concurrency-safe placeBid())
│   │   └── validators/          # Zod request validation schemas
│   ├── tests/                   # Unit, Integration & Concurrency test suites
│   ├── Dockerfile               # Multi-stage production container build
│   └── README.md                # 📖 In-depth Backend Navigation & Architecture Guide
├── frontend/                    # React 18 + Vite + Tailwind SPA
│   ├── src/
│   │   ├── api/                 # Axios client with auto JWT refresh interceptor
│   │   ├── components/          # Reusable UI, CountdownTimer, PriceDisplay, BidPanel
│   │   ├── context/             # AuthContext with token refresh lifecycle
│   │   ├── pages/               # AuctionListPage, AuctionRoomPage, SellerDashboard
│   │   └── realtime/            # SocketProvider & useAuctionRoom hook
│   └── vite.config.ts           # Vite bundler configuration
├── docs/                        # Specifications & Engineering Blueprints
│   ├── master.md                # Master Specification (Single Source of Truth)
│   ├── backend.md               # Backend implementation blueprint
│   └── frontend.md              # Frontend implementation blueprint
├── docker-compose.yml           # 2 Backend Replicas + Worker + Postgres + Redis + Nginx
├── nginx.conf                   # Reverse proxy configuration with WebSocket upgrade headers
```

---

## 🚀 Quickstart

### Option 1: Run with Docker Compose (Recommended)

To spin up the entire multi-instance architecture (2 backend replicas, worker, PostgreSQL, Redis, and Nginx load balancer):

```bash
# 1. Clone the repository
git clone https://github.com/your-username/bidwave.git
cd bidwave

# 2. Boot up all services
docker compose up --build
```

Access services at:
- **API & WebSockets (via Nginx)**: `http://localhost:4000`
- **Health Check**: `http://localhost:4000/api/v1/health`

---

### Option 2: Manual Local Development

#### 1. Start Backend

```bash
cd backend

# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Generate Prisma Client & Run Seed
npx prisma generate
npm run prisma:seed

# Start HTTP & WebSocket Server
npm run dev

# (In a second terminal) Start Background Worker
npm run worker
```

#### 2. Start Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 👥 Default Demo Credentials

The development seed script automatically populates the database with demo accounts:

| Role | Email | Password | Permissions |
|---|---|---|---|
| **Seller** | `seller@bidwave.com` | `Password123!` | Create, manage, and monitor listings |
| **Bidder 1** | `bidder1@bidwave.com` | `Password123!` | Place live bids, receive outbid alerts |
| **Bidder 2** | `bidder2@bidwave.com` | `Password123!` | Compete in real-time rooms |
| **Bidder 3** | `bidder3@bidwave.com` | `Password123!` | Compete in real-time rooms |
| **Admin** | `admin@bidwave.com` | `Password123!` | Moderate listings and manage platform |

*Tip: The web UI includes **1-Click Demo Sign In** buttons on the login page for effortless multi-client testing.*

---

## 🧪 Concurrency Test Suite

To verify the **NFR1 race-condition guarantee** (firing simultaneous competing bids against a single auction):

```bash
cd backend
npm test
```

The test `tests/bidConcurrency.test.ts` connects 5 concurrent WebSocket clients, submits simultaneous winning bids, and asserts:
1. Exactly **1** accepted bid is broadcast to the room.
2. Exactly **4** client sockets receive private conflict rejections.
3. No lost updates or corrupt highest-bid pointers occur.

---

## 📡 Real-Time WebSocket Contract

* **Namespace**: `/auctions`
* **Handshake**: `{ auth: { token: "<JWT_ACCESS_TOKEN>" } }`

| Event | Direction | Payload | Description |
|---|---|---|---|
| `auction:join` | Client $\rightarrow$ Server | `{ auctionId }` | Joins room, triggers snapshot sync and presence increment |
| `auction:leave` | Client $\rightarrow$ Server | `{ auctionId }` | Leaves room, decrements presence count |
| `bid:place` | Client $\rightarrow$ Server | `{ auctionId, amount }` | Submits a validated bid |
| `auction:state` | Server $\rightarrow$ Client | `{ id, highestBid, bidderCount, endsAt, ... }` | Authoritative snapshot sent **only to joining socket** |
| `bid:accepted` | Server $\rightarrow$ Room | `{ bidId, amount, bidderId, endsAt }` | Broadcast to all room viewers |
| `bid:rejected` | Server $\rightarrow$ Client | `{ reason }` | Sent **only to bidding socket** on race or validation failure |
| `bid:outbid` | Server $\rightarrow$ User | `{ auctionId, newHighestBid }` | Targeted event sent to outbid user's private channel |
| `auction:extended` | Server $\rightarrow$ Room | `{ auctionId, newEndsAt }` | Broadcast when anti-snipe extends the clock |
| `auction:closed` | Server $\rightarrow$ Room | `{ auctionId, winnerId, finalAmount, outcome }` | Broadcast when BullMQ worker finalizes auction close |
| `presence:update` | Server $\rightarrow$ Room | `{ auctionId, viewerCount }` | Broadcast when viewer presence changes |

---

## 🛠️ Production Deployment

* **Frontend**: Deploy on [Vercel](https://vercel.com) (`npm run build`). Set `VITE_API_BASE_URL` and `VITE_WS_URL`.
* **Backend**: Deploy on [Render](https://render.com) or [Railway](https://railway.app) with **$\ge 2$ instances** to utilize the Redis pub/sub adapter.
* **Database**: [Neon](https://neon.tech) or Railway PostgreSQL.
* **Redis**: [Upstash](https://upstash.com) with pub/sub enabled.
* **Worker**: Dedicated background worker service running `node dist/jobs/worker.js`.

---

## 📄 License

MIT License. Designed and engineered for high-concurrency real-time live auction systems.
