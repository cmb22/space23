"use client";

import React, { useEffect, useMemo, useState } from "react";
import { TeacherAvatarUpload } from "@/components/teacher/TeacherAvatarUpload/TeacherAvatarUpload";

type Offer = {
    id?: number;
    durationMinutes: 30 | 45 | 60;
    priceCents: number;
    currency: string;
    active: boolean;
};

type TeacherProfile = {
    id: number;
    userId: number;
    bio: string | null;
    languages: string[];
    timezone: string;
    currency: string;
    qualifications: string | null;
    avatarUrl: string | null;
    videoUrl: string | null;
    videoSource: "local" | "youtube" | string;
    createdAt: string;
    updatedAt: string;
};

type ApiResponse = {
    profile: TeacherProfile | null;
    offers: Offer[];
};

function centsToDisplay(cents: number): string {
    const v = cents / 100;
    return Number.isFinite(v) ? v.toFixed(2) : "0.00";
}

function displayToCents(input: string): number {
    const normalized = input.replace(",", ".").trim();
    const value = Number(normalized);
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.round(value * 100);
}

function ensureOfferSet(offers: Offer[], currencyFallback: string): Offer[] {
    const byDur = new Map<number, Offer>();
    for (const o of offers) byDur.set(o.durationMinutes, o);

    const make = (d: 30 | 45 | 60): Offer => ({
        durationMinutes: d,
        priceCents: byDur.get(d)?.priceCents ?? 0,
        currency: byDur.get(d)?.currency ?? currencyFallback,
        active: byDur.get(d)?.active ?? true,
        id: byDur.get(d)?.id,
    });

    return [make(30), make(45), make(60)];
}

