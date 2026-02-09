"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./TeachersList.module.css";
import { AvailabilityPreview } from "@/components/ui/AvailabilityPreview/AvailabilityPreview";
import { BookingModal } from "@/components/BookingModal/BookingModal";

type TeacherRow = {
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
  fromPriceCents: number | null;
};

type Slot = {
  startUtc: string;
  endUtc: string;
  durationMinutes: number;
};

const formatPrice = (cents: number | null, currency: string) => {
  if (cents == null) return "No price";
  const major = (cents / 100).toFixed(0);
  const symbol = currency === "EUR" ? "€" : currency === "CHF" ? "CHF" : currency;
  return `${symbol} ${major} / hour`;
};

const truncate = (text: string, max = 140) => {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, "") + "…";
};

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const formatLocalTime = (isoUtc: string) => {
  const d = new Date(isoUtc);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const formatLocalDayLabel = (isoUtc: string) => {
  const d = new Date(isoUtc);
  // short & predictable; you can switch to locale later
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  const date = d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
  return `${weekday} ${date}`;
};

const groupSlotsByDay = (slots: Slot[]) => {
  const map = new Map<string, Slot[]>();
  for (const s of slots) {
    const key = new Date(s.startUtc).toDateString();
    const arr = map.get(key) ?? [];
    arr.push(s);
    map.set(key, arr);
  }
  const days = Array.from(map.entries()).map(([key, items]) => ({
    key,
    label: formatLocalDayLabel(items[0].startUtc),
    slots: items.sort((a, b) => a.startUtc.localeCompare(b.startUtc) || a.durationMinutes - b.durationMinutes),
  }));
  // keep chronological by first slot
  days.sort((a, b) => a.slots[0].startUtc.localeCompare(b.slots[0].startUtc));
  return days;
};

const makeRangeIso = () => {
  // next 7 days range in UTC, inclusive start / exclusive end
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
};

const MiniAvailability = ({
  teacherId,
  onPickSlot,
}: {
  teacherId: number;
  onPickSlot: (slot: Slot) => void;
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const { fromIso, toIso } = makeRangeIso();
        const qs = new URLSearchParams({ from: fromIso, to: toIso });
        const res = await fetch(`/api/teachers/${teacherId}/free-slots?${qs.toString()}`, { cache: "no-store" });
        const data = (await res.json()) as any;

        if (!res.ok) {
          if (!cancelled) setError(data?.error || `HTTP ${res.status}`);
          if (!cancelled) setSlots([]);
          return;
        }

        const list = Array.isArray(data?.slots) ? (data.slots as Slot[]) : [];
        if (!cancelled) setSlots(list);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load slots");
        if (!cancelled) setSlots([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [teacherId]);

  if (loading) {
    return <div className={styles.miniCalLoading}>Loading slots…</div>;
  }

  if (error) {
    return <div className={styles.miniCalError}>Could not load slots: {error}</div>;
  }

  if (slots.length === 0) {
    return <div className={styles.miniCalEmpty}>No free slots in the next 7 days.</div>;
  }

  const days = groupSlotsByDay(slots);

  return (
    <div className={styles.miniCal}>
      <div className={styles.miniCalHeader}>
        <div className={styles.miniCalTitle}>Availability</div>
        <div className={styles.miniCalSub}>Next 7 days</div>
      </div>

      <div className={styles.miniCalDays}>
        {days.slice(0, 5).map((d) => (
          <div key={d.key} className={styles.miniCalDay}>
            <div className={styles.miniCalDayLabel}>{d.label}</div>

            <div className={styles.miniCalSlotGrid}>
              {d.slots.slice(0, 10).map((s) => (
                <button
                  key={`${s.startUtc}-${s.durationMinutes}`}
                  className={styles.miniCalSlot}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onPickSlot(s);
                  }}
                  title={`${formatLocalTime(s.startUtc)} (${s.durationMinutes}m)`}
                >
                  {formatLocalTime(s.startUtc)}
                  <span className={styles.miniCalSlotDur}>{s.durationMinutes}m</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.miniCalHint}>
        Click a time to book. (We’ll plug this into Stripe checkout next.)
      </div>
    </div>
  );
};

export const TeachersList = ({ teachers }: { teachers: TeacherRow[] }) => {
  const router = useRouter();

  const [openTeacherId, setOpenTeacherId] = useState<number | null>(null);
  const [hoverTeacherId, setHoverTeacherId] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const openTeacher = useMemo(
    () => teachers.find((t) => t.id === openTeacherId) ?? null,
    [openTeacherId, teachers]
  );

  return (
    <div className={styles.page}>
      {/* FILTER BAR (visual only for now) */}
      <section className={styles.filters}>
        <div className={styles.filtersInner}>
          <button className={styles.filterPill} type="button">
            <span className={styles.pillIcon}>🌐</span>
            Language <span className={styles.chev}>▾</span>
          </button>

          <button className={styles.filterPill} type="button">
            <span className={styles.pillIcon}>🏷️</span>
            Lesson Category <span className={styles.chev}>▾</span>
          </button>

          <button className={styles.filterPill} type="button">
            <span className={styles.pillIcon}>🕒</span>
            Lesson time <span className={styles.chev}>▾</span>
          </button>

          <button className={styles.filterPill} type="button">
            <span className={styles.pillIcon}>🧑‍🏫</span>
            Native speaker <span className={styles.chev}>▾</span>
          </button>

          <button className={styles.filterPill} type="button">
            <span className={styles.pillIcon}>€</span>
            Price <span className={styles.chev}>▾</span>
          </button>

          <div className={styles.filtersRight}>
            <button className={styles.filterPill} type="button">
              <span className={styles.pillIcon}>⛃</span>
              More <span className={styles.chev}>▾</span>
            </button>
          </div>
        </div>
      </section>

      {/* LIST */}
      <main className={styles.main}>
        <div className={styles.list}>
          {teachers.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyTitle}>No teachers yet</div>
              <div className={styles.emptyText}>Add some teacher profiles and they will show here.</div>
            </div>
          ) : (
            teachers.map((t) => {
              const displayName = t.name?.trim() || t.email;
              const bio = t.bio?.trim() || "No bio yet.";
              const price = formatPrice(t.fromPriceCents, t.currency);
              const langs = (t.languages || []).slice(0, 2);
              const extraLangCount = Math.max(0, (t.languages?.length || 0) - langs.length);

              return (
                <section
                  key={t.id}
                  className={styles.row}
                  onMouseEnter={() => setHoverTeacherId(t.id)}
                  onMouseLeave={() => setHoverTeacherId((cur) => (cur === t.id ? null : cur))}
                >
                  {/* LEFT CARD */}
                  <div
                    className={styles.card}
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(`/teachers/${t.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/teachers/${t.id}`);
                      }
                    }}
                  >
                    <Link
                      className={styles.cardLinkArea}
                      href={`/teachers/${t.id}`}
                      aria-label={`Open teacher ${displayName}`}
                    />

                    <div className={styles.cardInner}>
                      <div className={styles.avatarWrap}>
                        {t.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className={styles.avatar} src={t.avatarUrl} alt={displayName} />
                        ) : (
                          <div className={styles.avatarFallback}>
                            {(displayName[0] || "T").toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className={styles.cardBody}>
                        <div className={styles.topRow}>
                          <div>
                            <div className={styles.name}>{displayName}</div>
                            <div className={styles.sub}>Professional Teacher</div>
                          </div>

                          <button
                            type="button"
                            className={styles.heart}
                            title="Save"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          >
                            ♡
                          </button>
                        </div>

                        <div className={styles.speaksRow}>
                          <div className={styles.speaksLabel}>Speaks:</div>

                          <div className={styles.langBadges}>
                            {langs.length ? (
                              langs.map((l) => (
                                <span key={l} className={styles.langBadge}>
                                  {l}
                                </span>
                              ))
                            ) : (
                              <span className={styles.langBadgeMuted}>—</span>
                            )}

                            {extraLangCount > 0 && (
                              <span className={styles.langBadgeMuted}>+{extraLangCount}</span>
                            )}
                          </div>
                        </div>

                        <div className={styles.bio}>{truncate(bio, 150)}</div>

                        <div className={styles.metaRow}>
                          <div className={styles.rating}>
                            <span className={styles.star}>★</span>
                            <span className={styles.ratingValue}>4.9</span>
                            <span className={styles.dot}>·</span>
                            <span className={styles.lessons}>369 Lessons</span>
                          </div>
                        </div>

                        <div className={styles.bottomRow}>
                          <div className={styles.price}>{price}</div>

                          <button
                            type="button"
                            className={styles.bookBtn}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedSlot(null);
                              setOpenTeacherId(t.id);
                            }}
                          >
                            Book Lesson
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT PREVIEW — ONLY VISIBLE ON HOVER (desktop) */}
                  <div className={`${styles.preview} ${hoverTeacherId === t.id ? styles.previewVisible : ""}`}
                    aria-hidden={hoverTeacherId === t.id ? "false" : "true"}>
                    <div className={styles.previewMedia}>
                      {t.avatarUrl ? (
                        <img
                          src={t.avatarUrl}
                          alt=""
                          className={styles.previewImage}
                        />
                      ) : (
                        <div className={styles.previewPlaceholder} />
                      )}

                      <div className={styles.playOverlay}>▶</div>
                    </div>

                    <div className={styles.calendarWrap}>


                      {/* MINI CALENDAR COMPONENT */}
                      <AvailabilityPreview teacherId={t.id} />

                      <div className={styles.timezone}>
                        Based on your timezone: Europe/Berlin (UTC +02:00)
                      </div>

                      <button className={styles.fullScheduleBtn}>
                        View Full Schedule ▾
                      </button>
                    </div>

                  </div>
                  {/* <div
                    className={`${styles.preview} ${hoverTeacherId === t.id ? styles.previewVisible : ""}`}
                    aria-hidden={hoverTeacherId === t.id ? "false" : "true"}
                  >
                    <MiniAvailability
                      teacherId={t.id}
                      onPickSlot={(slot) => {
                        setSelectedSlot(slot);
                        setOpenTeacherId(t.id);
                      }}
                    />
                  </div> */}
                </section>
              );
            })
          )}
        </div>
      </main>

      {openTeacher && (
        <BookingModal
          teacherId={openTeacherId ?? 0}
          open={openTeacherId !== null}
          onClose={() => setOpenTeacherId(null)}
        />
      )}
    </div>
  );
};