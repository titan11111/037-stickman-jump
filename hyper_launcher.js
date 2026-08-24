(() => {
  const GRAVITY = -22;
  const BOUNCE_COOLDOWN_MS = 220;
  const CHARGE_TAP_MS = 140;
  const CHARGE_FULL_MS = 560;
  const Z_LIMIT = 7.5;
  const FLOW_BASE = 17.2;
  const LAYER_TROPO_END = 12000;
  const LAYER_STRATO_END = 50000;
  const LAYER_ORBIT_START = 100000;
  const MILESTONES = [
    { m: 25, name: '25mプール' },
    { m: 122, name: '東京ドーム' },
    { m: 400, name: '陸上1周' },
    { m: 634, name: 'スカイツリー' },
    { m: 3776, name: '富士山' },
    { m: 8849, name: 'エベレスト' },
    { m: 34500, name: '山手線1周' },
    { m: 553000, name: '東京〜大阪' },
    { m: 2400000, name: '日本縦断' },
    { m: 40075000, name: '地球一周' },
    { m: 384400000, name: '月' }
  ];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = (id) => document.getElementById(id);
  const setText = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value;
  };

  function viewSize() {
    const vv = window.visualViewport;
    return {
      w: Math.max(1, Math.round((vv && vv.width) || window.innerWidth)),
      h: Math.max(1, Math.round((vv && vv.height) || window.innerHeight)),
      x: vv && typeof vv.offsetLeft === 'number' ? vv.offsetLeft : 0,
      y: vv && typeof vv.offsetTop === 'number' ? vv.offsetTop : 0
    };
  }

  function pointerNorm(e) {
    const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]) || e;
    const v = viewSize();
    return {
      x: Math.max(0, Math.min(1, (t.clientX - v.x) / v.w)),
      y: Math.max(0, Math.min(1, (t.clientY - v.y) / v.h))
    };
  }
  /* 9. Spatial Audio + compressor + haptic patterns */
  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.comp = null;
      this.muted = localStorage.getItem('hyper_muted') === '1';
      this.lastWarn = 0;
    }

    init() {
      try {
        if (this.ctx) {
          if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
          return;
        }
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.28;
        this.comp = this.ctx.createDynamicsCompressor();
        this.comp.threshold.value = -18;
        this.comp.knee.value = 18;
        this.comp.ratio.value = 6;
        this.comp.attack.value = 0.003;
        this.comp.release.value = 0.12;
        this.master.connect(this.comp);
        this.comp.connect(this.ctx.destination);

        const buf = this.ctx.createBuffer(1, 1, 22050);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.ctx.destination);
        src.start(0);
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      } catch (_) {
        this.ctx = null;
      }
    }

    ensureResumed() {
      this.init();
    }

    panNode(z) {
      if (this.ctx && typeof this.ctx.createStereoPanner === 'function') {
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = Math.max(-0.85, Math.min(0.85, (z || 0) / Z_LIMIT));
        return panner;
      }
      return null;
    }

    tone(type, from, to, dur, gainVal, z) {
      if (this.muted || !this.ctx || !this.master) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), this.ctx.currentTime + dur);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + dur);
      osc.connect(gain);
      const pan = this.panNode(z || 0);
      if (pan) {
        gain.connect(pan);
        pan.connect(this.master);
      } else {
        gain.connect(this.master);
      }
      osc.start();
      osc.stop(this.ctx.currentTime + dur);
    }

    playLaunch() {
      this.tone('sine', 140, 820, 0.32, 0.9, 0);
    }

    playBounce(quality, multiplier, z) {
      const map = {
        perfect: [520, 1400, 0.18, 1.0],
        save: [380, 980, 0.2, 0.9],
        good: [320, 760, 0.16, 0.7],
        weak: [220, 360, 0.12, 0.45],
        graze: [880, 1400, 0.1, 0.55]
      };
      const p = map[quality] || map.good;
      this.tone('triangle', p[0] * Math.min(multiplier, 2.2), p[1], p[2], p[3], z);
    }

    playDodge(z) {
      this.tone('sine', 520, 180, 0.09, 0.35, z);
    }

    playMark() {
      this.tone('sine', 720, 1480, 0.2, 0.72, 0);
    }

    playDig() {
      this.tone('triangle', 160, 780, 0.26, 0.9, 0);
    }

    playCrash() {
      if (this.muted || !this.ctx) return;
      const size = this.ctx.sampleRate * 0.35;
      const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, this.ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + 0.35);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.9, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.35);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      noise.start();
    }

    playWarn(z) {
      const now = performance.now();
      if (now - this.lastWarn < 380) return;
      this.lastWarn = now;
      this.tone('square', 180, 90, 0.08, 0.22, z);
    }
  }

  const sound = new SoundEngine();

  /* =========================================================================
     1-3. Scene, silhouette, camera
     ========================================================================= */
  const container = $('canvas-container');
  let scene, camera, renderer;
  let stickmanGroup, timingRing, halo, headMesh, armL, armR, legL, legR;
  let poseBurst = '';
  let poseBurstT = 0;
  let launchWarmT = 0;
  let groundPlane, gridHelper;
  let obstacles = [];
  let particles = [];
  let trailParticles = [];
  let telegraphs = [];
  let starLayers = [];
  let spaceRocks = [];
  let inSpace = false;
  let spaceBlend = 0;
  let spaceRockT = 0;
  let hemiLight;

  let gameState = 'START';
  let pos = { x: 0, y: 3, z: 0 };
  let vel = { x: 0, y: 0, z: 0 };
  let speedMultiplier = 1;
  let bouncesCount = 0;
  let combo = 0;
  let maxCombo = 0;
  let grazes = 0;
  let bestDistance = parseFloat(localStorage.getItem('hyper_best_dist') || '0');
  let cameraShake = 0;
  let hitStop = 0;
  let lastBounceAt = 0;
  let digsLeft = 1;
  let marksCount = 0;
  let markIdx = 0;
  let lastLayerId = 'tropo';
  let apexCueSent = false;
  let wakeLock = null;
  let radarCtx = null;
  let radarDpr = 1;
  let camLook = { x: 0, y: 3, z: 0 };
  let speedLineT = 0;
  let lastCamFov = 56;

  const charge = {
    active: false,
    start: 0,
    x: 0.5,
    y: 0.5,
    pointerId: null,
    fromKey: false,
    startClientX: 0,
    startClientY: 0,
    swiped: false,
    swipeDir: 0
  };
  const dodgeHold = { left: false, right: false };

  function makeGroundTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#1b4a6e';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#7dd3fc';
    g.lineWidth = 3;
    for (let i = 0; i <= 8; i++) {
      g.beginPath();
      g.moveTo(i * 32, 0);
      g.lineTo(i * 32, 256);
      g.stroke();
      g.beginPath();
      g.moveTo(0, i * 32);
      g.lineTo(256, i * 32);
      g.stroke();
    }
    g.fillStyle = '#fde68a';
    g.fillRect(124, 0, 8, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(70, 70);
    tex.anisotropy = 4;
    return tex;
  }

  function addOutline(mesh) {
    const outline = new THREE.Mesh(
      mesh.geometry,
      new THREE.MeshBasicMaterial({ color: 0x041018, side: THREE.BackSide, fog: false })
    );
    outline.scale.setScalar(1.22);
    mesh.add(outline);
  }

  function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x173154);
    scene.fog = new THREE.FogExp2(0x173154, 0.0042);

    camera = new THREE.PerspectiveCamera(56, viewSize().w / viewSize().h, 0.1, 2400);
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      failIfMajorPerformanceCaveat: false,
      powerPreference: 'high-performance'
    });
    const vs = viewSize();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(vs.w, vs.h);
    renderer.shadowMap.enabled = false;
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
    renderer.domElement.addEventListener('webglcontextrestored', () => onWindowResize());
    container.appendChild(renderer.domElement);

    hemiLight = new THREE.HemisphereLight(0x9bd8ff, 0x14324d, 1.05);
    scene.add(hemiLight);
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(12, 28, 16);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x67e8f9, 1.4);
    rim.position.set(-18, 8, -10);
    scene.add(rim);

    const groundMat = new THREE.MeshStandardMaterial({
      map: makeGroundTexture(),
      roughness: 0.72,
      metalness: 0.08,
      color: 0x8ecae6
    });
    groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    scene.add(groundPlane);

    gridHelper = new THREE.GridHelper(2400, 80, 0xe0f2fe, 0x38bdf8);
    gridHelper.position.y = 0.04;
    scene.add(gridHelper);

    createStickman();
    createStarLayers();
    createTelegraphs();
    resetCamera();
    setupRadar();

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('orientationchange', () => {
      onWindowResize();
      window.setTimeout(onWindowResize, 280);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onWindowResize);
      window.visualViewport.addEventListener('scroll', onWindowResize);
    }
  }

  function createStickman() {
    stickmanGroup = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.85,
      roughness: 0.28,
      metalness: 0.35,
      fog: false
    });

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.58, 18, 18), mat);
    head.position.y = 1.55;
    headMesh = head;
    stickmanGroup.add(head);
    addOutline(head);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.35, 10), mat);
    torso.position.y = 0.66;
    stickmanGroup.add(torso);
    addOutline(torso);

    const limbGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.92, 8);
    const makeLimb = (x, y, rotZ) => {
      const limb = new THREE.Mesh(limbGeo, mat);
      limb.position.set(x, y, 0);
      limb.rotation.z = rotZ;
      stickmanGroup.add(limb);
      addOutline(limb);
      return limb;
    };
    armL = makeLimb(-0.38, 0.9, Math.PI / 4);
    armR = makeLimb(0.38, 0.9, -Math.PI / 4);
    legL = makeLimb(-0.28, -0.05, Math.PI / 7);
    legR = makeLimb(0.28, -0.05, -Math.PI / 7);

    halo = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false
      })
    );
    halo.position.y = 0.7;
    stickmanGroup.add(halo);

    timingRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.07, 8, 36),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.9, fog: false })
    );
    timingRing.rotation.x = Math.PI / 2;
    timingRing.position.y = 0.7;
    stickmanGroup.add(timingRing);
    stickmanGroup.scale.setScalar(1.62);
    stickmanGroup.renderOrder = 8;
    stickmanGroup.traverse((obj) => {
      obj.frustumCulled = false;
    });
    scene.add(stickmanGroup);
  }

  function makeStarTexture() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(190,220,255,0.7)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function createStarLayers() {
    starLayers.forEach((l) => scene.remove(l.points));
    starLayers = [];
    const tex = makeStarTexture();
    const specs = [
      { count: 720, spread: 220, size: 2.4, parallax: 0.18, freq: 1.1 },
      { count: 260, spread: 140, size: 3.8, parallax: 0.45, freq: 2.0 },
      { count: 70, spread: 70, size: 6.5, parallax: 0.78, freq: 3.4 }
    ];
    specs.forEach((spec) => {
      const positions = new Float32Array(spec.count * 3);
      for (let i = 0; i < spec.count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * spec.spread;
        positions[i * 3 + 1] = (Math.random() - 0.2) * spec.spread * 0.75;
        positions[i * 3 + 2] = (Math.random() - 0.5) * spec.spread;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        map: tex,
        color: 0xf8fbff,
        size: spec.size,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: false
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      points.renderOrder = -2;
      scene.add(points);
      starLayers.push({
        points,
        geo,
        mat,
        spread: spec.spread,
        baseSize: spec.size,
        parallax: spec.parallax,
        freq: spec.freq
      });
    });
    paintCssStars();
  }

  function paintCssStars() {
    const specs = [
      { id: 'depth-far', n: 90, size: 1 },
      { id: 'depth-mid', n: 55, size: 2 },
      { id: 'depth-near', n: 22, size: 3 }
    ];
    specs.forEach((spec) => {
      const el = $(spec.id);
      if (!el) return;
      const shadows = [];
      for (let i = 0; i < spec.n; i++) {
        const x = Math.round((Math.random() - 0.5) * 1600);
        const y = Math.round((Math.random() - 0.5) * 1100);
        const a = (0.5 + Math.random() * 0.5).toFixed(2);
        shadows.push(`${x}px ${y}px 0 ${spec.size}px rgba(255,255,255,${a})`);
      }
      el.style.width = `${spec.size}px`;
      el.style.height = `${spec.size}px`;
      el.style.borderRadius = '50%';
      el.style.background = '#fff';
      el.style.boxShadow = shadows.join(',');
    });
  }

  function wrapStarLayer(layer, dt) {
    layer.points.position.set(pos.x, pos.y, pos.z);
    const arr = layer.geo.attributes.position.array;
    const halfX = layer.spread * 0.5;
    const halfY = layer.spread * 0.375;
    const halfZ = layer.spread * 0.5;
    const drift = 1 - layer.parallax;
    const dx = vel.x * dt * drift;
    const dy = vel.y * dt * drift;
    const dz = vel.z * dt * drift;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] -= dx;
      arr[i + 1] -= dy;
      arr[i + 2] -= dz;
      while (arr[i] > halfX) arr[i] -= layer.spread;
      while (arr[i] < -halfX) arr[i] += layer.spread;
      while (arr[i + 1] > halfY) arr[i + 1] -= halfY * 2;
      while (arr[i + 1] < -halfY) arr[i + 1] += halfY * 2;
      while (arr[i + 2] > halfZ) arr[i + 2] -= layer.spread;
      while (arr[i + 2] < -halfZ) arr[i + 2] += layer.spread;
    }
    layer.geo.attributes.position.needsUpdate = true;
  }

  const POSES = {
    cannon:  { aLZ: 1.15, aLX: 0.45, aRZ: -1.15, aRX: 0.45, lLZ: 0.95, lRZ: -0.95, hX: 0.35 },
    superman:{ aLZ: 0.12, aLX: 1.28, aRZ: -0.12, aRX: 1.28, lLZ: 0.1, lRZ: -0.1, hX: -0.18 },
    glide:   { aLZ: 0.5, aLX: 0.25, aRZ: -0.5, aRX: 0.25, lLZ: 0.32, lRZ: -0.32, hX: 0 },
    set:     { aLZ: 2.45, aLX: 0.15, aRZ: -2.45, aRX: 0.15, lLZ: 0.22, lRZ: -0.22, hX: -0.22 },
    dive:    { aLZ: 0.25, aLX: -0.85, aRZ: -0.25, aRX: -0.85, lLZ: 0.48, lRZ: -0.48, hX: 0.42 },
    receive: { aLZ: 0.95, aLX: 0.12, aRZ: -0.95, aRX: 0.12, lLZ: 0.72, lRZ: -0.72, hX: 0.18 },
    charge:  { aLZ: -0.15, aLX: -1.05, aRZ: 0.35, aRX: 1.45, lLZ: 0.5, lRZ: -0.18, hX: -0.28 },
    spike:   { aLZ: 0.15, aLX: 1.55, aRZ: -0.35, aRX: -0.15, lLZ: 0.18, lRZ: -0.7, hX: 0.22 },
    cheer:   { aLZ: 2.65, aLX: 0, aRZ: -2.65, aRX: 0, lLZ: 0.18, lRZ: -0.18, hX: -0.12 },
    kick:    { aLZ: 0.35, aLX: 0.35, aRZ: -0.35, aRX: 0.35, lLZ: 1.25, lRZ: -0.12, hX: 0.12 },
    flail:   { aLZ: 1.05, aLX: 0.7, aRZ: -1.45, aRX: -0.55, lLZ: 0.85, lRZ: -0.28, hX: 0.25 },
    graze:   { aLZ: 1.55, aLX: 0.45, aRZ: 0.18, aRX: -0.35, lLZ: 0.12, lRZ: -0.75, hX: 0.38 },
    crash:   { aLZ: 1.85, aLX: -0.7, aRZ: -0.35, aRX: 1.15, lLZ: 1.15, lRZ: 0.35, hX: 0.75 }
  };

  function currentPoseName() {
    if (gameState === 'GAMEOVER') return 'crash';
    if (poseBurstT > 0 && poseBurst) return poseBurst;
    if (launchWarmT > 0) return 'cannon';
    if (charge.active && performance.now() - charge.start > CHARGE_TAP_MS) return 'charge';
    if (dodgeHold.left || dodgeHold.right) return 'graze';
    if (vel.y > 6) return 'superman';
    if (Math.abs(vel.y) < 3.4) return 'set';
    if (vel.y < 0 && pos.y < 4.6) return 'receive';
    if (vel.y < 0) return 'dive';
    return 'glide';
  }

  function updateStickmanPose(dt) {
    if (!armL || !stickmanGroup) return;
    if (poseBurstT > 0) poseBurstT -= dt;
    if (launchWarmT > 0) launchWarmT -= dt;
    const pose = POSES[currentPoseName()] || POSES.glide;
    const t = Math.min(1, dt * 12);
    armL.rotation.z += (pose.aLZ - armL.rotation.z) * t;
    armL.rotation.x += (pose.aLX - armL.rotation.x) * t;
    armR.rotation.z += (pose.aRZ - armR.rotation.z) * t;
    armR.rotation.x += (pose.aRX - armR.rotation.x) * t;
    legL.rotation.z += (pose.lLZ - legL.rotation.z) * t;
    legR.rotation.z += (pose.lRZ - legR.rotation.z) * t;
    if (headMesh) headMesh.rotation.x += (pose.hX - headMesh.rotation.x) * t;
    if (reducedMotion) return;
    const w = performance.now() / 1000;
    const name = currentPoseName();
    if (name === 'flail' || name === 'crash') {
      armL.rotation.z += Math.sin(w * 16) * 0.35;
      armR.rotation.z += Math.cos(w * 14) * 0.35;
      legL.rotation.z += Math.sin(w * 11) * 0.22;
    } else if (name === 'dive') {
      armL.rotation.x += Math.sin(w * 7) * 0.08;
      armR.rotation.x += Math.sin(w * 7 + 0.4) * 0.08;
    } else if (name === 'set' || name === 'receive') {
      armL.rotation.z += Math.sin(w * 5) * 0.06;
      armR.rotation.z -= Math.sin(w * 5) * 0.06;
    }
  }

  function formatFlightDistance(meters) {
    const m = Math.max(0, meters);
    if (m >= 10000000) {
      const man = m / 10000000;
      return { value: man.toFixed(man >= 100 ? 1 : 2), unit: '万km' };
    }
    if (m >= 10000) {
      const km = m / 1000;
      return { value: km.toFixed(1), unit: 'km' };
    }
    return { value: m.toFixed(1), unit: 'm' };
  }

  function setFlightDistance(numId, unitId, meters) {
    const f = formatFlightDistance(meters);
    setText(numId, f.value);
    if (unitId) setText(unitId, f.unit);
  }

  function describeDistance(meters) {
    const refs = [
      { m: 1.7, name: '大人の身長', line: (n) => `大人の身長 ${n} 人分` },
      { m: 12, name: '路線バス', line: (n) => `路線バス ${n} 台分` },
      { m: 25, name: '25mプール', line: (n) => `25mプール ${n} 本` },
      { m: 50, name: '50mプール', line: (n) => `50mプール ${n} 本` },
      { m: 105, name: 'サッカーコート', line: (n) => `サッカーコート縦 ${n} 面` },
      { m: 122, name: '東京ドーム', line: (n) => `東京ドーム中堅 ${n} 本分` },
      { m: 400, name: '陸上トラック', line: (n) => `陸上トラック ${n} 周` },
      { m: 634, name: 'スカイツリー', line: (n) => `東京スカイツリー ${n} 本分` },
      { m: 3776, name: '富士山', line: (n) => `富士山の高さ ${n} つ分` },
      { m: 8849, name: 'エベレスト', line: (n) => `エベレストの高さ ${n} 倍` },
      { m: 34500, name: '山手線', line: (n) => `山手線 ${n} 周` },
      { m: 553000, name: '東京〜大阪', line: (n) => `東京〜大阪 ${n} 本分` },
      { m: 2400000, name: '日本縦断', line: (n) => `日本縦断（稚内〜那覇）の ${n} 倍` },
      { m: 40075000, name: '地球一周', line: (n) => `地球一周の ${n} 倍` },
      { m: 384400000, name: '月', line: (n) => `月までの ${n} 倍` },
      { m: 778500000000, name: '木星', line: (n) => `木星までの ${n} 倍` }
    ];
    const fmt = (n) => {
      if (n >= 1000) return Math.round(n).toLocaleString('ja-JP');
      if (n >= 10) return n.toFixed(1);
      if (n >= 1) return n.toFixed(1);
      if (n >= 0.1) return n.toFixed(2);
      if (n >= 0.01) return n.toFixed(3);
      return n.toFixed(4);
    };
    const scored = refs.map((r) => {
      const n = meters / r.m;
      let score = Math.abs(Math.log10(Math.max(n, 1e-12)) - 0.15);
      if (n < 0.04 || n > 35) score += 3;
      return { r, n, score };
    }).sort((a, b) => a.score - b.score);
    const phrase = (item) => {
      if (item.n < 0.008) {
        const remain = Math.max(0, item.r.m - meters);
        const km = remain / 1000;
        const left = km >= 10
          ? `${Math.round(km).toLocaleString('ja-JP')} km`
          : `${Math.round(remain)} m`;
        return `${item.r.name}まで あと ${left}`;
      }
      return item.r.line(fmt(item.n));
    };
    return {
      main: phrase(scored[0]),
      sub: `${phrase(scored[1])} ／ ${phrase(scored[2])}`
    };
  }

  function createTelegraphs() {
    telegraphs = [];
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.35, 0.09, 8, 28),
        new THREE.MeshBasicMaterial({
          color: 0xf43f5e,
          transparent: true,
          opacity: 0.9
        })
      );
      ring.rotation.y = Math.PI / 2;
      ring.visible = false;
      scene.add(ring);
      telegraphs.push(ring);
    }
  }

  const CAM_BACK = 14.2;
  const CAM_UP = 5.4;
  const CAM_SIDE = 17.6;
  const CAM_MAX_LAG_X = 1.5;
  const CAM_MAX_LAG_Y = 2.0;
  const CAM_MAX_LAG_Z = 1.4;

  function clampLag(current, target, maxLag) {
    const d = current - target;
    if (d > maxLag) return target + maxLag;
    if (d < -maxLag) return target - maxLag;
    return current;
  }

  function rushAmount() {
    return Math.min(1, Math.max(0, (vel.x / FLOW_BASE - 1) / 5.2));
  }

  function frameCamera(dt) {
    const rush = reducedMotion ? 0 : rushAmount();
    const targetX = pos.x - (CAM_BACK + rush * 4.2);
    const targetY = Math.max(pos.y + CAM_UP + rush * 2.0, 4.2);
    const targetZ = pos.z + CAM_SIDE + rush * 3.6;
    const lookAhead = 14 + rush * 18;
    const wantLookX = pos.x + lookAhead;
    const wantLookY = pos.y + 0.4;
    const wantLookZ = pos.z;
    const fov = 56 + rush * 6;
    camera.fov = fov;
    if (Math.abs(fov - lastCamFov) > 0.08) {
      camera.updateProjectionMatrix();
      lastCamFov = fov;
    }

    if (!dt) {
      camera.position.set(targetX, targetY, targetZ);
      camLook = { x: wantLookX, y: wantLookY, z: wantLookZ };
      camera.lookAt(camLook.x, camLook.y, camLook.z);
      return;
    }

    const follow = 1 - Math.exp(-8.4 * dt);
    const lookFollow = 1 - Math.exp(-6.4 * dt);
    camera.position.x += (targetX - camera.position.x) * follow;
    camera.position.y += (targetY - camera.position.y) * follow;
    camera.position.z += (targetZ - camera.position.z) * follow;
    camera.position.x = clampLag(camera.position.x, targetX, CAM_MAX_LAG_X);
    camera.position.y = clampLag(camera.position.y, targetY, CAM_MAX_LAG_Y);
    camera.position.z = clampLag(camera.position.z, targetZ, CAM_MAX_LAG_Z);

    camLook.x += (wantLookX - camLook.x) * lookFollow;
    camLook.y += (wantLookY - camLook.y) * lookFollow;
    camLook.z += (wantLookZ - camLook.z) * lookFollow;

    if (cameraShake > 0 && !reducedMotion) {
      camera.position.x += (Math.random() - 0.5) * cameraShake;
      camera.position.y += (Math.random() - 0.5) * cameraShake;
      cameraShake = Math.max(0, cameraShake - dt * 3);
    }
    camera.lookAt(camLook.x, camLook.y, camLook.z);
  }

  function resetCamera() {
    cameraShake = 0;
    frameCamera(0);
    camera.updateProjectionMatrix();
  }

  function setupRadar() {
    const canvas = $('radar');
    radarDpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 148;
    const cssH = canvas.clientHeight || 78;
    canvas.width = Math.floor(cssW * radarDpr);
    canvas.height = Math.floor(cssH * radarDpr);
    radarCtx = canvas.getContext('2d');
    radarCtx.setTransform(radarDpr, 0, 0, radarDpr, 0, 0);
  }

  /* =========================================================================
     8. Obstacles + telegraph
     ========================================================================= */
  function addObstacle(x, y, z, radius) {
    const wide = radius > 1.75;
    const geo = wide
      ? new THREE.BoxGeometry(1.5, 2.2, Math.max(2.2, radius * 1.5))
      : (Math.random() > 0.5
        ? new THREE.IcosahedronGeometry(1.05 + Math.random() * 0.55, 0)
        : new THREE.OctahedronGeometry(1.35, 0));
    const mat = new THREE.MeshStandardMaterial({
      color: wide ? 0xfb7185 : 0xff4d6d,
      emissive: 0xfb7185,
      emissiveIntensity: wide ? 1 : 0.85,
      roughness: 0.35
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    obstacles.push({
      mesh,
      x,
      y,
      z,
      radius,
      rotSpeed: (Math.random() - 0.5) * 0.05,
      grazed: false
    });
  }

  function spawnObstacles() {
    obstacles.forEach((o) => scene.remove(o.mesh));
    obstacles = [];
    let currentX = 34;
    for (let i = 0; i < 52; i++) {
      currentX += 26 + Math.random() * 34;
      const y = 2.2 + Math.random() * 15;
      const roll = Math.random();
      if (roll < 0.4) {
        const shift = (Math.random() - 0.5) * 1.6;
        const gap = 3.7;
        addObstacle(currentX, y, shift - gap, 1.65);
        addObstacle(currentX, y + (Math.random() - 0.5) * 1.8, shift + gap, 1.65);
      } else if (roll < 0.72) {
        addObstacle(currentX, y, (Math.random() - 0.5) * 1.5, 1.95);
      } else {
        addObstacle(currentX, y, (Math.random() - 0.5) * 10, 1.4);
      }
    }
  }

  function nextThreats(n) {
    const ahead = [];
    for (let i = 0; i < obstacles.length; i++) {
      if (obstacles[i].x > pos.x + 2) {
        ahead.push({
          x: obstacles[i].x,
          y: obstacles[i].y,
          z: obstacles[i].z,
          radius: obstacles[i].radius
        });
      }
    }
    for (let i = 0; i < spaceRocks.length; i++) {
      const r = spaceRocks[i];
      if (r.mesh.position.x > pos.x + 2) {
        ahead.push({
          x: r.mesh.position.x,
          y: r.mesh.position.y,
          z: r.mesh.position.z,
          radius: r.radius
        });
      }
    }
    ahead.sort((a, b) => a.x - b.x);
    return ahead.slice(0, n);
  }

  function updateTelegraphs() {
    const next = nextThreats(2);
    telegraphs.forEach((ring, i) => {
      const obs = next[i];
      if (!obs) {
        ring.visible = false;
        return;
      }
      ring.visible = true;
      ring.position.set(obs.x, obs.y, obs.z);
      const pulse = 1 + Math.sin(performance.now() / 180 + i) * 0.08;
      ring.scale.setScalar(pulse * Math.max(1.35, obs.radius / 1.35));
      const dist = obs.x - pos.x;
      ring.material.opacity = dist < 42 ? 1 : 0.78;
      ring.material.color.set(dist < 42 ? 0xfacc15 : 0xf43f5e);
    });
  }

  /* =========================================================================
     4. Timing quality
     ========================================================================= */
  function forecastQuality() {
    if (vel.y < 0 && pos.y < 4.6) return 'save';
    if (Math.abs(vel.y) < 3.4) return 'perfect';
    if (vel.y < 0) return 'good';
    if (vel.y > 6.5) return 'weak';
    return 'good';
  }

  function resolveLayer() {
    if (pos.x >= LAYER_ORBIT_START) return { id: 'orbit', label: '軌道' };
    if (pos.x >= LAYER_STRATO_END) return { id: 'space', label: '宇宙' };
    if (pos.x >= LAYER_TROPO_END) return { id: 'strato', label: '成層圏' };
    return { id: 'tropo', label: '対流圏' };
  }

  function updateLayerState() {
    const layer = resolveLayer();
    setText('hud-layer', layer.label);
    if (layer.id !== lastLayerId) {
      lastLayerId = layer.id;
      showJudge('layer', layer.label);
      if (layer.id === 'space' || layer.id === 'orbit') document.body.classList.add('is-space');
    }
    return layer;
  }

  function updateMilestones() {
    while (markIdx < MILESTONES.length && pos.x >= MILESTONES[markIdx].m) {
      const hit = MILESTONES[markIdx];
      markIdx += 1;
      marksCount += 1;
      combo += 1;
      maxCombo = Math.max(maxCombo, combo);
      showJudge('mark', hit.name);
      try { sound.playMark(); } catch (_) { /* audio optional */ }
      hapticFor('perfect');
      cameraShake = 0.4;
    }
    const next = MILESTONES[markIdx];
    if (next) {
      const left = formatFlightDistance(Math.max(0, next.m - pos.x));
      setText('hud-goal', `次 ${next.name}  あと ${left.value}${left.unit}`);
    } else {
      setText('hud-goal', '次 深宇宙');
    }
  }

  function triggerDigSave() {
    digsLeft = 0;
    pos.y = 1.4;
    vel.y = 16.8;
    combo = 0;
    apexCueSent = false;
    showJudge('dig');
    try { sound.playDig(); } catch (_) { /* audio optional */ }
    hapticFor('save');
    flashImpact(false);
    poseBurst = 'receive';
    poseBurstT = 0.48;
    cameraShake = 0.65;
    const prompt = $('bounce-prompt');
    prompt.textContent = 'DIG成功 まだ1回落ちられる';
    prompt.classList.add('is-on');
    prompt.classList.remove('is-apex');
    window.setTimeout(() => {
      if (gameState === 'PLAYING') prompt.classList.remove('is-on');
    }, 900);
  }

  function updateApexCue() {
    const prompt = $('bounce-prompt');
    if (!prompt || gameState !== 'PLAYING') return;
    const rising = vel.y > 0.2;
    const eta = rising ? vel.y / 22 : 0;
    const inWindow = (!rising && Math.abs(vel.y) < 3.4) || (vel.y < 0 && pos.y < 4.6);
    if (timingRing) {
      const scale = rising ? 0.7 + Math.min(1.15, eta) * 0.65 : inWindow ? 1.24 : 0.9;
      timingRing.scale.setScalar(scale);
      timingRing.material.opacity = inWindow || (rising && eta < 0.22) ? 1 : 0.5;
    }
    if (rising && eta < 0.2 && !apexCueSent) {
      apexCueSent = true;
      prompt.textContent = 'いま打つ';
      prompt.classList.add('is-on', 'is-apex');
      if (navigator.vibrate) navigator.vibrate(10);
    } else if (vel.y < 0 && pos.y < 4.8 && pos.y > 1.2) {
      prompt.textContent = 'セーブ打ち';
      prompt.classList.add('is-on');
      prompt.classList.remove('is-apex');
    } else if (!rising && !inWindow) {
      prompt.classList.remove('is-apex');
    }
    if (vel.y < -2) apexCueSent = false;
  }

  function showJudge(kind, extra) {
    const el = $('judge');
    const labels = {
      perfect: 'PERFECT',
      save: 'SAVE!',
      good: 'GOOD',
      weak: 'EARLY',
      graze: 'GRAZE',
      dodge: 'DODGE',
      space: 'ORBIT',
      dig: 'DIG!',
      mark: extra || 'MARK',
      layer: extra || 'LAYER'
    };
    el.textContent = (kind === 'mark' || kind === 'layer') ? (extra || labels[kind]) : (labels[kind] || extra || '');
    el.className = kind + ' is-on';
    window.setTimeout(() => {
      el.classList.remove('is-on');
    }, reducedMotion ? 180 : 420);
  }

  function flashImpact(danger) {
    if (reducedMotion) return;
    const el = $('impact-flash');
    el.classList.toggle('is-danger', !!danger);
    el.classList.add('is-on');
    window.setTimeout(() => el.classList.remove('is-on'), 70);
  }

  function hapticFor(quality) {
    if (!navigator.vibrate) return;
    const map = {
      perfect: [12, 30, 18],
      save: [18, 20, 24],
      good: [14],
      weak: [8],
      graze: [10, 20, 10]
    };
    navigator.vibrate(map[quality] || 12);
  }

  /* =========================================================================
     Particles / trail
     ========================================================================= */
  function triggerBounceEffects(x, y, z, quality) {
    cameraShake = quality === 'perfect' || quality === 'save' ? 0.55 : 0.32;
    const count = quality === 'weak' ? 10 : 18;
    const color = quality === 'perfect' ? 0xfacc15 : quality === 'graze' ? 0x4ade80 : 0x67e8f9;
    const pMat = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < count; i++) {
      const pMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), pMat);
      pMesh.position.set(x, y, z);
      scene.add(pMesh);
      const angle = (i / count) * Math.PI * 2;
      const speed = 8 + Math.random() * 10;
      particles.push({
        mesh: pMesh,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: (Math.random() - 0.5) * 6,
        life: 1
      });
    }
    createSpeedLines();
  }

  function createSpeedLines() {
    spawnSpeedStreaks(true);
  }

  function spawnSpeedStreaks(burst) {
    if (reducedMotion) return;
    const wrap = $('speed-lines-container');
    if (!wrap) return;
    const rush = rushAmount();
    const n = burst
      ? Math.min(8 + Math.floor(rush * 10), 16)
      : 1 + Math.floor(rush * 3);
    for (let i = 0; i < n; i++) {
      const line = document.createElement('div');
      line.className = 'speed-line';
      line.style.top = `${6 + Math.random() * 88}%`;
      line.style.left = `${-8 + Math.random() * 28}%`;
      line.style.width = `${160 + rush * 260 + Math.random() * 140}px`;
      line.style.opacity = `${0.28 + rush * 0.45}`;
      line.style.animationDuration = `${Math.max(0.12, 0.32 - rush * 0.16)}s`;
      wrap.appendChild(line);
      window.setTimeout(() => line.remove(), 360);
    }
  }

  function updateSpeedStreaks(dt) {
    if (reducedMotion || gameState !== 'PLAYING') return;
    speedLineT -= dt;
    const rush = rushAmount();
    const interval = Math.max(0.045, 0.12 - rush * 0.07);
    if (speedLineT > 0) return;
    speedLineT = interval;
    spawnSpeedStreaks(false);
  }

  function addTrailParticle(x, y, z) {
    const rush = rushAmount();
    if (Math.random() > 0.28 + rush * 0.45) return;
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.12 + rush * 0.08, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.85 })
    );
    p.position.set(x - 0.6 - rush * 1.4, y, z + (Math.random() - 0.5) * (0.4 + rush));
    scene.add(p);
    trailParticles.push({ mesh: p, life: 0.7 + rush * 0.5 });
  }

  /* =========================================================================
     5-7. Bounce / charge / combo
     ========================================================================= */
  function clearSpaceRocks() {
    spaceRocks.forEach((r) => scene.remove(r.mesh));
    spaceRocks = [];
    spaceRockT = 0.2;
  }

  function spawnSpaceRock() {
    const size = 1.05 + Math.random() * 1.55;
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(size, 0),
      new THREE.MeshStandardMaterial({
        color: 0xd7c4b2,
        roughness: 0.82,
        metalness: 0.16,
        flatShading: true,
        emissive: 0xff7a59,
        emissiveIntensity: 0.55
      })
    );
    const ahead = 88 + Math.random() * 72;
    mesh.position.set(
      pos.x + ahead,
      pos.y + (Math.random() - 0.45) * 7,
      pos.z + (Math.random() - 0.5) * 11
    );
    addOutline(mesh);
    scene.add(mesh);
    const close = 9 + Math.random() * 8;
    spaceRocks.push({
      mesh,
      vx: vel.x - close,
      vy: (Math.random() - 0.5) * 2.4,
      vz: (Math.random() - 0.5) * 3.2,
      radius: size * 1.08,
      rotX: (Math.random() - 0.5) * 0.08,
      rotY: (Math.random() - 0.5) * 0.08
    });
  }

  function updateSpace(dt) {
    const wantSpace = pos.x >= LAYER_STRATO_END;
    if (wantSpace && !inSpace) {
      inSpace = true;
    }
    spaceBlend += ((inSpace ? 1 : 0) - spaceBlend) * Math.min(1, dt * 2.4);
    document.body.classList.toggle('is-space', spaceBlend > 0.08);
    if (hemiLight) hemiLight.intensity = 1.05 - spaceBlend * 0.72;
    scene.fog.density = 0.0042 * (1 - spaceBlend * 0.96);
    if (groundPlane) {
      groundPlane.material.transparent = true;
      groundPlane.material.opacity = Math.max(0, 1 - spaceBlend * 1.15);
      groundPlane.visible = spaceBlend < 0.95;
    }
    if (gridHelper) gridHelper.visible = spaceBlend < 0.72;

    const t = performance.now() / 1000;
    starLayers.forEach((layer, idx) => {
      const twinkle = reducedMotion ? 0.85 : (0.5 + 0.5 * Math.sin(t * layer.freq + idx));
      layer.mat.opacity = spaceBlend * (0.55 + 0.45 * twinkle);
      layer.mat.size = reducedMotion
        ? layer.baseSize
        : layer.baseSize * (0.82 + 0.4 * Math.sin(t * (1.8 + idx * 1.3) + idx));
      wrapStarLayer(layer, dt);
    });
    updateDepthScreens();

    if (inSpace) {
      const layer = resolveLayer();
      const cap = layer.id === 'orbit' ? 10 : 7;
      const gap = layer.id === 'orbit' ? 0.55 : 0.85;
      spaceRockT -= dt;
      if (spaceRockT <= 0 && spaceRocks.length < cap) {
        spawnSpaceRock();
        spaceRockT = gap + Math.random() * 0.4;
      }
    }

    for (let i = spaceRocks.length - 1; i >= 0; i--) {
      const r = spaceRocks[i];
      r.mesh.position.x += r.vx * dt;
      r.mesh.position.y += r.vy * dt;
      r.mesh.position.z += r.vz * dt;
      r.mesh.rotation.x += r.rotX;
      r.mesh.rotation.y += r.rotY;
      const dist = Math.hypot(
        pos.x - r.mesh.position.x,
        pos.y - r.mesh.position.y,
        pos.z - r.mesh.position.z
      );
      r.mesh.material.emissiveIntensity = dist < 48 ? 1.15 : 0.55;
      if (gameState === 'PLAYING' && dist < r.radius + 0.75) {
        gameOver('OBSTACLE');
        break;
      }
      if (r.mesh.position.x < pos.x - 22 || Math.abs(r.mesh.position.y - pos.y) > 42) {
        scene.remove(r.mesh);
        spaceRocks.splice(i, 1);
      }
    }
  }

  function updateDepthScreens() {
    const far = $('depth-far');
    const mid = $('depth-mid');
    const near = $('depth-near');
    if (!far || !mid || !near) return;
    const px = pos.x * 2.2 + pos.z * 8;
    const py = pos.y * 1.6;
    far.style.transform = `translate3d(${(-px * 0.12).toFixed(1)}px, ${(-py * 0.08).toFixed(1)}px, -180px) scale(1.18)`;
    mid.style.transform = `translate3d(${(-px * 0.28).toFixed(1)}px, ${(-py * 0.18).toFixed(1)}px, -80px) scale(1.08)`;
    near.style.transform = `translate3d(${(-px * 0.55).toFixed(1)}px, ${(-py * 0.32).toFixed(1)}px, 28px)`;
  }

  function clearFx() {
    particles.forEach((p) => scene.remove(p.mesh));
    trailParticles.forEach((p) => scene.remove(p.mesh));
    particles = [];
    trailParticles = [];
    clearSpaceRocks();
  }

  async function requestWake() {
    try {
      if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (_) { /* ignore */ }
  }

  function releaseWake() {
    if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  }

  function launchCharacter() {
    gameState = 'PLAYING';
    $('modal-start').classList.add('hidden');
    $('modal-gameover').classList.add('hidden');
    try {
      sound.ensureResumed();
      sound.playLaunch();
    } catch (_) { /* audio optional */ }
    requestWake();
    pos = { x: 0, y: 3.2, z: 0 };
    vel = { x: 17.5, y: 13.5, z: 0 };
    speedMultiplier = 1;
    bouncesCount = 0;
    combo = 0;
    maxCombo = 0;
    grazes = 0;
    hitStop = 0;
    lastBounceAt = 0;
    charge.active = false;
    charge.swiped = false;
    dodgeHold.left = false;
    dodgeHold.right = false;
    poseBurst = '';
    poseBurstT = 0;
    launchWarmT = 0.55;
    inSpace = false;
    spaceBlend = 0;
    digsLeft = 1;
    marksCount = 0;
    markIdx = 0;
    lastLayerId = 'tropo';
    apexCueSent = false;
    document.body.classList.remove('is-space');
    setText('hud-layer', '対流圏');
    setText('hud-goal', '次 25mプール');

    $('bounce-prompt').classList.add('is-on');
    $('dodge-controls').classList.add('is-on');
    window.setTimeout(() => {
      if (gameState === 'PLAYING') $('bounce-prompt').classList.remove('is-on');
    }, 2200);
    $('new-record-badge').classList.remove('is-on');
    document.body.classList.remove('is-danger');

    clearFx();
    spawnObstacles();
    stickmanGroup.rotation.set(0, 0, 0);
    resetCamera();
    updateHUD();
  }

  function triggerTossBounce(opts) {
    if (gameState !== 'PLAYING') return;
    const now = performance.now();
    if (now - lastBounceAt < BOUNCE_COOLDOWN_MS) {
      hapticFor('weak');
      return;
    }
    lastBounceAt = now;
    $('bounce-prompt').classList.remove('is-on', 'is-apex');

    const quality = forecastQuality();
    const aimX = opts.aimX ?? 0.5;
    const aimY = opts.aimY ?? 0.45;
    const chargeAmt = opts.charge ?? 0;

    const steer = (aimX - 0.5) * 2;
    const liftBias = Math.max(-1, Math.min(1, (0.46 - aimY) * 2));

    let gain = quality === 'perfect' ? 1.16 : quality === 'save' ? 1.14 : quality === 'good' ? 1.09 : 1.045;
    gain += chargeAmt * 0.12;
    speedMultiplier *= gain;

    const lift = (quality === 'weak' ? 8.2 : 11.2) + liftBias * 5.5 + chargeAmt * 4.2;
    vel.y = Math.max(vel.y, 7.5) + lift * 0.55;
    vel.y = Math.min(vel.y, 22);
    vel.x = Math.max(vel.x, 15) * (1.04 + chargeAmt * 0.08 + (1 - Math.max(0, liftBias)) * 0.03);
    vel.z += steer * (7.2 + chargeAmt * 3);
    vel.z *= 0.92;
    vel.z = Math.max(-11, Math.min(11, vel.z));
    apexCueSent = false;
    $('bounce-prompt').classList.remove('is-on', 'is-apex');

    if (quality === 'weak') combo = 0;
    else combo += 1;
    maxCombo = Math.max(maxCombo, combo);
    bouncesCount += 1;

    if (!reducedMotion) {
      hitStop = quality === 'perfect' || quality === 'save' ? 0.055 : 0.02;
    }

    sound.playBounce(quality, speedMultiplier, pos.z);
    hapticFor(quality);
    flashImpact(false);
    triggerBounceEffects(pos.x, pos.y, pos.z, quality);
    poseBurst = chargeAmt > 0.35 ? 'spike' : quality === 'perfect' || quality === 'save' ? 'cheer' : quality === 'weak' ? 'flail' : 'kick';
    poseBurstT = 0.42;
    stickmanGroup.rotation.z -= Math.PI * (0.28 + chargeAmt * 0.55);
    showJudge(quality);
    updateHUD();
  }

  function applyGraze() {
    grazes += 1;
    combo += 1;
    maxCombo = Math.max(maxCombo, combo);
    speedMultiplier *= 1.04;
    sound.playBounce('graze', speedMultiplier, pos.z);
    hapticFor('graze');
    showJudge('graze');
    poseBurst = 'graze';
    poseBurstT = 0.32;
    flashImpact(false);
    updateHUD();
  }

  function gameOver(cause) {
    if (gameState !== 'PLAYING') return;
    gameState = 'GAMEOVER';
    charge.active = false;
    dodgeHold.left = false;
    dodgeHold.right = false;
    $('charge-wrap').classList.remove('is-on');
    $('dodge-controls').classList.remove('is-on');
    sound.playCrash();
    releaseWake();
    flashImpact(true);
    if (navigator.vibrate) navigator.vibrate([30, 40, 50]);

    $('bounce-prompt').classList.remove('is-on');
    $('modal-gameover').classList.remove('hidden');

    const isNewBest = pos.x > bestDistance;
    if (isNewBest) {
      bestDistance = pos.x;
      localStorage.setItem('hyper_best_dist', bestDistance.toFixed(1));
      $('new-record-badge').classList.add('is-on');
    } else {
      $('new-record-badge').classList.remove('is-on');
    }

    setText('gameover-cause', cause === 'GROUND' ? 'GROUND CRASH' : 'OBSTACLE HIT');
    const shown = formatFlightDistance(pos.x);
    setText('res-distance', `${shown.value} ${shown.unit}`);
    const analog = describeDistance(pos.x);
    setText('res-analog-main', analog.main);
    setText('res-analog-sub', analog.sub);
    setText('res-speed', `x${speedMultiplier.toFixed(2)}`);
    setText('res-combo', String(maxCombo));
    setText('res-hits', `${bouncesCount} / ${grazes}`);
    setText('res-marks', String(marksCount));
    document.body.classList.remove('is-danger');
    updateHUD();
  }

  function updateHUD() {
    setFlightDistance('hud-distance', 'hud-distance-unit', pos.x);
    setText('hud-speed', speedMultiplier.toFixed(2));
    setText('hud-combo', String(combo));
    setFlightDistance('hud-best', 'hud-best-unit', bestDistance);

    const altT = Math.max(0, Math.min(1, pos.y / 22));
    $('alt-needle').style.bottom = `${8 + altT * 80}%`;
    $('alt-tape').classList.toggle('is-danger', pos.y < 3.6);
    document.body.classList.toggle('is-danger', gameState === 'PLAYING' && pos.y < 3.6);

    const q = forecastQuality();
    const ringColor = q === 'perfect' || q === 'save' ? 0xfacc15 : q === 'weak' ? 0x94a3b8 : 0x22d3ee;
    if (timingRing) {
      timingRing.material.color.setHex(ringColor);
    }
    if (halo) {
      halo.material.color.setHex(pos.y < 3.6 ? 0xf43f5e : 0x67e8f9);
    }
  }

  function drawRadar() {
    if (!radarCtx) return;
    const w = ($('radar').clientWidth || 148);
    const h = ($('radar').clientHeight || 78);
    radarCtx.clearRect(0, 0, w, h);
    radarCtx.fillStyle = 'rgba(8, 18, 32, 0.15)';
    radarCtx.fillRect(0, 0, w, h);
    radarCtx.strokeStyle = 'rgba(125, 211, 252, 0.35)';
    radarCtx.beginPath();
    radarCtx.moveTo(18, h / 2);
    radarCtx.lineTo(w - 8, h / 2);
    radarCtx.stroke();

    const next = nextThreats(8);
    const span = inSpace ? 160 : 48;
    next.forEach((obs) => {
      const dx = obs.x - pos.x;
      const dz = obs.z - pos.z;
      const px = 22 + (dx / span) * (w - 36);
      const py = h / 2 + dz * (inSpace ? 2.6 : 4.2);
      if (px < 8 || px > w - 6) return;
      radarCtx.fillStyle = dx < 36 ? '#facc15' : '#fb7185';
      radarCtx.beginPath();
      radarCtx.arc(px, py, dx < 36 ? 4.2 : 3.2, 0, Math.PI * 2);
      radarCtx.fill();
    });

    radarCtx.fillStyle = '#f8fafc';
    radarCtx.beginPath();
    radarCtx.arc(22, h / 2, 4.5, 0, Math.PI * 2);
    radarCtx.fill();
    radarCtx.fillStyle = '#22d3ee';
    radarCtx.fillRect(20, h / 2 - 1, 10, 2);
  }

  function updateChargeUi() {
    const wrap = $('charge-wrap');
    const fill = $('charge-fill');
    if (!charge.active || gameState !== 'PLAYING') {
      wrap.classList.remove('is-on');
      fill.style.width = '0%';
      return;
    }
    const held = performance.now() - charge.start;
    const amt = Math.max(0, Math.min(1, (held - CHARGE_TAP_MS) / CHARGE_FULL_MS));
    wrap.classList.toggle('is-on', amt > 0.02);
    fill.style.width = `${Math.round(amt * 100)}%`;
  }

  function dashDodge(dir) {
    if (gameState !== 'PLAYING' || !dir) return;
    vel.z += dir * 15;
    pos.z = Math.max(-Z_LIMIT, Math.min(Z_LIMIT, pos.z + dir * 1.15));
    poseBurst = 'graze';
    poseBurstT = 0.28;
    sound.playDodge(pos.z);
    if (navigator.vibrate) navigator.vibrate(12);
    showJudge('dodge');
  }

  function finishCharge(aimX, aimY) {
    if (!charge.active) return;
    const swiped = charge.swiped;
    const swipeDir = charge.swipeDir;
    charge.active = false;
    charge.pointerId = null;
    charge.fromKey = false;
    charge.swiped = false;
    charge.swipeDir = 0;
    if (swiped) {
      dashDodge(swipeDir);
      updateChargeUi();
      return;
    }
    const held = performance.now() - charge.start;
    const amt = Math.max(0, Math.min(1, (held - CHARGE_TAP_MS) / CHARGE_FULL_MS));
    triggerTossBounce({ aimX, aimY, charge: amt, held });
    updateChargeUi();
  }

  /* =========================================================================
     Loop
     ========================================================================= */
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const rawDt = Math.min(clock.getDelta(), 0.05);
    let dt = rawDt;
    if (hitStop > 0) {
      dt *= reducedMotion ? 1 : 0.14;
      hitStop -= rawDt;
    }

    if (gameState === 'PLAYING') {
      vel.y += GRAVITY * dt;
      const strafe = (dodgeHold.left ? -1 : 0) + (dodgeHold.right ? 1 : 0);
      if (strafe) {
        vel.z += strafe * 46 * dt;
        pos.z += strafe * 12 * dt;
        vel.z *= Math.pow(0.55, dt * 4);
      } else {
        vel.z *= Math.pow(0.72, dt * 4);
      }
      pos.x += vel.x * dt;
      pos.y += vel.y * dt;
      pos.z += vel.z * dt;
      pos.z = Math.max(-Z_LIMIT, Math.min(Z_LIMIT, pos.z));

      stickmanGroup.position.set(pos.x, pos.y, pos.z);
      stickmanGroup.rotation.z += Math.min(28, Math.abs(vel.x)) * Math.sign(vel.x || 1) * 0.008 * dt;
      stickmanGroup.rotation.x = pos.z * 0.05;
      stickmanGroup.rotation.y = vel.z * 0.035;
      updateStickmanPose(dt);

      if (pos.y <= 1.0) {
        pos.y = 1.0;
        if (digsLeft > 0) triggerDigSave();
        else gameOver('GROUND');
      }

      for (let i = 0; i < obstacles.length; i++) {
        const obs = obstacles[i];
        obs.mesh.rotation.x += obs.rotSpeed;
        obs.mesh.rotation.y += obs.rotSpeed;
        const dist = Math.hypot(pos.x - obs.x, pos.y - obs.y, pos.z - obs.z);
        if (dist < obs.radius + 0.75) {
          gameOver('OBSTACLE');
          break;
        }
        if (
          !obs.grazed &&
          dist > obs.radius + 0.75 &&
          dist < obs.radius + 1.95 &&
          Math.abs(pos.x - obs.x) < 1.35
        ) {
          obs.grazed = true;
          applyGraze();
        }
        const approaching = obs.x - pos.x;
        obs.mesh.material.emissiveIntensity = approaching > 0 && approaching < 22 ? 1.4 : 0.75;
      }

      addTrailParticle(pos.x, pos.y, pos.z);
      updateSpeedStreaks(dt);
      updateTelegraphs();
      updateMilestones();
      updateLayerState();
      updateApexCue();
      updateSpace(dt);

      const skyColor = new THREE.Color().lerpColors(
        new THREE.Color(0x173154),
        new THREE.Color(0x07060f),
        spaceBlend
      );
      scene.background = skyColor;
      scene.fog.color = skyColor;

      frameCamera(dt);

      groundPlane.position.x = pos.x;
      groundPlane.position.z = pos.z;
      gridHelper.position.x = pos.x;
      gridHelper.position.z = pos.z;

      if (pos.y < 3.4) sound.playWarn(pos.z);
      updateHUD();
      drawRadar();
      updateChargeUi();
    } else if (gameState === 'GAMEOVER' && stickmanGroup) {
      updateStickmanPose(rawDt);
      updateSpace(dt);
      if (!reducedMotion) stickmanGroup.rotation.z += rawDt * 2.2;
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += (p.vz || 0) * dt;
      p.life -= dt * 2.2;
      p.mesh.scale.setScalar(Math.max(0.01, p.life));
      if (p.life <= 0) {
        scene.remove(p.mesh);
        particles.splice(i, 1);
      }
    }
    for (let i = trailParticles.length - 1; i >= 0; i--) {
      const p = trailParticles[i];
      p.life -= dt * 2.4;
      p.mesh.material.opacity = Math.max(0, p.life);
      p.mesh.scale.setScalar(Math.max(0.01, p.life));
      if (p.life <= 0) {
        scene.remove(p.mesh);
        trailParticles.splice(i, 1);
      }
    }

    renderer.render(scene, camera);
  }

  function onWindowResize() {
    if (!camera || !renderer) return;
    const v = viewSize();
    camera.aspect = v.w / v.h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(v.w, v.h);
    setupRadar();
  }

  /* =========================================================================
     Input
     ========================================================================= */
  function bindTap(el, handler) {
    if (!el) return;
    const fire = (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('is-pressed');
      sound.ensureResumed();
      if (e.pointerId != null && el.setPointerCapture) {
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      }
      if (navigator.vibrate) navigator.vibrate(14);
      handler(e);
    };
    const release = () => el.classList.remove('is-pressed');
    el.addEventListener('pointerdown', fire);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', release);
  }

  function isUiTarget(t) {
    return t.closest('button') || t.closest('.modal') || t.closest('#modal-tech') || t.closest('#dodge-controls');
  }

  function bindHold(el, on, off) {
    if (!el) return;
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('is-pressed');
      sound.ensureResumed();
      if (e.pointerId != null && el.setPointerCapture) {
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      }
      if (navigator.vibrate) navigator.vibrate(12);
      on();
    };
    const up = () => {
      el.classList.remove('is-pressed');
      off();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  function bindInputs() {
    let lastTouch = 0;
    const blockZoom = (e) => {
      const now = Date.now();
      if (now - lastTouch < 300) e.preventDefault();
      lastTouch = now;
    };
    document.addEventListener('touchstart', (e) => {
      blockZoom(e);
      sound.ensureResumed();
      if (gameState === 'PLAYING' && !isUiTarget(e.target) && !e.target.closest('[data-scrollable]')) {
        e.preventDefault();
      }
    }, { passive: false });
    document.addEventListener('touchend', (e) => {
      blockZoom(e);
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
      if (!e.target.closest('[data-scrollable]')) e.preventDefault();
    }, { passive: false });
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
      document.addEventListener(type, (e) => e.preventDefault());
    });
    document.addEventListener('dblclick', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('selectstart', (e) => e.preventDefault());
    document.addEventListener('dragstart', (e) => e.preventDefault());

    window.addEventListener('pointerdown', (e) => {
      sound.ensureResumed();
      if (gameState !== 'PLAYING' || isUiTarget(e.target)) return;
      charge.active = true;
      charge.start = performance.now();
      const n = pointerNorm(e);
      charge.x = n.x;
      charge.y = n.y;
      charge.pointerId = e.pointerId;
      charge.fromKey = false;
      charge.startClientX = e.clientX;
      charge.startClientY = e.clientY;
      charge.swiped = false;
      charge.swipeDir = 0;
      if (e.pointerId != null && renderer && renderer.domElement.setPointerCapture) {
        try { renderer.domElement.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      }
      updateChargeUi();
    });

    window.addEventListener('pointermove', (e) => {
      if (!charge.active || charge.fromKey || e.pointerId !== charge.pointerId) return;
      const n = pointerNorm(e);
      charge.x = n.x;
      charge.y = n.y;
      const dx = e.clientX - charge.startClientX;
      const dy = e.clientY - charge.startClientY;
      if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.15) {
        charge.swiped = true;
        charge.swipeDir = dx > 0 ? 1 : -1;
      }
    });

    const endPointer = (e) => {
      if (!charge.active || charge.fromKey) return;
      if (charge.pointerId !== null && e.pointerId !== charge.pointerId) return;
      const n = pointerNorm(e);
      finishCharge(n.x, n.y);
    };
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        dodgeHold.left = true;
        return;
      }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        dodgeHold.right = true;
        return;
      }
      if (e.code !== 'Space') return;
      e.preventDefault();
      sound.ensureResumed();
      if (gameState === 'START') {
        launchCharacter();
        return;
      }
      if (gameState === 'GAMEOVER') {
        launchCharacter();
        return;
      }
      if (gameState !== 'PLAYING' || charge.active) return;
      charge.active = true;
      charge.start = performance.now();
      charge.x = 0.5;
      charge.y = 0.42;
      charge.fromKey = true;
      charge.swiped = false;
      updateChargeUi();
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') dodgeHold.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') dodgeHold.right = false;
      if (e.code !== 'Space' || !charge.fromKey) return;
      e.preventDefault();
      finishCharge(charge.x, charge.y);
    });

    bindTap($('btn-launch'), launchCharacter);
    bindTap($('btn-retry'), launchCharacter);
    bindTap($('btn-tech'), () => $('modal-tech').classList.remove('hidden'));
    const closeTech = () => $('modal-tech').classList.add('hidden');
    bindTap($('btn-close-tech'), closeTech);
    bindTap($('btn-close-tech-bottom'), closeTech);

    bindHold($('btn-dodge-left'), () => { dodgeHold.left = true; }, () => { dodgeHold.left = false; });
    bindHold($('btn-dodge-right'), () => { dodgeHold.right = true; }, () => { dodgeHold.right = false; });

    bindTap($('btn-sound'), () => {
      sound.muted = !sound.muted;
      localStorage.setItem('hyper_muted', sound.muted ? '1' : '0');
      $('icon-sound-on').hidden = sound.muted;
      $('icon-sound-off').hidden = !sound.muted;
    });
    $('icon-sound-on').hidden = sound.muted;
    $('icon-sound-off').hidden = !sound.muted;

    const onForeground = () => {
      sound.ensureResumed();
      onWindowResize();
      if (gameState === 'PLAYING') requestWake();
    };
    const onBackground = () => {
      releaseWake();
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) onBackground();
      else onForeground();
    });
    window.addEventListener('pageshow', onForeground);
    window.addEventListener('focus', onForeground);
    window.addEventListener('pagehide', onBackground);
    window.addEventListener('blur', onBackground);
  }

  window.addEventListener('DOMContentLoaded', () => {
    if (typeof THREE === 'undefined') {
      setText('judge', '3Dエンジンを読めませんでした');
      $('judge').className = 'weak is-on';
      return;
    }
    try {
      init3D();
    } catch (_) {
      setText('judge', '3D描画を開始できませんでした');
      $('judge').className = 'weak is-on';
      return;
    }
    bindInputs();
    animate();
    updateHUD();
    drawRadar();
    if (/[?&]demo=1(?:&|$)/.test(location.search)) {
      launchCharacter();
    }
  });
})();
