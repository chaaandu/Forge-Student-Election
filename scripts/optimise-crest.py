#!/usr/bin/env python3
"""
Resize and optimise a house crest.

The supplied shields are 420x620 RGBA PNGs at roughly 200 KB each. They are
drawn at 20-64 px in the interface and about 68 px on the ballot sheet, so the
originals are wildly oversampled — and on the sheet they are inlined as data
URIs, where 200 KB each is 1 MB of document.

They are also flat artwork: a border, a black field and a helm. A 32-colour
palette is therefore visually lossless and roughly twenty times smaller.

    python3 scripts/optimise-crest.py <src> <dest> <width> [colours]
"""
import sys
from PIL import Image


def main() -> None:
    src, dest, width = sys.argv[1], sys.argv[2], int(sys.argv[3])
    colours = int(sys.argv[4]) if len(sys.argv) > 4 else 32

    image = Image.open(src).convert('RGBA')
    height = round(image.height * width / image.width)
    resized = image.resize((width, height), Image.LANCZOS)

    # FASTOCTREE keeps the alpha channel, which MEDIANCUT does not.
    resized.quantize(colors=colours, method=Image.FASTOCTREE).save(dest, 'PNG', optimize=True)


if __name__ == '__main__':
    main()
