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


RED = '#EA4335'
FOLD = '<path d="M6.2 0H7.4L9 1.6V2.8H6.2Z" fill="#fff" opacity=".75"/>'
FILES = {  # width, height, drawing from the origin
    'doc': (9, 11, f'<rect width="9" height="11" rx="1.6" fill="{BLUE}"/>{FOLD}'
                   '<path d="M2 5h5M2 7.2h5M2 9.4h3.2" stroke="#fff" stroke-width="1" stroke-linecap="round"/>'),
    'sheet': (9, 11, f'<rect width="9" height="11" rx="1.6" fill="{GREEN}"/>{FOLD}'
                     '<rect x="2" y="4.4" width="5" height="4.8" rx=".5" fill="none" stroke="#fff" stroke-width=".9"/>'
                     '<path d="M4.5 4.4v4.8M2 6.8h5" stroke="#fff" stroke-width=".9"/>'),
    'photo': (12, 9.5, '<rect width="12" height="9.5" rx="1.6" fill="#fff" stroke="#1F2A37" stroke-opacity=".15" stroke-width=".5"/>'
                       '<rect x="1" y="1" width="10" height="7.5" rx="1" fill="#8AB8FF"/>'
                       f'<circle cx="8.3" cy="3.3" r="1.2" fill="{YELLOW}"/>'
                       f'<path d="M1 8.5V7l2.8-2.6 2.4 2.2 1.6-1.3L11 7.8v.7Z" fill="{GREEN}"/>'),
    'video': (9, 11, f'<rect width="9" height="11" rx="1.6" fill="{RED}"/>{FOLD}<path d="M3.2 4.6v4.2l3.6-2.1Z" fill="#fff"/>'),
}

# A 7 s loop: four files hop into the basket (landing at 0.7, 1.6, 2.5 and 3.4 s, from
# alternate sides), then the balloon smiles and climbs while the clouds rush past
LOADING_CSS = '''
.eye { transform-box: fill-box; transform-origin: center; animation: blink 4.2s infinite; }
.bob { animation: bob 2.6s ease-in-out infinite; }
.sway { transform-box: view-box; transform-origin: 100px 39px; animation: sway 5.2s ease-in-out infinite; }
.near { animation: near 7s linear infinite; }
.far { animation: far 7s linear infinite; }
.lift { animation: lift 7s infinite; }
.dip { animation: dip 7s infinite; }
.fx.L { animation: fly-left 7s linear infinite; }
.fx.R { animation: fly-right 7s linear infinite; }
.fy { animation: hop 7s infinite; }
.eyes-open { animation: open 7s infinite, glance 7s ease-in-out infinite; }
.eyes-happy { opacity: 0; animation: happy 7s infinite; }
@keyframes blink { 0%, 90%, 100% { transform: scaleY(1); } 93% { transform: scaleY(.12); } 96% { transform: scaleY(1); } }
@keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes sway { 0%, 100% { transform: rotate(-2.5deg); } 50% { transform: rotate(2.5deg); } }
@keyframes near { 0% { transform: translateY(0); } 55% { transform: translateY(66px); } 76% { transform: translateY(170px); } 100% { transform: translateY(200px); } }
@keyframes far { 0% { transform: translateY(0); } 55% { transform: translateY(33px); } 76% { transform: translateY(85px); } 100% { transform: translateY(100px); } }
@keyframes lift { 0%, 55% { transform: translateY(0); animation-timing-function: cubic-bezier(.3,.7,.4,1); } 66%, 76% { transform: translateY(-12px); animation-timing-function: cubic-bezier(.45,0,.55,1); } 100% { transform: translateY(0); } }
@keyframes dip { 0%, 10% { transform: translateY(0); } 11.43% { transform: translateY(3.5px); } 13.57% { transform: translateY(-1px); } 15.71%, 22.86% { transform: translateY(0); } 24.29% { transform: translateY(3.5px); } 26.43% { transform: translateY(-1px); } 28.57%, 35.71% { transform: translateY(0); } 37.14% { transform: translateY(3.5px); } 39.29% { transform: translateY(-1px); } 41.43%, 48.57% { transform: translateY(0); } 50% { transform: translateY(3.5px); } 52.14% { transform: translateY(-1px); } 54.29%, 100% { transform: translateY(0); } }
@keyframes fly-left { 0% { transform: translateX(-58px); opacity: 1; } 8.86% { opacity: 1; } 10%, 100% { transform: translateX(0); opacity: 0; } }
@keyframes fly-right { 0% { transform: translateX(58px); opacity: 1; } 8.86% { opacity: 1; } 10%, 100% { transform: translateX(0); opacity: 0; } }
@keyframes hop { 0% { transform: translateY(14px); animation-timing-function: cubic-bezier(.25,.6,.45,1); } 5% { transform: translateY(-13px); animation-timing-function: cubic-bezier(.55,0,.75,.45); } 10%, 100% { transform: translateY(0); } }
@keyframes open { 0%, 54% { opacity: 1; } 57%, 77% { opacity: 0; } 80%, 100% { opacity: 1; } }
@keyframes happy { 0%, 54% { opacity: 0; } 57%, 77% { opacity: 1; } 80%, 100% { opacity: 0; } }
@keyframes glance { 0%, 7% { transform: translateX(-1.4px); } 11% { transform: translateX(0); } 13%, 20% { transform: translateX(1.4px); } 24% { transform: translateX(0); } 26%, 33% { transform: translateX(-1.4px); } 37% { transform: translateX(0); } 39%, 46% { transform: translateX(1.4px); } 50%, 95% { transform: translateX(0); } 100% { transform: translateX(-1.4px); } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } .fx { opacity: 0; } }
'''
# Chrome doesn't pass "reduce motion" into an SVG shown as an image, so pages pick this
# still version themselves with <picture><source media="(prefers-reduced-motion: reduce)">
STILL_CSS = '.fx, .eyes-happy { opacity: 0; }'


