/**
 * The visitor's address, for per-address limits (step 3). Only a header our own proxy writes counts,
 * since a client can send any x-forwarded-for it likes and would get a fresh limit on every request:
 * x-real-ip as our nginx or Caddy sets it (overwriting whatever the client sent), then the last
 * x-forwarded-for entry, the one the nearest proxy appended. Locally there is none: one shared bucket.
 * No CDN header is trusted: Cloudflare was taken out on 2026-11-19 and the CDN question left for the
 * deploy (a China server first, where Cloudflare does not suit).
 */
export function clientAddress(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").map((entry) => entry.trim()).filter(Boolean).at(-1);
  return forwarded || "local";
}
