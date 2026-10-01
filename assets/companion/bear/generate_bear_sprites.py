#!/usr/bin/env python3
"""Generates Meri's camp-table bear sprite sheet from the one illustration we have.

Every frame is assembled from layers of a single 64px base made from
public/companion/home-v2-companion.png, so all frames match. Writes
public/companion/bear/bear-sprites.png and bear-sprites.json (frame size, one row
per animation, per-frame durations). Design: docs/product/companion-bear.md.

Run from anywhere:  python3 assets/companion/bear/generate_bear_sprites.py [--preview DIR]
Needs Pillow (already present on the development Mac). Not part of the app runtime.
"""
import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

ROOT=Path(__file__).resolve().parents[3]
OUT_DIR=ROOT/'public/companion/bear'
PREVIEW_DIR=Path(sys.argv[sys.argv.index('--preview')+1]) if '--preview' in sys.argv else None

SRC=ROOT/'public/companion/home-v2-companion.png'
OUTLINE=(38,26,20,255)
def make_base(W=64):
    im=Image.open(SRC).convert('RGB').crop((360,70,1220,970))
    H=round(W*im.height/im.width)
    small=im.resize((W,H),Image.BOX)
    px=small.load()
    bright=lambda p: sum(p)
    core=[[bright(px[x,y])>150 for x in range(W)] for y in range(H)]
    # Fill enclosed dark holes (eyes, nose, inner outlines): anything dark not reachable from the border.
    seen=[[False]*W for _ in range(H)]
    q=deque((x,y) for x in range(W) for y in (0,H-1))
    q.extend((x,y) for y in range(H) for x in (0,W-1))
    while q:
        x,y=q.popleft()
        if not(0<=x<W and 0<=y<H) or seen[y][x] or core[y][x]: continue
        seen[y][x]=True
        q.extend(((x+1,y),(x-1,y),(x,y+1),(x,y-1)))
    opaque=[[core[y][x] or not seen[y][x] for x in range(W)] for y in range(H)]
    q8=small.quantize(colors=22,method=Image.Quantize.MEDIANCUT).convert('RGB').load()
    out=Image.new('RGBA',(W,H),(0,0,0,0)); o=out.load()
    for y in range(H):
        for x in range(W):
            if opaque[y][x]:
                r,g,b=q8[x,y]
                o[x,y]=OUTLINE if r+g+b<120 else (r,g,b,255)
    # A crisp 1px outline around the silhouette, the way pixel sprites are drawn.
    for y in range(H):
        for x in range(W):
            if o[x,y][3]==0 and any(0<=x+dx<W and 0<=y+dy<H and opaque[y+dy][x+dx] for dx,dy in ((1,0),(-1,0),(0,1),(0,-1))):
                o[x,y]=OUTLINE
    return out

import json

OUT=(38,26,20,255); FUR=(223,146,82,255); FUR_MID=(192,108,51,255); FUR_DARK=(128,73,41,255)
JACKET=(131,143,105,255); JACKET_DARK=(78,101,85,255); CREAM=(250,228,197,255)
WOOD_TOP=(206,164,112,255); WOOD=(158,116,72,255); WOOD_DARK=(118,80,48,255)
RICE=(250,248,238,255); RICE_SHADE=(222,218,200,255); NORI=(44,56,48,255)
PLATE=(236,232,218,255); PLATE_RIM=(176,170,150,255)
SWEAT=(143,192,214,255); SPARK=(233,203,122,255); PAPER=(250,247,240,255)
CLEAR=(0,0,0,0)

base=make_base(); BW,BH=base.size; BP=base.load()
CW,CH=74,70            # scene canvas (frames add HEADROOM on top)
BX=6                   # bear x offset in the scene
TABLE_Y=49             # outline row of the table top
SEATED=6               # how far the bear sinks when sitting

def layer(pred):
    im=Image.new('RGBA',(BW,BH),CLEAR); o=im.load()
    for y in range(BH):
        for x in range(BW):
            if BP[x,y][3] and pred(x,y): o[x,y]=BP[x,y]
    return im

def in_front(x,y):   # the held map and both paws
    return x<=33 and y>=27 and not (x>=17 and y<=30) and not (x>=28 and y>=49)
FRONT=layer(in_front)
BODY=layer(lambda x,y: not in_front(x,y))

def outline(im):
    """1px outline around a layer's own silhouette, drawn on its outer edge."""
    im=im.copy(); p=im.load(); w,h=im.size
    edge=[(x,y) for y in range(h) for x in range(w) if p[x,y][3]==0 and any(
        0<=x+dx<w and 0<=y+dy<h and p[x+dx,y+dy][3] for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)))]
    for x,y in edge: p[x,y]=OUT
    return im

