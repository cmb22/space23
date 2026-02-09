import { db } from "@/lib/db/drizzle";
import { entitlements } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const requireEntitlement = async (
    userId: number,
    product: string
) => {
    const now = new Date();

    const [row] = await db
        .select()
        .from(entitlements)
        .where(
            and(
                eq(entitlements.userId, userId),
                eq(entitlements.product, product),
                eq(entitlements.status, "active")
            )
        )
        .limit(1);

    if (!row) {
        throw new Error("ENTITLEMENT_REQUIRED");
    }

    if (row.currentPeriodEnd && row.currentPeriodEnd < now) {
        throw new Error("ENTITLEMENT_EXPIRED");
    }
};