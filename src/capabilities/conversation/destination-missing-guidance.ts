import { createHash } from "node:crypto";

/**
 * Meri no longer writes the 「还没想好去哪吗？」 guidance message, but Journeys created
 * before that still have it in their saved history under this stable ID. The opening
 * conversation check needs to recognise and skip it, so only the ID survives.
 */
const guidanceNamespace = "58f0d779-45bc-41e1-91e6-36fd066827ee";

export function destinationMissingGuidanceMessageId(tripId: string): string {
  const namespaceBytes = Buffer.from(guidanceNamespace.replaceAll("-", ""), "hex");
  const bytes = createHash("sha1")
    .update(namespaceBytes)
    .update(`${tripId}:destination-missing-guidance`, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
