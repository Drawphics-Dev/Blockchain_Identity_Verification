/**
 * Express 4 does not catch rejections from async handlers — an unhandled one hangs the
 * request instead of returning a 500. Wrap async handlers in this so they reach the
 * error middleware.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express'

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}
