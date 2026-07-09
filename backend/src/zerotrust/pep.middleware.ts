/**
 * Policy Enforcement Point middleware — skeleton (IMPLEMENTATION.md §11.3).
 * Will run on every protected route: validate JWT, extract signals, score via
 * the PDP, write the decision to the ledger, then enforce ALLOW/STEP_UP/DENY/TERMINATE.
 */
import type { NextFunction, Request, Response } from 'express'

export function pep(_req: Request, _res: Response, next: NextFunction): void {
  // TODO: implement continuous verification.
  next()
}
