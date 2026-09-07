// Panel 3: Frontal Pose of the 3D Body & Dual Sliders

class FrontalSlider {
  constructor(containerElement, imgElement, framingBadgeElement, onChangeCallback) {
    this.container = containerElement;
    this.img = imgElement;
    this.framingBadge = framingBadgeElement;
    this.onChange = onChangeCallback;

    this.currentGender = 'male';

    // Normalized Y positions: 0.0 (crown of head) to 1.0 (soles of feet)
    this.topY = 0.0;
    this.bottomY = 1.0;

    this.activeDrag = null; // 'top' or 'bottom'
    this.stage = null;
    this.topSliderLine = null;
    this.bottomSliderLine = null;
    this.maskTop = null;
    this.maskBottom = null;
    this.inclusionZone = null;

    this.initDOM();
    this.initEvents();
    this.setGender('male');
    this.updateUI();
  }

  initDOM() {
    this.stage = document.createElement('div');
    this.stage.className = 'slider-overlay-stage';

    this.maskTop = document.createElement('div');
    this.maskTop.className = 'mask-top';

    this.maskBottom = document.createElement('div');
    this.maskBottom.className = 'mask-bottom';

    this.inclusionZone = document.createElement('div');
    this.inclusionZone.className = 'inclusion-zone';

    // Top Slider Line
    this.topSliderLine = document.createElement('div');
    this.topSliderLine.className = 'frontal-slider-line top-slider';
    this.topSliderLine.innerHTML = `
      <div class="slider-badge" id="topSliderBadge">Top: Head (0%)</div>
      <div class="slider-handle-grip"></div>
    `;

    // Bottom Slider Line
    this.bottomSliderLine = document.createElement('div');
    this.bottomSliderLine.className = 'frontal-slider-line bottom-slider';
    this.bottomSliderLine.innerHTML = `
      <div class="slider-badge" id="bottomSliderBadge">Bottom: Foot (100%)</div>
      <div class="slider-handle-grip"></div>
    `;

    this.stage.appendChild(this.maskTop);
    this.stage.appendChild(this.inclusionZone);
    this.stage.appendChild(this.maskBottom);
    this.stage.appendChild(this.topSliderLine);
    this.stage.appendChild(this.bottomSliderLine);

    this.container.appendChild(this.stage);
  }

