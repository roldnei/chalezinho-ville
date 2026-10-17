"""Align published receipt transcripts to OCR line positions, never use OCR as labels.

Source: Auad et al., SIBGRAPI 2024, Zenodo 10.5281/zenodo.13633335,
CC BY 4.0. The archive actually includes 198 JPGs, 195 transcript files.
Only monotonic high-similarity transcript/line pairs are eligible. Restaurant
sources are split by whole receipt before line extraction and augmentation.
"""
import pathlib,json,sys,os,subprocess,csv,io,hashlib,concurrent.futures,unicodedata
from PIL import Image,ImageOps
from evaluate import distance
base=pathlib.Path(sys.argv[1]).resolve();root=pathlib.Path(sys.argv[2]).resolve();out=root/'reviewed';out.mkdir(parents=True,exist_ok=True);dataset=base/'restaurant/Dataset'
initial=json.loads((base/'reviewed-manifest.json').read_text());manifest=[dict(x) for x in initial];counts={};rejected=0

def norm(s):return ''.join(c for c in unicodedata.normalize('NFD',s).upper() if c.isalnum())
def similarity(a,b):
 a,b=norm(a),norm(b)
 return 1-distance(a,b)/max(len(a),len(b),1)
def align(a,b):
 # Dynamic programming preserves receipt order and permits missing OCR lines.
 table=[[0]*(len(b)+1) for _ in range(len(a)+1)];prev={}
 for i in range(1,len(a)+1):table[i][0]=i*.6;prev[i,0]=(i-1,0,None)
 for j in range(1,len(b)+1):table[0][j]=j*.6;prev[0,j]=(0,j-1,None)
 for i,x in enumerate(a,1):
  for j,y in enumerate(b,1):
   sim=similarity(x,y['text']);options=[(table[i-1][j]+.6,(i-1,j,None)),(table[i][j-1]+.6,(i,j-1,None)),(table[i-1][j-1]+(1-sim if sim>=.85 else 3),(i-1,j-1,(i-1,j-1) if sim>=.85 else None))];value,step=min(options,key=lambda p:p[0]);table[i][j]=value;prev[i,j]=step
 i,j=len(a),len(b);matches=[]
 while i or j:
  i,j,match=prev[i,j]
  if match is not None:matches.append(match)
 return list(reversed(matches))

def process(path):
 label=dataset/'Labels'/(path.stem+'.txt')
 if not label.exists():return []
 truths=[' '.join(s.split()) for s in label.read_text(errors='replace').splitlines() if len(s.strip())>=5 and len(s.strip())<=120]
 # Each source document is assigned independently of text/prediction quality.
 bucket=int(hashlib.sha256(('receipt-pilot-v2/'+path.stem).encode()).hexdigest()[:8],16)%10
 role='test' if bucket==0 else 'validation' if bucket==1 else 'train'
 result=subprocess.run(['tesseract',str(path),'stdout','--tessdata-dir',str(base/'current'),'-l','por','--psm','6','/usr/share/tesseract-ocr/5/tessdata/configs/tsv'],capture_output=True,text=True,env={**os.environ,'OMP_THREAD_LIMIT':'1'},check=True)
 rows={}
 for word in csv.DictReader(io.StringIO(result.stdout),delimiter='\t',quoting=csv.QUOTE_NONE):
  if word.get('level')!='5' or not word.get('text','').strip():continue
  key=(word['block_num'],word['par_num'],word['line_num']);row=rows.setdefault(key,[]);row.append(word)
 lines=[]
 for words in rows.values():
  x=min(int(w['left']) for w in words);y=min(int(w['top']) for w in words);right=max(int(w['left'])+int(w['width']) for w in words);bottom=max(int(w['top'])+int(w['height']) for w in words)
  lines.append({'text':' '.join(w['text'] for w in words),'bbox':(x,y,right,bottom)})
 image=Image.open(path).convert('L');records=[]
 for n,(i,j) in enumerate(align(truths,lines)):
  text=truths[i];line=lines[j];x,y,r,b=line['bbox'];height=b-y
  if height<6 or len(norm(text))<4:continue
  crop=image.crop((max(0,x-2),max(0,y-2),min(image.width,r+2),min(image.height,b+2)));crop=crop.resize((round(crop.width*48/height),round(crop.height*48/height)),Image.Resampling.LANCZOS);crop=ImageOps.expand(crop,border=8,fill=255)
  stem=out/f'restaurant-{path.stem}-{n:03d}';crop.save(str(stem)+'.png');pathlib.Path(str(stem)+'.gt.txt').write_text(text+'\n');w,h=crop.size;pathlib.Path(str(stem)+'.box').write_text(''.join(f'{c} 0 0 {w} {h} 0\n' for c in text)+f'\t 0 0 {w} {h} 0\n')
  records.append({'id':stem.name,'document':'restaurant-'+path.stem,'split':role,'variant':0,'text':text,'image':str(stem)+'.png','lstmf':str(stem)+'.lstmf','alignment_similarity':similarity(text,line['text'])})
 return records
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for n,records in enumerate(pool.map(process,sorted(dataset.glob('*.jpg')))):
  manifest.extend(records)
  if n%30==0:print('Processed',n,'receipts;',len(manifest),'lines',flush=True)
# Check exact image/transcript duplicates among the eligible documents.
seen_images={};seen_texts={}
for record in manifest:
 if not record['document'].startswith('restaurant-'):continue
 name=record['document'].removeprefix('restaurant-');image_path=dataset/(name+'.jpg');label_path=dataset/'Labels'/(name+'.txt')
 for seen,digest in [(seen_images,hashlib.sha256(image_path.read_bytes()).hexdigest()),(seen_texts,hashlib.sha256(' '.join(label_path.read_text(errors='replace').split()).encode()).hexdigest())]:
  if digest in seen and seen[digest]!=record['split']:raise ValueError('Duplicate source document across splits')
  seen[digest]=record['split']
(root/'reviewed-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
for role in ['train','validation','test']:
 group=[x for x in manifest if x['split']==role];counts[role]={'samples':len(group),'documents':len(set(x['document'] for x in group))}
print(json.dumps(counts))
