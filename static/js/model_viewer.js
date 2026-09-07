// Three.js 3D Model Viewer for Nathan (Male) & Sophia (Female)

class ModelViewer {
  constructor(containerElement, angleSlider, angleBadge, onChangeCallback) {
    this.container = containerElement;
    this.slider = angleSlider;
    this.badge = angleBadge;
    this.onChange = onChangeCallback;

    this.currentGender = 'male';
    this.currentAngle = 0; // 0 to 360 degrees

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.modelRoot = null;
    this.grid = null;
    this.cachedModels = { male: null, female: null };
    this.mixers = { male: null, female: null };
    this.loading = { male: false, female: false };
    this.clock = new THREE.Clock();

    this.isDragging = false;
    this.lastMouseX = 0;

    this.initThree();
    this.initControls();
  }

  initThree() {
    const width = this.container.clientWidth || 400;
    const height = this.container.clientHeight || 500;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1118);

    // Camera framed so full body from head to toe is completely visible
    const aspect = width / height;
    this.camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 1000);
    
    // Position camera looking directly at the body center (y = 0.10)
    const baseZ = aspect < 0.75 ? 4.6 * (0.80 / Math.max(0.40, aspect)) : 4.6;
    this.camera.position.set(0, 0.15, baseZ);
    this.camera.lookAt(0, 0.10, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(2.5, 4.5, 3.5);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x818cf8, 0.6);
    dirLight2.position.set(-2.5, 2.5, -2);
    this.scene.add(dirLight2);

    // Ground circular grid
    this.grid = new THREE.GridHelper(3, 16, 0x334155, 0x1e293b);
    this.grid.position.y = -0.70;
    this.scene.add(this.grid);

    // Pivot root for horizontal rotation around body axis
    this.modelRoot = new THREE.Group();
    this.scene.add(this.modelRoot);

    // Responsive resize
    window.addEventListener('resize', () => this.onResize());
    const resizeObserver = new ResizeObserver(() => this.onResize());
    resizeObserver.observe(this.container);

    // Render loop with animation mixer support
    const animate = () => {
      requestAnimationFrame(animate);
      const delta = this.clock.getDelta();
      if (this.mixers[this.currentGender]) {
        this.mixers[this.currentGender].update(delta);
      }
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  onResize() {
    if (!this.container || !this.renderer) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;

    const aspect = w / h;
    this.camera.aspect = aspect;

    // Adjust camera distance for narrow portrait aspect ratios so model never gets cut off
    const baseZ = aspect < 0.75 ? 4.6 * (0.80 / Math.max(0.40, aspect)) : 4.6;
    this.camera.position.z = baseZ;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, 0.10, 0);

    this.renderer.setSize(w, h);
  }

  initControls() {
    // Canvas drag to rotate
    this.container.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
      this.isDragging = true;
      this.lastMouseX = e.clientX;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const deltaX = e.clientX - this.lastMouseX;
      this.lastMouseX = e.clientX;

      // Rotate model: 1 px = 0.5 degrees
      let newAngle = (this.currentAngle + deltaX * 0.5) % 360;
      if (newAngle < 0) newAngle += 360;
      this.setRotationAngle(newAngle, true);
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        if (this.onChange) {
          this.onChange(this.currentAngle, this.getOrientationLabel(this.currentAngle));
        }
      }
    });

    // Slider control
    if (this.slider) {
      this.slider.addEventListener('input', (e) => {
        this.setRotationAngle(parseFloat(e.target.value), false);
      });
      this.slider.addEventListener('change', (e) => {
        if (this.onChange) {
          this.onChange(this.currentAngle, this.getOrientationLabel(this.currentAngle));
        }
      });
    }
  }

  getOrientationLabel(deg) {
    deg = ((deg % 360) + 360) % 360;
    if (deg >= 337.5 || deg < 22.5) return 'Front (0°)';
    if (deg >= 22.5 && deg < 67.5) return 'Front-Right 3/4 (45°)';
    if (deg >= 67.5 && deg < 112.5) return 'Right Profile (90°)';
    if (deg >= 112.5 && deg < 157.5) return 'Back-Right 3/4 (135°)';
    if (deg >= 157.5 && deg < 202.5) return 'Back (180°)';
    if (deg >= 202.5 && deg < 247.5) return 'Back-Left 3/4 (225°)';
    if (deg >= 247.5 && deg < 292.5) return 'Left Profile (270°)';
    if (deg >= 292.5 && deg < 337.5) return 'Front-Left 3/4 (315°)';
    return `${Math.round(deg)}°`;
  }

  setRotationAngle(deg, updateSlider = true) {
    deg = ((deg % 360) + 360) % 360;
    this.currentAngle = Math.round(deg * 10) / 10;

    // In Three.js: clockwise rotation around Y
    if (this.modelRoot) {
      this.modelRoot.rotation.y = (this.currentAngle * Math.PI) / 180;
    }

    if (updateSlider && this.slider) {
      this.slider.value = this.currentAngle;
    }

    if (this.badge) {
      this.badge.textContent = `${Math.round(this.currentAngle)}° - ${this.getOrientationLabel(this.currentAngle)}`;
    }
  }

  setGender(gender) {
    if (!gender) return;
    this.currentGender = gender;

    if (this.cachedModels[gender]) {
      this.showModel(gender);
    } else {
      // Clear viewport while loading the new model
      while (this.modelRoot && this.modelRoot.children.length > 0) {
        this.modelRoot.remove(this.modelRoot.children[0]);
      }
      this.loadModel(gender);
    }
  }

  showModel(gender) {
    if (!this.modelRoot) return;

    // 1. Completely remove ALL children from modelRoot
    while (this.modelRoot.children.length > 0) {
      this.modelRoot.remove(this.modelRoot.children[0]);
    }

    // 2. Stop mixers for other genders
    for (const g of ['male', 'female']) {
      if (g !== gender && this.mixers[g]) {
        this.mixers[g].stopAllAction();
      }
    }

    // 3. ONLY add the model if it matches currentGender and is loaded
    if (this.currentGender === gender && this.cachedModels[gender]) {
      this.modelRoot.add(this.cachedModels[gender]);
      if (this.mixers[gender] && this.cachedModels[gender].animations && this.cachedModels[gender].animations.length > 0) {
        const action = this.mixers[gender].clipAction(this.cachedModels[gender].animations[0]);
        if (action) action.play();
      }
      this.onResize();
    }
  }

  loadModel(gender) {
    if (this.cachedModels[gender]) {
      if (this.currentGender === gender) {
        this.showModel(gender);
      }
      return;
    }

    if (this.loading[gender]) return;
    this.loading[gender] = true;

    // Clear viewport
    while (this.modelRoot && this.modelRoot.children.length > 0) {
      this.modelRoot.remove(this.modelRoot.children[0]);
    }

    const isMale = gender === 'male';
    const fbxPath = isMale
      ? '/static/models/nathan/rp_nathan_animated_003_walking.fbx'
      : '/static/models/sophia/rp_sophia_animated_003_idling.fbx';
    const texPath = isMale
      ? '/static/models/nathan/tex/rp_nathan_animated_003_dif_2k.jpg'
      : '/static/models/sophia/tex/rp_sophia_animated_003_dif_2k.jpg';

    if (typeof THREE.FBXLoader === 'undefined') {
      console.warn('FBXLoader not found, creating procedural humanoid');
      this.loading[gender] = false;
      this.createProceduralHumanoid(gender);
      return;
    }

    const loader = new THREE.FBXLoader();
    const textureLoader = new THREE.TextureLoader();

    textureLoader.load(
      texPath,
      (texture) => {
        texture.encoding = THREE.sRGBEncoding;

        loader.load(
          fbxPath,
          (fbx) => {
            this.loading[gender] = false;

            // Setup animation mixer if available
            if (fbx.animations && fbx.animations.length > 0) {
              const mixer = new THREE.AnimationMixer(fbx);
              this.mixers[gender] = mixer;
              const action = mixer.clipAction(fbx.animations[0]);
              action.play();
              mixer.update(0.15); // Advance to natural standing pose
            }

            // Force matrix update to compute accurate bounding box
            fbx.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(fbx);
            const size = box.getSize(new THREE.Vector3());

            // Scale model to 1.70m standard height
            const targetHeight = 1.70;
            const scale = targetHeight / Math.max(size.y, 0.1);
            fbx.scale.setScalar(scale);
            fbx.updateMatrixWorld(true);

            // Center horizontally and place feet at y = -0.70
            const scaledBox = new THREE.Box3().setFromObject(fbx);
            const scaledCenter = scaledBox.getCenter(new THREE.Vector3());

            fbx.position.x = -scaledCenter.x;
            fbx.position.z = -scaledCenter.z;
            fbx.position.y = -scaledBox.min.y - 0.70;

            if (this.grid) {
              this.grid.position.y = -0.70;
            }

            // Apply texture material
            fbx.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.material = new THREE.MeshStandardMaterial({
                  map: texture,
                  roughness: 0.65,
                  metalness: 0.05
                });
              }
            });

            this.cachedModels[gender] = fbx;

            // ONLY show if this gender is STILL the active gender!
            if (this.currentGender === gender) {
              this.showModel(gender);
            }
          },
          undefined,
          (err) => {
            this.loading[gender] = false;
            console.error('Error loading FBX, falling back to procedural:', err);
            this.createProceduralHumanoid(gender);
          }
        );
      },
      undefined,
      (err) => {
        this.loading[gender] = false;
        console.error('Error loading texture, falling back to procedural:', err);
        this.createProceduralHumanoid(gender);
      }
    );
  }

  createProceduralHumanoid(gender) {
    const group = new THREE.Group();
    const isMale = gender === 'male';
    const bodyColor = isMale ? 0x3b82f6 : 0xec4899;
    const skinColor = 0xf5d0b5;

    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.6 });
    const clothMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.5 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), skinMat);
    head.position.set(0, 0.75, 0);
    group.add(head);

    // Torso
    const torsoW = isMale ? 0.36 : 0.30;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(torsoW, torsoW * 0.85, 0.6, 16), clothMat);
    torso.position.set(0, 0.35, 0);
    group.add(torso);

    // Legs
    const legRadius = isMale ? 0.08 : 0.07;
    const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(legRadius, legRadius * 0.7, 0.85, 12), darkMat);
    leftLeg.position.set(-0.11, -0.38, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(legRadius, legRadius * 0.7, 0.85, 12), darkMat);
    rightLeg.position.set(0.11, -0.38, 0);
    group.add(rightLeg);

    this.cachedModels[gender] = group;
    if (this.currentGender === gender) {
      this.showModel(gender);
    }
  }
}
