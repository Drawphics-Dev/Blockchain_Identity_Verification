/** /api/auth routes — skeleton. Implement in the auth phase (IMPLEMENTATION.md §11.1). */
import { Router } from 'express'

export const authRouter = Router()

// TODO: POST /login  — verify password + on-chain identity, issue JWT
// TODO: POST /logout — end the session
// TODO: GET  /me     — current student + risk score
// TODO: POST /mfa/verify — TOTP step-up

authRouter.get('/', (_req, res) => res.json({ module: 'auth', status: 'not_implemented' }))
