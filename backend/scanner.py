import os
from pathlib import Path
from typing import List, Dict, Any
import json

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif', '.mpo'}

def is_image_file(filename: str) -> bool:
    return Path(filename).suffix.lower() in IMAGE_EXTENSIONS

def scan_photos_folders(root_dir: str) -> List[Dict[str, Any]]:
    """
    Recursively scans root_dir to discover any directory named 'PHOTOS' (case-insensitive)
    at ANY depth (e.g. date/model_name/PHOTOS or .../.../PHOTOS).
    For each found folder, inspects image count and annotation progress in pose.json.
    """
    results = []
    root_path = Path(root_dir).expanduser().resolve()
    
    if not root_path.exists() or not root_path.is_dir():
        return []

    for dirpath, dirnames, filenames in os.walk(root_path):
        current_dir_name = os.path.basename(dirpath)
        
        # Check if current directory is named PHOTOS (case-insensitive)
        if current_dir_name.upper() == "PHOTOS":
            # Collect valid image files
            images = [f for f in filenames if is_image_file(f) and not f.startswith('.')]
            images.sort()
            
            # Check pose.json if it exists
            pose_json_path = os.path.join(dirpath, "pose.json")
            annotated_count = 0
            gender = "male"
            top_fit = "regular"
            bottom_fit = "regular"
            defaults_confirmed = False

            if os.path.exists(pose_json_path):
                try:
                    with open(pose_json_path, 'r', encoding='utf-8') as f:
                        pose_data = json.load(f)
                    
                    if isinstance(pose_data, dict):
                        gender = pose_data.get("gender", "male")
                        top_fit = pose_data.get("top_fit", "regular")
                        bottom_fit = pose_data.get("bottom_fit", "regular")
                        defaults_confirmed = bool(pose_data.get("defaults_confirmed", False))
                        
                        img_dict = pose_data.get("images", {})
                        if not img_dict:
                            img_dict = {k: v for k, v in pose_data.items() if not k.startswith("_")}

                        # Count annotated images
                        for img in images:
                            if img in img_dict and isinstance(img_dict[img], dict):
                                annotated_count += 1
                except Exception:
                    pass

            # Relative path from root for display
            try:
                rel_path = os.path.relpath(dirpath, root_path)
            except ValueError:
                rel_path = dirpath

            parts = Path(rel_path).parts
            display_label = " / ".join(parts[:-1]) if len(parts) > 1 else rel_path

            results.append({
                "path": str(dirpath),
                "rel_path": str(rel_path),
                "display_label": display_label,
                "total_images": len(images),
                "annotated_count": annotated_count,
                "is_complete": len(images) > 0 and annotated_count == len(images),
                "sample_images": images[:5],
                "gender": gender,
                "top_fit": top_fit,
                "bottom_fit": bottom_fit,
                "defaults_confirmed": defaults_confirmed
            })

    # Sort results by rel_path
    results.sort(key=lambda x: x["rel_path"])
    return results

def get_folder_details(folder_path: str) -> Dict[str, Any]:
    """
    Returns image list, folder-wide garment/gender settings, and per-image annotations.
    """
    from .pose_manager import PoseManager
    path = Path(folder_path).expanduser().resolve()
    if not path.exists() or not path.is_dir():
        return {"error": f"Folder not found: {folder_path}", "images": [], "poses": {}}

    filenames = os.listdir(path)
    images = [f for f in filenames if is_image_file(f) and not f.startswith('.')]
    images.sort()

    file_data = PoseManager.load_poses_file(str(path))
    poses = PoseManager.load_poses(str(path))

    return {
        "folder_path": str(path),
        "folder_name": path.name,
        "images": images,
        "total_images": len(images),
        "gender": file_data["gender"],
        "fitting": file_data["fitting"],
        "top_fit": file_data["top_fit"],
        "bottom_fit": file_data["bottom_fit"],
        "defaults_confirmed": file_data.get("defaults_confirmed", False),
        "defaults": {
            "gender": file_data["gender"],
            "fitting": file_data["fitting"],
            "top_fit": file_data["top_fit"],
            "bottom_fit": file_data["bottom_fit"],
            "defaults_confirmed": file_data.get("defaults_confirmed", False)
        },
        "poses": poses
    }

