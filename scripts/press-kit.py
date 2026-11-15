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
for name in ('duo-book-1', 'duo-book-5', 'duo-table-1', 'duo-table-3'):
    thumb(os.path.join(SHOTS, name + '.png'), name + '.jpg', 640)
thumb(os.path.join(ROOT, 'ios', 'store', 'header', 'universal-16x9.png'), 'key-art.jpg', 1600)

# Other languages: the store screenshots in those languages aren't committed (the App Store listing workflow makes
# them), so the page keeps a full-size JPEG of each one it shows, in press/shots/. Make them first with
# node ios/store/screenshots.js --lang <locale>; without them, the copies already in press/ stay as they are.
LOCALIZED = [('es-ES', 1), ('ja', 5), ('ru', 2)]
os.makedirs(os.path.join(ROOT, 'press', 'shots'), exist_ok=True)
for locale, n in LOCALIZED:
    src = os.path.join(SHOTS, 'l10n', locale, f'iphone-{n}.png')
    if not os.path.exists(src):
        print('no', src, '(kept the old copies)'); continue
    Image.open(src).convert('RGB').save(os.path.join(ROOT, 'press', 'shots', f'{locale}-iphone-{n}.jpg'), quality=88, optimize=True, progressive=True)
    thumb(src, f'{locale}-iphone-{n}.jpg', 440)
print('saved to', OUT)