def file_icon(name):
    w, h, body = FILES[name]
    return f'<g transform="translate({-w / 2:g} {-h / 2:g})">{body}</g>'


def cloud(x, y, s, opacity):
    return (f'<g transform="translate({x} {y}) scale({s})" fill="#fff" opacity="{opacity}">'
            '<circle cx="10" cy="10" r="10"/><circle cx="24" cy="6" r="13"/><circle cx="38" cy="11" r="9"/>'
            '<rect x="10" y="10" width="28" height="10"/></g>')


def loading_scene(theme, still=False):
    """The balloon in a round window of sky, packing files and climbing. Clouds come in two
    strips (near and far) that repeat every 200 and 100 px, so the loop has no seam."""
    dark = theme == 'dark'
    basket = '#C4C7C5' if dark else GREY
    sky = ('#1E293B', '#0B1220') if dark else ('#EEF5FF', '#CFE3FF')
    near_op, far_op = (.1, .06) if dark else (1, .6)
    stars = [(40, 12), (170, 40), (92, 70), (132, 8), (60, 90)] if dark else []
    near = lambda o: ''.join(cloud(x, y + o, s, near_op) for x, y, s in [(22, 28, .9), (124, 96, .72), (58, 158, .82)])
    far = lambda o: (''.join(cloud(x, y + o, s, far_op) for x, y, s in [(146, 18, .42), (18, 66, .38)])
                     + ''.join(f'<circle cx="{x}" cy="{y + o}" r=".9" fill="#fff" opacity=".55"/>' for x, y in stars))
    # The envelope and the basket move together; the flying files pass between them
    moving = lambda inner: (f'<g class="lift"><g class="bob"><g class="sway"><g class="dip">'
                            f'<g transform="translate(100 96) scale(1.3) translate(-64 -64)">{inner}</g></g></g></g></g>')
    eyes = ''.join(f'<g class="eye"><ellipse cx="{x}" cy="53" rx="3.6" ry="4.6" fill="{INK}"/>'
                   f'<circle cx="{x + 1.1:g}" cy="51.4" r="1.3" fill="#fff"/></g>' for x in (54.5, 73.5))
    face = (f'<g class="eyes-open">{eyes}</g>'
            f'<g class="eyes-happy"><path d="M50 55c2.5-3.5 6.5-3.5 9 0M69 55c2.5-3.5 6.5-3.5 9 0" fill="none" stroke="{INK}" stroke-width="3.6" stroke-linecap="round"/></g>'
            f'<path d="M59.5 61c2.6 2.8 6.4 2.8 9 0" fill="none" stroke="{INK}" stroke-width="3.2" stroke-linecap="round"/>'
            f'<ellipse cx="46" cy="61" rx="5" ry="3.2" fill="{CHEEK}" opacity=".75"/><ellipse cx="82" cy="61" rx="5" ry="3.2" fill="{CHEEK}" opacity=".75"/>')
    envelope = (f'<path d="{ENVELOPE}" fill="{YELLOW}"/><path d="{LEFT_HALF}" fill="{BLUE}"/><path d="{CENTRE}" fill="{GREEN}"/>'
                f'<path d="M56 89 58 97M72 89 70 97" stroke="{basket}" stroke-width="3.5" stroke-linecap="round"/>{face}')
    # Negative delays start each file part-way through the loop, so they leave 0.9 s apart
    flights = [('L', 'doc', 0), ('R', 'sheet', -6.1), ('L', 'photo', -5.2), ('R', 'video', -4.3)]
    files = ''.join(f'<g transform="translate(100 146.5) scale(1.55)"><g class="fx {side}" style="animation-delay:{d}s">'
                    f'<g class="fy" style="animation-delay:{d}s">{file_icon(name)}</g></g></g>' for side, name, d in flights)
    packed = (f'<g transform="translate(59.5 93) rotate(-14) scale(.85)">{file_icon("sheet")}</g>'
              f'<g transform="translate(69 93) rotate(13) scale(.85)">{file_icon("video")}</g>'
              f'<g transform="translate(64.5 93.5) rotate(4) scale(.85)">{file_icon("photo")}</g>'
              f'<rect x="55" y="96" width="18" height="13" rx="3.5" fill="{basket}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><style>{STILL_CSS if still else LOADING_CSS}</style>'
            '<defs><clipPath id="window"><circle cx="100" cy="100" r="84"/></clipPath>'
            f'<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{sky[0]}"/><stop offset="1" stop-color="{sky[1]}"/></linearGradient></defs>'
            '<circle cx="100" cy="100" r="84" fill="url(#sky)"/>'
            f'<g clip-path="url(#window)"><g class="far">{far(-100)}{far(0)}{far(100)}</g><g class="near">{near(-200)}{near(0)}</g></g>'
            f'{moving(envelope)}<g clip-path="url(#window)">{files}</g>{moving(packed)}</svg>')


SRC.mkdir(exist_ok=True)
(SRC / 'icon-128.svg').write_text(tile_icon('sky'))
(SRC / 'icon-48.svg').write_text(tile_icon('sky', viewbox='12 12 104 104'))
(SRC / 'icon-32.svg').write_text(small_icon())
(SRC / 'icon-16.svg').write_text(small_icon(with_face=False))
(ICONS / 'logo-light.svg').write_text(tile_icon('white', viewbox='12 12 104 104'))
(ICONS / 'logo-dark.svg').write_text(tile_icon('night', viewbox='12 12 104 104'))
for mood in ('carry', 'wait', 'done'):
    (ICONS / f'balloon-{mood}.svg').write_text(bare(mood))
(ICONS / 'balloon-loading.svg').write_text(loading_scene('light'))
(ICONS / 'balloon-loading-dark.svg').write_text(loading_scene('dark'))
(ICONS / 'balloon-loading-still.svg').write_text(loading_scene('light', still=True))
(ICONS / 'balloon-loading-still-dark.svg').write_text(loading_scene('dark', still=True))
print('written')
