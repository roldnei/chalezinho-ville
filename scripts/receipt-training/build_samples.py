"""Create reviewed-only samples; variants of a line never cross document splits."""
import json,pathlib,sys,random
from PIL import Image,ImageEnhance,ImageFilter,ImageOps
root=pathlib.Path(sys.argv[1]).resolve();labels=json.loads(pathlib.Path(__file__).with_name('reviewed-labels.json').read_text());raw={x['id']:x for x in json.loads((root/'line-manifest.json').read_text())};out=root/'reviewed';out.mkdir(exist_ok=True);manifest=[]
for doc,group in labels['documents'].items():
 for number,text in group['lines'].items():
  entry=raw[doc+'-'+number];image=Image.open(entry['image']).convert('L')
  for variant in range(5 if group['split']=='train' else 1):
   result=image.copy()
   if variant:
    rng=random.Random(entry['id']+str(variant));result=ImageEnhance.Contrast(result).enhance(rng.uniform(.5,.95));result=ImageEnhance.Brightness(result).enhance(rng.uniform(.92,1.06));result=result.filter(ImageFilter.GaussianBlur(rng.uniform(.15,.65)));result=result.rotate(rng.uniform(-1,1),resample=Image.Resampling.BICUBIC,expand=True,fillcolor=255)
   stem=out/f"{entry['id']}-v{variant}";result.save(str(stem)+'.png');pathlib.Path(str(stem)+'.gt.txt').write_text(text+'\n');w,h=result.size
   pathlib.Path(str(stem)+'.box').write_text(''.join(f'{c} 0 0 {w} {h} 0\n' for c in text)+f'\t 0 0 {w} {h} 0\n')
   manifest.append({'id':stem.name,'document':doc,'split':group['split'],'variant':variant,'text':text,'image':str(stem)+'.png','lstmf':str(stem)+'.lstmf'})
(root/'reviewed-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));print(json.dumps({role:sum(x['split']==role for x in manifest) for role in ['train','validation','test']}))
