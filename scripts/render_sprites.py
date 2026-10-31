#!/usr/bin/env python3
"""Render the persona sprites from plugin/hooks/personas.ts to PNG.

Writes docs/img/<persona>.png, docs/img/party.png (all personas in a row)
and plugin/.claude-plugin/icon.png. Standard library only.

    python3 scripts/render_sprites.py
"""

from __future__ import annotations

import re
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "plugin" / "hooks" / "personas.ts"


def parse() -> tuple[dict[str, str], list[dict]]:
    text = SOURCE.read_text(encoding="utf-8")
    shared_block = re.search(r"SHARED_PALETTE[^=]*=\s*\{(.*?)\}", text, re.S).group(1)
    shared = dict(re.findall(r"(\w):\s*'(#[0-9a-fA-F]{6})'", shared_block))
    personas = []
    for block in re.findall(r"\{\s*id: '.*?sprite: \[.*?\],\s*\}", text, re.S):
        pid = re.search(r"id: '([^']+)'", block).group(1)
        palette = dict(re.findall(r"(\w): '(#[0-9a-fA-F]{6})'", re.search(r"palette: \{(.*?)\}", block, re.S).group(1)))
        rows = re.findall(r"'([^']{12})'", re.search(r"sprite: \[(.*?)\]", block, re.S).group(1))
        personas.append({"id": pid, "palette": {**shared, **palette}, "rows": rows})
    return shared, personas


def png(path: Path, pixels: list[list[tuple[int, int, int, int]]]) -> None:
    h, w = len(pixels), len(pixels[0])
    raw = b"".join(b"\x00" + b"".join(struct.pack("BBBB", *px) for px in row) for row in pixels)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def sprite_pixels(p: dict, scale: int, pad: int, bg: tuple[int, int, int, int]) -> list[list[tuple[int, int, int, int]]]:
    size = 12 * scale + 2 * pad
    out = [[bg] * size for _ in range(size)]
    for y, row in enumerate(p["rows"]):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            c = p["palette"][ch].lstrip("#")
            rgba = (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), 255)
            for dy in range(scale):
                for dx in range(scale):
                    out[pad + y * scale + dy][pad + x * scale + dx] = rgba
    return out


def main() -> None:
    _, personas = parse()
    clear = (0, 0, 0, 0)
    for p in personas:
        png(ROOT / "docs" / "img" / f"{p['id']}.png", sprite_pixels(p, 16, 8, clear))
    tiles = [sprite_pixels(p, 10, 6, clear) for p in personas]
    party = [sum((t[y] for t in tiles), []) for y in range(len(tiles[0]))]
    png(ROOT / "docs" / "img" / "party.png", party)
    # The icon: Grammar Guy on a dark tile, 512 px.
    icon = sprite_pixels(next(p for p in personas if p["id"] == "grammar-guy"), 40, 16, (32, 36, 48, 255))
    png(ROOT / "plugin" / ".claude-plugin" / "icon.png", icon)
    print(f"Rendered {len(personas)} personas.")


if __name__ == "__main__":
    main()
