"use client";

import { ChevronDown, ChevronUp, Map, Pencil } from "lucide-react";
import { useRef, useState } from "react";

import {
  transportPreferences,
  type TransportPreference,
} from "@/domain/trip-draft/trip-draft";
import type {
  TripState,
  TripStateField,
  TripStateFieldName,
} from "@/domain/trip-state/trip-state";

import { CertaintyTag, certaintyLabels, FieldStatusIcon } from "./field-certainty";
import { LocationEditor } from "./location-editor";
import { TripDatesField } from "./trip-dates-editor";
import { DestinationEditor } from "./destination-editor";
import {
  createDirectTripStatePatch,
  requestTripStateUpdate,
} from "./trip-state-persistence-model";
import styles from "./trip-workspace.module.css";

const transportPreferenceLabels: Record<TransportPreference, string> = {
  self_drive: "自驾",
  no_self_drive: "不自驾",
  public_transport: "公共交通",
  flexible: "灵活",
};

type DateFieldName = "startDate" | "endDate" | "duration";
type TextFieldName = Exclude<TripStateFieldName, "origin" | "destination" | "transportPreference" | DateFieldName>;
/** One brief row: a TripState field, or 何时, which shows the three date fields as one span. */
type BriefRowKey = Exclude<TripStateFieldName, DateFieldName> | "dates";

const compactBriefFields: BriefRowKey[] = [
  "destination",
  "dates",
];

// Ordered by the questions a plan answers — from where, to where, when, how — with
// the Journey's own name last, since Meri fills it in and it is rarely the point.
const allBriefFields: Array<{
  readonly key: BriefRowKey;
  readonly label: string;
}> = [
  { key: "origin", label: "出发地" },
  { key: "destination", label: "目的地" },
  { key: "dates", label: "何时" },
  { key: "transportPreference", label: "交通偏好" },
  { key: "name", label: "旅程名称" },
];

export function ExpeditionBriefPanel({
  destinationEditorOpenRequest,
  onTripStateChange,
  tripId,
  tripState,
}: {
  readonly destinationEditorOpenRequest: number;
  readonly onTripStateChange: (state: TripState) => void;
  readonly tripId: string;
  readonly tripState: TripState;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [isSavingTransport, setIsSavingTransport] = useState(false);
  const isPersistingEdit = useRef(false);
  const [editing, setEditing] = useState<{
    readonly field: TextFieldName;
    readonly value: string;
  } | null>(null);
  const visibleFields = isExpanded
    ? allBriefFields
    : allBriefFields.filter(({ key }) => compactBriefFields.includes(key));

  async function persistField(field: TextFieldName | "transportPreference", value: string): Promise<boolean> {
    if (isPersistingEdit.current) return false;
    isPersistingEdit.current = true;
    try {
      const patch = createDirectTripStatePatch(tripState, field, value);
      onTripStateChange(await requestTripStateUpdate(tripId, patch));
      setPersistenceError(null);
      return true;
    } catch {
      setPersistenceError("这次修改暂时没能保存，请重试。");
      return false;
    } finally {
      isPersistingEdit.current = false;
    }
  }

  function startEditing(field: TextFieldName): void {
    const currentField = tripState[field];
    setEditing({
      field,
      value: currentField.state === "missing" ? "" : currentField.value,
    });
  }

  async function confirmEditing(): Promise<void> {
    if (editing === null) return;
    if (await persistField(editing.field, editing.value)) setEditing(null);
  }

  function cancelEditing(): void {
    setEditing(null);
    setPersistenceError(null);
  }

  async function selectTransport(value: TransportPreference | ""): Promise<void> {
    setIsSavingTransport(true);
    try {
      await persistField("transportPreference", value);
    } finally {
      setIsSavingTransport(false);
    }
  }

  return (
    <aside
      aria-labelledby="expedition-brief-title"
      className={styles.expeditionBrief}
      data-expanded={isExpanded ? "true" : "false"}
      data-region="expedition-brief"
    >
      <header className={styles.briefHeader}>
        <div className={styles.regionHeading}>
          <h2 id="expedition-brief-title"><Map size={21} aria-hidden="true" />Journey overview</h2>
        </div>
        <button
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "收起旅程信息" : "查看全部旅程信息"}
          onClick={() => {
            setEditing(null);
            setIsExpanded((current) => !current);
          }}
          type="button"
        >
          <span className={styles.srOnly}>{isExpanded ? "收起" : "查看全部信息"}</span>
          {isExpanded ? (
            <ChevronUp aria-hidden="true" size={14} />
          ) : (
            <ChevronDown aria-hidden="true" size={14} />
          )}
        </button>
      </header>

      <div className={styles.briefGuidance}>
        <p className={styles.editingHint}>
          Meri 目前理解的旅程。点一下，就能补充或修改。
        </p>
      </div>

      {persistenceError ? (
        <p className={styles.briefPersistenceError} role="alert">
          {persistenceError}
        </p>
      ) : null}

      <dl className={styles.briefFields}>
        {visibleFields.map(({ key, label }) => key === "destination" ? (
          <DestinationEditor
            initiallyOpen={destinationEditorOpenRequest > 0}
            key={`${key}-${destinationEditorOpenRequest}`}
            onTripStateChange={onTripStateChange}
            tripId={tripId}
            tripState={tripState}
          />
        ) : key === "origin" ? (
          <LocationEditor
            field="origin"
            key={key}
            onTripStateChange={onTripStateChange}
            tripId={tripId}
            tripState={tripState}
          />
        ) : key === "dates" ? (
          <TripDatesField
            key={key}
            label={label}
            onTripStateChange={onTripStateChange}
            tripId={tripId}
            tripState={tripState}
          />
        ) : key === "transportPreference" ? (
          <TransportPreferenceField
            busy={isSavingTransport}
            field={tripState.transportPreference}
            key={key}
            label={label}
            onSelect={(value) => void selectTransport(value)}
          />
        ) : (
          <ExpeditionBriefField
            editValue={editing?.field === key ? editing.value : ""}
            field={tripState[key]}
            isEditing={editing?.field === key}
            key={key}
            label={label}
            onCancel={cancelEditing}
            onChange={(value) => setEditing({ field: key, value })}
            onConfirm={confirmEditing}
            onEdit={() => startEditing(key)}
          />
        ))}
      </dl>
    </aside>
  );
}

