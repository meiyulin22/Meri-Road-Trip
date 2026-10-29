/** Pointer projection into a known Cartesian yaw/pitch grid, never an unordered pose search. */
export interface Point { readonly x: number; readonly y: number; }
export interface LookGrid {
  readonly columns: number;
  readonly rows: number;
  readonly yaw: { readonly min: number; readonly max: number };
  readonly pitch: { readonly min: number; readonly max: number };
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const radiansToDegrees = 180 / Math.PI;

export function neutralPosition(grid: LookGrid): Point {
  return { x: (grid.columns - 1) / 2, y: (grid.rows - 1) / 2 };
}

export function pointerPosition(face: Point, pointer: Point, viewport: { readonly width: number; readonly height: number }, grid: LookGrid): Point {
  if (![face.x, face.y, pointer.x, pointer.y, viewport.width, viewport.height].every(Number.isFinite)) return neutralPosition(grid);
  const distance = Math.max(120, Math.min(viewport.width, viewport.height) * 0.35);
  const dx = pointer.x - face.x;
  const dy = pointer.y - face.y;
  const yaw = clamp(Math.atan2(dx, distance) * radiansToDegrees, grid.yaw.min, grid.yaw.max);
  const pitch = clamp(Math.atan2(dy, Math.hypot(dx, distance)) * radiansToDegrees, grid.pitch.min, grid.pitch.max);
  return {
    x: ((yaw - grid.yaw.min) / (grid.yaw.max - grid.yaw.min)) * (grid.columns - 1),
    y: ((pitch - grid.pitch.min) / (grid.pitch.max - grid.pitch.min)) * (grid.rows - 1),
  };
}

export function gridFrame(position: Point, grid: LookGrid): number {
  const neutral = neutralPosition(grid);
  const x = Number.isFinite(position.x) ? position.x : neutral.x;
  const y = Number.isFinite(position.y) ? position.y : neutral.y;
  return Math.round(clamp(y, 0, grid.rows - 1)) * grid.columns + Math.round(clamp(x, 0, grid.columns - 1));
}

export function canTrackPointer(state: { readonly active: boolean; readonly visible: boolean; readonly inView: boolean; readonly finePointer: boolean; readonly reducedMotion: boolean }): boolean {
  return state.active && state.visible && state.inView && state.finePointer && !state.reducedMotion;
}
