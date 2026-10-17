"""Build LSTM samples and deterministic, document-isolated sample lists."""
import argparse,concurrent.futures,subprocess,json,pathlib,os,random
p=argparse.ArgumentParser();p.add_argument('directory',type=pathlib.Path);p.add_argument('--keep-order',action='store_true');p.add_argument('--keep-unsupported',action='store_true');args=p.parse_args();root=args.directory.resolve();manifest=json.loads((root/'reviewed-manifest.json').read_text())
roles={}
for row in manifest:
 if row['document'] in roles and roles[row['document']]!=row['split']:raise ValueError('Document leakage across splits')
 roles[row['document']]=row['split']
config=pathlib.Path('/usr/share/tesseract-ocr/5/tessdata/configs/lstm.train')
if not config.exists():raise ValueError('Install native Tesseract training configs or update config path')
def run(x):
 stem=x['image'][:-4];r=subprocess.run(['tesseract',x['image'],stem,'--tessdata-dir',str(root/'models'),'-l','por','--psm','13',str(config)],capture_output=True,text=True,env={**os.environ,'OMP_THREAD_LIMIT':'1'})
 if r.returncode or not pathlib.Path(x['lstmf']).exists():raise RuntimeError(x['id']+r.stderr)
 return x['id']
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:list(ex.map(run,manifest))
charset=set(' ')
if not args.keep_unsupported:
 unichar=root/'models/por.lstm-unicharset';subprocess.run(['combine_tessdata','-e',str(root/'models/por.traineddata'),str(unichar)],check=True,capture_output=True)
 for line in unichar.read_text().splitlines()[1:]:
  symbol=line.split(' ')[0]
  if len(symbol)==1:charset.add(symbol)
counts={}
for role in ['train','validation','test']:
 rows=[x for x in manifest if x['split']==role];excluded=[]
 if role=='train' and not args.keep_unsupported:excluded=[x for x in rows if any(c not in charset for c in x['text'])];rows=[x for x in rows if x not in excluded]
 if not args.keep_order:random.Random(20261016).shuffle(rows)
 (root/f'{role}.list').write_text('\n'.join(x['lstmf'] for x in rows)+'\n');counts[role]={'samples':len(rows),'excluded_unsupported_training_chars':len(excluded)}
(root/'training-selection.json').write_text(json.dumps(counts,indent=2));print(json.dumps(counts))
