// lib/scheduling/computeFreeSlots.ts
import { DateTime } from "luxon";

export type Slot = {
    startUtc: string; // ISO in UTC (Z)
    endUtc: string;   // ISO in UTC (Z)
    durationMinutes: number;
};

export type AvailabilityRule = {
    id?: number;
    teacherId?: number;

    // 0=Sun..6=Sat (dein Schema/Kommentar)
    weekday: number;

    // minutes since midnight in teacher timezone
    startMin: number;
    endMin: number;

    timezone: string; // e.g. "Europe/Berlin"

    validFrom: Date | string;
    validTo: Date | string;
};

export type LessonOffer = {
    durationMinutes: number | string; // tolerate strings in tests
    isActive?: any; // tolerate boolean/number/string
};

type ComputeParams = {
    // accept both naming styles
    fromIsoUtc?: string;
    toIsoUtc?: string;
    fromIso?: string;
    toIso?: string;

    rules: AvailabilityRule[];
    offers: LessonOffer[];
};

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

/**
 * ISO parsing:
 * - if string has offset/Z -> respect it and convert to UTC
 * - if NO offset -> interpret as UTC (IMPORTANT for tests!)
 */
const hasExplicitZone = (s: string) => /([zZ]|[+\-]\d{2}:\d{2})$/.test(s);

const parseToUtc = (v: Date | string) => {
    if (v instanceof Date) return DateTime.fromJSDate(v, { zone: "utc" });

    const s = String(v).trim();
    const dt = hasExplicitZone(s)
        ? DateTime.fromISO(s, { setZone: true }).toUTC()
        : DateTime.fromISO(s, { zone: "utc" }); // no local shift

    return dt.isValid ? dt : null;
};

const parseIsoParamToUtc = (iso: string | undefined | null) => {
    if (!iso) return null;
    return parseToUtc(iso);
};

const isOfferActive = (v: any) => {
    // default active if missing
    if (v === undefined || v === null) return true;

    // accept common shapes from tests/db
    if (v === true) return true;
    if (v === false) return false;

    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        if (s === "0" || s === "false" || s === "no" || s === "off") return false;
        return true; // "1", "true", etc.
    }

    // fallback: truthy => active
    return !!v;
};

const matchesWeekday = (dayLocal: DateTime, rawRuleWeekday: number) => {
    const rw = clamp(Number(rawRuleWeekday), 0, 6);

    // Luxon: 1=Mon..7=Sun
    const lux = dayLocal.weekday;

    // A: 0=Sun..6=Sat
    const daySun0 = lux % 7; // Sun->0, Mon->1 ... Sat->6

    // B: 0=Mon..6=Sun (sometimes tests use this)
    const dayMon0 = lux - 1; // Mon->0 ... Sun->6

    return rw === daySun0 || rw === dayMon0;
};

/**
 * Computes free slots (UTC ISO) from weekly rules within a requested UTC range.
 * - Respects rule weekday in teacher timezone
 * - Respects rule validFrom/validTo
 * - Generates slots for durations present in offers (30/45/60)
 * - Uses a 15-minute start grid so 45-min lessons exist
 */
export function computeFreeSlots(params: ComputeParams): Slot[] {
    const fromIso = params.fromIsoUtc ?? params.fromIso;
    const toIso = params.toIsoUtc ?? params.toIso;

    const fromDt = parseIsoParamToUtc(fromIso);
    const toDt = parseIsoParamToUtc(toIso);

    if (!fromDt || !toDt) return [];
    if (toDt.toMillis() <= fromDt.toMillis()) return [];

    const rules = Array.isArray(params.rules) ? params.rules : [];
    const offers = Array.isArray(params.offers) ? params.offers : [];

    // tests: returns [] when rules OR offers empty
    if (rules.length === 0 || offers.length === 0) return [];

    // durations from active offers (tolerant)
    const durations = Array.from(
        new Set(
            offers
                .filter((o) => isOfferActive(o.isActive))
                .map((o) => Number(o.durationMinutes))
                .filter((d) => [30, 45, 60].includes(d))
        )
    ).sort((a, b) => a - b);

    if (durations.length === 0) return [];

    const fromMs = fromDt.toMillis();
    const toMs = toDt.toMillis();

    const startDayUtc = fromDt.startOf("day");
    const endDayUtc = toDt.startOf("day");

    const START_GRID_MIN = 15; // required for 45-min
    const stepMs = START_GRID_MIN * 60_000;

    const slots: Slot[] = [];
    const seen = new Set<string>();

    const addSlot = (startMs: number, endMs: number, durationMinutes: number) => {
        const startUtc = new Date(startMs).toISOString();
        const endUtc = new Date(endMs).toISOString();
        const key = `${startUtc}|${endUtc}|${durationMinutes}`;
        if (seen.has(key)) return;
        seen.add(key);
        slots.push({ startUtc, endUtc, durationMinutes });
    };

    for (let day = startDayUtc; day.toMillis() <= endDayUtc.toMillis(); day = day.plus({ days: 1 })) {
        for (const rule of rules) {
            const tz = rule.timezone || "UTC";

            const validFromUtc = parseToUtc(rule.validFrom);
            const validToUtc = parseToUtc(rule.validTo);
            if (!validFromUtc || !validToUtc) continue;

            // day overlap quick reject (UTC)
            const dayStartUtc = day;
            const dayEndUtc = day.plus({ days: 1 });
            if (dayEndUtc.toMillis() <= validFromUtc.toMillis()) continue;
            if (dayStartUtc.toMillis() >= validToUtc.toMillis()) continue;

            const dayLocal = day.setZone(tz);

            if (!matchesWeekday(dayLocal, rule.weekday)) continue;

            const startMin = clamp(Number(rule.startMin), 0, 24 * 60);
            const endMin = clamp(Number(rule.endMin), 0, 24 * 60);
            if (endMin <= startMin) continue;

            const intervalStartLocal = dayLocal.startOf("day").plus({ minutes: startMin });
            const intervalEndLocal = dayLocal.startOf("day").plus({ minutes: endMin });

            let intervalStartMs = intervalStartLocal.toUTC().toMillis();
            let intervalEndMs = intervalEndLocal.toUTC().toMillis();

            // clip by validity precisely
            intervalStartMs = Math.max(intervalStartMs, validFromUtc.toMillis());
            intervalEndMs = Math.min(intervalEndMs, validToUtc.toMillis());

            // clip by requested [from,to)
            intervalStartMs = Math.max(intervalStartMs, fromMs);
            intervalEndMs = Math.min(intervalEndMs, toMs);

            if (intervalEndMs <= intervalStartMs) continue;

            // align start to 15-min grid (UTC)
            let t = intervalStartMs;
            const mod = t % stepMs;
            if (mod !== 0) t += stepMs - mod;

            while (t < intervalEndMs) {
                for (const d of durations) {
                    const e = t + d * 60_000;
                    if (e <= intervalEndMs) addSlot(t, e, d);
                }
                t += stepMs;
            }
        }
    }

    slots.sort((a, b) => a.startUtc.localeCompare(b.startUtc) || a.durationMinutes - b.durationMinutes);
    return slots;
}