"""
Generate placeholder extension icons (16, 32, 48, 128 px).

Produces solid indigo (#4f46e5) squares with a minimal "SF" mark using
only Python stdlib — no Pillow required.

Usage:
    python generate_icons.py

Output: public/icons/icon{16,32,48,128}.png
"""

import struct
import zlib
from pathlib import Path

# IndiaCircle indigo
BG_COLOR = (79, 70, 229)   # #4f46e5
FG_COLOR = (255, 255, 255)  # white text

# Tiny 3×5 bitmap glyphs for "S" and "F" (column-major, LSB = top row)
# Each glyph is 3 pixels wide, 5 pixels tall.
GLYPHS: dict[str, list[list[int]]] = {
    "S": [
        [1, 1, 1],
        [1, 0, 0],
        [1, 1, 1],
        [0, 0, 1],
        [1, 1, 1],
    ],
    "F": [
        [1, 1, 1],
        [1, 0, 0],
        [1, 1, 0],
        [1, 0, 0],
        [1, 0, 0],
    ],
}


def _chunk(tag: bytes, data: bytes) -> bytes:
    length = struct.pack(">I", len(data))
    crc = struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return length + tag + data + crc


def make_png(size: int) -> bytes:
    """Return raw PNG bytes for a square icon of `size` pixels."""
    w = h = size

    # Build pixel grid: start with solid background
    pixels: list[list[tuple[int, int, int]]] = [
        [BG_COLOR for _ in range(w)] for _ in range(h)
    ]

    # Render "SF" centred — only for sizes >= 16
    if size >= 16:
        glyph_w, glyph_h = 3, 5
        gap = max(1, size // 16)          # gap between letters
        text_w = glyph_w * 2 + gap
        scale = max(1, size // 16)        # 1× at 16px, 2× at 32px, 3× at 48px, 8× at 128px
        scale = min(scale, size // (glyph_h + 2))  # don't overflow height

        rendered_w = text_w * scale
        rendered_h = glyph_h * scale

        x0 = (w - rendered_w) // 2
        y0 = (h - rendered_h) // 2

        for char_idx, char in enumerate("SF"):
            glyph = GLYPHS[char]
            char_x0 = x0 + char_idx * (glyph_w + gap) * scale
            for row_idx, row in enumerate(glyph):
                for col_idx, bit in enumerate(row):
                    if bit:
                        for dy in range(scale):
                            for dx in range(scale):
                                px = char_x0 + col_idx * scale + dx
                                py = y0 + row_idx * scale + dy
                                if 0 <= px < w and 0 <= py < h:
                                    pixels[py][px] = FG_COLOR

    # Encode as RGB PNG
    raw = b""
    for row in pixels:
        raw += b"\x00"  # filter type None
        for r, g, b in row:
            raw += bytes([r, g, b])

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    idat = zlib.compress(raw, 9)

    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", ihdr)
        + _chunk(b"IDAT", idat)
        + _chunk(b"IEND", b"")
    )


def main() -> None:
    out_dir = Path(__file__).parent / "public" / "icons"
    out_dir.mkdir(parents=True, exist_ok=True)

    for size in (16, 32, 48, 128):
        path = out_dir / f"icon{size}.png"
        path.write_bytes(make_png(size))
        print(f"  Written {path}  ({size}×{size})")

    print("\nDone. Copy public/icons/ to dist/icons/ after running npm run build.")


if __name__ == "__main__":
    main()
