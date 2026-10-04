"use client";

import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { useMessages } from "@/components/i18n/locale-context";

import styles from "./trips.module.css";

export function JourneyDeleteAction({
  tripId,
  name,
}: {
  tripId: string;
  name: string;
}) {
  const text = useMessages().journeys;
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
      setError(text.deleteFailed);
      setPending(false);
    }
  }

  return (
    <details className={styles.cardMenu}>
      <summary aria-label={text.moreOptions(name)}>
        <MoreHorizontal aria-hidden="true" size={20} />
      </summary>
      <div className={styles.cardMenuPanel}>
        {confirming ? (
          <div aria-labelledby={confirmationId} role="group">
            <p id={confirmationId}>{text.deleteQuestion(name)}</p>
            <div className={styles.cardMenuActions}>
              <button
                disabled={pending}
                onClick={() => setConfirming(false)}
                type="button"
              >
                {text.cancel}
              </button>
              <button
                className={styles.deleteConfirm}
                disabled={pending}
                onClick={deleteJourney}
                type="button"
              >
                {pending ? text.deleting : text.deleteJourney}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} type="button">
            {text.deleteJourney}
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
