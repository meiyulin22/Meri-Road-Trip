"""Compile reviewed native sweeps with the installed oil-motion media tools.

No generation calls. Preserve native frame provenance and each interpolation QA.
"""
from pathlib import Path
from types import SimpleNamespace
import argparse, json, subprocess, sys, os
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/python'))
try:
    from static_ffmpeg import add_paths
    add_paths()
except ImportError:
    pass  # Use ffmpeg/ffprobe already installed on PATH.
sys.path.insert(0, str(Path(os.environ.get('OIL_MOTION_ROOT', Path.home() / '.codex/skills/oil-motion')) / 'scripts'))
import motion_pipeline as oil
import loop_cleanup
import optimize_motion

def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding='utf-8')

def paw_anchor(image):
    alpha = np.asarray(image.convert('RGBA'))[:, :, 3]
    h, w = alpha.shape
    anchors = []
    for lo, hi in ((.14, .45), (.55, .86)):
        region = alpha[int(h*.72):, int(w*lo):int(w*hi)] > 128
        ys, xs = np.where(region)
        bottom = ys.max()
        anchors.append((float(np.median(xs[ys >= bottom-4]))+int(w*lo), bottom+int(h*.72)))
    return np.mean(anchors, axis=0)

def native():
    poses = json.loads((ROOT/'production/vertical-plan.json').read_text(encoding="utf-8"))['poses']
    target = paw_anchor(Image.open(ROOT/'source/K0-front-alpha.png').resize((240,240), Image.Resampling.LANCZOS))
    records = []
    for pose in poses:
        name = f"vertical-{pose['column']:02d}"
        source = ROOT/'production/frames'/name
        clean = ROOT/'production/clean'/name
        report_path = ROOT/'qa'/f'{name}-cleanup.json'
        if not report_path.exists():
            loop_cleanup.clean(SimpleNamespace(source=source, output=clean, report=report_path,
                end_reference=ROOT/'source'/f"{pose['down']}-alpha.png", seam_window=24,
                duplicate_threshold=.0003, force=False))
        report = json.loads(report_path.read_text(encoding="utf-8"))
        # Reviewed contacts show brief involuntary blinks. Do not bake closed eyes
        # into a head direction (would make a pointer position hold a blink forever).
        excluded = {'vertical-03':range(59,65),'vertical-13':range(10,17)}.get(name, [])
        kept = [i for i in report['keptSourceIndices'] if i not in excluded]
        # Uniform ordered samples of the cleaned motion. Never search unrelated poses.
        indices = [kept[round(i*(len(kept)-1)/16)] for i in range(17)]
        output = ROOT/'production/grid-native'/f"C{pose['column']:02d}"
        raw = output/'rgb'
        raw.mkdir(parents=True, exist_ok=True)
        expression = '+'.join(f'eq(n\\,{n})' for n in indices)
        selection = raw/'selection.json'
        if not selection.exists() or json.loads(selection.read_text(encoding="utf-8")) != indices:
            subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(ROOT/'production'/f'{name}.mp4'),
                '-vf',f'select={expression},scale=240:-1:flags=lanczos','-fps_mode','vfr',str(raw/'frame_%05d.png')], check=True)
            write(selection, indices)
        alignment = []
        for row, index in enumerate(indices):
            alpha = Image.open(source/f'frame_{index+1:05d}.png').resize((240,240), Image.Resampling.LANCZOS)
            delta = np.rint(target-paw_anchor(alpha)).astype(int).tolist()
            rgb = Image.open(raw/f'frame_{row+1:05d}.png').convert('RGB')
            canvas = Image.new('RGB',(240,240),(0,255,0))
            canvas.paste(rgb,tuple(delta))
            canvas.save(output/f'R{row:02d}.png')
            alignment.append(delta)
        records.append({'column':pose['column'],'clip':f'{name}.mp4','fps':24,
            'sourceFrameIndices':indices,'translations':alignment,'cleanup':report_path.name,
            'reviewedBlinkExclusions':list(excluded)})
    write(ROOT/'build/native-grid.json',{'rows':17,'columns':17,'nativeColumns':records})

