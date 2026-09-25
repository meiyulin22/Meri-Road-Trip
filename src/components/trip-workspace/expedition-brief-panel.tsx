"use client";

import { CalendarDays, CarFront, Check, ChevronDown, ChevronUp, CircleHelp, Map, MapPin, Pencil, Route } from "lucide-react";
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

import {
  createDirectTripStatePatch,
  requestTripStateUpdate,
} from "./trip-state-persistence-model";
import { journeyDateLabel, journeyFieldLabel, transportLabels } from "./workspace-presentation";
import styles from "./trip-workspace.module.css";

const certaintyLabels = {
  known: "已理解",
  approximate: "大致范围",
  missing: "暂未确定",
  ambiguous: "需要确认",
} as const;

const transportPreferenceLabels: Record<TransportPreference, string> = {
  self_drive: "自驾",
  no_self_drive: "不自驾",
  public_transport: "公共交通",
  flexible: "交通方式灵活",
};

const compactBriefFields: TripStateFieldName[] = [
  "destination",
  "startDate",
  "duration",
];

const allBriefFields: Array<{
  readonly key: TripStateFieldName;
  readonly label: string;
}> = [
  { key: "name", label: "旅程名称" },
  { key: "origin", label: "出发地" },
  { key: "destination", label: "目的地" },
  { key: "startDate", label: "开始时间" },
  { key: "endDate", label: "结束时间" },
  { key: "duration", label: "行程时长" },
  { key: "transportPreference", label: "交通偏好" },
];

export function ExpeditionBriefPanel({
  onTripStateChange,
  tripId,
  tripState,
}: {
  readonly onTripStateChange: (state: TripState) => void;
  readonly tripId: string;
  readonly tripState: TripState;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const isPersistingEdit = useRef(false);
  const [editing, setEditing] = useState<{
    readonly field: TripStateFieldName;
    readonly value: string;
  } | null>(null);
  const visibleFields = isExpanded
    ? allBriefFields
    : allBriefFields.filter(({ key }) => compactBriefFields.includes(key));

  function startEditing(field: TripStateFieldName): void {
    const currentField = tripState[field];
    setEditing({
      field,
      value: currentField.state === "missing" ? "" : currentField.value,
    });
  }

  async function confirmEditing(): Promise<void> {
    if (editing === null || isPersistingEdit.current) {
      return;
    }

    isPersistingEdit.current = true;
    try {
      const patch = createDirectTripStatePatch(
        tripState,
        editing.field,
        editing.value,
      );
      const persistedState = await requestTripStateUpdate(tripId, patch);
      onTripStateChange(persistedState);
      setPersistenceError(null);
      setEditing(null);
    } catch {
      setPersistenceError("这次修改暂时没能保存，请重试。");
    } finally {
      isPersistingEdit.current = false;
    }
  }

  function cancelEditing(): void {
    setEditing(null);
    setPersistenceError(null);
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

      <div className={styles.briefCover} role="img" aria-label="像素山湖插画，旅程示意封面">
        <span>旅程印象 · 示意</span>
      </div>
      <ul className={styles.briefSummary} aria-label="Journey summary">
        <li><MapPin size={17} aria-hidden="true" /><span>{journeyFieldLabel(tripState.destination, "目的地待定")}</span></li>
        <li><CalendarDays size={17} aria-hidden="true" /><span>{journeyDateLabel(tripState)}</span></li>
        <li><CarFront size={17} aria-hidden="true" /><span>{tripState.transportPreference.state === "known" ? transportLabels[tripState.transportPreference.value] : journeyFieldLabel(tripState.transportPreference, "交通方式待定")}</span></li>
      </ul>

      <div className={styles.briefProgress}>
        <h3>Expedition brief</h3>
        <span>{Object.values(tripState).filter((field) => field.state === "known").length}<small> / 7 已理解</small></span>
      </div>
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
        {visibleFields.map(({ key, label }) => (
          <ExpeditionBriefField
            editValue={editing?.field === key ? editing.value : ""}
            field={tripState[key]}
            fieldName={key}
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
      <button className={styles.generatePlan} type="button" disabled title="规划功能尚未开放">
        <Route size={18} aria-hidden="true" />
        <span>Generate plan</span>
        <small>即将开放</small>
      </button>
    </aside>
  );
}

interface ExpeditionBriefFieldProps {
  readonly label: string;
  readonly field: TripStateField;
  readonly fieldName: TripStateFieldName;
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
  fieldName,
  isEditing,
  editValue,
  onEdit,
  onChange,
  onConfirm,
  onCancel,
}: ExpeditionBriefFieldProps) {
  const value =
    field.state === "missing"
      ? "—"
      : fieldName === "transportPreference" &&
          field.state === "known" &&
          transportPreferences.includes(field.value as TransportPreference)
        ? transportPreferenceLabels[field.value as TransportPreference]
        : field.value;

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
      <dt>
        <span className={styles.fieldLabel}>
          {field.state === "known" ? <Check size={14} aria-hidden="true" /> : <CircleHelp size={16} aria-hidden="true" />}
          {label}
        </span>
        <span className={styles.fieldCertainty}>{certaintyLabels[field.state]}</span>
      </dt>
      <dd>
        {isEditing ? (
          fieldName === "transportPreference" ? (
            <select
              aria-label={`编辑${label}`}
              autoFocus
              onBlur={onConfirm}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={handleKeyDown}
              value={editValue}
            >
              <option value="">暂未确定</option>
              {transportPreferences.map((preference) => (
                <option key={preference} value={preference}>
                  {transportPreferenceLabels[preference]}
                </option>
              ))}
            </select>
          ) : (
            <input
              aria-label={`编辑${label}`}
              autoFocus
              onBlur={onConfirm}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={handleKeyDown}
              type="text"
              value={editValue}
            />
          )
        ) : (
          <button aria-label={`编辑${label}`} onClick={onEdit} type="button">
            <span>{value}</span>
            <Pencil aria-hidden="true" size={13} />
          </button>
        )}
      </dd>
    </div>
  );
}
