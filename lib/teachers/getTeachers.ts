import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { users, teacherProfiles, lessonOffers } from "@/lib/db/schema";

type TeacherRow = {
    id: number;
    name: string | null;
    email: string;
    bio: string | null;
    languages: string[];
    timezone: string;
    currency: string;
    avatarUrl: string | null;
    videoUrl: string | null;
    videoSource: string | null;
    fromPriceCents: number | null;
};
type TeachersResponse = {
    teachers: TeacherRow[];
};

export async function getTeachers(): Promise<TeacherRow[] | Error> {
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
        console.log("teachers", teachers);
        return teachers;
    } catch (e: any) {
        return new Error(
            "Failed to load teachers"
        );
    }
}