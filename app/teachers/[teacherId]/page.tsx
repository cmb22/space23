import TeacherDetailClient from "./TeacherDetailClient";

export default async function TeacherDetailPage({
    params,
}: {
    params: Promise<{ teacherId: string }>;
}) {
    const { teacherId } = await params;

    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/teachers/${teacherId}`, {
        cache: "no-store",
    });

    // wenn nicht ok: erst TEXT lesen, nicht JSON
    if (!res.ok) {
        const text = await res.text();
        return (
            <div style={{ padding: 24 }}>
                <h1>Teacher</h1>
                <p>API error: HTTP {res.status}</p>
                <pre style={{ whiteSpace: "pre-wrap", opacity: 0.8 }}>{text}</pre>
            </div>
        );
    }

    // ok -> JSON
    const data = await res.json();

    return (
        <TeacherDetailClient teacherId={Number(teacherId)} initial={data} />
    );
}