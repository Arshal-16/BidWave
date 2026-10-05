# BidWave Frontend — Implementation Guide

This document takes you from an empty `frontend/` directory to a deployable SPA, implementing exactly what `master.md` specifies. Follow the steps in order.

**Convention used throughout this guide:** the auction room page (live bidding) is implemented completely, since it's the project's core screen. Listing/browse pages, auth forms, and the seller dashboard follow standard CRUD-page patterns and are noted as "follows the standard pattern" rather than shown in full.

---

## Step 1 — Project Initialization

```bash
npm create vite@latest frontend -- --template react
cd frontend
npm install

npm install socket.io-client @tanstack/react-query axios zod react-hook-form \
  @hookform/resolvers react-router-dom date-fns

npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Install shadcn/ui per its CLI (`npx shadcn@latest init`), then add the components used below: `button`, `input`, `card`, `badge`, `toast`, `skeleton`.

---

## Step 2 — Folder Structure

```text
frontend/
├── src/
│   ├── api/
│   │   ├── client.js              # axios instance + interceptors (token refresh)
│   │   └── auctions.js            # REST calls: list/get/create/edit auctions, bid history
│   ├── realtime/
│   │   ├── SocketProvider.jsx     # the core real-time context — see Step 5
│   │   └── useAuctionRoom.js      # hook wrapping join/leave/bid for one auction
│   ├── pages/
│   │   ├── AuctionListPage.jsx
│   │   ├── AuctionRoomPage.jsx    # the core screen — see Step 6
│   │   ├── SellerDashboardPage.jsx
│   │   ├── LoginPage.jsx
│   │   └── RegisterPage.jsx
│   ├── components/
│   │   ├── auction/
│   │   │   ├── BidPanel.jsx
│   │   │   ├── CountdownTimer.jsx
│   │   │   ├── PriceDisplay.jsx
│   │   │   ├── PresenceBadge.jsx
│   │   │   └── ActivityFeed.jsx
│   │   └── ui/                    # shadcn components
│   ├── context/
│   │   └── AuthContext.jsx
│   ├── hooks/
│   │   └── useAuth.js
│   ├── routes/
│   │   └── ProtectedRoute.jsx
│   ├── App.jsx
│   └── main.jsx
├── .env.example
└── package.json
```

**Note:** Vite's plain `react` template (not `react-ts`) uses `.jsx` for any file containing JSX and plain `.js` otherwise — the structure above follows that convention. `vite.config.js` (not `.ts`) is generated automatically by the template.

---

## Step 3 — Configuration

`.env.example`:
```bash
VITE_API_BASE_URL=http://localhost:4000/api/v1
VITE_WS_URL=http://localhost:4000
```

`src/api/client.js` — standard axios instance with a response interceptor that transparently refreshes the access token on a `401` and retries once (identical pattern to any JWT-refresh frontend setup, not specific to real-time).

---

## Step 4 — Auth Context

Standard pattern: `AuthContext` holds the current user + access token (refresh token stays in an httpOnly cookie, never touched by JS); `ProtectedRoute` redirects unauthenticated users to `/login`, preserving the intended destination for post-login redirect. Not shown in full — identical shape to a standard auth setup.

---

## Step 5 — Socket Provider (the real-time foundation)

`src/realtime/SocketProvider.jsx`:
```jsx
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../hooks/useAuth';

const SocketContext = createContext({ socket: null, connected: false });

