/* Eko Rush – landing page interactions */
(function () {
  'use strict';
  const LM = window.LagosModels;
  const V3 = THREE.Vector3;
  const isDark = () => document.documentElement.dataset.theme === 'dark';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------------- nav ---------------- */
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 10);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const menuBtn = document.getElementById('menu-btn');
  const links = document.getElementById('nav-links');
  menuBtn.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  links.addEventListener('click', (e) => { if (e.target.closest('a')) { links.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); } });

  /* ---------------- reveal on scroll ---------------- */
  const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 70}ms`; io.observe(el); });

  /* ---------------- custom cursor ---------------- */
  const fine = matchMedia('(pointer: fine)').matches;
  const ring = document.querySelector('.cursor-ring');
  const dot = document.querySelector('.cursor-dot');
  const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  const ringPos = { x: mouse.x, y: mouse.y };
  if (fine) {
    window.addEventListener('pointermove', (e) => {
      mouse.x = e.clientX; mouse.y = e.clientY;
      document.body.classList.add('has-cursor');
      dot.style.transform = `translate(${mouse.x}px, ${mouse.y}px)`;
    });
    document.addEventListener('pointerleave', () => document.body.classList.remove('has-cursor'));
    document.addEventListener('pointerover', (e) => ring.classList.toggle('hover', !!e.target.closest('a, button, .lm-item, #landmark-canvas')));
  }

  /* ---------------- tiny honk synth ---------------- */
  let actx = null;
  function honk() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime;
      [[392, 0], [494, 0], [392, 0.2], [494, 0.2]].forEach(([f, d]) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(0.05, t + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.17);
        o.connect(g).connect(actx.destination);
        o.start(t + d); o.stop(t + d + 0.2);
      });
    } catch (e) { /* audio unavailable */ }
  }

  function normalize(obj, size) {
    const box = new THREE.Box3().setFromObject(obj);
    const s = box.getSize(new V3()), c = box.getCenter(new V3());
    obj.position.sub(c);
    const wrap = new THREE.Group();
    wrap.add(obj);
    wrap.scale.setScalar(size / Math.max(s.x, s.y, s.z));
    return wrap;
  }

  function makeRenderer(canvas, alpha) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.outputEncoding = THREE.sRGBEncoding;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    return r;
  }

  /* =========================================================
     HERO: cursor-following, draggable 3D object
     ========================================================= */
  const hero = document.querySelector('.hero');
  const heroCanvas = document.getElementById('hero-canvas');
  const bubble = document.getElementById('bubble');
  const hr = makeRenderer(heroCanvas, true);
  const hScene = new THREE.Scene();
  const hCam = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
  hCam.position.set(0, 0, 20);

  const hHemi = new THREE.HemisphereLight(0xffffff, 0x554466, 0.9);
  const hKey = new THREE.DirectionalLight(0xffffff, 1.0);
  hKey.position.set(6, 10, 8);
  hKey.castShadow = true;
  hKey.shadow.mapSize.set(1024, 1024);
  Object.assign(hKey.shadow.camera, { left: -14, right: 14, top: 10, bottom: -10, near: 1, far: 50 });
  const hRim = new THREE.PointLight(0xff385c, 1.4, 60);
  hRim.position.set(-8, 3, 6);
  hScene.add(hHemi, hKey, hRim);

  const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.ShadowMaterial({ opacity: 0.12 }));
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.y = -4.2;
  shadowCatcher.receiveShadow = true;
  hScene.add(shadowCatcher);

  const holder = new THREE.Group();
  const spinner = new THREE.Group();
  holder.add(spinner);
  hScene.add(holder);

  const HERO_MODELS = [
    { make: () => LM.createDanfo(), size: 4.6, base: [0.18, -0.75, 0], lines: ['Oshodi! Oshodi!', 'CMS, enter with your change!', 'Owa o! Owa o!', 'Wole! Wole!', 'Na straight, no shaking!'] },
    { make: () => LM.createKeke(), size: 3.6, base: [0.18, -0.75, 0], lines: ['Keke dey go Ojuelegba!', 'Shift, make I enter!', 'Na ₦300 o!'] },
    { make: () => LM.createNationalTheatre(), size: 5.4, base: [0.35, 0.6, 0], lines: ['FESTAC ’77 vibes!', 'Welcome to Iganmu!', 'Na military cap I be!'] },
    { make: () => LM.createNecomHouse(), size: 6.2, base: [0.1, 0.5, 0], lines: ['32 floors of Lagos!', 'Marina view no dey disappoint.', 'NITEL tower, still standing!'] },
    { make: () => { const r = LM.createRunner('tunde'); r.userData.isRunner = true; return r; }, size: 4.2, base: [0.05, Math.PI + 0.4, 0], lines: ['Ẹ kú ojúmọ́!', 'Catch me if you can, LASTMA!', 'How far?'] },
  ];
  const heroModels = [];
  let current = 0;
  let pop = 1;

  function heroModel(i) {
    if (!heroModels[i]) {
      const def = HERO_MODELS[i];
      const raw = def.make();
      const wrap = normalize(raw, def.size);
      wrap.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      wrap.userData.raw = raw;
      heroModels[i] = wrap;
    }
    return heroModels[i];
  }

  function setHeroModel(i) {
    current = (i + HERO_MODELS.length) % HERO_MODELS.length;
    spinner.clear();
    const m = heroModel(current);
    const b = HERO_MODELS[current].base;
    m.rotation.set(b[0], b[1], b[2]);
    spinner.add(m);
    pop = 0;
    document.querySelectorAll('.pill[data-model]').forEach((p) => p.classList.toggle('active', +p.dataset.model === current));
  }
  setHeroModel(0);
  document.querySelectorAll('.pill[data-model]').forEach((p) => p.addEventListener('click', () => { setHeroModel(+p.dataset.model); poke(true); }));

  /* background naira coins */
  const bgCoins = [];
  for (let i = 0; i < 9; i++) {
    const c = LM.createCoin();
    c.scale.setScalar(LM.rnd(0.9, 1.6));
    c.userData = { a: (i / 9) * Math.PI * 2, r: LM.rnd(5, 11), y: LM.rnd(-3.5, 4), sp: LM.rnd(0.05, 0.14), z: LM.rnd(-12, -4) };
    hScene.add(c);
    bgCoins.push(c);
  }

  /* coin burst particles */
  const burst = [];
  for (let i = 0; i < 22; i++) {
    const c = LM.createCoin();
    c.visible = false;
    c.userData = { v: new V3(), life: 0 };
    hScene.add(c);
    burst.push(c);
  }

  const view = { w: 1, h: 1 };
  const ndc = new THREE.Vector2();
  const target = new V3();
  const rest = new V3();
  const prevPos = new V3();
  const ray = new THREE.Raycaster();
  let pointerInside = false;
  let dragging = false, dragMoved = 0, lastX = 0, lastY = 0;
  const spinVel = { x: 0, y: 0 };
  let bounceY = 0, bounceV = 0;
  let wide = true;

  function resizeHero() {
    const w = hero.clientWidth, h = hero.clientHeight;
    hr.setSize(w, h, false);
    hCam.aspect = w / h;
    wide = w > 860;
    hCam.position.z = wide ? 20 : 24;
    hCam.updateProjectionMatrix();
    view.h = 2 * Math.tan((hCam.fov * Math.PI) / 360) * hCam.position.z;
    view.w = view.h * hCam.aspect;
    rest.set(wide ? view.w * 0.24 : 0, wide ? 0.2 : -view.h * 0.22, 0);
    if (!pointerInside) target.copy(rest);
  }
  new ResizeObserver(resizeHero).observe(hero);
  resizeHero();
  holder.position.copy(rest);

  function setNDC(e) {
    const r = heroCanvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  function hitModel() {
    ray.setFromCamera(ndc, hCam);
    return ray.intersectObject(spinner, true).length > 0;
  }

  hero.addEventListener('pointermove', (e) => {
    setNDC(e);
    if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      spinVel.y = dx * 0.012; spinVel.x = dy * 0.008;
      spinner.rotation.y += spinVel.y;
      spinner.rotation.x = THREE.MathUtils.clamp(spinner.rotation.x + spinVel.x, -1.1, 1.1);
      return;
    }
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      pointerInside = true;
      const mx = view.w / 2 - 2.2, my = view.h / 2 - 2;
      target.set(THREE.MathUtils.clamp((ndc.x * view.w) / 2, -mx, mx), THREE.MathUtils.clamp((ndc.y * view.h) / 2, -my, my), 0);
      if (e.target === heroCanvas) heroCanvas.style.cursor = hitModel() ? 'grab' : '';
    }
  });
  hero.addEventListener('pointerleave', () => { pointerInside = false; target.copy(rest); });

  heroCanvas.addEventListener('pointerdown', (e) => {
    setNDC(e);
    if (e.pointerType === 'touch' && !hitModel()) {
      const mx = view.w / 2 - 2, my = view.h / 2 - 2;
      target.set(THREE.MathUtils.clamp((ndc.x * view.w) / 2, -mx, mx), THREE.MathUtils.clamp((ndc.y * view.h) / 2, -my, my), 0);
      pointerInside = true;
      clearTimeout(heroCanvas._t);
      heroCanvas._t = setTimeout(() => { pointerInside = false; target.copy(rest); }, 2500);
      return;
    }
    if (!hitModel()) return;
    dragging = true; dragMoved = 0;
    lastX = e.clientX; lastY = e.clientY;
    heroCanvas.setPointerCapture(e.pointerId);
    heroCanvas.style.cursor = 'grabbing';
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    heroCanvas.style.cursor = 'grab';
    if (dragMoved < 6) poke();
    try { heroCanvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  };
  heroCanvas.addEventListener('pointerup', endDrag);
  heroCanvas.addEventListener('pointercancel', endDrag);
  heroCanvas.addEventListener('dblclick', () => { setHeroModel(current + 1); poke(true); });

  let bubbleTimer = 0;
  function poke(silent) {
    bounceV = 9;
    spinVel.y += 0.35;
    burst.forEach((c) => {
      c.visible = true;
      c.position.copy(holder.position);
      c.userData.v.set(LM.rnd(-7, 7), LM.rnd(5, 12), LM.rnd(-3, 5));
      c.userData.life = LM.rnd(1, 1.6);
      c.scale.setScalar(LM.rnd(0.8, 1.3));
    });
    if (silent) return;
    honk();
    const lines = HERO_MODELS[current].lines;
    bubble.textContent = lines[Math.floor(Math.random() * lines.length)];
    bubble.classList.add('show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove('show'), 1800);
  }

  function placeBubble() {
    if (!bubble.classList.contains('show')) return;
    const p = holder.position.clone();
    p.y += 2.6;
    p.project(hCam);
    bubble.style.left = `${((p.x + 1) / 2) * hero.clientWidth}px`;
    bubble.style.top = `${((1 - p.y) / 2) * hero.clientHeight}px`;
  }

  let heroVisible = true;
  new IntersectionObserver(([en]) => { heroVisible = en.isIntersecting; }).observe(hero);

  /* =========================================================
     LANDMARK VIEWER
     ========================================================= */
  const lmCanvas = document.getElementById('landmark-canvas');
  const viewer = lmCanvas.parentElement;
  const vr = makeRenderer(lmCanvas, true);
  const vScene = new THREE.Scene();
  const vCam = new THREE.PerspectiveCamera(38, 1, 0.1, 500);
  const vHemi = new THREE.HemisphereLight(0xffffff, 0x665544, 0.9);
  const vKey = new THREE.DirectionalLight(0xffffff, 1.0);
  vKey.position.set(10, 18, 12);
  vKey.castShadow = true;
  vKey.shadow.mapSize.set(1024, 1024);
  Object.assign(vKey.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 60 });
  vScene.add(vHemi, vKey);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.8, 0.5, 64), LM.mat(0xe9e3d8, { roughness: 0.9 }));
  disc.position.y = -0.25;
  disc.receiveShadow = true;
  vScene.add(disc);
  const discRing = new THREE.Mesh(new THREE.TorusGeometry(8.65, 0.08, 8, 96), LM.mat(0xff385c, { emissive: 0xff385c, emissiveIntensity: 0.6 }));
  discRing.rotation.x = Math.PI / 2;
  vScene.add(discRing);

  const turntable = new THREE.Group();
  vScene.add(turntable);
  const lmCache = {};
  let lmIndex = 0, lmPop = 1;
  const orbit = { yaw: 0.6, pitch: 0.38, vy: 0, dragging: false, lx: 0, ly: 0, idle: 0 };

  const list = document.getElementById('lm-list');
  LM.LANDMARK_INFO.forEach((info, i) => {
    const b = document.createElement('button');
    b.className = 'lm-item';
    b.setAttribute('role', 'tab');
    b.innerHTML = `<span class="num">${String(i + 1).padStart(2, '0')}</span><span><strong>${info.name}</strong><small>${info.place}</small></span>`;
    b.addEventListener('click', () => showLandmark(i));
    list.appendChild(b);
  });

  function landmarkModel(i) {
    if (!lmCache[i]) {
      const raw = LM.LANDMARK_INFO[i].make();
      const wrap = normalize(raw, 14);
      const box = new THREE.Box3().setFromObject(wrap);
      wrap.position.y = -box.min.y;
      lmCache[i] = wrap;
    }
    return lmCache[i];
  }

  function showLandmark(i) {
    lmIndex = i;
    const info = LM.LANDMARK_INFO[i];
    turntable.clear();
    turntable.add(landmarkModel(i));
    lmPop = 0;
    document.getElementById('lm-name').textContent = info.name;
    document.getElementById('lm-place').textContent = info.place;
    document.getElementById('lm-fact').textContent = info.fact;
    list.querySelectorAll('.lm-item').forEach((el, k) => { el.classList.toggle('active', k === i); el.setAttribute('aria-selected', String(k === i)); });
    const active = list.children[i];
    if (active && list.scrollWidth > list.clientWidth) list.scrollTo({ left: active.offsetLeft - 10, behavior: 'smooth' });
  }

  function resizeViewer() {
    const w = viewer.clientWidth, h = viewer.clientHeight;
    vr.setSize(w, h, false);
    vCam.aspect = w / h;
    vCam.updateProjectionMatrix();
  }
  new ResizeObserver(resizeViewer).observe(viewer);
  resizeViewer();

  lmCanvas.addEventListener('pointerdown', (e) => { orbit.dragging = true; orbit.lx = e.clientX; orbit.ly = e.clientY; lmCanvas.setPointerCapture(e.pointerId); });
  lmCanvas.addEventListener('pointermove', (e) => {
    if (!orbit.dragging) return;
    const dx = e.clientX - orbit.lx, dy = e.clientY - orbit.ly;
    orbit.lx = e.clientX; orbit.ly = e.clientY;
    orbit.vy = dx * 0.008;
    orbit.yaw += orbit.vy;
    orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + dy * 0.005, 0.05, 1.1);
    orbit.idle = 0;
  });
  const stopOrbit = () => { orbit.dragging = false; };
  lmCanvas.addEventListener('pointerup', stopOrbit);
  lmCanvas.addEventListener('pointercancel', stopOrbit);

  let viewerVisible = false;
  new IntersectionObserver(([en]) => { viewerVisible = en.isIntersecting; }).observe(viewer);
  showLandmark(0);

  /* =========================================================
     RUNNER THUMBNAILS (rendered once, offscreen)
     ========================================================= */
  function renderThumbs() {
    const imgs = document.querySelectorAll('img[data-runner]');
    if (!imgs.length) return;
    const c = document.createElement('canvas');
    const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setSize(420, 520, false);
    r.outputEncoding = THREE.sRGBEncoding;
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0x775544, 1.0));
    const d = new THREE.DirectionalLight(0xffffff, 0.9);
    d.position.set(2, 4, -5);
    sc.add(d);
    const cam = new THREE.PerspectiveCamera(30, 420 / 520, 0.1, 50);
    cam.position.set(1.1, 1.25, -4.1);
    cam.lookAt(0, 0.95, 0);
    imgs.forEach((img) => {
      const fig = LM.createRunner(img.dataset.runner);
      for (let i = 0; i < 30; i++) LM.poseRunner(fig, 0.6, 'wave', 0.05);
      fig.rotation.y = -0.25;
      sc.add(fig);
      r.render(sc, cam);
      img.src = c.toDataURL('image/png');
      sc.remove(fig);
    });
    r.dispose();
    if (r.forceContextLoss) r.forceContextLoss();
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(renderThumbs); else renderThumbs();

  /* =========================================================
     THEME
     ========================================================= */
  function applyTheme() {
    const dark = isDark();
    LM.setNight(dark);
    hHemi.intensity = dark ? 0.55 : 0.9;
    hKey.intensity = dark ? 0.55 : 1.0;
    hRim.intensity = dark ? 2.2 : 1.4;
    shadowCatcher.material.opacity = dark ? 0.3 : 0.12;
    vHemi.intensity = dark ? 0.45 : 0.9;
    vKey.intensity = dark ? 0.45 : 1.0;
    vHemi.color.set(dark ? 0x9fb0ff : 0xffffff);
    disc.material.color.set(dark ? 0x2a2a33 : 0xe9e3d8);
  }
  window.addEventListener('themechange', applyTheme);
  applyTheme();

  /* =========================================================
     LOOP
     ========================================================= */
  const clock = new THREE.Clock();
  let t = 0;
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;

    if (fine) {
      ringPos.x += (mouse.x - ringPos.x) * Math.min(1, dt * 14);
      ringPos.y += (mouse.y - ringPos.y) * Math.min(1, dt * 14);
      ring.style.transform = `translate(${ringPos.x}px, ${ringPos.y}px)`;
    }

    if (heroVisible) {
      prevPos.copy(holder.position);
      if (!dragging) holder.position.lerp(target, 1 - Math.exp(-dt * (reduceMotion ? 1.5 : 3.2)));
      const vx = (holder.position.x - prevPos.x) / Math.max(dt, 1e-3);
      const vy = (holder.position.y - prevPos.y) / Math.max(dt, 1e-3);

      const look = (target.x - holder.position.x) * 0.06 + ndc.x * 0.35;
      holder.rotation.y += (look - holder.rotation.y) * Math.min(1, dt * 4);
      holder.rotation.z += (THREE.MathUtils.clamp(-vx * 0.04, -0.45, 0.45) - holder.rotation.z) * Math.min(1, dt * 6);
      holder.rotation.x += (THREE.MathUtils.clamp(-vy * 0.03, -0.35, 0.35) - ndc.y * 0.12 - holder.rotation.x) * Math.min(1, dt * 6);

      if (!dragging) {
        spinner.rotation.y += spinVel.y;
        spinVel.y *= Math.pow(0.04, dt);
        spinner.rotation.x += (0 - spinner.rotation.x) * Math.min(1, dt * 1.5);
        if (Math.abs(spinVel.y) < 0.001 && !reduceMotion) spinner.rotation.y += dt * 0.12;
      }

      bounceV -= 30 * dt;
      bounceY += bounceV * dt;
      if (bounceY < 0) { bounceY = 0; bounceV = Math.abs(bounceV) > 2 ? -bounceV * 0.35 : 0; }
      spinner.position.y = bounceY + Math.sin(t * 1.6) * 0.18;

      pop += (1 - pop) * Math.min(1, dt * 7);
      spinner.scale.setScalar(0.4 + 0.6 * pop + Math.sin(pop * Math.PI) * 0.12);

      const raw = heroModels[current] && heroModels[current].userData.raw;
      if (raw && raw.userData.isRunner) LM.poseRunner(raw, t * 2, 'wave', dt);

      bgCoins.forEach((c) => {
        const u = c.userData;
        u.a += u.sp * dt;
        c.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(t + u.a * 3) * 0.4, u.z);
        c.rotation.y += dt * 1.5;
      });
      burst.forEach((c) => {
        const u = c.userData;
        if (u.life <= 0) { c.visible = false; return; }
        u.life -= dt;
        u.v.y -= 22 * dt;
        c.position.addScaledVector(u.v, dt);
        c.rotation.x += dt * 8; c.rotation.y += dt * 6;
        if (u.life < 0.3) c.scale.multiplyScalar(0.9);
      });
      hKey.position.set(holder.position.x + 6, 10, 8);
      hKey.target.position.copy(holder.position);
      hKey.target.updateMatrixWorld();
      placeBubble();
      hr.render(hScene, hCam);
    }

    if (viewerVisible) {
      if (!orbit.dragging) {
        orbit.idle += dt;
        orbit.yaw += orbit.vy;
        orbit.vy *= Math.pow(0.05, dt);
        if (orbit.idle > 1.5 && !reduceMotion) orbit.yaw += dt * 0.25;
      }
      lmPop += (1 - lmPop) * Math.min(1, dt * 6);
      turntable.scale.setScalar(0.6 + 0.4 * lmPop);
      turntable.rotation.y = (1 - lmPop) * -0.8;
      const R = 30;
      vCam.position.set(Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * R, 4 + Math.sin(orbit.pitch) * R, Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * R);
      vCam.lookAt(0, 3, 0);
      vr.render(vScene, vCam);
    }
  }
  loop();
})();
