/**
 * OpenAPI 3.0 description of the backend API, served as interactive Swagger UI at /docs.
 *
 * This is hand-authored rather than generated, so it can drift from the code if routes
 * change without it. Keep it in step with `auth.routes.ts` and `portal.routes.ts`.
 *
 * The response shapes here are the same ones the React portal consumes
 * (see frontend/src/types/index.ts) — the API is written to return them directly.
 */
import type { OpenAPIV3 } from 'openapi-types'

const errorResponse = (description: string) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
    },
  },
})

const zeroTrustBlocked = errorResponse(
  '`step_up_required` — the PEP needs `POST /api/auth/step-up` first — or `access_denied`.',
)

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Blockchain-Enhanced Identity Verification — Portal API',
    version: '0.1.0',
    description: [
      'Backend for the Zero Trust university student portal.',
      '',
      '**How to try these endpoints:**',
      '1. Call `POST /api/auth/login` with `SU/CS/2023/0187` / `demo1234`.',
      '2. Copy the `token` from the response.',
      '3. Click **Authorize** (top right), paste the token, and every request below will carry it.',
      '',
      '**Session model.** The JWT is not a bearer token in the usual "stateless" sense: its `jti`',
      'is the id of a `Session` row in PostgreSQL, and every protected request re-checks that row.',
      'Logging out revokes the row, so the token dies immediately even though its signature is',
      'still valid — the same revocation path a `TERMINATE` decision from the Zero Trust engine uses.',
      '',
      '**Zero Trust engine.** Every `/api/*` portal request (and login itself) is scored by the',
      'PDP against live signals — new device, new IP, odd hour, stale session, high request rate,',
      'sensitive resource — and enforced by the PEP: `ALLOW` passes through, `STEP_UP` blocks with',
      '`403 step_up_required` until `POST /api/auth/step-up` succeeds, `DENY` blocks the request,',
      '`TERMINATE` revokes the session outright. A background monitor also re-scores active',
      'sessions on an interval and can terminate one with no new request. See ROADMAP §4.',
      '',
      '**Identity anchor.** Login is a second, independent gate on top of the password: the',
      'backend reads the anchor with `LedgerService.getIdentity` (anchoring it on first use) and',
      'compares it to a hash recomputed from the stored credential. Two distinct failures are',
      'reported separately, because they mean different things: `403 identity_revoked` (an',
      'administrative act) and `403 identity_mismatch` (the stored hash no longer agrees with the',
      'anchor — a tampering indicator). Both block login even when the password is still correct,',
      'which is the property bcrypt alone cannot give.',
      '',
      '**Trying step-up:** bind an authenticator through `GET` then `POST /api/auth/mfa/enroll`,',
      'which require the registrar’s one-time enrollment token (issued out of band by the seed',
      'script). A correct password is deliberately NOT sufficient to enroll — otherwise whoever',
      'signs in first binds the second factor. Afterwards, `POST /api/auth/step-up` answers a',
      'challenge with a TOTP code.',
      '',
      '**Audit trail.** `GET /api/admin/audit` lists every decision written to the ledger;',
      '`GET /api/admin/audit/verify/{eventId}` recomputes the off-chain mirror’s hash and compares',
      'it to the immutable on-chain record — a mismatch means the PostgreSQL copy was tampered with.',
      '`POST /api/admin/identity/{studentId}/revoke` revokes an identity anchor on-chain. All three',
      'are ADMIN-only.',
      '',
      '**Ledger.** Runs on a live Hyperledger Fabric 2.5 network (`LEDGER=fabric`); `MockLedger`',
      '(`LEDGER=mock`) remains available behind the same interface for development without a',
      'blockchain. A peer outage returns `503 ledger_unavailable`, never a 500.',
    ].join('\n'),
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local development' }],
  tags: [
    { name: 'System', description: 'Health and diagnostics.' },
    { name: 'Auth', description: 'Login, logout, and the current student.' },
    {
      name: 'Portal',
      description:
        'Courses, registration, fees and results. Every route requires a bearer token and is ' +
        'scoped to the student in that token — you cannot read another student’s records.',
    },
    {
      name: 'Admin',
      description: 'Audit trail and tamper-detection (ROADMAP §5). Requires a bearer token.',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste the `token` returned by `POST /api/auth/login`.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'string',
            description: 'Stable machine-readable code.',
            example: 'invalid_credentials',
          },
          message: {
            type: 'string',
            description: 'Human-readable explanation.',
            example: 'Invalid student ID or password.',
          },
        },
        required: ['error', 'message'],
      },
      Student: {
        type: 'object',
        description:
          '`gpa` and `enrolledCredits` are derived from the underlying rows on every read, ' +
          'never stored, so they cannot drift. `trustScore` is derived too, from the Zero ' +
          'Trust engine’s most recent decision for this student.',
        properties: {
          id: { type: 'string', example: 'cmrj19d8n0000vgtltacdtune' },
          studentId: { type: 'string', example: 'SU/CS/2023/0187' },
          fullName: { type: 'string', example: 'Amina Okonkwo' },
          email: { type: 'string', format: 'email' },
          program: { type: 'string', example: 'BSc Computer Science' },
          level: { type: 'string', example: '300 Level' },
          gpa: {
            type: 'number',
            format: 'float',
            description: 'Cumulative, credit-weighted across all graded semesters.',
            example: 3.46,
          },
          enrolledCredits: { type: 'integer', example: 15 },
          trustScore: {
            type: 'integer',
            description: '100 minus the risk score of the student’s most recent PDP decision.',
            example: 94,
          },
        },
      },
      Course: {
        type: 'object',
        properties: {
          code: { type: 'string', example: 'CSC 301' },
          title: { type: 'string', example: 'Data Structures & Algorithms' },
          credits: { type: 'integer', example: 3 },
          lecturer: { type: 'string', example: 'Dr. E. Nwosu' },
          schedule: { type: 'string', example: 'Mon 10:00 · Wed 12:00' },
          seatsTaken: { type: 'integer', example: 118 },
          seatsTotal: { type: 'integer', example: 120 },
          status: {
            type: 'string',
            enum: ['open', 'waitlist', 'closed'],
            description: 'Reported as `closed` whenever seatsTaken >= seatsTotal.',
          },
          department: { type: 'string', example: 'Computer Science' },
        },
      },
      Enrollment: {
        type: 'object',
        properties: {
          courseCode: { type: 'string', example: 'CSC 301' },
          semester: { type: 'string', example: 'Semester 1' },
          registeredAt: { type: 'string', format: 'date-time' },
        },
      },
      RegistrationState: {
        type: 'object',
        description:
          'Both registration mutations return the refreshed catalogue and enrollments, so the ' +
          'client never has to re-fetch to see the new seat count.',
        properties: {
          courses: { type: 'array', items: { $ref: '#/components/schemas/Course' } },
          enrollments: { type: 'array', items: { $ref: '#/components/schemas/Enrollment' } },
        },
      },
      FeeStatement: {
        type: 'object',
        description: '`totalDue` and `totalPaid` are summed from the line items, never stored.',
        properties: {
          semester: { type: 'string', example: 'Semester 1 · 2025/2026' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', example: 'Tuition Fee' },
                amount: { type: 'integer', example: 180000 },
                category: {
                  type: 'string',
                  enum: ['tuition', 'accommodation', 'library', 'lab', 'other'],
                },
              },
            },
          },
          payments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                date: { type: 'string', format: 'date', example: '2025-09-14' },
                method: { type: 'string', example: 'Bank Transfer' },
                amount: { type: 'integer', example: 150000 },
                reference: { type: 'string', example: 'TRX-8842190' },
              },
            },
          },
          totalDue: { type: 'integer', example: 283000 },
          totalPaid: { type: 'integer', example: 210000 },
        },
      },
      SemesterResult: {
        type: 'object',
        properties: {
          semester: { type: 'string', example: 'Semester 2 · 2024/2025' },
          gpa: { type: 'number', format: 'float', example: 3.72 },
          records: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                courseCode: { type: 'string', example: 'CSC 202' },
                courseTitle: { type: 'string', example: 'Object-Oriented Programming' },
                credits: { type: 'integer', example: 3 },
                score: { type: 'integer', example: 84 },
                grade: { type: 'string', example: 'A' },
                gradePoint: { type: 'number', format: 'float', example: 4.0 },
              },
            },
          },
        },
      },
    },
  },

  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Liveness check',
        description: 'Open — no token required. Reports which ledger implementation is active.',
        security: [],
        responses: {
          200: {
            description: 'Service is up.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    ledger: { type: 'string', enum: ['mock', 'fabric'], example: 'mock' },
                    env: { type: 'string', example: 'development' },
                  },
                },
              },
            },
          },
        },
      },
    },

    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in and receive a session token',
        description:
          'Verifies the password with bcrypt, then creates a `Session` row and issues a JWT ' +
          'whose `jti` is that row’s id.\n\n' +
          '**No user enumeration:** an unknown student ID and a wrong password return the same ' +
          '`invalid_credentials` message, and a dummy bcrypt comparison runs when the ID is ' +
          'unknown so the two cases also take the same time.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['studentId', 'password'],
                properties: {
                  studentId: { type: 'string', example: 'SU/CS/2023/0187' },
                  password: { type: 'string', format: 'password', example: 'demo1234' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description:
              'Authenticated. `stepUpRequired` is true when the Zero Trust engine flagged this ' +
              'device/network as unrecognized — portal routes 403 with `step_up_required` until ' +
              '`POST /api/auth/step-up` succeeds.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string', description: 'JWT — paste into **Authorize**.' },
                    expiresAt: { type: 'string', format: 'date-time' },
                    student: { $ref: '#/components/schemas/Student' },
                    stepUpRequired: { type: 'boolean' },
                  },
                },
              },
            },
          },
          400: errorResponse('Missing student ID or password.'),
          401: errorResponse('Wrong password, or no such student — deliberately indistinguishable.'),
          403: errorResponse('`identity_revoked` — the ledger identity anchor has been revoked.'),
        },
      },
    },

    '/api/auth/step-up': {
      post: {
        tags: ['Auth'],
        summary: 'Complete a STEP_UP challenge with a TOTP code',
        description:
          'Verifies the code against the signed-in student’s TOTP secret. On success the ' +
          'session is marked verified for a limited window, during which the PEP downgrades ' +
          'matching `STEP_UP` decisions to `ALLOW`.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['code'],
                properties: { code: { type: 'string', example: '123456' } },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Verified.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    validUntil: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          400: errorResponse('Missing/malformed code, or `invalid_code` — incorrect/expired TOTP code.'),
          401: errorResponse('No valid session.'),
        },
      },
    },

    // NOTE: `GET /api/auth/mfa-secret` was documented here but never existed as a route — the
    // spec promised a 200 on a path that has only ever returned 404. It was superseded by the
    // guarded enrollment flow (`GET|POST /api/auth/mfa/enroll`), which requires the registrar's
    // out-of-band token precisely so a correct password alone cannot reveal the shared secret.
    // Handing that secret to anyone with a session, as the removed endpoint described, would
    // have let a password thief mint their own codes and defeated step-up entirely.

    '/api/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Revoke the current session',
        description:
          'Marks the `Session` row revoked. The token is dead from this moment, even though its ' +
          'signature remains valid and it has not expired — replaying it returns `session_ended`.',
        responses: {
          200: {
            description: 'Session revoked.',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { ok: { type: 'boolean', example: true } } },
              },
            },
          },
          401: errorResponse('No valid session.'),
        },
      },
    },

    '/api/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'The signed-in student',
        responses: {
          200: {
            description: 'The current student, with freshly derived GPA and credit load.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { student: { $ref: '#/components/schemas/Student' } },
                },
              },
            },
          },
          401: errorResponse('No valid session.'),
        },
      },
    },

    '/api/courses': {
      get: {
        tags: ['Portal'],
        summary: 'Course catalogue with live seat counts',
        responses: {
          200: {
            description: 'All courses.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    courses: { type: 'array', items: { $ref: '#/components/schemas/Course' } },
                  },
                },
              },
            },
          },
          401: errorResponse('No valid session.'),
          403: zeroTrustBlocked,
        },
      },
    },

    '/api/enrollments': {
      get: {
        tags: ['Portal'],
        summary: 'This student’s registrations',
        responses: {
          200: {
            description: 'Registrations for the current semester.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    enrollments: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Enrollment' },
                    },
                  },
                },
              },
            },
          },
          401: errorResponse('No valid session.'),
          403: zeroTrustBlocked,
        },
      },
      post: {
        tags: ['Portal'],
        summary: 'Register for a course',
        description:
          'Transactional. Seat availability and the 24-credit cap are re-checked *inside* the ' +
          'transaction and the seat count is incremented in the same commit, so two simultaneous ' +
          'registrations cannot both take the last seat.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['courseCode'],
                properties: { courseCode: { type: 'string', example: 'CSC 317' } },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Registered. Returns the refreshed catalogue and enrollments.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RegistrationState' },
              },
            },
          },
          400: errorResponse('`courseCode` missing.'),
          401: errorResponse('No valid session.'),
          403: zeroTrustBlocked,
          404: errorResponse('`course_not_found` — no such course code.'),
          409: errorResponse(
            'Rejected: `already_registered`, `course_full`, or `credit_limit_exceeded`.',
          ),
        },
      },
    },

    '/api/enrollments/{courseCode}': {
      delete: {
        tags: ['Portal'],
        summary: 'Drop a course',
        description: 'Deletes the registration and frees the seat in one transaction.',
        parameters: [
          {
            name: 'courseCode',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'URL-encode the space, e.g. `CSC%20317`.',
            example: 'CSC 317',
          },
        ],
        responses: {
          200: {
            description: 'Dropped. Returns the refreshed catalogue and enrollments.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RegistrationState' },
              },
            },
          },
          401: errorResponse('No valid session.'),
          403: zeroTrustBlocked,
          404: errorResponse('`not_registered` — you are not registered for this course.'),
        },
      },
    },

    '/api/fees': {
      get: {
        tags: ['Portal'],
        summary: 'Fee statement (sensitive)',
        description:
          'A *sensitive* resource: requesting this carries extra weight in the risk score ' +
          '(policy.config.ts) and, combined with other signals, can trigger a STEP_UP decision.',
        responses: {
          200: {
            description: 'The student’s fee statement.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { statement: { $ref: '#/components/schemas/FeeStatement' } },
                },
              },
            },
          },
          401: errorResponse('No valid session.'),
          403: zeroTrustBlocked,
          404: errorResponse('No fee statement on record.'),
        },
      },
    },

    '/api/results': {
      get: {
        tags: ['Portal'],
        summary: 'Examination results (sensitive)',
        description: 'Newest semester first. Sensitive, as with `/api/fees`.',
        responses: {
          200: {
            description: 'Results by semester.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    results: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/SemesterResult' },
                    },
                  },
                },
              },
            },
          },
          401: errorResponse('No valid session.'),
          403: zeroTrustBlocked,
        },
      },
    },

    '/api/admin/audit': {
      get: {
        tags: ['Admin'],
        summary: 'The immutable audit trail',
        description: 'Every decision the Zero Trust engine has written to the ledger, newest write order.',
        parameters: [
          {
            name: 'studentId',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Scope the trail to one student (the internal id, not the matriculation number).',
          },
        ],
        responses: {
          200: {
            description: 'The trail.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    trail: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          eventId: { type: 'string' },
                          studentId: { type: 'string' },
                          resource: { type: 'string' },
                          decision: { type: 'string', enum: ['ALLOW', 'STEP_UP', 'DENY', 'TERMINATE'] },
                          riskScore: { type: 'integer' },
                          timestamp: { type: 'string', format: 'date-time' },
                          hash: { type: 'string' },
                          prevHash: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: errorResponse('No valid session.'),
        },
      },
    },

    '/api/admin/audit/verify/{eventId}': {
      get: {
        tags: ['Admin'],
        summary: 'Tamper check for one audit event',
        description:
          'Recomputes the hash the off-chain (PostgreSQL) mirror’s CURRENT fields would produce ' +
          'and compares it to the immutable on-chain hash. `valid: false` means the mirror row ' +
          'was edited after the fact — the Phase 8 tampering scenario’s expected detection path.',
        parameters: [
          {
            name: 'eventId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'The integrity result.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    eventId: { type: 'string' },
                    valid: { type: 'boolean' },
                    expectedHash: { type: 'string', description: 'The immutable on-chain hash.' },
                    actualHash: { type: 'string', description: 'Recomputed from the mirror’s current data.' },
                  },
                },
              },
            },
          },
          401: errorResponse('No valid session.'),
          403: errorResponse('`forbidden` — administrator access required.'),
          404: errorResponse('No audit event with that id, on-chain or in the mirror.'),
        },
      },
    },

    '/api/admin/identity/{studentId}/verify': {
      get: {
        tags: ['Admin'],
        summary: 'Identity-anchor check for one student (verified on-chain)',
        description:
          'The identity counterpart of the audit verifier. Recomputes the credential hash from ' +
          'what PostgreSQL holds right now and submits it to `IdentityContract.verifyIdentity`, so ' +
          'the comparison is performed **inside the chaincode** rather than by this server.\n\n' +
          '`validOnChain: false` with `revoked: false` means the stored password hash no longer ' +
          'matches what was anchored — the off-chain database was tampered with (ROADMAP §1, data ' +
          'adulteration). `agreesWithLocalCheck: false` would mean this server and the ledger ' +
          'disagree, which should never happen and warrants investigation.',
        parameters: [
          {
            name: 'studentId',
            in: 'path',
            required: true,
            description: 'Matriculation number, e.g. `SU/CS/2023/0187`.',
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'The on-chain identity verdict.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    studentId: { type: 'string' },
                    validOnChain: { type: 'boolean', description: 'The chaincode’s own verdict.' },
                    revoked: { type: 'boolean' },
                    credentialMatches: { type: 'boolean' },
                    anchoredAt: { type: 'string', format: 'date-time' },
                    agreesWithLocalCheck: { type: 'boolean' },
                  },
                },
              },
            },
          },
          401: errorResponse('No valid session.'),
          403: errorResponse('`forbidden` — administrator access required.'),
          404: errorResponse('No student with that matriculation number.'),
          409: errorResponse('`not_anchored` — the student has never logged in, so no anchor exists.'),
        },
      },
    },

    '/api/admin/identity/{studentId}/revoke': {
      post: {
        tags: ['Admin'],
        summary: 'Revoke a student’s on-chain identity anchor (PERMANENT)',
        description:
          'Zero Trust instant revocation (ROADMAP §4.2). Revokes the anchor on-chain, so every ' +
          'future login is refused at the identity gate with `403 identity_revoked` even with the ' +
          'correct password, then revokes the student’s live sessions so the block takes effect ' +
          'immediately. The administrative act itself is written to the audit trail.\n\n' +
          '**This cannot be undone.** IdentityContract has no un-revoke transaction, and ' +
          '`registerIdentity` deliberately preserves the revoked flag so a re-registration cannot ' +
          'quietly reverse one. It is therefore an explicit act by a named administrator and is ' +
          'NOT wired to the risk engine’s TERMINATE decision — a false-positive risk score must ' +
          'never be able to lock a student out of their records irreversibly.',
        parameters: [
          {
            name: 'studentId',
            in: 'path',
            required: true,
            description: 'Matriculation number, e.g. `SU/CS/2023/0187`.',
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['reason'],
                properties: {
                  reason: {
                    type: 'string',
                    maxLength: 200,
                    description: 'Why — recorded in the trail. Revocation is permanent, so it must be justified.',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'The identity was revoked on-chain.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    studentId: { type: 'string' },
                    revoked: { type: 'boolean' },
                    sessionsRevoked: { type: 'integer', description: 'Live sessions closed by this action.' },
                    reason: { type: 'string' },
                  },
                },
              },
            },
          },
          400: errorResponse('`invalid_request` — a reason is required.'),
          401: errorResponse('No valid session.'),
          403: errorResponse('`forbidden` — administrator access required.'),
          404: errorResponse('No student with that matriculation number.'),
          409: errorResponse(
            '`not_anchored` (the student has never logged in, so no anchor exists) or ' +
              '`already_revoked`.',
          ),
        },
      },
    },
  },

  // Everything requires a bearer token unless a route overrides this with `security: []`.
  security: [{ bearerAuth: [] }],
} satisfies OpenAPIV3.Document
