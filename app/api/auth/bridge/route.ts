import { NextResponse } from "next/server";
import { auth } from "@/auth";

import { db } from "@/lib/db/drizzle";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { setSession, hashPassword } from "@/lib/auth/session";

export async function GET() {
    const session = await auth();

    if (!session?.user?.email) {
        return NextResponse.redirect(new URL("/sign-in?error=oauth", "http://localhost:3000"));
    }

    const email = session.user.email;
    const name = session.user.name ?? null;

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    let user = existing[0];

    if (!user) {
        const passwordHash = await hashPassword(crypto.randomUUID());
        const [created] = await db
            .insert(users)
            .values({ email, name, passwordHash, role: "student" })
            .returning();
        user = created;
    }

    await setSession(user);

    return NextResponse.redirect(new URL("/dashboard", "http://localhost:3000"));
}