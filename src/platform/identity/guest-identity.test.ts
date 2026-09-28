import assert from "node:assert/strict";
import test from "node:test";

import {
  getOrCreateGuestIdentity,
  guestIdCookieMaxAgeSeconds,
  guestIdCookieName,
  guestIdCookieOptions,
  readGuestId,
} from "./guest-identity";

const existingGuestId = "25ba5b26-8db0-4fe3-bfcc-b684dd7889cc";
const generatedGuestId = "f6dd6c50-91c6-4ad1-9089-dbb3feaa61cc";

function cookieReader(value?: string) {
  return {
    get(name: string) {
      return name === guestIdCookieName && value ? { value } : undefined;
    },
  };
}

test("reuses a valid existing guest identity", () => {
  assert.deepEqual(
    getOrCreateGuestIdentity(cookieReader(existingGuestId), () => generatedGuestId),
    { guestId: existingGuestId, isNew: false },
  );
});

test("creates a server identity when the cookie is missing or invalid", () => {
  assert.deepEqual(
    getOrCreateGuestIdentity(cookieReader(), () => generatedGuestId),
    { guestId: generatedGuestId, isNew: true },
  );
  assert.equal(readGuestId(cookieReader("client-supplied-invalid-id")), null);
});

test("uses a persistent HttpOnly SameSite cookie configuration", () => {
  assert.equal(guestIdCookieOptions.httpOnly, true);
  assert.equal(guestIdCookieOptions.sameSite, "lax");
  assert.equal(
    guestIdCookieOptions.secure,
    process.env.NODE_ENV === "production",
  );
  assert.equal(guestIdCookieOptions.path, "/");
  assert.equal(guestIdCookieOptions.maxAge, guestIdCookieMaxAgeSeconds);
  assert.equal(guestIdCookieMaxAgeSeconds, 31_536_000);
});
