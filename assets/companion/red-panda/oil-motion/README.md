# Home red panda: oil-motion source handoff

The home input reveals this decorative character on focus and hides it on blur.
Head yaw and pitch use a 17 × 17 Cartesian atlas, controlled by the original
oil-motion `createFrameAnimator` and CSS sprite renderer. There is no nearest-pose
search or image crossfade at runtime. The separately approved climbing entrance is integrated in 1.0706; see [peek/README.md](peek/README.md).

## Provenance and production

- Character images: ChatGPT image generation, true-alpha originals retained.
- Video: MiniMax official China API, MiniMax-H3, 768P, 24 fps. One approved 5 s
  pilot preceded ten 4 s production clips. Estimated production cost: CNY 20;
  pilot: CNY 2.50. The platform bill remains authoritative.
- Seven vertical sweeps supply 119 native cells. Brief blinks in vertical-03
  (59–64) and vertical-13 (10–16), using zero-based decoded frame indices, are
  excluded before ordered sampling. Each source frame is recorded in the timeline.
- Three horizontal sweeps remain in the source archive as production references.
- Original oil-motion FFmpeg interpolation was tried and rejected after visual
  review found double facial contours, despite automatic checks passing. The
  horizontal-only alternative was also rejected. Their contact sheets are retained.
- Missing yaw cells use **offline RIFE v4.6 interpolation**, 170 cells. This is an
  explicit media-processing refinement, not a claim that the stock oil-motion
  interpolation command produced the final frames. Extraction, keying, cleanup,
  analysis, atlas packing and the web controller remain from oil-motion.
- The final contact sheet has been visually reviewed. This is a generated pose
  surface, not a measured 3D rig; yaw/pitch limits are pointer projection controls.

Sources: [oil-motion](https://github.com/oil-oil/oil-motion),
[official RIFE CLI](https://github.com/nihui/rife-ncnn-vulkan).
The copied oil-motion controller retains its full MIT notice in the TS source.

## Files

`sources.zip` contains `source/`, `pilot/`, `production/`, `build/`, `qa/` and an
internal `source-manifest.json`. It includes the 17 aligned alpha keyframes, all
11 video masters, prompts, contract, motion brief, identity bible, pilot approval,
decoded-frame provenance, budget, final review and contact sheets. `manifest.json`
lists each archived file with SHA-256 and sanitized official task usage.

No credentials, signed download URLs, FFmpeg/RIFE binaries, Python environment or
thousands of intermediate frames are committed. Existing original blank-eye and
no-paws character PNGs are preserved in the parent directory.

Runtime assets are `public/companion/red-panda/{look.webp,look.json,front.webp}`.
The atlas is 4080 × 4080 (289 cells, 240 × 240), about 6.8 MiB on disk and
63.5 MiB decoded. Maximum rendered size is 120 CSS pixels at DPR 2. Coarse
pointers and reduced-motion preferences show the static neutral frame.

## Rebuild without any paid calls

Use a disposable output folder. Unzip `sources.zip` there and copy the three
adjacent Python scripts into a `tools/` subdirectory. Install Python 3.10+, Pillow,
NumPy and FFmpeg/ffprobe on PATH. Set `OIL_MOTION_ROOT` to an installed oil-motion
skill directory. Set `RIFE_ROOT` to the extracted official 20221029 Windows
release containing `rife-ncnn-vulkan.exe` and `rife-v4.6/`. The model and executable
hashes used for this build are recorded in `build/timeline.json`.

Run from the unzipped output root:

```powershell
foreach ($column in '00','03','05','08','11','13','16') {
  python tools/prepare_row.py "vertical-$column"
  if ($LASTEXITCODE -ne 0) { throw "Extraction failed" }
}
python tools/build_rife_grid.py
```

Review `qa/grid-rife-contact.jpg`, the alpha edges on light/dark backgrounds, and
both horizontal and vertical neighbor sequences before replacing runtime assets.
The source archive already includes cleanup decisions, so the build reuses those
frame indices. Output goes to `final-rife/`. `build_pose_grid.py` is the shared
source-sampling/keying helper; its standalone FFmpeg row-interpolation route is
retained for provenance and is **not** the selected final build command.

For a newly generated variant, repeat oil-motion's contract/budget/pilot gates.
Do not run generation again merely to rebuild these local assets.

## Verification limits

Project lint, typecheck, tests and build plus browser observations are recorded in
`qa/final-review.json` and `manifest.json`. The complete head-turn version was accepted by merlin on 2026-10-30
("效果非常好 通过"). This acceptance is separate from the earlier pilot gate.
No real mobile hardware or throttled low-end device performance measurement was performed.
