"""Create a small, deterministic uncompressed Bayer DNG for the RAW browser test."""
from pathlib import Path
import struct

width = height = 128
tags = {
    256: (4, [width]), 257: (4, [height]), 258: (3, [16]), 259: (3, [1]),
    262: (3, [32803]), 271: (2, 'Still'), 272: (2, 'Synthetic Bayer sensor'),
    273: (4, [0]), 274: (3, [1]), 277: (3, [1]), 278: (4, [height]),
    279: (4, [width * height * 2]), 33421: (3, [2, 2]), 33422: (1, [0, 1, 1, 2]),
    50706: (1, [1, 4, 0, 0]), 50707: (1, [1, 1, 0, 0]),
    50708: (2, 'Still Synthetic Bayer'), 50710: (1, [0, 1, 2]), 50711: (3, [1]),
    50713: (3, [1, 1]), 50714: (5, [(0, 1)]), 50717: (4, [65535]),
    50721: (10, [(1, 1), (0, 1), (0, 1), (0, 1), (1, 1), (0, 1), (0, 1), (0, 1), (1, 1)]),
    50728: (5, [(1, 1), (1, 1), (1, 1)]), 50778: (3, [21]),
    50829: (4, [0, 0, height, width]),
}

def encode(kind, values):
    if kind == 2:
        data = values.encode('ascii') + b'\0'
        return len(data), data
    if kind in (5, 10):
        return len(values), b''.join(struct.pack('<II' if kind == 5 else '<ii', *v) for v in values)
    return len(values), struct.pack('<' + {1: 'B', 3: 'H', 4: 'I'}[kind] * len(values), *values)

entries = []
extra = bytearray()
start = 8 + 2 + 12 * len(tags) + 4
for tag, (kind, values) in sorted(tags.items()):
    count, data = encode(kind, values)
    if len(data) > 4:
        field = struct.pack('<I', start + len(extra))
        extra += data
        if len(extra) % 2:
            extra += b'\0'
    else:
        field = data.ljust(4, b'\0')
    entries.append((tag, kind, count, field))
pixels_at = start + len(extra)
ifd = bytearray(struct.pack('<H', len(entries)))
for tag, kind, count, field in entries:
    if tag == 273:
        field = struct.pack('<I', pixels_at)
    ifd += struct.pack('<HHI', tag, kind, count) + field
ifd += b'\0' * 4
pixels = bytearray()
for y in range(height):
    for x in range(width):
        color = [0, 1, 1, 2][(y % 2) * 2 + x % 2]
        value = [0.04 + 0.3 * x / width, 0.04 + 0.3 * y / height, 0.08 + 0.15 * (x + y) / (width + height)][color]
        pixels += struct.pack('<H', int(value * 65535))
target = Path(__file__).resolve().parent.parent / 'tests/fixtures/sensor.dng'
target.write_bytes(b'II' + struct.pack('<HI', 42, 8) + ifd + extra + pixels)
print(target.name, target.stat().st_size, 'bytes')