export default function ProfilePage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const [timezone, setTimezone] = useState("Europe/Berlin");
    const [currency, setCurrency] = useState("EUR");
    const [bio, setBio] = useState("");
    const [qualifications, setQualifications] = useState("");
    const [languagesText, setLanguagesText] = useState("");

    const [offers, setOffers] = useState<Offer[]>([
        { durationMinutes: 30, priceCents: 0, currency: "EUR", active: true },
        { durationMinutes: 45, priceCents: 0, currency: "EUR", active: true },
        { durationMinutes: 60, priceCents: 0, currency: "EUR", active: true },
    ]);

    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

    // keep video as a simple URL (no upload yet)
    const [videoUrl, setVideoUrl] = useState<string>("");

    const languagesArray = useMemo(() => {
        return languagesText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
    }, [languagesText]);

    async function load() {
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await fetch("/api/teacher/profile", { cache: "no-store" });
            const data = (await res.json()) as ApiResponse | { error?: string };

            if (!res.ok) {
                setError((data as any)?.error || `Failed to load (HTTP ${res.status})`);
                return;
            }

            const ok = data as ApiResponse;

            if (ok.profile) {
                setTimezone(ok.profile.timezone || "Europe/Berlin");
                setCurrency(ok.profile.currency || "EUR");
                setBio(ok.profile.bio ?? "");
                setQualifications(ok.profile.qualifications ?? "");
                setLanguagesText((ok.profile.languages || []).join(", "));
                setAvatarUrl(ok.profile.avatarUrl ?? null);
                setVideoUrl(ok.profile.videoUrl ?? "");
            } else {
                setTimezone("Europe/Berlin");
                setCurrency("EUR");
                setBio("");
                setQualifications("");
                setLanguagesText("");
                setAvatarUrl(null);
                setVideoUrl("");
            }

            const mergedOffers = ensureOfferSet(
                (ok.offers || []) as Offer[],
                ok.profile?.currency || "EUR"
            );
            setOffers(mergedOffers);
        } catch (e: any) {
            setError(e?.message || "Failed to load profile");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    function updateOffer(durationMinutes: 30 | 45 | 60, patch: Partial<Offer>) {
        setOffers((prev) =>
            prev.map((o) =>
                o.durationMinutes === durationMinutes ? { ...o, ...patch } : o
            )
        );
    }

    async function onSave(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const payload = {
                bio: bio.trim() ? bio : null,
                languages: languagesArray,
                timezone,
                currency,
                qualifications: qualifications.trim() ? qualifications : null,
                offers: offers.map((o) => ({
                    durationMinutes: o.durationMinutes,
                    priceCents: Number.isFinite(o.priceCents) ? o.priceCents : 0,
                    currency: currency,
                    active: !!o.active,
                })),
                // avatarUrl is handled by /api/teacher/avatar
                // videoUrl not stored yet (we'll add next)
            };

            const res = await fetch("/api/teacher/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = (await res.json()) as any;
            if (!res.ok) {
                setError(data?.error || `Failed to save (HTTP ${res.status})`);
                return;
            }

            setSuccess("Saved.");
            await load();
        } catch (e: any) {
            setError(e?.message || "Failed to save profile");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="wrap">
            <h1 className="title">Teacher Profile</h1>
            <p className="muted">
                Configure what students will see (bio, languages, prices). Avatar upload
                is enabled.
            </p>

            {loading ? (
                <div className="card">Loading…</div>
            ) : (
                <form onSubmit={onSave} className="card">
                    <div className="section">
                        <h2 className="subtitle">Avatar</h2>
                        <div className="help">
                            Upload an image. It will be stored under{" "}
                            <code>/public/uploads</code>.
                        </div>

                        <div style={{ marginTop: 10 }}>
                            <TeacherAvatarUpload
                                initialUrl={avatarUrl}
                                onUploaded={(newUrl) => {
                                    setAvatarUrl(newUrl);
                                    setSuccess("Avatar uploaded.");
                                }}
                            />
                        </div>
                    </div>

                    <div className="section">
                        <h2 className="subtitle">Basics</h2>

                        <div className="row">
                            <div className="field">
                                <label>Timezone</label>
                                <input
                                    value={timezone}
                                    onChange={(e) => setTimezone(e.target.value)}
                                    placeholder="Europe/Berlin"
                                />
                                <div className="help">Example: Europe/Berlin, Europe/Zurich</div>
                            </div>

                            <div className="field">
                                <label>Currency</label>
                                <input
                                    value={currency}
                                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                                    placeholder="EUR"
                                    maxLength={3}
                                />
                                <div className="help">3-letter code: EUR, CHF, USD</div>
                            </div>
                        </div>

                        <div className="field">
                            <label>Languages (comma-separated)</label>
                            <input
                                value={languagesText}
                                onChange={(e) => setLanguagesText(e.target.value)}
                                placeholder="German, English, French"
                            />
                        </div>

                        <div className="field">
                            <label>Bio</label>
                            <textarea
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                rows={5}
                                placeholder="Short intro that students will see…"
                            />
                        </div>

                        <div className="field">
                            <label>Qualifications</label>
                            <textarea
                                value={qualifications}
                                onChange={(e) => setQualifications(e.target.value)}
                                rows={4}
                                placeholder="Certificates, experience, etc…"
                            />
                        </div>
                    </div>

                    <div className="section">
                        <h2 className="subtitle">Lesson offers</h2>
                        <div className="help">Enter e.g. 30.00</div>

                        <table className="table">
                            <thead>
                                <tr>
                                    <th style={{ width: 120 }}>Duration</th>
                                    <th style={{ width: 220 }}>Price ({currency})</th>
                                    <th style={{ width: 120 }}>Active</th>
                                </tr>
                            </thead>
                            <tbody>
                                {offers.map((o) => (
                                    <tr key={o.durationMinutes}>
                                        <td>{o.durationMinutes} min</td>
                                        <td>
                                            <input
                                                value={centsToDisplay(o.priceCents)}
                                                onChange={(e) =>
                                                    updateOffer(o.durationMinutes, {
                                                        priceCents: displayToCents(e.target.value),
                                                    })
                                                }
                                                inputMode="decimal"
                                            />
                                        </td>
                                        <td>
                                            <label className="switch">
                                                <input
                                                    type="checkbox"
                                                    checked={o.active}
                                                    onChange={(e) =>
                                                        updateOffer(o.durationMinutes, {
                                                            active: e.target.checked,
                                                        })
                                                    }
                                                />
                                                <span>enabled</span>
                                            </label>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="section">
                        <h2 className="subtitle">Video (URL only for now)</h2>
                        <div className="help">
                            Upload comes later. For MVP you can paste a URL.
                        </div>

                        <div className="field">
                            <label>Video URL</label>
                            <input
                                value={videoUrl}
                                onChange={(e) => setVideoUrl(e.target.value)}
                                placeholder="https://..."
                            />
                            <div className="help">
                                Not saved yet. Next step we’ll store this to DB.
                            </div>
                        </div>
                    </div>

                    {error && <div className="alert error">{error}</div>}
                    {success && <div className="alert ok">{success}</div>}

                    <div className="actions">
                        <button type="button" onClick={load} disabled={saving}>
                            Reload
                        </button>
                        <button type="submit" disabled={saving}>
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                </form>
            )}

            <style jsx>{`
        .wrap {
          max-width: 900px;
          margin: 24px auto;
          padding: 0 16px 48px;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto,
            Arial;
        }
        .title {
          font-size: 28px;
          margin: 0 0 6px;
        }
        .muted {
          margin: 0 0 16px;
          opacity: 0.75;
        }
        .card {
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 12px;
          padding: 16px;
          background: #fff;
        }
        .row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 12px;
        }
        label {
          font-weight: 600;
        }
        input,
        textarea {
          border: 1px solid rgba(0, 0, 0, 0.2);
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 14px;
        }
        textarea {
          resize: vertical;
        }
        .help {
          font-size: 12px;
          opacity: 0.7;
        }
        .section {
          margin-top: 18px;
        }
        .subtitle {
          font-size: 18px;
          margin: 0 0 6px;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        th,
        td {
          border-top: 1px solid rgba(0, 0, 0, 0.08);
          padding: 10px 8px;
          text-align: left;
        }
        th {
          font-size: 13px;
          opacity: 0.8;
        }
        .switch {
          display: inline-flex;
          gap: 8px;
          align-items: center;
          font-size: 14px;
        }
        .alert {
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 10px;
          font-size: 14px;
        }
        .error {
          background: rgba(255, 0, 0, 0.08);
          border: 1px solid rgba(255, 0, 0, 0.2);
        }
        .ok {
          background: rgba(0, 200, 0, 0.08);
          border: 1px solid rgba(0, 200, 0, 0.2);
        }
        .actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 14px;
        }
        button {
          border: 1px solid rgba(0, 0, 0, 0.2);
          border-radius: 10px;
          padding: 10px 14px;
          background: #fff;
          cursor: pointer;
          font-weight: 600;
        }
        button[disabled] {
          opacity: 0.6;
          cursor: not-allowed;
        }
        @media (max-width: 720px) {
          .row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
        </div>
    );
}