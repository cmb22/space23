import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { and, eq, lt, gt } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { teacherAvailability, teacherProfiles } from "@/lib/db/schema";

const BLOCKS = [
    { key: "6-12", startHour: 6, endHour: 12 },
    { key: "13-18", startHour: 13, endHour: 18 },
    { key: "18-00", startHour: 18, endHour: 24 },
    { key: "00-06", startHour: 0, endHour: 6 },
] as const;

type BlockKey = (typeof BLOCKS)[number]["key"];

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
    Math.max(aStart, bStart) < Math.min(aEnd, bEnd);

const startOfIsoWeek = (dt: DateTime) => dt.startOf("day").minus({ days: dt.weekday - 1 }); // Mon start
const clampToDay = (dt: DateTime) => dt.startOf("day");

const parseIsoOrNull = (v: string | null) => {
    if (!v) return null;
    const d = DateTime.fromISO(v, { setZone: true });
    return d.isValid ? d : null;
};

export const GET = async (req: Request, ctx: { params: Promise<{ teacherId: string }> }) => {
    try {
        const { teacherId } = await ctx.params;
        const id = Number(teacherId);
        if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid teacherId" }, { status: 400 });

        const [profile] = await db
            .select({ timezone: teacherProfiles.timezone })
            .from(teacherProfiles)
            .where(eq(teacherProfiles.userId, id))
            .limit(1);

        const tz = profile?.timezone || "Europe/Berlin";

        const url = new URL(req.url);
        const qFrom = parseIsoOrNull(url.searchParams.get("from"));
        const qTo = parseIsoOrNull(url.searchParams.get("to"));

        const nowTz = DateTime.now().setZone(tz);
        const weekStart = qFrom ? clampToDay(qFrom.setZone(tz)) : startOfIsoWeek(nowTz);
        const weekEndExclusive = qTo ? clampToDay(qTo.setZone(tz)).plus({ days: 1 }) : weekStart.plus({ days: 7 });

        const days = Array.from({ length: 7 }).map((_, i) => weekStart.plus({ days: i }));

        const fromUtc = weekStart.toUTC();
        const toUtc = weekEndExclusive.toUTC();

        const rows = await db
            .select({ startUtc: teacherAvailability.startUtc, endUtc: teacherAvailability.endUtc })
            .from(teacherAvailability)
            .where(
                and(
                    eq(teacherAvailability.teacherId, id),
                    lt(teacherAvailability.startUtc, fromUtc.toJSDate() as any) ? undefined : undefined
                )
            );

        // drizzle-orm doesn't like undefined fragments in some setups, so do a clean where:
        const avail = await db
            .select({ startUtc: teacherAvailability.startUtc, endUtc: teacherAvailability.endUtc })
            .from(teacherAvailability)
            .where(
                and(
                    eq(teacherAvailability.teacherId, id),
                    lt(teacherAvailability.startUtc, toUtc.toJSDate()),
                    gt(teacherAvailability.endUtc, fromUtc.toJSDate())
                )
            );

        const grid: Record<BlockKey, boolean[]> = {
            "6-12": Array(7).fill(false),
            "13-18": Array(7).fill(false),
            "18-00": Array(7).fill(false),
            "00-06": Array(7).fill(false),
        };

        for (const r of avail) {
            const startLocal = DateTime.fromJSDate(new Date(r.startUtc as any), { zone: "utc" }).setZone(tz);
            const endLocal = DateTime.fromJSDate(new Date(r.endUtc as any), { zone: "utc" }).setZone(tz);

            const col = Math.floor(startLocal.startOf("day").diff(weekStart, "days").days);
            if (col < 0 || col > 6) continue;

            const startMin = startLocal.hour * 60 + startLocal.minute;
            const endMin = endLocal.hour * 60 + endLocal.minute;

            for (const b of BLOCKS) {
                const bStart = b.startHour * 60;
                const bEnd = b.endHour * 60;
                if (overlaps(startMin, endMin, bStart, bEnd)) grid[b.key][col] = true;
            }
        }

        return NextResponse.json({
            timezone: tz,
            monthLabel: weekStart.toFormat("LLLL yyyy"),
            dayNumbers: days.map((d) => Number(d.toFormat("d"))),
            grid,
            range: { fromLocal: weekStart.toISO(), toLocalExclusive: weekEndExclusive.toISO() },
        });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "Failed to build availability preview" }, { status: 500 });
    }
};