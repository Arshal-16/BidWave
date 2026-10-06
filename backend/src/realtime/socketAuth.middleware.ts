import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { TokenPayload } from '../services/auth.service';

/**
 * ============================================================================
 * SOCKET.IO HANDSHAKE AUTHENTICATION MIDDLEWARE: socketAuthMiddleware()
 * ============================================================================
 *
 * Intercepts incoming WebSocket connection handshakes before connection establishment.
 *
 * Extraction & Verification:
 * 1. Reads `socket.handshake.auth.token`.
 * 2. Verifies signature and expiration against `JWT_ACCESS_SECRET`.
 * 3. Populates `socket.data` context (`userId`, `email`, `role`) for all downstream handlers.
 * 4. Rejects connection with 401 AppError if token is missing or invalid.
 */
export function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.token as string | undefined;

  if (!token) {
    return next(new AppError(401, 'Missing authentication token in handshake auth'));
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
    socket.data.userId = payload.sub;
    socket.data.email = payload.email;
    socket.data.role = payload.role;
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired authentication token'));
  }
}

