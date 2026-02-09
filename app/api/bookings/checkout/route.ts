import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import Stripe from "stripe";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { bookings, teacherAvailability, lessonOffers } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-08-27.basil" });

const GRID_MINUTES = 30;

export async function POST(req: Request) {
    const user = await requireUser();
    if (!user?.id) {
        return NextResponse.json(
            { error: "Unauthorized", debug: { hasSession: !!user, userId: user?.id ?? null, email: user?.email ?? null } },
            { status: 401 }
        );
    }

    const body = await req.json();
    const teacherId = Number(body?.teacherId);
    const startUtc = String(body?.startUtc || "");
    const durationMinutes = Number(body?.durationMinutes);

    if (!Number.isFinite(teacherId) || !startUtc || !Number.isFinite(durationMinutes)) {
        return NextResponse.json({ error: "Missing/invalid fields" }, { status: 400 });
    }

    if (![30, 60].includes(durationMinutes)) {
        return NextResponse.json({ error: "Only 30/60 supported right now (45 requires 15-min grid)." }, { status: 400 });
    }

    const start = DateTime.fromISO(startUtc, { zone: "utc" });
    if (!start.isValid) return NextResponse.json({ error: "Invalid startUtc" }, { status: 400 });

    const end = start.plus({ minutes: durationMinutes });

    try {
        const checkoutUrl = await db.transaction(async (tx) => {
            // 1) price
            const [offer] = await tx
                .select()
                .from(lessonOffers)
                .where(and(eq(lessonOffers.teacherId, teacherId), eq(lessonOffers.durationMinutes, durationMinutes), eq(lessonOffers.isActive, 1)))
                .limit(1);

            if (!offer) throw new Error("No price for this duration");

            // 2) required atomic slots
            const requiredStarts: Date[] = [];
            requiredStarts.push(start.toJSDate());
            if (durationMinutes === 60) {
                requiredStarts.push(start.plus({ minutes: GRID_MINUTES }).toJSDate());
            }

            // 3) load matching availability rows (30-min)
            const rows = await tx
                .select()
                .from(teacherAvailability)
                .where(and(eq(teacherAvailability.teacherId, teacherId), inArray(teacherAvailability.startUtc, requiredStarts)));

            if (rows.length !== requiredStarts.length) {
                throw new Error("Slot not available");
            }

            // also verify each is exactly 30-min long
            for (const r of rows) {
                const rStart = DateTime.fromJSDate(r.startUtc as any).toUTC();
                const rEnd = DateTime.fromJSDate(r.endUtc as any).toUTC();
                if (rEnd.diff(rStart, "minutes").minutes !== GRID_MINUTES) {
                    throw new Error("Availability row is not 30-min atomic");
                }
            }

            // 4) create booking (pending)
            const [booking] = await tx
                .insert(bookings)
                .values({
                    teacherId,
                    studentId: user.id,
                    startUtc: start.toJSDate(),
                    endUtc: end.toJSDate(),
                    durationMinutes,
                    priceCents: offer.priceCents,
                    currency: offer.currency,
                    status: "pending",
                })
                .returning();


            // 5) delete atomic rows (lock)
            const idsToDelete = rows.map((r) => r.id);
            await tx.delete(teacherAvailability).where(inArray(teacherAvailability.id, idsToDelete));

            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!;
            const successUrl = `${baseUrl}/booking/success?bookingId=${booking.id}`;
            const cancelUrl = `${baseUrl}/booking/cancel`

            if (process.env.STRIPE_DISABLED === "1") {
                await tx
                    .update(bookings)
                    .set({ status: "paid", updatedAt: new Date() })
                    .where(eq(bookings.id, booking.id));

                return `${process.env.NEXT_PUBLIC_BASE_URL}/booking/success?bookingId=${booking.id}`;
            }
            // 6) stripe checkout
            const checkout = await stripe.checkout.sessions.create({
                mode: "payment",
                payment_method_types: ["card"],
                success_url: successUrl,
                cancel_url: cancelUrl,
                customer_email: user.email ?? undefined,
                line_items: [
                    {
                        quantity: 1,
                        price_data: {
                            currency: offer.currency.toLowerCase(),
                            unit_amount: offer.priceCents,
                            product_data: { name: `Lesson (${durationMinutes} min)` },
                        },
                    },
                ],
                metadata: { bookingId: String(booking.id) },
            });

            await tx.update(bookings)
                .set({ stripeCheckoutSessionId: checkout.id, updatedAt: new Date() })
                .where(eq(bookings.id, booking.id));

            return checkout.url!;
        });

        return NextResponse.json({ checkoutUrl });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "Checkout failed" }, { status: 400 });
    }
}