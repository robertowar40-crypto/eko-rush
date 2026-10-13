/* Eko Rush – game engine */
(function () {
  'use strict';
  const LM = window.LagosModels;
  const PvP = window.EkoPvP;
  const $ = (s) => document.querySelector(s);
  const V3 = THREE.Vector3;
  const LANES = [-2.2, 0, 2.2];
  const G = 40, JUMP_V = 12.6, SUPER_JUMP_V = 17.5, ROLL_TIME = 0.65, FLY_Y = 7.6;
  const POWER = {
    magnet: { time: 12, label: 'Magnet' },
    shoes: { time: 12, label: 'Super sneakers' },
    x2: { time: 15, label: '2X score' },
    jet: { time: 8, label: 'Jetpack' },
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };

  /* =================== SOUND =================== */
  const Sound = (() => {
    let ctx = null, master = null, music = null, timer = null, nextT = 0, step = 0, noiseBuf = null, jetSrc = null, jetGain = null;
    let muted = store.get('ekorush-muted', '0') === '1';
    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = muted ? 0 : 0.7; master.connect(ctx.destination);
        music = ctx.createGain(); music.gain.value = 0.3; music.connect(master);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const now = () => (ensure() ? ctx.currentTime : 0);
    function getNoise(c) {
      if (!noiseBuf) {
        noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      return noiseBuf;
    }
    function tone(f, dur, type = 'sine', vol = 0.1, f2 = 0, at = 0, dest = null) {
      const c = ensure(); if (!c) return;
      const t0 = at || c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t0);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(dest || master);
      o.start(t0); o.stop(t0 + dur + 0.05);
    }
    function noise(dur, vol, at = 0, dest = null, freq = 7000) {
      const c = ensure(); if (!c) return;
      const s = c.createBufferSource(); s.buffer = getNoise(c);
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq;
      const g = c.createGain(); const t0 = at || c.currentTime;
      g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(f); f.connect(g); g.connect(dest || master);
      s.start(t0); s.stop(t0 + dur + 0.02);
    }
    const STEP = 60 / 108 / 4;
    const BASS = [55, 0, 0, 55, 0, 0, 65.4, 0, 73.4, 0, 0, 65.4, 0, 0, 49, 0];
    const LEAD = [440, 0, 523, 0, 0, 587, 0, 523, 0, 440, 0, 0, 392, 0, 440, 0, 659, 0, 587, 0, 523, 0, 0, 440, 0, 392, 0, 440, 0, 0, 0, 0];
    function playStep(s, t) {
      const i = s % 16;
      if (i === 0 || i === 7 || i === 10) tone(130, 0.22, 'sine', 0.5, 45, t, music);
      if (i === 4 || i === 12) noise(0.12, 0.22, t, music, 1800);
      noise(0.03, i % 2 ? 0.04 : 0.08, t, music, 8000);
      if (BASS[i]) tone(BASS[i] * 2, 0.26, 'triangle', 0.28, BASS[i] * 1.9, t, music);
      if (i === 3 || i === 11 || i === 14) tone(i === 14 ? 660 : 880, 0.05, 'sine', 0.05, 0, t, music);
      const l = LEAD[s % 32];
      if (l && s % 64 >= 32) tone(l, 0.18, 'square', 0.03, 0, t, music);
    }
    function schedule() { if (!ctx) return; while (nextT < ctx.currentTime + 0.15) { playStep(step, nextT); nextT += STEP; step++; } }
    return {
      unlock: ensure,
      startMusic() { const c = ensure(); if (!c || timer) return; nextT = c.currentTime + 0.05; step = 0; timer = setInterval(schedule, 40); },
      stopMusic() { clearInterval(timer); timer = null; },
      coin() { const t = now(); tone(1320, 0.07, 'square', 0.04, 0, t); tone(1980, 0.12, 'square', 0.035, 0, t + 0.06); },
      jump() { tone(380, 0.18, 'sine', 0.12, 760); },
      land() { noise(0.08, 0.08, 0, null, 900); },
      roll() { noise(0.2, 0.12, 0, null, 500); },
      swoosh() { noise(0.08, 0.05, 0, null, 3000); },
      stumble() { tone(220, 0.22, 'sawtooth', 0.08, 110); },
      crash() { tone(160, 0.5, 'sawtooth', 0.16, 40); noise(0.4, 0.25, 0, null, 300); },
      power() { const t = now(); [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, 'triangle', 0.08, 0, t + i * 0.07)); },
      close() { const t = now(); tone(880, 0.08, 'triangle', 0.07, 0, t); tone(1320, 0.12, 'triangle', 0.07, 0, t + 0.07); },
      whistle() { const t = now(); tone(2300, 0.16, 'sine', 0.06, 2500, t); tone(2300, 0.32, 'sine', 0.06, 2450, t + 0.22); },
      beep(hi) { tone(hi ? 1320 : 660, hi ? 0.4 : 0.15, 'square', 0.06); },
      jetOn() {
        const c = ensure(); if (!c || jetSrc) return;
        const s = c.createBufferSource(); s.buffer = getNoise(c); s.loop = true;
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 850;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.2, c.currentTime + 0.25);
        s.connect(f); f.connect(g); g.connect(master); s.start();
        jetSrc = s; jetGain = g;
        tone(180, 0.6, 'sawtooth', 0.08, 640);
      },
      jetOff() {
        if (!jetSrc) return;
        jetGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
        jetSrc.stop(ctx.currentTime + 0.4);
        jetSrc = null;
      },
      setMuted(m) { muted = m; store.set('ekorush-muted', m ? '1' : '0'); if (master) master.gain.value = m ? 0 : 0.7; },
      get muted() { return muted; },
    };
  })();

  /* =================== RENDERER / SCENE =================== */
  const canvas = $('#game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(window.devicePixelRatio, 1.25);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe9ff, 85, 215);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 240);
  let baseFov = 62;

  const hemi = new THREE.HemisphereLight(0xdff2ff, 0xb08860, 0.85);
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.05);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 90 });
  sun.shadow.bias = -0.0006;
  const playerLight = new THREE.PointLight(0xffd9a0, 0, 16, 1.6);
  scene.add(hemi, sun, sun.target, playerLight);

  const skyDay = LM.canvasTex(16, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#3aa6ff'); gr.addColorStop(0.55, '#bfe6ff'); gr.addColorStop(1, '#ffe2c4');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const skyNight = LM.canvasTex(512, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#050816'); gr.addColorStop(0.6, '#141a44'); gr.addColorStop(1, '#3b2a5a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`; g.fillRect(Math.random() * w, Math.random() * h * 0.7, 1.4, 1.4); }
    g.fillStyle = '#fffbe6'; g.beginPath(); g.arc(w * 0.78, h * 0.18, 16, 0, Math.PI * 2); g.fill();
  });

  /* ---------- ground, road, sidewalks ---------- */
  const ROAD_LEN = 330;
  const scrollers = [];
  function scroller(mesh, tex, axis, sign, R) { tex.repeat[axis] = R; scrollers.push({ mesh, tex, axis, sign, R }); scene.add(mesh); return mesh; }

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), LM.mat(0xc9a77a, { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  const roadTex = LM.canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#3b3b40'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = '#f5f5f5';
    [88, 167].forEach((x) => g.fillRect(x - 3, 0, 6, h * 0.5));
    g.fillStyle = '#ffcc00';
    g.fillRect(6, 0, 5, h); g.fillRect(w - 11, 0, 5, h);
  }, true);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(7.2, ROAD_LEN), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.92 }));
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  scroller(road, roadTex, 'y', 1, ROAD_LEN / 8);

  const paveTex = () => LM.canvasTex(128, 128, (g, w) => {
    g.fillStyle = '#b9b2a6'; g.fillRect(0, 0, w, w);
    g.strokeStyle = '#8f877b'; g.lineWidth = 3;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) { g.strokeRect(x * 64 + (y % 2) * 32, y * 32, 64, 32); g.strokeRect(x * 64 + (y % 2) * 32 - 128, y * 32, 64, 32); }
    g.fillStyle = 'rgba(160,60,40,0.18)'; g.fillRect(0, 0, w, 32);
  }, true);
  const stripeTex = () => LM.canvasTex(128, 16, (g, w, h) => { g.fillStyle = '#ffcc00'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.fillRect(64, 0, 64, h); }, true);
  [-1, 1].forEach((s) => {
    const pt = paveTex();
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(3.4, ROAD_LEN), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.95 }));
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(s * 5.5, 0.2, 0);
    walk.receiveShadow = true;
    scroller(walk, pt, 'y', 1, ROAD_LEN / 3.4);
    const st = stripeTex();
    const curb = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_LEN, 0.2), new THREE.MeshStandardMaterial({ map: st, roughness: 0.6 }));
    curb.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2;
    curb.position.set(s * 3.6, 0.1, 0);
    scroller(curb, st, 'x', s < 0 ? 1 : -1, ROAD_LEN / 1.6);
  });

  /* =================== OUTLINES (toon-style, makes obstacles readable) =================== */
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x17141f, side: THREE.BackSide });
  function addOutline(root, t = 0.04, minSize = 0.3) {
    const list = [];
    root.traverse((o) => { if (o.isMesh && !o.userData.outline && !(o.material && o.material.transparent)) list.push(o); });
    const size = new V3(), center = new V3();
    for (const m of list) {
      const g = m.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      g.boundingBox.getSize(size);
      g.boundingBox.getCenter(center);
      if (Math.max(size.x, size.y, size.z) < minSize || Math.min(size.x, size.y, size.z) < 0.025) continue;
      const k = new V3((size.x + 2 * t) / size.x, (size.y + 2 * t) / size.y, (size.z + 2 * t) / size.z);
      const o = new THREE.Mesh(g, outlineMat);
      o.userData.outline = true;
      o.quaternion.copy(m.quaternion);
      o.scale.copy(m.scale).multiply(k);
      const off = center.clone().multiply(new V3(1 - k.x, 1 - k.y, 1 - k.z)).multiply(m.scale).applyQuaternion(m.quaternion);
      o.position.copy(m.position).add(off);
      m.parent.add(o);
    }
    return root;
  }

  /* Merge a static model into one mesh per material: far fewer draw calls. */
  const matCache = new Map();
  function canonMat(m) {
    const id = (t) => (t ? t.uuid : '-');
    const key = [m.type, m.color && m.color.getHex(), m.emissive && m.emissive.getHex(), m.emissiveIntensity, id(m.map), id(m.emissiveMap),
      m.roughness, m.metalness, m.side, m.transparent, m.opacity, m.depthWrite, m.blending, m.flatShading, m.userData.glow && m.userData.glow.join()].join('|');
    if (!matCache.has(key)) matCache.set(key, m);
    return matCache.get(key);
  }
  const isPlain = (m) => m.isMeshStandardMaterial && !m.map && !m.emissiveMap && !m.transparent && !m.userData.glow && m.emissive.getHex() === 0;
  const vcMats = {};
  function vcMat(m) {
    const metal = m.metalness >= 0.3, side = m.side;
    const key = side + (metal ? 'm' : '');
    return vcMats[key] || (vcMats[key] = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: metal ? 0.45 : 0.75, metalness: metal ? 0.5 : 0.05, side }));
  }
  function bake(root) {
    const list = [];
    root.traverse((m) => { if (m.isMesh) list.push(m); });
    const out = new THREE.Group();
    mergeMeshes(list, root).forEach((m) => out.add(m));
    out.userData = root.userData;
    out.position.copy(root.position); out.quaternion.copy(root.quaternion); out.scale.copy(root.scale);
    return out;
  }
  /* Same idea for animated characters: merge the meshes hanging off each joint. */
  function bakeRig(root) {
    root.updateMatrixWorld(true);
    const nodes = [];
    root.traverse((n) => { if (!n.isMesh) nodes.push(n); });
    for (const n of nodes) {
      const kids = n.children.filter((c) => c.isMesh && !c.children.length);
      if (kids.length < 2) continue;
      const merged = mergeMeshes(kids, n);
      kids.forEach((k) => n.remove(k));
      merged.forEach((m) => n.add(m));
    }
    return root;
  }
  function mergeMeshes(list, space) {
    space.updateMatrixWorld(true);
    const inv = space.matrixWorld.clone().invert(), rel = new THREE.Matrix4();
    const groups = new Map();
    const addPart = (m, material, start, count) => {
      const plain = isPlain(material);
      const mat = plain ? vcMat(material) : canonMat(material);
      const key = mat.uuid + (m.castShadow ? 'c' : '') + (m.receiveShadow ? 'r' : '');
      if (!groups.has(key)) groups.set(key, { mat, vc: plain, cast: m.castShadow, recv: m.receiveShadow, parts: [] });
      groups.get(key).parts.push({ m, start, count, color: plain ? material.color : null });
    };
    list.forEach((m) => {
      for (let p = m; p && p !== space; p = p.parent) if (!p.visible) return;
      const geo = m.geometry, total = geo.index ? geo.index.count : geo.attributes.position.count;
      if (Array.isArray(m.material)) {
        for (const gr of geo.groups) if (m.material[gr.materialIndex]) addPart(m, m.material[gr.materialIndex], gr.start, Math.min(gr.count, total - gr.start));
      } else addPart(m, m.material, 0, total);
    });
    const out = [];
    const nm = new THREE.Matrix3(), v = new V3();
    for (const g of groups.values()) {
      let vCount = 0, iCount = 0;
      for (const p of g.parts) { vCount += p.m.geometry.attributes.position.count; iCount += p.count; }
      const P3 = new Float32Array(vCount * 3), N3 = new Float32Array(vCount * 3), U2 = new Float32Array(vCount * 2);
      const I = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
      const C3 = g.vc ? new Float32Array(vCount * 3) : null;
      let vo = 0, io = 0;
      for (const { m, start, count, color } of g.parts) {
        if (C3) for (let i = 0; i < m.geometry.attributes.position.count; i++) { const k = (vo + i) * 3; C3[k] = color.r; C3[k + 1] = color.g; C3[k + 2] = color.b; }
        const geo = m.geometry, pa = geo.attributes.position, na = geo.attributes.normal, ua = geo.attributes.uv;
        rel.multiplyMatrices(inv, m.matrixWorld);
        nm.getNormalMatrix(rel);
        for (let i = 0; i < pa.count; i++) {
          const k = (vo + i) * 3;
          v.fromBufferAttribute(pa, i).applyMatrix4(rel);
          P3[k] = v.x; P3[k + 1] = v.y; P3[k + 2] = v.z;
          if (na) { v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); N3[k] = v.x; N3[k + 1] = v.y; N3[k + 2] = v.z; }
          if (ua) { U2[(vo + i) * 2] = ua.getX(i); U2[(vo + i) * 2 + 1] = ua.getY(i); }
        }
        const flip = rel.determinant() < 0;
        const idx = (i) => (geo.index ? geo.index.array[i] : i) + vo;
        for (let i = start; i < start + count; i += 3) {
          I[io++] = idx(i);
          I[io++] = idx(flip ? i + 2 : i + 1);
          I[io++] = idx(flip ? i + 1 : i + 2);
        }
        vo += pa.count;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P3, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(N3, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(U2, 2));
      if (C3) geo.setAttribute('color', new THREE.BufferAttribute(C3, 3));
      geo.setIndex(new THREE.BufferAttribute(I, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, g.mat);
      mesh.castShadow = g.cast; mesh.receiveShadow = g.recv;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      out.push(mesh);
    }
    return out;
  }

  /* =================== PROTOTYPES =================== */
  const protos = {
    danfo: bake(addOutline(LM.createDanfo())), brt: bake(addOutline(LM.createBRT())), keke: bake(addOutline(LM.createKeke())),
    barrier: bake(addOutline(LM.createBarrier(), 0.035, 0.15)), gantry: bake(addOutline(LM.createGantry(), 0.035, 0.15)), ramp: bake(addOutline(LM.createRamp())),
    coin: (() => { const c = LM.createCoin(); c.material = c.material[1]; c.castShadow = false; return c; })(),
    magnet: LM.createPowerup('magnet'), shoes: LM.createPowerup('shoes'), x2: LM.createPowerup('x2'), jet: LM.createPowerup('jet'),
  };
  const noShadow = (o) => { o.traverse((m) => { if (m.isMesh) m.castShadow = false; }); return o; };
  const buildingProtos = Array.from({ length: 20 }, () => bake(noShadow(LM.createBuilding())));
  const lampProto = bake(noShadow(LM.createLamp()));
  const palmProtos = Array.from({ length: 4 }, () => bake(noShadow(LM.createPalm())));
  const stallProtos = Array.from({ length: 3 }, () => bake(noShadow(LM.createStall())));
  const boardProtos = { '-1': [0, 1, 2].map(() => bake(noShadow(LM.createBillboard(-1)))), '1': [0, 1, 2].map(() => bake(noShadow(LM.createBillboard(1)))) };
  Object.values(boardProtos).flat().forEach((b) => { b.rotation.y = b.rotation.y > 1 ? Math.PI + 0.35 : -0.35; });
  const lawnMat = LM.mat(0x5fa34a, { roughness: 1 });
  const landmarkProtos = {
    theatre: bake(LM.createNationalTheatre()), necom: bake(LM.createNecomHouse()), civic: bake(LM.createCivicCentre()), tbs: bake(LM.createTBSGate()),
    link: bake(LM.createLinkBridge()), third: bake(LM.createThirdMainland()), eko: bake(noShadow(LM.createEkoAtlantic())),
  };
  {
    const warm = new THREE.Group();
    [protos, landmarkProtos].forEach((set) => Object.values(set).forEach((p) => warm.add(p.clone())));
    [buildingProtos, palmProtos, stallProtos, boardProtos['-1'], [lampProto]].forEach((a) => a.forEach((p) => warm.add(p.clone())));
    scene.add(warm);
    renderer.compile(scene, camera);
    scene.remove(warm);
  }
  const LANDMARK_ORDER = ['theatre', 'link', 'necom', 'tbs', 'third', 'civic', 'eko'];
  const LANDMARK_OFFSET = { theatre: 27, necom: 20.5, civic: 19, eko: 30 };
  const blinkMat = LM.tex().blinkMat;

  /* =================== STATE =================== */
  let state = 'menu';            // menu | countdown | playing | paused | dying | over
  let mode = 'solo';             // mode of the current run
  let menuMode = 'solo';         // selected menu tab
  const P = {};
  let distance = 0, speed = 0, score = 0, runCoins = 0, mult = 1, t = 0, runPhase = 0, lastStep = 0, deathT = 0, shake = 0, countdownT = 0, lastCount = 0;
  let chaserDist = 16, deathReason = '', finalScore = 0, sendT = 0, fovKick = 0;
  const power = { magnet: 0, shoes: 0, x2: 0, jet: 0 };
  let nextRowZ = -50, sceneryCursor = 60, blockCount = 0, landmarkIdx = 0;
  const obstacles = [], coins = [], powerups = [], scenery = [], triggers = [];
  let runnerKey = store.get('ekorush-runner', 'tunde');
  if (!LM.VARIANTS[runnerKey] || runnerKey === 'officer') runnerKey = 'tunde';
  let player, jetpack;
  function buildPlayer() {
    if (player) scene.remove(player);
    player = bakeRig(addOutline(LM.createRunner(runnerKey), 0.014, 0.08));
    jetpack = LM.createJetpack();
    jetpack.position.set(0, 0.36, 0.3);
    jetpack.visible = false;
    player.userData.rig.torso.add(jetpack);
    scene.add(player);
  }
  buildPlayer();
  const officer = bakeRig(addOutline(LM.createOfficer(), 0.014, 0.08));
  scene.add(officer);
  const camLook = new V3();

  /* seeded RNG so both racers get the same course */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let r = Math.imul(a ^ (a >>> 15), 1 | a);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  let R = Math.random;
  const Rri = (a, b) => Math.floor(a + R() * (b - a + 1));
  const Rpick = (arr) => arr[Math.floor(R() * arr.length)];

  /* =================== EFFECTS =================== */
  const dust = [];
  const dustGeo = new THREE.SphereGeometry(0.12, 7, 5);
  for (let i = 0; i < 90; i++) {
    const m = new THREE.Mesh(dustGeo, new THREE.MeshBasicMaterial({ color: 0xd8c3a0, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false;
    scene.add(m);
    dust.push({ m, v: new V3(), life: 0, max: 1, size: 1, op: 0.55 });
  }
  let dustIdx = 0;
  function puff(x, y, z, n, color, o = {}) {
    for (let i = 0; i < n; i++) {
      const d = dust[dustIdx++ % dust.length];
      d.m.material.color.set(color);
      d.m.material.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending;
      d.m.position.set(x + (Math.random() - 0.5) * (o.jitter || 0.4), y, z + (Math.random() - 0.5) * (o.jitter || 0.4));
      const sp = o.spread || 1;
      d.v.set((Math.random() - 0.5) * 2 * sp, (o.vy != null ? o.vy : Math.random() * 1.6) + (Math.random() - 0.5) * 0.6, (Math.random() - 0.2) * 2 * sp + (o.vz || 0));
      d.max = d.life = (o.life || 0.6) * (0.7 + Math.random() * 0.6);
      d.size = o.size || 1;
      d.op = o.op || 0.55;
      d.m.visible = true;
    }
  }
  function updateDust(dt) {
    for (const d of dust) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { d.m.visible = false; continue; }
      const k = d.life / d.max;
      d.m.position.addScaledVector(d.v, dt);
      d.v.multiplyScalar(Math.pow(0.2, dt));
      d.m.scale.setScalar(d.size * (1.7 - k));
      d.m.material.opacity = d.op * k;
    }
  }

  const STREAKS = 70;
  const streakPos = new Float32Array(STREAKS * 6);
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
  const streakMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const streakLines = new THREE.LineSegments(streakGeo, streakMat);
  streakLines.frustumCulled = false;
  scene.add(streakLines);
  const streaks = Array.from({ length: STREAKS }, () => ({ x: 0, y: 0, z: 0 }));
  function resetStreak(s, anywhere) {
    const side = Math.random() < 0.5 ? -1 : 1;
    s.x = side * (1.2 + Math.random() * 7);
    s.y = -2 + Math.random() * 8;
    s.z = anywhere ? -Math.random() * 70 : -45 - Math.random() * 30;
  }
  streaks.forEach((s) => resetStreak(s, true));
  function updateStreaks(dt) {
    const flying = power.jet > 0 && state === 'playing';
    const target = state === 'playing' ? THREE.MathUtils.clamp((speed - 17) / 22, 0, 0.42) + (flying ? 0.35 : 0) : 0;
    streakMat.opacity += (target - streakMat.opacity) * Math.min(1, dt * 4);
    streakLines.visible = streakMat.opacity > 0.01;
    if (!streakLines.visible) return;
    const len = 1 + speed * 0.12 + (flying ? 3 : 0);
    const cp = camera.position;
    streaks.forEach((s, i) => {
      s.z += speed * 0.9 * dt + (flying ? 25 * dt : 0);
      if (s.z > 3) resetStreak(s, false);
      const o = i * 6;
      streakPos[o] = cp.x + s.x; streakPos[o + 1] = cp.y + s.y; streakPos[o + 2] = cp.z + s.z;
      streakPos[o + 3] = cp.x + s.x; streakPos[o + 4] = cp.y + s.y; streakPos[o + 5] = cp.z + s.z - len;
    });
    streakGeo.attributes.position.needsUpdate = true;
  }

  /* =================== SPAWNING =================== */
  function addScenery(obj, rear) { scene.add(obj); scenery.push({ obj, rear }); }

  function fillSide(s, z0, length) {
    let z = z0;
    while (z > z0 - length) {
      const b = LM.pick(buildingProtos).clone();
      const L = b.userData.len, D = b.userData.depth;
      b.position.set(s * (8.2 + D / 2), 0, z - L / 2);
      if (s > 0) b.rotation.y = Math.PI;
      addScenery(b, z - L);
      z -= L + LM.rnd(0.4, 2.5);
    }
    for (let zz = z0 - LM.rnd(2, 7); zz > z0 - length; zz -= LM.rnd(6, 11)) {
      const r = Math.random();
      let o = null;
      if (r < 0.38) { o = LM.pick(palmProtos).clone(); o.position.set(s * 6.9, 0.2, zz); o.rotation.y = LM.rnd(0, 6); }
      else if (r < 0.58) { o = LM.pick(stallProtos).clone(); o.position.set(s * 6.1, 0.2, zz); o.rotation.y = LM.rnd(0, 6); }
      else if (r < 0.68) { o = LM.pick(boardProtos[s]).clone(); o.position.set(s * 6.9, 0.2, zz); }
      if (o) addScenery(o, zz - 4);
    }
    return z;
  }
  function lampsAlong(z0, length) {
    for (let z = z0 - 5; z > z0 - length; z -= 20) {
      [-1, 1].forEach((s) => {
        const l = lampProto.clone();
        l.position.set(s * 6.5, 0.2, z);
        if (s > 0) l.rotation.y = Math.PI;
        addScenery(l, z - 1);
      });
    }
  }

  function spawnLandmark(key) {
    const p = landmarkProtos[key];
    const obj = p.clone();
    const len = p.userData.len, z0 = sceneryCursor;
    if (p.userData.segment) {
      obj.position.set(0, 0, z0 - len / 2);
      addScenery(obj, z0 - len);
      triggers.push({ z: z0 + 25, name: p.userData.name });
      sceneryCursor = z0 - len - 2;
      return;
    }
    if (p.userData.span) {
      const L = 34;
      obj.position.set(0, 0, z0 - L / 2);
      addScenery(obj, z0 - L / 2 - 2);
      [-1, 1].forEach((s) => {
        const lawn = new THREE.Mesh(new THREE.PlaneGeometry(60, L), lawnMat);
        lawn.rotation.x = -Math.PI / 2;
        lawn.position.set(s * (7.4 + 30), 0.03, z0 - L / 2);
        lawn.receiveShadow = true;
        addScenery(lawn, z0 - L);
        for (let i = 0; i < 4; i++) { const pm = LM.pick(palmProtos).clone(); pm.position.set(s * LM.rnd(10, 30), 0, z0 - LM.rnd(2, L - 2)); addScenery(pm, z0 - L); }
      });
      lampsAlong(z0, L);
      triggers.push({ z: z0 + 20, name: p.userData.name });
      sceneryCursor = z0 - L - 1;
      return;
    }
    const s = Math.random() < 0.5 ? -1 : 1;
    obj.position.set(s * LANDMARK_OFFSET[key], 0, z0 - len / 2);
    if (s > 0) obj.rotation.y = Math.PI;
    addScenery(obj, z0 - len);
    const other = fillSide(-s, z0, len);
    lampsAlong(z0, len);
    triggers.push({ z: z0 + 30, name: p.userData.name });
    sceneryCursor = Math.min(z0 - len - 2, other);
  }

  function spawnScenery() {
    while (sceneryCursor > P.z - 225) {
      blockCount++;
      if (blockCount % 4 === 0) spawnLandmark(LANDMARK_ORDER[landmarkIdx++ % LANDMARK_ORDER.length]);
      else {
        const z0 = sceneryCursor, len = 34;
        const a = fillSide(-1, z0, len), b = fillSide(1, z0, len);
        lampsAlong(z0, len);
        sceneryCursor = Math.min(a, b);
      }
    }
  }

  function addSolid(type, x, zFront, extra) {
    const p = protos[type], m = p.clone(), len = p.userData.len;
    const base = (extra && extra.base) || 0;
    m.position.set(x, base, zFront - len / 2);
    scene.add(m);
    const o = Object.assign({ kind: 'solid', type, mesh: m, x, zFront, zBack: zFront - len, top: base + p.userData.top, halfW: p.userData.width / 2 }, extra || {});
    obstacles.push(o);
    return o;
  }
  function addOverhead(x, z) {
    const p = protos.gantry, m = p.clone();
    m.position.set(x, 0, z - 0.15);
    scene.add(m);
    obstacles.push({ kind: 'overhead', type: 'gantry', mesh: m, x, zFront: z, zBack: z - 0.3, bottom: p.userData.bottom, top: p.userData.top, halfW: 1.0 });
  }
  function addRamp(x, zFront) {
    const p = protos.ramp, m = p.clone(), L = p.userData.len;
    m.position.set(x, 0, zFront - L);
    scene.add(m);
    obstacles.push({ kind: 'ramp', type: 'ramp', mesh: m, x, zFront, zBack: zFront - L, h: p.userData.h, halfW: 1.1 });
  }
  function addCoin(x, y, z) {
    const m = protos.coin.clone();
    m.position.set(x, y, z);
    m.rotation.y = z * 0.5;
    scene.add(m);
    coins.push({ mesh: m, fly: false });
  }
  function coinLine(x, z, n, y = 0.9, step = 2.4) { for (let i = 0; i < n; i++) addCoin(x, y, z - i * step); }
  function addPower(type, x, z) {
    const m = protos[type].clone();
    m.position.set(x, 1.1, z);
    scene.add(m);
    powerups.push({ mesh: m, type });
  }

  const ROW_TABLE = (d) => [['empty', 3], ['barrier', 1.6], ['gantry', 1.1 + d], ['keke', 1], ['danfo', 1.2 + d], ['brt', 0.7 + d], ['brtRamp', 1.1]];
  function weighted(table) {
    const total = table.reduce((a, r) => a + r[1], 0);
    let x = R() * total;
    for (const [k, w] of table) { x -= w; if (x <= 0) return k; }
    return table[0][0];
  }
  const blocking = (k) => k === 'danfo' || k === 'brt';
  const diffAt = (z) => Math.min(1, -z / 4000);

  function roofHazard(x, brtFront) {
    const top = protos.brt.userData.top;
    const zf = brtFront - 3.5 - R() * 2.5;
    addSolid('barrier', x, zf, { stumble: true, base: top });
    for (let j = 0; j < 4; j++) addCoin(x, top + 0.9 + Math.sin((j / 3) * Math.PI) * 1.2, zf + 2.4 - j * 1.6);
  }

  function spawnRow(z) {
    const d = diffAt(z);
    const table = ROW_TABLE(d);
    const kinds = [0, 1, 2].map(() => weighted(table));
    if (kinds.every(blocking)) kinds[Rri(0, 2)] = 'empty';
    if (kinds.every((k) => k === 'empty')) kinds[Rri(0, 2)] = Rpick(['barrier', 'gantry', 'keke']);
    let ext = 1, powered = false;
    kinds.forEach((k, i) => {
      const x = LANES[i];
      switch (k) {
        case 'barrier':
          addSolid('barrier', x, z, { stumble: true });
          for (let j = 0; j < 5; j++) addCoin(x, 0.9 + Math.sin((j / 4) * Math.PI) * 1.3, z + 3.2 - j * 1.6);
          break;
        case 'gantry': addOverhead(x, z); if (R() < 0.6) coinLine(x, z + 2.4, 3, 0.5, 2.4); break;
        case 'keke': addSolid('keke', x, z); if (R() < 0.6) coinLine(x, z - 0.4, 2, protos.keke.userData.top + 0.7, 1.2); ext = Math.max(ext, 2.6); break;
        case 'danfo': addSolid('danfo', x, z); ext = Math.max(ext, 4.6); break;
        case 'brt':
          addSolid('brt', x, z);
          if (R() < 0.25 + d * 0.3) roofHazard(x, z);
          ext = Math.max(ext, 10);
          break;
        case 'brtRamp': {
          const L = protos.ramp.userData.len, top = protos.brt.userData.top;
          addRamp(x, z);
          addSolid('brt', x, z - L);
          for (let j = 0; j < 4; j++) { const cz = z - 0.8 - j * 1.6; addCoin(x, ((z - cz) / L) * protos.ramp.userData.h + 0.9, cz); }
          if (R() < 0.35 + d * 0.35) roofHazard(x, z - L);
          else coinLine(x, z - L - 1, 4, top + 0.9, 2.4);
          ext = Math.max(ext, L + 10);
          break;
        }
        default:
          if (!powered && R() < 0.075) { addPower(weighted([['magnet', 1], ['shoes', 1], ['x2', 1], ['jet', 0.8]]), x, z - 2); powered = true; }
          else if (R() < 0.5) coinLine(x, z, 6);
      }
    });
    return ext;
  }

  function spawnObstacles() {
    while (nextRowZ > P.z - 175) {
      const ext = spawnRow(nextRowZ);
      nextRowZ -= ext + THREE.MathUtils.lerp(15, 9, diffAt(nextRowZ)) + R() * 8;
    }
  }

  function spawnAirCoins() {
    const n = Math.floor(((POWER.jet.time - 1.2) * speed) / 3);
    let lane = P.lane;
    for (let i = 0; i < n; i++) {
      if (i > 0 && i % 9 === 0) lane = THREE.MathUtils.clamp(lane + (Math.random() < 0.5 ? -1 : 1), 0, 2);
      addCoin(LANES[lane], FLY_Y + 0.6, P.z - 18 - i * 3);
    }
  }

  function cleanup() {
    const limit = P.z + 14;
    for (let i = obstacles.length - 1; i >= 0; i--) if (obstacles[i].zBack > limit) { scene.remove(obstacles[i].mesh); obstacles.splice(i, 1); }
    for (let i = coins.length - 1; i >= 0; i--) if (coins[i].mesh.position.z > limit) { scene.remove(coins[i].mesh); coins.splice(i, 1); }
    for (let i = powerups.length - 1; i >= 0; i--) if (powerups[i].mesh.position.z > limit) { scene.remove(powerups[i].mesh); powerups.splice(i, 1); }
    for (let i = scenery.length - 1; i >= 0; i--) if (scenery[i].rear > P.z + 40) { scene.remove(scenery[i].obj); scenery.splice(i, 1); }
  }

  function resetWorld(seed) {
    R = mulberry32(seed != null ? seed : (Math.random() * 2 ** 31) | 0);
    obstacles.forEach((o) => scene.remove(o.mesh));
    coins.forEach((c) => scene.remove(c.mesh));
    powerups.forEach((p) => scene.remove(p.mesh));
    scenery.forEach((s) => scene.remove(s.obj));
    obstacles.length = coins.length = powerups.length = scenery.length = triggers.length = 0;
    Object.assign(P, { lane: 1, prevLane: 1, x: 0, prevX: 0, y: 0, vy: 0, z: 0, grounded: true, airT: 0, rollT: 0, queuedRoll: false, stumbleT: 0, invuln: 0, glide: false, wasFlying: false, laneT: 9, squash: 0 });
    distance = 0; speed = 0; score = 0; runCoins = 0; mult = 1; deathT = 0; shake = 0; fovKick = 0;
    power.magnet = power.shoes = power.x2 = power.jet = 0;
    nextRowZ = -50; sceneryCursor = 60; blockCount = 0; landmarkIdx = 0;
    player.rotation.set(0, 0, 0);
    player.scale.set(1, 1, 1);
    player.userData.rig.body.rotation.x = 0;
    jetpack.visible = false;
    Sound.jetOff();
    spawnScenery();
    spawnObstacles();
  }

  /* =================== GAMEPLAY =================== */
  function moveLane(dir) {
    if (state !== 'playing') return;
    const nl = THREE.MathUtils.clamp(P.lane + dir, 0, 2);
    if (nl === P.lane) { shake = Math.max(shake, 0.08); return; }
    P.prevLane = P.lane;
    P.lane = nl;
    P.laneT = 0;
    Sound.swoosh();
    if (P.grounded) puff(P.x, P.y + 0.05, P.z + 0.2, 3, 0xcfc6b8, { spread: 0.8, life: 0.45, size: 0.8 });
  }
  function jump() {
    if (state !== 'playing' || power.jet > 0) return;
    if (P.grounded || (P.airT < 0.12 && P.vy <= 0)) {
      P.vy = power.shoes > 0 ? SUPER_JUMP_V : JUMP_V;
      P.grounded = false;
      P.airT = 1;
      P.rollT = 0;
      P.squash = -0.25;
      Sound.jump();
      puff(P.x, P.y + 0.05, P.z + 0.2, 5, power.shoes > 0 ? 0xff385c : 0xcfc6b8, { spread: 1, life: 0.5 });
    }
  }
  function roll() {
    if (state !== 'playing' || power.jet > 0) return;
    if (!P.grounded) { P.vy = Math.min(P.vy, -24); P.queuedRoll = true; }
    else startRoll();
  }
  function startRoll() { P.rollT = ROLL_TIME; Sound.roll(); }

  function stumble() {
    if (P.stumbleT > 0) { die('caught'); return; }
    P.stumbleT = 4.5;
    shake = 0.35;
    Sound.stumble();
    Sound.whistle();
    flash();
  }

  const DEATH_TEXT = {
    caught: ['Oga LASTMA don catch you!', 'Two bumps and he caught up with you.'],
    danfo: ['You ran into a danfo!', 'The conductor is still shouting "Oshodi!"'],
    brt: ['BRT no dey brake!', 'Next time take the ramp onto the roof.'],
    keke: ['Keke wins this round.', 'Jump and you can land on the roof.'],
    gantry: ['ÈKÓ Ò NÍ BÀJẸ́!', 'Roll under the signs. Swipe down or press ↓.'],
  };

  function die(reason) {
    if (state !== 'playing') return;
    state = 'dying';
    deathReason = reason;
    deathT = 0;
    shake = 0.6;
    Sound.crash();
    Sound.jetOff();
    if (reason === 'caught') Sound.whistle();
    flash();
    Sound.stopMusic();
    puff(P.x, P.y + 0.8, P.z - 0.3, 14, 0xffffff, { spread: 2.2, life: 0.7, size: 1.4, vy: 2 });
  }

  function collide(height) {
    let ground = 0;
    const pz0 = P.z - 0.35, pz1 = P.z + 0.35;
    for (const o of obstacles) {
      if (o.hit || o.zBack > pz1 || o.zFront < pz0) continue;
      const reach = o.halfW + 0.32;
      if (Math.abs(P.x - o.x) >= reach) continue;
      if (o.kind === 'ramp') {
        const k = THREE.MathUtils.clamp((o.zFront - P.z) / (o.zFront - o.zBack), 0, 1);
        ground = Math.max(ground, k * o.h);
        continue;
      }
      if (o.kind === 'overhead') {
        if (P.y + height > o.bottom && P.y < o.top && P.invuln <= 0) {
          if (Math.abs(P.prevX - o.x) >= reach) { sideHit(); return ground; }
          die('gantry');
          return ground;
        }
        continue;
      }
      if (o.base && P.y + height < o.base + 0.05) continue;
      if (P.y >= o.top - 0.45) { ground = Math.max(ground, o.top); continue; }
      if (P.invuln > 0) continue;
      if (Math.abs(P.prevX - o.x) >= reach) { sideHit(); return ground; }
      if (o.stumble) {
        o.hit = true;
        o.mesh.rotation.x = -1.35;
        o.mesh.position.y += 0.1;
        o.mesh.position.z -= 0.6;
        puff(o.x, (o.base || 0) + 0.6, o.zFront, 8, 0xffffff, { spread: 1.5, life: 0.5 });
        stumble();
        continue;
      }
      die(o.type);
      return ground;
    }
    return ground;
  }

  function sideHit() {
    P.lane = P.prevLane;
    P.x = P.prevX;
    stumble();
  }

  let lastPopup = 0;
  function checkCloseCalls() {
    for (const o of obstacles) {
      if (o.passed || o.kind !== 'solid' || o.base || o.zBack <= P.z + 0.4) continue;
      o.passed = true;
      const dx = Math.abs(o.x - P.x);
      if (power.jet <= 0 && P.laneT < 0.55 && dx > 1.2 && dx < 3 && P.y < o.top - 0.5 && o.type !== 'barrier' && t - lastPopup > 0.8) {
        const bonus = 25 * mult;
        score += bonus;
        lastPopup = t;
        popup(`Close call! +${bonus}`);
        Sound.close();
      }
    }
  }

  function collectStuff(dt) {
    const cy = P.y + 0.9;
    const magnet = power.magnet > 0;
    for (const c of coins) {
      const m = c.mesh;
      m.visible = m.position.z > P.z - 110;
      if (!m.visible) continue;
      m.rotation.y += dt * 4;
      if (magnet && !c.fly && m.position.z > P.z - 18 && m.position.z < P.z + 1) c.fly = true;
      if (c.fly) {
        const k = Math.min(1, dt * 12);
        m.position.x += (P.x - m.position.x) * k;
        m.position.y += (cy - m.position.y) * k;
        m.position.z += (P.z - 0.2 - m.position.z) * k;
      }
      if (Math.abs(m.position.x - P.x) < 0.95 && Math.abs(m.position.z - P.z) < 0.9 && Math.abs(m.position.y - cy) < 1.25) {
        puff(m.position.x, m.position.y, m.position.z, 2, 0xffd54f, { spread: 0.6, life: 0.35, size: 0.6, add: true, op: 0.9 });
        m.position.z = 1e6;
        runCoins++;
        score += 5 * mult * (power.x2 > 0 ? 2 : 1);
        Sound.coin();
      }
    }
    for (const p of powerups) {
      const m = p.mesh;
      m.position.y = 1.1 + Math.sin(t * 3 + m.position.z) * 0.15;
      if (m.children[1]) m.children[1].rotation.y += dt * 2.5;
      if (Math.abs(m.position.x - P.x) < 1.0 && Math.abs(m.position.z - P.z) < 1.0 && Math.abs(m.position.y - cy) < 1.4) {
        m.position.z = 1e6;
        power[p.type] = POWER[p.type].time;
        Sound.power();
        toast(`${POWER[p.type].label}!`, 'power');
        puff(P.x, P.y + 1, P.z, 12, 0xff385c, { spread: 2, life: 0.6, add: true, op: 0.8 });
        if (p.type === 'jet') {
          P.wasFlying = true;
          P.glide = false;
          P.rollT = 0;
          fovKick = 10;
          shake = 0.25;
          jetpack.visible = true;
          Sound.jetOn();
          spawnAirCoins();
        }
      }
    }
  }

  function update(dt) {
    speed = 16 + 18 * (1 - Math.exp(-distance / 2400));
    if (power.jet > 0) speed *= 1.15;
    const dz = speed * dt;
    distance += dz;
    P.z -= dz;
    mult = Math.min(6, 1 + Math.floor(distance / 700));
    score += dz * mult * (power.x2 > 0 ? 2 : 1) * 0.5;

    P.prevX = P.x;
    P.x += (LANES[P.lane] - P.x) * Math.min(1, dt * 16);
    P.laneT += dt;
    if (P.rollT > 0) P.rollT -= dt;
    if (P.stumbleT > 0) P.stumbleT -= dt;
    if (P.invuln > 0) P.invuln -= dt;
    for (const k in power) if (power[k] > 0) power[k] = Math.max(0, power[k] - dt);

    if (power.jet > 0) {
      P.y += (FLY_Y - P.y) * Math.min(1, dt * 2.6);
      P.vy = 0; P.grounded = false; P.rollT = 0; P.airT = 1;
      if (power.jet < 1.2) P.y += (FLY_Y - 1.5 - P.y) * Math.min(1, dt * 1.5);
    } else {
      if (P.wasFlying) {
        P.wasFlying = false; P.glide = true; P.invuln = 1.8; P.vy = 0;
        jetpack.visible = false;
        Sound.jetOff();
        toast('Landing — you’re safe for a moment', 'power');
      }
      const height = P.rollT > 0 ? 0.9 : 1.75;
      const ground = collide(height);
      if (state !== 'playing') return;
      P.vy -= (P.glide ? 13 : G) * dt;
      if (P.glide) P.vy = Math.max(P.vy, -7);
      P.y += P.vy * dt;
      if (P.y <= ground) {
        const landed = !P.grounded;
        const impact = -P.vy;
        P.y = ground; P.vy = 0; P.grounded = true; P.airT = 0;
        if (landed) {
          P.glide = false;
          if (impact > 6) {
            P.squash = Math.min(0.35, impact * 0.022);
            puff(P.x, P.y + 0.05, P.z + 0.1, 7, 0xcfc6b8, { spread: 1.6, life: 0.55 });
            Sound.land();
          }
          if (P.queuedRoll) { P.queuedRoll = false; startRoll(); }
        }
      } else if (P.y > ground + 0.06) {
        P.grounded = false;
        P.airT += dt;
      }
    }

    checkCloseCalls();
    collectStuff(dt);
    for (let i = triggers.length - 1; i >= 0; i--) if (P.z < triggers[i].z) { toast(triggers[i].name, 'place'); triggers.splice(i, 1); }
    spawnScenery();
    spawnObstacles();
    cleanup();

    const target = P.stumbleT > 0 ? 2.3 : 16;
    chaserDist += (target - chaserDist) * Math.min(1, dt * (target < chaserDist ? 2.5 : 0.5));
  }

  function updateDying(dt) {
    deathT += dt;
    speed *= Math.pow(0.02, dt);
    P.z -= speed * dt;
    P.vy -= G * dt;
    P.y = Math.max(0, P.y + P.vy * dt);
    chaserDist += (1.3 - chaserDist) * Math.min(1, dt * 2.5);
    player.rotation.x += (0.35 - player.rotation.x) * Math.min(1, dt * 6);
    if (deathT > 1.1 && state === 'dying') showGameOver();
  }

  /* =================== OPPONENT (ghost runner) =================== */
  const opp = { key: null, name: 'Friend', model: null, jet: null, d: 0, v: 0, t: 0, x: 0, y: 0, r: 0, f: 0, j: 0, sc: 0, c: 0, alive: false, final: null, rematch: false, zr: 0, xr: 0, yr: 0, phase: 0 };
  let meRematch = false;

  function nameSprite(text) {
    const tex = LM.canvasTex(256, 72, (g, w, h) => {
      const r = 30;
      g.fillStyle = '#ff385c';
      g.beginPath();
      g.moveTo(r + 4, 4); g.lineTo(w - r - 4, 4); g.arc(w - r - 4, h / 2, h / 2 - 4, -Math.PI / 2, Math.PI / 2);
      g.lineTo(r + 4, h - 4); g.arc(r + 4, h / 2, h / 2 - 4, Math.PI / 2, -Math.PI / 2);
      g.fill();
      g.fillStyle = '#fff'; g.font = '800 34px "Plus Jakarta Sans", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(1.5, 0.42, 1);
    s.renderOrder = 10;
    return s;
  }

  function setOppRunner(key) {
    if (!LM.VARIANTS[key] || key === 'officer') key = 'tunde';
    if (opp.model && opp.key === key) return;
    if (opp.model) scene.remove(opp.model);
    opp.key = key;
    opp.name = LM.VARIANTS[key].name;
    const m = bakeRig(LM.createRunner(key));
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.6;
      o.castShadow = false;
    });
    const tag = nameSprite(opp.name);
    tag.position.y = 2.3;
    m.add(tag);
    opp.jet = LM.createJetpack();
    opp.jet.position.set(0, 0.36, 0.3);
    opp.jet.visible = false;
    m.userData.rig.torso.add(opp.jet);
    m.visible = false;
    opp.model = m;
    scene.add(m);
    $('#opp-name').textContent = opp.name;
  }

  function animateOpp(dt) {
    const show = mode === 'pvp' && opp.model && ['countdown', 'playing', 'dying', 'over', 'paused'].includes(state);
    if (!opp.model) return;
    opp.model.visible = !!show;
    if (!show) return;
    const now = performance.now();
    const dEst = opp.alive && opp.t ? opp.d + opp.v * Math.min(0.3, (now - opp.t) / 1000) : opp.d;
    const k = Math.min(1, dt * 12);
    opp.zr += (-dEst - opp.zr) * k;
    opp.xr += (opp.x - opp.xr) * k;
    opp.yr += (opp.y - opp.yr) * k;
    opp.model.position.set(opp.xr, opp.yr, opp.zr);
    const m = !opp.alive && opp.final ? 'fall' : state === 'countdown' ? 'idle' : opp.f ? 'fly' : opp.r ? 'roll' : opp.j ? 'jump' : 'run';
    opp.phase += dt * (m === 'idle' ? 2 : 8 + opp.v * 0.32);
    LM.poseRunner(opp.model, opp.phase, m, dt);
    const body = opp.model.userData.rig.body;
    if (m === 'roll') body.rotation.x -= dt * 10;
    else body.rotation.x += (0 - body.rotation.x) * Math.min(1, dt * 12);
    opp.model.rotation.x = m === 'fly' ? -0.5 : 0;
    opp.jet.visible = m === 'fly';
    if (opp.jet.visible) opp.jet.children.forEach((c) => { if (c.name === 'flame') c.scale.y = 0.8 + Math.random() * 0.6; });
  }

  /* =================== ANIMATION / CAMERA =================== */
  function animate(dt) {
    t += dt;
    const rig = player.userData.rig;
    let pose = 'idle';
    const flying = power.jet > 0 && state === 'playing';
    if (state === 'menu') pose = Math.sin(t * 0.5) > 0.4 ? 'wave' : 'idle';
    else if (state === 'countdown') pose = 'idle';
    else if (state === 'dying' || state === 'over') pose = 'fall';
    else if (state === 'paused') pose = 'run';
    else if (flying) pose = 'fly';
    else if (P.rollT > 0) pose = 'roll';
    else if (!P.grounded) pose = 'jump';
    else pose = 'run';
    if (state === 'playing') runPhase += dt * (8 + speed * 0.32);
    else if (state === 'menu' || state === 'countdown') runPhase += dt * 2;
    if (state !== 'paused') LM.poseRunner(player, runPhase, pose, dt);

    if (pose === 'roll') {
      const k = 1 - Math.max(0, P.rollT) / ROLL_TIME;
      rig.body.rotation.x = -k * Math.PI * 2;
    } else {
      rig.body.rotation.x += (0 - rig.body.rotation.x) * Math.min(1, dt * 12);
    }
    player.position.set(P.x, P.y, P.z);
    if (state === 'playing') {
      const dx = LANES[P.lane] - P.x;
      player.rotation.y = -dx * 0.22;
      player.rotation.z += (-dx * 0.18 - player.rotation.z) * Math.min(1, dt * 12);
      player.rotation.x += ((flying ? -0.55 : 0) - player.rotation.x) * Math.min(1, dt * 6);
      if (pose === 'run') {
        const stepIdx = Math.floor(runPhase / Math.PI);
        if (stepIdx !== lastStep) {
          lastStep = stepIdx;
          if (speed > 14) puff(P.x + (stepIdx % 2 ? 0.1 : -0.1), P.y + 0.04, P.z + 0.15, 1, 0xd2c8b8, { spread: 0.5, life: 0.4, size: 0.7, vy: 0.4, op: 0.4 });
        }
      }
    }
    P.squash = P.squash ? P.squash + (0 - P.squash) * Math.min(1, dt * 10) : 0;
    const sq = state === 'playing' ? P.squash || 0 : 0;
    player.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);

    if (jetpack.visible) {
      jetpack.children.forEach((c) => { if (c.name === 'flame') c.scale.set(1, 0.7 + Math.random() * 0.8, 1); });
      if (state === 'playing') {
        for (const s of [-0.1, 0.1]) puff(P.x + s, P.y + 0.55, P.z + 0.4, 1, Math.random() < 0.5 ? 0xff8a00 : 0xffd54f, { spread: 0.25, vy: -3, vz: 4, life: 0.35, size: 0.7, add: true, op: 0.85, jitter: 0.05 });
      }
    }

    if (state === 'menu') {
      officer.position.set(1.6, 0, P.z + 3.2);
      officer.rotation.y = 0.35;
      LM.poseRunner(officer, t * 2, 'idle', dt);
      officer.visible = true;
    } else {
      officer.visible = chaserDist < 14 && mode === 'solo';
      officer.rotation.y = 0;
      officer.position.x += (P.x - officer.position.x) * Math.min(1, dt * 4);
      officer.position.y = 0;
      officer.position.z = P.z + chaserDist;
      if (state !== 'paused') LM.poseRunner(officer, runPhase * 0.95 + 1, state === 'over' ? 'idle' : 'run', dt);
    }

    animateOpp(dt);
    updateDust(dt);
    updateStreaks(dt);

    blinkMat.emissiveIntensity = Math.sin(t * 9) > 0 ? 2.6 : 0.25;
    LM.tex().water.offset.x += dt * 0.012;
    LM.tex().water.offset.y += dt * 0.006;

    const cz = P.z - 120;
    for (const s of scrollers) {
      s.mesh.position.z = cz;
      const v = s.sign * (-cz * s.R / ROAD_LEN);
      s.tex.offset[s.axis] = ((v % 1) + 1) % 1;
    }
    ground.position.set(0, -0.02, P.z - 150);

    sun.position.set(P.x + 10, 26 + P.y, P.z + 8);
    sun.target.position.set(P.x, 0, P.z - 12);
    playerLight.position.set(P.x, P.y + 3, P.z + 1);
  }

  const want = new V3(), look = new V3();
  function updateCamera(dt) {
    const portrait = camera.aspect < 0.8;
    if (state === 'menu') {
      const a = Math.sin(t * 0.25) * 0.7 + 0.35;
      const r = portrait ? 6.4 : 5.2;
      want.set(P.x + Math.sin(a) * r, portrait ? 1.7 : 2.1, P.z - Math.cos(a) * r);
      look.set(P.x, portrait ? -0.9 : 1.15, P.z);
    } else {
      const flying = power.jet > 0 && state === 'playing';
      const back = (portrait ? 8.2 : 6.8) + (flying ? 2.5 : 0) + Math.max(0, speed - 20) * 0.06;
      want.set(P.x * 0.75, (portrait ? 4.2 : 3.5) + P.y * 0.78, P.z + back);
      look.set(P.x * 0.6, 1.2 + P.y * 0.8, P.z - 8);
      if (state === 'playing' && P.grounded && P.rollT <= 0) want.y += Math.abs(Math.sin(runPhase)) * 0.06;
    }
    const k = 1 - Math.exp(-dt * (state === 'menu' ? 3 : 7));
    camera.position.lerp(want, k);
    camLook.lerp(look, k);
    if (shake > 0) {
      shake = Math.max(0, shake - dt);
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
    }
    camera.lookAt(camLook);
    if (state === 'playing') camera.rotateZ((P.x - LANES[P.lane]) * 0.035);

    fovKick += (0 - fovKick) * Math.min(1, dt * 2);
    const targetFov = baseFov + (state === 'playing' ? Math.max(0, speed - 16) * 0.38 + (power.jet > 0 ? 7 : 0) : 0) + fovKick;
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
    }
    ui.vignette.style.opacity = state === 'playing' ? String(THREE.MathUtils.clamp((speed - 20) / 14, 0, 1) * 0.8 + (power.jet > 0 ? 0.3 : 0)) : '0';
  }

  /* =================== UI =================== */
  const ui = {
    score: $('#score'), coins: $('#coins'), mult: $('#mult'), powers: $('#powers'), toast: $('#toast'), toastText: $('#toast-text'),
    menu: $('#menu'), pause: $('#pause'), over: $('#over'), best: $('#best'), bank: $('#bank'), tagline: $('#tagline'), flash: $('#flash'),
    popup: $('#popup'), countdown: $('#countdown'), oppPill: $('#opp-pill'), oppText: $('#opp-text'), vignette: $('#vignette'),
  };
  let lastHud = '';
  function updateHud() {
    const m = mult * (power.x2 > 0 ? 2 : 1);
    const key = `${Math.floor(score)}|${runCoins}|${m}`;
    if (key !== lastHud) {
      lastHud = key;
      ui.score.textContent = Math.floor(score).toLocaleString();
      ui.coins.textContent = runCoins;
      ui.mult.textContent = `x${m}`;
    }
    let html = '';
    for (const k in power) {
      if (power[k] > 0) html += `<div class="power">${POWER[k].label}<span class="bar"><i style="width:${(power[k] / POWER[k].time) * 100}%"></i></span></div>`;
    }
    if (ui.powers._h !== html) { ui.powers.innerHTML = html; ui.powers._h = html; }
    if (mode === 'pvp') {
      let txt, cls = '';
      if (!opp.alive && opp.final) { txt = `${opp.name} crashed · ${opp.final.sc.toLocaleString()}`; cls = 'out'; }
      else if (!PvP.connected && !opp.alive) { txt = `${opp.name} left`; cls = 'out'; }
      else {
        const diff = Math.round(opp.d - distance);
        txt = `${opp.name} · ${Math.abs(diff)}m ${diff >= 0 ? 'ahead' : 'behind'} · ${opp.sc.toLocaleString()}`;
        cls = diff > 0 ? 'ahead' : '';
      }
      if (ui.oppText.textContent !== txt) ui.oppText.textContent = txt;
      ui.oppPill.className = `pill opp ${cls}`;
    }
  }

  let toastTimer = 0;
  function toast(text, kind) {
    ui.toastText.innerHTML = kind === 'place' ? `Now passing <b>${text}</b>` : `<b>${text}</b>`;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2600);
  }
  function popup(text) {
    ui.popup.textContent = text;
    ui.popup.classList.remove('show');
    void ui.popup.offsetWidth;
    ui.popup.classList.add('show');
  }
  function flash() {
    ui.flash.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => ui.flash.classList.remove('on')));
  }

  function refreshMenu() {
    ui.best.textContent = (+store.get('ekorush-best', 0)).toLocaleString();
    ui.bank.textContent = (+store.get('ekorush-bank', 0)).toLocaleString();
    document.querySelectorAll('.runner-btn').forEach((b) => b.classList.toggle('active', b.dataset.runner === runnerKey));
    ui.tagline.textContent = LM.VARIANTS[runnerKey].tagline;
    $('#me-name').textContent = LM.VARIANTS[runnerKey].name;
  }

  function setRunner(key) {
    if (key === runnerKey) return;
    runnerKey = key;
    store.set('ekorush-runner', key);
    buildPlayer();
    refreshMenu();
    PvP.send({ t: 'hello', runner: runnerKey });
  }

  function setMenuMode(m) {
    menuMode = m;
    document.querySelectorAll('.tab').forEach((b) => { const on = b.dataset.mode === m; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    $('#solo-actions').hidden = m !== 'solo';
    $('#pvp-actions').hidden = m !== 'pvp';
  }

  function showMenu() {
    state = 'menu';
    mode = 'solo';
    document.body.classList.remove('playing', 'pvp');
    ui.over.hidden = true; ui.pause.hidden = true; ui.menu.hidden = false;
    ui.oppPill.hidden = true;
    ui.countdown.textContent = '';
    resetWorld();
    refreshMenu();
    if (PvP.connected) { setMenuMode('pvp'); pvpView('ready'); }
  }

  function startRun(seed, pvp) {
    Sound.unlock();
    ui.menu.hidden = true; ui.over.hidden = true; ui.pause.hidden = true;
    mode = pvp ? 'pvp' : 'solo';
    document.body.classList.toggle('pvp', !!pvp);
    ui.oppPill.hidden = !pvp;
    resetWorld(seed);
    chaserDist = pvp ? 20 : 2.6;
    officer.position.x = P.x;
    lastHud = '';
    document.body.classList.add('playing');
    if (pvp) {
      state = 'countdown';
      countdownT = 3.2;
      lastCount = 0;
    } else {
      goRun();
    }
  }

  function goRun() {
    state = 'playing';
    Sound.startMusic();
    if (mode === 'solo') { Sound.whistle(); toast('Run! LASTMA is right behind you', 'power'); }
  }

  function updateCountdown(dt) {
    countdownT -= dt;
    const n = Math.ceil(countdownT - 0.2);
    if (n !== lastCount) {
      lastCount = n;
      ui.countdown.textContent = n > 0 ? String(n) : 'GO!';
      ui.countdown.classList.remove('pop');
      void ui.countdown.offsetWidth;
      ui.countdown.classList.add('pop');
      Sound.beep(n <= 0);
      if (n <= 0) goRun();
    }
  }

  function togglePause() {
    if (mode === 'pvp') { if (state === 'playing') toast('No pausing in a race!', 'power'); return; }
    if (state === 'playing') {
      state = 'paused';
      ui.pause.hidden = false;
      Sound.stopMusic();
      Sound.jetOff();
    } else if (state === 'paused') {
      state = 'playing';
      ui.pause.hidden = true;
      Sound.startMusic();
      if (power.jet > 0) Sound.jetOn();
    }
  }

  function showGameOver() {
    state = 'over';
    finalScore = Math.floor(score);
    const best = +store.get('ekorush-best', 0);
    const isBest = finalScore > best;
    if (isBest) store.set('ekorush-best', finalScore);
    store.set('ekorush-bank', +store.get('ekorush-bank', 0) + runCoins);
    $('#newbest').hidden = !isBest;
    document.body.classList.remove('playing');
    ui.over.hidden = false;
    if (mode === 'pvp') {
      PvP.send({ t: 'dead', sc: finalScore, d: Math.floor(distance), c: runCoins });
      meRematch = false;
      $('#solo-stats').hidden = true;
      $('#race-result').hidden = false;
      renderResults();
      return;
    }
    $('#solo-stats').hidden = false;
    $('#race-result').hidden = true;
    const [title, sub] = DEATH_TEXT[deathReason] || DEATH_TEXT.caught;
    $('#over-title').textContent = title;
    $('#over-sub').textContent = sub;
    $('#o-score').textContent = finalScore.toLocaleString();
    $('#o-coins').textContent = runCoins;
    $('#o-dist').textContent = `${Math.floor(distance)}m`;
    $('#again-label').textContent = 'Run again';
    $('#again-btn').disabled = false;
  }

  function renderResults() {
    const oppDone = !opp.alive;
    const oppScore = opp.final ? opp.final.sc : opp.sc;
    $('#rr-me-name').textContent = LM.VARIANTS[runnerKey].name;
    $('#rr-me-score').textContent = finalScore.toLocaleString();
    $('#rr-me-dist').textContent = `${Math.floor(distance)}m`;
    $('#rr-opp-name').textContent = opp.name;
    $('#rr-opp-score').textContent = oppScore.toLocaleString();
    $('#rr-opp-dist').textContent = opp.final ? `${opp.final.d}m` : PvP.connected ? 'still running…' : 'left the match';
    const meEl = $('#rr-me'), opEl = $('#rr-opp');
    meEl.classList.remove('win'); opEl.classList.remove('win');
    const btn = $('#again-btn');
    if (!oppDone) {
      $('#over-title').textContent = (DEATH_TEXT[deathReason] || DEATH_TEXT.caught)[0];
      $('#over-sub').textContent = oppScore > finalScore ? `${opp.name} is ahead. Waiting for them to finish…` : `You lead! Waiting for ${opp.name} to crash…`;
      btn.disabled = true;
      $('#again-label').textContent = 'Race in progress…';
      return;
    }
    if (finalScore > oppScore) { $('#over-title').textContent = 'You win the race! 🏆'; meEl.classList.add('win'); }
    else if (finalScore < oppScore) { $('#over-title').textContent = `${opp.name} wins this one`; opEl.classList.add('win'); }
    else $('#over-title').textContent = 'Dead heat!';
    $('#over-sub').textContent = PvP.connected ? 'Same course, new seed. Fancy a rematch?' : 'Your friend has left the match.';
    btn.disabled = false;
    if (!PvP.connected) $('#again-label').textContent = 'Back to menu';
    else if (meRematch) $('#again-label').textContent = 'Waiting for friend…';
    else if (opp.rematch) $('#again-label').textContent = 'Friend is ready. Rematch!';
    else $('#again-label').textContent = 'Rematch';
  }

  function onAgain() {
    if (mode !== 'pvp') { startRun(); return; }
    if (!PvP.connected) { showMenu(); return; }
    meRematch = true;
    PvP.send({ t: 'rematch' });
    if (PvP.role === 'host' && opp.rematch) hostStartRace();
    else renderResults();
  }

  /* =================== PVP FLOW =================== */
  function pvpView(v) {
    $('#pvp-idle').hidden = v !== 'idle';
    $('#pvp-wait').hidden = v !== 'wait';
    $('#pvp-ready').hidden = v !== 'ready';
    if (v === 'ready') {
      const host = PvP.role === 'host';
      $('#race-btn').hidden = !host;
      $('#guest-wait').hidden = host;
    }
  }
  function pvpError(msg) {
    const el = $('#pvp-error');
    el.hidden = !msg;
    el.textContent = msg || '';
  }
  const localOnly = location.protocol === 'file:' || ['localhost', '127.0.0.1', ''].includes(location.hostname);
  $('#pvp-note').textContent = localOnly
    ? 'This copy of the game runs on your own computer, so your friend can’t open your link directly. They need the same game files (or a hosted copy). They open it, pick "Vs a friend" and type the code. Playing needs an internet connection.'
    : 'Your friend just opens the link on their own computer or phone. Playing needs an internet connection.';

  function beginRace(seed) {
    opp.alive = true; opp.final = null; opp.rematch = false; opp.d = 0; opp.v = 0; opp.t = 0; opp.sc = 0; opp.c = 0;
    opp.x = 0; opp.y = 0; opp.zr = 0; opp.xr = 0; opp.yr = 0; opp.r = opp.f = opp.j = 0;
    meRematch = false;
    if (!opp.model) setOppRunner('amaka');
    startRun(seed, true);
  }
  function hostStartRace() {
    const seed = (Math.random() * 2 ** 31) | 0;
    PvP.send({ t: 'start', seed, runner: runnerKey });
    beginRace(seed);
  }

  PvP.onStatus = (s, info) => {
    switch (s) {
      case 'waiting':
        pvpError('');
        pvpView('wait');
        $('#room-code').textContent = info;
        $('#room-link').value = PvP.link();
        document.querySelector('.code-box').hidden = false;
        document.querySelector('.link-row').hidden = false;
        $('#share-link').hidden = !navigator.share;
        $('#pvp-status').textContent = 'Waiting for your friend to join…';
        break;
      case 'joining':
        pvpError('');
        pvpView('wait');
        document.querySelector('.code-box').hidden = true;
        document.querySelector('.link-row').hidden = true;
        $('#share-link').hidden = true;
        $('#pvp-status').textContent = `Joining match ${info}…`;
        break;
      case 'connected':
        pvpError('');
        PvP.send({ t: 'hello', runner: runnerKey });
        setMenuMode('pvp');
        pvpView('ready');
        toast('Friend connected!', 'power');
        break;
      case 'closed':
        opp.rematch = false;
        if (mode === 'pvp' && opp.alive && (state === 'playing' || state === 'countdown' || state === 'dying' || state === 'over')) {
          opp.alive = false;
          toast(`${opp.name} left the match`, 'power');
        }
        if (state === 'over' && mode === 'pvp') renderResults();
        pvpView('idle');
        pvpError('Your friend left the match.');
        break;
      case 'error':
        if (!PvP.connected) pvpView('idle');
        pvpError(info);
        break;
      default:
    }
  };

  PvP.onMessage = (m) => {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'hello': setOppRunner(m.runner); break;
      case 'start':
        if (m.runner) setOppRunner(m.runner);
        if (state !== 'playing' && state !== 'countdown') beginRace(m.seed);
        break;
      case 's': {
        const now = performance.now();
        if (opp.t) {
          const dts = (now - opp.t) / 1000;
          if (dts > 0.01) opp.v = THREE.MathUtils.clamp((m.d - opp.d) / dts, 0, 45);
        }
        opp.d = m.d; opp.x = m.x; opp.y = m.y; opp.r = m.r; opp.f = m.f; opp.j = m.j; opp.sc = m.sc; opp.c = m.c; opp.t = now;
        break;
      }
      case 'dead':
        opp.alive = false;
        opp.final = { sc: m.sc, d: m.d, c: m.c };
        opp.sc = m.sc;
        if (state === 'over' && mode === 'pvp') renderResults();
        else if (mode === 'pvp' && state === 'playing') toast(`${opp.name} crashed at ${m.sc.toLocaleString()}! Beat it to win`, 'power');
        break;
      case 'rematch':
        opp.rematch = true;
        if (PvP.role === 'host' && meRematch && state === 'over') hostStartRace();
        else if (state === 'over' && mode === 'pvp') renderResults();
        break;
      default:
    }
  };

  async function hostMatch() {
    pvpError('');
    pvpView('wait');
    document.querySelector('.code-box').hidden = false;
    document.querySelector('.link-row').hidden = false;
    $('#room-code').textContent = '······';
    $('#room-link').value = '';
    $('#pvp-status').textContent = 'Creating match…';
    try { await PvP.host(); } catch (e) { pvpView('idle'); pvpError(e.message); }
  }
  async function joinMatch(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) { pvpError('Match codes are 6 characters, like ABC123.'); return; }
    pvpError('');
    pvpView('wait');
    document.querySelector('.code-box').hidden = true;
    document.querySelector('.link-row').hidden = true;
    $('#pvp-status').textContent = 'Connecting…';
    try { await PvP.join(code); } catch (e) { pvpView('idle'); pvpError(e.message); }
  }

  $('#host-btn').addEventListener('click', hostMatch);
  $('#join-form').addEventListener('submit', (e) => { e.preventDefault(); joinMatch($('#join-code').value); });
  $('#join-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('#copy-link').addEventListener('click', async (e) => {
    const btn = e.currentTarget, link = $('#room-link').value;
    try { await navigator.clipboard.writeText(link); } catch (err) { $('#room-link').select(); document.execCommand('copy'); }
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy link'; }, 1600);
  });
  $('#share-link').addEventListener('click', () => {
    navigator.share({ title: 'Race me in Eko Rush', text: `Race me through Lagos! Code: ${PvP.code}`, url: $('#room-link').value }).catch(() => {});
  });
  $('#pvp-cancel').addEventListener('click', () => { PvP.close(); pvpView('idle'); });
  $('#pvp-leave').addEventListener('click', () => { PvP.close(); pvpView('idle'); pvpError(''); });
  $('#race-btn').addEventListener('click', (e) => { e.currentTarget.blur(); if (PvP.connected) hostStartRace(); });

  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setMenuMode(b.dataset.mode)));
  document.querySelectorAll('.runner-btn').forEach((b) => b.addEventListener('click', () => { setRunner(b.dataset.runner); b.blur(); }));
  $('#play-btn').addEventListener('click', (e) => { e.currentTarget.blur(); startRun(); });
  $('#again-btn').addEventListener('click', (e) => { e.currentTarget.blur(); onAgain(); });
  $('#change-btn').addEventListener('click', showMenu);
  $('#resume-btn').addEventListener('click', togglePause);
  $('#restart-btn').addEventListener('click', () => startRun());
  $('#quit-btn').addEventListener('click', showMenu);
  $('#pause-btn').addEventListener('click', (e) => { e.currentTarget.blur(); togglePause(); });
  const soundBtn = $('#sound-btn');
  const syncSound = () => soundBtn.classList.toggle('muted', Sound.muted);
  soundBtn.addEventListener('click', () => { Sound.setMuted(!Sound.muted); syncSound(); soundBtn.blur(); });
  syncSound();

  /* =================== INPUT =================== */
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.key;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k)) e.preventDefault();
    if (e.repeat) return;
    if (k === 'm' || k === 'M') { Sound.setMuted(!Sound.muted); syncSound(); return; }
    if (state === 'menu' && (k === 'Enter' || k === ' ')) {
      if (menuMode === 'solo') startRun();
      else if (PvP.connected && PvP.role === 'host') hostStartRace();
      return;
    }
    if (state === 'over' && (k === 'Enter' || k === ' ')) { if (!$('#again-btn').disabled) onAgain(); return; }
    if (k === 'p' || k === 'P' || k === 'Escape') { togglePause(); return; }
    if (state !== 'playing') return;
    switch (k) {
      case 'ArrowLeft': case 'a': case 'A': moveLane(-1); break;
      case 'ArrowRight': case 'd': case 'D': moveLane(1); break;
      case 'ArrowUp': case 'w': case 'W': case ' ': jump(); break;
      case 'ArrowDown': case 's': case 'S': roll(); break;
      default:
    }
  });

  let swipe = null;
  canvas.addEventListener('pointerdown', (e) => { swipe = { x: e.clientX, y: e.clientY, done: false }; });
  canvas.addEventListener('pointermove', (e) => {
    if (!swipe || swipe.done || state !== 'playing') return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 26) return;
    swipe.done = true;
    if (Math.abs(dx) > Math.abs(dy)) moveLane(dx > 0 ? 1 : -1);
    else if (dy < 0) jump();
    else roll();
  });
  const endSwipe = () => { swipe = null; };
  canvas.addEventListener('pointerup', endSwipe);
  canvas.addEventListener('pointercancel', endSwipe);
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing' && mode === 'solo') togglePause(); });

  /* =================== THEME =================== */
  function applyTheme() {
    const dark = document.documentElement.dataset.theme === 'dark';
    LM.setNight(dark);
    scene.background = dark ? skyNight : skyDay;
    scene.fog.color.set(dark ? 0x161a3a : 0xcfe9ff);
    hemi.intensity = dark ? 0.42 : 0.85;
    hemi.color.set(dark ? 0x8a96ff : 0xdff2ff);
    hemi.groundColor.set(dark ? 0x2a2030 : 0xb08860);
    sun.intensity = dark ? 0.32 : 1.05;
    sun.color.set(dark ? 0x9fb4ff : 0xfff0d0);
    playerLight.intensity = dark ? 1.3 : 0;
    streakMat.color.set(dark ? 0xbfd4ff : 0xffffff);
    outlineMat.color.set(dark ? 0x05040a : 0x17141f);
  }
  window.addEventListener('themechange', applyTheme);
  applyTheme();

  /* =================== LOOP =================== */
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    baseFov = camera.aspect < 0.8 ? 74 : 62;
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  showMenu();
  camera.position.set(3, 2.2, -5);
  camLook.set(0, 1.1, 0);

  const joinParam = new URLSearchParams(location.search).get('join');
  if (joinParam) {
    setMenuMode('pvp');
    $('#join-code').value = joinParam.toUpperCase();
    joinMatch(joinParam);
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state === 'playing') update(dt);
    else if (state === 'dying') updateDying(dt);
    else if (state === 'countdown') updateCountdown(dt);
    animate(dt);
    updateCamera(dt);
    if (state === 'playing' || state === 'dying' || state === 'countdown') updateHud();
    if (mode === 'pvp' && state === 'playing') {
      sendT -= dt;
      if (sendT <= 0) {
        sendT = 0.066;
        PvP.send({ t: 's', d: distance, x: P.x, y: P.y, r: P.rollT > 0 ? 1 : 0, f: power.jet > 0 ? 1 : 0, j: P.grounded ? 0 : 1, sc: Math.floor(score), c: runCoins });
      }
    }
    if (state === 'over' && mode === 'pvp' && opp.alive) {
      sendT -= dt;
      if (sendT <= 0) { sendT = 0.25; renderResults(); }
    }
    renderer.render(scene, camera);
    adaptResolution(now);
  }
  /* Step resolution down (never up) on GPUs that can't hold ~50fps during a run. */
  let qFrames = 0, qStart = 0, qWarm = 0;
  function adaptResolution(now) {
    if (document.hidden || state !== 'playing') { qFrames = 0; qWarm = 0; return; }
    if (qWarm++ < 150) return;
    if (!qFrames) qStart = now;
    if (++qFrames < 120) return;
    const avg = (now - qStart) / (qFrames - 1);
    qFrames = 0;
    if (avg > 20 && pixelRatio > 0.76) {
      pixelRatio = Math.max(0.75, pixelRatio - 0.15);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    }
  }
  requestAnimationFrame(frame);
  setTimeout(() => $('#loading').classList.add('done'), 150);
})();
