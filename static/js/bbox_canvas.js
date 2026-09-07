// Interactive Bounding Box on Original Image

class BBoxCanvas {
  constructor(imgElement, canvasElement, readoutElement, onChangeCallback) {
    this.img = imgElement;
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.readout = readoutElement;
    this.onChange = onChangeCallback;

    // Normalized bbox coordinates: 0.0 to 1.0
    // { norm_x1, norm_y1, norm_x2, norm_y2 }
    this.bbox = null;

    this.isDragging = false;
    this.dragMode = null; // 'create', 'move', 'resize-tl', 'resize-tr', etc.
    this.dragStart = { x: 0, y: 0 };
    this.initialBbox = null;

    this.handleRadius = 6;
    this.handleMargin = 12;

    this.initEvents();
  }

  initEvents() {
    this.img.addEventListener('load', () => this.syncCanvasSize());
    window.addEventListener('resize', () => this.syncCanvasSize());

    const resizeObserver = new ResizeObserver(() => this.syncCanvasSize());
    resizeObserver.observe(this.img);

    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
  }

  syncCanvasSize() {
    if (!this.img.complete || this.img.naturalWidth === 0) return;

    const rect = this.img.getBoundingClientRect();
    const parentRect = this.img.parentElement.getBoundingClientRect();

    // Align canvas directly over image
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.canvas.style.left = `${rect.left - parentRect.left}px`;
    this.canvas.style.top = `${rect.top - parentRect.top}px`;

    this.render();
  }

  setBBox(bboxData) {
    if (!bboxData) {
      this.bbox = null;
    } else if (bboxData.norm_x1 !== undefined) {
      this.bbox = {
        norm_x1: Math.min(bboxData.norm_x1, bboxData.norm_x2),
        norm_y1: Math.min(bboxData.norm_y1, bboxData.norm_y2),
        norm_x2: Math.max(bboxData.norm_x1, bboxData.norm_x2),
        norm_y2: Math.max(bboxData.norm_y1, bboxData.norm_y2)
      };
    } else if (bboxData.x1 !== undefined && this.img.naturalWidth > 0) {
      this.bbox = {
        norm_x1: bboxData.x1 / this.img.naturalWidth,
        norm_y1: bboxData.y1 / this.img.naturalHeight,
        norm_x2: bboxData.x2 / this.img.naturalWidth,
        norm_y2: bboxData.y2 / this.img.naturalHeight
      };
    }
    this.render();
    this.updateReadout();
  }