# The jacket the map was hiding, so the map can be put down.
TORSO=Image.new('RGBA',(BW,BH),CLEAR); d=ImageDraw.Draw(TORSO)
d.polygon([(17,30),(34,30),(34,56),(13,56),(12,45),(14,37)],fill=JACKET)
d.line([(15,33),(13,40),(13,56)],fill=JACKET_DARK,width=2)
d.line([(25,32),(25,56)],fill=JACKET_DARK)
d.line([(18,31),(30,31)],fill=JACKET_DARK)
TORSO=outline(TORSO)
BODY_OPEN=Image.alpha_composite(TORSO,BODY)   # bear with the map put away

LEFT_EYE=[(21,19),(21,20),(20,21),(20,22)]; RIGHT_EYE=[(x,y) for x in (29,30,31) for y in (22,23,24,25)]
def blink(im):
    im=im.copy(); p=im.load()
    for x,y in LEFT_EYE+RIGHT_EYE:
        if p[x,y][:3]==OUT[:3] or p[x,y][:3]==(57,50,44): p[x,y]=FUR
    for x in (19,20,21): p[x,21]=OUT
    for x in (29,30,31): p[x,24]=OUT
    return im

def shift_rows(im,top,bottom,dy):
    """Move rows [top,bottom) down by dy over the rest: a nod or a breath."""
    part=im.crop((0,top,im.width,bottom)); c=im.copy()
    c.paste(CLEAR,(0,top,im.width,bottom)); c.alpha_composite(part,(0,top+dy)); return c

def _flutter(front):
    """The free corner of the map lifts by a pixel."""
    im=front.copy(); corner=im.crop((0,26,7,34)); im.paste(CLEAR,(0,26,7,34)); im.alpha_composite(corner,(0,25)); return im

CLOTH=(232,224,200,255); CLOTH_CHECK=(160,176,140,255); CLOTH_CROSS=(120,140,110,255); CLOTH_SHADE=(206,196,170,255)
CLOTH_BOTTOM=CH-8
def table():
    """Camp table with a checked cloth hanging in front, so whatever the bear does
    below the tabletop stays hidden."""
    t=Image.new('RGBA',(CW,CH),CLEAR); d=ImageDraw.Draw(t); p=t.load()
    for lx in (7,57):                                   # legs below the cloth
        d.rectangle([lx,CLOTH_BOTTOM,lx+3,CH-1],fill=WOOD); d.line([(lx+3,CLOTH_BOTTOM),(lx+3,CH-1)],fill=WOOD_DARK)
        d.rectangle([lx-1,CLOTH_BOTTOM,lx+4,CH-1],outline=OUT)
    for y in range(TABLE_Y,CLOTH_BOTTOM+1):              # gingham: 4px checks
        for x in range(2,CW-2):
            row=((y-TABLE_Y)//4)%2; col=((x-2)//4)%2
            p[x,y]=CLOTH_CROSS if row and col else CLOTH_CHECK if row or col else CLOTH
    d.line([(3,TABLE_Y+1),(CW-4,TABLE_Y+1)],fill=CLOTH)  # tabletop edge catches the light
    d.line([(2,TABLE_Y+3),(CW-3,TABLE_Y+3)],fill=CLOTH_SHADE)
    for x in range(2,CW-2,6):                             # scalloped hem
        p[x,CLOTH_BOTTOM]=CLEAR; p[x+1,CLOTH_BOTTOM]=CLEAR
    t=outline_cloth(t)
    return t

def outline_cloth(t):
    p=t.load(); w,h=t.size
    edge=[(x,y) for y in range(h) for x in range(w) if p[x,y][3]==0 and any(
        0<=x+dx<w and 0<=y+dy<h and p[x+dx,y+dy][3] and p[x+dx,y+dy]!=OUT for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)))]
    for x,y in edge:
        if y>=TABLE_Y-1: p[x,y]=OUT
    return t

def plate(with_rice=True):
    t=Image.new('RGBA',(CW,CH),CLEAR); d=ImageDraw.Draw(t)
    d.ellipse([44,TABLE_Y-3,60,TABLE_Y+2],fill=PLATE,outline=OUT); d.line([(47,TABLE_Y+1),(57,TABLE_Y+1)],fill=PLATE_RIM)
    if with_rice: t.alpha_composite(onigiri(),(49,TABLE_Y-9))
    return t

