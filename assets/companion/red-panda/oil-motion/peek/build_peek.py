"""Offline rebuild of the approved native peek, using oil-motion; no API calls."""
import argparse
from fractions import Fraction
import json
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

from PIL import Image
import yaml


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    args = parser.parse_args()
    source, output = args.source_root.resolve(), args.output_root.resolve()
    if source == output:
        raise ValueError("Keep archived sources separate from generated output")
    skill = Path(os.environ["OIL_MOTION_ROOT"])
    sys.path.insert(0, str(skill / "scripts"))
    import motion_pipeline as oil

    contract = yaml.safe_load((source / "source/concept-contract.yaml").read_text(encoding="utf-8"))
    brief = yaml.safe_load((source / "source/motion-brief.yaml").read_text(encoding="utf-8"))
    raw, cells, final = output / "frames/raw", output / "frames/aligned", output / "final"
    cells.mkdir(parents=True, exist_ok=True)
    final.mkdir(parents=True, exist_ok=True)
    # Native frames only. The final empty state is intentional, not a failed extraction.
    extraction = oil.extract_frames(SimpleNamespace(input=source / "pilot/withdraw.mp4", output=raw,
        fps=float(brief["target_fps"]), start=None, duration=None, width=384, height=None,
        interpolate=False, key="auto", transparent_threshold=12., opaque_threshold=220., force=False))
    write(output / "qa/extraction.json", extraction)
    files = oil.frame_files(raw)
    visible = []
    for path in files:
        histogram = Image.open(path).getchannel("A").histogram()
        visible.append(sum(histogram[129:]) > 16)
    indices = [i for i, value in enumerate(visible) if value]
    if not indices or indices[-1] == len(files) - 1:
        raise ValueError("Master must include a visible character and a fully hidden endpoint")
    count = indices[-1] + 2
    first = Image.open(files[0]).resize((240, 240), Image.Resampling.LANCZOS)
    anchor = first.getchannel("A").point(lambda value: 255 if value > 128 else 0).getbbox()[3]
    records, last_dy = [], 0
    for index, path in enumerate(files[:count]):
        image = Image.open(path).convert("RGBA").resize((240, 240), Image.Resampling.LANCZOS)
        bounds = image.getchannel("A").point(lambda value: 255 if value > 128 else 0).getbbox()
        dy = anchor - bounds[3] if bounds else last_dy
        if abs(dy) > 16:
            raise ValueError(f"Contact correction exceeds minor whole-frame budget: {index}, {dy}")
        canvas = Image.new("RGBA", image.size)
        canvas.alpha_composite(image, (0, dy))
        canvas.save(cells / f"frame_{index + 1:05d}.png")
        records.append({"frame": index, "dy": dy})
        last_dy = dy
    atlas = oil.create_atlas(cells, final / "peek.webp", final / "peek.json", 11, 240, 240, 90, False, 4096)
    atlas.pop("files")
    write(final / "peek.json", atlas)
    clock = final / "peek-clock.mp4"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-n", "-i", str(source / "pilot/withdraw.mp4"),
        "-frames:v", str(count), "-vf", f"fps={brief['target_fps']},scale=240:240:flags=lanczos", "-an",
        "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-g", "1", "-keyint_min", "1",
        "-sc_threshold", "0", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(clock)], check=True)
    stream = next(s for s in oil.probe_video(clock)["streams"] if s["codec_type"] == "video")
    fps = float(Fraction(stream["avg_frame_rate"]))
    if int(stream["nb_frames"]) != count:
        raise ValueError("Atlas and video clock frame counts differ")
    hold = (count - 1) / fps
    timeline = {"schemaVersion": 1, "fps": fps, "frameDuration": 1 / fps, "frameCount": count,
        "initialState": "hidden", "states": [{"id": "neutral", "hold": 0}, {"id": "hidden", "hold": hold}],
        "segments": [{"id": "withdraw", "from": "neutral", "to": "hidden", "start": 0, "hold": hold,
            "endExclusive": count / fps, "curve": {"type": "constant", "rate": hold / contract["entrance_duration_seconds"]}}],
        "provenance": {"source": "pilot/withdraw.mp4", "keptZeroBasedSourceIndices": list(range(count)),
            "trimmedInvisibleTailIndices": list(range(count, len(files))), "intentionalHiddenFrame": count - 1,
            "runtime": "original oil-motion segment player; all-keyframe video clock and CSS alpha atlas"}}
    write(output / "build/timeline.json", timeline)
    write(final / "peek-timeline.json", timeline)
    write(output / "qa/contact-alignment.json", {"anchorBottom": anchor, "frames": records})
    oil.create_contact_sheet(cells, output / "qa/contact.jpg", 10, 120)
    print(json.dumps({"frames": count, "fps": fps, "seconds": contract["entrance_duration_seconds"]}))


if __name__ == "__main__":
    main()
