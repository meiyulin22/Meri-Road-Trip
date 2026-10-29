#!/usr/bin/env python3
"""Builds the red panda's head-turn sprite from five green-screen videos.

The videos (即梦 Seedance 2.5, first and last frame locked to red-panda-body-green-ref.png,
960×960, 24 fps, all with the same canvas) are:
  turn-circle — the head looks left, then round a full circle (up-left, up, up-right, right,
                down-right, down, down-left, left) and back to the front, so every direction
                and the diagonals between them are drawn, frame after frame;
  turn-left, turn-right, turn-up, turn-down — one way and back, for the turns part way out
                (and the strongest look down: the circle only lowers the head a little).
The approach follows oil-motion (github.com/oil-oil/oil-motion, MIT): generate the motion as
video, keep it as frames, and pick the frame from the pointer.

Every frame is placed by where the face looks: how far the eyes and nose (the darkest pixels)
have moved from the front frame — the body and camera stay still, so that move is the look.
Blinks are left out. From all the frames, ones spread evenly over that map are kept (the
farthest from those already kept, first), so the page can show the frame nearest any look.

Each frame is keyed (green → transparent, green spill pulled out of the fur edge), which
also removes the platform's "AI生成" corner mark — the page states instead that the panda
is AI-generated (see /photo-credits). Frames are cropped to the same canvas as the paw
layers (build_red_panda_layers.py), so the paws sit on them with no offset: the videos
start within 1–2 px of the paw-less source.

Writes public/companion/red-panda/turns.webp (one sprite, a grid of frames), front.webp (the
front frame alone, shown at once while the sprite loads) and turns.json (each frame's look).
Run:  python3 assets/companion/red-panda/build_red_panda_turns.py <dir with turn-*.mp4> [--preview DIR]
Needs Pillow with WebP, numpy and macOS (frames come from extract_frames.swift).
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT_DIR = ROOT / "public/companion/red-panda"
# The circle first: where it and a one-way clip show the same look, its frame is kept.
VIDEOS = ("circle", "left", "right", "up", "down")
# How many frames to keep, and the closest two kept looks may be (on the -1…1 map): enough
# that a sweep of the pointer steps through small changes while the sprite stays near 400 KB.
MAX_FRAMES = 42
MIN_SPACING = 0.1
COLUMNS = 7
# The same canvas as the paw layers (the panda's bounding box in the 1254px sources), drawn
# 240 wide: about 2.6× the widest the page shows it.
SOURCE_SIZE = 1254
OUT_WIDTH = 240


def frames_of(video: Path, workdir: Path) -> list[Path]:
    out = workdir / video.stem
    out.mkdir(parents=True, exist_ok=True)
    subprocess.run(["swift", str(HERE / "extract_frames.swift"), str(video), str(out)], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return sorted(out.glob("frame-*.png"))


def features(path: Path) -> tuple[float, float, int]:
    """Where the eyes and nose are (their mean position, at 480px) and how many pixels they cover."""
    rgb = np.asarray(Image.open(path).convert("RGB").resize((480, 480)), dtype=np.float32)
    dark = (rgb[..., 0] < 50) & (rgb[..., 1] < 45) & (rgb[..., 2] < 45)
    dark[:60] = False
    dark[400:] = False
    ys, xs = np.nonzero(dark)
    return (float(xs.mean()), float(ys.mean()), len(xs)) if len(xs) else (float("nan"), float("nan"), 0)


def blinks(counts: list[int]) -> set[int]:
    """Frames in or next to a blink: the dark pupils mostly vanish for a few frames."""
    found: set[int] = set()
    for index, count in enumerate(counts):
        around = counts[max(0, index - 8):index + 9]
        if count < 0.75 * float(np.median(around)):
            found.update(range(index - 3, index + 4))
    return found


def keyed(path: Path) -> Image.Image:
    """Green screen to alpha, with the green that bled into the fur edge pulled back out."""
    rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    greenness = g - np.maximum(r, b)
    alpha = np.clip(1 - (greenness - 25) / 70, 0, 1)
    rgb[..., 1] = np.minimum(g, np.maximum(r, b) + 12)
    out = np.dstack([rgb, alpha * 255]).round().clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def canvas_box() -> tuple[int, int, int, int]:
    whole = Image.open(HERE / "red-panda-open-eyes-v1.png").getchannel("A")
    body = Image.open(HERE / "red-panda-body-no-paws-v2.png").getchannel("A")
    union = Image.fromarray(np.maximum(np.asarray(whole), np.asarray(body)))
    return union.point(lambda v: 255 if v > 8 else 0).getbbox()


def spread(looks: np.ndarray, front: int) -> list[int]:
    """Indices of looks spread evenly: start at the front, then keep adding the look farthest
    from all those kept, until MAX_FRAMES or until the farthest is closer than MIN_SPACING."""
    kept = [front]
    nearest = np.linalg.norm(looks - looks[front], axis=1)
    while len(kept) < MAX_FRAMES:
        pick = int(np.argmax(nearest))
        if nearest[pick] < MIN_SPACING:
            break
        kept.append(pick)
        nearest = np.minimum(nearest, np.linalg.norm(looks - looks[pick], axis=1))
    return kept


def main() -> None:
    videos = Path(sys.argv[1]).expanduser()
    preview = Path(sys.argv[sys.argv.index("--preview") + 1]) if "--preview" in sys.argv else None
    box = canvas_box()
    out_height = round((box[3] - box[1]) * OUT_WIDTH / (box[2] - box[0]))

    def fit(frame: Image.Image) -> Image.Image:
        scale = frame.width / SOURCE_SIZE
        crop = frame.crop(tuple(round(v * scale) for v in box))
        return crop.resize((OUT_WIDTH, out_height), Image.LANCZOS)

    with tempfile.TemporaryDirectory() as work:
        paths: list[Path] = []
        moves: list[tuple[float, float]] = []
        for name in VIDEOS:
            frames = frames_of(videos / f"turn-{name}.mp4", Path(work))
            measured = [features(path) for path in frames]
            x0, y0, _ = measured[0]
            skip = blinks([count for _, _, count in measured])
            for index, (path, (x, y, _)) in enumerate(zip(frames, measured)):
                if index in skip or np.isnan(x):
                    continue
                paths.append(path)
                moves.append((x - x0, y - y0))
        move = np.array(moves)
        # Each side scaled by the farthest any frame turns that way, so a full look is ±1.
        reach = {"left": -move[:, 0].min(), "right": move[:, 0].max(), "up": -move[:, 1].min(), "down": move[:, 1].max()}
        looks = np.stack([np.where(move[:, 0] < 0, move[:, 0] / reach["left"], move[:, 0] / reach["right"]),
                          np.where(move[:, 1] < 0, move[:, 1] / reach["up"], move[:, 1] / reach["down"])], axis=1)
        # The front is the first frame of turn-left, as before: the paws were fitted to it.
        front = len([p for p in paths if p.parent.name == "turn-circle"])
        kept = spread(looks, front)
        tiles = [fit(keyed(paths[index])) for index in kept]

    rows = -(-len(tiles) // COLUMNS)
    sheet = Image.new("RGBA", (OUT_WIDTH * COLUMNS, out_height * rows), (0, 0, 0, 0))
    for index, tile in enumerate(tiles):
        sheet.alpha_composite(tile, ((index % COLUMNS) * OUT_WIDTH, (index // COLUMNS) * out_height))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT_DIR / "turns.webp", "WEBP", quality=78, method=6, alpha_quality=85)
    tiles[0].save(OUT_DIR / "front.webp", "WEBP", quality=82, method=6, alpha_quality=90)
    data = {"width": OUT_WIDTH, "height": out_height, "columns": COLUMNS, "count": len(tiles), "front": 0,
            "looks": [[round(float(v), 3) for v in looks[index]] for index in kept]}
    (OUT_DIR / "turns.json").write_text(json.dumps(data) + "\n")
    print(json.dumps({"reach": {k: round(float(v), 1) for k, v in reach.items()},
                      "from": [f"{paths[i].parent.name}:{paths[i].stem}" for i in kept]}))
    for name in ("turns.webp", "front.webp"):
        print(name, (OUT_DIR / name).stat().st_size, "bytes")
    if preview:
        preview.mkdir(parents=True, exist_ok=True)
        bg = Image.new("RGBA", sheet.size, (250, 248, 240, 255))
        bg.alpha_composite(sheet)
        bg.convert("RGB").save(preview / "turns-preview.png")
        # Where each kept look sits on the map, for checking the spread by eye.
        from PIL import ImageDraw
        plot = Image.new("RGB", (420, 420), "white")
        draw = ImageDraw.Draw(plot)
        draw.line((210, 0, 210, 420), fill=(210, 210, 210))
        draw.line((0, 210, 420, 210), fill=(210, 210, 210))
        for tile, index in enumerate(kept):
            x, y = 210 + looks[index][0] * 190, 210 + looks[index][1] * 190
            color = (220, 60, 0) if paths[index].parent.name == "turn-circle" else (0, 90, 220)
            draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill=color)
            draw.text((x + 5, y - 5), str(tile), fill="black")
        plot.save(preview / "looks.png")


if __name__ == "__main__":
    main()
