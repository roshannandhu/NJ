"""Generate a black + gold 'NJ' monogram app icon (installer/app.ico).
Placeholder brand mark matching the app theme; replace app.ico with the real
NJ logo any time (a multi-size .ico) and rebuild."""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
INK = (16, 16, 16)        # near-black background
GOLD = (217, 119, 6)      # --gold
SIZE = 256


def _font(px):
    for name in ("georgiab.ttf", "timesbd.ttf", "arialbd.ttf", "seguisb.ttf"):
        try:
            return ImageFont.truetype(name, px)
        except Exception:
            continue
    return ImageFont.load_default()


def render(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * 0.18)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=INK + (255,))
    # thin gold border
    d.rounded_rectangle([int(size*0.04)]*1 + [int(size*0.04), size-1-int(size*0.04), size-1-int(size*0.04)],
                        radius=int(r*0.8), outline=GOLD + (255,), width=max(2, size // 64))
    f = _font(int(size * 0.5))
    text = "NJ"
    bbox = d.textbbox((0, 0), text, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1]), text, font=f, fill=GOLD + (255,))
    return img


base = render(SIZE)
sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
out = os.path.join(HERE, "app.ico")
base.save(out, format="ICO", sizes=sizes)
print("wrote", out)
