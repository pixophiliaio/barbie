// API client for Barbie Pose Visualizer

const API = {
  async health() {
    const res = await fetch('/api/health');
    return res.json();
  },

  async scanDirectory(path) {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Scan failed');
    }
    return res.json();
  },

  async getFolderDetails(folderPath) {
    const res = await fetch(`/api/folder?path=${encodeURIComponent(folderPath)}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to fetch folder');
    }
    return res.json();
  },

  getThumbUrl(filePath, maxDim = 500) {
    return `/api/thumb?path=${encodeURIComponent(filePath)}&max_dim=${maxDim}`;
  },

  getImageUrl(filePath) {
    return `/api/image?path=${encodeURIComponent(filePath)}`;
  },

  async savePose(folderPath, imageName, poseData) {
    const res = await fetch('/api/pose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folder_path: folderPath,
        image_name: imageName,
        data: poseData
      })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to save pose');
    }
    return res.json();
  },

  async detectBBox(imagePath) {
    const res = await fetch('/api/detect_bbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: imagePath })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Detection failed');
    }
    return res.json();
  },

  async detectHumanBBox(imagePath) {
    return this.detectBBox(imagePath);
  },

  async saveFolderDefaults(folderPath, gender, topFit, bottomFit) {
    const res = await fetch('/api/folder_defaults', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folder_path: folderPath,
        gender,
        top_fit: topFit,
        bottom_fit: bottomFit
      })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to save folder defaults');
    }
    return res.json();
  }
};
