import unittest

from PIL import Image

from scripts.normalize_closet_backgrounds import inspect_background, normalize_rgba


def solid_image(size: int, rgba: tuple[int, int, int, int]) -> Image.Image:
    return Image.new("RGBA", (size, size), rgba)


def off_white_canvas_with_enclosed_detail() -> Image.Image:
    image = solid_image(9, (243, 243, 243, 255))
    for y in range(2, 7):
        for x in range(2, 7):
            image.putpixel((x, y), (20, 30, 40, 255))
    image.putpixel((4, 4), (243, 243, 243, 255))
    return image


class NormalizeRgbaTests(unittest.TestCase):
    def test_normalizes_only_off_white_pixels_connected_to_perimeter(self) -> None:
        image = off_white_canvas_with_enclosed_detail()

        normalized, stats = normalize_rgba(image)

        self.assertEqual(normalized.getpixel((0, 0)), (246, 246, 246, 255))
        self.assertEqual(normalized.getpixel((2, 2)), (20, 30, 40, 255))
        self.assertEqual(normalized.getpixel((4, 4)), (243, 243, 243, 255))
        self.assertGreater(stats.changed_pixels, 0)
        self.assertIsNone(stats.skipped_reason)

    def test_is_idempotent(self) -> None:
        once, _ = normalize_rgba(off_white_canvas_with_enclosed_detail())

        twice, second_stats = normalize_rgba(once)

        self.assertEqual(once.tobytes(), twice.tobytes())
        self.assertEqual(second_stats.changed_pixels, 0)

    def test_skips_images_with_transparency(self) -> None:
        image = solid_image(5, (243, 243, 243, 255))
        image.putpixel((0, 0), (0, 0, 0, 0))

        normalized, stats = normalize_rgba(image)

        self.assertEqual(normalized.tobytes(), image.tobytes())
        self.assertEqual(stats.skipped_reason, "contains transparency")

    def test_maps_an_already_white_background_to_the_image_well(self) -> None:
        image = solid_image(7, (255, 255, 255, 255))
        image.putpixel((3, 3), (15, 25, 35, 255))

        normalized, stats = normalize_rgba(image)

        self.assertEqual(normalized.getpixel((0, 0)), (246, 246, 246, 255))
        self.assertEqual(normalized.getpixel((3, 3)), (15, 25, 35, 255))
        self.assertGreater(stats.changed_pixels, 0)

    def test_normalizes_a_neutral_background_gradient(self) -> None:
        image = Image.new("RGBA", (11, 11))
        for y in range(11):
            for x in range(11):
                shade = 238 + round((x / 10) * 7)
                image.putpixel((x, y), (shade, shade, shade, 255))
        for y in range(3, 8):
            for x in range(3, 8):
                image.putpixel((x, y), (180, 45, 30, 255))

        normalized, _ = normalize_rgba(image)

        self.assertEqual(normalized.getpixel((0, 5)), (246, 246, 246, 255))
        self.assertEqual(normalized.getpixel((10, 5)), (246, 246, 246, 255))
        self.assertEqual(normalized.getpixel((5, 5)), (180, 45, 30, 255))

    def test_preserves_a_pale_garment_separated_by_an_outline(self) -> None:
        image = solid_image(9, (242, 242, 242, 255))
        for y in range(2, 7):
            for x in range(2, 7):
                image.putpixel((x, y), (90, 90, 90, 255))
        for y in range(3, 6):
            for x in range(3, 6):
                image.putpixel((x, y), (250, 248, 244, 255))

        normalized, _ = normalize_rgba(image)

        self.assertEqual(normalized.getpixel((0, 0)), (246, 246, 246, 255))
        self.assertEqual(normalized.getpixel((4, 4)), (250, 248, 244, 255))

    def test_preserves_contrast_when_pale_fabric_is_connected_to_the_background(self) -> None:
        image = solid_image(7, (228, 228, 228, 255))
        for y in range(2, 5):
            for x in range(2, 5):
                image.putpixel((x, y), (236, 236, 236, 255))

        normalized, _ = normalize_rgba(image)

        self.assertEqual(normalized.getpixel((0, 0)), (246, 246, 246, 255))
        self.assertEqual(normalized.getpixel((3, 3)), (254, 254, 254, 255))

    def test_skips_an_ineligible_dark_background(self) -> None:
        image = solid_image(7, (80, 82, 84, 255))
        image.putpixel((3, 3), (220, 30, 30, 255))

        normalized, stats = normalize_rgba(image)

        self.assertEqual(normalized.tobytes(), image.tobytes())
        self.assertEqual(stats.skipped_reason, "background is not bright and neutral")


class InspectBackgroundTests(unittest.TestCase):
    def test_reports_off_white_perimeter_as_noncompliant(self) -> None:
        inspection = inspect_background(solid_image(7, (243, 243, 243, 255)))

        self.assertFalse(inspection.compliant)
        self.assertIsNone(inspection.skipped_reason)

    def test_reports_well_matched_perimeter_as_compliant(self) -> None:
        image = solid_image(7, (246, 246, 246, 255))
        image.putpixel((3, 3), (10, 20, 30, 255))

        inspection = inspect_background(image)

        self.assertTrue(inspection.compliant)
        self.assertIsNone(inspection.skipped_reason)

    def test_reports_white_perimeter_as_noncompliant(self) -> None:
        inspection = inspect_background(solid_image(7, (255, 255, 255, 255)))

        self.assertFalse(inspection.compliant)
        self.assertIsNone(inspection.skipped_reason)

    def test_reports_transparency_as_skipped(self) -> None:
        image = solid_image(5, (255, 255, 255, 255))
        image.putpixel((0, 0), (0, 0, 0, 0))

        inspection = inspect_background(image)

        self.assertTrue(inspection.compliant)
        self.assertEqual(inspection.skipped_reason, "contains transparency")


if __name__ == "__main__":
    unittest.main()
