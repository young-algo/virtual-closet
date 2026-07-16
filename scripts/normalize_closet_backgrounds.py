from __future__ import annotations

import argparse
import math
import os
import statistics
import tempfile
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image


MIN_BACKGROUND_LUMA = 205.0
MAX_BACKGROUND_CHROMA = 32.0
MIN_COLOR_TOLERANCE = 14.0
MAX_COLOR_TOLERANCE = 38.0
TARGET_BACKGROUND_RGB = (246, 246, 246)
CONTRACT_COLOR_TOLERANCE = 2.0
SUPPORTED_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


@dataclass(frozen=True)
class NormalizationStats:
    changed_pixels: int
    background_rgb: tuple[float, float, float] | None
    skipped_reason: str | None = None


@dataclass(frozen=True)
class BackgroundInspection:
    compliant: bool
    background_rgb: tuple[float, float, float] | None
    skipped_reason: str | None = None


@dataclass(frozen=True)
class BackgroundModel:
    rgb: tuple[float, float, float]
    tolerance: float


def _luma(rgb: tuple[float, float, float]) -> float:
    red, green, blue = rgb
    return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)


def _chroma(rgb: tuple[float, float, float]) -> float:
    return max(rgb) - min(rgb)


def _distance(left: tuple[float, float, float], right: tuple[float, float, float]) -> float:
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(left, right)))


def _perimeter_coordinates(width: int, height: int) -> Iterable[tuple[int, int]]:
    band = max(1, round(min(width, height) * 0.02))
    for y in range(height):
        for x in range(width):
            if x < band or x >= width - band or y < band or y >= height - band:
                yield x, y


def _contains_transparency(image: Image.Image) -> bool:
    alpha_extrema = image.getchannel("A").getextrema()
    return alpha_extrema[0] < 255


def _background_model(image: Image.Image) -> BackgroundModel:
    samples = [image.getpixel(point)[:3] for point in _perimeter_coordinates(*image.size)]
    reference = tuple(float(statistics.median(channel)) for channel in zip(*samples))
    distances = [_distance(tuple(float(value) for value in sample), reference) for sample in samples]
    median_distance = statistics.median(distances)
    absolute_deviations = [abs(value - median_distance) for value in distances]
    median_absolute_deviation = statistics.median(absolute_deviations)
    tolerance = max(
        MIN_COLOR_TOLERANCE,
        min(MAX_COLOR_TOLERANCE, 10.0 + (3.0 * (median_distance + median_absolute_deviation))),
    )
    return BackgroundModel(reference, tolerance)


def _eligible_background_pixel(
    pixel: tuple[int, int, int, int],
    model: BackgroundModel,
) -> bool:
    rgb = tuple(float(value) for value in pixel[:3])
    return (
        pixel[3] == 255
        and _luma(rgb) >= MIN_BACKGROUND_LUMA
        and _chroma(rgb) <= MAX_BACKGROUND_CHROMA
        and _distance(rgb, model.rgb) <= model.tolerance
    )


def inspect_background(image: Image.Image) -> BackgroundInspection:
    rgba = image.convert("RGBA")
    if _contains_transparency(rgba):
        return BackgroundInspection(True, None, "contains transparency")

    model = _background_model(rgba)
    if _luma(model.rgb) < MIN_BACKGROUND_LUMA or _chroma(model.rgb) > MAX_BACKGROUND_CHROMA:
        return BackgroundInspection(True, model.rgb, "background is not bright and neutral")

    target = tuple(float(value) for value in TARGET_BACKGROUND_RGB)
    return BackgroundInspection(_distance(model.rgb, target) <= CONTRACT_COLOR_TOLERANCE, model.rgb)


