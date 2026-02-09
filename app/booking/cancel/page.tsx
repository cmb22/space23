import Link from "next/link";

export default function BookingCancelPage() {
    return (
        <main style={{ maxWidth: 720, margin: "40px auto", padding: 20 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 10 }}>
                Payment canceled ❌
            </h1>

            <p style={{ opacity: 0.8, marginBottom: 16 }}>
                No worries — you can try another slot.
            </p>

            <div style={{ display: "flex", gap: 12 }}>
                <Link href="/teachers">Back to teachers</Link>
            </div>
        </main>
    );
}