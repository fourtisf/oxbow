#!/usr/bin/env python3
"""
Copies wallet logos into apps/web/public/wallets/ from official sources:

  - The icon each wallet ships in its @solana/wallet-adapter-<name> package
    (the same image wallet pickers across Solana show), saved unchanged.
    Trust's icon is a wide canvas with a wordmark, so only its shield is kept,
    on the white tile Trust uses for its app icon.
  - OKX has no adapter package: its mark comes from simple-icons (CC0), on
    the black tile OKX uses.

Usage: unpack the npm tarballs of the adapters listed in ADAPTERS into
<adapters>/<name>/package, then
  python3 scripts/wallet-logos.py <adapters> <simple-icons>/package/icons
"""
import base64
import re
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'apps/web/public/wallets'
ADAPTERS = ['phantom', 'solflare', 'backpack', 'bitkeep', 'coinbase', 'trust', 'magiceden', 'exodus', 'ledger', 'nightly', 'coin98', 'tokenpocket']
FILE_NAME = {'bitkeep': 'bitget'}  # the BitKeep adapter is Bitget Wallet now


def adapter_icon(pkg: Path) -> tuple[bytes, str]:
    src = ''.join(f.read_text() for f in sorted((pkg / 'lib/esm').glob('*.js')))
    m = re.search(r"icon = '(data:image/(svg\+xml|png);base64,([A-Za-z0-9+/=]+))'", src)
    if not m:
        raise SystemExit(f'no icon in {pkg}')
    return base64.b64decode(m.group(3)), 'svg' if 'svg' in m.group(2) else 'png'


def trust_tile(svg: str) -> str:
    """The shield (two halves, x 739-1181, y 351-852 in Trust's 1920x1080 canvas) on a white tile."""
    defs = re.search(r'<defs>.*?</defs>', svg, re.S).group(0)
    shield = ''.join(re.findall(r'<path[^>]*/>', svg)[:2])
    s = 84 / 501
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">{defs}'
            '<rect width="128" height="128" rx="28" fill="#fff"/>'
            f'<g transform="translate(64 64) scale({s:.5f}) translate(-960 -601.5)">{shield}</g></svg>\n')


def okx_tile(icons: Path) -> str:
    d = ' '.join(re.findall(r' d="([^"]+)"', (icons / 'okx.svg').read_text()))
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">'
            '<rect width="128" height="128" rx="28" fill="#000"/>'
            f'<path fill="#fff" transform="translate(14 14) scale(4.1667)" d="{d}"/></svg>\n')


def main():
    adapters, icons = Path(sys.argv[1]), Path(sys.argv[2])
    OUT.mkdir(parents=True, exist_ok=True)
    for name in ADAPTERS:
        data, ext = adapter_icon(adapters / name / 'package')
        out = FILE_NAME.get(name, name)
        if name == 'trust':
            (OUT / f'{out}.svg').write_text(trust_tile(data.decode()))
        else:
            (OUT / f'{out}.{ext}').write_bytes(data)
    (OUT / 'okx.svg').write_text(okx_tile(icons))
    print('wrote', sorted(p.name for p in OUT.iterdir()))


if __name__ == '__main__':
    main()
