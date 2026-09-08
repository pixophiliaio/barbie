// Admin Visualizer Client Logic

class AdminApp {
  constructor() {
    this.currentModelPath = null;
    this.modelData = null;
    this.currentGarment = null;
    this.currentFolderData = null;
    this.currentInspectIndex = -1;

    // DOM Elements
    this.modelPathInput = document.getElementById('adminModelPath');
    this.btnLoadModel = document.getElementById('btnLoadModel');
    this.modelSelect = document.getElementById('adminModelSelect');

    // Page 1: Garment Overview
    this.garmentsSection = document.getElementById('garmentsSection');
    this.garmentsGrid = document.getElementById('garmentsGrid');
    this.modelTitle = document.getElementById('modelTitle');
    this.modelBreadcrumb = document.getElementById('modelBreadcrumb');
    this.statGarmentsCount = document.getElementById('statGarmentsCount');
    this.statCompletedCount = document.getElementById('statCompletedCount');
    this.statPhotosCount = document.getElementById('statPhotosCount');
    this.statAnnotatedCount = document.getElementById('statAnnotatedCount');

    // Page 2: Comprehensive View
    this.comprehensiveSection = document.getElementById('comprehensiveSection');
    this.btnBackToGarments = document.getElementById('btnBackToGarments');
    this.compGarmentTitle = document.getElementById('compGarmentTitle');
    this.compStatusBadge = document.getElementById('compStatusBadge');
    this.compGarmentMeta = document.getElementById('compGarmentMeta');
    this.btnToggleFolderComplete = document.getElementById('btnToggleFolderComplete');
    this.comprehensivePhotosGrid = document.getElementById('comprehensivePhotosGrid');

    // Inspection Modal (Read-Only)
    this.inspectionModal = document.getElementById('inspectionModal');
    this.btnCloseInspection = document.getElementById('btnCloseInspection');
    this.btnInspectPrev = document.getElementById('btnInspectPrev');
    this.btnInspectNext = document.getElementById('btnInspectNext');
    this.inspectPhotoName = document.getElementById('inspectPhotoName');
    this.inspectPhotoIndex = document.getElementById('inspectPhotoIndex');
    this.inspectImg = document.getElementById('inspectImg');
    this.inspectBBoxOverlay = document.getElementById('inspectBBoxOverlay');
    this.inspectAngleVal = document.getElementById('inspectAngleVal');
    this.inspectSlidersVal = document.getElementById('inspectSlidersVal');
    this.inspectFitsVal = document.getElementById('inspectFitsVal');

    this.init();
  }

  async init() {
    this.bindEvents();
    await this.discoverModels();
  }

