import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { validateBody } from '../middleware/validate.middleware';
import { loginSchema, registerSchema } from '../validators/auth.schema';
import { requireAuth } from '../middleware/auth.middleware';

/**
 * Authentication Route Module (/api/v1/auth)
 *
 * Provides endpoints for user registration, credential login, token refresh,
 * session termination (logout), and current user profile retrieval.
 *
 * Security:
 * - JWT access tokens (short-lived, returned in response payload for memory/header storage)
 * - Refresh tokens (long-lived, set in secure httpOnly cookies and stored hashed in DB)
 */
const router = Router();

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user account (BIDDER or SELLER)
 * @access  Public
 * @body    { email, password, role? } (Validated by registerSchema)
 * @res     201 { status: 'success', data: { user, accessToken, expiresIn } } + Set-Cookie: refreshToken
 * @errors  400 (Validation failed), 409 (Email already registered)
 */
router.post('/register', validateBody(registerSchema), authController.register);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate with email & password to obtain tokens
 * @access  Public
 * @body    { email, password } (Validated by loginSchema)
 * @res     200 { status: 'success', data: { user, accessToken, expiresIn } } + Set-Cookie: refreshToken
 * @errors  400 (Validation failed), 401 (Invalid credentials), 403 (Account banned)
 */
router.post('/login', validateBody(loginSchema), authController.login);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Rotate and issue a new access token using a valid refresh token
 * @access  Public (Requires valid refresh token in httpOnly cookie or body)
 * @res     200 { status: 'success', data: { user, accessToken, expiresIn } } + Set-Cookie: refreshToken
 * @errors  401 (Missing, expired, revoked, or invalid refresh token)
 */
router.post('/refresh', authController.refresh);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Revoke the active refresh token in database and clear auth cookie
 * @access  Public (Idempotent; clears cookie regardless)
 * @res     200 { status: 'success', message: 'Logged out successfully.' }
 */
router.post('/logout', authController.logout);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get currently authenticated user's session profile
 * @access  Private (Requires valid JWT Access Token in Authorization header)
 * @res     200 { status: 'success', data: { user } }
 * @errors  401 (Unauthorized / expired token)
 */
router.get('/me', requireAuth, authController.me);

export const authRoutes = router;

