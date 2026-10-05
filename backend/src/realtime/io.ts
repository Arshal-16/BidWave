import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as HttpServer } from 'http';
import { pubClient, subClient } from '../config/redis';
import { env } from '../config/env';
import { socketAuthMiddleware } from './socketAuth.middleware';
import { registerAuctionRoomHandlers } from './auctionRoom.handler';
import { logger } from '../config/logger';

let ioInstance: Server | null = null;

export function initSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN.split(','),
      credentials: true,
    },
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });

  // Attach Redis adapter if not in unit test environment
  if (env.NODE_ENV !== 'test') {
    try {
      io.adapter(createAdapter(pubClient, subClient));
      logger.info('Connected Socket.io to Redis pub/sub adapter');
    } catch (err) {
      logger.error({ err }, 'Failed to initialize Socket.io Redis adapter');
    }
  }

  const auctionsNsp = io.of('/auctions');
  auctionsNsp.use(socketAuthMiddleware);
  auctionsNsp.on('connection', (socket) => {
    logger.debug({ socketId: socket.id, userId: socket.data.userId }, 'Socket connected to /auctions');
    registerAuctionRoomHandlers(auctionsNsp, socket);
  });

  ioInstance = io;
  return io;
}

export function getIoInstance(): Server {
  if (!ioInstance) {
    throw new Error('Socket.io server has not been initialized yet.');
  }
  return ioInstance;
}
