"""Fetch data-only public inputs, validate their pinned byte hashes, never execute them."""
import concurrent.futures,hashlib,json,pathlib,sys,urllib.request
root=pathlib.Path(sys.argv[1]).resolve();root.mkdir(parents=True,exist_ok=True)
manifest=json.loads(pathlib.Path(__file__).with_name('sources.json').read_text())
def fetch(entry):
 p=root/entry['file'];p.parent.mkdir(parents=True,exist_ok=True)
 if not p.exists():
  with urllib.request.urlopen(entry['url'],timeout=90) as r:data=r.read()
  if hashlib.sha256(data).hexdigest()!=entry['sha256']:raise ValueError('Source hash mismatch: '+entry['file'])
  p.write_bytes(data)
 if hashlib.sha256(p.read_bytes()).hexdigest()!=entry['sha256']:raise ValueError('Source hash mismatch: '+entry['file'])
 return entry['file']
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
 for name in pool.map(fetch,manifest):print(name)
