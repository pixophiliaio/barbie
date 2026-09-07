import unittest
import tempfile
import json
from pathlib import Path
from backend.pose_manager import PoseManager
from backend.scanner import scan_photos_folders, get_folder_details


class TestMultiFolderFlow(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

        # Create two photoshoot folders with PHOTOS
        self.folder1 = self.root / "model_A" / "shoot_01" / "PHOTOS"
        self.folder2 = self.root / "model_A" / "shoot_02" / "PHOTOS"
        self.folder1.mkdir(parents=True)
        self.folder2.mkdir(parents=True)

        for i in range(1, 4):
            (self.folder1 / f"img_{i:02d}.jpg").write_bytes(b"dummy")
            (self.folder2 / f"img_{i:02d}.jpg").write_bytes(b"dummy")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_scan_and_defaults(self):
        folders = scan_photos_folders(str(self.root))
        self.assertEqual(len(folders), 2)
        self.assertFalse(folders[0]["defaults_confirmed"])
        self.assertEqual(folders[0]["annotated_count"], 0)

        # Set defaults on folder 1
        PoseManager.save_folder_defaults(
            str(self.folder1),
            gender="female",
            top_fit="loose",
            bottom_fit="tight"
        )

        details = get_folder_details(str(self.folder1))
        self.assertTrue(details["defaults_confirmed"])
        self.assertEqual(details["top_fit"], "loose")
        self.assertEqual(details["bottom_fit"], "tight")

        # Verify raw pose.json does NOT contain gender
        with open(self.folder1 / "pose.json", "r", encoding="utf-8") as f:
            raw = json.load(f)
        self.assertNotIn("gender", raw)

        # Folder 2 remains unconfirmed
        details2 = get_folder_details(str(self.folder2))
        self.assertFalse(details2["defaults_confirmed"])

    def test_save_and_completion_progression(self):
        # Annotate all images in folder 1
        for i in range(1, 4):
            PoseManager.save_image_pose(
                str(self.folder1),
                f"img_{i:02d}.jpg",
                {
                    "rotation_angle": 45.0,
                    "sliders": {"top_y": 0.1, "bottom_y": 0.9}
                }
            )

        details = get_folder_details(str(self.folder1))
        self.assertEqual(len(details["poses"]), 3)
        self.assertEqual(details["total_images"], 3)

        folders = scan_photos_folders(str(self.root))
        self.assertTrue(folders[0]["is_complete"])
        self.assertEqual(folders[0]["annotated_count"], 3)
        self.assertFalse(folders[1]["is_complete"])


if __name__ == "__main__":
    unittest.main()
