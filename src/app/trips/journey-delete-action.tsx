"use client";

import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import styles from "./trips.module.css";

export function JourneyDeleteAction({
  tripId,
  name,
}: {
  tripId: string;
  name: string;
}) {
  const router = useRouter();
  const confirmationId = useId();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteJourney() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}`, {
        method: "DELETE",
      });
      if (response.status !== 204) {
        throw new Error("Journey deletion failed.");
      }
      router.refresh();
    } catch {
      setError("Could not delete this Journey. Please try again.");
      setPending(false);
    }
  }

  return (
    <details className={styles.cardMenu}>
      <summary aria-label={`More options for ${name}`}>
        <MoreHorizontal aria-hidden="true" size={20} />
      </summary>
      <div className={styles.cardMenuPanel}>
        {confirming ? (
          <div aria-labelledby={confirmationId} role="group">
            <p id={confirmationId}>Delete “{name}” and its conversation?</p>
            <div className={styles.cardMenuActions}>
              <button
                disabled={pending}
                onClick={() => setConfirming(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={styles.deleteConfirm}
                disabled={pending}
                onClick={deleteJourney}
                type="button"
              >
                {pending ? "Deleting…" : "Delete Journey"}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} type="button">
            Delete Journey
          </button>
        )}
        {error && (
          <p aria-live="polite" className={styles.cardMenuError}>
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
