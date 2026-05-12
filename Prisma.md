# Prisma & Neon Connection Stability Plan

This plan addresses the transient `P1001: Can't reach database server` errors by implementing a robust connection lifecycle management strategy as recommended for serverless/pooled Neon databases.

## User Review Required

> [!IMPORTANT]
> **DATABASE_URL Update**: You will need to manually update your `.env` file to include the connection parameters. I will provide the exact string to use.
>
> **Singleton Transition**: This involves modifying ~20 files where `PrismaClient` is currently instantiated. This is a standard best practice but a wide-reaching change.

## Proposed Changes

### [Component Name] Database Core

#### [NEW] [prisma.ts](file:///Users/saiteja/gh-repos/pump-api/src/lib/prisma.ts)

- Create a central singleton for the Prisma Client.
- Includes the `withAccelerate()` extension as currently used in the codebase.
- Implements the `globalThis` pattern to prevent multiple instances during hot-reloads.

#### [MODIFY] [.env](file:///Users/saiteja/gh-repos/pump-api/.env)

- **User Action Required**: Append `?pgbouncer=true&connect_timeout=15` to your `DATABASE_URL`.
- Example: `DATABASE_URL="postgresql://.../dbname?sslmode=require&pgbouncer=true&connect_timeout=15"`

---

### [Component Name] Global Utilities

#### [NEW] [dbUtils.ts](file:///Users/saiteja/gh-repos/pump-api/src/utils/dbUtils.ts)

- Implement a `withRetry` helper to wrap critical database operations.
- Specifically catches `P1001` and retries with a short delay (e.g., 500ms).

---

### [Component Name] Refactoring Services

#### [MODIFY] All Module Services

- Replace local `const prisma = new PrismaClient()...` with `import { prisma } from '../../lib/prisma.js'`.
- Affected files include:
  - `src/modules/user/user.services.ts`
  - `src/modules/me/service.ts`
  - `src/modules/workout/service.ts`
  - `src/modules/engagement/service.ts`
  - `src/modules/programs/service.ts`
  - (And ~15 other files identified in the audit)

## Verification Plan

### Automated Tests

- I will run a build check to ensure all imports are correctly resolved.
- I will perform a smoke test on one or two endpoints (e.g., `/user/profile`) to verify the singleton is functioning.

### Manual Verification

- Monitor logs for a period to see if the frequency of `P1001` errors decreases.
- Verify that the app still functions correctly after a "cold start" (Neon compute suspension).
