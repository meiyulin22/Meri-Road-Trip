/**
 * One colour per day of a plan (1.2105), shared by the map's lines and pins and the day cards'
 * number, so a day reads the same in both places. Meri's own tones, each dark enough for a white
 * number on a pin (≥ 4.5:1) and for a line on Tianditu's land, roads and water (≥ 3:1, checked
 * against colours close to the base map's). After six days the colours repeat.
 */
const palette = [
  { solid: "#2f5d46", soft: "#e2e8e5" }, // forest green
  { solid: "#b5532f", soft: "#f5e7e2" }, // terracotta
  { solid: "#2c6a8f", soft: "#e1eaef" }, // lake blue
  { solid: "#9a6a12", soft: "#f1eade" }, // ochre
  { solid: "#7a4a78", soft: "#ece6ec" }, // plum
  { solid: "#4a5a6a", soft: "#e6e8ea" }, // slate
] as const;

export type DayColor = (typeof palette)[number];

/** Days count from 1; day 7 takes day 1's colour again. */
export function dayColor(day: number): DayColor {
  const index = ((Math.trunc(day) - 1) % palette.length + palette.length) % palette.length;
  return palette[index];
}

/** The grey of the days not being looked at. */
export const fadedDayColor = "#a9b3a6";
