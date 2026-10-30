# Writes the final Uploft icon sources (the Drive-colour balloon with little dot eyes)
import pathlib, sys

ICONS = pathlib.Path(sys.argv[1])  # the repo's icons/ folder
SRC = ICONS / 'src'

BLUE, GREEN, YELLOW = '#2684FC', '#00AC47', '#FFBA00'
INK = '#1F2A37'
CHEEK = '#FF7A93'
GREY = '#5F6368'

ENVELOPE = 'M64 20C43 20 30 35 30 52c0 16 13 26 24 36h20c11-10 24-20 24-36 0-17-13-32-34-32Z'
LEFT_HALF = 'M64 20C43 20 30 35 30 52c0 16 13 26 24 36h10V20Z'
CENTRE = 'M64 20C55 32 52 44 53 58c1 12 3 22 5 30h12c2-8 4-18 5-30 1-14-2-26-11-38Z'

TILE_GRADIENTS = {
    'sky': '<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EEF5FF"/><stop offset="1" stop-color="#CFE3FF"/></linearGradient>',
    'white': '<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F1F4F9"/></linearGradient>',
    'night': '<linearGradient id="tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1E293B"/><stop offset="1" stop-color="#0B1220"/></linearGradient>',
}
SHADOW = ('<filter id="sh" x="-25%" y="-25%" width="150%" height="150%">'
          '<feDropShadow dx="0" dy="1.5" stdDeviation="1.2" flood-color="#3c4043" flood-opacity=".30"/>'
          '<feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#3c4043" flood-opacity=".15"/></filter>')


def balloon(basket=GREY, small=False):
    rope_w = 5 if small else 3.5
    return (f'<path d="{ENVELOPE}" fill="{YELLOW}"/><path d="{LEFT_HALF}" fill="{BLUE}"/><path d="{CENTRE}" fill="{GREEN}"/>'
            f'<path d="M56 89 58 97M72 89 70 97" stroke="{basket}" stroke-width="{rope_w}" stroke-linecap="round"/>'
            f'<rect x="55" y="96" width="18" height="13" rx="3.5" fill="{basket}"/>')


def face(mood='carry', small=False):
    if small:
        # 16 and 32 px: just the eyes, bigger, so they survive the size
        return (f'<ellipse cx="54" cy="53" rx="5" ry="6.5" fill="{INK}"/><ellipse cx="74" cy="53" rx="5" ry="6.5" fill="{INK}"/>')
    cheeks = (f'<ellipse cx="46" cy="61" rx="5" ry="3.2" fill="{CHEEK}" opacity=".75"/>'
              f'<ellipse cx="82" cy="61" rx="5" ry="3.2" fill="{CHEEK}" opacity=".75"/>')
    if mood == 'wait':
        return (f'<path d="M50 54c2.5 2.5 6.5 2.5 9 0M69 54c2.5 2.5 6.5 2.5 9 0" fill="none" stroke="{INK}" stroke-width="3.6" stroke-linecap="round"/>'
                f'<ellipse cx="64" cy="64" rx="3.4" ry="2.6" fill="{INK}"/>' + cheeks)
    if mood == 'done':
        return (f'<path d="M50 55c2.5-3.5 6.5-3.5 9 0M69 55c2.5-3.5 6.5-3.5 9 0" fill="none" stroke="{INK}" stroke-width="3.6" stroke-linecap="round"/>'
                f'<path d="M57 61.5c4 6 10 6 14 0Z" fill="{INK}"/>' + cheeks)
    return (f'<ellipse cx="54.5" cy="53" rx="3.6" ry="4.6" fill="{INK}"/><ellipse cx="73.5" cy="53" rx="3.6" ry="4.6" fill="{INK}"/>'
            '<circle cx="55.6" cy="51.4" r="1.3" fill="#fff"/><circle cx="74.6" cy="51.4" r="1.3" fill="#fff"/>'
            f'<path d="M59.5 61c2.6 2.8 6.4 2.8 9 0" fill="none" stroke="{INK}" stroke-width="3.2" stroke-linecap="round"/>' + cheeks)


def tile_icon(tile='sky', viewbox='0 0 128 128', mood='carry'):
    """96 px tile with a 16 px margin (Chrome's guideline for the 128 px icon)."""
    basket = '#E3E5E8' if tile == 'night' else GREY
    # the artwork was drawn on a 112 px tile at (8, 8); fit it to the 96 px tile at (16, 16)
    art = f'<g transform="translate(16 16) scale(.857142857) translate(-8 -8)">{balloon(basket)}{face(mood)}</g>'
    stroke = ' stroke="#E3E5E8" stroke-width="1"' if tile == 'white' else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}"><defs>{SHADOW}{TILE_GRADIENTS[tile]}</defs>'
            f'<g filter="url(#sh)"><rect x="16" y="16" width="96" height="96" rx="22" fill="url(#tile)"{stroke}/></g>{art}</svg>')


def small_icon(with_face=True):
    """Toolbar sizes: the tile fills the square and the balloon is as big as it can be.
    At 16 px the eyes blur into a band, so that size has no face."""
    scale = '.126' if with_face else '.138'
    art = (f'<g transform="translate(8 8.6) scale({scale}) translate(-64 -64.5)">{balloon(GREY, small=True)}'
           f'{face(small=True) if with_face else ""}</g>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><defs>{TILE_GRADIENTS["sky"]}</defs>'
            f'<rect x=".5" y=".5" width="15" height="15" rx="3.6" fill="url(#tile)"/>{art}</svg>')


def bare(mood):
    """The balloon alone, no tile, for illustrations inside the app."""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="24 14 80 100">{balloon()}{face(mood)}'
            + ('<g font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-weight="800" fill="#9AA0A6">'
               '<text x="84" y="32" font-size="14">z</text><text x="94" y="23" font-size="10">z</text></g>' if mood == 'wait' else '')
            + (f'<circle cx="88" cy="99" r="11" fill="{GREEN}" stroke="#fff" stroke-width="3"/>'
               '<path d="M83 99l3.5 3.5 7-7" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>' if mood == 'done' else '')
            + '</svg>')


SRC.mkdir(exist_ok=True)
(SRC / 'icon-128.svg').write_text(tile_icon('sky'))
(SRC / 'icon-48.svg').write_text(tile_icon('sky', viewbox='12 12 104 104'))
(SRC / 'icon-32.svg').write_text(small_icon())
(SRC / 'icon-16.svg').write_text(small_icon(with_face=False))
(ICONS / 'logo-light.svg').write_text(tile_icon('white', viewbox='12 12 104 104'))
(ICONS / 'logo-dark.svg').write_text(tile_icon('night', viewbox='12 12 104 104'))
for mood in ('carry', 'wait', 'done'):
    (ICONS / f'balloon-{mood}.svg').write_text(bare(mood))
print('written')