def interpolate_row(row):
    columns = [0,3,5,8,11,13,16]
    folder = ROOT/'production/interpolation'/f'R{row:02d}'
    inputs = folder/'inputs'
    inputs.mkdir(parents=True,exist_ok=True)
    paths = [ROOT/'production/grid-native'/f'C{col:02d}'/f'R{row:02d}.png' for col in columns]
    padded = [paths[0], *paths, paths[-1], paths[-1]]
    for index,path in enumerate(padded):
        Image.open(path).save(inputs/f'frame_{index:02d}.png')
    video = folder/'source.mkv'
    if not video.exists():
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-framerate','1','-i',str(inputs/'frame_%02d.png'),
            '-c:v','ffv1','-pix_fmt','bgr0',str(video)],check=True)
    output = folder/'interpolated'
    if not (output/'interpolation-report.json').exists():
        optimize_motion.command_interpolate(SimpleNamespace(input=video, output=output, fps=6.,
            start=None,duration=None,width=None,height=None,key='auto',transparent_threshold=12.,
            opaque_threshold=220.,force=False,contact_columns=12,thumb_width=96,warning_rate_tolerance=.02))
    report = json.loads((output/'interpolation-report.json').read_text(encoding="utf-8"))
    if not report['verdict']['passedAutomaticChecks']:
        raise RuntimeError(f'Interpolation failed automatic QA for row {row}')
    frames = ROOT/'production/grid-frames'
    frames.mkdir(parents=True,exist_ok=True)
    mapping = []
    for col in range(17):
        target = frames/f'frame_{row*17+col+1:05d}.png'
        if col in columns:
            path = paths[columns.index(col)]
            oil.remove_key(path,target,(0,255,0),12.,220.)
            mapping.append({'column':col,'nativeColumn':col})
        else:
            left = max(i for i,c in enumerate(columns) if c < col)
            time = 1+left+(col-columns[left])/(columns[left+1]-columns[left])
            index = round(time*6)
            path = output/'frames'/f'frame_{index+1:05d}.png'
            Image.open(path).save(target)
            mapping.append({'column':col,'interpolatedFrame':index})
    write(ROOT/'build'/f'grid-row-{row:02d}.json',{'row':row,'cells':mapping})

def atlas():
    frames = ROOT/'production/grid-frames'
    assert len(list(frames.glob('*.png'))) == 289
    final = ROOT/'final'
    final.mkdir(exist_ok=True)
    manifest = oil.create_atlas(frames, final/'look.webp', final/'look.json',17,240,240,90,False,4096)
    manifest.update({'schemaVersion':1,'parameterSpace':'2d','yaw':{'min':-25,'max':25},
        'pitch':{'min':-18,'max':18},'faceAnchor':{'x':.5,'y':.515},
        'neutral':{'column':8,'row':8},'nativeColumns':[0,3,5,8,11,13,16]})
    write(final/'look.json',manifest)
    Image.open(frames/'frame_00145.png').save(final/'front.webp',quality=92,method=6)
    oil.create_contact_sheet(frames,ROOT/'qa/grid-contact.jpg',17,96)
    report = oil.analyze_directory(frames,16,.0003,.12,.08,.08)
    write(ROOT/'qa/grid-analysis.json',report)
    sources = json.loads((ROOT/'build/native-grid.json').read_text(encoding="utf-8"))
    # This 2D scrub timeline records actual decoded native frame times; no autoplay duration.
    write(ROOT/'build/timeline.json',{'schemaVersion':1,'parameterSpace':'2d',
        'frameCount':289,'grid':{'rows':17,'columns':17},'initialState':'neutral',
        'states':[{'id':'neutral','frame':144}], 'segments':[],
        'nativeSources':[dict(c,frameTimes=[i/c['fps'] for i in c['sourceFrameIndices']]) for c in sources['nativeColumns']],
        'rowCompilation':[json.loads((ROOT/'build'/f'grid-row-{r:02d}.json').read_text(encoding="utf-8")) for r in range(17)]})
    print(json.dumps({'bytes':(final/'look.webp').stat().st_size,'summary':report['summary']}))

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('stage',choices=['native','row','atlas'])
    parser.add_argument('--row',type=int)
    args=parser.parse_args()
    if args.stage=='native': native()
    elif args.stage=='row': interpolate_row(args.row)
    else: atlas()
