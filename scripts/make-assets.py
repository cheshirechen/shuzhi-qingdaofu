from pathlib import Path
from PIL import Image, ImageDraw
import qrcode
root=Path(__file__).resolve().parents[1]
for size in (192,512):
    im=Image.new('RGB',(size,size),'#12251f');d=ImageDraw.Draw(im);s=size/100
    def line(points,width=4):d.line([(int(x*s),int(y*s)) for x,y in points],fill='#65ecab',width=round(width*s))
    for points in [[(30,16),(16,16),(16,30)],[(70,16),(84,16),(84,30)],[(16,70),(16,84),(30,84)],[(70,84),(84,84),(84,70)]]:line(points)
    line([(34,36),(66,36)]);line([(40,36),(40,68),(60,68),(60,36)]);line([(44,28),(56,28)]);line([(47,43),(47,60)],2);line([(53,43),(53,60)],2)
    im.save(root/'public'/f'icon-{size}.png')
qrcode.make('https://cheshirechen.github.io/codex_practice/').save(root/'phone-qr.png')
print('App icons and phone QR generated')
