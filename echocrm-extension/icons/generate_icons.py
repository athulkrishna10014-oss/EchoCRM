import os
import struct
import zlib

def create_png(width, height, color=(99, 102, 241, 255)):
    # Simple PNG generator without external dependencies
    def make_chunk(chunk_type, data):
        chunk_len = len(data)
        chunk_crc = zlib.crc32(chunk_type + data) & 0xffffffff
        return struct.pack('>I', chunk_len) + chunk_type + data + struct.pack('>I', chunk_crc)

    # PNG Signature
    png_signature = b'\x89PNG\r\n\x1a\n'

    # IHDR Chunk
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr_chunk = make_chunk(b'IHDR', ihdr_data)

    # Raw image data (RGBA with filter byte 0 at each scanline)
    raw_data = bytearray()
    center_x = width / 2.0
    center_y = height / 2.0
    radius = min(width, height) / 2.0 - 1.0

    for y in range(height):
        raw_data.append(0) # Filter type 0 (None)
        for x in range(width):
            dx = x - center_x
            dy = y - center_y
            dist = (dx * dx + dy * dy) ** 0.5

            if dist <= radius:
                # Inside rounded icon
                # Add nice gradient wave style
                r = int(color[0] + (x / width) * 50)
                g = int(color[1] - (y / height) * 30)
                b = int(min(255, color[2] + 20))
                # Add sound wave bars in center
                bar_width = max(1, int(width / 8))
                if abs(dx) < width * 0.35 and abs(dy) < height * (0.35 - 0.25 * (abs(dx) / (width * 0.35))):
                    # Sound wave highlight
                    raw_data.extend([255, 255, 255, 255])
                else:
                    raw_data.extend([min(255, r), max(0, g), b, 255])
            else:
                # Transparent outside
                raw_data.extend([0, 0, 0, 0])

    compressed_data = zlib.compress(bytes(raw_data))
    idat_chunk = make_chunk(b'IDAT', compressed_data)

    # IEND Chunk
    iend_chunk = make_chunk(b'IEND', b'')

    return png_signature + ihdr_chunk + idat_chunk + iend_chunk

icons_dir = os.path.dirname(os.path.abspath(__file__))
os.makedirs(icons_dir, exist_ok=True)

for size in [16, 48, 128]:
    png_bytes = create_png(size, size)
    path = os.path.join(icons_dir, f'icon{size}.png')
    with open(path, 'wb') as f:
        f.write(png_bytes)
    print(f'Created {path} ({size}x{size})')