def onigiri(bites=0):
    rows=["...#...","..#w#..",".#wws#.","#wwwws#","#nnnnn#","#nnnnn#",".#####."]
    im=Image.new('RGBA',(7,7),CLEAR); p=im.load()
    col={'#':OUT,'w':RICE,'s':RICE_SHADE,'n':NORI}
    for y,r in enumerate(rows):
        for x,ch in enumerate(r):
            if ch in col: p[x,y]=col[ch]
    bitten=[[],[(3,0),(2,1),(3,1)],[(3,0),(2,1),(3,1),(1,2),(2,2),(3,2),(4,1)]][bites]
    for x,y in bitten: p[x,y]=CLEAR
    if bites:   # outline the bite
        for x,y in bitten:
            for dx,dy in ((0,1),(1,0),(-1,0)):
                q=(x+dx,y+dy)
                if 0<=q[0]<7 and 0<=q[1]<7 and p[q][3] and q not in bitten and p[q]!=OUT: p[q]=OUT
    return im

def paw():
    im=Image.new('RGBA',(6,5),CLEAR); d=ImageDraw.Draw(im)
    d.ellipse([0,0,5,4],fill=FUR,outline=OUT); im.putpixel((2,3),FUR_MID); im.putpixel((3,3),FUR_MID); return im

def arm(to):
    """A sleeve from the shoulder to a paw at `to` (base coords), paw on top."""
    im=Image.new('RGBA',(BW,BH),CLEAR); d=ImageDraw.Draw(im)
    d.line([(31,38),to],fill=JACKET_DARK,width=5); d.line([(31,38),to],fill=JACKET,width=3)
    im=outline(im); im.alpha_composite(paw(),(to[0]-3,to[1]-2)); return im

def scene(bear_layers, dy=0, dx=0, food=True, extras=()):
    c=Image.new('RGBA',(CW,CH),CLEAR)
    for im in bear_layers: c.alpha_composite(im,(BX+dx,dy))
    # Everything of the bear below the tabletop is behind the cloth.
    c.paste(CLEAR,(0,TABLE_Y+2,CW,CH))
    c.alpha_composite(table()); c.alpha_composite(plate(food))
    for im,pos in extras: c.alpha_composite(im,pos)
    return with_headroom(c)

HEADROOM=6
def with_headroom(c):
    """Room above the hat for the cheer hop and its sparkles."""
    out=Image.new('RGBA',(c.width,c.height+HEADROOM),CLEAR); out.alpha_composite(c,(0,HEADROOM)); return out

holding=[BODY,FRONT]
def standing(blinking=False,breath=False):
    b=blink(BODY) if blinking else BODY; f=FRONT
    layers=[b,f]
    if breath: layers=[shift_rows(b,0,40,1),shift_rows(f,0,40,1)]
    return scene(layers)

anims={}
anims['idle']=[standing(),standing(),standing(breath=True),standing(breath=True),standing(),standing(blinking=True)]
anims['sit_down']=[scene(holding,2),scene(holding,4),scene(holding,SEATED)]
nod=lambda im: shift_rows(im,0,31,1)
anims['read']=[scene(holding,SEATED),scene([BODY,_flutter(FRONT)],SEATED),scene(holding,SEATED),
               scene([nod(BODY),FRONT],SEATED),scene([nod(blink(BODY)),FRONT],SEATED),scene(holding,SEATED)]
# Put the map down: it sinks behind the table edge, then lies folded on the table with paws resting.
folded=Image.new('RGBA',(CW,CH),CLEAR); fd=ImageDraw.Draw(folded)
fd.polygon([(10,TABLE_Y-1),(30,TABLE_Y-3),(33,TABLE_Y),(12,TABLE_Y+1)],fill=(214,212,181,255),outline=OUT)
fd.line([(21,TABLE_Y-2),(22,TABLE_Y)],fill=(196,184,139,255))
resting=[(paw(),(BX+9,TABLE_Y-2)),(paw(),(BX+26,TABLE_Y-2))]
anims['map_down']=[scene([BODY_OPEN,shift_rows(FRONT,0,BH,4)],SEATED),
                   scene([BODY_OPEN,shift_rows(FRONT,0,BH,9)],SEATED),
                   scene([BODY_OPEN],SEATED,extras=[(folded,(0,0))]+resting)]
on_table=[(folded,(0,0)),(paw(),(BX+9,TABLE_Y-2))]
def eating(paw_at, bites, chew=False, crumb=None):
    a=arm(paw_at)
    rice=onigiri(bites); rx,ry=paw_at[0]-4,paw_at[1]-7
    body=BODY_OPEN
    if chew:   # cheek puffs out by a pixel
        body=body.copy(); body.putpixel((17,26),FUR); body.putpixel((16,26),OUT)
    ex=on_table+[(a,(BX,SEATED)),(rice,(BX+rx,SEATED+ry))]
    if crumb: ex.append((Image.new('RGBA',(1,1),RICE),crumb))
    return scene([body],SEATED,food=False,extras=ex)
