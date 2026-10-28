#!/usr/bin/env python3
"""
Builds the token logos in apps/web/public/tokens/ for the sample data.

Real tokens get their logo from on-chain metadata (M2 token lookup); these
files only exist so every sample token shows a logo. Sources, all free to
reuse (see THIRD_PARTY_NOTICES.md):

  - Stock tokens: company marks from simple-icons (CC0) on the brand tile,
    with the "x" badge for tokenized stocks. SPY and QQQ have no mark there,
    so they get their ticker set in Geist Bold; Coinbase gets a plain "C" ring.
  - SOL: the Solana mark from simple-icons in the brand gradient.
  - USDC: the USDC mark from cryptocurrency-icons (CC0).
  - Sample memecoins: a Microsoft Fluent Emoji 3D mascot (MIT) on a colored disc.

Usage (needs Pillow and fontTools; package folders are unpacked npm tarballs):

  python3 scripts/token-logos.py \
    --simple-icons <simple-icons>/package/icons \
    --crypto-icons <cryptocurrency-icons>/package/svg/color \
    --fluent-3d <@lobehub/fluent-emoji-3d>/package/assets \
    --geist apps/web/node_modules/geist/dist/fonts/geist-sans/Geist-Bold.ttf
"""
import argparse
import io
import re
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / 'apps/web/public/tokens'

# Brand tiles: same colors as the sample data's brand avatars (seed.ts BRAND).
STOCKS = {
    'tslax': ('#F0373D', '#6E0B10', 'tesla'),
    'nvdax': ('#8FD12A', '#2F5604', 'nvidia'),
    'aaplx': ('#EEF1F4', '#8A949E', 'apple'),
    'metax': ('#3A86FF', '#0A2E86', 'meta'),
    # simple-icons only has Coinbase's wordmark, which is unreadable at avatar size: draw the "C" mark.
    'coinx': ('#3D76FF', '#0A2580', ':ring'),
    'mstrx': ('#FF9A3D', '#7A3000', 'microstrategy'),
    'spyx': ('#4D6BEA', '#121E57', 'SPY'),
    'qqqx': ('#2BCBF0', '#0A4E7C', 'QQQ'),
}

# Sample memecoins: Fluent Emoji code point and disc colors (light center, dark edge).
MEMES = {
    'mochi': ('1f361', '#8B5CFF', '#2A1460'),
    'orbit': ('1f431', '#4B6BEB', '#101A4D'),
    'gravy': ('1f682', '#4FB0E8', '#0E3556'),
    'pixel': ('1f436', '#38C9A0', '#0D4A3B'),
    'noodl': ('1f35c', '#FF8A3D', '#7A2A00'),
    'koi': ('1f420', '#2FA8E0', '#0A3A5C'),
    'zest': ('1f34b', '#3FB565', '#0B3D1B'),
    'tusk': ('1f418', '#9B8CFF', '#2B2170'),
    'froth': ('1f37a', '#3F7DF0', '#0F2A66'),
    'sprk': ('2728', '#FF4FA3', '#5C0B33'),
    'halo': ('1f607', '#5BC0FF', '#0E3C66'),
    'brrr': ('1f4b8', '#2BBF6A', '#0A4224'),
    'lune': ('1f319', '#3A4CB0', '#0A0F33'),
    'otter': ('1f9a6', '#3BB8C9', '#0B4049'),
    'crumb': ('1f36a', '#4C8BF5', '#0F2A66'),
    'wobbl': ('1f36e', '#FF6B6B', '#661414'),
    'volt': ('1f438', '#FFD43B', '#8A6400'),
    'chad': ('1f402', '#E8453C', '#5C0A0A'),
    'pebl': ('1faa8', '#4DB6AC', '#0E3B37'),
}

LIGHT_TEXT = '#1A222D'


def icon_path(svg: str) -> str:
    return ' '.join(re.findall(r' d="([^"]+)"', svg))


def is_light(hex_: str) -> bool:
    n = int(hex_[1:], 16)
    r, g, b = (n >> 16) & 255, (n >> 8) & 255, n & 255
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 200


def ticker_path(font: TTFont, text: str, box: float) -> tuple[str, float, float]:
    """Glyph outlines for `text`, scaled to fit a `box`-wide square. Returns (path, width, height)."""
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font['head'].unitsPerEm
    cap = font['OS/2'].sCapHeight or upm * 0.7
    width = sum(gs[cmap[ord(c)]].width for c in text)
    s = min(box / width, box * 0.62 / cap)
    pen = SVGPathPen(gs)
    x = 0.0
    for c in text:
        name = cmap[ord(c)]
        # Font units are y-up; flip into SVG space with the baseline at y = cap height.
        gs[name].draw(TransformPen(pen, (s, 0, 0, -s, x * s, cap * s)))
        x += gs[name].width
    return pen.getCommands(), width * s, cap * s


def tile(a: str, b: str, glyph: str, stock: bool) -> str:
    badge = (
        '<circle cx="107" cy="107" r="14" fill="#040A14" fill-opacity=".8"/>'
        '<path d="M102 102l10 10M112 102l-10 10" stroke="#fff" stroke-width="4" stroke-linecap="round"/>'
        if stock
        else ''
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">'
        '<defs>'
        f'<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>'
        '<linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
        '<clipPath id="c"><rect width="128" height="128" rx="36"/></clipPath>'
        '</defs>'
        '<g clip-path="url(#c)">'
        '<rect width="128" height="128" fill="url(#g)"/>'
        '<rect width="128" height="80" fill="url(#h)"/>'
        f'{glyph}{badge}'
        '</g></svg>\n'
    )


