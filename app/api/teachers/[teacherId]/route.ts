import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { users, teacherProfiles, lessonOffers } from "@/lib/db/schema";

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ teacherId: string }> }
) {
    const { teacherId } = await params;
    const id = Number(teacherId);

    if (!Number.isFinite(id)) {
        return NextResponse.json({ error: "Invalid teacherId" }, { status: 400 });
    }

    // Teacher-Grunddaten + Profil
    const rows = await db
        .select({
            user: users,
            profile: teacherProfiles,
        })
        .from(users)
        .leftJoin(teacherProfiles, eq(teacherProfiles.userId, users.id))
        .where(and(eq(users.id, id), eq(users.role, "teacher")))
        .limit(1);

    if (rows.length === 0) {
        return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    }

    const { user, profile } = rows[0];

    // Offers (nur active)
    const offersRaw = await db
        .select()
        .from(lessonOffers)
        .where(eq(lessonOffers.teacherId, id));

    const offers = offersRaw.map((o) => ({
        id: o.id,
        durationMinutes: o.durationMinutes,
        priceCents: o.priceCents,
        currency: o.currency,
        active: (o.isActive ?? 1) === 1,
    }));

    // public teacher object (was du im UI brauchst)
    const teacher = {
        id: user.id,
        name: user.name,
        email: user.email,
        bio: profile?.bio ?? null,
        languages: profile?.languages ?? [],
        timezone: profile?.timezone ?? "Europe/Berlin",
        currency: profile?.currency ?? "EUR",
        qualifications: profile?.qualifications ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
        videoUrl: profile?.videoUrl ?? null,
        videoSource: profile?.videoSource ?? "local",
    };

    return NextResponse.json({ teacher, offers });
}