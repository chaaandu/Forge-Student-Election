#!/usr/bin/env python3
"""
Draw a placeholder house crest as a PNG.

Stands in until the real artwork is dropped into assets/house-logos/ and
imported. It deliberately mirrors the supplied shields — a coloured heraldic
outline, a black field, and the house's elementary form where the helm sits —
so the layout it occupies is the layout the real crest will occupy.

Rendered at 6x and downsampled, because Pillow's polygon fill has no
anti-aliasing of its own.

    python3 scripts/generate-crest-placeholder.py <out.png> <#hex> <shape> <size>
"""
import sys
from PIL import Image, ImageDraw

SS = 6  # supersample factor


def shield(w: float, h: float) -> list[tuple[float, float]]:
    """A heraldic shield: peaked top, straight shoulders, point at the foot."""
    pts: list[tuple[float, float]] = []
    x = lambda u: u * w / 100.0
    y = lambda v: v * h / 140.0

    # peaked top, left shoulder to right shoulder
    pts += [(x(4), y(19)), (x(50), y(3)), (x(96), y(19))]
    # right side, straight then curving to the point
    pts.append((x(96), y(72)))
    for i in range(1, 41):
        t = i / 40
        # quadratic bezier: (96,72) → control (94,116) → (50,137)
        px = (1 - t) ** 2 * 96 + 2 * (1 - t) * t * 94 + t ** 2 * 50
        py = (1 - t) ** 2 * 72 + 2 * (1 - t) * t * 116 + t ** 2 * 137
        pts.append((x(px), y(py)))
    # left side, mirrored
    for i in range(40, -1, -1):
        t = i / 40
        px = (1 - t) ** 2 * 4 + 2 * (1 - t) * t * 6 + t ** 2 * 50
        py = (1 - t) ** 2 * 72 + 2 * (1 - t) * t * 116 + t ** 2 * 137
        pts.append((x(px), y(py)))
    pts.append((x(4), y(72)))
    return pts


def scaled(pts, cx, cy, factor):
    return [(cx + (px - cx) * factor, cy + (py - cy) * factor) for px, py in pts]


def draw_form(d: ImageDraw.ImageDraw, shape: str, cx: float, cy: float, r: float, colour):
    if shape == 'circle':
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=colour)
    elif shape == 'square':
        s = r * 0.90
        d.rectangle([cx - s, cy - s, cx + s, cy + s], fill=colour)
    elif shape == 'triangle':
        d.polygon([(cx, cy - r), (cx + r * 0.97, cy + r * 0.86), (cx - r * 0.97, cy + r * 0.86)], fill=colour)
    elif shape == 'arc':
        d.pieslice([cx - r, cy - r, cx + r, cy + r], start=180, end=360, fill=colour)


def main() -> None:
    out, hex_colour, shape, size = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
    colour = tuple(int(hex_colour.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)) + (255,)

    w, h = size, round(size * 1.4)
    img = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    outline = shield(w * SS, h * SS)
    cx, cy = w * SS / 2, h * SS / 2

    d.polygon(outline, fill=colour)                                   # coloured border
    d.polygon(scaled(outline, cx, cy, 0.885), fill=(14, 14, 14, 255)) # black field
    draw_form(d, shape, cx, h * SS * 0.487, w * SS * 0.30, colour)    # the helm's place

    img.resize((w, h), Image.LANCZOS).save(out, 'PNG', optimize=True)


if __name__ == '__main__':
    main()
