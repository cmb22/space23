// app/api/teachers/[teacherId]/availability/availability.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST, DELETE } from "./route";
import { db } from "@/lib/db/drizzle";
import { teacherAvailability } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ensureUser, clearTeacherData } from "../../../testutils/factories";

// mock requireUser
vi.mock("@/lib/auth/session", () => {
    return {
        requireUser: vi.fn(),
    };
});

import { requireUser } from "@/lib/auth/session";

function makeReq(url: string, init?: RequestInit) {
    return new Request(url, init);
}

describe("GET/POST/DELETE /api/teachers/:id/availability (merged delete)", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("deletes a merged block by eventId", async () => {
        // teacher + auth
        const teacher = await ensureUser({ email: "teacher+avail@test.com", role: "teacher" });
        (requireUser as any).mockResolvedValue({ id: teacher.id, email: teacher.email });

        // cleanup
        await clearTeacherData(teacher.id);

        // create availability block 06:00-12:30 -> inserts atomic 30-min slots
        const postReq = makeReq(`http://localhost:3000/api/teachers/${teacher.id}/availability`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                startUtc: "2026-02-11T06:00:00.000Z",
                endUtc: "2026-02-11T12:30:00.000Z",
            }),
        });

        const postRes = await POST(postReq, { params: Promise.resolve({ teacherId: String(teacher.id) }) });
        expect(postRes.status).toBe(200);

        // GET merged events
        const getReq = makeReq(
            `http://localhost:3000/api/teachers/${teacher.id}/availability?from=2026-02-10T00:00:00.000Z&to=2026-02-12T00:00:00.000Z&mode=merged`,
            { method: "GET" }
        );

        const getRes = await GET(getReq, { params: Promise.resolve({ teacherId: String(teacher.id) }) });
        expect(getRes.status).toBe(200);

        const getJson = await getRes.json();
        const events = Array.isArray(getJson?.events) ? getJson.events : [];
        expect(events.length).toBeGreaterThan(0);

        const first = events[0];
        expect(typeof first.id).toBe("string");

        // DELETE by eventId
        const delReq = makeReq(
            `http://localhost:3000/api/teachers/${teacher.id}/availability?eventId=${encodeURIComponent(first.id)}`,
            { method: "DELETE" }
        );

        const delRes = await DELETE(delReq, { params: Promise.resolve({ teacherId: String(teacher.id) }) });
        expect(delRes.status).toBe(200);

        // confirm no rows remain for teacher
        const remaining = await db
            .select()
            .from(teacherAvailability)
            .where(eq(teacherAvailability.teacherId, teacher.id));

        expect(remaining.length).toBe(0);
    });
});