  getBBoxData() {
    if (!this.bbox || !this.img.naturalWidth) return null;

    const nw = this.img.naturalWidth;
    const nh = this.img.naturalHeight;

    const x1 = Math.round(this.bbox.norm_x1 * nw);
    const y1 = Math.round(this.bbox.norm_y1 * nh);
    const x2 = Math.round(this.bbox.norm_x2 * nw);
    const y2 = Math.round(this.bbox.norm_y2 * nh);

    return {
      x1,
      y1,
      x2,
      y2,
      norm_x1: Number(this.bbox.norm_x1.toFixed(4)),
      norm_y1: Number(this.bbox.norm_y1.toFixed(4)),
      norm_x2: Number(this.bbox.norm_x2.toFixed(4)),
      norm_y2: Number(this.bbox.norm_y2.toFixed(4)),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1)
    };
  }

  getScreenCoords() {
    if (!this.bbox) return null;
    const w = this.canvas.width;
    const h = this.canvas.height;
    return {
      x1: this.bbox.norm_x1 * w,
      y1: this.bbox.norm_y1 * h,
      x2: this.bbox.norm_x2 * w,
      y2: this.bbox.norm_y2 * h
    };
  }

  hitTest(mouseX, mouseY) {
    const sc = this.getScreenCoords();
    if (!sc) return null;

    const { x1, y1, x2, y2 } = sc;
    const hr = this.handleMargin;

    // Corner handles
    if (Math.hypot(mouseX - x1, mouseY - y1) < hr) return 'resize-tl';
    if (Math.hypot(mouseX - x2, mouseY - y1) < hr) return 'resize-tr';
    if (Math.hypot(mouseX - x1, mouseY - y2) < hr) return 'resize-bl';
    if (Math.hypot(mouseX - x2, mouseY - y2) < hr) return 'resize-br';

    // Edge handles
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    if (Math.hypot(mouseX - midX, mouseY - y1) < hr) return 'resize-t';
    if (Math.hypot(mouseX - midX, mouseY - y2) < hr) return 'resize-b';
    if (Math.hypot(mouseX - x1, mouseY - midY) < hr) return 'resize-l';
    if (Math.hypot(mouseX - x2, mouseY - midY) < hr) return 'resize-r';

    // Inside box
    if (mouseX >= x1 && mouseX <= x2 && mouseY >= y1 && mouseY <= y2) {
      return 'move';
    }

    return null;
  }

  onMouseDown(e) {
    if (e.button !== 0) return;
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const hit = this.hitTest(mouseX, mouseY);
    this.isDragging = true;
    this.dragStart = { x: mouseX, y: mouseY };

    if (hit) {
      this.dragMode = hit;
      this.initialBbox = { ...this.bbox };
    } else {
      // Start creating new bbox
      this.dragMode = 'create';
      const normX = Math.max(0, Math.min(1, mouseX / this.canvas.width));
      const normY = Math.max(0, Math.min(1, mouseY / this.canvas.height));
      this.bbox = {
        norm_x1: normX,
        norm_y1: normY,
        norm_x2: normX,
        norm_y2: normY
      };
      this.initialBbox = { ...this.bbox };
    }
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (!this.isDragging) {
      const hit = this.hitTest(mouseX, mouseY);
      if (hit === 'move') this.canvas.style.cursor = 'move';
      else if (hit === 'resize-tl' || hit === 'resize-br') this.canvas.style.cursor = 'nwse-resize';
      else if (hit === 'resize-tr' || hit === 'resize-bl') this.canvas.style.cursor = 'nesw-resize';
      else if (hit === 'resize-t' || hit === 'resize-b') this.canvas.style.cursor = 'ns-resize';
      else if (hit === 'resize-l' || hit === 'resize-r') this.canvas.style.cursor = 'ew-resize';
      else this.canvas.style.cursor = 'crosshair';
      return;
    }

    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const deltaNormX = (mouseX - this.dragStart.x) / cw;
    const deltaNormY = (mouseY - this.dragStart.y) / ch;

    if (this.dragMode === 'create') {
      const currentNormX = Math.max(0, Math.min(1, mouseX / cw));
      const currentNormY = Math.max(0, Math.min(1, mouseY / ch));
      this.bbox = {
        norm_x1: Math.min(this.initialBbox.norm_x1, currentNormX),
        norm_y1: Math.min(this.initialBbox.norm_y1, currentNormY),
        norm_x2: Math.max(this.initialBbox.norm_x1, currentNormX),
        norm_y2: Math.max(this.initialBbox.norm_y1, currentNormY)
      };
    } else if (this.dragMode === 'move') {
      const w = this.initialBbox.norm_x2 - this.initialBbox.norm_x1;
      const h = this.initialBbox.norm_y2 - this.initialBbox.norm_y1;
      let newX1 = Math.max(0, Math.min(1 - w, this.initialBbox.norm_x1 + deltaNormX));
      let newY1 = Math.max(0, Math.min(1 - h, this.initialBbox.norm_y1 + deltaNormY));
      this.bbox = {
        norm_x1: newX1,
        norm_y1: newY1,
        norm_x2: newX1 + w,
        norm_y2: newY1 + h
      };
    } else if (this.dragMode.startsWith('resize-')) {
      // Resize handle: extract direction suffix ('tl', 'tr', 'bl', 'br', 't', 'b', 'l', 'r')
      const handle = this.dragMode.substring(7);
      let { norm_x1, norm_y1, norm_x2, norm_y2 } = this.initialBbox;

      if (handle.includes('t')) norm_y1 = Math.min(norm_y2 - 0.01, Math.max(0, norm_y1 + deltaNormY));
      if (handle.includes('b')) norm_y2 = Math.max(norm_y1 + 0.01, Math.min(1, norm_y2 + deltaNormY));
      if (handle.includes('l')) norm_x1 = Math.min(norm_x2 - 0.01, Math.max(0, norm_x1 + deltaNormX));
      if (handle.includes('r')) norm_x2 = Math.max(norm_x1 + 0.01, Math.min(1, norm_x2 + deltaNormX));

      this.bbox = { norm_x1, norm_y1, norm_x2, norm_y2 };
    }

    this.render();
    this.updateReadout();
  }

  onMouseUp() {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.dragMode = null;

    // Minimum size check (at least 5 pixels)
    if (this.bbox) {
      const sc = this.getScreenCoords();
      if (sc && (Math.abs(sc.x2 - sc.x1) < 5 || Math.abs(sc.y2 - sc.y1) < 5)) {
        this.bbox = null;
      }
    }

    this.render();
    this.updateReadout();
    if (this.onChange) {
      this.onChange(this.getBBoxData());
    }
  }

  clearBox() {
    this.bbox = null;
    this.render();
    this.updateReadout();
    if (this.onChange) this.onChange(null);
  }

  setFullSubject() {
    this.bbox = {
      norm_x1: 0.1,
      norm_y1: 0.05,
      norm_x2: 0.9,
      norm_y2: 0.95
    };
    this.render();
    this.updateReadout();
    if (this.onChange) this.onChange(this.getBBoxData());
  }

  updateReadout() {
    if (!this.readout) return;
    const data = this.getBBoxData();
    if (!data) {
      this.readout.innerHTML = '<span>No Bounding Box</span>';
    } else {
      this.readout.innerHTML = `
        <span>TL: [${data.x1}, ${data.y1}] &nbsp; BR: [${data.x2}, ${data.y2}]</span>
        <span style="color:#6366f1;">${data.width} × ${data.height} px</span>
      `;
    }
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!this.bbox) return;

    const sc = this.getScreenCoords();
    if (!sc) return;

    const { x1, y1, x2, y2 } = sc;
    const boxW = x2 - x1;
    const boxH = y2 - y1;

    // Outer shade
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, w, y1);
    ctx.fillRect(0, y2, w, h - y2);
    ctx.fillRect(0, y1, x1, boxH);
    ctx.fillRect(x2, y1, w - x2, boxH);

    // Box stroke
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2;
    ctx.strokeRect(x1, y1, boxW, boxH);

    // Subtle inner fill
    ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
    ctx.fillRect(x1, y1, boxW, boxH);

    // Draw handles
    const hr = this.handleRadius;
    const handles = [
      [x1, y1], [x2, y1], [x1, y2], [x2, y2], // Corners
      [(x1 + x2) / 2, y1], [(x1 + x2) / 2, y2], // Top, bottom
      [x1, (y1 + y2) / 2], [x2, (y1 + y2) / 2]  // Left, right
    ];

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#4338ca';
    ctx.lineWidth = 1.5;

    for (const [hx, hy] of handles) {
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}
