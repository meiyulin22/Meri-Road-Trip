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
  down_jacket: { z: 42, swatch: "#3f5f8a", pixels: [
    [8, 16, 16, 12, "#3f5f8a"], [5, 17, 4, 9, "#3f5f8a"], [23, 17, 4, 9, "#3f5f8a"],
    [8, 19, 16, 1, "#2d4566"], [8, 22, 16, 1, "#2d4566"], [8, 25, 16, 1, "#2d4566"], [16, 16, 1, 12, "#9fb8d8"],
  ] },
  scarf: { z: 45, swatch: "#e0b03c", pixels: [[9, 16, 14, 2, "#e0b03c"], [19, 18, 3, 5, "#e0b03c"], [19, 22, 3, 1, "#b8862a"]] },
  gloves: { z: 50, swatch: "#2d4566", pixels: [[5, 25, 4, 3, "#2d4566"], [23, 25, 4, 3, "#2d4566"]] },
  sunglasses: { z: 60, swatch: "#1d1410", pixels: [[10, 9, 5, 2, "#1d1410"], [17, 9, 5, 2, "#1d1410"], [15, 9, 2, 1, "#1d1410"]] },
  beanie: { z: 70, swatch: "#c95f3d", pixels: [[8, 2, 16, 5, "#c95f3d"], [8, 6, 16, 1, "#e2773f"], [15, 0, 2, 2, cream]] },
  sun_hat: { z: 71, swatch: "#e9d7a5", pixels: [[10, 1, 12, 4, "#e9d7a5"], [10, 4, 12, 1, "#c95f3d"], [5, 5, 22, 2, "#e9d7a5"]] },
  umbrella: { z: 80, swatch: "#6f93b8", pixels: [[24, 5, 6, 1, "#6f93b8"], [22, 6, 10, 3, "#6f93b8"], [22, 8, 10, 1, "#4f6f91"], [27, 9, 1, 15, limb], [26, 24, 2, 1, limb]] },
  sunscreen: null,
};

/** The swatch for an addition from Meri, which has no art of its own. */
export const extraSwatch = "#d7c2e0";

/** Bag-only items still get a swatch in their slot. */
export const bagSwatch: Partial<Record<OutfitItemId, string>> = { sunscreen: "#f2c94c" };
