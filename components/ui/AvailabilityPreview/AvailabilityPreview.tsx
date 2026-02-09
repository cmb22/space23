"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./AvailabilityPreview.module.css";

type BlockKey = "6-12" | "13-18" | "18-00" | "00-06";

type ApiResponse = {
    timezone: string;
    monthLabel: string;
    dayNumbers: number[];
    grid: Record<BlockKey, boolean[]>;
    error?: string;
};

const DAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;

export const AvailabilityPreview = ({ teacherId }: { teacherId: number }) => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ApiResponse | null>(null);

    const fetchPreview = useMemo(
        () => async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/teachers/${teacherId}/availability-preview`, {
                    cache: "no-store",
                });
                const json = (await res.json()) as ApiResponse;
                if (!res.ok) {
                    setData({ ...json, error: json?.error || `HTTP ${res.status}` });
                    return;
                }
                setData(json);
            } catch (e: any) {
                setData({
                    timezone: "Europe/Berlin", monthLabel: "", dayNumbers: [], grid: {
                        "6-12": [false, false, false, false, false, false, false],
                        "13-18": [false, false, false, false, false, false, false],
                        "18-00": [false, false, false, false, false, false, false],
                        "00-06": [false, false, false, false, false, false, false],
                    }, error: e?.message || "Failed to load preview"
                });
            } finally {
                setLoading(false);
            }
        },
        [teacherId]
    );

    useEffect(() => {
        fetchPreview();
    }, [fetchPreview]);

    const monthLabel = data?.monthLabel || "—";
    const dayNumbers = data?.dayNumbers?.length === 7 ? data.dayNumbers : ["" as any, "" as any, "" as any, "" as any, "" as any, "" as any, "" as any];
    const tz = data?.timezone || "Europe/Berlin";

    const grid = data?.grid;

    const rows: Array<{ label: BlockKey; key: BlockKey }> = [
        { label: "6-12", key: "6-12" },
        { label: "13-18", key: "13-18" },
        { label: "18-00", key: "18-00" },
        { label: "00-06", key: "00-06" },
    ];

    return (


        <div className={styles.wrap}>

            <div className={styles.month}>{loading ? "Loading…" : monthLabel}</div>

            <div className={styles.gridWrap}>
                <div className={styles.grid}>
                    {/* Header row */}
                    <div className={`${styles.cell} ${styles.corner}`}>TIME</div>
                    {DAYS.map((d, i) => (
                        <div key={d + i} className={`${styles.cell} ${styles.dayHead}`}>
                            <div className={styles.dayLetter}>{d}</div>
                            <div className={styles.dayNum}>{dayNumbers[i] ?? ""}</div>
                        </div>
                    ))}

                    {/* Body rows */}
                    {rows.map((r) => (
                        <div key={r.key} className={styles.row}>
                            <div className={`${styles.cell} ${styles.timeCell}`}>{r.label}</div>
                            {Array.from({ length: 7 }).map((_, col) => {
                                const on = !!grid?.[r.key]?.[col];
                                return (
                                    <div
                                        key={`${r.key}-${col}`}
                                        className={`${styles.cell} ${styles.slot} ${on ? styles.on : styles.off}`}
                                        aria-label={`${r.key} ${col} ${on ? "available" : "not available"}`}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            <div className={styles.foot}>
                Based on your timezone: <strong>{tz}</strong>
            </div>

            <button className={styles.fullBtn} type="button">
                View Full Schedule <span className={styles.chev}>▾</span>
            </button>

            {data?.error ? <div className={styles.error}>{data.error}</div> : null}
        </div>

    );
};