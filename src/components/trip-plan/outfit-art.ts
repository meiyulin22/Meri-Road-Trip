import { z } from "zod";

import { type OutfitItemId, outfitItemIds } from "@/domain/plan/outfit";

/**
 * The equipment screen's art (1.2117 outfit). Real art is a paper doll drawn by Codex: one still
 * base red panda and one transparent overlay per basic, all on the same canvas, listed in
 * `public/companion/outfit/manifest.json`. Until that file exists the page draws these placeholder
 * pixels on a 32 × 40 grid instead; the layout and interaction are the same either way.
 */

export const artBase = "/companion/outfit/";
export const manifestUrl = `${artBase}manifest.json`;

const fileName = z.string().regex(/^[a-z0-9_-]+\.(webp|png)$/u);
export const outfitManifestSchema = z.object({
  version: z.literal(1),
  canvas: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  /** Pixel art is scaled with hard edges; painted art smoothly. */
  pixelated: z.boolean(),
  base: fileName,
  items: z.partialRecord(z.enum(outfitItemIds as [OutfitItemId, ...OutfitItemId[]]), z.object({ file: fileName, z: z.number().int() })),
  /** Optional small icons for the slots, by item; missing ones fall back to the placeholder swatch. */
  icons: z.partialRecord(z.enum(outfitItemIds as [OutfitItemId, ...OutfitItemId[]]), fileName).optional(),
});
export type OutfitManifest = z.infer<typeof outfitManifestSchema>;

/** Read once per page load; a missing or malformed manifest means placeholders, never an error. */
let manifest: Promise<OutfitManifest | null> | null = null;
export function loadOutfitManifest(): Promise<OutfitManifest | null> {
  manifest ??= fetch(manifestUrl)
    .then(async (response) => (response.ok ? outfitManifestSchema.safeParse(await response.json()) : null))
    .then((parsed) => (parsed?.success ? parsed.data : null))
    .catch(() => null);
  return manifest;
}

/** A filled rectangle of placeholder pixels: x, y, width, height, colour. */
export type Pixels = readonly (readonly [number, number, number, number, string])[];

export const gridWidth = 32;
export const gridHeight = 40;

const fur = "#c8502a";
const furLight = "#e2773f";
const cream = "#f6efe4";
const dark = "#2b1d18";
const limb = "#5a2d1e";
const furShade = "#a8432a";

/** The placeholder red panda, standing, facing the viewer. */
export const basePixels: Pixels = [
  // Tail behind, ringed.
  [23, 24, 5, 3, fur], [24, 27, 5, 2, limb], [24, 29, 5, 3, fur], [25, 32, 4, 2, limb], [25, 34, 3, 2, furLight],
  // Ears.
  [8, 3, 4, 3, fur], [9, 4, 2, 2, dark], [20, 3, 4, 3, fur], [21, 4, 2, 2, dark],
  // Head.
  [8, 5, 16, 12, fur], [7, 7, 18, 8, fur], [9, 6, 3, 1, furLight], [20, 6, 3, 1, furLight],
  [11, 7, 2, 1, cream], [19, 7, 2, 1, cream],
  [8, 11, 5, 4, cream], [19, 11, 5, 4, cream], [12, 9, 2, 2, dark], [18, 9, 2, 2, dark],
  [13, 12, 6, 4, cream], [15, 12, 2, 1, dark], [15, 14, 2, 1, limb],
  // Body, dark belly, arms and paws.
  [10, 17, 12, 11, fur], [12, 19, 8, 8, limb], [7, 18, 3, 8, limb], [22, 18, 3, 8, limb], [7, 26, 3, 2, dark], [22, 26, 3, 2, dark],
  // Legs and feet.
  [11, 28, 4, 7, limb], [17, 28, 4, 7, limb], [10, 35, 5, 2, dark], [17, 35, 5, 2, dark],
  // Shading, light from the upper left (2026-11-22): the head's right edge and chin, the body's right side.
  [23, 8, 1, 3, furShade], [9, 16, 14, 1, furShade], [21, 17, 1, 11, furShade],
];

