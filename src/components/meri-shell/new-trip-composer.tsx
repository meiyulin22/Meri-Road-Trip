"use client";

import { LoaderCircle, Send } from "lucide-react";
import {
  useEffect,
  useReducer,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";

import {
  type TransportPreference,
  type TripDraft,
  type TripDraftField,
} from "@/domain/trip-draft/trip-draft";

import styles from "./meri-app-shell.module.css";
import {
  canSubmitTripDraft,
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

const transportPreferenceLabels: Record<TransportPreference, string> = {
  self_drive: "自驾",
  no_self_drive: "不自驾",
  public_transport: "公共交通",
  flexible: "交通方式灵活",
};

const errorMessage = "Meri 暂时无法理解这段旅行想法。你的输入还在，请稍后重试。";

export function NewTripComposer() {
  const [state, dispatch] = useReducer(
    newTripComposerReducer,
    undefined,
    createInitialComposerState,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const reviewRef = useRef<HTMLElement>(null);
  const isSubmitting = state.phase === "submitting";
  const canSubmit = canSubmitTripDraft(state);

  useEffect(() => {
    if (state.phase === "review") {
      reviewRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [state.phase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    dispatch({ type: "submission.started" });

    try {
      const draft = await requestTripDraft(state.message);
      dispatch({ type: "submission.succeeded", draft });
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

      <form aria-busy={isSubmitting} onSubmit={handleSubmit}>
        <div className={styles.composerInput}>
          <label className={styles.srOnly} htmlFor="trip-idea">
            Tell Meri anything about your trip
          </label>
          <textarea
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

        {state.draft === null ? (
          <>
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
          </>
        ) : (
          <TripDraftReviewCard
            draft={state.draft}
            onEdit={() => textareaRef.current?.focus()}
            sectionRef={reviewRef}
          />
        )}
      </form>
    </section>
  );
}

interface TripDraftReviewCardProps {
  readonly draft: TripDraft;
  readonly onEdit: () => void;
  readonly sectionRef: RefObject<HTMLElement | null>;
}

function TripDraftReviewCard({
  draft,
  onEdit,
  sectionRef,
}: TripDraftReviewCardProps) {
  const fields: Array<{
    label: string;
    field: TripDraftField;
    formatKnownValue?: (value: string) => string;
  }> = [
    { label: "行程名称", field: draft.name },
    { label: "出发地", field: draft.origin },
    { label: "目的地", field: draft.destination },
    { label: "出发日期", field: draft.startDate },
    { label: "结束日期", field: draft.endDate },
    { label: "行程时长", field: draft.duration },
    {
      label: "交通偏好",
      field: draft.transportPreference,
      formatKnownValue: (value) =>
        transportPreferenceLabels[value as TransportPreference],
    },
  ];

  return (
    <section
      aria-labelledby="trip-draft-review-title"
      aria-live="polite"
      className={styles.reviewCard}
      ref={sectionRef}
    >
      <div className={styles.reviewHeading}>
        <div>
          <p className={styles.reviewEyebrow}>HUMAN REVIEW</p>
          <h3 id="trip-draft-review-title">Meri 对这次旅行的理解</h3>
        </div>
        <span>尚未保存</span>
      </div>

      <p className={styles.reviewIntroduction}>
        这是 Meri 根据你刚才的描述整理出的理解。信息可以不完整，也可以继续修改。
      </p>

      <dl className={styles.reviewFields}>
        {fields.map(({ label, field, formatKnownValue }) => (
          <TripDraftReviewField
            field={field}
            formatKnownValue={formatKnownValue}
            key={label}
            label={label}
          />
        ))}
      </dl>

      <div className={styles.reviewActions}>
        <button onClick={onEdit} type="button">
          修改信息
        </button>
        <button disabled type="button">
          继续规划
        </button>
        <button disabled type="button">
          先保存这个想法
        </button>
      </div>
    </section>
  );
}

interface TripDraftReviewFieldProps {
  readonly label: string;
  readonly field: TripDraftField;
  readonly formatKnownValue?: (value: string) => string;
}

function TripDraftReviewField({
  label,
  field,
  formatKnownValue = (value) => value,
}: TripDraftReviewFieldProps) {
  const stateLabels = {
    known: "已理解",
    approximate: "大致范围",
    missing: "暂未确定",
    ambiguous: "需要确认",
  } as const;
  const value =
    field.state === "known"
      ? formatKnownValue(field.value)
      : field.state === "approximate" || field.state === "ambiguous"
        ? field.value
        : "—";

  return (
    <div className={styles.reviewField} data-state={field.state}>
      <dt>
        <span>{label}</span>
        <span>{stateLabels[field.state]}</span>
      </dt>
      <dd>{value}</dd>
    </div>
  );
}
