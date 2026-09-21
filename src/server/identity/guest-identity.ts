import { randomUUID } from "node:crypto";

export const guestIdCookieName = "meri_guest_id";
export const guestIdCookieMaxAgeSeconds = 60 * 60 * 24 * 365;

type CookieReader = {
  get(name: string): { readonly value: string } | undefined;
};

export type GuestIdentity = {
  readonly guestId: string;
  readonly isNew: boolean;
};

export const guestIdCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: guestIdCookieMaxAgeSeconds,
} as const;

export function readGuestId(cookieReader: CookieReader): string | null {
  const value = cookieReader.get(guestIdCookieName)?.value;
  return value && isUuid(value) ? value : null;
}

export function getOrCreateGuestIdentity(
  cookieReader: CookieReader,
  generateId: () => string = randomUUID,
): GuestIdentity {
  const existingGuestId = readGuestId(cookieReader);

  if (existingGuestId) {
    return { guestId: existingGuestId, isNew: false };
  }

  return { guestId: generateId(), isNew: true };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
