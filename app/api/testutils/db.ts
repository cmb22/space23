import { db } from "@/lib/db/drizzle";
import { sql } from "drizzle-orm";

/**
 * ⚠️ Hard reset only for test DB.
 * Truncates tables + resets serials.
 */
export async function truncateAll() {
    // Order doesn’t matter if CASCADE is used.
    await db.execute(sql`
    TRUNCATE TABLE
      bookings,
      teacher_availability,
      availability_overrides,
      availability_rules,
      lesson_offers,
      teacher_profiles,
      team_members,
      invitations,
      activity_logs,
      entitlements,
      teams,
      users
    RESTART IDENTITY CASCADE;
  `);
}

/** Useful when you want deterministic timestamps in inserts */
export const now = () => new Date();