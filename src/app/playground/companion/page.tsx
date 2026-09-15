"use client";

import {
  useCallback,
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
type HorizontalFacingDirection = "east" | "west";
type FacingDirection = "south" | HorizontalFacingDirection;
type TurnPose = FacingDirection | "south-east" | "south-west";
type WalkSource = "manual" | "autonomous";
type MotionState = "idle" | "turning" | "walking";

type MovementPlan = {
  direction: WalkDirection;
  distance: number;
};

type ActiveTurn = {
  source: WalkSource;
  timeoutId: number | null;
};

type PendingWalkingHandoff = {
  expectedAsset: string;
  frameId: number | null;
  source: WalkSource;
};

const MANUAL_WALK_DISTANCE_PX = 100;
const AUTONOMOUS_WALK_MIN_DISTANCE_PX = 60;
const AUTONOMOUS_WALK_MAX_DISTANCE_PX = 100;
const AUTONOMOUS_IDLE_MIN_MS = 4_000;
const AUTONOMOUS_IDLE_MAX_MS = 8_000;
const WALK_DURATION_MS = 1_400;
const TURN_POSE_DURATION_MS = 100;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const HORIZONTAL_TURN_PATH = [
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
] as const satisfies readonly TurnPose[];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function randomInteger(minimum: number, maximum: number): number {
  return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
}

function getClampedPosition(bounds: DOMRect): Position {
  return {
    x: clamp(bounds.left, 0, window.innerWidth - bounds.width),
    y: clamp(bounds.top, 0, window.innerHeight - bounds.height),
  };
}

function getTurnSequence(
  currentFacing: FacingDirection,
  targetFacing: HorizontalFacingDirection,
): TurnPose[] {
  if (currentFacing === targetFacing) {
    return [];
  }

  const currentIndex = HORIZONTAL_TURN_PATH.indexOf(currentFacing);
  const targetIndex = HORIZONTAL_TURN_PATH.indexOf(targetFacing);
  const step = currentIndex < targetIndex ? 1 : -1;
  const sequence: TurnPose[] = [];

  for (let index = currentIndex + step; index !== targetIndex + step; index += step) {
    sequence.push(HORIZONTAL_TURN_PATH[index]);
  }

  return sequence;
}

function chooseAutonomousMovement(bounds: DOMRect): MovementPlan | null {
  const availableMovements = ([
    {
      direction: -1,
      distance: Math.min(
        AUTONOMOUS_WALK_MAX_DISTANCE_PX,
        Math.floor(bounds.left),
      ),
    },
    {
      direction: 1,
      distance: Math.min(
        AUTONOMOUS_WALK_MAX_DISTANCE_PX,
        Math.floor(window.innerWidth - bounds.right),
      ),
    },
  ] satisfies MovementPlan[]).filter(
    (movement) => movement.distance >= AUTONOMOUS_WALK_MIN_DISTANCE_PX,
  );

  if (availableMovements.length === 0) {
    return null;
  }

  const movement =
    availableMovements[randomInteger(0, availableMovements.length - 1)];

  return {
    direction: movement.direction,
    distance: randomInteger(
      AUTONOMOUS_WALK_MIN_DISTANCE_PX,
      movement.distance,
    ),
  };
}

export default function CompanionPlaygroundPage() {
  const companionElement = useRef<HTMLDivElement | null>(null);
  const companionImageElement = useRef<HTMLImageElement | null>(null);
  const activeDrag = useRef<ActiveDrag | null>(null);
  const activeMovement = useRef<Animation | null>(null);
  const activeTurn = useRef<ActiveTurn | null>(null);
  const pendingWalkingHandoff = useRef<PendingWalkingHandoff | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [facingDirection, setFacingDirection] =
    useState<FacingDirection>("south");
  const [turnPose, setTurnPose] = useState<TurnPose | null>(null);
  const [activeWalkingDirection, setActiveWalkingDirection] =
    useState<HorizontalFacingDirection | null>(null);
  const [motionState, setMotionState] = useState<MotionState>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [idleCycle, setIdleCycle] = useState(0);
  const [isPageVisible, setIsPageVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(REDUCED_MOTION_QUERY).matches,
  );
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
  const displayedIdlePose = turnPose ?? facingDirection;
  const companionAsset = activeWalkingDirection
    ? `/companion/walking/${activeWalkingDirection}.gif`
    : `/companion/idle/${displayedIdlePose}.png`;

  const commitPosition = useCallback(
    (element: HTMLDivElement, nextPosition: Position) => {
      element.style.left = `${nextPosition.x}px`;
      element.style.top = `${nextPosition.y}px`;
      element.style.right = "auto";
      element.style.bottom = "auto";
      setPosition(nextPosition);
    },
    [],
  );

  const cancelPendingWalkingHandoff = useCallback(() => {
    const handoff = pendingWalkingHandoff.current;

    if (!handoff) {
      return;
    }

    if (handoff.frameId !== null) {
      window.cancelAnimationFrame(handoff.frameId);
    }

    pendingWalkingHandoff.current = null;
    setActiveWalkingDirection(null);
    setMotionState("idle");
  }, []);

  const cancelActiveTurn = useCallback(() => {
    const turn = activeTurn.current;

    if (!turn) {
      return;
    }

    if (turn.timeoutId !== null) {
      window.clearTimeout(turn.timeoutId);
    }

    activeTurn.current = null;
    setTurnPose(null);
    setMotionState("idle");
  }, []);

  useEffect(() => {
    const motionPreference = window.matchMedia(REDUCED_MOTION_QUERY);

    function handleVisibilityChange() {
      const pageIsVisible = document.visibilityState === "visible";

      if (!pageIsVisible && activeTurn.current?.source === "autonomous") {
        cancelActiveTurn();
      }

      if (
        !pageIsVisible &&
        pendingWalkingHandoff.current?.source === "autonomous"
      ) {
        cancelPendingWalkingHandoff();
      }

      setIsPageVisible(pageIsVisible);
    }

    function handleMotionPreferenceChange(event: MediaQueryListEvent) {
      if (event.matches) {
        cancelActiveTurn();
        cancelPendingWalkingHandoff();
      }

      setPrefersReducedMotion(event.matches);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    motionPreference.addEventListener("change", handleMotionPreferenceChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      motionPreference.removeEventListener(
        "change",
        handleMotionPreferenceChange,
      );
      activeMovement.current?.cancel();
      activeMovement.current = null;

      const turn = activeTurn.current;

      if (turn?.timeoutId !== null && turn?.timeoutId !== undefined) {
        window.clearTimeout(turn.timeoutId);
      }

      activeTurn.current = null;

      const handoff = pendingWalkingHandoff.current;

      if (handoff?.frameId !== null && handoff?.frameId !== undefined) {
        window.cancelAnimationFrame(handoff.frameId);
      }

      pendingWalkingHandoff.current = null;
    };
  }, [cancelActiveTurn, cancelPendingWalkingHandoff]);

  function interruptMovement(element: HTMLDivElement): DOMRect {
    const bounds = element.getBoundingClientRect();

    cancelActiveTurn();
    cancelPendingWalkingHandoff();

    const movement = activeMovement.current;

    if (!movement) {
      return bounds;
    }

    activeMovement.current = null;
    movement.cancel();
    commitPosition(element, getClampedPosition(bounds));
    setActiveWalkingDirection(null);
    setMotionState("idle");

    return element.getBoundingClientRect();
  }

  const startWalking = useCallback(
    (direction: WalkDirection, distance: number, source: WalkSource) => {
      const element = companionElement.current;

      if (
        !element ||
        activeMovement.current ||
        activeTurn.current ||
        pendingWalkingHandoff.current ||
        activeDrag.current
      ) {
        return;
      }

      const walkingElement = element;
      const bounds = walkingElement.getBoundingClientRect();
      const startPosition = getClampedPosition(bounds);
      const targetPosition = {
        x: clamp(
          startPosition.x + direction * distance,
          0,
          window.innerWidth - bounds.width,
        ),
        y: startPosition.y,
      };
      const travelDistance = targetPosition.x - startPosition.x;

      if (travelDistance === 0) {
        return;
      }

      const targetFacing: HorizontalFacingDirection =
        direction === 1 ? "east" : "west";

      if (window.matchMedia(REDUCED_MOTION_QUERY).matches) {
        setFacingDirection(targetFacing);
        setTurnPose(null);

        if (source === "manual") {
          commitPosition(walkingElement, targetPosition);
        }

        return;
      }

      function beginTranslation() {
        if (
          activeDrag.current ||
          (source === "autonomous" &&
            document.visibilityState !== "visible")
        ) {
          setTurnPose(null);
          setMotionState("idle");
          return;
        }

        const expectedAsset = `/companion/walking/${targetFacing}.gif`;
        const handoff: PendingWalkingHandoff = {
          expectedAsset,
          frameId: null,
          source,
        };

        pendingWalkingHandoff.current = handoff;
        setFacingDirection(targetFacing);
        setTurnPose(null);
        setActiveWalkingDirection(targetFacing);
        setMotionState("walking");

        function startTranslationAfterWalkingVisualRenders() {
          if (pendingWalkingHandoff.current !== handoff) {
            return;
          }

          if (
            activeDrag.current ||
            (source === "autonomous" &&
              document.visibilityState !== "visible")
          ) {
            cancelPendingWalkingHandoff();
            return;
          }

          const image = companionImageElement.current;
          const renderedAsset = image
            ? new URL(image.currentSrc || image.src).pathname
            : null;

          if (
            !image ||
            renderedAsset !== expectedAsset ||
            !image.complete
          ) {
            handoff.frameId = window.requestAnimationFrame(
              startTranslationAfterWalkingVisualRenders,
            );
            return;
          }

          if (image.naturalWidth === 0) {
            cancelPendingWalkingHandoff();
            return;
          }

          // Give WebKit a painted GIF frame before the parent enters WAAPI compositing.
          handoff.frameId = window.requestAnimationFrame(() => {
            if (pendingWalkingHandoff.current !== handoff) {
              return;
            }

            pendingWalkingHandoff.current = null;

            const movement = walkingElement.animate(
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
                commitPosition(walkingElement, targetPosition);
                setActiveWalkingDirection(null);
                setMotionState("idle");
              })
              .catch(() => {
                if (activeMovement.current !== movement) {
                  return;
                }

                activeMovement.current = null;
                setActiveWalkingDirection(null);
                setMotionState("idle");
              });
          });
        }

        handoff.frameId = window.requestAnimationFrame(
          startTranslationAfterWalkingVisualRenders,
        );
      }

      const turnSequence = getTurnSequence(facingDirection, targetFacing);

      if (turnSequence.length === 0) {
        beginTranslation();
        return;
      }

      const turn: ActiveTurn = { source, timeoutId: null };
      let poseIndex = 0;

      activeTurn.current = turn;
      setMotionState("turning");

      function showNextPose() {
        if (activeTurn.current !== turn) {
          return;
        }

        const nextPose = turnSequence[poseIndex];

        if (nextPose === undefined) {
          activeTurn.current = null;
          beginTranslation();
          return;
        }

        setTurnPose(nextPose);
        poseIndex += 1;
        turn.timeoutId = window.setTimeout(
          showNextPose,
          TURN_POSE_DURATION_MS,
        );
      }

      showNextPose();
    },
    [cancelPendingWalkingHandoff, commitPosition, facingDirection],
  );

  useEffect(() => {
    if (
      motionState !== "idle" ||
      isDragging ||
      !isPageVisible ||
      prefersReducedMotion
    ) {
      return;
    }

    const delay = randomInteger(
      AUTONOMOUS_IDLE_MIN_MS,
      AUTONOMOUS_IDLE_MAX_MS,
    );
    const timer = window.setTimeout(() => {
      const element = companionElement.current;

      if (
        !element ||
        activeMovement.current ||
        activeTurn.current ||
        pendingWalkingHandoff.current ||
        activeDrag.current ||
        document.visibilityState !== "visible" ||
        window.matchMedia(REDUCED_MOTION_QUERY).matches
      ) {
        return;
      }

      const movement = chooseAutonomousMovement(
        element.getBoundingClientRect(),
      );

      if (!movement) {
        setIdleCycle((cycle) => cycle + 1);
        return;
      }

      startWalking(movement.direction, movement.distance, "autonomous");
    }, delay);

    return () => window.clearTimeout(timer);
  }, [
    idleCycle,
    isDragging,
    isPageVisible,
    motionState,
    prefersReducedMotion,
    startWalking,
  ]);

  function startManualWalk(direction: WalkDirection) {
    setIdleCycle((cycle) => cycle + 1);
    startWalking(direction, MANUAL_WALK_DISTANCE_PX, "manual");
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
    setIdleCycle((cycle) => cycle + 1);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <main className={styles.pageShell}>
      <section className={styles.intro} aria-labelledby="playground-title">
        <p className={styles.eyebrow}>Disposable experiment · Step 4.2.1</p>
        <h1 id="playground-title">Companion Playground</h1>
        <p>
          Horizontal WAAPI movement now waits until the correct PixelLab
          walking GIF is loaded and painted for browser compositing.
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
              disabled={motionState !== "idle"}
              onClick={() => startManualWalk(-1)}
              type="button"
            >
              Walk Left
            </button>
            <button
              className={styles.walkButton}
              disabled={motionState !== "idle"}
              onClick={() => startManualWalk(1)}
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
          <li>Directional PixelLab PNGs provide the idle appearance.</li>
          <li>The original artwork keeps hard, pixelated edges.</li>
          <li>Pointer capture keeps dragging active until release or cancel.</li>
          <li>WAAPI moves the same DOM element without replacing drag state.</li>
          <li>A single quiet timer occasionally requests a short horizontal walk.</li>
          <li>PixelLab idle PNGs and walking GIFs reflect the current direction.</li>
          <li>Short south-facing poses make direction changes visually continuous.</li>
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
        >
          {/* The playground must render the original animated GIF without image processing. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            className={styles.companionImage}
            data-motion-state={motionState}
            draggable={false}
            key={companionAsset}
            ref={companionImageElement}
            src={companionAsset}
          />
        </div>
      </div>
    </main>
  );
}
