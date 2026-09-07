import os
import json
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime

class PoseManager:
    """
    Manages reading, updating, and atomically writing pose.json.
    
    Structure:
    {
      "gender": "male",
      "fitting": {
        "top": "regular",
        "bottom": "regular"
      },
      "top_fit": "regular",
      "bottom_fit": "regular",
      "updated_at": "...",
      "images": {
        "img1.jpg": {
          "bbox": { "x1": ..., "y1": ..., "x2": ..., "y2": ..., ... },
          "rotation_angle": 45.0,
          "rotation_label": "Front-Right 3/4 (45°)",
          "sliders": {
            "top_y": 0.0,
            "bottom_y": 1.0,
            "top_region": "head",
            "bottom_region": "foot",
            "framing": "full_body"
          },
          "updated_at": "..."
        }
      }
    }
    """
    @staticmethod
    def get_pose_file_path(folder_path: str) -> Path:
        return Path(folder_path).expanduser().resolve() / "pose.json"

    @classmethod
    def load_poses_file(cls, folder_path: str) -> Dict[str, Any]:
        pose_path = cls.get_pose_file_path(folder_path)
        if not pose_path.exists():
            return {
                "gender": "male",
                "fitting": {
                    "top": "regular",
                    "bottom": "regular"
                },
                "top_fit": "regular",
                "bottom_fit": "regular",
                "images": {}
            }

        try:
            with open(pose_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict):
                return {
                    "gender": "male",
                    "fitting": {
                        "top": "regular",
                        "bottom": "regular"
                    },
                    "top_fit": "regular",
                    "bottom_fit": "regular",
                    "images": {}
                }

            # Handle legacy format where image keys were flat at the root
            if "images" not in data:
                gender = data.get("_folder_defaults", {}).get("gender", data.get("gender", "male"))
                top_fit = data.get("_folder_defaults", {}).get("top_fit", data.get("top_fit", "regular"))
                bottom_fit = data.get("_folder_defaults", {}).get("bottom_fit", data.get("bottom_fit", "regular"))
                images = {}
                for k, v in data.items():
                    if not k.startswith("_") and isinstance(v, dict):
                        if "gender" in v and not data.get("_folder_defaults") and "gender" not in data:
                            gender = v["gender"]
                        if "top_fit" in v and not data.get("_folder_defaults") and "top_fit" not in data:
                            top_fit = v["top_fit"]
                        if "bottom_fit" in v and not data.get("_folder_defaults") and "bottom_fit" not in data:
                            bottom_fit = v["bottom_fit"]

                        clean_v = {k2: v2 for k2, v2 in v.items() if k2 not in ("gender", "top_fit", "bottom_fit", "fitting")}
                        images[k] = clean_v

                return {
                    "gender": gender,
                    "fitting": {
                        "top": top_fit,
                        "bottom": bottom_fit
                    },
                    "top_fit": top_fit,
                    "bottom_fit": bottom_fit,
                    "images": images
                }

            gender = data.get("gender", "male")
            raw_fitting = data.get("fitting") if isinstance(data.get("fitting"), dict) else {}
            top_fit = data.get("top_fit") or raw_fitting.get("top", "regular")
            bottom_fit = data.get("bottom_fit") or raw_fitting.get("bottom", "regular")

            raw_images = data.get("images", {})
            clean_images = {}
            for k, v in raw_images.items():
                if isinstance(v, dict):
                    clean_images[k] = {k2: v2 for k2, v2 in v.items() if k2 not in ("gender", "top_fit", "bottom_fit", "fitting")}

            defaults_confirmed = bool(data.get("defaults_confirmed", False))
            return {
                "gender": gender,
                "fitting": {
                    "top": top_fit,
                    "bottom": bottom_fit
                },
                "top_fit": top_fit,
                "bottom_fit": bottom_fit,
                "defaults_confirmed": defaults_confirmed,
                "images": clean_images
            }
        except Exception as e:
            print(f"Error loading {pose_path}: {e}")
            return {
                "gender": "male",
                "fitting": {
                    "top": "regular",
                    "bottom": "regular"
                },
                "top_fit": "regular",
                "bottom_fit": "regular",
                "defaults_confirmed": False,
                "images": {}
            }

    @classmethod
    def load_poses(cls, folder_path: str) -> Dict[str, Any]:
        """Returns the images dictionary with folder-level defaults populated on each image for convenience."""
        file_data = cls.load_poses_file(folder_path)
        images = file_data.get("images", {})
        for img, data in images.items():
            if isinstance(data, dict):
                data["gender"] = file_data.get("gender", "male")
                data["top_fit"] = file_data.get("top_fit", "regular")
                data["bottom_fit"] = file_data.get("bottom_fit", "regular")
                data["fitting"] = file_data.get("fitting", {
                    "top": data["top_fit"],
                    "bottom": data["bottom_fit"]
                })
        return images

    @classmethod
    def get_folder_defaults(cls, folder_path: str) -> Dict[str, Any]:
        file_data = cls.load_poses_file(folder_path)
        return {
            "gender": file_data.get("gender", "male"),
            "fitting": file_data.get("fitting", {
                "top": file_data.get("top_fit", "regular"),
                "bottom": file_data.get("bottom_fit", "regular")
            }),
            "top_fit": file_data.get("top_fit", "regular"),
            "bottom_fit": file_data.get("bottom_fit", "regular"),
            "defaults_confirmed": file_data.get("defaults_confirmed", False)
        }

    @classmethod
    def save_folder_defaults(
        cls,
        folder_path: str,
        gender: str,
        top_fit: str,
        bottom_fit: str
    ) -> Dict[str, Any]:
        """
        Saves fixed gender and fitting at the root level of pose.json for this photos folder.
        """
        folder = Path(folder_path).expanduser().resolve()
        if not folder.exists() or not folder.is_dir():
            raise ValueError(f"Directory does not exist: {folder_path}")

        pose_path = folder / "pose.json"
        file_data = cls.load_poses_file(folder_path)

        file_data["gender"] = gender
        file_data["fitting"] = {
            "top": top_fit,
            "bottom": bottom_fit
        }
        file_data["top_fit"] = top_fit
        file_data["bottom_fit"] = bottom_fit
        file_data["defaults_confirmed"] = True
        file_data["updated_at"] = datetime.utcnow().isoformat() + "Z"

        # Ensure image entries remain clean of redundant folder-level tags
        for k, v in file_data.get("images", {}).items():
            if isinstance(v, dict):
                v.pop("gender", None)
                v.pop("top_fit", None)
                v.pop("bottom_fit", None)
                v.pop("fitting", None)

        # Atomic write
        tmp_path = folder / "pose.json.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(file_data, f, indent=2, ensure_ascii=False)
        tmp_path.replace(pose_path)

        return {
            "gender": gender,
            "fitting": {
                "top": top_fit,
                "bottom": bottom_fit
            },
            "top_fit": top_fit,
            "bottom_fit": bottom_fit,
            "defaults_confirmed": True
        }

    @classmethod
    def save_image_pose(
        cls,
        folder_path: str,
        image_name: str,
        pose_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Atomically updates the image record inside pose.json["images"] while preserving
        fixed folder-level gender and fitting.
        """
        folder = Path(folder_path).expanduser().resolve()
        if not folder.exists() or not folder.is_dir():
            raise ValueError(f"Directory does not exist: {folder_path}")

        pose_path = folder / "pose.json"
        file_data = cls.load_poses_file(folder_path)

        # Update folder defaults if explicitly provided in pose_data
        if "gender" in pose_data:
            file_data["gender"] = pose_data["gender"]
        if "top_fit" in pose_data:
            file_data["top_fit"] = pose_data["top_fit"]
        if "bottom_fit" in pose_data:
            file_data["bottom_fit"] = pose_data["bottom_fit"]

        file_data["fitting"] = {
            "top": file_data.get("top_fit", "regular"),
            "bottom": file_data.get("bottom_fit", "regular")
        }

        # Clean image-specific entry (bbox, angle, sliders)
        updated_entry = {
            "bbox": pose_data.get("bbox", None),
            "rotation_angle": float(pose_data.get("rotation_angle", 0.0)),
            "rotation_label": str(pose_data.get("rotation_label", "Front (0°)")),
            "sliders": {
                "top_y": float(pose_data.get("sliders", {}).get("top_y", 0.0)),
                "bottom_y": float(pose_data.get("sliders", {}).get("bottom_y", 1.0)),
                "top_y_px": pose_data.get("sliders", {}).get("top_y_px", None),
                "bottom_y_px": pose_data.get("sliders", {}).get("bottom_y_px", None),
                "top_region": str(pose_data.get("sliders", {}).get("top_region", "head")),
                "bottom_region": str(pose_data.get("sliders", {}).get("bottom_region", "foot")),
                "framing": str(pose_data.get("sliders", {}).get("framing", "full_body"))
            },
            "updated_at": datetime.utcnow().isoformat() + "Z"
        }

        file_data["images"][image_name] = updated_entry
        file_data["updated_at"] = datetime.utcnow().isoformat() + "Z"

        # Ensure image entries remain clean of redundant folder-level tags
        for k, v in file_data["images"].items():
            if isinstance(v, dict):
                v.pop("gender", None)
                v.pop("top_fit", None)
                v.pop("bottom_fit", None)
                v.pop("fitting", None)

        # Atomic write
        tmp_path = folder / "pose.json.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(file_data, f, indent=2, ensure_ascii=False)
        tmp_path.replace(pose_path)

        return {
            **updated_entry,
            "gender": file_data["gender"],
            "fitting": file_data["fitting"],
            "top_fit": file_data["top_fit"],
            "bottom_fit": file_data["bottom_fit"]
        }
