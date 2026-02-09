"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./TeacherDetail.module.css";

type Offer = {
    id?: number;
    durationMinutes: 30 | 45 | 60;
    priceCents: number;
    currency: string;
    active: boolean;
};

type Teacher = {
    id: number;
    name: string | null;
    email: string;
    bio: string | null;
    languages: string[];
    timezone: string;
    currency: string;
    avatarUrl: string | null;
    videoUrl: string | null;
    videoSource: string | null;
};

type Slot = {
    startUtc: string;
    endUtc: string;
    durationMinutes: number;
};

type Initial = {
    teacher: Teacher;
    offers: Offer[];
};

function money(cents: number, currency: string) {
    const v = cents / 100;
    return `${v.toFixed(2)} ${currency}`;
}

function toIso(d: Date) {
    return d.toISOString();
}

export default function TeacherDetailClient({
    teacherId,
    initial,
}: {
    teacherId: number;
    initial: Initial;
}) {
    const teacher = initial.teacher;
    const offers = initial.offers.filter((o) => o.active);

    const [duration, setDuration] = useState<30 | 45 | 60>(
        (offers[0]?.durationMinutes as 30 | 45 | 60) || 30
    );
    const [slots, setSlots] = useState<Slot[]>([]);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Woche (UTC) – für MVP ok
    const range = useMemo(() => {
        const from = new Date();
        from.setUTCHours(0, 0, 0, 0);
        const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
        return { from, to };
    }, []);

    const selectedOffer = useMemo(() => {
        return offers.find((o) => o.durationMinutes === duration) || null;
    }, [offers, duration]);

    const loadSlots = async () => {
        setLoadingSlots(true);
        setError(null);
        try {
            const url =
                `/api/teachers/${teacherId}/free-slots?from=${encodeURIComponent(
                    toIso(range.from)
                )}&to=${encodeURIComponent(toIso(range.to))}`;

            const res = await fetch(url, { cache: "no-store" });
            const data = await res.json();

            if (!res.ok) {
                setError(data?.error || `Failed to load slots (HTTP ${res.status})`);
                setSlots([]);
                return;
            }

            const all: Slot[] = (data?.slots || []) as Slot[];
            // filter auf gewählte Dauer
            setSlots(all.filter((s) => s.durationMinutes === duration));
        } catch (e: any) {
            setError(e?.message || "Failed to load slots");
            setSlots([]);
        } finally {
            setLoadingSlots(false);
        }
    };

    useEffect(() => {
        loadSlots();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [duration]);

    const onBook = async (slot: Slot) => {
        setError(null);
        try {
            // Wir bauen gleich /api/bookings/checkout – aktuell nur placeholder:
            const res = await fetch("/api/bookings/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    teacherId,
                    startUtc: slot.startUtc,
                    durationMinutes: slot.durationMinutes,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                setError(data?.error || `Checkout failed (HTTP ${res.status})`);
                return;
            }

            if (data?.url) window.location.href = data.url;
            else setError("Checkout URL missing.");
        } catch (e: any) {
            setError(e?.message || "Checkout failed");
        }
    };

    return (
        <div className={styles.wrap}>
            <div className={styles.header}>
                <div className={styles.avatar}>
                    {teacher.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={teacher.avatarUrl} alt="avatar" />
                    ) : (
                        <div className={styles.avatarFallback} />
                    )}
                </div>

                <div className={styles.headText}>
                    <h1 className={styles.title}>
                        {teacher.name || teacher.email}
                    </h1>
                    <div className={styles.meta}>
                        <span>{teacher.timezone}</span>
                        <span>•</span>
                        <span>{teacher.currency}</span>
                    </div>
                    {teacher.languages?.length ? (
                        <div className={styles.tags}>
                            {teacher.languages.map((l) => (
                                <span key={l} className={styles.tag}>
                                    {l}
                                </span>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>

            {teacher.bio ? <p className={styles.bio}>{teacher.bio}</p> : null}

            <div className={styles.card}>
                <div className={styles.row}>
                    <div>
                        <div className={styles.label}>Duration</div>
                        <div className={styles.pills}>
                            {[30, 45, 60].map((d) => {
                                const offer = offers.find((o) => o.durationMinutes === d);
                                const disabled = !offer;
                                return (
                                    <button
                                        key={d}
                                        type="button"
                                        className={`${styles.pill} ${duration === d ? styles.pillActive : ""}`}
                                        onClick={() => setDuration(d as 30 | 45 | 60)}
                                        disabled={disabled}
                                        title={disabled ? "Not offered" : ""}
                                    >
                                        {d} min
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <div className={styles.label}>Price</div>
                        <div className={styles.price}>
                            {selectedOffer
                                ? money(selectedOffer.priceCents, selectedOffer.currency)
                                : "—"}
                        </div>
                    </div>
                </div>

                <div className={styles.section}>
                    <div className={styles.sectionTitle}>Free slots (next 7 days)</div>

                    {loadingSlots ? (
                        <div className={styles.muted}>Loading slots…</div>
                    ) : slots.length === 0 ? (
                        <div className={styles.muted}>No slots available for this duration.</div>
                    ) : (
                        <div className={styles.slots}>
                            {slots.map((s) => (
                                <div key={s.startUtc + "-" + s.durationMinutes} className={styles.slotRow}>
                                    <div className={styles.slotTime}>
                                        {new Date(s.startUtc).toLocaleString()}
                                    </div>
                                    <button className={styles.bookBtn} onClick={() => onBook(s)}>
                                        Book
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {error ? <div className={styles.error}>{error}</div> : null}
                </div>
            </div>
        </div>
    );
}