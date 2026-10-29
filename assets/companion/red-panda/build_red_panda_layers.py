#!/usr/bin/env python3
"""Cuts the red panda into the three layers the chat-box companion animates.

Sources (both from GPT, same pose and canvas, checked to line up within 1–2px):
  red-panda-open-eyes-v1.png     the whole panda, front paws resting on the edge
  red-panda-body-no-paws-v2.png  the same panda with the paws removed and the chest fur filled in

The paws are exactly where the two differ, so they are cut from v1 by that difference;
the body is v2 as it is. All three layers keep one shared canvas (cropped to the panda),
so the page can stack them with no offsets. Also measures the two plain white eyes,
which the page fills with code-drawn pupils and eyelids.

Writes public/companion/red-panda/{whole,body,paw-left,paw-right}.webp and red-panda.json.
Run from anywhere:  python3 assets/companion/red-panda/build_red_panda_layers.py [--preview DIR]
Needs Pillow with WebP (present on the development Mac). Not part of the app runtime.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT_DIR = ROOT / "public/companion/red-panda"
PREVIEW_DIR = Path(sys.argv[sys.argv.index("--preview") + 1]) if "--preview" in sys.argv else None
# Three times the widest size the page draws it (8rem ≈ 128px), so it stays sharp on dense screens.
OUT_WIDTH = 384


def load(name: str) -> Image.Image:
    return Image.open(HERE / name).convert("RGBA")


def paw_mask(whole: Image.Image, body: Image.Image) -> Image.Image:
    """Where the paws sit in the whole panda, cut cleanly enough to move on their own.

    Colour cannot tell a paw from the shadowed fur beside it (both dark reddish brown, value ~70),
    and GPT redrew that fur slightly, so a plain difference catches orange wedges too. What does
    separate them: where a paw sits, the paw-less version has bright fur instead, while shadowed fur
    is dark in both. So a paw pixel is one clearly darker than in the paw-less version, plus the
    pale claw tips along the bottom edge and anything that sticks out past the body.
    """
    w, h = whole.size
    whole_hsv, body_hsv = whole.convert("HSV").load(), body.convert("HSV").load()
    alpha, body_alpha = whole.getchannel("A").load(), body.getchannel("A").load()
    mask = Image.new("L", (w, h), 0)
    mpx = mask.load()
    for y in range(int(h * 0.62), h):
        for x in range(w):
            if alpha[x, y] < 128:
                continue
            _, sat, val = whole_hsv[x, y]
            darker = body_hsv[x, y][2] - val > 45
            claw = y > h * 0.9 and sat < 70 and val > 120
            past_body = body_alpha[x, y] < 64
            if darker or claw or past_body:
                mpx[x, y] = 255
    # Close the gaps in the fur texture and claws into one solid shape per paw. A blur and a threshold
    # close round gaps smoothly; square max/min filters left a staircase edge.
    mask = mask.filter(ImageFilter.GaussianBlur(14)).point(lambda v: 255 if v > 90 else 0)
    mask = fill_holes(largest_blob_per_half(mask))
    # The paw's own shadow on the chest comes along, so a soft edge reads as shadow, not as a cut.
    return ImageChops.multiply(mask.filter(ImageFilter.GaussianBlur(4)), whole.getchannel("A"))


def largest_blob_per_half(mask: Image.Image) -> Image.Image:
    """Keeps the biggest connected shape in each half: one paw each, without stray specks."""
    w, h = mask.size
    px = mask.load()
    out = Image.new("L", (w, h), 0)
    opx = out.load()
    for x0, x1 in ((0, w // 2), (w // 2, w)):
        seen = set()
        best: list[tuple[int, int]] = []
        for y in range(h):
            for x in range(x0, x1):
                if px[x, y] < 128 or (x, y) in seen:
                    continue
                blob, stack = [], [(x, y)]
                seen.add((x, y))
                while stack:
                    cx, cy = stack.pop()
                    blob.append((cx, cy))
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if x0 <= nx < x1 and 0 <= ny < h and (nx, ny) not in seen and px[nx, ny] >= 128:
                            seen.add((nx, ny))
                            stack.append((nx, ny))
                if len(blob) > len(best):
                    best = blob
        for x, y in best:
            opx[x, y] = 255
    return out


def fill_holes(mask: Image.Image) -> Image.Image:
    """Anything not reachable from the border through empty pixels is inside a paw."""
    w, h = mask.size
    px = mask.load()
    outside = set()
    stack = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    while stack:
        x, y = stack.pop()
        if not (0 <= x < w and 0 <= y < h) or (x, y) in outside or px[x, y] >= 128:
            continue
        outside.add((x, y))
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    filled = Image.new("L", (w, h), 255)
    fpx = filled.load()
    for x, y in outside:
        fpx[x, y] = 0
    return filled


def split_paws(whole: Image.Image, mask: Image.Image) -> tuple[Image.Image, Image.Image]:
    w, h = whole.size
    layers = []
    for x0, x1 in ((0, w // 2), (w // 2, w)):
        half = Image.new("L", (w, h), 0)
        half.paste(mask.crop((x0, 0, x1, h)), (x0, 0))
        paw = whole.copy()
        paw.putalpha(half)
        layers.append(paw)
    return layers[0], layers[1]


def eyes(body: Image.Image) -> list[dict]:
    """The two plain white eye shapes: centre and radii, by the near-white pixels in the face band."""
    w, h = body.size
    px = body.load()
    found = []
    for x0, x1 in ((0, w // 2), (w // 2, w)):
        pts = [(x, y) for y in range(int(h * 0.3), int(h * 0.7)) for x in range(x0, x1)
               if px[x, y][3] > 250 and min(px[x, y][:3]) > 245]
        xs = sorted(p[0] for p in pts)
        ys = sorted(p[1] for p in pts)
        mx, my = xs[len(xs) // 2], ys[len(ys) // 2]
        core = [p for p in pts if abs(p[0] - mx) < 120 and abs(p[1] - my) < 120]
        left, right = min(p[0] for p in core), max(p[0] for p in core)
        top, bottom = min(p[1] for p in core), max(p[1] for p in core)
        found.append({"cx": (left + right) / 2, "cy": (top + bottom) / 2, "rx": (right - left) / 2, "ry": (bottom - top) / 2})
    return found


def main() -> None:
    whole = load("red-panda-open-eyes-v1.png")
    body = load("red-panda-body-no-paws-v2.png")
    if whole.size != body.size:
        raise SystemExit(f"The two sources differ in size: {whole.size} vs {body.size}")
    left_paw, right_paw = split_paws(whole, paw_mask(whole, body))

    box = ImageChops.lighter(whole.getchannel("A"), body.getchannel("A")).point(lambda v: 255 if v > 8 else 0).getbbox()
    scale = OUT_WIDTH / (box[2] - box[0])
    size = (OUT_WIDTH, round((box[3] - box[1]) * scale))

    def export(layer: Image.Image) -> Image.Image:
        return layer.crop(box).resize(size, Image.LANCZOS)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # "whole" is the original picture, shown once the panda has settled: the cut layers only carry the
    # moment it climbs, so the still frame people look at is the untouched drawing.
    outputs = {"whole": export(whole), "body": export(body), "paw-left": export(left_paw), "paw-right": export(right_paw)}
    for name, image in outputs.items():
        image.save(OUT_DIR / f"{name}.webp", "WEBP", quality=88, method=6)

    # Eye geometry as fractions of the exported canvas, so the page can scale it freely.
    measured = eyes(body)
    data = {
        "width": size[0],
        "height": size[1],
        "eyes": [{
            "cx": round((e["cx"] - box[0]) / (box[2] - box[0]), 4),
            "cy": round((e["cy"] - box[1]) / (box[3] - box[1]), 4),
            "rx": round(e["rx"] / (box[2] - box[0]), 4),
            "ry": round(e["ry"] / (box[3] - box[1]), 4),
        } for e in measured],
    }
    (OUT_DIR / "red-panda.json").write_text(json.dumps(data, indent=1) + "\n")
    print(json.dumps(data))
    for name in outputs:
        print(name, (OUT_DIR / f"{name}.webp").stat().st_size, "bytes")

    if PREVIEW_DIR:
        PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
        sheet = Image.new("RGBA", (size[0] * 4, size[1]), (250, 248, 240, 255))
        stacked = outputs["body"].copy()
        stacked.alpha_composite(outputs["paw-left"])
        stacked.alpha_composite(outputs["paw-right"])
        for i, image in enumerate((outputs["whole"], outputs["paw-left"], outputs["paw-right"], stacked)):
            sheet.alpha_composite(image, (i * size[0], 0))
        sheet.save(PREVIEW_DIR / "red-panda-layers.png")


if __name__ == "__main__":
    main()
