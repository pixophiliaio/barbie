import time
from pathlib import Path
from typing import Dict, Any, Optional
import cv2
import numpy as np
from PIL import Image, ImageOps

_model = None
_transforms = None

def _orient_image_vertical(im: Image.Image) -> Image.Image:
    try:
        im = ImageOps.exif_transpose(im)
    except Exception:
        pass
    if im.width > im.height:
        im = im.transpose(Image.Transpose.ROTATE_90)
    return im

def _get_detector_model():
    global _model, _transforms
    if _model is None:
        try:
            import torch
            from torchvision.models.detection import (
                ssdlite320_mobilenet_v3_large,
                SSDLite320_MobileNet_V3_Large_Weights
            )
            weights = SSDLite320_MobileNet_V3_Large_Weights.DEFAULT
            model = ssdlite320_mobilenet_v3_large(weights=weights)
            model.eval()
            _model = model
            _transforms = weights.transforms()
        except Exception as e:
            print(f"Warning: SSDLite MobileNetV3 model not available: {e}")
            _model = False
            _transforms = False
    return _model, _transforms


def _detect_ssdlite(im: Image.Image) -> Optional[Dict[str, Any]]:
    """Deep learning person detector using SSDLite MobileNetV3 (robust against shadows & gradients)."""
    model, transforms = _get_detector_model()
    if not model or not transforms:
        return None

    import torch
    orig_w, orig_h = im.size
    tensor = transforms(im).unsqueeze(0)

    with torch.no_grad():
        preds = model(tensor)[0]

    # Class 1 = person in COCO dataset
    mask = (preds["labels"] == 1) & (preds["scores"] >= 0.35)
    boxes = preds["boxes"][mask]
    scores = preds["scores"][mask]

    if len(boxes) == 0:
        return None

    # Pick the best person detection (largest and most centered in frame)
    best_box = None
    best_priority = -1.0
    best_conf = 0.0

    for box, score in zip(boxes, scores):
        b = box.tolist()
        w = max(1.0, b[2] - b[0])
        h = max(1.0, b[3] - b[1])
        area = (w / orig_w) * (h / orig_h)
        cx = ((b[0] + b[2]) / 2.0) / orig_w

        # Prioritize prominent, centered human subject over background clutter
        priority = area * (1.0 - 0.4 * abs(cx - 0.5)) * float(score)
        if priority > best_priority:
            best_priority = priority
            best_box = b
            best_conf = float(score)

    if best_box is None:
        return None

    # Add small breathing padding (1.5%)
    bw = best_box[2] - best_box[0]
    bh = best_box[3] - best_box[1]
    pad_w = bw * 0.015
    pad_h = bh * 0.015

    norm_x1 = max(0.0, (best_box[0] - pad_w) / orig_w)
    norm_y1 = max(0.0, (best_box[1] - pad_h) / orig_h)
    norm_x2 = min(1.0, (best_box[2] + pad_w) / orig_w)
    norm_y2 = min(1.0, (best_box[3] + pad_h) / orig_h)

    x1 = int(round(norm_x1 * orig_w))
    y1 = int(round(norm_y1 * orig_h))
    x2 = int(round(norm_x2 * orig_w))
    y2 = int(round(norm_y2 * orig_h))

    return {
        "x1": x1,
        "y1": y1,
        "x2": x2,
        "y2": y2,
        "norm_x1": round(norm_x1, 4),
        "norm_y1": round(norm_y1, 4),
        "norm_x2": round(norm_x2, 4),
        "norm_y2": round(norm_y2, 4),
        "width": abs(x2 - x1),
        "height": abs(y2 - y1),
        "confidence": round(best_conf, 3),
    }


