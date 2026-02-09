import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { eq, and, inArray } from "drizzle-orm";

// IMPORTANT: mock stripe BEFORE importing the route module
vi.mock("stripe", () => {
    class StripeMock {
        checkout = {
            sessions: {
                create: vi.fn(async () => ({
                    id: "cs_test_123",
                    url: "https://stripe.test/checkout/cs_test_123",
                })),
            },
        };
        constructor() { }
    }
    return { default: StripeMock };
});

// mock requireUser BEFORE importing the route module
vi.mock("@/lib/auth/session", () => {
    return {
        requireUser: vi.fn(),
    };
});

import { POST } from "./route";
import { db } from "@/lib/db/drizzle";
import { users, lessonOffers, teacherAvailability, bookings } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";

import {
    ensureUser,
    seedOffer,
    seedAvailability30,
    clearTeacherData,
    clearBookingsForStudent,
} from "../../testutils/factories";

function makePostReq(body: any) {
    return new Request("http://localhost:3000/api/booking/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("POST /api/booking/checkout", () => {
    beforeEach(async () => {
        // env baseline
        process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
        process.env.STRIPE_SECRET_KEY = "sk_test_xxx";
        delete process.env.STRIPE_DISABLED;

        vi.clearAllMocks();
    });

    afterEach(async () => {
        // keep DB clean but DO NOT nuke all users globally here
        // we clean only what this suite creates (teacherAvailability, lessonOffers, bookings)
    });

    it("401 when user is not authenticated", async () => {
        vi.mocked(requireUser).mockResolvedValueOnce(null as any);

        const res = await POST(
            makePostReq({ teacherId: 1, startUtc: "2026-02-11T04:00:00.000Z", durationMinutes: 30 })
        );

        expect(res.status).toBe(401);
        const json = await res.json();
        expect(json.error).toBe("Unauthorized");
    });

    it("400 when body is invalid", async () => {
        const student = await ensureUser({ email: "student+checkout@test.com", role: "student" });
        vi.mocked(requireUser).mockResolvedValueOnce(student as any);

        const res = await POST(makePostReq({ teacherId: "x", startUtc: "", durationMinutes: "nope" }));
        expect(res.status).toBe(400);

        const json = await res.json();
        expect(json.error).toMatch(/Missing\/invalid fields/i);
    });

    it("400 when duration is not supported (45)", async () => {
        const student = await ensureUser({ email: "student+dur@test.com", role: "student" });
        vi.mocked(requireUser).mockResolvedValueOnce(student as any);

        const res = await POST(
            makePostReq({ teacherId: 123, startUtc: "2026-02-11T04:00:00.000Z", durationMinutes: 45 })
        );

        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toMatch(/Only 30\/60 supported/i);
    });

    it("400 when offer (price) is missing", async () => {
        const teacher = await ensureUser({ email: "teacher+nooffer@test.com", role: "teacher" });
        const student = await ensureUser({ email: "student+nooffer@test.com", role: "student" });

        vi.mocked(requireUser).mockResolvedValueOnce(student as any);

        // ensure no offers
        await clearTeacherData(teacher.id);

        const res = await POST(
            makePostReq({ teacherId: teacher.id, startUtc: "2026-02-11T04:00:00.000Z", durationMinutes: 30 })
        );

        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toMatch(/No price/i);
    });

    it("400 when slot is not available (availability rows missing)", async () => {
        const teacher = await ensureUser({ email: "teacher+noslot@test.com", role: "teacher" });
        const student = await ensureUser({ email: "student+noslot@test.com", role: "student" });

        vi.mocked(requireUser).mockResolvedValueOnce(student as any);

        await clearTeacherData(teacher.id);
        await seedOffer({ teacherId: teacher.id, durationMinutes: 30, priceCents: 3000 });

        // do NOT seed teacherAvailability
        const res = await POST(
            makePostReq({ teacherId: teacher.id, startUtc: "2026-02-11T04:00:00.000Z", durationMinutes: 30 })
        );

        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toMatch(/Slot not available/i);
    });

    it("happy path with STRIPE_DISABLED=1: creates booking, marks paid, locks availability, returns success URL", async () => {
        process.env.STRIPE_DISABLED = "1";

        const teacher = await ensureUser({ email: "teacher+disabled@test.com", role: "teacher" });
        const student = await ensureUser({ email: "student+disabled@test.com", role: "student" });

        vi.mocked(requireUser).mockResolvedValueOnce(student as any);

        await clearTeacherData(teacher.id);
        await clearBookingsForStudent(student.id);

        await seedOffer({ teacherId: teacher.id, durationMinutes: 30, priceCents: 3000, currency: "EUR" });

        // seed exactly 1 atomic 30-min block for 30-min booking
        await seedAvailability30({
            teacherId: teacher.id,
            startUtcIso: "2026-02-11T04:00:00.000Z",
            blocks: 1,
        });

        const res = await POST(
            makePostReq({ teacherId: teacher.id, startUtc: "2026-02-11T04:00:00.000Z", durationMinutes: 30 })
        );

        expect(res.status).toBe(200);
        const json = await res.json();

        // IMPORTANT: your route returns { checkoutUrl } always, even in STRIPE_DISABLED
        expect(String(json.checkoutUrl)).toContain("/booking/success?bookingId=");

        // booking was created and set to paid
        const allBookings = await db
            .select()
            .from(bookings)
            .where(and(eq(bookings.teacherId, teacher.id), eq(bookings.studentId, student.id)));

        expect(allBookings.length).toBeGreaterThan(0);
        const b = allBookings[allBookings.length - 1];
        expect(b.status).toBe("paid");
        expect(b.updatedAt).toBeTruthy();

        // availability must be deleted (your code deletes BEFORE STRIPE_DISABLED branch)
        const avail = await db
            .select()
            .from(teacherAvailability)
            .where(eq(teacherAvailability.teacherId, teacher.id));

        expect(avail).toHaveLength(0);
    });

    it("happy path with Stripe enabled: creates pending booking, locks availability, stores checkout session id, returns checkout URL", async () => {
        const teacher = await ensureUser({ email: "teacher+stripe@test.com", role: "teacher" });
        const student = await ensureUser({ email: "student+stripe@test.com", role: "student" });

        vi.mocked(requireUser).mockResolvedValueOnce(student as any);

        await clearTeacherData(teacher.id);
        await clearBookingsForStudent(student.id);

        await seedOffer({ teacherId: teacher.id, durationMinutes: 60, priceCents: 6000, currency: "EUR" });

        // 60-min booking => must have 2 atomic blocks: start and start+30
        await seedAvailability30({
            teacherId: teacher.id,
            startUtcIso: "2026-02-11T04:00:00.000Z",
            blocks: 2,
        });

        const res = await POST(
            makePostReq({ teacherId: teacher.id, startUtc: "2026-02-11T04:00:00.000Z", durationMinutes: 60 })
        );

        expect(res.status).toBe(200);
        const json = await res.json();

        expect(json.checkoutUrl).toBe("https://stripe.test/checkout/cs_test_123");

        // booking is pending + has stripeCheckoutSessionId
        const allBookings = await db
            .select()
            .from(bookings)
            .where(and(eq(bookings.teacherId, teacher.id), eq(bookings.studentId, student.id)));

        expect(allBookings.length).toBeGreaterThan(0);
        const b = allBookings[allBookings.length - 1];

        expect(b.status).toBe("pending");
        expect(b.stripeCheckoutSessionId).toBe("cs_test_123");
        expect(b.updatedAt).toBeTruthy();

        // availability locked (deleted)
        const avail = await db
            .select()
            .from(teacherAvailability)
            .where(eq(teacherAvailability.teacherId, teacher.id));

        expect(avail).toHaveLength(0);
    });
});