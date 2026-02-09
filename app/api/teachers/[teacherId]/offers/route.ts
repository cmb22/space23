import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/drizzle";
import { lessonOffers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const createOfferSchema = z.object({
    durationMinutes: z.number().int().refine((n) => [30, 45, 60].includes(n)),
    priceCents: z.number().int().min(0),
    currency: z.string().length(3).default("EUR"),
});

export async function GET(
    _req: Request,
    ctx: { params: Promise<{ teacherId: string }> }
) {
    const { teacherId: teacherIdRaw } = await ctx.params;
    const teacherId = Number(teacherIdRaw);

    if (!Number.isFinite(teacherId)) {
        return NextResponse.json({ error: "Invalid teacherId" }, { status: 400 });
    }

    const rows = await db
        .select()
        .from(lessonOffers)
        .where(eq(lessonOffers.teacherId, teacherId));

    return NextResponse.json(rows);
}

export async function POST(req: Request, { params }: { params: { teacherId: string } }) {
    const teacherId = Number(params.teacherId);
    const body = await req.json();
    const data = createOfferSchema.parse(body);

    const [created] = await db
        .insert(lessonOffers)
        .values({ teacherId, ...data })
        .returning();

    return NextResponse.json(created, { status: 201 });
}