def normalize_rgba(image: Image.Image) -> tuple[Image.Image, NormalizationStats]:
    rgba = image.convert("RGBA")
    if _contains_transparency(rgba):
        return rgba.copy(), NormalizationStats(0, None, "contains transparency")

    model = _background_model(rgba)
    if _luma(model.rgb) < MIN_BACKGROUND_LUMA or _chroma(model.rgb) > MAX_BACKGROUND_CHROMA:
        return rgba.copy(), NormalizationStats(0, model.rgb, "background is not bright and neutral")

    width, height = rgba.size
    perimeter_band = max(1, round(min(width, height) * 0.02))
    output = rgba.copy()
    source = rgba.load()
    destination = output.load()
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def enqueue_if_eligible(x: int, y: int) -> None:
        offset = (y * width) + x
        if visited[offset]:
            return
        visited[offset] = 1
        pixel = source[x, y]
        if _eligible_background_pixel(pixel, model):
            queue.append((x, y))

    for x in range(width):
        enqueue_if_eligible(x, 0)
        if height > 1:
            enqueue_if_eligible(x, height - 1)
    for y in range(1, height - 1):
        enqueue_if_eligible(0, y)
        if width > 1:
            enqueue_if_eligible(width - 1, y)

    changed_pixels = 0
    channel_offsets = tuple(target - source for target, source in zip(TARGET_BACKGROUND_RGB, model.rgb))
    while queue:
        x, y = queue.popleft()
        source_pixel = source[x, y]
        if (
            x < perimeter_band
            or x >= width - perimeter_band
            or y < perimeter_band
            or y >= height - perimeter_band
        ):
            corrected = (*TARGET_BACKGROUND_RGB, 255)
        else:
            corrected = (
                *(max(0, min(255, round(source_pixel[channel] + channel_offsets[channel]))) for channel in range(3)),
                255,
            )
        if destination[x, y] != corrected:
            destination[x, y] = corrected
            changed_pixels += 1

        if x > 0:
            enqueue_if_eligible(x - 1, y)
        if x + 1 < width:
            enqueue_if_eligible(x + 1, y)
        if y > 0:
            enqueue_if_eligible(x, y - 1)
        if y + 1 < height:
            enqueue_if_eligible(x, y + 1)

    return output, NormalizationStats(changed_pixels, model.rgb)


def _save_atomically(image: Image.Image, path: Path) -> None:
    suffix = path.suffix.lower()
    with tempfile.NamedTemporaryFile(dir=path.parent, suffix=suffix, delete=False) as handle:
        temporary_path = Path(handle.name)

    try:
        if suffix in {".jpg", ".jpeg"}:
            image.convert("RGB").save(temporary_path, format="JPEG", quality=95, subsampling=0, optimize=True)
        elif suffix == ".png":
            image.save(temporary_path, format="PNG", optimize=True)
        elif suffix == ".webp":
            image.convert("RGB").save(temporary_path, format="WEBP", quality=95, method=6)
        else:
            raise ValueError(f"Unsupported image format: {path}")
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def _image_paths(root: Path) -> list[Path]:
    return sorted(
        path
        for path in root.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES
    )


def run(root: Path, check: bool) -> int:
    if not root.is_dir():
        print(f"ERROR image root does not exist: {root}")
        return 2

    failures: list[Path] = []
    changed_files = 0
    changed_pixels = 0

    for path in _image_paths(root):
        try:
            with Image.open(path) as source:
                source.load()
                if check:
                    inspection = inspect_background(source)
                    if not inspection.compliant:
                        failures.append(path)
                        rgb = tuple(round(value, 1) for value in inspection.background_rgb or ())
                        print(f"FAIL {path} perimeter={rgb}")
                    continue

                normalized, stats = normalize_rgba(source)
                if stats.changed_pixels == 0:
                    continue
                _save_atomically(normalized, path)
                changed_files += 1
                changed_pixels += stats.changed_pixels
                rgb = tuple(round(value, 1) for value in stats.background_rgb or ())
                print(f"CHANGED {path} pixels={stats.changed_pixels} perimeter={rgb}")
        except Exception as error:
            print(f"ERROR {path}: {error}")
            return 2

    if check:
        if failures:
            print(f"FAILED {len(failures)} image(s) do not meet the white-perimeter contract")
            return 1
        print(f"PASS {len(_image_paths(root))} image(s) match the image-well background contract")
        return 0

    print(f"DONE changed_files={changed_files} changed_pixels={changed_pixels}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize closet product-image backgrounds")
    parser.add_argument("--check", action="store_true", help="Audit without writing")
    parser.add_argument("--root", type=Path, default=Path("public/closet"), help="Image directory")
    arguments = parser.parse_args()
    return run(arguments.root, arguments.check)


if __name__ == "__main__":
    raise SystemExit(main())
