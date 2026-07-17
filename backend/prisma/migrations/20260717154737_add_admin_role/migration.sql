-- Adds the STUDENT/ADMIN privilege boundary for the Admin/Research audit view.
--
-- Applied with `prisma db execute` + `migrate resolve --applied` rather than `migrate dev`,
-- which insists on a full reset because of pre-existing drift in this database. A reset is not
-- survivable here: re-seeding regenerates every bcrypt hash, and the identity anchors on the
-- Fabric ledger are immutable, so every student would fail login with `credential_mismatch`
-- forever after (see verifyIdentityAnchor in src/zerotrust/identity.ts).
CREATE TYPE "Role" AS ENUM ('STUDENT', 'ADMIN');
ALTER TABLE "Student" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'STUDENT';
