#!/usr/bin/env python3
"""
Builds the token logos in apps/web/public/tokens/ for the sample data.

Real tokens get their logo from on-chain metadata (the token lookup); these
files only exist so every sample token shows a logo. All logos are SVG and
share one design system: a two-tone gradient base with a soft light, a thin
inner edge, and a flat white mark (secondary parts at lower opacity).

  - Stock tokens: the company's mark from simple-icons (CC0) on a rounded
    brand tile with the "x" badge for tokenized stocks. SPY and QQQ have no
    mark there, so they get their ticker set in Geist Bold; Coinbase gets a
    plain "C" ring (simple-icons only has its wordmark).
  - SOL and USDC: their own marks (simple-icons, cryptocurrency-icons, CC0).
  - Sample memecoins: original geometric marks drawn here, one per token.

Usage (needs fontTools; package folders are unpacked npm tarballs):

  python3 scripts/token-logos.py \
    --simple-icons <simple-icons>/package/icons \
    --crypto-icons <cryptocurrency-icons>/package/svg/color \
    --geist apps/web/node_modules/geist/dist/fonts/geist-sans/Geist-Bold.ttf
"""
import argparse
import math
import re
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

OUT = Path(__file__).resolve().parent.parent / 'apps/web/public/tokens'

# Brand tiles: same hues as the sample data's brand avatars (seed.ts BRAND).
STOCKS = {
    'tslax': ('#F0373D', '#7A0F16', 'tesla'),
    'nvdax': ('#86C928', '#2B5205', 'nvidia'),
    'aaplx': ('#F4F6F8', '#A3ADB8', 'apple'),
    'metax': ('#3B8BFF', '#0B2F8A', 'meta'),
    'coinx': ('#3D7BFF', '#0A2A8C', ':ring'),
    'mstrx': ('#FF9D42', '#8A3600', 'microstrategy'),
    'spyx': ('#5372F0', '#16226A', 'SPY'),
    'qqqx': ('#34C6F0', '#0B4F82', 'QQQ'),
}

LIGHT_TEXT = '#1A222D'


def icon_path(svg_src: str) -> str:
    return ' '.join(re.findall(r' d="([^"]+)"', svg_src))


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


def svg(body: str, defs: str = '') -> str:
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128"><defs>{defs}</defs>{body}</svg>\n'


def frame(a: str, b: str, shape: str, mark: str) -> tuple[str, str]:
    """Shared base: gradient fill, soft top-left light, darker bottom-right, thin inner edge."""
    defs = (
        f'<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>'
        '<radialGradient id="lt" cx=".28" cy=".18" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>'
        '<radialGradient id="dk" cx=".85" cy="1" r=".7"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>'
    )
    if shape == 'circle':
        fill = '<circle cx="64" cy="64" r="64" fill="url(#{})"/>'
        edge = '<circle cx="64" cy="64" r="63.2" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="1.6"/>'
    else:
        fill = '<rect width="128" height="128" rx="32" fill="url(#{})"/>'
        edge = '<rect x=".8" y=".8" width="126.4" height="126.4" rx="31.2" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="1.6"/>'
    return defs, ''.join(fill.format(i) for i in ('bg', 'lt', 'dk')) + mark + edge


def badge() -> str:
    return (
        '<circle cx="107" cy="107" r="13" fill="#0A0F1A" stroke="#fff" stroke-opacity=".85" stroke-width="2"/>'
        '<path d="M102.8 102.8l8.4 8.4M111.2 102.8l-8.4 8.4" stroke="#fff" stroke-width="3" stroke-linecap="round"/>'
    )


def stock_logo(a: str, b: str, mark: str, icons: Path, font: TTFont) -> str:
    fill = LIGHT_TEXT if is_light(a) else '#fff'
    # Marks sit a little up and left of center so the badge doesn't cover them.
    cx, cy = 60, 59
    if mark == ':ring':
        r, w = 22, 12
        ex, ey = cx + r * 0.766, cy - r * 0.643  # 40 degrees above the x axis
        glyph = f'<path d="M{ex:.2f} {ey:.2f}A{r} {r} 0 1 0 {ex:.2f} {2 * cy - ey:.2f}" fill="none" stroke="{fill}" stroke-width="{w}"/>'
    elif mark.isupper():
        d, gw, gh = ticker_path(font, mark, 70)
        glyph = f'<path fill="{fill}" transform="translate({cx - gw / 2:.2f} {cy - gh / 2:.2f})" d="{d}"/>'
    else:
        d = icon_path((icons / f'{mark}.svg').read_text())
        size = 52
        glyph = f'<path fill="{fill}" transform="translate({cx - size / 2:.2f} {cy - size / 2:.2f}) scale({size / 24:.4f})" d="{d}"/>'
    defs, body = frame(a, b, 'square', glyph)
    return svg(body + badge(), defs)


