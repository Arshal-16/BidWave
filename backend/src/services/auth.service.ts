import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { userRepository } from '../repositories/user.repository';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { Role } from '@prisma/client';

export interface TokenPayload {
  sub: string;
  email: string;
  role: Role;
}

export class AuthService {
  async register(email: string, password: string, role: Role = Role.BIDDER) {
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new AppError(409, 'User with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await userRepository.create({
      email,
      passwordHash,
      role,
      emailVerified: true,
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      ...tokens,
    };
  }

  async login(email: string, password: string) {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new AppError(401, 'Invalid email or password.');
    }

    if (user.isBanned) {
      throw new AppError(403, 'Your account has been suspended.');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new AppError(401, 'Invalid email or password.');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      ...tokens,
    };
  }

  async refreshTokens(rawRefreshToken: string) {
    if (!rawRefreshToken) {
      throw new AppError(401, 'Refresh token required.');
    }

    try {
      jwt.verify(rawRefreshToken, env.JWT_REFRESH_SECRET);
    } catch {
      throw new AppError(401, 'Invalid or expired refresh token.');
    }

    const tokenHash = this.hashToken(rawRefreshToken);
    const tokenRecord = await userRepository.findRefreshToken(tokenHash);

    if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
      if (tokenRecord) await userRepository.deleteRefreshToken(tokenHash);
      throw new AppError(401, 'Refresh token has expired or been revoked.');
    }

    // Token rotation: delete used token
    await userRepository.deleteRefreshToken(tokenHash);

    // Issue new pair
    const tokens = await this.generateTokens(
      tokenRecord.user.id,
      tokenRecord.user.email,
      tokenRecord.user.role,
    );

    return {
      user: {
        id: tokenRecord.user.id,
        email: tokenRecord.user.email,
        role: tokenRecord.user.role,
      },
      ...tokens,
    };
  }

  async logout(rawRefreshToken?: string) {
    if (rawRefreshToken) {
      const tokenHash = this.hashToken(rawRefreshToken);
      await userRepository.deleteRefreshToken(tokenHash);
    }
  }

  private async generateTokens(userId: string, email: string, role: Role) {
    const payload: TokenPayload = { sub: userId, email, role };

    const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRY as any,
    });

    const refreshToken = jwt.sign({ sub: userId }, env.JWT_REFRESH_SECRET, {
      expiresIn: `${env.REFRESH_TOKEN_EXPIRY_DAYS}d` as any,
    });

    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await userRepository.saveRefreshToken(userId, tokenHash, expiresAt);

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 mins in seconds
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

export const authService = new AuthService();
