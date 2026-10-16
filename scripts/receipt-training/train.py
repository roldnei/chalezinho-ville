"""Bounded native Tesseract fine-tuning; no app model is changed by this script."""
import argparse,os,pathlib,subprocess
p=argparse.ArgumentParser();p.add_argument('directory',type=pathlib.Path);p.add_argument('--iterations',type=int,default=1200);a=p.parse_args();root=a.directory.resolve();run=root/'run';run.mkdir(exist_ok=True)
if not 100<=a.iterations<=10000:raise ValueError('Use 100–10000 iterations')
subprocess.run(['combine_tessdata','-e',str(root/'models/por.traineddata'),str(root/'models/por.lstm')],check=True)
args=['lstmtraining','--continue_from',str(root/'models/por.lstm'),'--traineddata',str(root/'models/por.traineddata'),'--train_listfile',str(root/'train.list'),'--eval_listfile',str(root/'validation.list'),'--model_output',str(run/'receipt'),'--max_iterations',str(a.iterations),'--learning_rate','0.0001','--target_error_rate','0','--debug_interval','0']
with (run/'training.log').open('w') as log:subprocess.run(args,stdout=log,stderr=subprocess.STDOUT,check=True,env={**os.environ,'OMP_THREAD_LIMIT':'1'})
print(run/'training.log')
