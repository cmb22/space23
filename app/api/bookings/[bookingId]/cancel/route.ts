// app/api/bookings/cancel/route.ts
import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { bookings, teacherAvailability } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";

const GRID_MINUTES = 30;

function buildAtomicStarts(startUtc: Date, endUtc: Date): Date[] {
    const start = DateTime.fromJSDate(startUtc).toUTC();
    const end = DateTime.fromJSDate(endUtc).toUTC();

    const diff = end.diff(start, "minutes").minutes;
    if (!Number.isFinite(diff) || diff <= 0) return [];
    if (diff % GRID_MINUTES !== 0) return [];

    const blocks = diff / GRID_MINUTES;
    const out: Date[] = [];
    for (let i = 0; i < blocks; i++) {
        out.push(start.plus({ minutes: GRID_MINUTES * i }).toJSDate());
    }
    return out;
}

/**
 * POST /api/bookings/cancel
 * Body: { bookingId: number }
 *
 * Behavior:
 * - Auth required (student)
 * - Only the booking owner (studentId) can cancel
 * - If pending -> mark canceled AND restore missing 30-min teacher_availability rows
 * - If already canceled -> idempotent ok
 * - If paid/refunded -> 400 (cannot cancel here; later you can add refund flow)
 */
export async function POST(req: Request) {
    const user = await requireUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const bookingId = Number(body?.bookingId);

    if (!Number.isFinite(bookingId)) {
        return NextResponse.json({ error: "Missing/invalid bookingId" }, { status: 400 });
    }

    try {
        const result = await db.transaction(async (tx) => {
            const [b] = await tx
                .select()
                .from(bookings)
                .where(and(eq(bookings.id, bookingId), eq(bookings.studentId, user.id)))
                .limit(1);

            if (!b) {
                return { kind: "not_found" as const };
            }

            if (b.status === "paid" || b.status === "refunded") {
                return { kind: "cannot_cancel" as const, status: b.status };
            }

            if (b.status === "canceled") {
                // idempotent: ensure availability exists (safe restore)
            } else {
                await tx
                    .update(bookings)
                    .set({ status: "canceled", updatedAt: new Date() })
                    .where(eq(bookings.id, b.id));
            }

            const requiredStarts = buildAtomicStarts(b.startUtc as any, b.endUtc as any);
            if (requiredStarts.length === 0) {
                return { kind: "ok" as const, restored: 0, note: "No atomic slots to restore" };
            }

            // Find which atomic rows already exist (avoid duplicates)
            const existing = await tx
                .select({ startUtc: teacherAvailability.startUtc })
                .from(teacherAvailability)
                .where(and(eq(teacherAvailability.teacherId, b.teacherId), inArray(teacherAvailability.startUtc, requiredStarts)));

            const existingSet = new Set(
                existing.map((r) => new Date(r.startUtc as any).toISOString())
            );

            const rowsToInsert = requiredStarts
                .filter((d) => !existingSet.has(d.toISOString()))
                .map((startDate) => {
                    const s = DateTime.fromJSDate(startDate).toUTC();
                    const e = s.plus({ minutes: GRID_MINUTES });
                    return {
                        teacherId: b.teacherId,
                        startUtc: s.toJSDate(),
                        endUtc: e.toJSDate(),
                        source: "manual" as const,
                        createdAt: new Date(),
                    };
                });

            if (rowsToInsert.length) {
                await tx.insert(teacherAvailability).values(rowsToInsert);
            }

            return { kind: "ok" as const, restored: rowsToInsert.length };
        });

        if (result.kind === "not_found") {
            return NextResponse.json({ error: "Booking not found" }, { status: 404 });
        }

        if (result.kind === "cannot_cancel") {
            return NextResponse.json({ error: `Cannot cancel booking with status ${result.status}` }, { status: 400 });
        }

        return NextResponse.json({ ok: true, restored: result.restored });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "Cancel failed" }, { status: 500 });
    }
}