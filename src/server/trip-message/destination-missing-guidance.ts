import { createHash } from "node:crypto";

export const destinationMissingGuidanceContent = "还没想好去哪吗？我可以根据你的旅行偏好推荐几个地方。";

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
