// Master App Coordinator for Barbie 3D Body & Pose Visualizer

class App {
  constructor() {
    this.rootPath = '/Users/uttkarsh/Desktop/wrkspce2/hawkeye/test_dataset';
    this.folders = [];
    this.currentFolder = null;
    this.folderData = null; // { folder_path, images, poses, defaults }
    this.currentImageIndex = -1;

    // Folder-wide garment and model defaults (applied once for the whole photoshoot!)
    this.folderDefaults = {
      gender: 'male',
      top_fit: 'regular',
      bottom_fit: 'regular'
    };

    // Active image annotation state (focuses on the 3 core items: BBox, 3D angle, Sliders)
    this.activeState = {
      bbox: null,
      rotation_angle: 0.0,
      rotation_label: 'Front (0°)',
      sliders: {
        top_y: 0.0,
        bottom_y: 1.0,
        top_region: 'head',
        bottom_region: 'foot',
        framing: 'full_body'
      },
      top_fit: 'regular',
      bottom_fit: 'regular',
      gender: 'male'
    };

    this.saveTimeout = null;

    // Component instances
    this.bboxCanvas = null;
    this.modelViewer = null;
    this.frontalSlider = null;

    this.initDOM();
    this.initComponents();
    this.initShortcuts();

    // Auto-scan default path on boot
    this.scan(this.rootPath);
  }

