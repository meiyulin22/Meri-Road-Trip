/**
 * The visitor's address, for per-address limits (step 3). Only a header a proxy we trust writes counts,
 * since a client can send any x-forwarded-for it likes and would get a fresh limit on every request:
 * Cloudflare's CF-Connecting-IP first (the site sits behind Cloudflare once Turnstile is on), then
 * x-real-ip as our own nginx or Caddy sets it, then the last x-forwarded-for entry, the one the nearest
 * proxy appended. Locally there is none: one shared bucket.
 */
export function clientAddress(request: Request): string {
  const cloudflare = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").map((entry) => entry.trim()).filter(Boolean).at(-1);
  return forwarded || "local";
}
