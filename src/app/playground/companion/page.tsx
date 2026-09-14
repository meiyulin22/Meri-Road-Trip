"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";

import styles from "./companion-playground.module.css";

type Position = {
  x: number;
  y: number;
};

type ActiveDrag = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
};

type WalkDirection = -1 | 1;
type MotionState = "idle" | "walking";

const WALK_DISTANCE_PX = 100;
const WALK_DURATION_MS = 1_400;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export default function CompanionPlaygroundPage() {
  const companionElement = useRef<HTMLDivElement | null>(null);
  const activeDrag = useRef<ActiveDrag | null>(null);
  const activeMovement = useRef<Animation | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [motionState, setMotionState] = useState<MotionState>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [buttonPresses, setButtonPresses] = useState(0);
  const [inputValue, setInputValue] = useState("");

  const companionStyle: CSSProperties | undefined = position
    ? {
        left: position.x,
        top: position.y,
        right: "auto",
        bottom: "auto",
      }
    : undefined;

  useEffect(() => {
    return () => {
      activeMovement.current?.cancel();
      activeMovement.current = null;
    };
  }, []);

  function commitPosition(element: HTMLDivElement, nextPosition: Position) {
    element.style.left = `${nextPosition.x}px`;
    element.style.top = `${nextPosition.y}px`;
    element.style.right = "auto";
    element.style.bottom = "auto";
    setPosition(nextPosition);
  }

  function getClampedPosition(bounds: DOMRect): Position {
    return {
      x: clamp(bounds.left, 0, window.innerWidth - bounds.width),
      y: clamp(bounds.top, 0, window.innerHeight - bounds.height),
    };
  }

  function interruptMovement(element: HTMLDivElement): DOMRect {
    const bounds = element.getBoundingClientRect();
    const movement = activeMovement.current;

    if (!movement) {
      return bounds;
    }

    activeMovement.current = null;
    movement.cancel();
    commitPosition(element, getClampedPosition(bounds));
    setMotionState("idle");

    return element.getBoundingClientRect();
  }

  function startWalking(direction: WalkDirection) {
    const element = companionElement.current;

    if (!element || activeMovement.current) {
      return;
    }

    const bounds = element.getBoundingClientRect();
    const startPosition = getClampedPosition(bounds);
    const targetPosition = {
      x: clamp(
        startPosition.x + direction * WALK_DISTANCE_PX,
        0,
        window.innerWidth - bounds.width,
      ),
      y: startPosition.y,
    };
    const travelDistance = targetPosition.x - startPosition.x;

    if (travelDistance === 0) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      commitPosition(element, targetPosition);
      return;
    }

    setMotionState("walking");

    const movement = element.animate(
      [
        { transform: "translateX(0)" },
        { transform: `translateX(${travelDistance}px)` },
      ],
      {
        duration: WALK_DURATION_MS,
        easing: "ease-in-out",
        fill: "forwards",
      },
    );

    activeMovement.current = movement;

    movement.finished
      .then(() => {
        if (activeMovement.current !== movement) {
          return;
        }

        activeMovement.current = null;
        movement.cancel();
        commitPosition(element, targetPosition);
        setMotionState("idle");
      })
      .catch(() => {
        // Cancellation is expected when dragging interrupts automated movement.
      });
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }

    const companion = event.currentTarget;
    const bounds = interruptMovement(companion);

    activeDrag.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
    };

    setPosition({ x: bounds.left, y: bounds.top });
    setIsDragging(true);
    companion.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = activeDrag.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const companion = event.currentTarget;

    setPosition({
      x: clamp(
        event.clientX - drag.offsetX,
        0,
        window.innerWidth - companion.offsetWidth,
      ),
      y: clamp(
        event.clientY - drag.offsetY,
        0,
        window.innerHeight - companion.offsetHeight,
      ),
    });

    event.preventDefault();
  }

  function stopDragging(event: PointerEvent<HTMLDivElement>) {
    if (activeDrag.current?.pointerId !== event.pointerId) {
      return;
    }

    activeDrag.current = null;
    setIsDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <main className={styles.pageShell}>
      <section className={styles.intro} aria-labelledby="playground-title">
        <p className={styles.eyebrow}>Disposable experiment · Step 2</p>
        <h1 id="playground-title">Companion Playground</h1>
        <p>
          Drag the temporary pixel companion, or trigger a short browser-native
          WAAPI walk. The controls remain ordinary React UI beneath its layer.
        </p>
      </section>

      <section className={styles.controlCard} aria-labelledby="controls-title">
        <div>
          <p className={styles.cardLabel}>Interaction check</p>
          <h2 id="controls-title">Normal page controls</h2>
        </div>

        <label className={styles.inputLabel}>
          Test the text input
          <input
            className={styles.textInput}
            onChange={(event) => setInputValue(event.target.value)}
            placeholder="Type while the companion is nearby"
            type="text"
            value={inputValue}
          />
        </label>

        <button
          className={styles.testButton}
          onClick={() => setButtonPresses((count) => count + 1)}
          type="button"
        >
          Test normal button
        </button>

        <p className={styles.controlStatus} aria-live="polite">
          Button presses: {buttonPresses}. Input characters: {inputValue.length}.
        </p>

        <div className={styles.walkExperiment}>
          <div>
            <p className={styles.cardLabel}>WAAPI movement</p>
            <p className={styles.motionStatus} aria-live="polite">
              Companion state: {motionState}.
            </p>
          </div>
          <div className={styles.walkButtons}>
            <button
              className={styles.walkButton}
              disabled={motionState === "walking"}
              onClick={() => startWalking(-1)}
              type="button"
            >
              Walk Left
            </button>
            <button
              className={styles.walkButton}
              disabled={motionState === "walking"}
              onClick={() => startWalking(1)}
              type="button"
            >
              Walk Right
            </button>
          </div>
        </div>
      </section>

      <section className={styles.notes} aria-labelledby="notes-title">
        <p className={styles.cardLabel}>What this proves</p>
        <h2 id="notes-title">DOM, CSS, Pointer Events, and WAAPI.</h2>
        <ul>
          <li>The four-frame idle loop comes from a CSS sprite sheet.</li>
          <li>The enlarged artwork keeps hard, pixelated edges.</li>
          <li>Pointer capture keeps dragging active until release or cancel.</li>
          <li>WAAPI moves the same DOM element without replacing drag state.</li>
        </ul>
      </section>

      <div className={styles.companionLayer} aria-hidden="false">
        <div
          aria-label="Draggable temporary pixel companion"
          className={styles.companion}
          data-dragging={isDragging}
          data-motion-state={motionState}
          onLostPointerCapture={stopDragging}
          onPointerCancel={stopDragging}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          ref={companionElement}
          role="img"
          style={companionStyle}
        />
      </div>
    </main>
  );
}
