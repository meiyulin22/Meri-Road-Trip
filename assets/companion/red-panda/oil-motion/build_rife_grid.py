"""RIFE offline interpolation, oil-motion extraction/keying/QA/atlas/runtime.

The skill's FFmpeg block-motion interpolation failed manual facial-contour QA.
Keep that evidence and use the official RIFE CLI for the missing grid columns;
there is no interpolation or crossfade in the web page.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
import hashlib,json,os,shutil,subprocess
import build_pose_grid as common
ROOT=common.ROOT
oil=common.oil
COLUMNS=[0,3,5,8,11,13,16]
RIFE=Path(os.environ.get('RIFE_ROOT',ROOT/'tools/rife/rife-ncnn-vulkan-20221029-windows'))

def cell(position):
    row,col=position
    target=ROOT/'production/grid-rife-frames'/f'frame_{row*17+col+1:05d}.png'
    target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists(): return
    native=ROOT/'production/grid-native'
    if col in COLUMNS:
        rgb=native/f'C{col:02d}'/f'R{row:02d}.png'
    else:
        left=max(c for c in COLUMNS if c<col);right=min(c for c in COLUMNS if c>col)
        rgb=ROOT/'production/rife-rgb'/f'R{row:02d}-C{col:02d}.png'
        rgb.parent.mkdir(parents=True,exist_ok=True)
        if not rgb.exists():
            result=subprocess.run([str(RIFE/'rife-ncnn-vulkan.exe'),'-0',str(native/f'C{left:02d}'/f'R{row:02d}.png'),
                '-1',str(native/f'C{right:02d}'/f'R{row:02d}.png'),'-o',str(rgb),'-s',str((col-left)/(right-left)),
                '-m',str(RIFE/'rife-v4.6'),'-g','0','-j','1:1:1'],capture_output=True,text=True)
            if result.returncode: raise RuntimeError(result.stderr[-1500:])
    oil.remove_key(rgb,target,(0,255,0),12.,220.)

def main():
    common.native()
    with ThreadPoolExecutor(max_workers=2) as pool:
        for i,_ in enumerate(pool.map(cell,[(r,c) for r in range(17) for c in range(17)])):
            if i%17==16: print(f'row {i//17}: ready',flush=True)
    frames=ROOT/'production/grid-rife-frames'
    final=ROOT/'final-rife';final.mkdir(exist_ok=True)
    manifest=oil.create_atlas(frames,final/'look.webp',final/'look.json',17,240,240,90,False,4096)
    manifest.update({'schemaVersion':1,'parameterSpace':'2d','yaw':{'min':-25,'max':25},
        'pitch':{'min':-18,'max':18},'faceAnchor':{'x':.5,'y':.515},'neutral':{'column':8,'row':8},
        'nativeColumns':COLUMNS,'offlineInterpolation':'RIFE v4.6',
        'note':'Projection limits are input controls, not physically measured head angles.'})
    common.write(final/'look.json',manifest)
    Image.open(frames/'frame_00145.png').save(final/'front.webp',quality=92,method=6)
    oil.create_contact_sheet(frames,ROOT/'qa/grid-rife-contact.jpg',17,96)
    common.write(ROOT/'qa/grid-rife-analysis.json',oil.analyze_directory(frames,16,.0003,.12,.08,.08))
    sources=json.loads((ROOT/'build/native-grid.json').read_text(encoding='utf-8'))
    common.write(ROOT/'build/timeline.json',{'schemaVersion':1,'parameterSpace':'2d','frameCount':289,
        'grid':{'columns':17,'rows':17},'initialState':'neutral','states':[{'id':'neutral','frame':144}],
        'segments':[],'nativeSources':[dict(c,frameTimes=[i/c['fps'] for i in c['sourceFrameIndices']]) for c in sources['nativeColumns']],
        'interpolation':{'tool':'rife-ncnn-vulkan','release':'20221029','model':'rife-v4.6','axis':'yaw','nativeColumns':COLUMNS,
            'fraction':'(column-leftNativeColumn)/(rightNativeColumn-leftNativeColumn)',
            'executableSha256':hashlib.sha256((RIFE/'rife-ncnn-vulkan.exe').read_bytes()).hexdigest(),
            'modelSha256':hashlib.sha256((RIFE/'rife-v4.6/flownet.bin').read_bytes()).hexdigest()}})
    print(f'Atlas: {(final/"look.webp").stat().st_size} bytes',flush=True)

if __name__=='__main__': main()