/**
 * A quilted down jacket (2026-11-22, merlin: make it look like one): puffy bands, each lit on top and
 * shaded underneath, a raised collar, cuffs and a zip; the right side is in shadow.
 */
const downBlue = "#3f5f8a";
const downLight = "#5b7fb0";
const downShade = "#2b4365";
const downJacket: Pixels = [
  // Body and sleeves, a pixel wider than the body below for the puff; corners left off to round them.
  [8, 17, 16, 11, downBlue], [9, 16, 14, 1, downBlue], [9, 28, 14, 1, downShade],
  [5, 18, 4, 8, downBlue], [23, 18, 4, 8, downBlue], [6, 17, 2, 1, downBlue], [24, 17, 2, 1, downBlue],
  // Four bands on the body and three on each sleeve: lit top row, shaded bottom row.
  ...[17, 20, 23, 26].flatMap((y): Pixels => [[8, y, 16, 1, downLight], [8, y + 2, 16, 1, downShade]]),
  ...[18, 21, 24].flatMap((y): Pixels => [[5, y, 4, 1, downLight], [5, y + 2, 4, 1, downShade], [23, y, 4, 1, downLight], [23, y + 2, 4, 1, downShade]]),
  // Shadow down the right side.
  [23, 17, 1, 11, downShade], [26, 18, 1, 8, downShade],
  // Raised collar and cuffs.
  [10, 15, 12, 2, downShade], [11, 15, 10, 1, downLight],
  [5, 26, 4, 1, downShade], [23, 26, 4, 1, downShade],
  // Zip.
  [16, 16, 1, 12, "#9fb8d8"], [16, 18, 1, 1, "#e5edf7"],
];

/** A knitted beanie: rounded crown with a knit texture, a ribbed fold-up brim, a shaded pom-pom (2026-11-22). */
const beanieRed = "#c95f3d";
const beanieShade = "#a5462a";
const beanieLight = "#e2773f";
const beanie: Pixels = [
  // Crown, narrower at the top.
  [11, 2, 10, 1, beanieRed], [9, 3, 14, 1, beanieRed], [8, 4, 16, 2, beanieRed],
  [11, 2, 3, 1, beanieLight], [9, 3, 3, 1, beanieLight], [22, 3, 1, 1, beanieShade], [23, 4, 1, 2, beanieShade],
  // Knit stitches.
  [12, 3, 1, 1, beanieShade], [15, 4, 1, 1, beanieShade], [18, 3, 1, 1, beanieShade], [20, 5, 1, 1, beanieShade], [10, 5, 1, 1, beanieShade],
  // Ribbed brim: alternating columns.
  [7, 6, 18, 2, beanieLight],
  ...Array.from({ length: 9 }, (_, i): Pixels[number] => [8 + i * 2, 6, 1, 2, beanieShade]),
  // Pom-pom, lit on the left.
  [14, 0, 4, 2, cream], [14, 0, 1, 1, "#ffffff"], [17, 1, 1, 1, "#d9cdb9"],
];

