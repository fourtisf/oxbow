#!/usr/bin/env python3
"""
Builds the Oxbow brand logo files (concept "Oxbow Lake": an O whose hole sits
off-center, like the crescent lake a river bend leaves behind).

Writes to apps/web/public/brand/:
  oxbow-icon.svg        app icon: navy tile with the mark (also src/app/icon.svg)
  oxbow-mark.svg        mark alone, for dark backgrounds
  oxbow-mark-light.svg  mark alone, for light backgrounds
  oxbow-logo.svg        mark + "oxbow" wordmark, for dark backgrounds
  oxbow-logo-light.svg  mark + wordmark, for light backgrounds
PNG sizes (apple icon, 192, 512) come from scripts/brand-png.mjs.

Usage (needs fontTools):
  python3 scripts/brand-logo.py apps/web/node_modules/geist/dist/fonts/geist-sans/Geist-SemiBold.ttf
"""
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'apps/web/public/brand'

NAVY = '#050A14'
DARK_STOPS = ('#EAF6FF', '#8FCBFF', '#3B7BFF')  # frost, ice, electric
LIGHT_STOPS = ('#7CC4FF', '#3F8CFF', '#1D47D6')
# Outer circle r42 at the center; the hole (r25) sits up and right of it.
MARK = 'M106 64A42 42 0 1 1 22 64A42 42 0 1 1 106 64ZM97 56A25 25 0 1 0 47 56A25 25 0 1 0 97 56Z'


def grad(gid: str, stops: tuple[str, str, str]) -> str:
    a, b, c = stops
    return (f'<linearGradient id="{gid}" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{a}"/>'
            f'<stop offset=".45" stop-color="{b}"/><stop offset="1" stop-color="{c}"/></linearGradient>')


def mark_path(gid: str) -> str:
    return f'<path fill-rule="evenodd" fill="url(#{gid})" d="{MARK}"/>'


def icon() -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128"><defs>'
        + grad('m', DARK_STOPS)
        + '<linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#132845"/><stop offset="1" stop-color="#060D19"/></linearGradient>'
        '<radialGradient id="l" cx=".3" cy=".1" r=".8"><stop offset="0" stop-color="#9FD2FF" stop-opacity=".22"/><stop offset="1" stop-color="#9FD2FF" stop-opacity="0"/></radialGradient></defs>'
        '<rect width="128" height="128" rx="30" fill="url(#t)"/><rect width="128" height="128" rx="30" fill="url(#l)"/>'
        f'<g transform="translate(13.44 13.44) scale(.79)">{mark_path("m")}</g>'
        '<rect x=".75" y=".75" width="126.5" height="126.5" rx="29.25" fill="none" stroke="#AAD7FF" stroke-opacity=".28" stroke-width="1.5"/></svg>\n'
    )


def mark(stops) -> str:
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="22 22 84 84" width="84" height="84"><defs>{grad("m", stops)}</defs>{mark_path("m")}</svg>\n'


def wordmark(font: TTFont, text: str, size: float, tracking: float = -0.04) -> tuple[str, float, float]:
    gs, cmap, upm = font.getGlyphSet(), font.getBestCmap(), font['head'].unitsPerEm
    asc = font['OS/2'].sTypoAscender
    s = size / upm
    pen = SVGPathPen(gs)
    x = 0.0
    for c in text:
        g = cmap[ord(c)]
        gs[g].draw(TransformPen(pen, (s, 0, 0, -s, x * s, asc * s)))
        x += gs[g].width + tracking * upm
    return pen.getCommands(), (x - tracking * upm) * s, asc * s


def logo(font: TTFont, stops, text_color: str) -> str:
    d, w, asc = wordmark(font, 'oxbow', 64)
    total = 96 + w + 4
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total:.0f} 96" width="{total:.0f}" height="96"><defs>{grad("m", stops)}</defs>'
        f'<g transform="translate(-6 -6) scale(.84)">{mark_path("m")}</g>'
        f'<path fill="{text_color}" transform="translate(96 {70 - asc:.2f})" d="{d}"/></svg>\n'
    )


def main():
    font = TTFont(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    files = {
        'oxbow-icon.svg': icon(),
        'oxbow-mark.svg': mark(DARK_STOPS),
        'oxbow-mark-light.svg': mark(LIGHT_STOPS),
        'oxbow-logo.svg': logo(font, DARK_STOPS, '#F1F6FF'),
        'oxbow-logo-light.svg': logo(font, LIGHT_STOPS, '#0B1220'),
    }
    for name, body in files.items():
        (OUT / name).write_text(body)
    (ROOT / 'apps/web/src/app/icon.svg').write_text(files['oxbow-icon.svg'])
    print('wrote', ', '.join(files))


if __name__ == '__main__':
    main()
