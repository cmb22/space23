import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { touch } from "@/lib/db/timestamps";
import { db } from "@/lib/db/drizzle";
import { lessonOffers, teacherProfiles } from "@/lib/db/schema";
import { getUser } from "@/lib/db/queries";

const offerSchema = z.object({
    durationMinutes: z.number().int().refine((v) => [30, 45, 60].includes(v)),
    priceCents: z.number().int().min(0),
    currency: z.string().min(1).max(3).default("EUR"),
    active: z.boolean().default(true),
});

const upsertSchema = z.object({
    bio: z.string().max(2000).optional().nullable(),
    languages: z.array(z.string().min(1)).default([]),
    timezone: z.string().min(1).default("Europe/Berlin"),
    currency: z.string().min(1).max(3).default("EUR"),
    qualifications: z.string().max(2000).optional().nullable(),
    offers: z.array(offerSchema).default([]),
});

export async function GET() {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [profile] = await db
        .select()
        .from(teacherProfiles)
        .where(eq(teacherProfiles.userId, user.id))
        .limit(1);

    const offersRaw = await db
        .select()
        .from(lessonOffers)
        .where(eq(lessonOffers.teacherId, user.id));

    const offers = offersRaw.map((o) => ({
        id: o.id,
        durationMinutes: o.durationMinutes,
        priceCents: o.priceCents,
        currency: o.currency,
        active: (o.isActive ?? 1) === 1
    }));

    return NextResponse.json({ profile: profile ?? null, offers });
}

export async function PUT(req: Request) {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = upsertSchema.parse(await req.json());

    // Upsert teacher profile (DB key is user_id)
    const [existing] = await db
        .select({ id: teacherProfiles.id })
        .from(teacherProfiles)
        .where(eq(teacherProfiles.userId, user.id))
        .limit(1);

    if (existing) {
        await db
            .update(teacherProfiles)
            .set({
                bio: body.bio ?? null,
                languages: body.languages,
                timezone: body.timezone,
                currency: body.currency,
                qualifications: body.qualifications ?? null,
                updatedAt: new Date(),
            })
            .where(eq(teacherProfiles.userId, user.id));
    } else {
        await db.insert(teacherProfiles).values({
            userId: user.id,
            bio: body.bio ?? null,
            languages: body.languages,
            timezone: body.timezone,
            currency: body.currency,
            qualifications: body.qualifications ?? null,
            updatedAt: new Date(),
        });
    }

    // Replace offers (MVP) — DB key is teacher_id
    await db.delete(lessonOffers).where(eq(lessonOffers.teacherId, user.id));

    if (body.offers.length > 0) {
        await db.insert(lessonOffers).values(
            body.offers.map((o) => ({
                teacherId: user.id,
                durationMinutes: o.durationMinutes,
                priceCents: o.priceCents,
                currency: o.currency,
                isActive: o.active ? 1 : 0, // DB: int 1/0
                updatedAt: new Date(),
            }))
        );
    }

    return NextResponse.json({ ok: true });
}