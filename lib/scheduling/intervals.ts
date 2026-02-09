export type Interval = { startMs: number; endMs: number };

const assertValid = (i: Interval) => {
    if (!Number.isFinite(i.startMs) || !Number.isFinite(i.endMs)) throw new Error("Invalid interval numbers");
    if (i.endMs <= i.startMs) throw new Error("Invalid interval (end <= start)");
};

export const mergeIntervals = (intervals: Interval[]): Interval[] => {
    const cleaned = intervals
        .filter((i) => Number.isFinite(i.startMs) && Number.isFinite(i.endMs) && i.endMs > i.startMs)
        .map((i) => ({ startMs: i.startMs, endMs: i.endMs }))
        .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

    if (cleaned.length === 0) return [];

    const out: Interval[] = [];
    let cur = cleaned[0];
    assertValid(cur);

    for (let idx = 1; idx < cleaned.length; idx++) {
        const next = cleaned[idx];
        assertValid(next);

        // overlap or touching => merge
        if (next.startMs <= cur.endMs) {
            cur = { startMs: cur.startMs, endMs: Math.max(cur.endMs, next.endMs) };
        } else {
            out.push(cur);
            cur = next;
        }
    }

    out.push(cur);
    return out;
};

export const subtractIntervals = (base: Interval[], cut: Interval[]): Interval[] => {
    const a = mergeIntervals(base);
    const b = mergeIntervals(cut);

    if (a.length === 0) return [];
    if (b.length === 0) return a;

    const out: Interval[] = [];
    let j = 0;

    for (const seg of a) {
        let curStart = seg.startMs;
        const curEnd = seg.endMs;

        while (j < b.length && b[j].endMs <= curStart) j++;

        let k = j;
        while (k < b.length && b[k].startMs < curEnd) {
            const c = b[k];

            // left remainder
            if (c.startMs > curStart) {
                out.push({ startMs: curStart, endMs: Math.min(c.startMs, curEnd) });
            }

            // move start forward
            curStart = Math.max(curStart, c.endMs);
            if (curStart >= curEnd) break;

            k++;
        }

        if (curStart < curEnd) out.push({ startMs: curStart, endMs: curEnd });
    }

    return out;
};