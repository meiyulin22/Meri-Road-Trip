"use client";

import { ArrowUp, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useReducer, type FormEvent, type KeyboardEvent } from "react";

import styles from "./meri-app-shell.module.css";
import {
  canSubmitTripDraft,
  createJourneyAndNavigate,
  createInitialComposerState,
  newTripComposerReducer,
  requestTripDraft,
  retryOpeningAndNavigate,
} from "./new-trip-composer-model";

const errorMessage = "Meri 暂时无法理解这段旅行想法。你的输入还在，请稍后重试。";

export function NewTripComposer() {
  const router = useRouter();
  const [state, dispatch] = useReducer(
    newTripComposerReducer,
    undefined,
    createInitialComposerState,
  );
  const isSubmitting = state.phase === "submitting" || state.phase === "retrying_opening";
  const canSubmit = canSubmitTripDraft(state);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    dispatch({ type: "submission.started" });

    try {
      const draft = await requestTripDraft(state.message);
      await createJourneyAndNavigate(
        draft,
        state.message,
        (path) => {
          dispatch({ type: "submission.succeeded", draft });
          router.push(path);
        },
        (tripId) => dispatch({ type: "opening.failed", tripId, draft }),
      );
    } catch {
      dispatch({ type: "submission.failed", error: errorMessage });
    }
  }

  async function handleOpeningRetry() {
    if (!state.createdTripId || state.phase !== "opening_failed") return;
    dispatch({ type: "opening.retry.started" });
    try {
      await retryOpeningAndNavigate(state.createdTripId, (path) => router.push(path));
    } catch {
      dispatch({ type: "opening.retry.failed", error: "Meri 仍暂时无法回复。旅程已经保存，你可以稍后再试或先进入旅程。" });
    }
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <section className={styles.composer} id="new-trip" aria-label="Start a Journey">
      <form autoComplete="off" aria-busy={isSubmitting} onSubmit={handleSubmit}>
        <div className={styles.composerInput}>
          <label className={styles.srOnly} htmlFor="trip-idea">
            Tell Meri anything about your trip
          </label>
          <textarea
            autoComplete="off"
            disabled={isSubmitting || state.createdTripId !== null}
            id="trip-idea"
            onChange={(event) =>
              dispatch({ type: "message.changed", message: event.target.value })
            }
            onKeyDown={handleTextareaKeyDown}
            placeholder="Tell Meri anything about your trip..."
            rows={3}
            value={state.message}
          />
          <button aria-label="Send trip idea" disabled={!canSubmit} type="submit">
            {isSubmitting ? (
              <LoaderCircle aria-hidden="true" className={styles.loadingIcon} size={21} />
            ) : (
              <ArrowUp aria-hidden="true" size={22} strokeWidth={2.2} />
            )}
          </button>
        </div>

        {isSubmitting ? (
          <p className={styles.composerStatus} role="status">
            Meri 正在理解你的想法…
          </p>
        ) : null}

        {state.error && !state.createdTripId ? (
          <p className={styles.composerError} role="alert">
            {state.error}
          </p>
        ) : null}
        {state.createdTripId ? (
          <div className={styles.composerError} role="status">
            <p>旅程和你的原始想法已保存。{state.error ?? "Meri 暂时没能完成第一条回复。"}</p>
            <button disabled={isSubmitting} onClick={() => void handleOpeningRetry()} type="button">
              {isSubmitting ? "正在重试…" : "重试 Meri 回复"}
            </button>
            <button onClick={() => router.push(`/trips/${encodeURIComponent(state.createdTripId!)}`)} type="button">
              先进入旅程
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