def sol_logo(icons: Path) -> str:
    d = icon_path((icons / 'solana.svg').read_text())
    size = 62
    o = (128 - size) / 2
    defs = (
        '<linearGradient id="s" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#9945FF"/><stop offset="1" stop-color="#14F195"/></linearGradient>'
        '<radialGradient id="lt" cx=".28" cy=".18" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>'
    )
    body = (
        '<circle cx="64" cy="64" r="64" fill="#0B0B14"/><circle cx="64" cy="64" r="64" fill="url(#lt)"/>'
        f'<path fill="url(#s)" transform="translate({o} {o}) scale({size / 24:.4f})" d="{d}"/>'
        '<circle cx="64" cy="64" r="63.2" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="1.6"/>'
    )
    return svg(body, defs)


def usdc_logo(crypto: Path) -> str:
    src = (crypto / 'usdc.svg').read_text()
    paths = ''.join(re.findall(r'<path[^>]*/>', src))
    body = f'<g transform="scale(4)"><circle cx="16" cy="16" r="16" fill="#2775CA"/><g fill="#fff">{paths}</g></g>'
    return svg(body + '<circle cx="64" cy="64" r="63.2" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="1.6"/>')


# --- Sample memecoin marks ---------------------------------------------------------------


def soft(o: float) -> str:
    return f'fill="#fff" fill-opacity="{o}"'


def star4(cx: float, cy: float, r: float, attrs: str) -> str:
    """Four-point sparkle with concave sides."""
    k = r * 0.22
    return (
        f'<path {attrs} d="M{cx} {cy - r}C{cx + k * .5:.2f} {cy - k:.2f} {cx + k:.2f} {cy - k * .5:.2f} {cx + r} {cy}'
        f'C{cx + k:.2f} {cy + k * .5:.2f} {cx + k * .5:.2f} {cy + k:.2f} {cx} {cy + r}'
        f'C{cx - k * .5:.2f} {cy + k:.2f} {cx - k:.2f} {cy + k * .5:.2f} {cx - r} {cy}'
        f'C{cx - k:.2f} {cy - k * .5:.2f} {cx - k * .5:.2f} {cy - k:.2f} {cx} {cy - r}Z"/>'
    )


def blob(cx: float, cy: float, r: float, wobble: float, lobes: int, turn: float, attrs: str) -> str:
    """A smooth wobbly circle: radius r +/- wobble with `lobes` bumps, as a closed Catmull-Rom curve."""
    n = lobes * 4
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n + turn
        rr = r + wobble * math.sin(lobes * (t - turn))
        pts.append((cx + rr * math.cos(t), cy + rr * math.sin(t)))
    d = f'M{pts[0][0]:.2f} {pts[0][1]:.2f}'
    for i in range(n):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f'C{c1[0]:.2f} {c1[1]:.2f} {c2[0]:.2f} {c2[1]:.2f} {p2[0]:.2f} {p2[1]:.2f}'
    return f'<path {attrs} d="{d}Z"/>'


def cutout(mid: str, holes: str) -> str:
    """A mask that removes `holes` (drawn in black) from whatever uses it."""
    return f'<mask id="{mid}"><rect width="128" height="128" fill="#fff"/>{holes}</mask>'


