// app/api/teachers/[teacherId]/availability/route.ts

import { NextResponse } from "next/server";
import { and, eq, lt, gt } from "drizzle-orm";
import { DateTime } from "luxon";

import { db } from "@/lib/db/drizzle";
import { teacherAvailability } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";

type Interval = { startMs: number; endMs: number };

const parseIsoUtc = (v: string | null) => {
    if (!v) return null;
    const dt = DateTime.fromISO(v, { setZone: true }).toUTC();
    return dt.isValid ? dt : null;
};

const toMs = (v: unknown) => {
    if (v instanceof Date) return DateTime.fromJSDate(v).toUTC().toMillis();
    if (typeof v === "string") return DateTime.fromISO(v, { setZone: true }).toUTC().toMillis();
    return NaN;
};

const toIso = (ms: number) => new Date(ms).toISOString();

const mergeIntervals = (rows: Interval[]) => {
    if (rows.length === 0) return [];
    const sorted = [...rows].sort((a, b) => a.startMs - b.startMs);
    const out: Interval[] = [{ ...sorted[0] }];

    for (let i = 1; i < sorted.length; i++) {
        const prev = out[out.length - 1];
        const cur = sorted[i];
        if (cur.startMs <= prev.endMs) prev.endMs = Math.max(prev.endMs, cur.endMs);
        else out.push({ ...cur });
    }
    return out;
};

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

/**
 * Parses merged event ids from GET.
 * Supports:
 *  - "teacherId:startIso:endIso"  (legacy)
 *  - "teacherId|startIso|endIso"  (preferred if you switch later)
 *
 * IMPORTANT: ISO contains ":" so we MUST NOT split by ":".
 */
const parseMergedEventId = (eventId: string) => {
    const raw = String(eventId);

    // Preferred pipe format
    if (raw.includes("|")) {
        const [tid, startIso, endIso] = raw.split("|");
        const teacherId = Number(tid);
        if (!Number.isFinite(teacherId)) return null;

        const from = parseIsoUtc(startIso ?? null);
        const to = parseIsoUtc(endIso ?? null);
        if (!from || !to || to <= from) return null;

        return { teacherId, from, to };
    }

    // Legacy colon format: "2:...Z:...Z"
    // Use non-greedy match to stop at the first "Z" for start.
    const m = raw.match(/^(\d+):(.+?Z):(.+?Z)$/);
    if (!m) return null;

    const teacherId = Number(m[1]);
    if (!Number.isFinite(teacherId)) return null;

    const from = parseIsoUtc(m[2]);
    const to = parseIsoUtc(m[3]);
    if (!from || !to || to <= from) return null;

    return { teacherId, from, to };
};

export async function GET(req: Request, ctx: { params: Promise<{ teacherId: string }> }) {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { teacherId: raw } = await ctx.params;
    const teacherId = Number(raw);
    if (!Number.isFinite(teacherId)) return NextResponse.json({ error: "Invalid teacherId" }, { status: 400 });

    // teacher-only
    if (user.id !== teacherId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const fromIso = url.searchParams.get("from");
    const toIsoVar = url.searchParams.get("to");
    const mode = (url.searchParams.get("mode") ?? "merged").toLowerCase();

    const from = parseIsoUtc(fromIso);
    const to = parseIsoUtc(toIsoVar);
    if (!from || !to) return NextResponse.json({ error: "Missing/invalid from/to" }, { status: 400 });
    if (to <= from) return NextResponse.json({ error: "Invalid range" }, { status: 400 });

    const rows = await db
        .select()
        .from(teacherAvailability)
        .where(
            and(
                eq(teacherAvailability.teacherId, teacherId),
                lt(teacherAvailability.startUtc, to.toJSDate()),
                gt(teacherAvailability.endUtc, from.toJSDate())
            )
        )
        .orderBy(teacherAvailability.startUtc);

    if (mode === "atomic") {
        return NextResponse.json(rows);
    }

    const intervalsRaw: Interval[] = rows
        .map((r) => ({ startMs: toMs(r.startUtc), endMs: toMs(r.endUtc) }))
        .filter((i) => Number.isFinite(i.startMs) && Number.isFinite(i.endMs) && i.endMs > i.startMs);

    const merged = mergeIntervals(intervalsRaw);

    const events = merged.map((m) => {
        const start = toIso(m.startMs);
        const end = toIso(m.endMs);

        // Keep legacy ":" format for now (client already uses it)
        // If you later want: const id = `${teacherId}|${start}|${end}`;
        const id = `${teacherId}:${start}:${end}`;

        return {
            id,
            start,
            end,
            title: "Available",
            display: "block",
        };
    });

    return NextResponse.json({ teacherId, count: events.length, events });
}

export async function POST(req: Request, ctx: { params: Promise<{ teacherId: string }> }) {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { teacherId: raw } = await ctx.params;
    const teacherId = Number(raw);
    if (!Number.isFinite(teacherId)) return NextResponse.json({ error: "Invalid teacherId" }, { status: 400 });

    if (user.id !== teacherId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const startUtc = body?.startUtc;
    const endUtc = body?.endUtc;

    if (!startUtc || !endUtc) return NextResponse.json({ error: "Missing startUtc/endUtc" }, { status: 400 });

    const slots = splitIntoGridSlots(startUtc, endUtc);
    if (slots.length === 0) return NextResponse.json({ error: "Empty selection" }, { status: 400 });

    await db.transaction(async (tx) => {
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

    // A) atomic delete by id
    const idRaw = url.searchParams.get("id");
    if (idRaw) {
        const id = Number(idRaw);
        if (!Number.isFinite(id)) return NextResponse.json({ error: "Missing/invalid id" }, { status: 400 });

        await db
            .delete(teacherAvailability)
            .where(and(eq(teacherAvailability.teacherId, teacherId), eq(teacherAvailability.id, id)));

        return NextResponse.json({ ok: true, deleted: 1, mode: "atomic" });
    }

    // B) delete merged block by eventId
    const eventId = url.searchParams.get("eventId");
    if (eventId) {
        const parsed = parseMergedEventId(eventId);
        if (!parsed) return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });

        if (parsed.teacherId !== teacherId) {
            return NextResponse.json({ error: "eventId teacherId mismatch" }, { status: 400 });
        }

        const deleted = await db
            .delete(teacherAvailability)
            .where(
                and(
                    eq(teacherAvailability.teacherId, teacherId),
                    lt(teacherAvailability.startUtc, parsed.to.toJSDate()),
                    gt(teacherAvailability.endUtc, parsed.from.toJSDate())
                )
            )
            .returning({ id: teacherAvailability.id });

        return NextResponse.json({ ok: true, deleted: deleted.length, mode: "eventId" });
    }

    // C) fallback range delete by from/to
    const fromIso = url.searchParams.get("from");
    const toIsoVar = url.searchParams.get("to");
    const from = parseIsoUtc(fromIso);
    const to = parseIsoUtc(toIsoVar);

    if (!from || !to) return NextResponse.json({ error: "Missing/invalid from/to" }, { status: 400 });
    if (to <= from) return NextResponse.json({ error: "Invalid range" }, { status: 400 });

    const deleted = await db
        .delete(teacherAvailability)
        .where(
            and(
                eq(teacherAvailability.teacherId, teacherId),
                lt(teacherAvailability.startUtc, to.toJSDate()),
                gt(teacherAvailability.endUtc, from.toJSDate())
            )
        )
        .returning({ id: teacherAvailability.id });

    return NextResponse.json({ ok: true, deleted: deleted.length, mode: "range" });
}