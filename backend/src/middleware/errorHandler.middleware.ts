import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { Prisma } from '@prisma/client';

export const errorHandler: ErrorRequestHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  let error = err;

  // Handle Prisma Known Request Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[])?.join(', ') || 'field';
      error = new AppError(409, `A record with this ${target} already exists.`);
    } else if (err.code === 'P2025') {
      error = new AppError(404, 'The requested resource was not found.');
    }
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = new AppError(401, 'Invalid authentication token.');
  } else if (err.name === 'TokenExpiredError') {
    error = new AppError(401, 'Authentication token has expired.');
  }

  const statusCode = error instanceof AppError ? error.statusCode : 500;
  const message = error instanceof AppError ? error.message : 'Internal server error';

  if (statusCode === 500) {
    logger.error({ err }, 'Unhandled application error');
  }

  res.status(statusCode).json({
    status: error instanceof AppError ? error.status : 'error',
    message,
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
