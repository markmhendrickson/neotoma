#!/usr/bin/env python3
"""Make light/checkerboard background pixels fully transparent in PNGs."""
import sys
from pathlib import Path

from PIL import Image


def is_background(r: int, g: int, b: int, a: int) -> bool:
    """Treat very light or mid-light gray pixels as background (checkerboard)."""
    if a == 0:
        return True
    lum = (r + g + b) / 3
    # White and light gray (checkerboard tiles)
    if lum >= 200:
        return True
    # Common checkerboard gray
    if 170 <= lum < 200 and abs(r - g) < 25 and abs(g - b) < 25:
        return True
    return False


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: make_bg_transparent.py <png> [png ...]", file=sys.stderr)
        sys.exit(1)
    for path in sys.argv[1:]:
        p = Path(path)
        if not p.suffix.lower() == ".png":
            continue
        img = Image.open(p).convert("RGBA")
        data = list(img.getdata())
        out = [
            (r, g, b, 0) if is_background(r, g, b, a) else (r, g, b, a)
            for r, g, b, a in data
        ]
        img.putdata(out)
        img.save(p, "PNG")
        print("Updated", p)


if __name__ == "__main__":
    main()
