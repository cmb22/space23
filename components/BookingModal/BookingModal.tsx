"use client";

import { DateTime } from "luxon";
import { useEffect, useMemo, useState } from "react";

import styles from "./BookingModal.module.css";

type Slot = {
  startUtc: string;
  endUtc: string;
  durationMinutes: number;
};

type ApiResponse = {
  teacherId: number;
  fromIso: string;
  toIso: string;
  count: number;
  slots: Slot[];
};

type Duration = 30 | 45 | 60;

const DURATIONS: Duration[] = [30, 45, 60];

// Always Monday-start week (Mon..Sun) for a stable UX
const startOfIsoWeek = (dt: DateTime) => dt.startOf("day").minus({ days: dt.weekday - 1 });

const toLocal = (isoUtc: string) => DateTime.fromISO(isoUtc, { zone: "utc" }).toLocal();

const fmtDayHeader = (dt: DateTime) => dt.toFormat("ccc, d LLL");
const fmtTime = (dt: DateTime) => dt.toFormat("HH:mm");

export const BookingModal = (props: {
  teacherId: number;
  open: boolean;
  onClose: () => void;
}) => {
  const { teacherId, open, onClose } = props;

  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [duration, setDuration] = useState<Duration>(30);

  // We load a whole week (Mon..Sun) in UTC for simplicity.
  const [weekAnchorIso, setWeekAnchorIso] = useState<string>(() =>
    startOfIsoWeek(DateTime.local()).toISO()!
  );

  const range = useMemo(() => {
    const anchorLocal = DateTime.fromISO(weekAnchorIso).toLocal();
    const fromLocal = startOfIsoWeek(anchorLocal);
    const toLocalExclusive = fromLocal.plus({ days: 7 });

    // API expects UTC range
    const fromIso = fromLocal.toUTC().toISO()!;
    const toIso = toLocalExclusive.toUTC().toISO()!;

    return { fromIso, toIso, fromLocal, toLocalExclusive };
  }, [weekAnchorIso]);

  const [allSlots, setAllSlots] = useState<Slot[]>([]);

  useEffect(() => {
    if (!open) return;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const url = new URL(`/api/teachers/${teacherId}/free-slots`, window.location.origin);
        url.searchParams.set("from", range.fromIso);
        url.searchParams.set("to", range.toIso);

        const res = await fetch(url.toString(), { cache: "no-store" });
        const data = (await res.json()) as (ApiResponse & { error?: string }) | { error?: string };

        if (!res.ok) {
          setError((data as any)?.error || `HTTP ${res.status}`);
          setAllSlots([]);
          return;
        }

        const ok = data as ApiResponse;
        setAllSlots(ok.slots || []);
      } catch (e: any) {
        setError(e?.message || "Failed to load slots");
        setAllSlots([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [open, teacherId, range.fromIso, range.toIso]);

  const slots = useMemo(() => {
    // Filter to only the chosen durations
    return allSlots.filter((s) => DURATIONS.includes(s.durationMinutes as Duration));
  }, [allSlots]);

  const filtered = useMemo(() => {
    return slots
      .filter((s) => s.durationMinutes === duration)
      .sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  }, [slots, duration]);

  const groupedByDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of filtered) {
      const dayKey = toLocal(s.startUtc).toFormat("yyyy-LL-dd");
      const arr = map.get(dayKey) || [];
      arr.push(s);
      map.set(dayKey, arr);
    }

    // Build a stable ordered list for Mon..Sun
    const days: { dayLocal: DateTime; slots: Slot[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const dayLocal = range.fromLocal.plus({ days: i });
      const key = dayLocal.toFormat("yyyy-LL-dd");
      days.push({ dayLocal, slots: map.get(key) || [] });
    }
    return days;
  }, [filtered, range.fromLocal]);

  const goPrevWeek = () =>
    setWeekAnchorIso((prev) => DateTime.fromISO(prev).toLocal().minus({ days: 7 }).toISO()!);

  const goNextWeek = () =>
    setWeekAnchorIso((prev) => DateTime.fromISO(prev).toLocal().plus({ days: 7 }).toISO()!);

  const onPick = async (slot: Slot) => {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/bookings/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherId,
          startUtc: slot.startUtc,
          durationMinutes: slot.durationMinutes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");

      window.location.href = data.checkoutUrl;
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.top}>
          <div className={styles.title}>Book Lesson</div>
          <button type="button" className={styles.close} onClick={onClose} disabled={checkoutLoading}>
            Close
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.row}>
            <div className={styles.weekNav}>
              <button type="button" className={styles.weekBtn} onClick={goPrevWeek} disabled={loading || checkoutLoading}>
                ←
              </button>
              <div className={styles.weekLabel}>
                {range.fromLocal.toFormat("d LLL")} – {range.toLocalExclusive.minus({ days: 1 }).toFormat("d LLL yyyy")}
              </div>
              <button type="button" className={styles.weekBtn} onClick={goNextWeek} disabled={loading || checkoutLoading}>
                →
              </button>
            </div>

            <div className={styles.durationPills} role="tablist" aria-label="Lesson duration">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`${styles.durationPill} ${duration === d ? styles.durationPillActive : ""}`}
                  onClick={() => setDuration(d)}
                  disabled={loading || checkoutLoading}
                  aria-pressed={duration === d}
                >
                  {d} min
                </button>
              ))}
            </div>

            <div className={styles.small}>
              Times are shown in <strong>your</strong> local timezone. Stored/booked in UTC.
            </div>
          </div>

          {loading ? (
            <div className={styles.empty}>Loading…</div>
          ) : error ? (
            <div className={styles.empty}>{error}</div>
          ) : groupedByDay.every((d) => d.slots.length === 0) ? (
            <div className={styles.empty}>No {duration}-minute slots in this week.</div>
          ) : (
            <div className={styles.days}>
              {groupedByDay.map(({ dayLocal, slots }) => (
                <section key={dayLocal.toISODate()} className={styles.day}>
                  <div className={styles.dayHeader}>{fmtDayHeader(dayLocal)}</div>

                  {slots.length === 0 ? (
                    <div className={styles.dayEmpty}>—</div>
                  ) : (
                    <div className={styles.grid}>
                      {slots.map((s) => {
                        const start = toLocal(s.startUtc);
                        const end = toLocal(s.endUtc);

                        return (
                          <button
                            key={`${s.startUtc}-${s.durationMinutes}`}
                            type="button"
                            className={styles.slot}
                            onClick={() => onPick(s)}
                            title={s.startUtc}
                            disabled={checkoutLoading}
                          >
                            <div className={styles.slotTime}>
                              {fmtTime(start)}–{fmtTime(end)}
                            </div>
                            <div className={styles.slotMeta}>{s.durationMinutes} min</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};