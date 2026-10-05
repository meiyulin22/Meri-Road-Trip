"use client";

import { useRouter } from "next/navigation";
import { useReducer, type FormEvent, type KeyboardEvent } from "react";

import { useMessages } from "@/components/i18n/locale-context";
import { ChatComposer } from "@/components/ui/chat-composer";

import styles from "./meri-app-shell.module.css";
import {
  canSubmitTripDraft,
  createJourneyAndNavigate,
  createInitialComposerState,
  newTripComposerReducer,
  requestTripDraft,
  retryOpeningAndNavigate,
} from "./new-trip-composer-model";

export function NewTripComposer() {
  const text = useMessages().home;
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
      dispatch({ type: "submission.failed", error: text.draftFailed });
    }
  }

  async function handleOpeningRetry() {
    if (!state.createdTripId || state.phase !== "opening_failed") return;
    dispatch({ type: "opening.retry.started" });
    try {
      await retryOpeningAndNavigate(state.createdTripId, (path) => router.push(path));
    } catch {
      dispatch({ type: "opening.retry.failed", error: text.openingRetryFailed });
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
    <section className={styles.composer} id="new-trip" aria-label={text.startJourney}>
      <form autoComplete="off" aria-busy={isSubmitting} onSubmit={handleSubmit}>
        <ChatComposer
          id="trip-idea"
          value={state.message}
          onChange={(message) => dispatch({ type: "message.changed", message })}
          onKeyDown={handleTextareaKeyDown}
          disabled={isSubmitting || state.createdTripId !== null}
          canSubmit={canSubmit}
          pending={isSubmitting}
          labels={{ input: text.composerPlaceholder, send: text.sendIdea,
            attachment: text.documentUnavailable, voice: text.voiceUnavailable }}
          prompts={text.composerPrompts}
        />

        {isSubmitting ? (
          <p className={styles.composerStatus} role="status">
            {text.understanding}
          </p>
        ) : null}

        {state.error && !state.createdTripId ? (
          <p className={styles.composerError} role="alert">
            {state.error}
          </p>
        ) : null}
        {state.createdTripId ? (
          <div className={styles.composerError} role="status">
            <p>{text.journeySaved}{state.error ?? text.openingMissing}</p>
            <button disabled={isSubmitting} onClick={() => void handleOpeningRetry()} type="button">
              {isSubmitting ? text.retryingOpening : text.retryOpening}
            </button>
            <button onClick={() => router.push(`/trips/${encodeURIComponent(state.createdTripId!)}`)} type="button">
              {text.openJourneyFirst}
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
