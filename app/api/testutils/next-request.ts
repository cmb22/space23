export function makeNextRequest(url: string, init?: RequestInit) {
    return new Request(url, init);
}

/**
 * Next route handlers get ctx.params as Promise in your code:
 * GET(req, { params: Promise.resolve({ teacherId: "9" }) })
 */
export function makeParams(params: Record<string, string>) {
    return { params: Promise.resolve(params) };
}