  initEvents() {
    this.img.addEventListener('load', () => this.syncOverlayPosition());
    window.addEventListener('resize', () => this.syncOverlayPosition());

    const resizeObserver = new ResizeObserver(() => this.syncOverlayPosition());
    resizeObserver.observe(this.img);

    // Mouse drag handlers on slider lines
    this.topSliderLine.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.activeDrag = 'top';
    });

    this.bottomSliderLine.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.activeDrag = 'bottom';
    });

    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', () => this.onMouseUp());
  }

  syncOverlayPosition() {
    if (!this.img.complete || !this.img.clientHeight) return;

    const imgRect = this.img.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();

    // Align stage directly over the rendered image
    this.stage.style.position = 'absolute';
    this.stage.style.left = `${imgRect.left - containerRect.left}px`;
    this.stage.style.top = `${imgRect.top - containerRect.top}px`;
    this.stage.style.width = `${imgRect.width}px`;
    this.stage.style.height = `${imgRect.height}px`;

    this.updateUI();
  }

  setGender(gender) {
    this.currentGender = gender;
    const isMale = gender === 'male';
    const src = isMale
      ? '/static/models/nathan/frontal_dark.png'
      : '/static/models/sophia/frontal_dark.png';

    if (this.img.getAttribute('src') !== src) {
      this.img.src = src;
    }
  }

  getRegion(y) {
    if (y < 0.13) return { id: 'head', label: 'Head / Face' };
    if (y < 0.18) return { id: 'neck', label: 'Neck / Collar' };
    if (y < 0.30) return { id: 'chest', label: 'Chest / Bust' };
    if (y < 0.40) return { id: 'waist', label: 'Waist / Midriff' };
    if (y < 0.50) return { id: 'hips', label: 'Hips / Pelvis' };
    if (y < 0.60) return { id: 'upper_thigh', label: 'Upper Thigh' };
    if (y < 0.68) return { id: 'mid_thigh', label: 'Mid Thigh' };
    if (y < 0.76) return { id: 'knee', label: 'Knee' };
    if (y < 0.86) return { id: 'calf', label: 'Calf / Shin' };
    if (y < 0.93) return { id: 'ankle', label: 'Ankle' };
    return { id: 'foot', label: 'Foot / Soles' };
  }

  getFraming(topY, bottomY) {
    if (topY <= 0.08 && bottomY >= 0.88) return { id: 'full_body', label: 'Full Body' };
    if (topY <= 0.08 && bottomY >= 0.58) return { id: 'three_quarter', label: '3/4 Shot' };
    if (topY <= 0.08 && bottomY >= 0.32) return { id: 'half_body', label: 'Half Body' };
    if (topY <= 0.08 && bottomY < 0.32) return { id: 'close_up', label: 'Close-up / Portrait' };
    if (topY >= 0.32 && bottomY >= 0.85) return { id: 'lower_body', label: 'Lower Body' };
    if (topY >= 0.15 && topY <= 0.40 && bottomY <= 0.70) return { id: 'torso', label: 'Torso' };
    return { id: 'custom', label: 'Custom Framing' };
  }

  onMouseMove(e) {
    if (!this.activeDrag) return;

    const stageRect = this.stage.getBoundingClientRect();
    if (!stageRect.height) return;

    let normY = (e.clientY - stageRect.top) / stageRect.height;
    normY = Math.max(0, Math.min(1, normY));

    if (this.activeDrag === 'top') {
      this.topY = Math.min(normY, this.bottomY - 0.02);
    } else if (this.activeDrag === 'bottom') {
      this.bottomY = Math.max(normY, this.topY + 0.02);
    }

    this.updateUI();
  }

  onMouseUp() {
    if (!this.activeDrag) return;
    this.activeDrag = null;

    if (this.onChange) {
      this.onChange(this.getSliderData());
    }
  }

  setSliderValues(topY = 0.0, bottomY = 1.0) {
    this.topY = Math.max(0, Math.min(1, topY));
    this.bottomY = Math.max(0, Math.min(1, bottomY));
    if (this.topY > this.bottomY) {
      const tmp = this.topY;
      this.topY = this.bottomY;
      this.bottomY = tmp;
    }
    this.updateUI();
  }

  getSliderData() {
    const topReg = this.getRegion(this.topY);
    const btmReg = this.getRegion(this.bottomY);
    const framing = this.getFraming(this.topY, this.bottomY);

    const naturalH = this.img.naturalHeight || 800;
    const topPx = Math.round(this.topY * naturalH);
    const btmPx = Math.round(this.bottomY * naturalH);

    return {
      top_y: Number(this.topY.toFixed(4)),
      bottom_y: Number(this.bottomY.toFixed(4)),
      top_y_px: topPx,
      bottom_y_px: btmPx,
      top_region: topReg.id,
      top_region_label: topReg.label,
      bottom_region: btmReg.id,
      bottom_region_label: btmReg.label,
      framing: framing.id,
      framing_label: framing.label
    };
  }

  updateUI() {
    const topPct = (this.topY * 100).toFixed(1);
    const btmPct = (this.bottomY * 100).toFixed(1);

    // Position lines
    this.topSliderLine.style.top = `${topPct}%`;
    this.bottomSliderLine.style.top = `${btmPct}%`;

    // Masks and inclusion zone
    this.maskTop.style.height = `${topPct}%`;
    this.maskBottom.style.top = `${btmPct}%`;
    this.maskBottom.style.bottom = '0';

    this.inclusionZone.style.top = `${topPct}%`;
    this.inclusionZone.style.height = `${(this.bottomY - this.topY) * 100}%`;

    // Badges
    const topReg = this.getRegion(this.topY);
    const btmReg = this.getRegion(this.bottomY);
    const framing = this.getFraming(this.topY, this.bottomY);

    const topBadge = document.getElementById('topSliderBadge');
    if (topBadge) {
      topBadge.textContent = `Top: ${topReg.label} (${Math.round(this.topY * 100)}%)`;
    }

    const btmBadge = document.getElementById('bottomSliderBadge');
    if (btmBadge) {
      btmBadge.textContent = `Bottom: ${btmReg.label} (${Math.round(this.bottomY * 100)}%)`;
    }

    if (this.framingBadge) {
      this.framingBadge.innerHTML = `<span>⚡ Framing:</span> <strong>${framing.label}</strong>`;
    }
  }
}
