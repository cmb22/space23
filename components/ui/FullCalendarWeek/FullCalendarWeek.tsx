'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateSelectArg, DatesSetArg, EventInput, EventClickArg } from '@fullcalendar/core';

import './fullcalendar.css';

type AtomicAvailabilityRow = {
    id: number;
    teacherId: number;
    startUtc: string;
    endUtc: string;
};

type MergedAvailabilityEvent = {
    id: string;
    start: string;
    end: string;
    title?: string;
    display?: string;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const minutesToHHMM = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${pad2(h)}:${pad2(m)}`;
};

const hhmmToMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

const buildQuarterHourOptions = () => {
    const opts: { label: string; value: string }[] = [];
    for (let m = 0; m < 24 * 60; m += 15) {
        const label = minutesToHHMM(m);
        opts.push({ label, value: label });
    }
    return opts;
};

const timeOptions = buildQuarterHourOptions();
const weekdayOptions = [
    { label: 'Sunday', value: 0 },
    { label: 'Monday', value: 1 },
    { label: 'Tuesday', value: 2 },
    { label: 'Wednesday', value: 3 },
    { label: 'Thursday', value: 4 },
    { label: 'Friday', value: 5 },
    { label: 'Saturday', value: 6 },
];

const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
const addMinutes = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60 * 1000);

const startOfDayUtc = (d: Date) =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));

function isMergedEventArray(x: any): x is MergedAvailabilityEvent[] {
    return Array.isArray(x) && (x.length === 0 || (typeof x[0]?.start === 'string' && typeof x[0]?.end === 'string'));
}

function isAtomicRowArray(x: any): x is AtomicAvailabilityRow[] {
    return Array.isArray(x) && (x.length === 0 || (typeof x[0]?.startUtc === 'string' && typeof x[0]?.endUtc === 'string'));
}

const normalizeToCalendarEvents = (data: any): EventInput[] => {
    if (Array.isArray(data?.events)) return normalizeToCalendarEvents(data.events);

    if (isMergedEventArray(data)) {
        return data.map((e) => ({
            id: e.id,
            start: e.start,
            end: e.end,
            title: e.title ?? '',
            display: e.display ?? 'block',
            backgroundColor: 'rgba(46, 204, 113, 0.28)',
            borderColor: 'rgba(46, 204, 113, 0.28)',
            textColor: 'transparent',
        }));
    }

    if (isAtomicRowArray(data)) {
        return data.map((a) => ({
            id: `av-${a.id}`,
            start: a.startUtc,
            end: a.endUtc,
            title: '',
            display: 'auto',
            backgroundColor: 'rgba(46, 204, 113, 0.28)',
            borderColor: 'rgba(46, 204, 113, 0.28)',
            textColor: 'transparent',
        }));
    }

    return [];
};

export default function FullCalendarWeek() {
    const calendarRef = useRef<FullCalendar | null>(null);

    const [teacherId, setTeacherId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [repeatWeekday, setRepeatWeekday] = useState<number>(2);
    const [repeatStart, setRepeatStart] = useState<string>('09:00');
    const [repeatEnd, setRepeatEnd] = useState<string>('12:00');

    const rangeRef = useRef<{ start: Date; end: Date } | null>(null);

    useEffect(() => {
        (async () => {
            const res = await fetch('/api/user', { cache: 'no-store' });
            const data = await res.json();
            setTeacherId(data?.id ?? null);
        })();
    }, []);

    const apiBase = useMemo(() => {
        if (!teacherId) return null;
        return `/api/teachers/${teacherId}/availability`;
    }, [teacherId]);

    const fetchAvailabilityEvents = async (rangeStart: Date, rangeEnd: Date) => {
        if (!apiBase) return [] as EventInput[];

        const from = rangeStart.toISOString();
        const to = rangeEnd.toISOString();

        const res = await fetch(
            `${apiBase}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&mode=merged`,
            { cache: 'no-store' }
        );

        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        return normalizeToCalendarEvents(data);
    };

    const reloadCalendar = async () => {
        if (!rangeRef.current || !teacherId) return;
        const api = calendarRef.current?.getApi();
        if (!api) return;

        setLoading(true);
        setError(null);
        try {
            const events = await fetchAvailabilityEvents(rangeRef.current.start, rangeRef.current.end);
            api.removeAllEvents();
            api.addEventSource(events);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!teacherId) return;
        if (!rangeRef.current) return;
        reloadCalendar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teacherId]);

    const handleDatesSet = (arg: DatesSetArg) => {
        rangeRef.current = { start: arg.start, end: arg.end };
        if (teacherId) reloadCalendar();
    };

    const handleSelect = async (arg: DateSelectArg) => {
        if (!teacherId || !apiBase) return;

        try {
            const res = await fetch(apiBase, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    startUtc: arg.start.toISOString(),
                    endUtc: arg.end.toISOString(),
                }),
            });

            if (!res.ok) throw new Error(await res.text());
            await reloadCalendar();
        } catch (e) {
            alert((e as Error).message);
        }
    };

    const handleEventClick = async (info: EventClickArg) => {
        if (!teacherId || !apiBase) return;

        // merged block delete by eventId
        if (!info.event.id?.startsWith('av-')) {
            const ok = confirm('Diesen Availability-Block löschen?');
            if (!ok) return;

            const res = await fetch(`${apiBase}?eventId=${encodeURIComponent(info.event.id)}`, { method: 'DELETE' });
            if (!res.ok) {
                alert(await res.text());
                return;
            }

            await reloadCalendar();
            return;
        }

        // atomic row delete by id (optional fallback)
        const availabilityId = Number(info.event.id.slice(3));
        if (!Number.isFinite(availabilityId)) return;

        if (!confirm('Availability löschen?')) return;

        const res = await fetch(`${apiBase}?id=${availabilityId}`, { method: 'DELETE' });
        if (!res.ok) {
            alert(await res.text());
            return;
        }

        await reloadCalendar();
    };

    const applyRepeatWeeklyNext3Months = async () => {
        if (!teacherId || !apiBase) return;

        const startMin = hhmmToMinutes(repeatStart);
        const endMin = hhmmToMinutes(repeatEnd);

        if (endMin <= startMin) {
            alert('Endzeit muss nach Startzeit liegen.');
            return;
        }
        if (startMin % 15 !== 0 || endMin % 15 !== 0) {
            alert('Bitte nur 15-Minuten-Takte verwenden.');
            return;
        }

        const anchor = rangeRef.current?.start ? new Date(rangeRef.current.start) : new Date();
        const anchorDayUtc = startOfDayUtc(anchor);

        const anchorWeekday = anchorDayUtc.getUTCDay();
        const delta = (repeatWeekday - anchorWeekday + 7) % 7;
        const first = addDays(anchorDayUtc, delta);

        const weeks = 13;
        const occurrences: { startUtc: string; endUtc: string }[] = [];

        for (let w = 0; w < weeks; w++) {
            const day = addDays(first, w * 7);
            const start = addMinutes(day, startMin);
            const end = addMinutes(day, endMin);
            occurrences.push({ startUtc: start.toISOString(), endUtc: end.toISOString() });
        }

        setLoading(true);
        setError(null);
        try {
            for (const occ of occurrences) {
                const res = await fetch(apiBase, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(occ),
                });
                if (!res.ok) throw new Error(await res.text());
            }
            await reloadCalendar();
        } catch (e) {
            setError((e as Error).message);
            alert((e as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                <strong>Mode:</strong>
                <span style={{ fontWeight: 700, opacity: 0.85 }}>Add availability</span>

                <span style={{ marginLeft: 12, fontWeight: 700 }}>Repeat weekly (next ~3 months):</span>

                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    Day
                    <select value={repeatWeekday} onChange={(e) => setRepeatWeekday(Number(e.target.value))}>
                        {weekdayOptions.map((w) => (
                            <option key={w.value} value={w.value}>
                                {w.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    Start
                    <select value={repeatStart} onChange={(e) => setRepeatStart(e.target.value)}>
                        {timeOptions.map((t) => (
                            <option key={t.value} value={t.value}>
                                {t.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    End
                    <select value={repeatEnd} onChange={(e) => setRepeatEnd(e.target.value)}>
                        {timeOptions.map((t) => (
                            <option key={t.value} value={t.value}>
                                {t.label}
                            </option>
                        ))}
                    </select>
                </label>

                <button onClick={applyRepeatWeeklyNext3Months} disabled={loading || !teacherId}>
                    Apply
                </button>

                {loading && <span style={{ opacity: 0.7 }}>Loading…</span>}
            </div>

            {error && <div style={{ color: 'crimson', whiteSpace: 'pre-wrap', marginBottom: 8 }}>{error}</div>}
            {!teacherId && <div>Not logged in.</div>}

            <FullCalendar
                ref={(r) => {
                    calendarRef.current = r;
                }}
                plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
                initialView="timeGridWeek"
                allDaySlot={false}
                nowIndicator={true}
                height="auto"
                firstDay={1}
                selectable={true}
                selectMirror={true}
                select={handleSelect}
                eventClick={handleEventClick}
                slotDuration="00:15:00"
                slotLabelInterval="01:00:00"
                datesSet={handleDatesSet}
                events={[]}
                headerToolbar={{
                    left: 'today',
                    center: '',
                    right: 'prev title next',
                }}
            />
        </div>
    );
}