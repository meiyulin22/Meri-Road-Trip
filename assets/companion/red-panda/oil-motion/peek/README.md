# Peek → pointer look → return to neutral → withdraw

This adds the user-reviewed peek to the already accepted 1.0705 look grid. The
same native withdrawal clip runs backwards for entrance. Playback takes about
1 second, as requested after the slower pilot review. No new paid generation
was needed for integration. One original H3 768P task produced four billed
seconds (estimated CNY 2; platform billing is authoritative).

The unchanged oil-motion `createSegmentPlayer` controls one persistent invisible
all-keyframe video clock. Its time selects a frame of the alpha atlas. At the
neutral hold the page changes to the accepted Cartesian look surface; blur first
uses the original frame animators to return that surface to its neutral cell.
Rapid input retargets the same player from its current time. There is no pose
crossfade, nearest-pose lookup, new API or new dependency.

Only whole-frame Y translation corrects the small paw contact drift (maximum
12 cell pixels / 6 CSS pixels). All 103 native frames through the first truly
hidden endpoint are retained; four later empty holds are trimmed. The provider
slightly re-rendered the first pose. The slower pilot's neutral handoff was
visually approved. The integrated 1-second version was accepted by merlin on
2026-10-30 ("ok 非常好 传到main把").

`sources.zip` retains the four fact sources, alpha/video input keyframes, prompt,
original master, pilot approval and QA evidence. `manifest.json` records hashes
and sanitized task usage. No credentials, signed URLs, provider transport tools
or local binaries are included. The existing head-turn archive is unchanged.

Runtime files: `public/companion/red-panda/peek{.webp,.json,-clock.mp4,-timeline.json}`.
The atlas is 2640×2400, 103 cells at 240×240 (~24.17 MiB decoded); together with
the look atlas this is ~87.7 MiB. Render at 120px desktop / 96px phone. Coarse
pointers and reduced motion use the original neutral image with focus opacity
only, without requesting either animated atlas or the clock. A resource/decode
failure also returns to that static fallback; travel input remains usable.

To rebuild locally without paid calls, unpack `sources.zip` into a disposable
source directory. Install the oil-motion Python requirements and FFmpeg/ffprobe
on PATH, set `OIL_MOTION_ROOT` to the installed skill, then run:

```powershell
python build_peek.py --source-root C:/temp/peek-source --output-root C:/temp/peek-build
```

Use an empty output directory. Generated `final/` contains all four peek runtime
files; `build/timeline.json` derives holds from actual encoded frames and the
requested duration from the archived concept contract. Compare alpha frames,
contact sheet, clock seekability and the actual handoff at final CSS size before
replacing production media. Re-encoding with another FFmpeg version may change
file bytes; the frame mapping and visual checks remain required.

Automated tests run the actual original controllers with a browser boundary fake
for interrupted entrance, return-to-neutral, rapid refocus, lifecycle pause,
preference changes, resource failures and cold focused loading. Browser QA also
checks the integrated homepage at desktop and 375px. Real low-end hardware and OS
preference toggles have not been measured. See `manifest.json` for completed checks.

Source: [oil-motion](https://github.com/oil-oil/oil-motion), MIT, Lin Zhihuang.
