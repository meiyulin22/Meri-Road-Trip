/**
 * Where the red panda's pupils point and when it blinks. Pure, so the feel can be tested
 * without a browser; the component feeds it measured positions and a random source.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * The pupil's offset from the eye's centre, in the same units as `reach`. It points at the
 * target and leans further out the farther away the target is, reaching the edge of the
 * eye at `range`; a target on the eye itself leaves the pupil centred.
 */
export function pupilOffset(eye: Point, target: Point, reach: number, range: number): Point {
  const dx = target.x - eye.x;
  const dy = target.y - eye.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1 || reach <= 0 || range <= 0) return { x: 0, y: 0 };
  const lean = reach * Math.min(1, distance / range);
  return { x: (dx / distance) * lean, y: (dy / distance) * lean };
}

/** Milliseconds until the next blink: a person-like 2.5–6 seconds, never in a fixed rhythm. */
export function nextBlinkDelay(random: () => number = Math.random): number {
  return 2500 + Math.floor(random() * 3500);
}

/**
 * What to look at while someone types: the text they are writing, roughly where the
 * caret is, so the panda reads along instead of staring at the last pointer position.
 */
export function typingTarget(box: { readonly left: number; readonly top: number; readonly width: number; readonly height: number },
  characters: number): Point {
  const along = Math.min(0.85, 0.1 + characters * 0.012);
  return { x: box.left + box.width * along, y: box.top + box.height * 0.5 };
}