def stock_logo(name: str, a: str, b: str, mark: str, icons: Path, font: TTFont) -> str:
    fill = LIGHT_TEXT if is_light(a) else '#fff'
    # Marks sit a little up and left of center so the badge doesn't cover them.
    cx, cy = 61, 60
    if mark == ':ring':
        r, w = 23, 12
        ex, ey = cx + r * 0.766, cy - r * 0.643  # 40 degrees above the x axis
        body = f'<path d="M{ex:.2f} {ey:.2f}A{r} {r} 0 1 0 {ex:.2f} {2 * cy - ey:.2f}" fill="none" stroke="currentColor" stroke-width="{w}"/>'
    elif mark.isupper():
        d, w, h = ticker_path(font, mark, 72)
        body = f'<path transform="translate({cx - w / 2:.2f} {cy - h / 2:.2f})" d="{d}"/>'
    else:
        d = icon_path((icons / f'{mark}.svg').read_text())
        size = 54
        body = f'<path transform="translate({cx - size / 2:.2f} {cy - size / 2:.2f}) scale({size / 24:.4f})" d="{d}"/>'
    return tile(
        a,
        b,
        f'<g transform="translate(0 2)" fill="#000" color="#000" opacity=".22">{body}</g><g fill="{fill}" color="{fill}">{body}</g>',
        stock=True,
    )


def sol_logo(icons: Path) -> str:
    d = icon_path((icons / 'solana.svg').read_text())
    size = 64
    o = (128 - size) / 2
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">'
        '<defs><linearGradient id="s" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#9945FF"/><stop offset="1" stop-color="#14F195"/></linearGradient></defs>'
        '<circle cx="64" cy="64" r="64" fill="#0B0B14"/>'
        f'<path fill="url(#s)" transform="translate({o} {o}) scale({size / 24:.4f})" d="{d}"/>'
        '</svg>\n'
    )


def usdc_logo(crypto: Path) -> str:
    svg = (crypto / 'usdc.svg').read_text()
    # Same mark, in USDC's current blue.
    return svg.replace('#3E73C4', '#2775CA').replace('width="32" height="32"', 'width="128" height="128"').rstrip() + '\n'


def disc(code: str, a: str, b: str, emoji_dir: Path) -> bytes:
    S = 4  # supersample, then downscale for smooth edges
    N = 128 * S
    files = sorted(emoji_dir.glob(f'{code}.webp')) or sorted(emoji_dir.glob(f'{code}-fe0f.webp'))
    emoji = Image.open(files[0]).convert('RGBA')

    def rgb(h):
        n = int(h[1:], 16)
        return ((n >> 16) & 255, (n >> 8) & 255, n & 255)

    ca, cb = rgb(a), rgb(b)
    bg = Image.new('RGBA', (N, N))
    px = bg.load()
    cx, cy = N * 0.36, N * 0.3
    for yy in range(N):
        for xx in range(N):
            t = min(1.0, ((xx - cx) ** 2 + (yy - cy) ** 2) ** 0.5 / (N * 0.85))
            px[xx, yy] = tuple(round(ca[i] + (cb[i] - ca[i]) * t) for i in range(3)) + (255,)
    mask = Image.new('L', (N, N), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, N - 1, N - 1), fill=255)

    size = int(N * 0.72)
    em = emoji.resize((size, size), Image.LANCZOS)
    ex, ey = (N - size) // 2, (N - size) // 2 + 4 * S
    shadow = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    sh = Image.new('RGBA', em.size, (0, 0, 0, 255))
    sh.putalpha(em.getchannel('A').point(lambda v: v * 0.35))
    shadow.paste(sh, (ex, ey + 6 * S), sh)
    shadow = shadow.filter(ImageFilter.GaussianBlur(5 * S))
    out = Image.alpha_composite(bg, shadow)
    out.alpha_composite(em, (ex, ey))
    out.putalpha(mask)
    # 128px covers the largest avatar at 2x; a 256-color palette keeps each file around 5 KB.
    out = out.resize((128, 128), Image.LANCZOS)
    out = out.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
    buf = io.BytesIO()
    out.save(buf, 'PNG', optimize=True)
    return buf.getvalue()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--simple-icons', type=Path, required=True)
    ap.add_argument('--crypto-icons', type=Path, required=True)
    ap.add_argument('--fluent-3d', type=Path, required=True)
    ap.add_argument('--geist', type=Path, required=True)
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    font = TTFont(args.geist)
    for name, (a, b, mark) in STOCKS.items():
        (OUT / f'{name}.svg').write_text(stock_logo(name, a, b, mark, args.simple_icons, font))
    (OUT / 'sol.svg').write_text(sol_logo(args.simple_icons))
    (OUT / 'usdc.svg').write_text(usdc_logo(args.crypto_icons))
    for name, (code, a, b) in MEMES.items():
        (OUT / f'{name}.png').write_bytes(disc(code, a, b, args.fluent_3d))
    print('wrote', len(list(OUT.iterdir())), 'files to', OUT)


if __name__ == '__main__':
    main()