/** Each basic's placeholder pixels and the order it is drawn in; null for things kept in the bag. */
export const itemPixels: Record<OutfitItemId, { readonly z: number; readonly pixels: Pixels; readonly swatch: string } | null> = {
  thermal_pants: { z: 10, swatch: "#9a7b5b", pixels: [[11, 28, 4, 8, "#9a7b5b"], [17, 28, 4, 8, "#9a7b5b"]] },
  trousers: { z: 12, swatch: "#3d4a5c", pixels: [[10, 27, 12, 2, "#3d4a5c"], [11, 28, 4, 6, "#3d4a5c"], [17, 28, 4, 6, "#3d4a5c"]] },
  walking_shoes: { z: 14, swatch: "#e8e2d0", pixels: [[10, 35, 5, 2, "#e8e2d0"], [10, 36, 5, 1, "#6f7f7b"], [17, 35, 5, 2, "#e8e2d0"], [17, 36, 5, 1, "#6f7f7b"]] },
  waterproof_shoes: { z: 15, swatch: "#c9a227", pixels: [[10, 33, 5, 4, "#c9a227"], [10, 36, 5, 1, "#5a4a1e"], [17, 33, 5, 4, "#c9a227"], [17, 36, 5, 1, "#5a4a1e"]] },
  thermal_top: { z: 20, swatch: "#d9c7a6", pixels: [[10, 17, 12, 10, "#d9c7a6"], [7, 18, 3, 8, "#d9c7a6"], [22, 18, 3, 8, "#d9c7a6"]] },
  tshirt: { z: 21, swatch: "#7fb3a3", pixels: [[10, 17, 12, 8, "#7fb3a3"], [8, 18, 2, 3, "#7fb3a3"], [22, 18, 2, 3, "#7fb3a3"]] },
  long_sleeve: { z: 22, swatch: "#6f93b8", pixels: [[10, 17, 12, 9, "#6f93b8"], [7, 18, 3, 7, "#6f93b8"], [22, 18, 3, 7, "#6f93b8"]] },
  fleece: { z: 30, swatch: "#b8865b", pixels: [[10, 17, 12, 10, "#b8865b"], [7, 18, 3, 8, "#b8865b"], [22, 18, 3, 8, "#b8865b"], [16, 17, 1, 4, "#e8d2b4"]] },
  windbreaker: { z: 40, swatch: "#4f836b", pixels: [[9, 17, 14, 10, "#4f836b"], [6, 18, 4, 8, "#4f836b"], [22, 18, 4, 8, "#4f836b"], [16, 17, 1, 10, "#a9cdb9"]] },
  shell_jacket: { z: 41, swatch: "#c95f3d", pixels: [[9, 15, 14, 2, "#a94a2e"], [9, 16, 14, 12, "#c95f3d"], [6, 18, 4, 9, "#c95f3d"], [22, 18, 4, 9, "#c95f3d"], [16, 16, 1, 12, "#f6e4da"]] },
  down_jacket: { z: 42, swatch: downBlue, pixels: downJacket },
  scarf: { z: 45, swatch: "#e0b03c", pixels: [[9, 16, 14, 2, "#e0b03c"], [19, 18, 3, 5, "#e0b03c"], [19, 22, 3, 1, "#b8862a"]] },
  gloves: { z: 50, swatch: "#2d4566", pixels: [[5, 25, 4, 3, "#2d4566"], [23, 25, 4, 3, "#2d4566"]] },
  sunglasses: { z: 60, swatch: "#1d1410", pixels: [[10, 9, 5, 2, "#1d1410"], [17, 9, 5, 2, "#1d1410"], [15, 9, 2, 1, "#1d1410"]] },
  beanie: { z: 70, swatch: beanieRed, pixels: beanie },
  sun_hat: { z: 71, swatch: "#e9d7a5", pixels: [[10, 1, 12, 4, "#e9d7a5"], [10, 4, 12, 1, "#c95f3d"], [5, 5, 22, 2, "#e9d7a5"]] },
  umbrella: { z: 80, swatch: "#6f93b8", pixels: [[24, 5, 6, 1, "#6f93b8"], [22, 6, 10, 3, "#6f93b8"], [22, 8, 10, 1, "#4f6f91"], [27, 9, 1, 15, limb], [26, 24, 2, 1, limb]] },
  sunscreen: null,
};

/** The swatch for an addition from Meri, which has no art of its own. */
export const extraSwatch = "#d7c2e0";

/** Bag-only items still get a swatch in their slot. */
export const bagSwatch: Partial<Record<OutfitItemId, string>> = { sunscreen: "#f2c94c" };