export function SocketProvider({ children }) {
  const { accessToken } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!accessToken) return;

    const socket = io(`${import.meta.env.VITE_WS_URL}/auctions`, {
      auth: { token: accessToken },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    // No manual re-join logic here deliberately — see useAuctionRoom.ts,
    // which re-emits auction:join on every 'connect' event (including
    // reconnects), so room re-sync lives with the room hook, not globally.

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
```

**Why the token is re-read from `AuthContext` and the socket rebuilt on token change, instead of a single socket for the app's lifetime:** when the access token refreshes (every 15 minutes per the auth cycle), the socket's handshake auth must carry the new token too, or a reconnect after a token refresh would authenticate with a stale, possibly-expired token. Rebuilding the connection on token change keeps the socket's auth always current — the brief reconnect this causes is imperceptible and handled gracefully by the room-state resync described next.

`src/realtime/useAuctionRoom.js`:
```javascript
import { useEffect, useState, useCallback } from 'react';
import { useSocket } from './SocketProvider';

// Shape of `state` kept here as a comment since there's no TS interface:
// { highestBid: number|null, bidderCount: number, endsAt: string, status: string }

export function useAuctionRoom(auctionId) {
  const { socket, connected } = useSocket();
  const [state, setState] = useState(null);
  const [activity, setActivity] = useState([]); // [{ amount, bidderId }]
  const [viewerCount, setViewerCount] = useState(0);
  const [rejection, setRejection] = useState(null);

  useEffect(() => {
    if (!socket) return;

    const join = () => socket.emit('auction:join', { auctionId });
    join(); // on mount...
    socket.on('connect', join); // ...and on every reconnect (FR9 / NFR4)

    socket.on('auction:state', (snapshot) => setState(snapshot));
    socket.on('bid:accepted', (bid) => {
      setState((s) => (s ? { ...s, highestBid: bid.amount, endsAt: bid.endsAt } : s));
      setActivity((a) => [{ amount: bid.amount, bidderId: bid.bidderId }, ...a].slice(0, 20));
    });
    socket.on('bid:rejected', ({ reason }) => setRejection(reason));
    socket.on('auction:extended', ({ newEndsAt }) =>
      setState((s) => (s ? { ...s, endsAt: newEndsAt } : s)),
    );
    socket.on('presence:update', ({ viewerCount }) => setViewerCount(viewerCount));
    socket.on('auction:closed', (result) =>
      setState((s) => (s ? { ...s, status: result.outcome } : s)),
    );

    return () => {
      socket.emit('auction:leave', { auctionId });
      socket.off('connect', join);
      socket.off('auction:state');
      socket.off('bid:accepted');
      socket.off('bid:rejected');
      socket.off('auction:extended');
      socket.off('presence:update');
      socket.off('auction:closed');
    };
  }, [socket, auctionId]);

  const placeBid = useCallback(
    (amount: number) => {
      setRejection(null);
      socket?.emit('bid:place', { auctionId, amount });
    },
    [socket, auctionId],
  );

  return { state, activity, viewerCount, rejection, connected, placeBid };
}
```

---

## Step 6 — Auction Room Page (the core screen)

`src/pages/AuctionRoomPage.jsx`:
```jsx
import { useParams } from 'react-router-dom';
import { useAuctionRoom } from '../realtime/useAuctionRoom';
import { PriceDisplay } from '../components/auction/PriceDisplay';
import { CountdownTimer } from '../components/auction/CountdownTimer';
import { BidPanel } from '../components/auction/BidPanel';
import { PresenceBadge } from '../components/auction/PresenceBadge';
import { ActivityFeed } from '../components/auction/ActivityFeed';
import { Skeleton } from '../components/ui/skeleton';

export default function AuctionRoomPage() {
  const { auctionId } = useParams();
  const { state, activity, viewerCount, rejection, connected, placeBid } = useAuctionRoom(auctionId);

  if (!state) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      {!connected && (
        <div className="bg-amber-100 text-amber-800 text-sm px-3 py-1 rounded-md" role="status">
          Reconnecting…
        </div>
      )}
      <div className="flex items-center justify-between">
        <PriceDisplay amount={state.highestBid} />
        <PresenceBadge count={viewerCount} />
      </div>
      <CountdownTimer endsAt={state.endsAt} />
      <BidPanel
        currentHighest={state.highestBid}
        disabled={state.status !== 'OPEN'}
        onSubmit={placeBid}
        rejectionReason={rejection}
      />
      <ActivityFeed items={activity} />
    </div>
  );
}
```

`src/components/auction/PriceDisplay.jsx` — renders the price in an `aria-live="polite"` region with a brief highlight-flash animation on change (CSS transition keyed by a re-render, not a heavy animation library), satisfying the accessibility and "live-feeling" requirements from `master.md` §9 without relying on color alone.

`src/components/auction/CountdownTimer.jsx` — re-renders every second via a local `setInterval` purely for display smoothness, but its *source of truth* is always the `endsAt` prop passed down from server-driven state (`auction:state` / `auction:extended` events) — it never maintains its own independent countdown that could drift from the server, directly satisfying the "never drifts from authoritative server time" requirement.

`src/components/auction/BidPanel.jsx` — a form (react-hook-form + Zod) with a numeric input defaulting to `currentHighest + minIncrement`, disabled while `disabled` is true (auction closed), displaying `rejectionReason` inline as a form error the moment a `bid:rejected` event arrives — not a toast, since the user needs to see *why* right next to the input they just used.

---

## Step 7 — Listing, Dashboard, and Auth Pages

Follows standard CRUD-page patterns using TanStack Query against the REST API (`src/api/auctions.js`): `AuctionListPage` (paginated grid, status filter), `SellerDashboardPage` (seller's own auctions + live bid count, re-using `useAuctionRoom` per card for a live-updating dashboard), `LoginPage`/`RegisterPage` (react-hook-form + Zod, calling `AuthContext`). Not shown in full — no real-time-specific logic beyond what Steps 5–6 already cover.

---

## Step 8 — Testing

Vitest + React Testing Library, standard component-test patterns: `BidPanel` validation behavior (rejects below-minimum amounts client-side before even emitting, as a UX nicety — the server is still the source of truth per `master.md` BR3), `ProtectedRoute` redirect behavior, loading/empty/error states for list views. One real-time-specific test: mock `useSocket` to emit a `bid:accepted` event and assert `AuctionRoomPage` re-renders the new price without a remount — proving the live-update path works end-to-end at the component level.

---

## Step 9 — Deployment

Standard Vite + Vercel deployment: `VITE_API_BASE_URL` and `VITE_WS_URL` set as Vercel environment variables pointing at the deployed backend's load-balanced URL (so the frontend is exercising the exact same multi-instance setup as `backend.md` Step 14's production verification step). No real-time-specific deployment steps beyond ensuring `VITE_WS_URL` uses `https://` (Socket.io upgrades to `wss://` automatically over HTTPS) and matches the backend's actual public origin, not `localhost`.