function FieldHeading({ label, state }: { readonly label: string; readonly state: TripStateField["state"] }) {
  return (
    <dt>
      <span className={styles.fieldLabel}>
        <FieldStatusIcon state={state} />
        {label}
      </span>
      <span className={styles.fieldCertainty}>{certaintyLabels[state]}</span>
    </dt>
  );
}

/**
 * Transport is a choice among four known answers, so it is one tap rather than a
 * dropdown. Tapping the chosen answer again clears it. A rough answer Meri heard in
 * conversation (「可能自驾吧」) stays visible underneath until the user picks one.
 */
function TransportPreferenceField({
  busy,
  field,
  label,
  onSelect,
}: {
  readonly busy: boolean;
  readonly field: TripStateField;
  readonly label: string;
  readonly onSelect: (value: TransportPreference | "") => void;
}) {
  const selected = field.state === "known" ? field.value : null;

  return (
    <div className={`${styles.stateField} ${styles.stackedField}`} data-certainty={field.state}>
      <FieldHeading label={label} state={field.state} />
      <dd>
        <div aria-label={label} className={styles.transportChoices} role="group">
          {transportPreferences.map((preference) => (
            <button
              aria-pressed={selected === preference}
              disabled={busy}
              key={preference}
              onClick={() => onSelect(selected === preference ? "" : preference)}
              type="button"
            >
              {transportPreferenceLabels[preference]}
            </button>
          ))}
        </div>
        {field.state === "approximate" || field.state === "ambiguous" ? (
          <p className={styles.fieldNote}>
            Meri 记下：{field.value}
            <CertaintyTag state={field.state} />
          </p>
        ) : null}
      </dd>
    </div>
  );
}

interface ExpeditionBriefFieldProps {
  readonly label: string;
  readonly field: TripStateField;
  readonly isEditing: boolean;
  readonly editValue: string;
  readonly onEdit: () => void;
  readonly onChange: (value: string) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

function ExpeditionBriefField({
  label,
  field,
  isEditing,
  editValue,
  onEdit,
  onChange,
  onConfirm,
  onCancel,
}: ExpeditionBriefFieldProps) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }

    if (event.key === "Enter") {
      event.preventDefault();
      onConfirm();
    }
  }

  return (
    <div className={styles.stateField} data-certainty={field.state}>
      <FieldHeading label={label} state={field.state} />
      <dd>
        {isEditing ? (
          <input
            aria-label={`编辑${label}`}
            autoFocus
            onBlur={onConfirm}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            type="text"
            value={editValue}
          />
        ) : (
          <button aria-label={`编辑${label}`} className={styles.fieldEditTrigger} title={`编辑${label}`} onClick={onEdit} type="button">
            <span>
              {field.state === "missing" ? "—" : field.value}
              <CertaintyTag state={field.state} />
            </span>
            <span aria-hidden="true" className={styles.fieldEditAffordance}><Pencil size={15} /></span>
          </button>
        )}
      </dd>
    </div>
  );
}
