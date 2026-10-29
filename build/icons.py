from PIL import Image, ImageDraw, ImageFont
import os, sys
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
font_path = '/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc'
for size in (16, 32, 48, 128):
    S = size * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S // 5, fill=(36, 41, 47, 255))
    f = ImageFont.truetype(font_path, int(S * 0.66), index=2)  # TC
    txt = '中'
    b = d.textbbox((0, 0), txt, font=f)
    d.text(((S - (b[2] - b[0])) / 2 - b[0], (S - (b[3] - b[1])) / 2 - b[1]), txt, font=f, fill=(255, 255, 255, 255))
    d.ellipse([S * .70, S * .70, S * .94, S * .94], fill=(31, 136, 61, 255))
    im.resize((size, size), Image.LANCZOS).save(os.path.join(out, f'icon{size}.png'))
print('icons ok')
