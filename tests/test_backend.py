import os
import sys
import shutil
import tempfile
import unittest
from pathlib import Path
from PIL import Image

# Add root directory to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from backend.scanner import scan_photos_folders, get_folder_details
from backend.pose_manager import PoseManager

class TestBackend(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        
        # Create nested test folder structure:
        # root/
        #   2026-09-05/
        #     model_alex/
        #       PHOTOS/
        #         img1.jpg
        #         img2.jpg
        #     model_bella/
        #       look_01/
        #         deep/
        #           PHOTOS/
        #             img3.jpg
        self.photos1 = Path(self.temp_dir) / "2026-09-05" / "model_alex" / "PHOTOS"
        self.photos1.mkdir(parents=True, exist_ok=True)
        
        self.photos2 = Path(self.temp_dir) / "2026-09-05" / "model_bella" / "look_01" / "deep" / "PHOTOS"
        self.photos2.mkdir(parents=True, exist_ok=True)

        # Create dummy test images with background and subject
        from PIL import ImageDraw
        for name in ["img1.jpg", "img2.jpg"]:
            im = Image.new("RGB", (400, 600), color=(240, 240, 240))
            draw = ImageDraw.Draw(im)
            draw.rectangle([100, 80, 300, 520], fill=(50, 80, 120))
            im.save(self.photos1 / name)

        im3 = Image.new("RGB", (400, 600), color=(240, 240, 240))
        draw3 = ImageDraw.Draw(im3)
        draw3.rectangle([120, 100, 280, 500], fill=(120, 50, 80))
        im3.save(self.photos2 / "img3.jpg")

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_recursive_scanner(self):
        folders = scan_photos_folders(self.temp_dir)
        self.assertEqual(len(folders), 2)
        
        # Verify first photos folder
        f1 = next(f for f in folders if "model_alex" in f["path"])
        self.assertEqual(f1["total_images"], 2)
        self.assertEqual(f1["annotated_count"], 0)

        # Verify deeply nested photos folder (.../.../PHOTOS)
        f2 = next(f for f in folders if "model_bella" in f["path"])
        self.assertEqual(f2["total_images"], 1)

    def test_pose_manager_crud(self):
        pose_data = {
            "bbox": {"x1": 10, "y1": 20, "x2": 90, "y2": 95, "norm_x1": 0.1, "norm_y1": 0.2, "norm_x2": 0.9, "norm_y2": 0.95},
            "rotation_angle": 45.0,
            "rotation_label": "Front-Right 3/4",
            "sliders": {
                "top_y": 0.05,
                "bottom_y": 0.95,
                "top_region": "head",
                "bottom_region": "foot",
                "framing": "full_body"
            },
            "top_fit": "loose",
            "bottom_fit": "regular",
            "gender": "male"
        }

        # Save pose
        saved = PoseManager.save_image_pose(str(self.photos1), "img1.jpg", pose_data)
        self.assertEqual(saved["rotation_angle"], 45.0)
        self.assertEqual(saved["top_fit"], "loose")
        self.assertEqual(saved["gender"], "male")

        # Verify persisted in pose.json
        loaded = PoseManager.load_poses(str(self.photos1))
        self.assertIn("img1.jpg", loaded)
        self.assertEqual(loaded["img1.jpg"]["bbox"]["x1"], 10)
        self.assertEqual(loaded["img1.jpg"]["sliders"]["framing"], "full_body")

        # Verify scanner sees 1/2 annotated
        folders = scan_photos_folders(self.temp_dir)
        f1 = next(f for f in folders if "model_alex" in f["path"])
        self.assertEqual(f1["annotated_count"], 1)

    def test_folder_defaults(self):
        defaults = PoseManager.save_folder_defaults(
            str(self.photos1),
            gender="female",
            top_fit="tight",
            bottom_fit="loose"
        )
        self.assertEqual(defaults["gender"], "female")
        self.assertEqual(defaults["top_fit"], "tight")

        loaded_defaults = PoseManager.get_folder_defaults(str(self.photos1))
        self.assertEqual(loaded_defaults["top_fit"], "tight")

    def test_photos_folder_json_format(self):
        # 1. Save folder defaults
        PoseManager.save_folder_defaults(
            str(self.photos1),
            gender="female",
            top_fit="loose",
            bottom_fit="tight"
        )

        # 2. Save an image pose
        pose_data = {
            "bbox": {"x1": 15, "y1": 25, "x2": 85, "y2": 95},
            "rotation_angle": 90.0,
            "rotation_label": "Right Profile (90°)",
            "sliders": {"top_y": 0.1, "bottom_y": 0.9, "top_region": "head", "bottom_region": "foot", "framing": "full_body"}
        }
        PoseManager.save_image_pose(str(self.photos1), "img1.jpg", pose_data)

        # 3. Read raw JSON on disk to verify exact schema structure
        import json
        with open(self.photos1 / "pose.json", "r", encoding="utf-8") as f:
            raw = json.load(f)

        # Ensure gender is NOT in pose.json (only used for model visualization)
        self.assertNotIn("gender", raw)
        self.assertEqual(raw["fitting"]["top"], "loose")
        self.assertEqual(raw["fitting"]["bottom"], "tight")
        self.assertEqual(raw["top_fit"], "loose")
        self.assertEqual(raw["bottom_fit"], "tight")
        self.assertIn("images", raw)
        self.assertIn("img1.jpg", raw["images"])

        img_record = raw["images"]["img1.jpg"]
        self.assertEqual(img_record["rotation_angle"], 90.0)
        # Ensure redundant fields are NOT inside image record
        self.assertNotIn("gender", img_record)
        self.assertNotIn("top_fit", img_record)
        self.assertNotIn("bottom_fit", img_record)
        self.assertNotIn("fitting", img_record)

    def test_orient_image_vertical(self):
        from backend.app import orient_image_vertical
        # Horizontal image (width 600, height 400)
        im_horiz = Image.new("RGB", (600, 400), color=(200, 200, 200))
        im_vert = orient_image_vertical(im_horiz)
        self.assertGreater(im_vert.height, im_vert.width)
        self.assertEqual(im_vert.height, 600)
        self.assertEqual(im_vert.width, 400)

        # Vertical image (width 400, height 600) remains vertical
        im_portrait = Image.new("RGB", (400, 600), color=(200, 200, 200))
        im_portrait_res = orient_image_vertical(im_portrait)
        self.assertEqual(im_portrait_res.height, 600)
        self.assertEqual(im_portrait_res.width, 400)

    def test_detect_bbox(self):
        from backend.detector import detect_human_bbox
        img_path = str(self.photos1 / "img1.jpg")
        res = detect_human_bbox(img_path)
        self.assertIsNotNone(res)
        self.assertIn("norm_x1", res)
        self.assertIn("detection_time_ms", res)

    def test_folder_details_with_bbox(self):
        pose_data = {
            "bbox": {"x1": 10, "y1": 20, "x2": 90, "y2": 95, "norm_x1": 0.1, "norm_y1": 0.2, "norm_x2": 0.9, "norm_y2": 0.95},
            "rotation_angle": 0.0,
            "rotation_label": "Front (0°)"
        }
        PoseManager.save_image_pose(str(self.photos1), "img1.jpg", pose_data)
        details = get_folder_details(str(self.photos1))
        # img1 is saved with bbox
        self.assertIn("img1.jpg", details["poses"])
        self.assertIn("bbox", details["poses"]["img1.jpg"])
        self.assertAlmostEqual(details["poses"]["img1.jpg"]["bbox"]["norm_x1"], 0.1)
        # img2 is pending (not annotated)
        self.assertNotIn("img2.jpg", details["poses"])

    def test_empty_scan_returns_empty(self):
        from backend.app import api_scan, ScanRequest
        res = api_scan(ScanRequest(path=""))
        self.assertEqual(res["total_folders"], 0)
        self.assertEqual(res["folders"], [])
        self.assertEqual(res["root"], "")

if __name__ == "__main__":
    unittest.main()

