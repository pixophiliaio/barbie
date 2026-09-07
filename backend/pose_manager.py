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
                top_fit = data.get("_folder_defaults", {}).get("top_fit", data.get("top_fit", "regular"))
                bottom_fit = data.get("_folder_defaults", {}).get("bottom_fit", data.get("bottom_fit", "regular"))
                images = {}
                for k, v in data.items():
                    if not k.startswith("_") and isinstance(v, dict):
                        if "top_fit" in v and not data.get("_folder_defaults") and "top_fit" not in data:
                            top_fit = v["top_fit"]
                        if "bottom_fit" in v and not data.get("_folder_defaults") and "bottom_fit" not in data:
                            bottom_fit = v["bottom_fit"]

                        clean_v = {k2: v2 for k2, v2 in v.items() if k2 not in ("gender", "top_fit", "bottom_fit", "fitting")}
                        images[k] = clean_v

                res = {
                    "fitting": {
                        "top": top_fit,
                        "bottom": bottom_fit
                    },
                    "top_fit": top_fit,
                    "bottom_fit": bottom_fit,
                    "images": images
                }
                if "gender" in data:
                    res["gender"] = data["gender"]
                return res

            raw_fitting = data.get("fitting") if isinstance(data.get("fitting"), dict) else {}
            top_fit = data.get("top_fit") or raw_fitting.get("top", "regular")
            bottom_fit = data.get("bottom_fit") or raw_fitting.get("bottom", "regular")

            raw_images = data.get("images", {})
            clean_images = {}
            for k, v in raw_images.items():
                if isinstance(v, dict):
                    clean_images[k] = {k2: v2 for k2, v2 in v.items() if k2 not in ("gender", "top_fit", "bottom_fit", "fitting")}

            defaults_confirmed = bool(data.get("defaults_confirmed", False))
            res = {
                "fitting": {
                    "top": top_fit,
                    "bottom": bottom_fit
                },
                "top_fit": top_fit,
                "bottom_fit": bottom_fit,
                "defaults_confirmed": defaults_confirmed,
                "images": clean_images
            }
            if "gender" in data:
                res["gender"] = data["gender"]
            return res
        except Exception as e:
            print(f"Error loading {pose_path}: {e}")
            return {
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
                data.pop("gender", None)
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
        *args,
        top_fit: Optional[str] = None,
        bottom_fit: Optional[str] = None,
        gender: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Saves fixed fitting defaults at the root level of pose.json for this photos folder.
        Gender is used ONLY for 3D model visualization and is NOT persisted to pose.json.
        """
        if len(args) == 3:
            gender = args[0]
            top_fit = args[1]
            bottom_fit = args[2]
        elif len(args) == 2:
            top_fit = args[0]
            bottom_fit = args[1]
        elif len(args) == 1:
            if args[0] in ("male", "female"):
                gender = args[0]
            else:
                top_fit = args[0]

        top_fit = top_fit or kwargs.get("top_fit") or "regular"
        bottom_fit = bottom_fit or kwargs.get("bottom_fit") or "regular"
        gender = gender or kwargs.get("gender") or "male"

        folder = Path(folder_path).expanduser().resolve()
        if not folder.exists() or not folder.is_dir():
            raise ValueError(f"Directory does not exist: {folder_path}")

        pose_path = folder / "pose.json"
        file_data = cls.load_poses_file(folder_path)

        # STRICT: gender is NOT written to pose.json!
        file_data.pop("gender", None)
        file_data["fitting"] = {
            "top": top_fit,
            "bottom": bottom_fit
        }
        file_data["top_fit"] = top_fit
        file_data["bottom_fit"] = bottom_fit
        file_data["defaults_confirmed"] = True
        file_data["updated_at"] = datetime.utcnow().isoformat() + "Z"

        # Ensure image entries remain clean of redundant folder-level tags and gender
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
        Atomically updates the image record inside pose.json["images"].
        Gender is used ONLY for 3D model visualization and is NOT persisted to pose.json.
        """
        folder = Path(folder_path).expanduser().resolve()
        if not folder.exists() or not folder.is_dir():
            raise ValueError(f"Directory does not exist: {folder_path}")

        pose_path = folder / "pose.json"
        file_data = cls.load_poses_file(folder_path)

        # Update folder defaults if explicitly provided in pose_data (except gender!)
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

        # STRICT: gender is NOT written to pose.json!
        file_data.pop("gender", None)

        # Ensure image entries remain clean of redundant folder-level tags and gender
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

        res = {
            **updated_entry,
            "fitting": file_data["fitting"],
            "top_fit": file_data["top_fit"],
            "bottom_fit": file_data["bottom_fit"]
        }
        if "gender" in pose_data:
            res["gender"] = pose_data["gender"]
        elif "gender" in file_data:
            res["gender"] = file_data["gender"]
        return res