anims['eat']=[eating((29,44),0),eating((26,36),0),eating((24,32),0),
              eating((24,33),1,chew=True,crumb=(BX+20,SEATED+38)),eating((24,32),1,crumb=(BX+20,SEATED+41)),
              eating((24,33),2,chew=True,crumb=(BX+19,SEATED+38)),eating((26,36),2)]
anims['map_up']=list(reversed(anims['map_down']))
anims['stand_up']=list(reversed(anims['sit_down']))
def scene_hop(h,ex):
    c=Image.new('RGBA',(CW,CH+HEADROOM),CLEAR)
    for im in holding: c.alpha_composite(im,(BX,HEADROOM-h))
    c.paste(CLEAR,(0,HEADROOM+TABLE_Y+2,CW,CH+HEADROOM))
    c.alpha_composite(table(),(0,HEADROOM)); c.alpha_composite(plate(True),(0,HEADROOM))
    for im,(x,y) in ex: c.alpha_composite(im,(x,y+HEADROOM-h))
    return c
def hop(h,sparks=False):
    ex=[]
    if sparks:
        for sx,sy in ((BX+2,8),(BX+40,4),(BX+50,16)):
            s=Image.new('RGBA',(3,3),CLEAR); [s.putpixel(p,SPARK) for p in ((1,0),(0,1),(1,1),(2,1),(1,2))]; ex.append((s,(sx,sy)))
    return scene_hop(h,ex)
anims['cheer']=[hop(0),hop(3,True),hop(5,True),hop(3),hop(0),hop(2,True),hop(0)]
def worried(dx,drop):
    ex=[]
    if drop is not None:
        d=Image.new('RGBA',(2,3),CLEAR); [d.putpixel(p,SWEAT) for p in ((0,0),(0,1),(1,1),(0,2),(1,2))]; ex.append((d,(BX+37,10+drop)))
    return scene(holding,0,dx,extras=ex)
anims['worried']=[worried(-1,0),worried(1,1),worried(-1,2),worried(0,3)]

ms={'idle':[350,350,350,350,350,160],'sit_down':[110]*3,'read':[500,300,500,450,140,500],
    'map_down':[120,120,200],'eat':[180,180,220,260,220,260,200],'map_up':[200,120,120],
    'stand_up':[110]*3,'cheer':[90,90,120,90,120,120,200],'worried':[90,90,90,400]}

# Sprite sheet: one row per animation, 1x, transparent; plus the frame list.
order=list(anims)
cols=max(len(v) for v in anims.values())
sheet=Image.new('RGBA',(CW*cols,(CH+HEADROOM)*len(order)),CLEAR); meta={'frameWidth':CW,'frameHeight':CH+HEADROOM,'animations':{}}
for r,name in enumerate(order):
    for i,f in enumerate(anims[name]): sheet.alpha_composite(f,(i*CW,r*(CH+HEADROOM)))
    meta['animations'][name]={'row':r,'frames':len(anims[name]),'durationsMs':ms[name]}
OUT_DIR.mkdir(parents=True,exist_ok=True)
sheet.save(OUT_DIR/'bear-sprites.png'); (OUT_DIR/'bear-sprites.json').write_text(json.dumps(meta,indent=2)+'\n')


if PREVIEW_DIR is not None:
    PREVIEW_DIR.mkdir(parents=True,exist_ok=True)
    def on_paper(f,S):
        bg=Image.new('RGBA',f.size,PAPER); bg.alpha_composite(f); return bg.convert('RGB').resize((f.width*S,f.height*S),Image.NEAREST)
    # Review sheet ×4 with row labels
    S=4; lab=110
    rv=Image.new('RGB',(lab+cols*(CW*S+8),len(order)*((CH+HEADROOM)*S+8)),PAPER[:3]); rd=ImageDraw.Draw(rv)
    for r,name in enumerate(order):
        rd.text((6,r*((CH+HEADROOM)*S+8)+CH*S//2),name,fill=(60,70,60))
        for i,f in enumerate(anims[name]): rv.paste(on_paper(f,S),(lab+i*(CW*S+8),r*((CH+HEADROOM)*S+8)))
    rv.save(PREVIEW_DIR/'bear-review.png')
    # One continuous story GIF: stand → sit → read → map down → eat → map up → read → stand → cheer
    story=['idle','sit_down','read','read','map_down','eat','eat','map_up','read','stand_up','cheer','idle']
    frames=[];durs=[]
    for n in story: frames+= [on_paper(f,5) for f in anims[n]]; durs+=ms[n]
    frames[0].save(PREVIEW_DIR/'bear-story.gif',save_all=True,append_images=frames[1:],duration=durs,loop=0)
print('frames', {k:len(v) for k,v in anims.items()}, 'total', sum(len(v) for v in anims.values()))
