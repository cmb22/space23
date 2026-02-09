import Link from "next/link";

export default function BookingSuccessPage({
    searchParams,
}: {
    searchParams?: { bookingId?: string };
}) {
    const bookingId = searchParams?.bookingId;

    return (
        <main style={{ maxWidth: 720, margin: "40px auto", padding: 20 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 10 }}>
                Payment successful ✅
            </h1>

            <p style={{ opacity: 0.8, marginBottom: 16 }}>
                Your lesson is booked.
            </p>

            {bookingId ? (
                <p style={{ opacity: 0.8, marginBottom: 16 }}>
                    Booking ID: <strong>{bookingId}</strong>
                </p>
            ) : null}

            <div style={{ display: "flex", gap: 12 }}>
                <Link href="/teachers">Back to teachers</Link>
                <Link href="/me/bookings">My bookings</Link>
            </div>
        </main>
    );
}