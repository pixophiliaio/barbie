import unittest
import tempfile
import json
from pathlib import Path
from backend.scanner import scan_model_garments, scan_models
from backend.pose_manager import PoseManager
from backend.app import (
    api_admin_model,
    api_admin_scan_models,
    api_set_folder_complete,
    AdminModelRequest,
    ScanRequest,
    FolderCompleteRequest
)


class TestAdmin(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

        # Hierarchy: base/date1/model_alex/
        self.model_dir = self.root / "date1" / "model_alex"
        self.garment1 = self.model_dir / "garment_shirt"
        self.garment2 = self.model_dir / "garment_pants"

        # Garment 1: photos + videos
        self.photos1 = self.garment1 / "photos"
        self.videos1 = self.garment1 / "videos"
        self.photos1.mkdir(parents=True)
        self.videos1.mkdir(parents=True)

        (self.photos1 / "img_01.jpg").write_bytes(b"dummy")
        (self.photos1 / "img_02.jpg").write_bytes(b"dummy")
        (self.videos1 / "clip.mp4").write_bytes(b"dummy")

        # Garment 2: PHOTOS only
        self.photos2 = self.garment2 / "PHOTOS"
        self.photos2.mkdir(parents=True)
        (self.photos2 / "pant_01.jpg").write_bytes(b"dummy")
        (self.photos2 / "pant_02.jpg").write_bytes(b"dummy")
        (self.photos2 / "pant_03.jpg").write_bytes(b"dummy")

        # Annotate garment 1 completely
        pose1 = {
            "bbox": {"x1": 10, "y1": 10, "x2": 90, "y2": 90},
            "rotation_angle": 0.0,
            "sliders": {"top_y": 0.0, "bottom_y": 1.0}
        }
        PoseManager.save_image_pose(str(self.photos1), "img_01.jpg", pose1)
        PoseManager.save_image_pose(str(self.photos1), "img_02.jpg", pose1)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_scan_model_garments(self):
        res = scan_model_garments(str(self.model_dir))
        self.assertEqual(res["model_name"], "model_alex")
        self.assertEqual(res["total_garments"], 2)

        # Garment 1 should be complete
        g1 = next(g for g in res["garments"] if g["garment_name"] == "garment_shirt")
        self.assertEqual(g1["total_images"], 2)
        self.assertEqual(g1["annotated_count"], 2)
        self.assertTrue(g1["is_complete"])
        self.assertEqual(g1["first_image"], "img_01.jpg")
        self.assertIn("img_01.jpg", g1["first_image_path"])

        # Garment 2 should be incomplete
        g2 = next(g for g in res["garments"] if g["garment_name"] == "garment_pants")
        self.assertEqual(g2["total_images"], 3)
        self.assertEqual(g2["annotated_count"], 0)
        self.assertFalse(g2["is_complete"])
        self.assertEqual(g2["first_image"], "pant_01.jpg")

    def test_completion_flag_persistence(self):
        # Verify pose.json on disk for garment 1 has is_complete: true
        with open(self.photos1 / "pose.json", "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertTrue(data.get("is_complete"))

        # Explicitly toggle completion via PoseManager
        PoseManager.set_folder_completion(str(self.photos1), False)
        with open(self.photos1 / "pose.json", "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertFalse(data.get("is_complete"))

    def test_scan_models_discovery(self):
        models = scan_models(str(self.root))
        self.assertEqual(len(models), 1)
        self.assertEqual(models[0]["model_name"], "model_alex")
        self.assertEqual(models[0]["garment_count"], 2)

    def test_admin_api_endpoints(self):
        # 1. api_admin_model
        res = api_admin_model(AdminModelRequest(model_path=str(self.model_dir)))
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["total_garments"], 2)

        # 2. api_admin_scan_models
        res2 = api_admin_scan_models(ScanRequest(path=str(self.root)))
        self.assertEqual(res2["total_models"], 1)

        # 3. api_set_folder_complete
        res3 = api_set_folder_complete(FolderCompleteRequest(
            folder_path=str(self.photos2),
            is_complete=True
        ))
        self.assertEqual(res3["status"], "success")
        self.assertTrue(res3["is_complete"])

        # Re-scan model and verify garment 2 is now flagged complete
        res4 = api_admin_model(AdminModelRequest(model_path=str(self.model_dir)))
        g2 = next(g for g in res4["garments"] if g["garment_name"] == "garment_pants")
        self.assertTrue(g2["is_complete"])

    def test_empty_admin_scan_returns_empty(self):
        res = api_admin_scan_models(ScanRequest(path=""))
        self.assertEqual(res["total_models"], 0)
        self.assertEqual(res["models"], [])
        self.assertEqual(res["root"], "")


if __name__ == "__main__":
    unittest.main()
