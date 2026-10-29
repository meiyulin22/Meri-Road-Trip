/**
 * Which way the red panda looks and which drawn frame shows it. Pure, so the feel can be
 * tested without a browser; the component feeds it measured positions.
 *
 * The frames come from head-turn videos — one that looks round a full circle and four that
 * look one way and back — and each frame is placed by where its face looks, (x, y) each in
 * -1…1 (public/companion/red-panda/turns.json). A look anywhere around the panda is drawn
 * with the nearest frame, so turning from "left" through "down-left" to "down" steps
 * through neighbouring frames of the circle instead of jumping or blending two faces.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** -1 is fully left (or up), 1 fully right (or down), 0 straight ahead. */
export interface Pose {
  readonly x: number;
  readonly y: number;
}

export interface TurnFrames {
  readonly front: number;
  /** Where each frame's face looks, [x, y], indexed like the sprite. */
  readonly looks: readonly (readonly number[])[];
}

const clamp = (value: number) => Math.max(-1, Math.min(1, value));

/**
 * Where to look, from where the panda's face is and where the pointer is. A pointer `reach`
 * pixels or further away turns the head fully that way; a pointer on the face leaves it
 * straight ahead.
 */
export function poseToward(face: Point, target: Point, reach: { readonly x: number; readonly y: number }): Pose {
  return { x: clamp((target.x - face.x) / reach.x), y: clamp((target.y - face.y) / reach.y) };
}

/** Looks closer to straight ahead than this show the front frame. */
const ahead = 0.05;
/** How far round (radians) a frame still counts toward how far the head can turn that way. */
const reachWindow = (60 * Math.PI) / 180;
/** How much nearer another frame must be before it replaces the one showing, so the head does not flicker between two. */
const stickiness = 0.03;

function angleBetween(a: number, b: number): number {
  const difference = Math.abs(a - b) % (2 * Math.PI);
  return difference > Math.PI ? 2 * Math.PI - difference : difference;
}

/**
 * The frame that best draws a pose. The frames do not turn equally far every way (the head
 * lowers less toward down-left than straight down), so the pose is first scaled to how far
 * frames reach in its direction; otherwise a look down-left would snap to the full look down.
 * `current`, the frame showing now, is kept unless another is clearly nearer.
 */
export function frameFor(pose: Pose, frames: TurnFrames, current?: number): number {
  const amount = Math.min(1, Math.hypot(pose.x, pose.y));
  if (amount < ahead) return frames.front;
  const direction = Math.atan2(pose.y, pose.x);
  let reach = 0;
  for (const [x, y] of frames.looks) {
    const length = Math.hypot(x, y);
    if (length < ahead) continue;
    const weight = 1 - angleBetween(direction, Math.atan2(y, x)) / reachWindow;
    if (weight > 0) reach = Math.max(reach, length * weight);
  }
  const target = { x: Math.cos(direction) * amount * reach, y: Math.sin(direction) * amount * reach };
  const distance = (index: number) => Math.hypot(frames.looks[index][0] - target.x, frames.looks[index][1] - target.y);
  let best = frames.front;
  for (let index = 0; index < frames.looks.length; index += 1) {
    if (distance(index) < distance(best)) best = index;
  }
  return current !== undefined && current < frames.looks.length && distance(current) <= distance(best) + stickiness
    ? current : best;
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