def _detect_fallback_contour(path: Path) -> Optional[Dict[str, Any]]:
    """Heuristic fallback using color differences and morphological filtering."""
    img = cv2.imread(str(path))
    if img is None:
        return None

    if img.shape[1] > img.shape[0]:
        img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)

    orig_h, orig_w = img.shape[:2]
    max_dim = 480.0
    scale = max_dim / max(orig_h, orig_w)
    small_w = int(orig_w * scale)
    small_h = int(orig_h * scale)
    small = cv2.resize(img, (small_w, small_h), interpolation=cv2.INTER_AREA)

    # Sample backdrop color from outer corners
    corner_size = max(5, int(25 * scale * 2))
    corner_tl = small[:corner_size, :corner_size]
    corner_tr = small[:corner_size, -corner_size:]
    corner_bl = small[-corner_size:, :corner_size]
    corner_br = small[-corner_size:, -corner_size:]

    sample_corners = np.concatenate([corner_tl, corner_tr, corner_bl, corner_br], axis=0)
    bg_color = np.median(sample_corners, axis=(0, 1))

    diff = np.linalg.norm(small.astype(np.float32) - bg_color, axis=2)
    _, mask = cv2.threshold(diff.astype(np.uint8), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    min_area = (small_w * small_h) * 0.05
    valid_contours = [c for c in contours if cv2.contourArea(c) > min_area]

    if not valid_contours:
        largest = max(contours, key=cv2.contourArea)
        x, y, bw, bh = cv2.boundingRect(largest)
    else:
        # Pick the most central large contour
        best_c = None
        best_val = -1
        for c in valid_contours:
            bx, by, bw, bh = cv2.boundingRect(c)
            if bw > small_w * 0.95:
                continue
            cx = bx + bw / 2.0
            dist_center = abs(cx - small_w / 2.0)
            score = cv2.contourArea(c) * (1.0 - (dist_center / small_w))
            if score > best_val:
                best_val = score
                best_c = c

        if best_c is not None:
            x, y, bw, bh = cv2.boundingRect(best_c)
        else:
            largest = max(contours, key=cv2.contourArea)
            x, y, bw, bh = cv2.boundingRect(largest)

    pad_x = int(bw * 0.02)
    pad_y = int(bh * 0.02)

    norm_x1 = max(0.0, (x - pad_x) / small_w)
    norm_y1 = max(0.0, (y - pad_y) / small_h)
    norm_x2 = min(1.0, (x + bw + pad_x) / small_w)
    norm_y2 = min(1.0, (y + bh + pad_y) / small_h)

    x1 = int(round(norm_x1 * orig_w))
    y1 = int(round(norm_y1 * orig_h))
    x2 = int(round(norm_x2 * orig_w))
    y2 = int(round(norm_y2 * orig_h))

    return {
        "x1": x1,
        "y1": y1,
        "x2": x2,
        "y2": y2,
        "norm_x1": round(norm_x1, 4),
        "norm_y1": round(norm_y1, 4),
        "norm_x2": round(norm_x2, 4),
        "norm_y2": round(norm_y2, 4),
        "width": abs(x2 - x1),
        "height": abs(y2 - y1),
        "confidence": 0.7,
    }


def detect_human_bbox(image_path: str) -> Optional[Dict[str, Any]]:
    """
    High-precision human bounding box detector for studio photoshoots.
    Uses SSDLite MobileNetV3 deep learning to accurately isolate the model from
    head to feet without getting fooled by studio wall lighting, cast shadows, or backdrops.
    """
    path = Path(image_path).expanduser().resolve()
    if not path.exists():
        return None

    t0 = time.time()

    # 1. Primary: Deep learning SSDLite detector
    try:
        im = Image.open(path).convert("RGB")
        im = _orient_image_vertical(im)
        res = _detect_ssdlite(im)
        if res is not None:
            res["detection_time_ms"] = round((time.time() - t0) * 1000, 1)
            return res
    except Exception as e:
        print(f"SSDLite detection failed: {e}")

    # 2. Heuristic fallback
    res = _detect_fallback_contour(path)
    if res is not None:
        res["detection_time_ms"] = round((time.time() - t0) * 1000, 1)
    return res
