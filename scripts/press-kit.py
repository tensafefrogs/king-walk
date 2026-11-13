#!/usr/bin/env python3
"""Makes the small images the press page (press/index.html) shows, from the App Store screenshots, the header art
and the icon. The page links to the full-size files where they live in the repo (GitHub Pages serves them).
Run it after regenerating the store screenshots or the header art: python3 scripts/press-kit.py
"""
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'press', 'thumbs')
SHOTS = os.path.join(ROOT, 'ios', 'store', 'screenshots')
os.makedirs(OUT, exist_ok=True)


def thumb(src, name, width):
    im = Image.open(src).convert('RGB')
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(os.path.join(OUT, name), quality=84, optimize=True, progressive=True)


for n in range(1, 6):
    thumb(os.path.join(SHOTS, f'iphone-{n}.png'), f'iphone-{n}.jpg', 440)
    thumb(os.path.join(SHOTS, f'ipad-{n}.png'), f'ipad-{n}.jpg', 640)
thumb(os.path.join(ROOT, 'ios', 'store', 'header', 'universal-16x9.png'), 'key-art.jpg', 1600)
print('saved to', OUT)
