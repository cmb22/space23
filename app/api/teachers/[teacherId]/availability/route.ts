import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { DateTime } from "luxon";

import { db } from "@/lib/db/drizzle";
import { teacherAvailability } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";

const GRID_MINUTES = 30;

const roundDownToGrid = (dt: DateTime) => {
    const m = dt.minute - (dt.minute % GRID_MINUTES);
    return dt.set({ minute: m, second: 0, millisecond: 0 });
};

const splitIntoGridSlots = (startUtcIso: string, endUtcIso: string) => {
    const out: { startUtc: Date; endUtc: Date }[] = [];

    let start = DateTime.fromISO(startUtcIso, { zone: "utc" });
    let end = DateTime.fromISO(endUtcIso, { zone: "utc" });

    if (!start.isValid || !end.isValid) return out;
    if (end <= start) return out;

    // normalize to grid
    start = roundDownToGrid(start);
    end = end.set({ second: 0, millisecond: 0 });

    let t = start;
    while (t.plus({ minutes: GRID_MINUTES }) <= end) {
        out.push({
            startUtc: t.toJSDate(),
            endUtc: t.plus({ minutes: GRID_MINUTES }).toJSDate(),
        });
        t = t.plus({ minutes: GRID_MINUTES });
    }

    return out;
};

export async function GET(req: Request, ctx: { params: Promise<{ teacherId: string }> }) {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { teacherId: raw } = await ctx.params;
    const teacherId = Number(raw);
    if (!Number.isFinite(teacherId)) return NextResponse.json({ error: "Invalid teacherId" }, { status: 400 });

    // (optional) teacher-only access; remove if you want public availability fetch
    if (user.id !== teacherId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const fromIso = url.searchParams.get("from");
    const toIso = url.searchParams.get("to");
    if (!fromIso || !toIso) return NextResponse.json({ error: "Missing from/to" }, { status: 400 });

    const from = DateTime.fromISO(fromIso, { zone: "utc" });
    const to = DateTime.fromISO(toIso, { zone: "utc" });
    if (!from.isValid || !to.isValid || to <= from) return NextResponse.json({ error: "Invalid range" }, { status: 400 });

    const rows = await db
        .select()
        .from(teacherAvailability)
        .where(eq(teacherAvailability.teacherId, teacherId));

    // quick filter in memory (fine for MVP)
    const out = rows
        .filter((r) => {
            const s = DateTime.fromJSDate(r.startUtc as any).toUTC();
            const e = DateTime.fromJSDate(r.endUtc as any).toUTC();
            return e > from && s < to;
        })
        .sort((a, b) => new Date(a.startUtc as any).toISOString().localeCompare(new Date(b.startUtc as any).toISOString()));

    return NextResponse.json(out);
}

export async function POST(req: Request, ctx: { params: Promise<{ teacherId: string }> }) {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { teacherId: raw } = await ctx.params;
    const teacherId = Number(raw);
    if (!Number.isFinite(teacherId)) return NextResponse.json({ error: "Invalid teacherId" }, { status: 400 });

    // teacher-only
    if (user.id !== teacherId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const startUtc = body?.startUtc;
    const endUtc = body?.endUtc;

    if (!startUtc || !endUtc) return NextResponse.json({ error: "Missing startUtc/endUtc" }, { status: 400 });

    const slots = splitIntoGridSlots(startUtc, endUtc);
    if (slots.length === 0) return NextResponse.json({ error: "Empty selection" }, { status: 400 });

    await db.transaction(async (tx) => {
        // insert all (ignore duplicates by checking first)
        for (const s of slots) {
            const existing = await tx
                .select({ id: teacherAvailability.id })
                .from(teacherAvailability)
                .where(
                    and(
                        eq(teacherAvailability.teacherId, teacherId),
                        eq(teacherAvailability.startUtc, s.startUtc),
                        eq(teacherAvailability.endUtc, s.endUtc)
                    )
                )
                .limit(1);

            if (existing.length === 0) {
                await tx.insert(teacherAvailability).values({
                    teacherId,
                    startUtc: s.startUtc,
                    endUtc: s.endUtc,
                });
            }
        }
    });

    return NextResponse.json({ ok: true, inserted: slots.length });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ teacherId: string }> }) {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { teacherId: raw } = await ctx.params;
    const teacherId = Number(raw);
    if (!Number.isFinite(teacherId)) return NextResponse.json({ error: "Invalid teacherId" }, { status: 400 });

    if (user.id !== teacherId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const idRaw = url.searchParams.get("id");
    const id = Number(idRaw);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Missing/invalid id" }, { status: 400 });

    await db.delete(teacherAvailability).where(and(eq(teacherAvailability.teacherId, teacherId), eq(teacherAvailability.id, id)));
    return NextResponse.json({ ok: true });
}