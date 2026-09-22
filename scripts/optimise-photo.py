#!/usr/bin/env python3
"""
Crop and compress a candidate photograph for the ballot.

The card shows the photo in a fixed-height box that changes width with the
number of candidates, so the source is cover-cropped to a single size rather
than letterboxed.

    python3 scripts/optimise-photo.py <src> <dest.jpg> [width] [height]
                                      [--anchor N]

── Sized from the FACE, placed from the TOP ──

The shoot is full-length: every candidate seated on a stool with a metre of
room above their head and another below their shoes. Cutting from a fixed
point in that frame is a lottery — a third of the way down (which this used to
do) took the top of the head off Sairaj, Akash, Archit and Rishika, because
they sat taller in the chair than the person the number was tuned on.

Two separate decisions, and they are made differently:

- **How big** the window is comes from the face: CROP_FACES face-widths wide.
  Measured in faces rather than pixels so someone shot from further back still
  lands at the scale everyone else is at — a row of faces at different sizes
  reads as a badly made collage even when each photo is fine on its own.

- **Where** it sits is the top of the photograph. Every pixel the source has
  above the head is kept and the surplus comes off the BOTTOM, which is floor,
  stool and shoes. Nothing is trimmed above a head that did not have to be, and
  no head can be cut: there is nothing above the top edge to cut it with.

The one thing that can push the window down is the shoulders. A photograph with
a very high ceiling can hold so much room above the subject that a window
pinned to the top edge would end at their chin, so the window drops by as much
as it takes to keep CHIN_FACES below the jaw and no further.

Detection is best-effort. Without OpenCV, without the model, or on a photo with
no findable face, this falls back to a plain top-aligned cover crop — the same
placement, minus the scaling that needs a face to measure.

--anchor forces that fallback and moves it through the source: 0 keeps the very
top of the photograph, 1 the very bottom. Use it for the one photo the detector
reads wrongly, not as the default path.
"""
from __future__ import annotations

import argparse
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageOps

TARGET_W, TARGET_H = 600, 460

# ── The framing, in face widths ──
#
# Measured in face widths rather than pixels so a photo shot from further back
# — or sent in from a phone — still lands at the scale everyone else is at. A
# card full of faces at different sizes reads as a badly made collage even when
# each photo is fine on its own.
#
# 6.0 puts head and shoulders in the frame with the background the shoot was
# composed for still visible either side. Lower it and the crop closes in on
# the face; raise it and the figure recedes.
#
# --faces overrides it for one photograph, which is what a detector's box being
# a measurement of the FACE and not of the person is for: Rishika's hair falls
# either side of her cheeks and the box comes back narrow, so 6 of those widths
# is a tighter crop of her than of anybody else. See the import's CROP_FACES.
CROP_FACES = 6.0
# How much of the body below the jaw has to stay in frame, in face HEIGHTS.
#
# The only reason to move the window off the top edge. 1.4 keeps both shoulders
# on a seated portrait; without it, a photograph with a tall ceiling above the
# subject spends its whole window on air and ends at the chin.
CHIN_FACES = 1.4

# Where the window sits in the source: 0 is the very top, 1 the very bottom.
# Used for the fallback crop, and as the placement the face-framed crop starts
# from before the shoulders get a say.
VERTICAL_ANCHOR = 0.0

# The detector: 230KB of ONNX, fetched once into the system temp dir. It is not
# vendored because it is only ever needed on the machine that imports photos,
# and a build with no network simply takes the fallback crop instead.
YUNET = Path(tempfile.gettempdir()) / 'yunet-face.onnx'
YUNET_URL = (
    'https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/'
    'face_detection_yunet/face_detection_yunet_2023mar.onnx'
)


def face_box(image: Image.Image) -> tuple[int, int, int, int] | None:
    """The largest face in the photo as (x, y, w, h), or None if there is none."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        return None

    if not YUNET.exists():
        try:
            subprocess.run(
                ['curl', '-sSL', '--max-time', '60', '-o', str(YUNET), YUNET_URL],
                check=True,
                capture_output=True,
            )
        except (subprocess.CalledProcessError, FileNotFoundError):
            YUNET.unlink(missing_ok=True)
            return None

    # Detection runs on a 1024px copy — the originals are 40MP, and a face is
    # no harder to find small. The box is scaled back up afterwards.
    scale = min(1.0, 1024 / max(image.size))
    small = image.resize((round(image.width * scale), round(image.height * scale)), Image.BILINEAR)
    frame = cv2.cvtColor(np.array(small), cv2.COLOR_RGB2BGR)

    try:
        model = cv2.FaceDetectorYN.create(str(YUNET), '', (320, 320), 0.6, 0.3, 5000)
        model.setInputSize((frame.shape[1], frame.shape[0]))
        _, faces = model.detect(frame)
    except cv2.error:
        return None
    if faces is None or len(faces) == 0:
        return None

    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])[:4]
    return round(x / scale), round(y / scale), round(w / scale), round(h / scale)


def framed(image: Image.Image, box, width: int, height: int, faces: float = CROP_FACES) -> Image.Image:
    """The output window placed around a face, in the source's own pixels."""
    x, y, w, h = box
    crop_w = w * faces
    crop_h = crop_w * height / width

    # A window wider or taller than the source shrinks to fit rather than
    # padding: bars would be the most conspicuous thing on the card. The face
    # then sits larger than everyone else's, which is the smaller fault.
    fit = min(image.width / crop_w, image.height / crop_h, 1.0)
    crop_w *= fit
    crop_h *= fit

    left = (x + w / 2) - crop_w / 2
    # The top of the photograph, and down from there only far enough to keep
    # the shoulders — see CHIN_FACES. The surplus comes off the bottom.
    top = max(0, (y + h + CHIN_FACES * h) - crop_h)
    left = max(0, min(left, image.width - crop_w))
    top = min(top, image.height - crop_h)

    return image.crop(
        (round(left), round(top), round(left + crop_w), round(top + crop_h))
    ).resize((width, height), Image.LANCZOS)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('src')
    parser.add_argument('dest')
    parser.add_argument('width', nargs='?', type=int, default=TARGET_W)
    parser.add_argument('height', nargs='?', type=int, default=TARGET_H)
    parser.add_argument('--anchor', type=float, default=None)
    parser.add_argument('--faces', type=float, default=CROP_FACES)
    args = parser.parse_args()

    image = Image.open(args.src)
    # Phone photos carry rotation in EXIF; without this some arrive sideways.
    image = ImageOps.exif_transpose(image)
    image = image.convert('RGB')

    box = None if args.anchor is not None else face_box(image)
    if box is None:
        shot = ImageOps.fit(
            image,
            (args.width, args.height),
            method=Image.LANCZOS,
            centering=(0.5, VERTICAL_ANCHOR if args.anchor is None else args.anchor),
        )
    else:
        shot = framed(image, box, args.width, args.height, args.faces)

    # No `exif=`: the camera, the time and any GPS stay out of what ships.
    shot.save(args.dest, 'JPEG', quality=82, optimize=True, progressive=True)


if __name__ == '__main__':
    main()