  bindEvents() {
    // Search / Load Model
    this.btnLoadModel?.addEventListener('click', () => this.handleLoadInput());
    this.modelPathInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleLoadInput();
    });

    this.modelSelect?.addEventListener('change', (e) => {
      if (e.target.value) {
        this.modelPathInput.value = e.target.value;
        this.loadModel(e.target.value);
      }
    });

    // Page Navigation
    this.btnBackToGarments?.addEventListener('click', () => this.backToGarments());

    // Toggle Complete Flag
    this.btnToggleFolderComplete?.addEventListener('click', () => this.toggleFolderComplete());

    // Inspection Modal Navigation
    this.btnCloseInspection?.addEventListener('click', () => this.closeInspection());
    this.btnInspectPrev?.addEventListener('click', () => this.navigateInspect(-1));
    this.btnInspectNext?.addEventListener('click', () => this.navigateInspect(1));

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.inspectionModal?.classList.contains('active')) {
          this.closeInspection();
        } else if (this.comprehensiveSection?.classList.contains('active')) {
          this.backToGarments();
        }
      } else if (this.inspectionModal?.classList.contains('active')) {
        if (e.key === 'ArrowLeft') this.navigateInspect(-1);
        if (e.key === 'ArrowRight') this.navigateInspect(1);
      }
    });
  }

  async discoverModels() {
    try {
      const res = await fetch('/api/admin/scan_models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '' })
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.models && data.models.length > 0) {
        this.modelSelect.innerHTML = '<option value="">-- Discovered Models --</option>';
        data.models.forEach((m) => {
          const opt = document.createElement('option');
          opt.value = m.model_path;
          opt.textContent = `${m.rel_path} (${m.garment_count} garments)`;
          this.modelSelect.appendChild(opt);
        });

        // Auto load first model if input is empty
        if (!this.modelPathInput.value) {
          const first = data.models[0];
          this.modelPathInput.value = first.model_path;
          this.modelSelect.value = first.model_path;
          this.loadModel(first.model_path);
        }
      } else {
        this.modelSelect.innerHTML = '<option value="">No models detected</option>';
      }
    } catch (err) {
      console.warn('Error discovering models:', err);
    }
  }

  handleLoadInput() {
    const p = this.modelPathInput?.value.trim();
    if (p) this.loadModel(p);
  }

  async loadModel(modelPath) {
    if (!modelPath) return;
    this.currentModelPath = modelPath;

    try {
      const res = await fetch('/api/admin/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_path: modelPath })
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.detail || 'Failed to load model path');
        return;
      }

      this.modelData = await res.json();
      this.updateModelBanner();
      this.renderGarmentsGrid(this.modelData.garments || []);
      this.showSection('garments');
    } catch (err) {
      console.error('Failed to load model:', err);
      alert('Error scanning model directory: ' + err.message);
    }
  }

  updateModelBanner() {
    if (!this.modelData) return;
    const m = this.modelData;
    if (this.modelTitle) this.modelTitle.textContent = m.model_name || 'Model Overview';
    if (this.modelBreadcrumb) this.modelBreadcrumb.textContent = m.model_path || '';

    if (this.statGarmentsCount) this.statGarmentsCount.textContent = m.total_garments || 0;
    if (this.statCompletedCount) {
      const pct = m.total_garments > 0 ? Math.round((m.completed_garments / m.total_garments) * 100) : 0;
      this.statCompletedCount.textContent = `${m.completed_garments || 0} / ${m.total_garments || 0} (${pct}%)`;
    }
    if (this.statPhotosCount) this.statPhotosCount.textContent = m.total_images || 0;
    if (this.statAnnotatedCount) {
      const pctPhotos = m.total_images > 0 ? Math.round((m.annotated_images / m.total_images) * 100) : 0;
      this.statAnnotatedCount.textContent = `${m.annotated_images || 0} / ${m.total_images || 0} (${pctPhotos}%)`;
    }
  }

  renderGarmentsGrid(garments) {
    if (!this.garmentsGrid) return;
    this.garmentsGrid.innerHTML = '';

    if (!garments || garments.length === 0) {
      this.garmentsGrid.innerHTML = `
        <div style="grid-column: 1/-1; padding: 48px; text-align: center; color: var(--text-muted);">
          <h3>No garment types found with photos directory</h3>
          <p style="margin-top: 8px; font-size: 0.9rem;">Ensure subdirectories contain a "photos" folder with photoshoot images.</p>
        </div>
      `;
      return;
    }

    garments.forEach((g) => {
      const card = document.createElement('div');
      card.className = 'garment-card';

      // 1st photo thumbnail url
      const thumbUrl = g.first_image_path
        ? `/api/thumb?path=${encodeURIComponent(g.first_image_path)}&max_dim=700`
        : '';

      // Status pill
      let statusClass = 'pending';
      let statusLabel = '● Pending';
      if (g.is_complete) {
        statusClass = 'complete';
        statusLabel = '✓ Completed';
      } else if (g.annotated_count > 0) {
        statusClass = 'in-progress';
        statusLabel = `⚡ In Progress (${g.annotated_count}/${g.total_images})`;
      }

      // Progress bar pct
      const pct = g.total_images > 0 ? Math.round((g.annotated_count / g.total_images) * 100) : 0;

      card.innerHTML = `
        <div class="garment-thumb-wrap">
          ${thumbUrl ? `<img class="garment-thumb-img" src="${thumbUrl}" alt="${g.garment_name}" loading="lazy" />` : '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:var(--text-dim);">No Photos</div>'}
          <span class="garment-thumb-badge">1st Photo</span>
          <span class="garment-status-pill ${statusClass}">${statusLabel}</span>
        </div>
        <div class="garment-card-body">
          <div class="garment-card-title" title="${g.garment_name}">${g.garment_name}</div>
          <div class="garment-progress-track">
            <div class="garment-progress-bar" style="width: ${pct}%;"></div>
          </div>
          <div class="garment-card-meta">
            <span>${g.annotated_count} / ${g.total_images} photos (${pct}%)</span>
            <div class="garment-tags">
              <span class="garment-tag">Top: ${g.top_fit}</span>
              <span class="garment-tag">Btm: ${g.bottom_fit}</span>
            </div>
          </div>
          <div class="garment-cta-link">
            Review Comprehensive View →
          </div>
        </div>
      `;

      card.addEventListener('click', () => this.openComprehensiveView(g));
      this.garmentsGrid.appendChild(card);
    });
  }

  async openComprehensiveView(garment) {
    this.currentGarment = garment;
    this.showSection('comprehensive');

    if (this.compGarmentTitle) {
      this.compGarmentTitle.innerHTML = `${this.modelData?.model_name || 'Model'} / <strong>${garment.garment_name}</strong>`;
    }

    this.updateCompStatusBadge(garment.is_complete, garment.annotated_count, garment.total_images);

    if (this.compGarmentMeta) {
      this.compGarmentMeta.innerHTML = `
        <span class="garment-tag">Photos: ${garment.total_images}</span>
        <span class="garment-tag">Annotated: ${garment.annotated_count}</span>
        <span class="garment-tag">Top Fit: ${garment.top_fit}</span>
        <span class="garment-tag">Bottom Fit: ${garment.bottom_fit}</span>
      `;
    }

    // Load full folder details via existing API
    try {
      this.comprehensivePhotosGrid.innerHTML = '<div style="padding:32px;color:var(--text-muted);">Loading comprehensive view...</div>';
      const res = await fetch(`/api/folder?path=${encodeURIComponent(garment.photos_path)}`);
      if (!res.ok) throw new Error('Failed to load photos');
      this.currentFolderData = await res.json();
      this.renderComprehensiveGrid();
    } catch (err) {
      this.comprehensivePhotosGrid.innerHTML = `<div style="padding:32px;color:var(--accent-warning);">Error loading photos: ${err.message}</div>`;
    }
  }

  updateCompStatusBadge(isComplete, annotated, total) {
    if (!this.compStatusBadge) return;
    if (isComplete) {
      this.compStatusBadge.className = 'garment-status-pill complete';
      this.compStatusBadge.textContent = '✓ Photoshoot Completed';
      if (this.btnToggleFolderComplete) this.btnToggleFolderComplete.textContent = 'Reopen / Incomplete';
    } else {
      const cls = annotated > 0 ? 'in-progress' : 'pending';
      this.compStatusBadge.className = `garment-status-pill ${cls}`;
      this.compStatusBadge.textContent = annotated > 0 ? `⚡ In Progress (${annotated}/${total})` : '● Pending';
      if (this.btnToggleFolderComplete) this.btnToggleFolderComplete.textContent = 'Mark as Completed';
    }
  }

  renderComprehensiveGrid() {
    if (!this.comprehensivePhotosGrid || !this.currentFolderData) return;
    const images = this.currentFolderData.images || [];
    const poses = this.currentFolderData.poses || {};
    this.comprehensivePhotosGrid.innerHTML = '';

    if (images.length === 0) {
      this.comprehensivePhotosGrid.innerHTML = '<div style="padding:32px;color:var(--text-muted);">No photos found in this folder.</div>';
      return;
    }

    images.forEach((imgName, idx) => {
      const card = document.createElement('div');
      card.className = 'readonly-photo-card';

      const fullPath = `${this.currentFolderData.folder_path}/${imgName}`;
      const thumbUrl = `/api/thumb?path=${encodeURIComponent(fullPath)}&max_dim=500`;

      const pose = poses[imgName];
      const isAnnotated = !!pose;

      // Compute bounding box overlay
      let bboxHtml = '';
      if (isAnnotated && pose && pose.bbox) {
        const b = pose.bbox;
        let nx1 = b.norm_x1 !== undefined ? b.norm_x1 : undefined;
        let ny1 = b.norm_y1 !== undefined ? b.norm_y1 : undefined;
        let nx2 = b.norm_x2 !== undefined ? b.norm_x2 : undefined;
        let ny2 = b.norm_y2 !== undefined ? b.norm_y2 : undefined;

        if (nx1 === undefined && b.x1 !== undefined && (b.orig_w || b.img_width || b.width)) {
          const imgW = b.orig_w || b.img_width || b.width;
          const imgH = b.orig_h || b.img_height || b.height;
          if (imgW && imgH) {
            nx1 = b.x1 / imgW;
            ny1 = b.y1 / imgH;
            nx2 = b.x2 / imgW;
            ny2 = b.y2 / imgH;
          }
        }

        if (nx1 !== undefined && ny1 !== undefined && nx2 !== undefined && ny2 !== undefined) {
          const minX = Math.max(0, Math.min(nx1, nx2));
          const minY = Math.max(0, Math.min(ny1, ny2));
          const maxX = Math.min(1, Math.max(nx1, nx2));
          const maxY = Math.min(1, Math.max(ny1, ny2));

          const leftPct = (minX * 100).toFixed(2);
          const topPct = (minY * 100).toFixed(2);
          const widthPct = ((maxX - minX) * 100).toFixed(2);
          const heightPct = ((maxY - minY) * 100).toFixed(2);

          if (parseFloat(widthPct) > 0 && parseFloat(heightPct) > 0) {
            bboxHtml = `
              <div class="admin-bbox-overlay" style="left:${leftPct}%; top:${topPct}%; width:${widthPct}%; height:${heightPct}%;">
                <span class="admin-bbox-tag">BBox</span>
              </div>
            `;
          }
        }
      }

      let tagsHtml = '';
      if (isAnnotated) {
        const t = pose.top_fit || this.currentFolderData.top_fit || 'regular';
        const b = pose.bottom_fit || this.currentFolderData.bottom_fit || 'regular';
        tagsHtml = `
          <span class="garment-tag" style="background:#1e1b4b; color:#a5b4fc; border-color:#4338ca;">T: ${t} | B: ${b}</span>
          <span class="garment-tag" style="background:#064e3b; color:#6ee7b7; border-color:#059669;">${Math.round(pose.rotation_angle || 0)}°</span>
        `;
      }

      card.innerHTML = `
        <div class="readonly-thumb-stage">
          <img src="${thumbUrl}" alt="${imgName}" loading="lazy" />
          ${bboxHtml}
          <span class="garment-status-pill ${isAnnotated ? 'complete' : 'pending'}" style="top:8px; right:8px; font-size:0.68rem; padding:2px 7px;">
            ${isAnnotated ? '✓ Saved' : '● Pending'}
          </span>
        </div>
        <div class="readonly-card-footer">
          <div class="readonly-card-name" title="${imgName}">${imgName}</div>
          <div class="readonly-card-tags">
            ${tagsHtml}
          </div>
        </div>
      `;

      card.addEventListener('click', () => this.openInspectionModal(idx));
      this.comprehensivePhotosGrid.appendChild(card);
    });
  }

  async toggleFolderComplete() {
    if (!this.currentGarment) return;
    const newStatus = !this.currentGarment.is_complete;

    try {
      const res = await fetch('/api/folder/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder_path: this.currentGarment.photos_path,
          is_complete: newStatus
        })
      });

      if (!res.ok) throw new Error('Failed to update status');
      this.currentGarment.is_complete = newStatus;
      this.updateCompStatusBadge(newStatus, this.currentGarment.annotated_count, this.currentGarment.total_images);

      // Also refresh in modelData
      if (this.modelData && this.modelData.garments) {
        const target = this.modelData.garments.find((g) => g.photos_path === this.currentGarment.photos_path);
        if (target) target.is_complete = newStatus;
        this.modelData.completed_garments = this.modelData.garments.filter((g) => g.is_complete).length;
        this.updateModelBanner();
      }
    } catch (err) {
      alert('Error updating completion status: ' + err.message);
    }
  }

  openInspectionModal(idx) {
    if (!this.currentFolderData || !this.currentFolderData.images) return;
    this.currentInspectIndex = idx;
    const imgName = this.currentFolderData.images[idx];
    const pose = this.currentFolderData.poses[imgName];

    if (this.inspectPhotoName) this.inspectPhotoName.textContent = imgName;
    if (this.inspectPhotoIndex) this.inspectPhotoIndex.textContent = `Photo ${idx + 1} of ${this.currentFolderData.images.length}`;

    const fullPath = `${this.currentFolderData.folder_path}/${imgName}`;
    if (this.inspectImg) {
      this.inspectImg.src = `/api/image?path=${encodeURIComponent(fullPath)}`;
    }

    // Render BBox overlay on inspect photo
    if (this.inspectBBoxOverlay) {
      this.inspectBBoxOverlay.innerHTML = '';
      if (pose && pose.bbox) {
        const b = pose.bbox;
        let nx1 = b.norm_x1 !== undefined ? b.norm_x1 : undefined;
        let ny1 = b.norm_y1 !== undefined ? b.norm_y1 : undefined;
        let nx2 = b.norm_x2 !== undefined ? b.norm_x2 : undefined;
        let ny2 = b.norm_y2 !== undefined ? b.norm_y2 : undefined;

        if (nx1 === undefined && b.x1 !== undefined && (b.orig_w || b.img_width || b.width)) {
          const imgW = b.orig_w || b.img_width || b.width;
          const imgH = b.orig_h || b.img_height || b.height;
          if (imgW && imgH) {
            nx1 = b.x1 / imgW;
            ny1 = b.y1 / imgH;
            nx2 = b.x2 / imgW;
            ny2 = b.y2 / imgH;
          }
        }

        if (nx1 !== undefined && ny1 !== undefined && nx2 !== undefined && ny2 !== undefined) {
          const minX = Math.max(0, Math.min(nx1, nx2));
          const minY = Math.max(0, Math.min(ny1, ny2));
          const maxX = Math.min(1, Math.max(nx1, nx2));
          const maxY = Math.min(1, Math.max(ny1, ny2));

          const boxEl = document.createElement('div');
          boxEl.className = 'admin-bbox-overlay';
          boxEl.style.left = `${(minX * 100).toFixed(2)}%`;
          boxEl.style.top = `${(minY * 100).toFixed(2)}%`;
          boxEl.style.width = `${((maxX - minX) * 100).toFixed(2)}%`;
          boxEl.style.height = `${((maxY - minY) * 100).toFixed(2)}%`;
          boxEl.innerHTML = '<span class="admin-bbox-tag">Bounding Box</span>';
          this.inspectBBoxOverlay.appendChild(boxEl);
        }
      }
    }

    // Inspect Sidebar Metadata
    if (this.inspectAngleVal) {
      this.inspectAngleVal.textContent = pose ? `${Math.round(pose.rotation_angle || 0)}° (${pose.rotation_label || 'Angle'})` : 'Not Annotated';
    }

    if (this.inspectSlidersVal) {
      if (pose && pose.sliders) {
        const s = pose.sliders;
        this.inspectSlidersVal.textContent = `Framing: ${s.framing || 'full_body'} (Top: ${s.top_region || 'head'}, Btm: ${s.bottom_region || 'foot'})`;
      } else {
        this.inspectSlidersVal.textContent = 'None';
      }
    }

    if (this.inspectFitsVal) {
      const topFit = (pose && pose.top_fit) || this.currentFolderData.top_fit || 'regular';
      const btmFit = (pose && pose.bottom_fit) || this.currentFolderData.bottom_fit || 'regular';
      this.inspectFitsVal.textContent = `Top: ${topFit} | Bottom: ${btmFit}`;
    }

    this.inspectionModal?.classList.add('active');
  }

  navigateInspect(direction) {
    if (!this.currentFolderData || !this.currentFolderData.images) return;
    const total = this.currentFolderData.images.length;
    let nextIdx = this.currentInspectIndex + direction;
    if (nextIdx < 0) nextIdx = total - 1;
    if (nextIdx >= total) nextIdx = 0;
    this.openInspectionModal(nextIdx);
  }

  closeInspection() {
    this.inspectionModal?.classList.remove('active');
  }

  backToGarments() {
    this.showSection('garments');
    // Refresh model data to ensure all counts/progress stay up to date
    if (this.currentModelPath) {
      this.loadModel(this.currentModelPath);
    }
  }

  showSection(sec) {
    if (sec === 'garments') {
      this.garmentsSection?.classList.add('active');
      this.comprehensiveSection?.classList.remove('active');
    } else {
      this.garmentsSection?.classList.remove('active');
      this.comprehensiveSection?.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}

// Boot Admin App
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    window.adminApp = new AdminApp();
  });
} else {
  window.adminApp = new AdminApp();
}
