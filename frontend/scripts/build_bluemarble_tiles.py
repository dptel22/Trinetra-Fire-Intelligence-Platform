"""Build local Web-Mercator tiles from the equirectangular Blue Marble image."""

from pathlib import Path
import math

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/tiles/bluemarble.jpg"
OUTPUT = ROOT / "public/tiles/bluemarble"
TILE_SIZE = 256
MAX_ZOOM = 6

# Cover the map's India-focused max bounds with one tile of padding.
MIN_LON, MAX_LON = 55.0, 115.0
MIN_LAT, MAX_LAT = -10.0, 50.0


def mercator_y(lat: float) -> float:
    lat = max(-85.05112878, min(85.05112878, lat))
    return (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0


def tile_range(z: int) -> tuple[range, range]:
    n = 2**z
    x0 = max(0, math.floor((MIN_LON + 180.0) / 360.0 * n) - 1)
    x1 = min(n - 1, math.floor((MAX_LON + 180.0) / 360.0 * n) + 1)
    y0 = max(0, math.floor(mercator_y(MAX_LAT) * n) - 1)
    y1 = min(n - 1, math.floor(mercator_y(MIN_LAT) * n) + 1)
    return range(x0, x1 + 1), range(y0, y1 + 1)


def build_tile(source: np.ndarray, z: int, x: int, y: int) -> Image.Image:
    height, width, _ = source.shape
    n = 2**z
    px = (np.arange(TILE_SIZE, dtype=np.float64) + 0.5 + x * TILE_SIZE) / (n * TILE_SIZE)
    py = (np.arange(TILE_SIZE, dtype=np.float64) + 0.5 + y * TILE_SIZE) / (n * TILE_SIZE)
    lon = px * 360.0 - 180.0
    mercator = np.pi * (1.0 - 2.0 * py)
    lat = np.degrees(np.arctan(np.sinh(mercator)))

    source_x = np.mod((lon + 180.0) / 360.0 * width, width).astype(np.int64)
    source_y = np.clip(((90.0 - lat) / 180.0 * height).round(), 0, height - 1).astype(np.int64)
    tile = source[source_y[:, None], source_x[None, :]]
    return Image.fromarray(tile, mode="RGB")


def main() -> None:
    source = np.asarray(Image.open(SOURCE).convert("RGB"))
    generated = 0
    for z in range(MAX_ZOOM + 1):
        xs, ys = tile_range(z)
        for x in xs:
            for y in ys:
                target = OUTPUT / str(z) / str(x) / f"{y}.jpg"
                target.parent.mkdir(parents=True, exist_ok=True)
                build_tile(source, z, x, y).save(target, "JPEG", quality=88, optimize=True)
                generated += 1
    print(f"Generated {generated} Blue Marble Web-Mercator tiles in {OUTPUT}")


if __name__ == "__main__":
    main()
