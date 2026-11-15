#!/usr/bin/env python3
"""Makes the Product Hunt gallery (ios/store/producthunt/gallery-1..4.png, 1270x760) and thumbnail (240x240) from the
key art, the store screenshots and the app icon, so they follow the game when those are regenerated.
  1: the key art (ios/store/header/universal-16x9.png), cropped to the gallery's shape
  2: the first puzzle and the daily puzzle (iPhone 1 and 5)
  3: real-game puzzles and a hint (iPhone 2 and 3)
  4: iPad and iPhone Duo held like a book (iPad 1, Duo book 1)
Run it after regenerating the screenshots or the header art: python3 scripts/producthunt.py
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'ios', 'store', 'producthunt')
SHOTS = os.path.join(ROOT, 'ios', 'store', 'screenshots')
W, H = 1270, 760


def backdrop():
    """The brand's deep teal, lighter at the top, as behind the store screenshots"""
    im = Image.new('RGB', (W, H), '#143f38')
    d = ImageDraw.Draw(im)
    top, bottom = (0x1c, 0x78, 0x68), (0x0f, 0x32, 0x2c)
    for y in range(H):
        t = min(1, y / (H * 0.75))
        d.line([(0, y), (W, y)], fill=tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return im


def pair(a, b, name):
    im = backdrop()
    shots = [Image.open(os.path.join(SHOTS, f)).convert('RGB') for f in (a, b)]
    h = H - 40
    shots = [s.resize((round(s.width * h / s.height), h), Image.LANCZOS) for s in shots]
    gap = (W - sum(s.width for s in shots)) // 3
    x = gap
    for s in shots:
        im.paste(s, (x, 20)); x += s.width + gap
    im.save(os.path.join(OUT, name), optimize=True)


art = Image.open(os.path.join(ROOT, 'ios', 'store', 'header', 'universal-16x9.png')).convert('RGB')
scale = max(W / art.width, H / art.height)
art = art.resize((round(art.width * scale), round(art.height * scale)), Image.LANCZOS)
left, top = (art.width - W) // 2, (art.height - H) // 2
art.crop((left, top, left + W, top + H)).save(os.path.join(OUT, 'gallery-1.png'), optimize=True)
pair('iphone-1.png', 'iphone-5.png', 'gallery-2.png')
pair('iphone-2.png', 'iphone-3.png', 'gallery-3.png')
pair('ipad-1.png', 'duo-book-1.png', 'gallery-4.png')
icon = Image.open(os.path.join(ROOT, 'ios', 'KingWalk', 'Assets.xcassets', 'AppIcon.appiconset', 'icon-1024.png')).convert('RGB')
icon.resize((240, 240), Image.LANCZOS).save(os.path.join(OUT, 'thumbnail.png'))
print('saved to', OUT)
