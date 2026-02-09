import { beforeEach } from "vitest";
import { truncateAll } from "@/app/api/testutils/db";

// Für libs wie jose (Stripe Webhook verify etc.) im Node-Test-Env:
import { TextEncoder, TextDecoder } from "node:util";

(globalThis as any).TextEncoder = TextEncoder;
(globalThis as any).TextDecoder = TextDecoder;

// Minimale env defaults (nur falls in Code referenced)
process.env.AUTH_SECRET ??= "test-secret";
process.env.NEXT_PUBLIC_BASE_URL ??= "http://localhost:3000";
process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_dummy";

beforeEach(async () => {
    await truncateAll();
});