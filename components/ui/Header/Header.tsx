import Link from "next/link";
import Image from "next/image";

import { auth } from "@/auth";
import styles from "./Header.module.css";

export const Header = async () => {
  const session = await auth();
  const isAuthed = !!session?.user;

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          {/* NOTE: ensure this file exists in /public (e.g. /public/logo.svg). */}
          <span className={styles.logoWrap} aria-hidden="true">
            <Image
              src="/logo.svg"
              alt=""
              width={144}
              height={144}
              priority
            />
          </span>

        </Link>

        <nav className={styles.nav} aria-label="Primary">
          <Link className={styles.navLink} href="/teachers">
            Find a teacher
          </Link>
          <Link className={styles.navLink} href="/practice">
            AI practice
          </Link>
        </nav>

        <div className={styles.actions}>
          {isAuthed ? (
            <Link className={styles.button} href="/dashboard">
              Dashboard
            </Link>
          ) : null}

          <Link
            className={`${styles.button} ${styles.primary}`}
            href={isAuthed ? "/dashboard" : "/sign-in"}
          >
            {isAuthed ? "Go to app" : "Log in"}
          </Link>
        </div>
      </div>
    </header>
  );
};
