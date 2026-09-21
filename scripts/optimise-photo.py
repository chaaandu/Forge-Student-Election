#!/usr/bin/env python3
"""
Crop and compress a candidate photograph for the ballot.

The card shows the photo in a fixed-height box that changes width with the
number of candidates, so the source is cover-cropped to a single size rather
than letterboxed. The crop is biased UP: faces sit high in a portrait, and a
centre crop cuts foreheads.

    python3 scripts/optimise-photo.py <src> <dest.jpg> [width] [height]
"""
import sys
from PIL import Image, ImageOps

TARGET_W, TARGET_H = 600, 460
# 0.5 would centre the crop; faces sit above centre, so favour the top.
VERTICAL_ANCHOR = 0.32


def main() -> None:
    src, dest = sys.argv[1], sys.argv[2]
    width = int(sys.argv[3]) if len(sys.argv) > 3 else TARGET_W
    height = int(sys.argv[4]) if len(sys.argv) > 4 else TARGET_H

    image = Image.open(src)
    # Phone photos carry rotation in EXIF; without this some arrive sideways.
    image = ImageOps.exif_transpose(image)
    image = image.convert('RGB')

    ImageOps.fit(
        image,
        (width, height),
        method=Image.LANCZOS,
        centering=(0.5, VERTICAL_ANCHOR),
    ).save(dest, 'JPEG', quality=82, optimize=True, progressive=True)


if __name__ == '__main__':
    main()
