"""Report held-out line CER and exact-line matches; whitespace only normalized."""
import argparse,json,os,pathlib,subprocess,unicodedata,concurrent.futures

def normalize(text):return ' '.join(unicodedata.normalize('NFC',text).split())
def distance(a,b):
 row=list(range(len(b)+1))
 for i,c in enumerate(a,1):
  nextrow=[i]
  for j,d in enumerate(b,1):nextrow.append(min(row[j]+1,nextrow[j-1]+1,row[j-1]+(c!=d)))
  row=nextrow
 return row[-1]
def evaluate(root,model_dir,model,splits=('validation','test')):
 data=json.loads((root/'reviewed-manifest.json').read_text());data=[x for x in data if x['split'] in splits]
 def read(x):
  r=subprocess.run(['tesseract',x['image'],'stdout','--tessdata-dir',str(model_dir),'-l',model,'--psm','7'],capture_output=True,text=True,env={**os.environ,'OMP_THREAD_LIMIT':'1'},check=True)
  expected,actual=normalize(x['text']),normalize(r.stdout)
  return {'id':x['id'],'split':x['split'],'expected':expected,'actual':actual,'edits':distance(expected,actual),'characters':len(expected),'exact':expected==actual}
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:rows=list(pool.map(read,data))
 totals={}
 for role in splits:
  group=[x for x in rows if x['split']==role];chars=sum(x['characters'] for x in group);edits=sum(x['edits'] for x in group)
  totals[role]={'lines':len(group),'characters':chars,'edits':edits,'cer':edits/chars,'exact_lines':sum(x['exact'] for x in group)}
 return {'model':model,'totals':totals,'rows':rows}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('directory',type=pathlib.Path);p.add_argument('model_directory',type=pathlib.Path);p.add_argument('--model',default='por');p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args();result=evaluate(a.directory.resolve(),a.model_directory.resolve(),a.model);a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result['totals']))
