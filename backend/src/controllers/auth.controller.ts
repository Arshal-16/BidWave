import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { catchAsync } from '../utils/catchAsync';

export class AuthController {
  register = catchAsync(async (req: Request, res: Response) => {
    const { email, password, role } = req.body;
    const result = await authService.register(email, password, role);

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
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

  logout = catchAsync(async (req: Request, res: Response) => {
    const rawRefreshToken = req.cookies.refreshToken || req.body.refreshToken;
    await authService.logout(rawRefreshToken);

    res.clearCookie('refreshToken');
    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully.',
    });
  });

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
