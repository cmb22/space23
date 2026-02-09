import { NextResponse } from "next/server";
import { z } from "zod";
import { DateTime } from "luxon";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { availabilityRules, availabilityOverrides } from "@/lib/db/schema";

const createRuleSchema = z.object({
    weekday: z.number().int().min(0).max(6),     // 0=Sun..6=Sat
    startMin: z.number().int().min(0).max(24 * 60),
    endMin: z.number().int().min(0).max(24 * 60),
    timezone: z.string().min(1).default("Europe/Berlin"),
});

async function insertMergedAvailabilityBlock(args: {
    teacherId: number;
    startUtc: Date;
    endUtc: Date;
}) {
    const { teacherId, startUtc, endUtc } = args;

    const startMs = startUtc.getTime();
    const endMs = endUtc.getTime();

    // merge touching/overlap blocks of kind='add' (our “availability” blocks)
    const whereTouching = and(
        eq(availabilityOverrides.teacherId, teacherId),
        eq(availabilityOverrides.kind, "add"),
        sql`extract(epoch from ${availabilityOverrides.startUtc}) * 1000 <= ${endMs}`,
        sql`extract(epoch from ${availabilityOverrides.endUtc}) * 1000 >= ${startMs}`
    );

    const existing = await db.select().from(availabilityOverrides).where(whereTouching);

    let mergedStart = startUtc;
    let mergedEnd = endUtc;

    for (const o of existing) {
        const oStart = o.startUtc instanceof Date ? o.startUtc : new Date(o.startUtc as any);
        const oEnd = o.endUtc instanceof Date ? o.endUtc : new Date(o.endUtc as any);
        if (oStart < mergedStart) mergedStart = oStart;
        if (oEnd > mergedEnd) mergedEnd = oEnd;
    }

    if (existing.length > 0) {
        await db.delete(availabilityOverrides).where(whereTouching);
    }

    await db.insert(availabilityOverrides).values({
        teacherId,
        kind: "add",
        startUtc: mergedStart,
        endUtc: mergedEnd,
    });
}

export async function POST(req: Request, ctx: { params: Promise<{ teacherId: string }> }) {
    const { teacherId: raw } = await ctx.params;
    const teacherId = Number(raw);
    if (!Number.isFinite(teacherId)) {
        return NextResponse.json({ error: "Invalid teacherId" }, { status: 400 });
    }

    const body = createRuleSchema.parse(await req.json());
    if (body.endMin <= body.startMin) {
        return NextResponse.json({ error: "endMin must be > startMin" }, { status: 400 });
    }

    // fixed horizon: next 3 months
    const tz = body.timezone || "Europe/Berlin";
    const validFromUtc = DateTime.utc();
    const validToUtc = validFromUtc.plus({ months: 3 });

    const [rule] = await db
        .insert(availabilityRules)
        .values({
            teacherId,
            weekday: body.weekday,
            startMin: body.startMin,
            endMin: body.endMin,
            timezone: tz,
            validFrom: validFromUtc.toJSDate(),
            validTo: validToUtc.toJSDate(),
        })
        .returning();

    // Expand: iterate days in teacher TZ
    let day = validFromUtc.setZone(tz).startOf("day");
    const endDay = validToUtc.setZone(tz).startOf("day");

    while (day <= endDay) {
        const weekday0 = day.weekday % 7; // Luxon: 1=Mon..7=Sun → %7 gives Sun=0
        if (weekday0 === body.weekday) {
            const startLocal = day.plus({ minutes: body.startMin });
            const endLocal = day.plus({ minutes: body.endMin });

            await insertMergedAvailabilityBlock({
                teacherId,
                startUtc: startLocal.toUTC().toJSDate(),
                endUtc: endLocal.toUTC().toJSDate(),
            });
        }
        day = day.plus({ days: 1 });
    }

    return NextResponse.json({ rule, expanded: true }, { status: 201 });
}