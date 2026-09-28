import { createHash } from "node:crypto";

const selectionNamespace = "58f0d779-45bc-41e1-91e6-36fd066827ee";

/**
 * A selection follow-up gets a deterministic id so clicking the same card twice
 * cannot write two assistant messages. The payload strings below are part of the
 * stored data: changing one would make every existing follow-up unreachable.
 */
function selectionMessageId(payload: string): string {
  const namespaceBytes = Buffer.from(selectionNamespace.replaceAll("-", ""), "hex");
  const bytes = createHash("sha1")
    .update(namespaceBytes)
    .update(payload, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function locationCandidateSelectionMessageId(
  tripId: string,
  candidateMessageId: string,
  candidateIndex: number,
): string {
  return selectionMessageId(
    `${tripId}:${candidateMessageId}:${candidateIndex}:location-candidate-selection`,
  );
}

export function destinationRecommendationSelectionMessageId(
  tripId: string,
  recommendationMessageId: string,
  destinationId: string,
): string {
  return selectionMessageId(
    `${tripId}:${recommendationMessageId}:${destinationId}:destination-recommendation-selection`,
  );
}
