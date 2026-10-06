import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { catchAsync } from '../utils/catchAsync';

/**
 * AuthController handles HTTP endpoints for the authentication lifecycle.
 *
 * Responsibilities:
 * - Unpacking and delegating register/login/refresh/logout requests to `AuthService`.
 * - Setting and clearing secure, `httpOnly`, `SameSite=Lax` refresh token cookies.
 * - Returning normalized JSON response envelopes: `{ status: 'success', data: { ... } }`.
 */
export class AuthController {
  /**
   * Register a new user account.
   *
   * @route   POST /api/v1/auth/register
   * @body    { email: string, password: string, role?: 'BIDDER' | 'SELLER' }
   * @returns 201 Created with user profile, access token, and sets httpOnly refreshToken cookie.
   * @throws  409 Conflict if the email is already registered.
   */
  register = catchAsync(async (req: Request, res: Response) => {
    const { email, password, role } = req.body;
    const result = await authService.register(email, password, role);

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(201).json({
      status: 'success',
      data: {
        user: result.user,
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
      },
    });
  });

  /**
   * Authenticate user credentials and establish session tokens.
   *
   * @route   POST /api/v1/auth/login
   * @body    { email: string, password: string }
   * @returns 200 OK with user profile, access token, and sets httpOnly refreshToken cookie.
   * @throws  401 Unauthorized if email or password does not match.
   * @throws  403 Forbidden if account is suspended/banned.
   */
  login = catchAsync(async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const result = await authService.login(email, password);

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      status: 'success',
      data: {
        user: result.user,
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
      },
    });
  });

  /**
   * Rotate refresh token and issue a fresh access token.
   * Reads refresh token from httpOnly cookie (fallback to request body).
   *
   * @route   POST /api/v1/auth/refresh
   * @returns 200 OK with new access token and rotated refreshToken cookie.
   * @throws  401 Unauthorized if token is missing, expired, revoked, or compromised.
   */
  refresh = catchAsync(async (req: Request, res: Response) => {
    const rawRefreshToken = req.cookies.refreshToken || req.body.refreshToken;
    const result = await authService.refreshTokens(rawRefreshToken);

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      status: 'success',
      data: {
        user: result.user,
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
      },
    });
  });

  /**
   * Terminate active session by revoking the refresh token in the database
   * and clearing the client-side httpOnly cookie.
   *
   * @route   POST /api/v1/auth/logout
   * @returns 200 OK with logout confirmation message.
   */
  logout = catchAsync(async (req: Request, res: Response) => {
    const rawRefreshToken = req.cookies.refreshToken || req.body.refreshToken;
    await authService.logout(rawRefreshToken);

    res.clearCookie('refreshToken');
    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully.',
    });
  });

  /**
   * Fetch session profile of the currently authenticated user.
   * Populated by `requireAuth` middleware from the verified JWT access token.
   *
   * @route   GET /api/v1/auth/me
   * @header  Authorization: Bearer <accessToken>
   * @returns 200 OK with sanitized user object `{ id, email, role }`.
   * @throws  401 Unauthorized if token is missing or expired.
   */
  me = catchAsync(async (req: Request, res: Response) => {
    res.status(200).json({
      status: 'success',
      data: {
        user: req.user,
      },
    });
  });
}

export const authController = new AuthController();

