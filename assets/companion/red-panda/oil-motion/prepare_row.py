from pathlib import Path
import argparse,json,sys,os
from types import SimpleNamespace
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'tools/python'))
try:
    from static_ffmpeg import add_paths
    add_paths()
except ImportError:
    pass  # Use ffmpeg/ffprobe already installed on PATH.
sys.path.insert(0,str(Path(os.environ.get('OIL_MOTION_ROOT', Path.home()/'.codex/skills/oil-motion'))/'scripts'))
import motion_pipeline as oil
name=sys.argv[1]
assert name in {'upper-row','middle-row','lower-row'} or name.startswith('vertical-')
folder=root/'production/frames'/name
metadata=oil.extract_frames(SimpleNamespace(input=root/'production'/f'{name}.mp4',output=folder,fps=24.0,start=None,duration=None,width=384,height=None,interpolate=False,key='auto',transparent_threshold=12.0,opaque_threshold=220.0,force=False))
report=oil.analyze_directory(folder,16,0.0003,0.12,0.08,0.08)
oil.write_json(root/'qa'/f'{name}-extraction.json',metadata)
oil.write_json(root/'qa'/f'{name}-analysis.json',report)
oil.create_contact_sheet(folder,root/'qa'/f'{name}-full-contact.jpg',10,96)
(root/'qa'/f'{name}.ready').write_text('ready')
print(json.dumps({'name':name,'frames':metadata['frameCount'],'summary':report['summary']}),flush=True)
