export const formatInZone = (isoUtc: string, timeZone: string, opts?: Intl.DateTimeFormatOptions) => {
    return new Intl.DateTimeFormat(undefined, {
        timeZone,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        ...opts,
    }).format(new Date(isoUtc));
};

export const getBrowserTz = () =>
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";