// app/api/stripe/webhook/webhook.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { bookings, users } from "@/lib/db/schema";

// ✅ MOCK Stripe (weil route.ts intern new Stripe() macht)
vi.mock("stripe", () => {
    const constructEvent = vi.fn();

    class StripeMock {
        public webhooks = { constructEvent };
        constructor() { }
    }

    // default export
    return { default: StripeMock, __stripeConstructEvent: constructEvent };
});

// wir holen uns die gleiche Mock-Fn zurück
// (vitest erlaubt Zugriff via importActual / require, aber so ist’s simpel)
const getConstructEventMock = async () => {
    const mod: any = await import("stripe");
    return mod.__stripeConstructEvent as ReturnType<typeof vi.fn>;
};

// IMPORTANT: erst nach vi.mock importieren
import { POST } from "./route";

// ---------------- helpers (lokal im Test) ----------------

async function ensureUser(params: {
    email: string;
    role: "teacher" | "student";
    passwordHash?: string;
    name?: string | null;
}) {
    const email = params.email.toLowerCase().trim();

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing[0]) return existing[0];

    const [created] = await db
        .insert(users)
        .values({
            email,
            role: params.role,
            name: params.name ?? null,
            passwordHash: params.passwordHash ?? "$2b$10$testtesttesttesttesttesttesttesttesttesttest",
            createdAt: new Date(),
            updatedAt: new Date(),
        })
        .returning();

    return created;
}

async function seedBookingPending(params: {
    teacherId: number;
    studentId: number;
    startUtcIso: string;
    durationMinutes: number;
    priceCents?: number;
    currency?: string;
    stripeCheckoutSessionId?: string | null;
}) {
    const start = DateTime.fromISO(params.startUtcIso, { zone: "utc" });
    const end = start.plus({ minutes: params.durationMinutes });

    const [b] = await db
        .insert(bookings)
        .values({
            teacherId: params.teacherId,
            studentId: params.studentId,
            startUtc: start.toJSDate(),
            endUtc: end.toJSDate(),
            durationMinutes: params.durationMinutes,
            priceCents: params.priceCents ?? 3000,
            currency: params.currency ?? "EUR",
            status: "pending",
            stripeCheckoutSessionId: params.stripeCheckoutSessionId ?? null,
            stripePaymentIntentId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        })
        .returning();

    return b;
}

async function clearBooking(id: number) {
    await db.delete(bookings).where(eq(bookings.id, id));
}

function makeReq(bodyBytes: Uint8Array, headers: Record<string, string>) {
    return new Request("http://localhost:3000/api/stripe/webhook", {
        method: "POST",
        headers,
        body: bodyBytes,
    });
}

// ---------------- tests ----------------

describe("POST /api/stripe/webhook", () => {
    beforeEach(() => {
        // env required by route.ts
        process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "sk_test_dummy";
        process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_dummy";
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("400 when stripe-signature header is missing", async () => {
        const req = makeReq(new TextEncoder().encode("x"), {});
        const res = await POST(req);

        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toContain("Missing stripe-signature");
    });

    it("500 when STRIPE_WEBHOOK_SECRET is missing", async () => {
        delete process.env.STRIPE_WEBHOOK_SECRET;

        const req = makeReq(new TextEncoder().encode("x"), {
            "stripe-signature": "sig_dummy",
        });

        const res = await POST(req);
        expect(res.status).toBe(500);

        const json = await res.json();
        expect(json.error).toContain("Missing STRIPE_WEBHOOK_SECRET");
    });

    it("happy path: checkout.session.completed marks booking paid + stores session/payment_intent + updates updatedAt", async () => {
        const constructEvent = await getConstructEventMock();

        // seed users + booking
        const teacher = await ensureUser({ email: "teacher+wh@test.com", role: "teacher" });
        const student = await ensureUser({ email: "student+wh@test.com", role: "student" });

        const booking = await seedBookingPending({
            teacherId: teacher.id,
            studentId: student.id,
            startUtcIso: "2026-02-11T09:00:00.000Z",
            durationMinutes: 30,
            priceCents: 3000,
            currency: "EUR",
        });

        // mock stripe event
        const sessionId = "cs_test_123";
        const piId = "pi_test_999";

        constructEvent.mockReturnValue({
            id: "evt_test_1",
            type: "checkout.session.completed",
            data: {
                object: {
                    id: sessionId,
                    metadata: { bookingId: String(booking.id) },
                    payment_intent: piId,
                },
            },
        });

        const req = makeReq(new TextEncoder().encode('{"anything":"raw"}'), {
            "stripe-signature": "sig_dummy",
        });

        const before = booking.updatedAt;

        const res = await POST(req);
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.received).toBe(true);

        // verify DB updated
        const [after] = await db.select().from(bookings).where(eq(bookings.id, booking.id)).limit(1);
        expect(after).toBeTruthy();

        expect(after.status).toBe("paid");
        expect(after.stripeCheckoutSessionId).toBe(sessionId);
        expect(after.stripePaymentIntentId).toBe(piId);

        // updatedAt should change (>=)
        expect(new Date(after.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());

        // cleanup
        await clearBooking(booking.id);
    });

    it("if bookingId missing in metadata -> returns ok/received but does not crash", async () => {
        const constructEvent = await getConstructEventMock();

        constructEvent.mockReturnValue({
            id: "evt_test_2",
            type: "checkout.session.completed",
            data: {
                object: {
                    id: "cs_test_no_bookingid",
                    metadata: {}, // no bookingId
                    payment_intent: null,
                },
            },
        });

        const req = makeReq(new TextEncoder().encode("x"), {
            "stripe-signature": "sig_dummy",
        });

        const res = await POST(req);
        expect(res.status).toBe(200);

        const json = await res.json();
        // route returns { ok:true, note: ... } in that branch
        expect(json.ok).toBe(true);
    });
});