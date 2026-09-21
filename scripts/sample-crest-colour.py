#!/usr/bin/env python3
"""
Read a house's colour out of its crest.

Each shield is a black field carrying a coloured helm, so a naive
dominant-colour pass returns black. This one ignores the transparent
background, the near-black field and any near-white highlight, quantises what
is left so anti-aliased edges collapse onto the true colour, takes the most
common bucket, then averages the pixels inside it.

    python3 scripts/sample-crest-colour.py <crest.png>   →  #RRGGBB

This exists because the house colours were once wrong — all four rotated,
invented before anyone had seen the artwork. Reading them from the artwork
removes the chance to guess.
"""
import sys
from collections import Counter
from PIL import Image


def main() -> None:
    image = Image.open(sys.argv[1]).convert('RGBA')

    candidates = [
        (r, g, b)
        for r, g, b, a in image.getdata()
        if a > 220 and max(r, g, b) > 70 and not (r > 235 and g > 235 and b > 235)
    ]
    if not candidates:
        print('')  # nothing usable; the caller keeps the declared colour
        return

    buckets = Counter(
        ((r // 16) * 16 + 8, (g // 16) * 16 + 8, (b // 16) * 16 + 8) for r, g, b in candidates
    )
    (br, bg, bb), _ = buckets.most_common(1)[0]

    inside = [
        (r, g, b)
        for r, g, b in candidates
        if abs(r - br) < 16 and abs(g - bg) < 16 and abs(b - bb) < 16
    ]
    n = len(inside)
    print('#%02X%02X%02X' % (
        round(sum(p[0] for p in inside) / n),
        round(sum(p[1] for p in inside) / n),
        round(sum(p[2] for p in inside) / n),
    ))


if __name__ == '__main__':
    main()
