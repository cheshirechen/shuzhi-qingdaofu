from pathlib import Path
from PIL import Image,ImageDraw
import zipfile,io,json
root=Path(__file__).resolve().parents[1];z=zipfile.ZipFile(root/'artifacts/public-test.zip');out=root/'artifacts/bottles';out.mkdir(exist_ok=True)
files=sorted(n for n in z.namelist() if Path(n).name.startswith('plastic') and n.endswith('.jpg'))[:24]
sheet=Image.new('RGB',(720,6*205),'white')
for i,name in enumerate(files):
    data=z.read(name);(out/f'bottle-{i+1}.jpg').write_bytes(data);im=Image.open(io.BytesIO(data)).convert('RGB').resize((180,180));x,y=i%4*180,i//4*205;sheet.paste(im,(x,y));ImageDraw.Draw(sheet).text((x+4,y+181),str(i+1),fill='black')
sheet.save(out/'contact-sheet.jpg');(out/'sources.json').write_text(json.dumps(files,indent=2),encoding='utf-8')
