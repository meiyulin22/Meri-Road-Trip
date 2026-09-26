"use client";

import { MoreHorizontal } from "lucide-react";
import { useRef, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/animated-popover";

import { requestRecentJourneyDeletionOnce } from "./recent-journey-deletion";
import styles from "./recent-journeys.module.css";

export function RecentJourneyActions({
  name,
  onDeleted,
  tripId,
}: {
  readonly name: string;
  readonly onDeleted: (tripId: string) => void;
  readonly tripId: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  function openConfirmation() {
    setMenuOpen(false);
    setError(null);
    dialogRef.current?.showModal();
  }

  async function confirmDelete() {
    if (pendingRef.current) return;
    setPending(true);
    setError(null);
    try {
      const deleted = await requestRecentJourneyDeletionOnce(tripId, pendingRef);
      if (!deleted) return;
      dialogRef.current?.close();
      onDeleted(tripId);
    } catch {
      setError("Could not delete this Journey. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button aria-label="Journey actions" className={styles.actionsTrigger} ref={triggerRef} type="button">
            <MoreHorizontal aria-hidden="true" size={20} strokeWidth={2} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className={styles.actionsMenu}
          onCloseAutoFocus={(event) => {
            if (dialogRef.current?.open) event.preventDefault();
          }}
          side="bottom"
          sideOffset={6}
        >
          <button className={styles.menuDelete} onClick={openConfirmation} type="button">
            Delete Journey
          </button>
        </PopoverContent>
      </Popover>
      <dialog
        aria-labelledby={`delete-journey-title-${tripId}`}
        aria-describedby={`delete-journey-description-${tripId}`}
        className={styles.deleteDialog}
        onCancel={(event) => {
          if (pendingRef.current) event.preventDefault();
        }}
        onClose={() => {
          setError(null);
          triggerRef.current?.focus();
        }}
        ref={dialogRef}
      >
        <h2 id={`delete-journey-title-${tripId}`}>Delete “{name}”?</h2>
        <p id={`delete-journey-description-${tripId}`}>
          This journey and its conversation will be permanently deleted.
        </p>
        {error ? <p className={styles.deleteError} role="alert">{error}</p> : null}
        <div className={styles.deleteActions}>
          <button
            autoFocus
            className={styles.cancelDelete}
            disabled={pending}
            onClick={() => dialogRef.current?.close()}
            type="button"
          >
            Cancel
          </button>
          <button
            className={styles.confirmDelete}
            disabled={pending}
            onClick={() => void confirmDelete()}
            type="button"
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </dialog>
    </>
  );
}
