"""Convert licensed legacy receipt character boxes into line-level LSTM samples.

Raw data stays outside the repository. Split entire source documents before
cropping; never split neighbouring lines of one receipt between train/eval/test.
Requires Pillow and native Tesseract training tools. Labels remain those supplied
by the public corpus; spaces are reconstructed from character-box gaps.
"""
import argparse, json, pathlib, statistics, math
from PIL import Image, ImageOps

def character_boxes(path):
    boxes=[]
    for raw in path.read_text(encoding='utf-8').splitlines():
        parts=raw.rsplit(' ',5)
        if len(parts)!=6:continue
        ch,*numbers=parts
        try:x0,y0,x1,y1,page=map(int,numbers)
        except ValueError:continue
        if page==0 and x1>x0 and y1>y0 and ch.strip():boxes.append((ch,x0,y0,x1,y1))
    return boxes

def lines_from_boxes(boxes):
    h=statistics.median(b[4]-b[2] for b in boxes)
    anchors=[b for b in boxes if b[4]-b[2]>=h*.7]
    # Search the small printing/camera skew. Aligned baselines create peaks.
    def score(slope):
        counts={}
        for b in anchors:
            k=round((b[2]-slope*b[1])/(h*.25));counts[k]=counts.get(k,0)+1
        return sum(n*n for n in counts.values())
    slope=max((n*.002 for n in range(-40,41)),key=score)
    clusters=[]
    for b in sorted(anchors,key=lambda b:b[2]-slope*b[1],reverse=True):
        y=b[2]-slope*b[1]
        if clusters and abs(y-statistics.median(v[2]-slope*v[1] for v in clusters[-1]))<h*.45:clusters[-1].append(b)
        else:clusters.append([b])
    for b in boxes:
        if b in anchors:continue
        candidates=[g for g in clusters if min(v[2] for v in g)-h*.2<=b[2] and max(v[4] for v in g)+h*.2>=b[4]]
        if candidates:min(candidates,key=lambda g:abs((b[2]+b[4])/2-statistics.median((v[2]+v[4])/2 for v in g))).append(b)
    result=[]
    for g in clusters:
        g.sort(key=lambda b:b[1]);width=statistics.median(b[3]-b[1] for b in g)
        text=''
        for i,b in enumerate(g):
            if i and b[1]-g[i-1][3]>width*.55:text+=' '
            text+=b[0]
        text=' '.join(text.split())
        if len(text)<4 or sum(c.isalnum() for c in text)<3:continue
        result.append((text,(min(b[1] for b in g),min(b[2] for b in g),max(b[3] for b in g),max(b[4] for b in g))))
    return result

def prepare(root):
    source=root/'source';out=root/'lines';out.mkdir(exist_ok=True)
    split={'train':['bematech.exp0','epson.exp0','ibm.exp0','sweda.exp0','sweda-120.exp0'], 'validation':['bematech.exp1','ibm.exp1'],'test':['ncr-mac.exp0','zantus.exp0']}
    manifest=[]
    for role,docs in split.items():
        for doc in docs:
            image=Image.open(source/f'ftc.{doc}.tif').convert('L')
            for n,(text,b) in enumerate(lines_from_boxes(character_boxes(source/f'ftc.{doc}.box'))):
                x0,y0,x1,y1=b;pad=4
                crop=image.crop((max(0,x0-pad),max(0,image.height-y1-pad),min(image.width,x1+pad),min(image.height,image.height-y0+pad)))
                # A common height makes line training independent of scan DPI.
                scale=48/max(1,y1-y0);crop=crop.resize((round(crop.width*scale),round(crop.height*scale)),Image.Resampling.LANCZOS)
                crop=ImageOps.expand(crop,border=8,fill=255)
                stem=out/f'{doc}-{n:03d}';crop.save(str(stem)+'.png');pathlib.Path(str(stem)+'.gt.txt').write_text(text+'\n',encoding='utf-8')
                w,h=crop.size;pathlib.Path(str(stem)+'.box').write_text(''.join(f'{c} 0 0 {w} {h} 0\n' for c in text)+f'\t 0 0 {w} {h} 0\n',encoding='utf-8')
                manifest.append({'id':stem.name,'document':doc,'split':role,'image':str(stem)+'.png','text':text,'lstmf':str(stem)+'.lstmf'})
    (root/'line-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    print(json.dumps({r:sum(m['split']==r for m in manifest) for r in split}))
    return manifest
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('directory',type=pathlib.Path);args=parser.parse_args();prepare(args.directory.resolve())
