import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUser } from "@/lib/db/queries";

export async function GET() {
    const c = await cookies();

    return NextResponse.json({
        hasSessionCookie: Boolean(c.get("session")?.value),
        cookieNames: c.getAll().map((x) => x.name),
        user: await getUser().catch((e) => ({ error: String(e) })),
    });
}