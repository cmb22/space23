import { describe, it, expect } from "vitest";
import { GET } from "./route";
import { ensureUser, seedOffer, seedAvailability } from "../../../testutils/factories";

function makeReq(url: string) {
    return new Request(url, { method: "GET" });
}

describe("GET /api/teachers/:id/free-slots", () => {
    it("returns slots when teacher_availability exists", async () => {
        // 1) teacher exists (fix für FK)
        const teacher = await ensureUser({ email: "teacher+test@test.com", role: "teacher" });

        // 2) offers exist (damit durations bekannt sind)
        await seedOffer({ teacherId: teacher.id, durationMinutes: 30, priceCents: 3000 });
        await seedOffer({ teacherId: teacher.id, durationMinutes: 60, priceCents: 6000 });

        // 3) availability interval exists
        await seedAvailability({
            teacherId: teacher.id,
            startUtc: "2026-02-11T04:00:00.000Z",
            endUtc: "2026-02-11T05:00:00.000Z",
        });

        const req = makeReq(
            `http://localhost:3000/api/teachers/${teacher.id}/free-slots?from=2026-02-11T00:00:00.000Z&to=2026-02-12T00:00:00.000Z`
        );

        const res = await GET(req, { params: Promise.resolve({ teacherId: String(teacher.id) }) });

        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.teacherId).toBe(teacher.id);
        expect(Array.isArray(json.slots)).toBe(true);
        expect(json.slots.length).toBeGreaterThan(0);
    });
});