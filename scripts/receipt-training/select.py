"""Select checkpoint on validation CER only; the test set is never consulted."""
import json,pathlib,sys,subprocess
from evaluate import evaluate
root=pathlib.Path(sys.argv[1]).resolve();candidates=root/'candidates';candidates.mkdir(exist_ok=True);results=[]
for checkpoint in sorted((root/'run').glob('receipt_*.checkpoint')):
 directory=candidates/checkpoint.stem;directory.mkdir(exist_ok=True);target=directory/'por.traineddata'
 if not target.exists():subprocess.run(['lstmtraining','--stop_training','--convert_to_int','--continue_from',str(checkpoint),'--traineddata',str(root/'models/por.traineddata'),'--model_output',str(target)],check=True,capture_output=True)
 score=json.loads((directory/'validation.json').read_text()) if (directory/'validation.json').exists() else evaluate(root,directory,'por',splits=('validation',));(directory/'validation.json').write_text(json.dumps(score,ensure_ascii=False,indent=2));results.append({'checkpoint':checkpoint.name,'model':str(target),'validation':score['totals']['validation']});print(checkpoint.name,json.dumps(results[-1]['validation']),flush=True)
best=min(results,key=lambda x:x['validation']['cer']);(root/'selection.json').write_text(json.dumps({'criterion':'lowest validation CER; test and user photos excluded from selection','best':best,'candidates':results},indent=2));print('SELECTED',best['checkpoint'])
