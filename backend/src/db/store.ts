/**
 * In-memory data store — Track A stand-in for PostgreSQL (skeleton).
 * Repository-shaped so it can be swapped for Prisma/pg later without changing
 * call sites (students, courses, fees, results, sessions, audit mirror).
 */
class Store {
  // TODO: students, courses, fees, results, sessions, auditMirror
  reset(): void {
    // TODO
  }
}

export const store = new Store()
