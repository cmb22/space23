"use client";

import { useState } from "react";


type TProps = {
    initialUrl: string | null;
    onUploaded?: (newUrl: string) => void;
};


export function TeacherAvatarUpload({ initialUrl, onUploaded }: TProps) {
    const [url, setUrl] = useState<string | null>(initialUrl);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setBusy(true);
        setError(null);

        try {
            const fd = new FormData();
            fd.append("file", file);

            const res = await fetch("/api/teacher/avatar", {
                method: "POST",
                body: fd,
            });

            const json = await res.json();

            if (!res.ok) {
                setError(json?.error ?? "Upload failed");
                return;
            }

            setUrl(json.avatarUrl);
        } catch (err) {
            setError("Upload failed");
        } finally {
            setBusy(false);
            e.target.value = "";
        }
    }

    return (
        <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
            <div>
                <div style={{ marginBottom: 8 }}>Avatar</div>
                {url ? (
                    <img
                        src={url}
                        alt="avatar"
                        style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8 }}
                    />
                ) : (
                    <div style={{ width: 120, height: 120, border: "1px solid #ccc", borderRadius: 8 }} />
                )}
            </div>

            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onChange} disabled={busy} />

            {busy && <div>Uploading…</div>}
            {error && <div style={{ color: "crimson" }}>{error}</div>}
        </div>
    );
}