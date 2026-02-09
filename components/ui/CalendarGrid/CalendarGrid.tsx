'use client';

import React, { useEffect, useMemo, useState } from 'react';

type Slot = {
    startUtc: string;
    endUtc: string;
    durationMinutes: number;
};

function startOfWeekMonday(d: Date) {
    const date = new Date(d);
    const day = (date.getDay() + 6) % 7; // Mon=0..Sun=6
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - day);
    return date;
}

function addDays(d: Date, days: number) {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x;
}

function toIsoUtc(d: Date) {
    return new Date(d.getTime()).toISOString();
}

function formatDayLabel(d: Date) {
    return d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function minutesSinceMidnightLocal(dt: Date) {
    return dt.getHours() * 60 + dt.getMinutes();
}

export default function CalendarGrid() {
    const [teacherId, setTeacherId] = useState<number | null>(null);
    const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(new Date()));
    const [slots, setSlots] = useState<Slot[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

    useEffect(() => {
        // teacherId = current logged-in user's id (teacher dashboard)
        (async () => {
            const res = await fetch('/api/user', { cache: 'no-store' });
            const data = await res.json();
            setTeacherId(data?.id ?? null);
        })();
    }, []);

    useEffect(() => {
        if (!teacherId) return;

        (async () => {
            setLoading(true);
            setError(null);
            try {
                const from = toIsoUtc(weekStart);
                const to = toIsoUtc(addDays(weekStart, 7));
                const res = await fetch(
                    `/api/teachers/${teacherId}/free-slots?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
                    { cache: 'no-store' }
                );

                if (!res.ok) {
                    const txt = await res.text();
                    throw new Error(txt || `HTTP ${res.status}`);
                }

                const data = await res.json();
                // For grid rendering we only show 30-min slots (your smallest unit)
                const only30 = (data?.slots ?? []).filter((s: Slot) => s.durationMinutes === 30);
                setSlots(only30);
            } catch (e) {
                setError((e as Error).message);
            } finally {
                setLoading(false);
            }
        })();
    }, [teacherId, weekStart]);

    // Build a fast lookup: dayIndex + minute -> true
    const slotMap = useMemo(() => {
        const m = new Map<string, Slot>();
        for (const s of slots) {
            const start = new Date(s.startUtc);
            // show in local time (teacher timezone via browser)
            const dayIndex = (startOfWeekMonday(start).getTime() === weekStart.getTime())
                ? ((start.getDay() + 6) % 7)
                : null;

            if (dayIndex === null) continue;

            const key = `${dayIndex}|${minutesSinceMidnightLocal(start)}`;
            m.set(key, s);
        }
        return m;
    }, [slots, weekStart]);

    const timeRows = useMemo(() => {
        // 06:00 -> 22:00 in 30-min steps (change if you want)
        const start = 6 * 60;
        const end = 22 * 60;
        const rows: number[] = [];
        for (let t = start; t <= end; t += 30) rows.push(t);
        return rows;
    }, []);

    function onSlotClick(slot: Slot) {
        // Later: open booking modal / create booking
        alert(`Slot: ${slot.startUtc} → ${slot.endUtc}`);
    }

    return (
        <div style={{ padding: 16, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <button onClick={() => setWeekStart(addDays(weekStart, -7))}>← Prev</button>
                <button onClick={() => setWeekStart(startOfWeekMonday(new Date()))}>Today</button>
                <button onClick={() => setWeekStart(addDays(weekStart, 7))}>Next →</button>
                <div style={{ marginLeft: 12, opacity: 0.7 }}>
                    {formatDayLabel(weekStart)} – {formatDayLabel(addDays(weekStart, 6))}
                </div>
            </div>

            {loading && <div>Loading…</div>}
            {error && <div style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</div>}
            {!teacherId && <div>Not logged in.</div>}

            {/* Grid */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '80px repeat(7, 1fr)',
                    border: '1px solid #ddd',
                    borderRadius: 8,
                    overflow: 'hidden',
                }}
            >
                {/* Header row */}
                <div style={{ background: '#fafafa', borderRight: '1px solid #ddd', padding: 8 }} />
                {days.map((d, i) => (
                    <div key={i} style={{ background: '#fafafa', borderRight: i === 6 ? 'none' : '1px solid #ddd', padding: 8 }}>
                        <strong>{formatDayLabel(d)}</strong>
                    </div>
                ))}

                {/* Time rows */}
                {timeRows.map((t) => {
                    const hh = String(Math.floor(t / 60)).padStart(2, '0');
                    const mm = String(t % 60).padStart(2, '0');
                    const label = `${hh}:${mm}`;

                    return (
                        <React.Fragment key={t}>
                            <div style={{ borderTop: '1px solid #eee', borderRight: '1px solid #ddd', padding: '6px 8px', fontSize: 12, color: '#444' }}>
                                {label}
                            </div>

                            {days.map((_, dayIndex) => {
                                const key = `${dayIndex}|${t}`;
                                const slot = slotMap.get(key);

                                return (
                                    <div
                                        key={dayIndex}
                                        style={{
                                            borderTop: '1px solid #eee',
                                            borderRight: dayIndex === 6 ? 'none' : '1px solid #eee',
                                            height: 32,
                                            position: 'relative',
                                            background: slot ? '#e9f5ff' : 'white',
                                            cursor: slot ? 'pointer' : 'default',
                                        }}
                                        onClick={() => slot && onSlotClick(slot)}
                                        title={slot ? `${slot.startUtc} → ${slot.endUtc}` : ''}
                                    />
                                );
                            })}
                        </React.Fragment>
                    );
                })}
            </div>

            <div style={{ marginTop: 12, opacity: 0.7, fontSize: 12 }}>
                Showing 30-minute slots only (your minimum lesson length).
            </div>
        </div>
    );
}