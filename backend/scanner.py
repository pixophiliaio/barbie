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
        "gender": file_data.get("gender", "male"),
        "fitting": file_data["fitting"],
        "top_fit": file_data["top_fit"],
        "bottom_fit": file_data["bottom_fit"],
        "defaults_confirmed": file_data.get("defaults_confirmed", False),
        "is_complete": file_data.get("is_complete", len(images) > 0 and len([k for k in images if k in poses]) == len(images)),
        "defaults": {
            "gender": file_data.get("gender", "male"),
            "fitting": file_data["fitting"],
            "top_fit": file_data["top_fit"],
            "bottom_fit": file_data["bottom_fit"],
            "defaults_confirmed": file_data.get("defaults_confirmed", False),
            "is_complete": file_data.get("is_complete", False)
        },
        "poses": poses
    }


def scan_model_garments(model_dir: str) -> Dict[str, Any]:
    """
    Scans a model folder (e.g. base/date1/model_name1/) to discover all garment types
    and inspect their photos folder, first image thumbnail, and completion status.
    """
    model_path = Path(model_dir).expanduser().resolve()
    if not model_path.exists() or not model_path.is_dir():
        raise ValueError(f"Model directory not found: {model_dir}")

    garments = []
    
    # Check if model_path itself directly contains photos/ (edge case)
    direct_photos = None
    for entry in model_path.iterdir():
        if entry.is_dir() and entry.name.upper() == "PHOTOS":
            direct_photos = entry
            break

    if direct_photos:
        # Single photoshoot at root
        candidate_dirs = [(model_path.name, direct_photos)]
    else:
        # Normal structure: model_dir/garment_type_x/photos
        candidate_dirs = []
        for child in sorted(model_path.iterdir(), key=lambda p: p.name.lower()):
            if child.is_dir() and not child.name.startswith('.'):
                for sub in child.iterdir():
                    if sub.is_dir() and sub.name.upper() == "PHOTOS":
                        candidate_dirs.append((child.name, sub))
                        break

    for garment_name, photos_dir in candidate_dirs:
        # Collect valid image files
        filenames = [f for f in os.listdir(photos_dir) if is_image_file(f) and not f.startswith('.')]
        filenames.sort()

        pose_json_path = photos_dir / "pose.json"
        annotated_count = 0
        top_fit = "regular"
        bottom_fit = "regular"
        defaults_confirmed = False
        is_complete = False
        updated_at = None

        if pose_json_path.exists():
            try:
                with open(pose_json_path, 'r', encoding='utf-8') as f:
                    pose_data = json.load(f)
                if isinstance(pose_data, dict):
                    top_fit = pose_data.get("top_fit", "regular")
                    bottom_fit = pose_data.get("bottom_fit", "regular")
                    defaults_confirmed = bool(pose_data.get("defaults_confirmed", False))
                    updated_at = pose_data.get("updated_at")

                    img_dict = pose_data.get("images", {})
                    if not img_dict:
                        img_dict = {k: v for k, v in pose_data.items() if not k.startswith("_")}

                    for img in filenames:
                        if img in img_dict and isinstance(img_dict[img], dict):
                            annotated_count += 1

                    if "is_complete" in pose_data:
                        is_complete = bool(pose_data["is_complete"])
                    else:
                        is_complete = len(filenames) > 0 and annotated_count == len(filenames)
            except Exception:
                pass
        else:
            is_complete = False

        first_image = filenames[0] if filenames else None
        first_image_path = str(photos_dir / first_image) if first_image else None

        garments.append({
            "garment_name": garment_name,
            "garment_path": str(photos_dir.parent),
            "photos_path": str(photos_dir),
            "rel_path": os.path.relpath(str(photos_dir), str(model_path)),
            "total_images": len(filenames),
            "annotated_count": annotated_count,
            "is_complete": is_complete,
            "first_image": first_image,
            "first_image_path": first_image_path,
            "sample_images": filenames[:5],
            "top_fit": top_fit,
            "bottom_fit": bottom_fit,
            "defaults_confirmed": defaults_confirmed,
            "updated_at": updated_at
        })

    completed_count = sum(1 for g in garments if g["is_complete"])
    total_images_all = sum(g["total_images"] for g in garments)
    annotated_images_all = sum(g["annotated_count"] for g in garments)

    return {
        "model_name": model_path.name,
        "model_path": str(model_path),
        "total_garments": len(garments),
        "completed_garments": completed_count,
        "total_images": total_images_all,
        "annotated_images": annotated_images_all,
        "is_all_complete": len(garments) > 0 and completed_count == len(garments),
        "garments": garments
    }


def scan_models(base_dir: str) -> List[Dict[str, Any]]:
    """
    Recursively discovers model folders under base_dir.
    A model folder is defined as a folder containing subdirectories that have 'photos'/'PHOTOS'.
    """
    base_path = Path(base_dir).expanduser().resolve()
    if not base_path.exists() or not base_path.is_dir():
        return []

    discovered_models = []
    seen_paths = set()

    for dirpath, dirnames, filenames in os.walk(base_path):
        current_dir = Path(dirpath)
        # Check if current_dir has any child directory that contains 'photos' / 'PHOTOS'
        has_garment = False
        garment_count = 0
        try:
            for child in current_dir.iterdir():
                if child.is_dir() and not child.name.startswith('.'):
                    for sub in child.iterdir():
                        if sub.is_dir() and sub.name.upper() == "PHOTOS":
                            has_garment = True
                            garment_count += 1
                            break
        except PermissionError:
            continue

        if has_garment and str(current_dir) not in seen_paths:
            seen_paths.add(str(current_dir))
            try:
                rel = os.path.relpath(str(current_dir), str(base_path))
            except ValueError:
                rel = str(current_dir)

            discovered_models.append({
                "model_name": current_dir.name,
                "model_path": str(current_dir),
                "rel_path": rel,
                "garment_count": garment_count
            })

    discovered_models.sort(key=lambda x: x["rel_path"])
    return discovered_models