# name: (light color, deep color, mark, extra defs)
MEMES: dict[str, tuple[str, str, str, str]] = {
    # Three dango on a skewer.
    'mochi': ('#FF8FD1', '#6D35E8',
              '<path d="M30 98L98 30" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>'
              f'<circle cx="45.5" cy="82.5" r="13" {soft(.7)}/><circle cx="64" cy="64" r="13" {soft(.85)}/><circle cx="82.5" cy="45.5" r="13" fill="#fff"/>',
              ''),
    # A planet with cat ears and a moon on its orbit.
    'orbit': ('#7C8CFF', '#1C2580',
              '<circle cx="64" cy="66" r="34" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="5" stroke-dasharray="150 64" stroke-linecap="round" transform="rotate(-150 64 66)"/>'
              '<path d="M47 56L49 38L60 49Z M81 56L79 38L68 49Z" fill="#fff" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>'
              '<circle cx="64" cy="66" r="19" fill="#fff"/><circle cx="96" cy="44" r="6" fill="#fff"/>',
              ''),
    # A bullet-train nose with speed lines.
    'gravy': ('#FFC24D', '#C2410C',
              f'<rect x="26" y="48" width="22" height="7" rx="3.5" {soft(.5)}/><rect x="20" y="60.5" width="28" height="7" rx="3.5" {soft(.75)}/><rect x="26" y="73" width="22" height="7" rx="3.5" {soft(.5)}/>'
              '<path mask="url(#win)" d="M54 44H80C93 44 104 53 104 64C104 75 93 84 80 84H54Z" fill="#fff"/>',
              cutout('win', '<rect x="74" y="54" width="18" height="10" rx="5" fill="#000"/>')),
    # A paw drawn in pixels.
    'pixel': ('#3BE8C8', '#0A6E58',
              '<rect x="30" y="48" width="15" height="15" rx="3.5" fill="#fff"/><rect x="47" y="34" width="15" height="15" rx="3.5" fill="#fff"/>'
              '<rect x="66" y="34" width="15" height="15" rx="3.5" fill="#fff"/><rect x="83" y="48" width="15" height="15" rx="3.5" fill="#fff"/>'
              f'<rect x="44" y="66" width="40" height="28" rx="6" fill="#fff"/><rect x="55" y="96" width="18" height="6" rx="3" {soft(.55)}/>',
              ''),
    # A bowl with noodles lifted on chopsticks.
    'noodl': ('#FFA056', '#D6283A',
              '<path d="M70 26L92 52M80 22L98 48" stroke="#fff" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/>'
              '<path d="M52 66C52 54 60 54 60 44M64 66C64 54 72 54 72 44M76 66C76 56 82 56 84 50" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>'
              '<path d="M28 66H100C100 84 84 98 64 98C44 98 28 84 28 66Z" fill="#fff"/>',
              ''),
    # Two koi chasing each other.
    'koi': ('#FF8A5C', '#C81E3A',
            '<path d="M64 30A34 34 0 0 1 64 98A17 17 0 0 1 64 64A17 17 0 0 0 64 30Z" fill="#fff"/>'
            f'<path d="M64 30A34 34 0 0 0 64 98A17 17 0 0 0 64 64A17 17 0 0 1 64 30Z" {soft(.45)}/>'
            '<circle cx="64" cy="47" r="4.5" fill="#000" fill-opacity=".35"/><circle cx="64" cy="81" r="4.5" fill="#fff"/>',
            ''),
    # A citrus slice.
    'zest': ('#D9F45E', '#22994A',
             '<circle cx="64" cy="64" r="35" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="5"/>'
             '<circle cx="64" cy="64" r="27" fill="#fff" mask="url(#seg)"/>',
             cutout('seg', '<g stroke="#000" stroke-width="4.5"><path d="M64 34V94"/><path d="M38 49L90 79"/><path d="M38 79L90 49"/></g><circle cx="64" cy="64" r="4" fill="#000"/>')),
    # A pair of tusks.
    'tusk': ('#C3B4FF', '#45359A',
             '<path d="M42 34Q34 80 60 96Q48 74 55 34Z" fill="#fff"/>'
             f'<path d="M86 34Q94 80 68 96Q80 74 73 34Z" {soft(.6)}/>',
             ''),
    # Foam bubbles.
    'froth': ('#FFE37A', '#E08A14',
              f'<circle cx="52" cy="72" r="19" fill="#fff"/><circle cx="77" cy="60" r="14" {soft(.8)}/>'
              f'<circle cx="74" cy="86" r="10" {soft(.6)}/><circle cx="44" cy="44" r="8" {soft(.55)}/><circle cx="86" cy="36" r="6" {soft(.4)}/>',
              ''),
    # A spark.
    'sprk': ('#FF6BB5', '#7E22CE', star4(58, 68, 32, 'fill="#fff"') + star4(90, 38, 11, soft(.7)), ''),
    # A head with a halo.
    'halo': ('#86D8FF', '#2457E0',
             '<ellipse cx="64" cy="38" rx="23" ry="8" fill="none" stroke="#fff" stroke-width="5.5"/>'
             '<circle cx="64" cy="76" r="22" fill="#fff"/>',
             ''),
    # A stack of bills.
    'brrr': ('#5BE38E', '#04704C',
             f'<g transform="rotate(-12 64 64)"><rect x="34" y="62" width="60" height="34" rx="6" {soft(.3)}/>'
             f'<rect x="34" y="51" width="60" height="34" rx="6" {soft(.55)}/>'
             '<rect x="34" y="40" width="60" height="34" rx="6" fill="#fff" mask="url(#bill)"/></g>',
             cutout('bill', '<circle cx="64" cy="57" r="8" fill="none" stroke="#000" stroke-width="3.5"/><circle cx="43" cy="49" r="2.5" fill="#000"/><circle cx="85" cy="65" r="2.5" fill="#000"/>')),
    # A crescent moon and a star.
    'lune': ('#6B7BFF', '#11144A',
             '<circle cx="60" cy="64" r="31" fill="#fff" mask="url(#cres)"/>' + star4(92, 82, 9, soft(.75)) + f'<circle cx="86" cy="40" r="3" {soft(.6)}/>',
             cutout('cres', '<circle cx="76" cy="53" r="27" fill="#000"/>')),
    # An otter face.
    'otter': ('#4ADCEB', '#0C6380',
              '<g mask="url(#face)"><circle cx="42" cy="46" r="9" fill="#fff"/><circle cx="86" cy="46" r="9" fill="#fff"/><circle cx="64" cy="68" r="30" fill="#fff"/></g>',
              cutout('face', '<circle cx="52" cy="62" r="4.5" fill="#000"/><circle cx="76" cy="62" r="4.5" fill="#000"/><ellipse cx="64" cy="75" rx="7" ry="5" fill="#000"/><path d="M64 80V86" stroke="#000" stroke-width="3" stroke-linecap="round"/>')),
    # A cookie with a bite out of it.
    'crumb': ('#F7C27A', '#93501A',
              '<circle cx="62" cy="66" r="32" fill="#fff" mask="url(#bite)"/>',
              cutout('bite', '<circle cx="92" cy="40" r="13" fill="#000"/><circle cx="98" cy="58" r="9" fill="#000"/>'
                             '<circle cx="50" cy="56" r="4.5" fill="#000"/><circle cx="66" cy="76" r="4.5" fill="#000"/><circle cx="48" cy="80" r="3.5" fill="#000"/><circle cx="72" cy="52" r="3" fill="#000"/><circle cx="80" cy="82" r="3" fill="#000"/>')),
    # A wobbling blob with its echo.
    'wobbl': ('#FF86A8', '#CE1F4C',
              blob(64, 64, 36, 3, 3, 0.6, 'fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="3.5"')
              + blob(64, 64, 26, 2.5, 3, 0, 'fill="#fff" mask="url(#shine)"'),
              cutout('shine', '<path d="M50 56C48 60 48 66 50 70" stroke="#000" stroke-width="4" stroke-linecap="round" fill="none"/>')),
    # A lightning bolt.
    'volt': ('#FFE14D', '#F26B0F',
             '<path d="M72 28L42 70H62L55 100L88 56H67Z" fill="#fff" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>',
             ''),
    # A bull's head.
    'chad': ('#FF7A66', '#B4161B',
             '<path d="M26 40C32 62 48 68 64 68C80 68 96 62 102 40C93 54 80 58 64 58C48 58 35 54 26 40Z" fill="#fff"/>'
             '<path d="M46 62H82L77 88C75 96 53 96 51 88Z" fill="#fff" mask="url(#snout)"/>',
             cutout('snout', '<circle cx="58" cy="84" r="3.5" fill="#000"/><circle cx="70" cy="84" r="3.5" fill="#000"/><circle cx="55" cy="70" r="3" fill="#000"/><circle cx="73" cy="70" r="3" fill="#000"/>')),
    # Stacked stones.
    'pebl': ('#A9C1D6', '#344A60',
             f'<ellipse cx="64" cy="86" rx="31" ry="11" {soft(.55)}/><ellipse cx="64" cy="67" rx="23" ry="9.5" {soft(.8)}/><ellipse cx="64" cy="50" rx="15" ry="7.5" fill="#fff"/>',
             ''),
    # Create's sample fixtures: a token with live authorities and a duplicate ticker.
    'risk': ('#FFB224', '#D42020',
             '<path d="M64 34L96 90H32Z" fill="#fff" stroke="#fff" stroke-width="10" stroke-linejoin="round" mask="url(#bang)"/>',
             cutout('bang', '<rect x="60.5" y="52" width="7" height="22" rx="3.5" fill="#000"/><circle cx="64" cy="82" r="4" fill="#000"/>')),
    'lune-copy': ('#A699D6', '#3A2F66',
                  '<circle cx="56" cy="66" r="29" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="3" stroke-dasharray="6 6"/>'
                  '<circle cx="66" cy="62" r="29" fill="#fff" mask="url(#cres)"/>',
                  cutout('cres', '<circle cx="82" cy="51" r="25" fill="#000"/>')),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--simple-icons', type=Path, required=True)
    ap.add_argument('--crypto-icons', type=Path, required=True)
    ap.add_argument('--geist', type=Path, required=True)
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    font = TTFont(args.geist)
    for name, (a, b, mark) in STOCKS.items():
        (OUT / f'{name}.svg').write_text(stock_logo(a, b, mark, args.simple_icons, font))
    (OUT / 'sol.svg').write_text(sol_logo(args.simple_icons))
    (OUT / 'usdc.svg').write_text(usdc_logo(args.crypto_icons))
    for name, (a, b, mark, extra) in MEMES.items():
        defs, body = frame(a, b, 'circle', mark)
        (OUT / f'{name}.svg').write_text(svg(body, defs + extra))
    print('wrote', len(STOCKS) + 2 + len(MEMES), 'logos to', OUT)


if __name__ == '__main__':
    main()
