// lib/scheduling/mergeIntervals.ts
import { DateTime } from "luxon";

export type IntervalRow = {
    startUtc: Date | string;
    endUtc: Date | string;
};

export type MergedInterval = {
    startUtc: string; // ISO Z
    endUtc: string;   // ISO Z
};

const toMs = (v: Date | string) => {
    if (v instanceof Date) return v.getTime();
    // string from DB might include offset or be ISO; treat as absolute time
    const dt = DateTime.fromISO(String(v), { setZone: true }).toUTC();
    return dt.isValid ? dt.toMillis() : NaN;
};

const toIso = (ms: number) => new Date(ms).toISOString();

/**
 * Merge contiguous/overlapping UTC intervals.
 * - Adjacent intervals (end == next.start) are merged.
 */
export function mergeIntervals(rows: IntervalRow[]): MergedInterval[] {
    const items = rows
        .map((r) => ({ startMs: toMs(r.startUtc), endMs: toMs(r.endUtc) }))
        .filter((x) => Number.isFinite(x.startMs) && Number.isFinite(x.endMs) && x.endMs > x.startMs)
        .sort((a, b) => a.startMs - b.startMs);

    if (items.length === 0) return [];

    const out: { startMs: number; endMs: number }[] = [{ ...items[0] }];

    for (let i = 1; i < items.length; i++) {
        const prev = out[out.length - 1];
        const cur = items[i];

        // merge if overlapping OR touching
        if (cur.startMs <= prev.endMs) {
            prev.endMs = Math.max(prev.endMs, cur.endMs);
        } else {
            out.push({ ...cur });
        }
    }

    return out.map((x) => ({ startUtc: toIso(x.startMs), endUtc: toIso(x.endMs) }));
}