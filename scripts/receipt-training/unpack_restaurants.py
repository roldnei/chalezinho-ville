"""Extract the hash-verified data archive, rejecting paths outside the data folder."""
import pathlib,sys,zipfile,hashlib
root=pathlib.Path(sys.argv[1]).resolve();archive=root/'restaurant-dataset.zip';data=archive.read_bytes()
if hashlib.sha256(data).hexdigest()!='9c7dd7115c300b651ceb1417c6a3c28c0a0982096f45206bacf576a906153eda':raise ValueError('Unexpected archive bytes')
out=root/'restaurant';out.mkdir(exist_ok=True)
with zipfile.ZipFile(archive) as z:
 for item in z.infolist():
  target=(out/item.filename).resolve()
  if not target.is_relative_to(out) or item.file_size>15000000:raise ValueError('Unsafe data archive entry')
 z.extractall(out)
print(out)
