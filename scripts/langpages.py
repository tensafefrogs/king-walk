#!/usr/bin/env python3
"""The website's page in each language, for search engines and for links people share: kingwalk.app/de/, /hi/, /pt-PT/.

Search engines crawl in English, and the game picks its language in the browser, so without these they only see the
English game. Each page is the built index.html with:
  - its language fixed (<meta name="kw-lang">: the loader in index.html reads it) and <html lang dir> set
  - the title and description in that language (from its App Store listing, ios/store/l10n), also in the link
    preview tags, which apps read without running the page
  - the game's files reached from one folder down (<meta name="kw-root" content="../">, and its links and fonts)
  - hreflang links to every language's page (and x-default to the main page), on every page including the main one,
    and a canonical link to itself
The sitemap gets every page, with the same hreflang links.

usage: python3 scripts/langpages.py <built site folder> [<site URL>]
  The website build (.github/workflows/pages.yml) runs it on _site after the main page is ready. Without a site URL
  (a copy of the game somewhere else) the pages are made without hreflang links and sitemap entries.
"""
import html as h, json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
L10N = os.path.join(ROOT, 'ios', 'store', 'l10n')
VARIANTS = ['es-ES', 'pt-PT', 'zh-Hant']
RTL = {'ar', 'he', 'ur'}
# the App Store listing whose name and promotional text each page uses
STORE = {'es': 'es-MX', 'fr': 'fr-FR', 'de': 'de-DE', 'pt': 'pt-BR', 'nl': 'nl-NL', 'zh': 'zh-Hans', 'ar': 'ar-SA', 'mr': 'mr-IN',
         'ur': 'ur-PK', 'bn': 'bn-BD', 'gu': 'gu-IN', 'pa': 'pa-IN', 'ta': 'ta-IN', 'te': 'te-IN', 'kn': 'kn-IN', 'ml': 'ml-IN',
         'or': 'or-IN', 'sl': 'sl-SI', 'nb': 'no'}
# hreflang wants language-region codes where the page is for a region
HREFLANG = {'pt': 'pt-BR', 'zh': 'zh-Hans', 'es': 'es-419', 'nb': 'nb', 'zh-Hant': 'zh-Hant'}


def listing(tag):
    loc = STORE.get(tag, tag)
    f = os.path.join(L10N, loc + '.json')
    if not os.path.exists(f): return None
    return json.load(open(f, encoding='utf-8'))['listing']


def meta(page, attr, key, value):
    """set <meta {attr}="{key}" content="..."> in page"""
    pat = re.compile(r'(<meta ' + attr + r'="' + re.escape(key) + r'" content=")[^"]*(">)')
    return pat.sub(lambda m: m.group(1) + h.escape(value, quote=True) + m.group(2), page, count=1)


def one_folder_down(page):
    """the page's own file references, from one folder down: attributes and CSS url()s, not links within the page
    (#…), absolute or data URLs, nor the strings inside scripts that build HTML (they use KW_ROOT)"""
    page = re.sub(r'\b(src|href)="(?![a-z][a-z0-9+.-]*:|#|/|\.\./|\'|\$|")([^"]+)"', r'\1="../\2"', page)
    return re.sub(r'url\((?![a-z][a-z0-9+.-]*:|["\'#/]|\.\./)', 'url(../', page)


def main():
    site_dir = sys.argv[1]
    site = (sys.argv[2] if len(sys.argv) > 2 else '').strip()
    if site and not site.endswith('/'): site += '/'
    page = open(os.path.join(site_dir, 'index.html'), encoding='utf-8').read()
    langs = json.loads(re.search(r'var LANGS = (\[[^\]]+\])', page).group(1))
    tags = [t for t in langs if t != 'en'] + VARIANTS
    alternates = ''
    if site:
        alternates = ''.join(f'<link rel="alternate" hreflang="{HREFLANG.get(t, t)}" href="{site}{t}/">\n' for t in tags)
        alternates = f'<link rel="alternate" hreflang="en" href="{site}">\n' + alternates + f'<link rel="alternate" hreflang="x-default" href="{site}">\n'
    made = []
    for tag in tags:
        l = listing(tag)
        if not l: print('no store listing for', tag, '- page skipped'); continue
        p = one_folder_down(page)
        p = p.replace('<html lang="en">', f'<html lang="{tag}"' + (' dir="rtl"' if tag.split('-')[0] in RTL else '') + '>', 1)
        p = p.replace('<head>', f'<head>\n<meta name="kw-lang" content="{tag}">\n<meta name="kw-root" content="../">', 1)
        name, desc = l['name'], l['promotional_text']
        p = re.sub(r'<title>[^<]*</title>', lambda m: '<title>' + h.escape(name) + '</title>', p, count=1)
        p = meta(p, 'name', 'description', desc)
        for a, k, v in (('property', 'og:title', name), ('property', 'og:description', desc), ('name', 'twitter:title', name), ('name', 'twitter:description', desc)):
            p = meta(p, a, k, v)
        if site:
            p = meta(p, 'property', 'og:url', f'{site}{tag}/')
            p = p.replace('</head>', f'<link rel="canonical" href="{site}{tag}/">\n' + alternates + '</head>', 1)
        os.makedirs(os.path.join(site_dir, tag), exist_ok=True)
        open(os.path.join(site_dir, tag, 'index.html'), 'w', encoding='utf-8').write(p)
        made.append(tag)
    if site:
        root = page.replace('</head>', f'<link rel="canonical" href="{site}">\n' + alternates + '</head>', 1)
        open(os.path.join(site_dir, 'index.html'), 'w', encoding='utf-8').write(root)
        sm = os.path.join(site_dir, 'sitemap.xml')
        if os.path.exists(sm):
            links = alternates.replace('<link rel="alternate"', '    <xhtml:link rel="alternate"').replace('">', '"/>')
            xml = open(sm, encoding='utf-8').read()
            xml = xml.replace('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                              '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">', 1)
            entry = lambda url: f'  <url>\n    <loc>{url}</loc>\n{links}  </url>\n'
            xml = xml.replace(f'  <url><loc>{site}</loc></url>\n', entry(site) + ''.join(entry(f'{site}{t}/') for t in made), 1)
            open(sm, 'w', encoding='utf-8').write(xml)
    print(f'language pages: {len(made)} ({", ".join(made)})' + ('' if site else '; no site URL, so no hreflang links or sitemap entries'))


if __name__ == '__main__':
    main()
