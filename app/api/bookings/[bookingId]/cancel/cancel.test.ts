// app/api/bookings/cancel/cancel.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq, and, inArray } from "drizzle-orm";

import { POST } from "./route";
import { db } from "@/lib/db/drizzle";
import { bookings, teacherAvailability } from "@/lib/db/schema";

import {
    ensureUser,
    seedBooking,
    seedAvailability30,
    clearBookingsForStudent,
    clearTeacherAvailabilityForTeacher,
} from "../../../testutils/factories";

// ---- mock requireUser
vi.mock("@/lib/auth/session", () => {
    return {
        requireUser: vi.fn(),
    };
});

const { requireUser } = await import("@/lib/auth/session");

function makeReq(body: any) {
    return new Request("http://localhost:3000/api/bookings/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("POST /api/bookings/cancel", () => {
    beforeEach(async () => {
        vi.resetAllMocks();
    });

    it("401 when user is not authenticated", async () => {
        (requireUser as any).mockResolvedValue(null);

        const res = await POST(makeReq({ bookingId: 123 }));
        expect(res.status).toBe(401);

        const json = await res.json();
        expect(json.error).toMatch(/Unauthorized/i);
    });

    it("400 when body is invalid", async () => {
        (requireUser as any).mockResolvedValue({ id: 1, email: "x@test.com" });

        const res = await POST(makeReq({ bookingId: "nope" }));
        expect(res.status).toBe(400);
    });

    it("happy path: pending booking -> canceled and availability restored (idempotent safe)", async () => {
        const teacher = await ensureUser({ email: "teacher+cancel@test.com", role: "teacher" });
        const student = await ensureUser({ email: "student+cancel@test.com", role: "student" });

        (requireUser as any).mockResolvedValue({ id: student.id, email: student.email });

        // clean
        await clearBookingsForStudent(student.id);
        await clearTeacherAvailabilityForTeacher(teacher.id);

        // Create booking for 60 min: requires 2 atomic 30-min rows
        const startUtcIso = "2026-02-11T10:00:00.000Z";
        const booking = await seedBooking({
            teacherId: teacher.id,
            studentId: student.id,
            startUtcIso,
            durationMinutes: 60,
            status: "pending",
        });

        // Simulate "locked availability has been deleted already":
        // (i.e., checkout removed rows)
        // We DO NOT insert them beforehand. So restore should insert 2 rows.
        const res = await POST(makeReq({ bookingId: booking.id }));
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.ok).toBe(true);
        expect(json.restored).toBe(2);

        // booking is canceled
        const [b2] = await db.select().from(bookings).where(eq(bookings.id, booking.id)).limit(1);
        expect(b2.status).toBe("canceled");

        // availability restored: starts at 10:00 and 10:30
        const requiredStarts = [
            new Date("2026-02-11T10:00:00.000Z"),
            new Date("2026-02-11T10:30:00.000Z"),
        ];

        const rows = await db
            .select()
            .from(teacherAvailability)
            .where(and(eq(teacherAvailability.teacherId, teacher.id), inArray(teacherAvailability.startUtc, requiredStarts)));

        expect(rows).toHaveLength(2);
    });

    it("idempotent: calling cancel twice does not duplicate availability", async () => {
        const teacher = await ensureUser({ email: "teacher+cancel2@test.com", role: "teacher" });
        const student = await ensureUser({ email: "student+cancel2@test.com", role: "student" });

        (requireUser as any).mockResolvedValue({ id: student.id, email: student.email });

        await clearBookingsForStudent(student.id);
        await clearTeacherAvailabilityForTeacher(teacher.id);

        const booking = await seedBooking({
            teacherId: teacher.id,
            studentId: student.id,
            startUtcIso: "2026-02-11T12:00:00.000Z",
            durationMinutes: 60,
            status: "pending",
        });

        const res1 = await POST(makeReq({ bookingId: booking.id }));
        expect(res1.status).toBe(200);
        const j1 = await res1.json();
        expect(j1.restored).toBe(2);

        const res2 = await POST(makeReq({ bookingId: booking.id }));
        expect(res2.status).toBe(200);
        const j2 = await res2.json();
        expect(j2.restored).toBe(0);

        const rows = await db
            .select()
            .from(teacherAvailability)
            .where(eq(teacherAvailability.teacherId, teacher.id));

        // exactly two rows for that hour
        const match = rows.filter((r) => {
            const s = new Date(r.startUtc as any).toISOString();
            return s === "2026-02-11T12:00:00.000Z" || s === "2026-02-11T12:30:00.000Z";
        });
        expect(match).toHaveLength(2);
    });

    it("400 when booking is paid", async () => {
        const teacher = await ensureUser({ email: "teacher+paidcancel@test.com", role: "teacher" });
        const student = await ensureUser({ email: "student+paidcancel@test.com", role: "student" });

        (requireUser as any).mockResolvedValue({ id: student.id, email: student.email });

        await clearBookingsForStudent(student.id);
        await clearTeacherAvailabilityForTeacher(teacher.id);

        const booking = await seedBooking({
            teacherId: teacher.id,
            studentId: student.id,
            startUtcIso: "2026-02-11T14:00:00.000Z",
            durationMinutes: 60,
            status: "paid",
        });

        const res = await POST(makeReq({ bookingId: booking.id }));
        expect(res.status).toBe(400);

        const json = await res.json();
        expect(String(json.error)).toMatch(/Cannot cancel/i);

        // no availability inserted
        const rows = await db
            .select()
            .from(teacherAvailability)
            .where(eq(teacherAvailability.teacherId, teacher.id));
        expect(rows.length).toBe(0);
    });
});