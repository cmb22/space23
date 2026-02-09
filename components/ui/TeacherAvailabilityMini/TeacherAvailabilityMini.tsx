"use client";

import React, { useEffect, useMemo, useState } from "react";
import styles from "./TeacherAvailabilityMini.module.css";
import { DateTime } from "luxon";

type Slot = {
    startUtc: string;
    endUtc: string;
    durationMinutes: number;
};

type ApiResponse =
    | { slots: Slot[]; timezone?: string }
    | { error: string };

type Props = {
    teacherId: number;
    teacherTimezone: string; // z.B. "Europe/Zurich"
    avatarUrl?: string | null;
    teacherName?: string | null;

    // optional: wenn du später beim Klick direkt Booking öffnen willst
    onPickSlot?: (slot: Slot) => void;
};

const getBrowserTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const startOfIsoWeek = (dt: DateTime) => dt.startOf("day").minus({ days: dt.weekday - 1 }); // Mon..Sun

const fmtTime = (isoUtc: string, tz: string) =>
    new Intl.DateTimeFormat(undefined, {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(isoUtc));

const fmtDow = (isoUtc: string, tz: string) =>
    new Intl.DateTimeFormat(undefined, {
        timeZone: tz,
        weekday: "short",
    }).format(new Date(isoUtc));

const fmtDayNum = (isoUtc: string, tz: string) =>
    new Intl.DateTimeFormat(undefined, {
        timeZone: tz,
        day: "2-digit",
    }).format(new Date(isoUtc));

const makeKey = (s: Slot) => `${s.startUtc}_${s.endUtc}_${s.durationMinutes}`;

export const TeacherAvailabilityMini = ({
    teacherId,
    teacherTimezone,
    avatarUrl,
    teacherName,
    onPickSlot,
}: Props) => {
    const browserTz = useMemo(() => getBrowserTz(), []);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [slots, setSlots] = useState<Slot[]>([]);

    // 7-Tage-Fenster: aktuelle ISO-Woche (Mon..Sun) in Browser-TZ
    const range = useMemo(() => {
        const now = DateTime.now().setZone(browserTz);
        const weekStartLocal = startOfIsoWeek(now);
        const weekEndLocalExclusive = weekStartLocal.plus({ days: 7 });

        return {
            weekStartLocal,
            weekEndLocalExclusive,
            fromUtcIso: weekStartLocal.toUTC().toISO()!,
            toUtcIso: weekEndLocalExclusive.toUTC().toISO()!,
            daysLocal: Array.from({ length: 7 }).map((_, i) => weekStartLocal.plus({ days: i })),
        };
    }, [browserTz]);

    const load = useMemo(
        () => async () => {
            if (!Number.isFinite(teacherId)) return;

            setLoading(true);
            setError(null);

            try {
                const url = `/api/teachers/${teacherId}/availability?from=${encodeURIComponent(
                    range.fromUtcIso
                )}&to=${encodeURIComponent(range.toUtcIso)}`;

                const res = await fetch(url, { cache: "no-store" });
                const data = (await res.json()) as ApiResponse;

                if (!res.ok) {
                    setError("error" in data ? data.error : `HTTP ${res.status}`);
                    setSlots([]);
                    return;
                }

                if ("slots" in data) {
                    // Optional: du kannst hier filtern, z.B. nur durationMinutes === 30
                    const cleaned = (data.slots || []).filter(
                        (s) => s?.startUtc && s?.endUtc && Number.isFinite(s.durationMinutes)
                    );
                    setSlots(cleaned);
                } else {
                    setSlots([]);
                }
            } catch (e: any) {
                setError(e?.message || "Failed to load availability");
                setSlots([]);
            } finally {
                setLoading(false);
            }
        },
        [teacherId, range.fromUtcIso, range.toUtcIso]
    );

    useEffect(() => {
        load();
    }, [load]);

    // Gruppiere Slots nach Tag (Browser-TZ)
    const slotsByDay = useMemo(() => {
        const map = new Map<string, Slot[]>();

        for (const s of slots) {
            const dayKey = DateTime.fromISO(s.startUtc, { zone: "utc" })
                .setZone(browserTz)
                .toFormat("yyyy-LL-dd");

            const arr = map.get(dayKey) || [];
            arr.push(s);
            map.set(dayKey, arr);
        }

        // sort innerhalb Tag nach Start
        for (const [k, arr] of map.entries()) {
            arr.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
            map.set(k, arr);
        }

        return map;
    }, [slots, browserTz]);

    const teacherTzLabel = teacherTimezone || "Europe/Berlin";

    return (
        <div className={styles.wrap}>
            {/* kleiner Pfeil links wie im Screenshot */}
            <div className={styles.arrow} aria-hidden="true" />

            <div className={styles.inner}>
                <div className={styles.top}>
                    <div className={styles.avatarWrap}>
                        {avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className={styles.avatar} src={avatarUrl} alt={teacherName || "Teacher"} />
                        ) : (
                            <div className={styles.avatarFallback} aria-label="Teacher avatar placeholder">
                                {(teacherName?.trim()?.[0] || "T").toUpperCase()}
                            </div>
                        )}
                    </div>

                    <div className={styles.topText}>
                        <div className={styles.title}>Availability</div>
                        <div className={styles.sub}>
                            Your time: <span className={styles.mono}>{browserTz}</span>
                        </div>
                        <div className={styles.sub}>
                            Teacher time: <span className={styles.mono}>{teacherTzLabel}</span>
                        </div>
                    </div>
                </div>

                <div className={styles.weekHeader}>
                    {range.daysLocal.map((d) => {
                        const iso = d.toUTC().toISO()!;
                        const dow = fmtDow(iso, browserTz);
                        const dayNum = d.toFormat("d");
                        return (
                            <div key={d.toISO()} className={styles.weekHeaderCell}>
                                <div className={styles.weekDow}>{dow}</div>
                                <div className={styles.weekDayNum}>{dayNum}</div>
                            </div>
                        );
                    })}
                </div>

                <div className={styles.grid}>
                    {range.daysLocal.map((d) => {
                        const dayKey = d.toFormat("yyyy-LL-dd");
                        const list = slotsByDay.get(dayKey) || [];

                        // fürs Mini-Preview: zeig max 4 “Pills” pro Tag, Rest als +N
                        const shown = list.slice(0, 4);
                        const hidden = Math.max(0, list.length - shown.length);

                        return (
                            <div key={dayKey} className={styles.cell}>
                                {loading ? (
                                    <div className={styles.skeleton} />
                                ) : error ? (
                                    <div className={styles.error}>{error}</div>
                                ) : list.length === 0 ? (
                                    <div className={styles.empty}>—</div>
                                ) : (
                                    <>
                                        <div className={styles.pills}>
                                            {shown.map((s) => {
                                                const startStudent = fmtTime(s.startUtc, browserTz);
                                                const endStudent = fmtTime(s.endUtc, browserTz);

                                                const startTeacher = fmtTime(s.startUtc, teacherTzLabel);
                                                const endTeacher = fmtTime(s.endUtc, teacherTzLabel);

                                                return (
                                                    <button
                                                        key={makeKey(s)}
                                                        type="button"
                                                        className={styles.pill}
                                                        onClick={() => onPickSlot?.(s)}
                                                        title={`Your time: ${startStudent}–${endStudent}\nTeacher time: ${startTeacher}–${endTeacher}`}
                                                    >
                                                        <span className={styles.pillTop}>
                                                            {startStudent}–{endStudent}
                                                        </span>
                                                        <span className={styles.pillBottom}>
                                                            {startTeacher}–{endTeacher}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {hidden > 0 ? <div className={styles.more}>+{hidden} more</div> : null}
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className={styles.footer}>
                    <button type="button" className={styles.reload} onClick={load} disabled={loading}>
                        {loading ? "Loading…" : "Reload"}
                    </button>
                </div>
            </div>
        </div>
    );
};