import os
import hashlib
from pathlib import Path
from typing import Dict, Any, Optional

from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image, ImageOps


from .scanner import scan_photos_folders, get_folder_details, is_image_file
from .pose_manager import PoseManager
from .detector import detect_human_bbox

app = FastAPI(title="3D Body & Image Pose Visualizer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
CACHE_DIR = BASE_DIR / ".cache" / "thumbs"
IMAGE_CACHE_DIR = BASE_DIR / ".cache" / "images"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
IMAGE_CACHE_DIR.mkdir(parents=True, exist_ok=True)

def orient_image_vertical(im: Image.Image) -> Image.Image:
    """
    Applies EXIF transposition and ensures the image is oriented vertically (portrait).
    If the image is horizontal (width > height), rotates 90 degrees CCW (270 CW) so
    the person is viewed upright.
    """
    try:
        im = ImageOps.exif_transpose(im)
    except Exception:
        pass
    if im.width > im.height:
        im = im.transpose(Image.Transpose.ROTATE_90)
    return im


class ScanRequest(BaseModel):
    path: str

class PoseSaveRequest(BaseModel):
    folder_path: str
    image_name: str
    data: Dict[str, Any]

class DetectRequest(BaseModel):
    path: str

class FolderDefaultsRequest(BaseModel):
    folder_path: str
    gender: str
    top_fit: str
    bottom_fit: str

@app.get("/api/health")
def health():
    return {"status": "ok", "app": "barbie-visualizer"}

@app.post("/api/scan")
def api_scan(req: ScanRequest):
    root_path = req.path.strip()
    if not root_path:
        root_path = str(BASE_DIR)
    
    resolved = Path(root_path).expanduser().resolve()
    if not resolved.exists():
        raise HTTPException(status_code=400, detail=f"Path does not exist: {root_path}")
    
    folders = scan_photos_folders(str(resolved))
    return {
        "root": str(resolved),
        "total_folders": len(folders),
        "folders": folders
    }

@app.get("/api/folder")
def api_get_folder(path: str = Query(...)):
    folder_path = Path(path).expanduser().resolve()
    if not folder_path.exists() or not folder_path.is_dir():
        raise HTTPException(status_code=404, detail="Folder not found")
    
    details = get_folder_details(str(folder_path))
    details["defaults"] = PoseManager.get_folder_defaults(str(folder_path))
    return details

@app.post("/api/detect_bbox")
def api_detect_bbox(req: DetectRequest):
    img_path = Path(req.path).expanduser().resolve()
    if not img_path.exists() or not img_path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    
    bbox = detect_human_bbox(str(img_path))
    if bbox is None:
        raise HTTPException(status_code=422, detail="Subject not detected")
    return {"status": "success", "bbox": bbox}

@app.post("/api/folder_defaults")
def api_save_folder_defaults(req: FolderDefaultsRequest):
    try:
        defaults = PoseManager.save_folder_defaults(
            folder_path=req.folder_path,
            gender=req.gender,
            top_fit=req.top_fit,
            bottom_fit=req.bottom_fit
        )
        return {"status": "success", "defaults": defaults}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.api_route("/api/thumb", methods=["GET", "HEAD"])
def api_get_thumb(path: str = Query(...), max_dim: int = Query(500)):
    file_path = Path(path).expanduser().resolve()
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Generate unique cache key based on path, mtime, max_dim and orientation version
    mtime = file_path.stat().st_mtime
    key = hashlib.md5(f"{file_path}_{mtime}_{max_dim}_v2".encode()).hexdigest()
    thumb_path = CACHE_DIR / f"{key}.jpg"

    if not thumb_path.exists():
        try:
            with Image.open(file_path) as im:
                im = orient_image_vertical(im)
                im = im.convert("RGB")
                im.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
                thumb_path.parent.mkdir(parents=True, exist_ok=True)
                im.save(thumb_path, "JPEG", quality=85)
        except Exception as e:
            # Fallback to serving raw file if thumbnailing fails
            print(f"Error thumbnailing {file_path}: {e}")
            return FileResponse(file_path)

    return FileResponse(thumb_path, media_type="image/jpeg")

@app.api_route("/api/image", methods=["GET", "HEAD"])
def api_get_image(path: str = Query(...)):
    file_path = Path(path).expanduser().resolve()
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    
    mtime = file_path.stat().st_mtime
    key = hashlib.md5(f"{file_path}_{mtime}_v2".encode()).hexdigest()
    oriented_path = IMAGE_CACHE_DIR / f"{key}.jpg"

    if oriented_path.exists():
        return FileResponse(oriented_path, media_type="image/jpeg")

    try:
        with Image.open(file_path) as im:
            exif = im.getexif()
            orientation = exif.get(0x0112)
            needs_orient = (orientation is not None and orientation != 1) or (im.width > im.height)
            if needs_orient:
                im = orient_image_vertical(im)
                im = im.convert("RGB")
                oriented_path.parent.mkdir(parents=True, exist_ok=True)
                im.save(oriented_path, "JPEG", quality=90)
                return FileResponse(oriented_path, media_type="image/jpeg")
    except Exception as e:
        print(f"Error orienting full image {file_path}: {e}")

    suffix = file_path.suffix.lower()
    media_type = "image/jpeg"
    if suffix == ".png":
        media_type = "image/png"
    elif suffix == ".webp":
        media_type = "image/webp"

    return FileResponse(file_path, media_type=media_type)


@app.post("/api/pose")
def api_save_pose(req: PoseSaveRequest):
    try:
        updated = PoseManager.save_image_pose(
            folder_path=req.folder_path,
            image_name=req.image_name,
            pose_data=req.data
        )
        return {"status": "success", "image_name": req.image_name, "pose": updated}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Mount static files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.api_route("/", methods=["GET", "HEAD"])
def index():
    return FileResponse(STATIC_DIR / "index.html")
