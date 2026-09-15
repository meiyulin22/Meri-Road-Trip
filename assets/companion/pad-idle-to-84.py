#!/usr/bin/env python3
"""One-off asset normalisation for Companion Playground Step 4.2.3.

The walking GIFs are authored on an 84x84 canvas. The idle/turn PNGs were
exported from the same authoring canvas but cropped 10px on every side, which
left the runtime with two intrinsic canvas sizes (64 and 84) and therefore two
CSS geometries. That made a stale-bitmap paint able to render at the wrong
scale on iOS Safari.

This script restores the original 84x84 canvas by padding 10px on every side.
It is pure canvas padding: no scaling, resampling, filtering or recolouring.
Every original pixel is copied verbatim, so the rendered result is unchanged
(-15px offset + 126px box cancels the 10px pad exactly: -15 + 10 * 1.5 == 0).

Run from the repository root. Idempotent: already-84x84 files are skipped.
Not part of the application runtime.
"""

from pathlib import Path

from PIL import Image

SOURCE_CANVAS = 64
TARGET_CANVAS = 84
PAD = (TARGET_CANVAS - SOURCE_CANVAS) // 2  # 10px on every side
IDLE_DIR = Path("public/companion/idle")
ORIGINALS_DIR = Path("assets/companion/idle-original-64x64")


def pad_to_target_canvas(original: Image.Image) -> Image.Image:
    padded = Image.new("RGBA", (TARGET_CANVAS, TARGET_CANVAS), (0, 0, 0, 0))
    padded.paste(original, (PAD, PAD))
    return padded


def assert_pixels_preserved(original: Image.Image, padded: Image.Image) -> None:
    region = padded.crop((PAD, PAD, PAD + SOURCE_CANVAS, PAD + SOURCE_CANVAS))
    if region.tobytes() != original.tobytes():
        raise SystemExit("Padding altered character pixels; refusing to write.")

    border = padded.copy()
    border.paste((0, 0, 0, 0), (PAD, PAD, PAD + SOURCE_CANVAS, PAD + SOURCE_CANVAS))
    if border.getbbox() is not None:
        raise SystemExit("Padding border is not fully transparent; refusing to write.")


def main() -> None:
    for path in sorted(IDLE_DIR.glob("*.png")):
        source = ORIGINALS_DIR / path.name
        original = Image.open(source if source.exists() else path).convert("RGBA")

        if original.size != (SOURCE_CANVAS, SOURCE_CANVAS):
            print(f"skip {path.name}: already {original.size[0]}x{original.size[1]}")
            continue

        padded = pad_to_target_canvas(original)
        assert_pixels_preserved(original, padded)
        padded.save(path, format="PNG", optimize=True)
        print(f"padded {path.name}: 64x64 -> 84x84 (+{PAD}px per side)")


if __name__ == "__main__":
    main()
