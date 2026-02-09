import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { teacherProfiles } from "@/lib/db/schema";
import { getUser } from "@/lib/db/queries";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: Request) {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
        return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    if (!ALLOWED.has(file.type)) {
        return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: "File too large" }, { status: 400 });
    }

    // file -> buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // extension
    const ext =
        file.type === "image/jpeg" ? "jpg" :
            file.type === "image/png" ? "png" :
                "webp";

    const filename = `${user.id}-${randomUUID()}.${ext}`;

    // store under public/uploads/avatars
    const relUrl = `/uploads/avatars/${filename}`;
    const absPath = path.join(process.cwd(), "public", "uploads", "avatars", filename);

    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, buffer);

    // upsert profile row if missing
    const existing = await db
        .select({ id: teacherProfiles.id })
        .from(teacherProfiles)
        .where(eq(teacherProfiles.userId, user.id))
        .limit(1);

    if (existing.length) {
        await db
            .update(teacherProfiles)
            .set({ avatarUrl: relUrl, updatedAt: new Date() })
            .where(eq(teacherProfiles.userId, user.id));
    } else {
        await db.insert(teacherProfiles).values({
            userId: user.id,
            avatarUrl: relUrl,
            timezone: "Europe/Berlin",
            currency: "EUR",
            languages: [],
            videoSource: "local",
            updatedAt: new Date(),
        });
    }

    return NextResponse.json({ ok: true, avatarUrl: relUrl }, { status: 201 });
}