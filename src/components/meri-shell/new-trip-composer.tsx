"use client";

import { LoaderCircle, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useReducer,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import styles from "./meri-app-shell.module.css";
import {
  canSubmitTripDraft,
  createJourneyAndNavigate,
  createInitialComposerState,
  newTripComposerReducer,
  requestTripDraft,
} from "./new-trip-composer-model";

const promptExamples = [
  "今年冬天想找个地方滑雪",
  "想出去走走，还没想好去哪",
  "十月底想旅行几天，不想自驾",
];

const quickActions = [
  { label: "目的地未定", prompt: "我想出去旅行，但目的地还没决定" },
  { label: "日期灵活", prompt: "想安排一次旅行，日期可以灵活调整" },
  { label: "给我惊喜", prompt: "想来一次有惊喜的旅行，其他信息还没决定" },
  { label: "周末徒步", prompt: "想找个周末去徒步" },
];

const errorMessage = "Meri 暂时无法理解这段旅行想法。你的输入还在，请稍后重试。";

export function NewTripComposer() {
  const router = useRouter();
  const [state, dispatch] = useReducer(
    newTripComposerReducer,
    undefined,
    createInitialComposerState,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isSubmitting = state.phase === "submitting";
  const canSubmit = canSubmitTripDraft(state);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    dispatch({ type: "submission.started" });

    try {
      const draft = await requestTripDraft(state.message);
      await createJourneyAndNavigate(draft, (path) => {
        dispatch({ type: "submission.succeeded", draft });
        router.push(path);
      });
    } catch {
      dispatch({ type: "submission.failed", error: errorMessage });
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

  function applyPrompt(prompt: string) {
    dispatch({ type: "message.changed", message: prompt });
    textareaRef.current?.focus();
  }

  return (
    <section className={styles.composer} id="new-trip" aria-labelledby="composer-title">
      <div className={styles.composerHeading}>
        <div>
          <p className={styles.composerEyebrow}>START ANYWHERE</p>
          <h2 id="composer-title">Where should we start?</h2>
        </div>
      </div>

      <form autoComplete="off" aria-busy={isSubmitting} onSubmit={handleSubmit}>
        <div className={styles.composerInput}>
          <label className={styles.srOnly} htmlFor="trip-idea">
            Tell Meri anything about your trip
          </label>
          <textarea
            autoComplete="off"
            disabled={isSubmitting}
            id="trip-idea"
            onChange={(event) =>
              dispatch({ type: "message.changed", message: event.target.value })
            }
            onKeyDown={handleTextareaKeyDown}
            placeholder="Tell Meri anything about your trip..."
            ref={textareaRef}
            rows={1}
            value={state.message}
          />
          <button aria-label="Send trip idea" disabled={!canSubmit} type="submit">
            {isSubmitting ? (
              <LoaderCircle aria-hidden="true" className={styles.loadingIcon} size={21} />
            ) : (
              <Send aria-hidden="true" size={21} />
            )}
          </button>
        </div>

        {isSubmitting ? (
          <p className={styles.composerStatus} role="status">
            Meri 正在理解你的想法…
          </p>
        ) : null}

        {state.error ? (
          <p className={styles.composerError} role="alert">
            {state.error}
          </p>
        ) : null}

        <div className={styles.promptExamples} aria-label="Example trip ideas">
          {promptExamples.map((prompt) => (
            <button
              disabled={isSubmitting}
              key={prompt}
              onClick={() => applyPrompt(prompt)}
              type="button"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className={styles.tripMoods} aria-label="Trip inspiration examples">
          {quickActions.map((action) => (
            <button
              disabled={isSubmitting}
              key={action.label}
              onClick={() => applyPrompt(action.prompt)}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      </form>
    </section>
  );
}
