import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Higher-order function that wraps asynchronous express route handlers and catches errors.
 */
export const catchAsync = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};
