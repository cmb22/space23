import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { teacherProfiles } from "@/lib/db/schema";
import { getUser } from "@/lib/db/queries";

export const runtime = "nodejs";

const MAX_BYTES = 200 * 1024 * 1024; // 200MB
const ALLOWED_MIME = new Set(["video/mp4", "video/webm", "video/quicktime"]);

function extFromMime(mime: string) {
    if (mime === "video/mp4") return "mp4";
    if (mime === "video/webm") return "webm";
    if (mime === "video/quicktime") return "mov";
    return "bin";
}

export async function POST(req: Request) {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });

    if (!ALLOWED_MIME.has(file.type)) {
        return NextResponse.json({ error: `Unsupported video type: ${file.type}` }, { status: 400 });
    }
    if (file.size <= 0) return NextResponse.json({ error: "Empty file" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large" }, { status: 413 });

    const filename = `${randomUUID()}.${extFromMime(file.type)}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "videos");
    await mkdir(uploadDir, { recursive: true });

    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, filename), bytes);

    const publicUrl = `/uploads/videos/${filename}`;

    const [existing] = await db.select().from(teacherProfiles).where(eq(teacherProfiles.teacherId, user.id)).limit(1);
    if (existing) {
        await db.update(teacherProfiles).set({
            videoUrl: publicUrl,
            videoSource: "local",
            updatedAt: new Date(),
        }).where(eq(teacherProfiles.teacherId, user.id));
    } else {
        await db.insert(teacherProfiles).values({
            teacherId: user.id,
            videoUrl: publicUrl,
            videoSource: "local",
        });
    }

    return NextResponse.json({ videoUrl: publicUrl }, { status: 201 });
}