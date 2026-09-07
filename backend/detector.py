import time
from pathlib import Path
from typing import Dict, Any, Optional
import cv2
import numpy as np

def detect_human_bbox(image_path: str) -> Optional[Dict[str, Any]]:
    """
    Ultra-fast CPU human bounding box detector (takes ~5-15ms on downscaled image).
    Extracts the subject from solid/neutral studio backdrops using adaptive color
    distance, Otsu thresholding, and morphological contour filtering.
    """
    path = Path(image_path).expanduser().resolve()
    if not path.exists():
        return None

    t0 = time.time()
    img = cv2.imread(str(path))
    if img is None:
        return None

    # Ensure image is vertical (portrait). If width > height, rotate 90 CCW
    if img.shape[1] > img.shape[0]:
        img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)

    orig_h, orig_w = img.shape[:2]

    # Downscale to 480px max dimension for lightning-fast CPU execution (<10ms)
    max_dim = 480.0
    scale = max_dim / max(orig_h, orig_w)
    small_w = int(orig_w * scale)
    small_h = int(orig_h * scale)
    small = cv2.resize(img, (small_w, small_h), interpolation=cv2.INTER_AREA)

    # Sample backdrop color from 4 outer corners
    corner_size = max(5, int(25 * scale * 2))
    corner_tl = small[:corner_size, :corner_size]
    corner_tr = small[:corner_size, -corner_size:]
    corner_bl = small[-corner_size:, :corner_size]
    corner_br = small[-corner_size:, -corner_size:]

    sample_corners = np.concatenate([corner_tl, corner_tr, corner_bl, corner_br], axis=0)
    bg_color = np.median(sample_corners, axis=(0, 1))

    # Euclidean color difference from backdrop
    diff = np.linalg.norm(small.astype(np.float32) - bg_color, axis=2)

    # Otsu automatic thresholding
    _, mask = cv2.threshold(diff.astype(np.uint8), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Morphological filtering: close interior gaps (e.g. textured clothes), open to remove floor speckles
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    # Filter out tiny noise contours; find largest subject contour
    min_area = (small_w * small_h) * 0.03 # At least 3% of photo area
    valid_contours = [c for c in contours if cv2.contourArea(c) > min_area]

    if not valid_contours:
        # Fallback to largest contour available
        largest = max(contours, key=cv2.contourArea)
        x, y, bw, bh = cv2.boundingRect(largest)
    else:
        # Union all valid body contours if subject is split by background highlights
        x_min, y_min = small_w, small_h
        x_max, y_max = 0, 0
        for c in valid_contours:
            bx, by, bw, bh = cv2.boundingRect(c)
            x_min = min(x_min, bx)
            y_min = min(y_min, by)
            x_max = max(x_max, bx + bw)
            y_max = max(y_max, by + bh)
        x = x_min
        y = y_min
        bw = x_max - x_min
        bh = y_max - y_min

    # Add 2% breathing margin
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

    elapsed_ms = (time.time() - t0) * 1000

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
        "detection_time_ms": round(elapsed_ms, 1)
    }
