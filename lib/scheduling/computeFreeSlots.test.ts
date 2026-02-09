// lib/scheduling/computeFreeSlots.isActive.test.ts
import { describe, it, expect } from "vitest";
import { computeFreeSlots } from "./computeFreeSlots";

describe("computeFreeSlots - offer isActive coercion", () => {
    it("treats boolean/number/string isActive as expected and generates durations accordingly", () => {
        const slots = computeFreeSlots({
            fromIsoUtc: "2026-02-11T00:00:00.000Z",
            toIsoUtc: "2026-02-12T00:00:00.000Z",
            rules: [
                {
                    weekday: 3, // Wed (works with both weekday conventions in compute)
                    startMin: 9 * 60, // 09:00
                    endMin: 12 * 60,  // 12:00
                    timezone: "UTC",
                    validFrom: "2026-01-01T00:00:00.000Z",
                    validTo: "2026-12-31T23:59:59.000Z",
                },
            ],
            offers: [
                { durationMinutes: 30, isActive: true },     // should be active
                { durationMinutes: 45, isActive: "true" },   // should be active
                { durationMinutes: 60, isActive: 1 },        // should be active
                { durationMinutes: 30, isActive: "0" },      // inactive
                { durationMinutes: 45, isActive: false },    // inactive
                { durationMinutes: 60, isActive: "false" },  // inactive
            ],
        });

        expect(slots.length).toBeGreaterThan(0);

        const durations = new Set(slots.map((s) => s.durationMinutes));

        // active offers should exist
        expect(durations.has(30)).toBe(true);
        expect(durations.has(45)).toBe(true);
        expect(durations.has(60)).toBe(true);
    });

    it("defaults missing isActive to active", () => {
        const slots = computeFreeSlots({
            fromIsoUtc: "2026-02-11T00:00:00.000Z",
            toIsoUtc: "2026-02-12T00:00:00.000Z",
            rules: [
                {
                    weekday: 3,
                    startMin: 9 * 60,
                    endMin: 10 * 60,
                    timezone: "UTC",
                    validFrom: "2026-01-01T00:00:00.000Z",
                    validTo: "2026-12-31T23:59:59.000Z",
                },
            ],
            offers: [
                { durationMinutes: 30 }, // isActive missing => active
            ],
        });

        expect(slots.length).toBeGreaterThan(0);
        expect(new Set(slots.map((s) => s.durationMinutes)).has(30)).toBe(true);
    });

    it("returns [] if all offers are inactive after coercion", () => {
        const slots = computeFreeSlots({
            fromIsoUtc: "2026-02-11T00:00:00.000Z",
            toIsoUtc: "2026-02-12T00:00:00.000Z",
            rules: [
                {
                    weekday: 3,
                    startMin: 9 * 60,
                    endMin: 12 * 60,
                    timezone: "UTC",
                    validFrom: "2026-01-01T00:00:00.000Z",
                    validTo: "2026-12-31T23:59:59.000Z",
                },
            ],
            offers: [
                { durationMinutes: 30, isActive: 0 },
                { durationMinutes: 45, isActive: "0" },
                { durationMinutes: 60, isActive: false },
                { durationMinutes: 30, isActive: "false" },
                { durationMinutes: 45, isActive: "off" },
                { durationMinutes: 60, isActive: "no" },
            ],
        });

        expect(slots).toHaveLength(0);
    });
});