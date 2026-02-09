import { db } from "@/lib/db/drizzle";
import { users, lessonOffers, teacherAvailability, bookings } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { DateTime } from "luxon";

type Role = "teacher" | "student";

export async function ensureUser(params: {
    email: string;
    role: Role;
    passwordHash?: string;
    name?: string | null;
}) {
    const email = params.email.toLowerCase().trim();

    const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

    if (existing[0]) return existing[0];

    const [created] = await db
        .insert(users)
        .values({
            email,
            role: params.role,
            name: params.name ?? null,
            passwordHash: params.passwordHash ?? "$2b$10$testtesttesttesttesttesttesttesttesttesttest", // ok für Tests
            createdAt: new Date(),
            updatedAt: new Date(),
        })
        .returning();

    return created;
}

export async function seedOffer(params: {
    teacherId: number;
    durationMinutes: number;
    priceCents?: number;
    currency?: string;
    isActive?: 0 | 1;
}) {
    // FK-sicher: teacher muss existieren
    const teacher = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, params.teacherId))
        .limit(1);

    if (!teacher[0]) {
        throw new Error(`seedOffer: teacherId ${params.teacherId} does not exist in users`);
    }

    const [row] = await db
        .insert(lessonOffers)
        .values({
            teacherId: params.teacherId,
            durationMinutes: params.durationMinutes,
            priceCents: params.priceCents ?? 3000,
            currency: params.currency ?? "EUR",
            isActive: params.isActive ?? 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        })
        .returning();

    return row;
}

/**
 * Seedet 30-min atomare Availability Rows.
 * startUtcIso muss UTC ISO sein (z.B. 2026-02-11T04:00:00.000Z)
 */
export async function seedAvailability30(params: {
    teacherId: number;
    startUtcIso: string;
    blocks: number; // Anzahl 30-min Blöcke
    source?: "manual" | "rule";
}) {
    const start = DateTime.fromISO(params.startUtcIso, { zone: "utc" });
    if (!start.isValid) throw new Error("seedAvailability30: invalid startUtcIso");

    const rows = [];
    for (let i = 0; i < params.blocks; i++) {
        const s = start.plus({ minutes: 30 * i });
        const e = s.plus({ minutes: 30 });
        rows.push({
            teacherId: params.teacherId,
            startUtc: s.toJSDate(),
            endUtc: e.toJSDate(),
            source: params.source ?? "manual",
            createdAt: new Date(),
        });
    }

    const inserted = await db.insert(teacherAvailability).values(rows).returning();
    return inserted;
}

export async function seedAvailability(params: {
    teacherId: number;
    startUtc: string; // ISO UTC
    endUtc: string;   // ISO UTC
    source?: "manual" | "rule";
}) {
    const start = DateTime.fromISO(params.startUtc, { zone: "utc" });
    const end = DateTime.fromISO(params.endUtc, { zone: "utc" });

    if (!start.isValid || !end.isValid) {
        throw new Error("seedAvailability: invalid startUtc/endUtc");
    }
    if (end <= start) {
        throw new Error("seedAvailability: endUtc must be after startUtc");
    }

    const minutes = Math.round(end.diff(start, "minutes").minutes);
    if (minutes % 30 !== 0) {
        throw new Error("seedAvailability: interval must be multiple of 30 minutes");
    }

    const blocks = minutes / 30;
    return seedAvailability30({
        teacherId: params.teacherId,
        startUtcIso: start.toISO()!,
        blocks,
        source: params.source ?? "manual",
    });
}

export async function seedBooking(params: {
    teacherId: number;
    studentId: number;
    startUtcIso: string;
    durationMinutes: 30 | 60;
    status: "pending" | "paid" | "canceled" | "refunded";
    priceCents?: number;
    currency?: string;
    stripeCheckoutSessionId?: string | null;
    stripePaymentIntentId?: string | null;
}) {
    // FK safe: teacher + student must exist
    const t = await db.select({ id: users.id }).from(users).where(eq(users.id, params.teacherId)).limit(1);
    const s = await db.select({ id: users.id }).from(users).where(eq(users.id, params.studentId)).limit(1);
    if (!t[0]) throw new Error(`seedBooking: teacherId ${params.teacherId} missing`);
    if (!s[0]) throw new Error(`seedBooking: studentId ${params.studentId} missing`);

    const start = DateTime.fromISO(params.startUtcIso, { zone: "utc" });
    if (!start.isValid) throw new Error("seedBooking: invalid startUtcIso");

    const end = start.plus({ minutes: params.durationMinutes });

    const [row] = await db
        .insert(bookings)
        .values({
            teacherId: params.teacherId,
            studentId: params.studentId,
            startUtc: start.toJSDate(),
            endUtc: end.toJSDate(),
            durationMinutes: params.durationMinutes,
            priceCents: params.priceCents ?? (params.durationMinutes === 60 ? 6000 : 3000),
            currency: params.currency ?? "EUR",
            status: params.status,
            stripeCheckoutSessionId: params.stripeCheckoutSessionId ?? null,
            stripePaymentIntentId: params.stripePaymentIntentId ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
        })
        .returning();

    return row;
}

export async function clearTeacherData(teacherId: number) {
    // optional helper, falls du in beforeEach/afterEach aufräumen willst
    await db.delete(teacherAvailability).where(eq(teacherAvailability.teacherId, teacherId));
    await db.delete(lessonOffers).where(eq(lessonOffers.teacherId, teacherId));
}

export async function clearBookingsForStudent(studentId: number) {
    await db.delete(bookings).where(eq(bookings.studentId, studentId));
}

export async function clearTeacherAvailabilityForTeacher(teacherId: number) {
    await db.delete(teacherAvailability).where(eq(teacherAvailability.teacherId, teacherId));
}