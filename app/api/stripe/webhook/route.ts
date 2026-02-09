// app/api/stripe/webhook/route.ts

import Stripe from "stripe";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/drizzle";
import { bookings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil",
});

async function readRawBody(req: Request) {
  const buf = Buffer.from(await req.arrayBuffer());
  return buf;
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });

  let event: Stripe.Event;

  try {
    const raw = await readRawBody(req);
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const bookingId = session.metadata?.bookingId;
      if (!bookingId) {
        return NextResponse.json({ ok: true, note: "No bookingId in metadata" });
      }

      // Optional: paymentIntent id speichern
      const paymentIntentId =
        typeof session.payment_intent === "string" ? session.payment_intent : null;

      await db
        .update(bookings)
        .set({
          status: "paid",
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, Number(bookingId)));
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Webhook handler failed" }, { status: 500 });
  }
}