"use client";

import { ArrowUp, LoaderCircle, Mic, Paperclip } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEventHandler } from "react";

import styles from "./chat-composer.module.css";

/** Presentation only: the parent owns submission, request state and errors. */
export function ChatComposer({ id, value, onChange, onKeyDown, disabled, canSubmit, pending, labels, prompts }: {
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  readonly disabled: boolean;
  readonly canSubmit: boolean;
  readonly pending: boolean;
  readonly labels: { readonly input: string; readonly send: string; readonly attachment: string; readonly voice: string };
  readonly prompts: readonly string[];
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const reduceMotion = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const [promptIndex, setPromptIndex] = useState(0);
  const showPrompt = value.length === 0 && !disabled;

  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  useEffect(() => {
    if (!showPrompt || focused || reduceMotion || prompts.length < 2) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setPromptIndex((current) => (current + 1) % prompts.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [showPrompt, focused, reduceMotion, prompts.length]);

  return <div className={styles.composer}>
    <div className={styles.editor}>
      <textarea ref={input} id={id} aria-label={labels.input} autoComplete="off" rows={2}
        disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
      {showPrompt ? <div className={styles.placeholder} aria-hidden="true">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={prompts[promptIndex % prompts.length] ?? labels.input}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -12 }} transition={{ duration: reduceMotion ? 0 : 0.22 }}>
            {prompts[promptIndex % prompts.length] ?? labels.input}
          </motion.span>
        </AnimatePresence>
      </div> : null}
    </div>
    <div className={styles.toolbar}>
      <span title={labels.attachment} className={styles.toolHint}>
        <button type="button" disabled aria-label={labels.attachment} className={styles.toolButton}>
          <Paperclip aria-hidden="true" size={20} strokeWidth={1.8} />
        </button>
      </span>
      <div className={styles.actions}>
        <span title={labels.voice} className={styles.toolHint}>
          <button type="button" disabled aria-label={labels.voice} className={styles.toolButton}>
            <Mic aria-hidden="true" size={20} strokeWidth={1.8} />
          </button>
        </span>
        <button type="submit" disabled={disabled || pending || !canSubmit} aria-label={labels.send} className={styles.sendButton}>
          {pending ? <LoaderCircle aria-hidden="true" size={21} className={styles.spinner} />
            : <ArrowUp aria-hidden="true" size={23} strokeWidth={2} />}
        </button>
      </div>
    </div>
  </div>;
}
