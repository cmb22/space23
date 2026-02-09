import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { and, eq, lt, gt, sql } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { teacherAvailability, lessonOffers } from "@/lib/db/schema";

type Slot = {
    startUtc: string;
    endUtc: string;
    durationMinutes: number;
};

type Interval = { startMs: number; endMs: number };

const parseIsoUtc = (v: string | null) => {
    if (!v) return null;
    const dt = DateTime.fromISO(v, { setZone: true }).toUTC();
    return dt.isValid ? dt : null;
};

const toMs = (v: unknown) => {
    // Drizzle might give Date or string depending on driver/config
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

const generateSlots = (intervals: Interval[], fromMs: number, toMs: number, durations: number[]) => {
    const START_GRID_MIN = 15; // allow 45
    const stepMs = START_GRID_MIN * 60_000;

    const durSet = durations.filter((d) => [30, 45, 60].includes(d));
    const out: Slot[] = [];
    const seen = new Set<string>();

    const key = (s: Slot) => `${s.startUtc}|${s.endUtc}|${s.durationMinutes}`;

    for (const it of intervals) {
        const start = Math.max(it.startMs, fromMs);
        const end = Math.min(it.endMs, toMs);
        if (end <= start) continue;

        let t = start;
        const mod = t % stepMs;
        if (mod !== 0) t += stepMs - mod;

        while (t < end) {
            for (const d of durSet) {
                const e = t + d * 60_000;
                if (e <= end) {
                    const slot: Slot = { startUtc: toIso(t), endUtc: toIso(e), durationMinutes: d };
                    const k = key(slot);
                    if (!seen.has(k)) {
                        seen.add(k);
                        out.push(slot);
                    }
                }
            }
            t += stepMs;
        }
    }

    out.sort((a, b) => a.startUtc.localeCompare(b.startUtc) || a.durationMinutes - b.durationMinutes);
    return out;
};

export async function GET(req: Request, ctx: { params: Promise<{ teacherId: string }> }) {
    const { teacherId: teacherIdRaw } = await ctx.params;
    const teacherId = Number(teacherIdRaw);

    if (!Number.isFinite(teacherId)) {
        return NextResponse.json({ error: "Invalid teacherId" }, { status: 400 });
    }

    const url = new URL(req.url);
    const fromIsoParam = url.searchParams.get("from");
    const toIsoParam = url.searchParams.get("to");

    const fromDt = parseIsoUtc(fromIsoParam);
    const toDt = parseIsoUtc(toIsoParam);

    if (!fromDt || !toDt) {
        return NextResponse.json({ error: "Missing/invalid from/to" }, { status: 400 });
    }

    const fromMs = fromDt.toMillis();
    const toMsVal = toDt.toMillis();

    if (toMsVal <= fromMs) {
        return NextResponse.json({ error: "Invalid range" }, { status: 400 });
    }

    // ---- DEBUG: confirm DB sees rows for this teacher
    const minMax = await db
        .select({
            minStart: sql`min(${teacherAvailability.startUtc})`.as("minStart"),
            maxEnd: sql`max(${teacherAvailability.endUtc})`.as("maxEnd"),
            cnt: sql`count(*)`.as("cnt"),
        })
        .from(teacherAvailability)
        .where(eq(teacherAvailability.teacherId, teacherId));

    const overlapRows = await db
        .select({
            startUtc: teacherAvailability.startUtc,
            endUtc: teacherAvailability.endUtc,
        })
        .from(teacherAvailability)
        .where(
            and(
                eq(teacherAvailability.teacherId, teacherId),
                lt(teacherAvailability.startUtc, toDt.toJSDate()),
                gt(teacherAvailability.endUtc, fromDt.toJSDate())
            )
        );

    // ---- offers
    const offers = await db
        .select({ durationMinutes: lessonOffers.durationMinutes })
        .from(lessonOffers)
        .where(and(eq(lessonOffers.teacherId, teacherId), eq(lessonOffers.isActive, 1)));

    const durations = offers.length ? offers.map((o) => o.durationMinutes) : [30, 45, 60];

    // build merged intervals from overlapRows
    const intervalsRaw: Interval[] = overlapRows
        .map((r) => ({
            startMs: toMs(r.startUtc),
            endMs: toMs(r.endUtc),
        }))
        .filter((i) => Number.isFinite(i.startMs) && Number.isFinite(i.endMs) && i.endMs > i.startMs);

    const merged = mergeIntervals(intervalsRaw);
    const slots = generateSlots(merged, fromMs, toMsVal, durations);

    return NextResponse.json({
        teacherId,
        fromIso: fromDt.toISO(),
        toIso: toDt.toISO(),
        debug: {
            envDbHint: process.env.POSTGRES_URL ? "POSTGRES_URL set" : "POSTGRES_URL missing",
            teacherAvailability_totalCount: Number(minMax?.[0]?.cnt ?? 0),
            teacherAvailability_minStart: minMax?.[0]?.minStart ?? null,
            teacherAvailability_maxEnd: minMax?.[0]?.maxEnd ?? null,
            overlapRowsCount: overlapRows.length,
            overlapRowsSample: overlapRows.slice(0, 3),
            offersDurations: durations,
        },
        count: slots.length,
        slots,
    });
}