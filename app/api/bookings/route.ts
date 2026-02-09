import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import { DateTime } from "luxon";

import { db } from "@/lib/db/drizzle";
import { bookings, lessonOffers, teacherAvailability } from "@/lib/db/schema";
import { getUser } from "@/lib/db/queries";

const bodySchema = z.object({
    teacherId: z.number().int().positive(),
    startUtc: z.string().min(1),
    endUtc: z.string().min(1),
});

const toUtcIso = (v: any) =>
    DateTime.fromJSDate(new Date(v as any)).toUTC().toISO()!;

const isIsoUtc = (v: string) => DateTime.fromISO(v, { zone: "utc" }).isValid;

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => {
    const as = DateTime.fromISO(aStart, { zone: "utc" });
    const ae = DateTime.fromISO(aEnd, { zone: "utc" });
    const bs = DateTime.fromISO(bStart, { zone: "utc" });
    const be = DateTime.fromISO(bEnd, { zone: "utc" });
    return as < be && ae > bs;
};

const diffMinutes = (startUtc: string, endUtc: string) => {
    const s = DateTime.fromISO(startUtc, { zone: "utc" });
    const e = DateTime.fromISO(endUtc, { zone: "utc" });
    return Math.round(e.diff(s, "minutes").minutes);
};

export const POST = async (req: Request) => {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid payload", details: parsed.error.flatten() },
            { status: 400 }
        );
    }

    const { teacherId, startUtc, endUtc } = parsed.data;

    if (!isIsoUtc(startUtc) || !isIsoUtc(endUtc)) {
        return NextResponse.json({ error: "Invalid ISO datetime (UTC expected)" }, { status: 400 });
    }

    const start = DateTime.fromISO(startUtc, { zone: "utc" });
    const end = DateTime.fromISO(endUtc, { zone: "utc" });

    if (end <= start) {
        return NextResponse.json({ error: "endUtc must be after startUtc" }, { status: 400 });
    }

    const durationMinutes = diffMinutes(startUtc, endUtc);

    // Fürs MVP: nur diese Durs erlauben (du kannst das erweitern)
    if (![30, 45, 60].includes(durationMinutes)) {
        return NextResponse.json({ error: "Invalid duration. Allowed: 30/45/60" }, { status: 400 });
    }

    // 1) Slot muss in teacher_availability liegen
    const availabilityRows = await db
        .select({
            id: teacherAvailability.id,
            startUtc: teacherAvailability.startUtc,
            endUtc: teacherAvailability.endUtc,
        })
        .from(teacherAvailability)
        .where(eq(teacherAvailability.teacherId, teacherId));

    const isInsideAvailability = availabilityRows.some((a) => {
        const aStart = DateTime.fromISO(toUtcIso(a.startUtc), { zone: "utc" });
        const aEnd = DateTime.fromISO(toUtcIso(a.endUtc), { zone: "utc" });
        return start >= aStart && end <= aEnd;
    });

    if (!isInsideAvailability) {
        return NextResponse.json({ error: "Slot is not available" }, { status: 409 });
    }

    // 2) Booking darf nicht überlappen (pending + paid blocken)
    const existing = await db
        .select({
            id: bookings.id,
            startUtc: bookings.startUtc,
            endUtc: bookings.endUtc,
            status: bookings.status,
        })
        .from(bookings)
        .where(
            and(
                eq(bookings.teacherId, teacherId),
                or(eq(bookings.status, "pending"), eq(bookings.status, "paid"))
            )
        );

    const isOverlapping = existing.some((b) => {
        const bStart = toUtcIso(b.startUtc);
        const bEnd = toUtcIso(b.endUtc);
        return overlaps(startUtc, endUtc, bStart, bEnd);
    });

    if (isOverlapping) {
        return NextResponse.json({ error: "Slot already booked" }, { status: 409 });
    }

    // 3) Preis/Currency aus lesson_offers ziehen (für genau diese Dauer)
    const [offer] = await db
        .select({
            priceCents: lessonOffers.priceCents,
            currency: lessonOffers.currency,
            isActive: lessonOffers.isActive,
        })
        .from(lessonOffers)
        .where(
            and(
                eq(lessonOffers.teacherId, teacherId),
                eq(lessonOffers.durationMinutes, durationMinutes),
                eq(lessonOffers.isActive, 1)
            )
        )
        .limit(1);

    if (!offer) {
        return NextResponse.json({ error: "No active offer for this duration" }, { status: 409 });
    }

    // 4) Insert booking (pending) – Stripe kommt als nächster Schritt
    const [created] = await db
        .insert(bookings)
        .values({
            teacherId,
            studentId: user.id,
            startUtc: new Date(startUtc),
            endUtc: new Date(endUtc),
            durationMinutes,
            priceCents: offer.priceCents,
            currency: offer.currency,
            status: "pending",
            updatedAt: new Date(),
        })
        .returning({ id: bookings.id });

    return NextResponse.json({
        ok: true,
        bookingId: created?.id,
        durationMinutes,
        priceCents: offer.priceCents,
        currency: offer.currency,
    });
};
