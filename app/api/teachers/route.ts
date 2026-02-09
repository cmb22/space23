import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { users, teacherProfiles, lessonOffers } from "@/lib/db/schema";

export async function GET() {
    try {
        // Public endpoint: no auth
        // Return only teachers who have a profile row
        const rows = await db
            .select({
                id: users.id,
                name: users.name,
                email: users.email,

                bio: teacherProfiles.bio,
                languages: teacherProfiles.languages,
                timezone: teacherProfiles.timezone,
                currency: teacherProfiles.currency,
                avatarUrl: teacherProfiles.avatarUrl,
                videoUrl: teacherProfiles.videoUrl,
                videoSource: teacherProfiles.videoSource,

                // min active offer price
                fromPriceCents: sql<number>`MIN(${lessonOffers.priceCents})`.mapWith(Number),
            })
            .from(users)
            .innerJoin(teacherProfiles, eq(teacherProfiles.userId, users.id))
            .leftJoin(
                lessonOffers,
                and(eq(lessonOffers.teacherId, users.id), eq(lessonOffers.isActive, 1))
            )
            .where(eq(users.role, "teacher"))
            .groupBy(
                users.id,
                users.name,
                users.email,
                teacherProfiles.id,
                teacherProfiles.bio,
                teacherProfiles.languages,
                teacherProfiles.timezone,
                teacherProfiles.currency,
                teacherProfiles.avatarUrl,
                teacherProfiles.videoUrl,
                teacherProfiles.videoSource
            );

        // normalize: if no offers, MIN() becomes null
        const teachers = rows.map((t) => ({
            ...t,
            fromPriceCents: t.fromPriceCents ?? null,
        }));

        return NextResponse.json({ teachers });
    } catch (e: any) {
        return NextResponse.json(
            { error: e?.message || "Failed to load teachers" },
            { status: 500 }
        );
    }
}