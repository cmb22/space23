import styles from "./LandingHero.module.css";

type Props = {
    titleTop?: string;
    titleMain: string;
    subtitle: string;
    ctaLabel: string;
};

export const LandingHero = ({
    titleTop = "Spaceship Languages",
    titleMain,
    subtitle,
    ctaLabel,
}: Props) => {
    return (
        <section className={styles.hero} aria-label="Landing hero">
            {/* THE WAVE (from public/background.svg) */}
            <img
                className={styles.wave}
                src="/background.svg"
                alt=""
                aria-hidden="true"
                draggable={false}
            />
            <div className={styles.waveOverlay} />
            <div className={styles.inner}>
                <div className={styles.left}>
                    <div className={styles.kicker}>{titleTop}</div>

                    <h1 className={styles.title}>
                        {titleMain.split("\n").map((line, idx) => (
                            <span key={idx} className={styles.titleLine}>
                                {line}
                            </span>
                        ))}
                    </h1>

                    <p className={styles.subtitle}>{subtitle}</p>

                    <div className={styles.ctaRow}>
                        <button type="button" className={styles.ctaButton}>
                            {ctaLabel}
                        </button>
                    </div>
                </div>

                <aside className={styles.right} aria-label="How it works">
                    <div className={styles.howCard}>
                        <div className={styles.howTitle}>How it works</div>
                        <ul className={styles.howList}>
                            <li>Choose a teacher</li>
                            <li>Pick a slot</li>
                            <li>Book Lesson</li>
                        </ul>
                    </div>
                </aside>
            </div>


        </section>
    );
};