  initDOM() {
    // Elements
    this.pathInput = document.getElementById('rootPathInput');
    this.btnScan = document.getElementById('btnScan');
    this.folderDropdown = document.getElementById('folderSelectDropdown');
    this.folderBadge = document.getElementById('folderStatsBadge');
    this.galleryGrid = document.getElementById('galleryGrid');
    this.galleryTitle = document.getElementById('galleryTitle');
    this.galleryCount = document.getElementById('galleryCount');
    this.emptyState = document.getElementById('emptyState');

    // Visualizer Elements
    this.modal = document.getElementById('visualizerModal');
    this.activeImgNameEl = document.getElementById('activeImageName');
    this.activeImgIndexEl = document.getElementById('activeImageIndex');
    this.saveStatusEl = document.getElementById('saveStatusIndicator');
    this.shootSummaryText = document.getElementById('shootSummaryText');

    this.origImageDisplay = document.getElementById('origImageDisplay');
    this.bboxOverlayCanvas = document.getElementById('bboxOverlayCanvas');
    this.bboxReadout = document.getElementById('bboxReadout');

    this.threeContainer = document.getElementById('threeCanvasContainer');
    this.angleSlider = document.getElementById('angleSlider');
    this.angleBadge = document.getElementById('angleValueBadge');

    this.frontalImg = document.getElementById('frontalPoseImg');
    this.frontalContainer = document.getElementById('frontalViewContainer');
    this.framingBadge = document.getElementById('framingBadge');

    // Button controls
    this.btnScan.addEventListener('click', () => this.scan(this.pathInput.value));
    this.pathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.scan(this.pathInput.value);
    });

    this.folderDropdown.addEventListener('change', (e) => {
      const selected = this.folders.find((f) => f.path === e.target.value);
      if (selected) this.selectFolder(selected);
    });

    document.getElementById('btnCloseModal')?.addEventListener('click', () => this.closeModal());
    document.getElementById('btnComprehensiveView')?.addEventListener('click', () => this.closeModal());
    document.getElementById('btnComprehensiveDock')?.addEventListener('click', () => this.closeModal());
    document.getElementById('btnOpenVisualizer')?.addEventListener('click', () => {
      const idx = (this.currentImageIndex >= 0 && this.currentImageIndex < (this.folderData?.images?.length || 0))
        ? this.currentImageIndex
        : 0;
      this.openModal(idx);
    });
    // Setup Modal Elements
    this.setupModal = document.getElementById('folderSetupModal');
    this.setupPreviewImg = document.getElementById('setupPreviewImg');
    this.setupPreviewName = document.getElementById('setupPreviewName');
    this.setupFolderLabel = document.getElementById('setupFolderLabel');
    this.btnConfirmSetup = document.getElementById('btnConfirmSetup');
    this.btnSkipSetup = document.getElementById('btnSkipSetup');
    this.btnOpenSetupModal = document.getElementById('btnOpenSetupModal');

    this.setupGender = 'male';
    this.setupTopFit = 'regular';
    this.setupBottomFit = 'regular';

    this.btnConfirmSetup?.addEventListener('click', () => this.confirmFolderSetup());
    this.btnSkipSetup?.addEventListener('click', () => this.closeFolderSetup(false));
    this.btnOpenSetupModal?.addEventListener('click', () => this.openFolderSetup());

    // Setup modal segment button listeners
    document.querySelectorAll('[data-setup-gender]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.setupGender = btn.dataset.setupGender;
        document.querySelectorAll('[data-setup-gender]').forEach((b) => {
          b.classList.toggle('active', b.dataset.setupGender === this.setupGender);
        });
      });
    });

    document.querySelectorAll('[data-setup-top]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.setupTopFit = btn.dataset.setupTop;
        document.querySelectorAll('[data-setup-top]').forEach((b) => {
          b.classList.toggle('active', b.dataset.setupTop === this.setupTopFit);
        });
      });
    });

    document.querySelectorAll('[data-setup-btm]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.setupBottomFit = btn.dataset.setupBtm;
        document.querySelectorAll('[data-setup-btm]').forEach((b) => {
          b.classList.toggle('active', b.dataset.setupBtm === this.setupBottomFit);
        });
      });
    });

    document.getElementById('btnPrev').addEventListener('click', () => this.prevImage());
    document.getElementById('btnNext').addEventListener('click', () => this.nextImage());

    // Same as Previous Buttons
    document.getElementById('btnSameAsPrev')?.addEventListener('click', () => this.sameAsPrevious());
    document.getElementById('btnSameAsPrevDock')?.addEventListener('click', () => this.sameAsPrevious());

    // Auto-Detect Human Buttons
    document.getElementById('btnAutoDetect')?.addEventListener('click', () => this.autoDetectBBox(false));
    document.getElementById('btnAutoDetectDock')?.addEventListener('click', () => this.autoDetectBBox(false));

    // Folder-Level Garment & Gender controls (Header and Modal Dock)
    document.querySelectorAll('[data-gender-toggle]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setFolderGender(btn.dataset.genderToggle);
      });
    });

    document.querySelectorAll('[data-top-fit-toggle]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setFolderTopFit(btn.dataset.topFitToggle);
      });
    });

    document.querySelectorAll('[data-btm-fit-toggle]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setFolderBottomFit(btn.dataset.btmFitToggle);
      });
    });

    // BBox quick buttons
    document.getElementById('btnFullSubject')?.addEventListener('click', () => {
      this.bboxCanvas?.setFullSubject();
    });
    document.getElementById('btnClearBBox')?.addEventListener('click', () => {
      this.bboxCanvas?.clearBox();
    });

    // Angle cardinal buttons
    document.querySelectorAll('[data-angle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const deg = parseFloat(btn.dataset.angle);
        this.modelViewer?.setRotationAngle(deg, true);
        this.onAngleChange(deg, this.modelViewer.getOrientationLabel(deg));
      });
    });

    // Frontal presets
    document.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.preset;
        if (p === 'full') this.frontalSlider?.setSliderValues(0.0, 1.0);
        else if (p === '34') this.frontalSlider?.setSliderValues(0.0, 0.65);
        else if (p === 'upper') this.frontalSlider?.setSliderValues(0.0, 0.48);
        else if (p === 'torso') this.frontalSlider?.setSliderValues(0.18, 0.48);
        else if (p === 'lower') this.frontalSlider?.setSliderValues(0.42, 1.0);
        this.onSliderChange(this.frontalSlider.getSliderData());
      });
    });
  }

  initComponents() {
    // 1. BBox Canvas
    this.bboxCanvas = new BBoxCanvas(
      this.origImageDisplay,
      this.bboxOverlayCanvas,
      this.bboxReadout,
      (bboxData) => this.onBBoxChange(bboxData)
    );

    // 2. Three.js Model Viewer
    this.modelViewer = new ModelViewer(
      this.threeContainer,
      this.angleSlider,
      this.angleBadge,
      (angle, label) => this.onAngleChange(angle, label)
    );

    // 3. Frontal Slider
    this.frontalSlider = new FrontalSlider(
      this.frontalContainer,
      this.frontalImg,
      this.framingBadge,
      (sliderData) => this.onSliderChange(sliderData)
    );
  }

  initShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // If folder setup modal is active, Enter confirms and Escape skips
      if (this.setupModal && this.setupModal.classList.contains('active')) {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.confirmFolderSetup();
          return;
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.closeFolderSetup(false);
          return;
        }
      }

      // G or V toggles between 3-image visualizer and comprehensive thumbnail view
      if (e.key.toLowerCase() === 'g' || e.key.toLowerCase() === 'v') {
        if (this.modal.classList.contains('active')) {
          this.closeModal();
        } else if (this.folderData && this.folderData.images && this.folderData.images.length > 0) {
          const idx = (this.currentImageIndex >= 0 && this.currentImageIndex < this.folderData.images.length)
            ? this.currentImageIndex
            : 0;
          this.openModal(idx);
        }
        return;
      }

      if (!this.modal.classList.contains('active')) return;

      if (e.key === 'Escape') {
        this.closeModal();
      } else if (e.key === 'ArrowLeft') {
        this.prevImage();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        this.nextImage();
      } else if (e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'p') {
        // S or P = Same as Previous
        this.sameAsPrevious();
      } else if (e.key.toLowerCase() === 'a') {
        // A = Auto-detect BBox
        this.autoDetectBBox(false);
      } else if (e.key.toLowerCase() === 'c') {
        this.bboxCanvas?.clearBox();
      } else if (e.key === '1') {
        this.setFolderTopFit('loose');
      } else if (e.key === '2') {
        this.setFolderTopFit('regular');
      } else if (e.key === '3') {
        this.setFolderTopFit('tight');
      } else if (e.key === '4') {
        this.setFolderBottomFit('loose');
      } else if (e.key === '5') {
        this.setFolderBottomFit('regular');
      } else if (e.key === '6') {
        this.setFolderBottomFit('tight');
      } else if (e.key.toLowerCase() === 'm') {
        this.setFolderGender('male');
      } else if (e.key.toLowerCase() === 'f') {
        this.setFolderGender('female');
      }
    });
  }

  async scan(path) {
    if (!path) return;
    this.pathInput.value = path;
    this.btnScan.textContent = 'Scanning...';
    try {
      const res = await API.scanDirectory(path);
      this.folders = res.folders || [];
      this.renderFolderDropdown();
      if (this.folders.length > 0) {
        this.selectFolder(this.folders[0]);
      } else {
        this.emptyState.style.display = 'flex';
        this.galleryGrid.innerHTML = '';
        this.folderBadge.textContent = '0 Folders Found';
      }
    } catch (err) {
      alert(`Scan error: ${err.message}`);
    } finally {
      this.btnScan.textContent = 'Scan Folders';
    }
  }

  renderFolderDropdown() {
    this.folderDropdown.innerHTML = '';
    for (const f of this.folders) {
      const opt = document.createElement('option');
      opt.value = f.path;
      opt.textContent = `${f.rel_path} (${f.annotated_count}/${f.total_images})`;
      this.folderDropdown.appendChild(opt);
    }
  }

  async selectFolder(folder) {
    this.currentFolder = folder;
    this.folderDropdown.value = folder.path;

    try {
      const details = await API.getFolderDetails(folder.path);
      this.folderData = details;

      // Initialize folder-level garment and gender defaults
      if (details.defaults) {
        this.folderDefaults = {
          gender: details.defaults.gender || 'male',
          top_fit: details.defaults.top_fit || 'regular',
          bottom_fit: details.defaults.bottom_fit || 'regular'
        };
      }
      this.updateFolderDefaultsUI();

      this.renderGallery();
      this.updateFolderStats();

      // Open directly into the 3-image visualizer studio on first photo
      if (this.folderData && this.folderData.images && this.folderData.images.length > 0) {
        this.openModal(0);
      }

      // When a new photos folder starts without confirmed setup, ask the user showing the first image!
      if (!this.folderData.defaults_confirmed) {
        this.openFolderSetup();
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Folder-Level Defaults Handlers
  async setFolderGender(gender) {
    if (!gender) return;
    this.folderDefaults.gender = gender;
    this.activeState.gender = gender;
    this.updateFolderDefaultsUI();

    // Immediately swap 3D model & frontal reference image if modal is active
    if (this.modal && this.modal.classList.contains('active')) {
      this.modelViewer?.setGender(gender);
      this.frontalSlider?.setGender(gender);
    }

    await this.persistFolderDefaults();
    this.renderGallery();
  }

  async setFolderTopFit(fit) {
    if (!fit) return;
    this.folderDefaults.top_fit = fit;
    this.activeState.top_fit = fit;
    this.updateFolderDefaultsUI();
    await this.persistFolderDefaults();
    this.renderGallery();
  }

  async setFolderBottomFit(fit) {
    if (!fit) return;
    this.folderDefaults.bottom_fit = fit;
    this.activeState.bottom_fit = fit;
    this.updateFolderDefaultsUI();
    await this.persistFolderDefaults();
    this.renderGallery();
  }

  updateFolderDefaultsUI() {
    // Gender buttons (Header toolbar + Modal footer dock)
    document.querySelectorAll('[data-gender-toggle]').forEach((btn) => {
      const isActive = btn.dataset.genderToggle === this.folderDefaults.gender;
      btn.classList.toggle('active', isActive);
    });

    // Top fit buttons (Header toolbar + Modal footer dock)
    document.querySelectorAll('[data-top-fit-toggle]').forEach((btn) => {
      const isActive = btn.dataset.topFitToggle === this.folderDefaults.top_fit;
      btn.classList.toggle('active', isActive);
    });

    // Bottom fit buttons (Header toolbar + Modal footer dock)
    document.querySelectorAll('[data-btm-fit-toggle]').forEach((btn) => {
      const isActive = btn.dataset.btmFitToggle === this.folderDefaults.bottom_fit;
      btn.classList.toggle('active', isActive);
    });
  }

  async persistFolderDefaults() {
    if (!this.folderData) return;
    try {
      await API.saveFolderDefaults(
        this.folderData.folder_path,
        this.folderDefaults.gender,
        this.folderDefaults.top_fit,
        this.folderDefaults.bottom_fit
      );

      // Update in-memory poses to reflect new folder-wide defaults
      for (const img of this.folderData.images) {
        if (this.folderData.poses[img]) {
          this.folderData.poses[img].gender = this.folderDefaults.gender;
          this.folderData.poses[img].top_fit = this.folderDefaults.top_fit;
          this.folderData.poses[img].bottom_fit = this.folderDefaults.bottom_fit;
          this.folderData.poses[img].fitting = {
            top: this.folderDefaults.top_fit,
            bottom: this.folderDefaults.bottom_fit
          };
        }
      }

      // If modal is open, sync active state & 3D model
      if (this.modal && this.modal.classList.contains('active')) {
        this.activeState.gender = this.folderDefaults.gender;
        this.activeState.top_fit = this.folderDefaults.top_fit;
        this.activeState.bottom_fit = this.folderDefaults.bottom_fit;
        this.activeState.fitting = {
          top: this.folderDefaults.top_fit,
          bottom: this.folderDefaults.bottom_fit
        };
        this.modelViewer?.setGender(this.activeState.gender);
        this.frontalSlider?.setGender(this.activeState.gender);
      }
    } catch (err) {
      console.error('Error saving folder defaults:', err);
    }
  }

  // Photoshoot Folder Setup Modal Handlers
  openFolderSetup() {
    if (!this.folderData) return;

    this.setupGender = this.folderDefaults.gender || 'male';
    this.setupTopFit = this.folderDefaults.top_fit || 'regular';
    this.setupBottomFit = this.folderDefaults.bottom_fit || 'regular';

    // Update UI in setup modal
    document.querySelectorAll('[data-setup-gender]').forEach((b) => {
      b.classList.toggle('active', b.dataset.setupGender === this.setupGender);
    });
    document.querySelectorAll('[data-setup-top]').forEach((b) => {
      b.classList.toggle('active', b.dataset.setupTop === this.setupTopFit);
    });
    document.querySelectorAll('[data-setup-btm]').forEach((b) => {
      b.classList.toggle('active', b.dataset.setupBtm === this.setupBottomFit);
    });

    if (this.setupFolderLabel) {
      this.setupFolderLabel.textContent = this.currentFolder?.rel_path || this.folderData.folder_name || 'this photoshoot';
    }

    if (this.folderData.images && this.folderData.images.length > 0) {
      const firstImg = this.folderData.images[0];
      const fullPath = `${this.folderData.folder_path}/${firstImg}`;
      if (this.setupPreviewName) this.setupPreviewName.textContent = firstImg;
      if (this.setupPreviewImg) this.setupPreviewImg.src = API.getThumbUrl(fullPath, 500);
    }

    this.setupModal?.classList.add('active');
  }

  async confirmFolderSetup() {
    this.folderDefaults.gender = this.setupGender;
    this.folderDefaults.top_fit = this.setupTopFit;
    this.folderDefaults.bottom_fit = this.setupBottomFit;

    this.activeState.gender = this.setupGender;
    this.activeState.top_fit = this.setupTopFit;
    this.activeState.bottom_fit = this.setupBottomFit;

    this.updateFolderDefaultsUI();

    this.modelViewer?.setGender(this.setupGender);
    this.frontalSlider?.setGender(this.setupGender);

    this.closeFolderSetup(true);

    if (this.folderData) {
      this.folderData.defaults_confirmed = true;
      await this.persistFolderDefaults();
      this.scheduleSave();
      this.renderGallery();
    }
  }

  closeFolderSetup(confirmed = false) {
    this.setupModal?.classList.remove('active');
    if (!confirmed && this.folderData) {
      this.folderData.defaults_confirmed = true;
    }
  }

  updateFolderStats() {
    if (!this.folderData) return;
    const total = this.folderData.images.length;
    const annotated = Object.keys(this.folderData.poses).filter((img) =>
      !img.startsWith('_folder_') && this.folderData.images.includes(img)
    ).length;

    this.folderBadge.textContent = `${annotated} / ${total} Annotated`;
    if (annotated === total && total > 0) {
      this.folderBadge.classList.add('complete');
    } else {
      this.folderBadge.classList.remove('complete');
    }

    this.galleryTitle.textContent = this.currentFolder.rel_path;
    this.galleryCount.textContent = `(${total} photos)`;
  }

  renderGallery() {
    if (!this.folderData || this.folderData.images.length === 0) {
      this.emptyState.style.display = 'flex';
      this.galleryGrid.innerHTML = '';
      return;
    }

    this.emptyState.style.display = 'none';
    this.galleryGrid.innerHTML = '';

    this.folderData.images.forEach((imgName, idx) => {
      const card = document.createElement('div');
      card.className = 'image-card';
      const fullPath = `${this.folderData.folder_path}/${imgName}`;
      const thumbUrl = API.getThumbUrl(fullPath, 500);

      const pose = this.folderData.poses[imgName];
      const isAnnotated = !!pose;

      let tagsHtml = '';
      if (isAnnotated) {
        const g = pose.gender || this.folderDefaults.gender;
        const t = pose.top_fit || this.folderDefaults.top_fit;
        const b = pose.bottom_fit || this.folderDefaults.bottom_fit;
        tagsHtml = `
          <span class="tag-pill gender">${g === 'female' ? '♀ Female' : '♂ Male'}</span>
          <span class="tag-pill fit">T: ${t} | B: ${b}</span>
          <span class="tag-pill angle">${Math.round(pose.rotation_angle || 0)}°</span>
        `;
      }

      card.innerHTML = `
        <div class="card-thumb-container">
          <img class="card-thumb" src="${thumbUrl}" alt="${imgName}" loading="lazy" />
          <div class="card-status-badge ${isAnnotated ? 'annotated' : 'pending'}">
            ${isAnnotated ? '✓ Saved' : '● Pending'}
          </div>
        </div>
        <div class="card-info">
          <div class="card-filename" title="${imgName}">${imgName}</div>
          <div class="card-tags">${tagsHtml}</div>
        </div>
      `;

      card.addEventListener('click', () => this.openModal(idx));
      this.galleryGrid.appendChild(card);
    });
  }

  openModal(index) {
    if (!this.folderData || !this.folderData.images[index]) return;
    this.currentImageIndex = index;
    const imgName = this.folderData.images[index];
    const fullPath = `${this.folderData.folder_path}/${imgName}`;

    this.activeImgNameEl.textContent = imgName;
    this.activeImgIndexEl.textContent = `Photo ${index + 1} of ${this.folderData.images.length}`;

    // Load original image
    this.origImageDisplay.src = API.getImageUrl(fullPath);

    // Retrieve or initialize pose data
    const existingPose = this.folderData.poses[imgName];
    let isInherited = false;
    let inheritedFromName = null;

    if (existingPose) {
      this.activeState = JSON.parse(JSON.stringify(existingPose));
      // Always ensure folder defaults are in sync if not individually set
      if (!this.activeState.gender) this.activeState.gender = this.folderDefaults.gender;
      if (!this.activeState.top_fit) this.activeState.top_fit = this.folderDefaults.top_fit;
      if (!this.activeState.bottom_fit) this.activeState.bottom_fit = this.folderDefaults.bottom_fit;
    } else {
      // Find nearest previous annotated photo in this photoshoot
      let prevAnnotatedPose = null;
      for (let i = index - 1; i >= 0; i--) {
        const pName = this.folderData.images[i];
        if (this.folderData.poses[pName]) {
          prevAnnotatedPose = this.folderData.poses[pName];
          inheritedFromName = pName;
          break;
        }
      }

      if (prevAnnotatedPose) {
        // Inherit ONLY angle and framing dual sliders (NO bounding box!)
        isInherited = true;
        this.activeState = {
          bbox: null, // DO NOT transfer bounding box from previous image
          rotation_angle: prevAnnotatedPose.rotation_angle ?? 0.0,
          rotation_label: prevAnnotatedPose.rotation_label ?? 'Front (0°)',
          sliders: prevAnnotatedPose.sliders ? JSON.parse(JSON.stringify(prevAnnotatedPose.sliders)) : {
            top_y: 0.0,
            bottom_y: 1.0,
            top_region: 'head',
            bottom_region: 'foot',
            framing: 'full_body'
          },
          top_fit: this.folderDefaults.top_fit,
          bottom_fit: this.folderDefaults.bottom_fit,
          gender: this.folderDefaults.gender
        };
      } else {
        // Defaults for very first unannotated photo in a folder
        this.activeState = {
          bbox: null,
          rotation_angle: 0.0,
          rotation_label: 'Front (0°)',
          sliders: {
            top_y: 0.0,
            bottom_y: 1.0,
            top_region: 'head',
            bottom_region: 'foot',
            framing: 'full_body'
          },
          top_fit: this.folderDefaults.top_fit,
          bottom_fit: this.folderDefaults.bottom_fit,
          gender: this.folderDefaults.gender
        };
      }
    }

    // Update panel components
    this.bboxCanvas.setBBox(this.activeState.bbox);

    this.modelViewer.setGender(this.activeState.gender);
    this.modelViewer.setRotationAngle(this.activeState.rotation_angle, true);

    this.frontalSlider.setGender(this.activeState.gender);
    this.frontalSlider.setSliderValues(
      this.activeState.sliders?.top_y ?? 0.0,
      this.activeState.sliders?.bottom_y ?? 1.0
    );

    // Update shoot summary badge
    this.updateFolderDefaultsUI();

    this.modal.classList.add('active');

    if (isInherited) {
      this.setSaveStatus('saved', `Defaulted from ${inheritedFromName} ✓`);
      // Immediately schedule save so this image now has its annotation recorded in pose.json
      this.scheduleSave();
    } else {
      this.setSaveStatus('saved');
    }

    // AUTO HUMAN BOUNDING BOX:
    // If image does not yet have a bounding box, automatically detect it on CPU!
    if (!this.activeState.bbox) {
      this.autoDetectBBox(true);
    }
  }

  closeModal() {
    this.modal.classList.remove('active');
    this.renderGallery();
    this.updateFolderStats();
  }

  async prevImage() {
    if (!this.folderData) return;
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
      await this.saveCurrentPose();
    }
    const newIdx = (this.currentImageIndex - 1 + this.folderData.images.length) % this.folderData.images.length;
    this.openModal(newIdx);
  }

  async nextImage() {
    if (!this.folderData) return;
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
      await this.saveCurrentPose();
    }
    const newIdx = (this.currentImageIndex + 1) % this.folderData.images.length;
    this.openModal(newIdx);
  }

  // ⚡ Auto-Detect Human Bounding Box using ultra-fast CPU detector
  async autoDetectBBox(silent = false) {
    if (!this.folderData || this.currentImageIndex < 0) return;
    const imgName = this.folderData.images[this.currentImageIndex];
    const fullPath = `${this.folderData.folder_path}/${imgName}`;

    if (!silent) {
      this.setSaveStatus('saving', 'Detecting human subject...');
    }

    try {
      const res = await API.detectBBox(fullPath);
      if (res && res.bbox) {
        this.bboxCanvas.setBBox(res.bbox);
        this.activeState.bbox = this.bboxCanvas.getBBoxData();
        this.scheduleSave();
        if (!silent) {
          this.setSaveStatus('saved', `Auto-detected BBox (${res.bbox.detection_time_ms}ms)`);
        }
      }
    } catch (err) {
      console.warn('Auto-detect error:', err);
      if (!silent) {
        this.setSaveStatus('saved');
      }
    }
  }

  // ⎘ Same as Previous Button
  sameAsPrevious() {
    if (!this.folderData || this.currentImageIndex <= 0) return;

    // Search backwards for the nearest annotated image
    let prevAnnotatedPose = null;
    let prevName = null;

    for (let i = this.currentImageIndex - 1; i >= 0; i--) {
      const name = this.folderData.images[i];
      if (this.folderData.poses[name]) {
        prevAnnotatedPose = this.folderData.poses[name];
        prevName = name;
        break;
      }
    }

    if (!prevAnnotatedPose) {
      // If no earlier image was annotated, use current active state
      return;
    }

    // DO NOT copy BBox from previous photo!
    // ONLY copy 3D Rotation Angle and Dual Sliders
    this.activeState.rotation_angle = prevAnnotatedPose.rotation_angle ?? 0.0;
    this.activeState.rotation_label = prevAnnotatedPose.rotation_label ?? 'Front (0°)';
    this.modelViewer.setRotationAngle(this.activeState.rotation_angle, true);

    if (prevAnnotatedPose.sliders) {
      this.activeState.sliders = JSON.parse(JSON.stringify(prevAnnotatedPose.sliders));
      this.frontalSlider.setSliderValues(
        this.activeState.sliders.top_y,
        this.activeState.sliders.bottom_y
      );
    }

    // Inherit folder-wide garment & gender
    this.activeState.gender = this.folderDefaults.gender;
    this.activeState.top_fit = this.folderDefaults.top_fit;
    this.activeState.bottom_fit = this.folderDefaults.bottom_fit;

    // Persist immediately
    this.scheduleSave();
    this.setSaveStatus('saved', `Copied from ${prevName} ✓`);
  }

  // State Change Callbacks
  onBBoxChange(bboxData) {
    this.activeState.bbox = bboxData;
    this.scheduleSave();
  }

  onAngleChange(angle, label) {
    this.activeState.rotation_angle = angle;
    this.activeState.rotation_label = label;
    this.scheduleSave();
  }

  onSliderChange(sliderData) {
    this.activeState.sliders = sliderData;
    this.scheduleSave();
  }

  scheduleSave() {
    this.setSaveStatus('saving');
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.saveCurrentPose(), 350);
  }

  async saveCurrentPose() {
    if (!this.folderData || this.currentImageIndex < 0) return;
    const imgName = this.folderData.images[this.currentImageIndex];

    try {
      const res = await API.savePose(this.folderData.folder_path, imgName, this.activeState);
      this.folderData.poses[imgName] = res.pose;
      this.setSaveStatus('saved');
    } catch (err) {
      console.error('Error saving pose:', err);
      this.setSaveStatus('error');
    }
  }

  setSaveStatus(status, customMsg = null) {
    if (status === 'saving') {
      this.saveStatusEl.className = 'save-status-indicator saving';
      this.saveStatusEl.innerHTML = `<span class="status-dot"></span> ${customMsg || 'Saving to pose.json...'}`;
    } else if (status === 'saved') {
      this.saveStatusEl.className = 'save-status-indicator';
      this.saveStatusEl.innerHTML = `<span class="status-dot"></span> ${customMsg || 'Saved to pose.json'}`;
    } else {
      this.saveStatusEl.className = 'save-status-indicator error';
      this.saveStatusEl.innerHTML = `<span class="status-dot"></span> Save Error`;
    }
  }
}

// Boot application
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
