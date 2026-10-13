/* Eko Rush – procedural 3D model library: Lagos landmarks, vehicles, characters (Three.js r149) */
(function () {
  'use strict';
  const T = THREE;
  const PI = Math.PI;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const FONT = '"Plus Jakarta Sans", "Segoe UI", Arial, sans-serif';

  /* ---------------- night-glow registry ---------------- */
  const glowMats = [];
  let night = false;
  function glow(m, nightI = 1, dayI = 0) {
    m.userData.glow = [nightI, dayI];
    m.emissiveIntensity = night ? nightI : dayI;
    glowMats.push(m);
    return m;
  }
  function setNight(v) {
    night = !!v;
    for (const m of glowMats) m.emissiveIntensity = m.userData.glow[night ? 0 : 1];
    if (_tex) _tex.poolMat.opacity = night ? 0.5 : 0;
  }

  /* ---------------- helpers ---------------- */
  function mat(color, o) {
    return new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0.05 }, o || {}));
  }
  function mesh(geo, m, x = 0, y = 0, z = 0) {
    const me = new T.Mesh(geo, m);
    me.position.set(x, y, z);
    me.castShadow = true;
    me.receiveShadow = true;
    return me;
  }
  const B = (w, h, d) => new T.BoxGeometry(w, h, d);
  const C = (rt, rb, h, s = 20, open = false, ts = 0, tl = PI * 2) => new T.CylinderGeometry(rt, rb, h, s, 1, open, ts, tl);
  const S = (r, ws = 16, hs = 12) => new T.SphereGeometry(r, ws, hs);

  function plane(w, h, m, x, y, z, ry = 0) {
    const p = new T.Mesh(new T.PlaneGeometry(w, h), m);
    p.position.set(x, y, z);
    p.rotation.y = ry;
    return p;
  }

  function rod(a, b, r, m) {
    const d = new T.Vector3().subVectors(b, a);
    const len = d.length();
    const me = new T.Mesh(C(r, r, len, 6), m);
    me.position.copy(a).addScaledVector(d, 0.5);
    me.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    return me;
  }

  /* Box whose UVs are scaled to world size so window textures tile instead of stretching */
  function boxUV(wx, hy, dz, unit) {
    const g = new T.BoxGeometry(wx, hy, dz);
    const uv = g.attributes.uv;
    for (let f = 0; f < 6; f++) {
      let su, sv;
      if (f < 2) { su = dz; sv = hy; } else if (f < 4) { su = wx; sv = dz; } else { su = wx; sv = hy; }
      for (let i = 0; i < 4; i++) {
        const k = f * 4 + i;
        uv.setXY(k, uv.getX(k) * su / unit, uv.getY(k) * sv / unit);
      }
    }
    return g;
  }

  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 4;
    if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
    return t;
  }

  function textTex(text, o = {}) {
    const w = o.w || 512, h = o.h || 128;
    return canvasTex(w, h, (g) => {
      if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, w, h); }
      if (o.border) { g.strokeStyle = o.border; g.lineWidth = o.borderW || 10; g.strokeRect(5, 5, w - 10, h - 10); }
      g.fillStyle = o.fg || '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const lines = String(text).split('\n');
      const base = o.size || Math.floor(h / (lines.length + 0.5));
      lines.forEach((ln, i) => {
        let size = i === 0 ? base : Math.floor(base * (o.subScale || 0.62));
        g.font = `${o.weight || 800} ${size}px ${FONT}`;
        const mw = g.measureText(ln).width;
        if (mw > w * 0.9) { size = Math.floor(size * (w * 0.9) / mw); g.font = `${o.weight || 800} ${size}px ${FONT}`; }
        const y = lines.length === 1 ? h / 2 : h * (i + 0.5) / lines.length + (i === 0 ? h * 0.04 : -h * 0.02);
        g.fillText(ln, w / 2, y);
      });
    });
  }

  /* ---------------- shared textures + materials (lazy) ---------------- */
  let _tex = null;
  function tex() {
    if (_tex) return _tex;
    const X = {};

    X.windows = canvasTex(512, 512, (g, w) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, w);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const x = c * 128, y = r * 128;
        g.fillStyle = '#d6d2cb'; g.fillRect(x + 18, y + 22, 92, 84);
        const gr = g.createLinearGradient(x, y, x + 128, y + 128);
        gr.addColorStop(0, '#3e5366'); gr.addColorStop(1, '#22303d');
        g.fillStyle = gr; g.fillRect(x + 24, y + 28, 80, 72);
        g.fillStyle = '#d6d2cb'; g.fillRect(x + 62, y + 28, 4, 72);
        g.fillStyle = '#bdb8b0'; g.fillRect(x + 14, y + 104, 100, 8);
      }
    }, true);

    X.lit = [0, 1, 2].map(() => canvasTex(512, 512, (g, w) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, w);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        if (Math.random() < 0.5) {
          g.fillStyle = Math.random() < 0.8 ? '#ffd27a' : '#bfe3ff';
          g.fillRect(c * 128 + 24, r * 128 + 28, 80, 72);
        }
      }
    }, true));

    X.glassGrid = canvasTex(256, 256, (g, w) => {
      const gr = g.createLinearGradient(0, 0, w, w);
      gr.addColorStop(0, '#9fd3f5'); gr.addColorStop(0.5, '#4f8fc0'); gr.addColorStop(1, '#2c5f8a');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
      g.strokeStyle = 'rgba(230,245,255,0.55)'; g.lineWidth = 3;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, w); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
    }, true);
    X.glassLit = canvasTex(256, 256, (g, w) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, w);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (Math.random() < 0.55) { g.fillStyle = '#9fd8ff'; g.fillRect(c * 64 + 3, r * 64 + 3, 58, 58); }
    }, true);
    X.glassMat = glow(mat(0xffffff, { map: X.glassGrid, metalness: 0.55, roughness: 0.18, emissive: 0x9fd8ff, emissiveMap: X.glassLit }), 0.9, 0);
    X.glassPlain = mat(0x5f9cc8, { metalness: 0.7, roughness: 0.12, side: T.DoubleSide });
    X.darkGlass = mat(0x1d2a35, { roughness: 0.15, metalness: 0.6 });

    X.lampMat = glow(mat(0xfff3c4, { emissive: 0xffd27a }), 2.4, 0.15);
    X.blinkMat = mat(0xff3d00, { emissive: 0xff3d00, emissiveIntensity: 1.5 });
    X.flameMat = new T.MeshBasicMaterial({ color: 0xff7a00, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false });
    X.flameCore = new T.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false });
    X.headlightMat = glow(mat(0xfffbe6, { emissive: 0xfff2b0, metalness: 0.4, roughness: 0.2 }), 2, 0.1);
    X.tailMat = glow(mat(0xc62828, { emissive: 0xff2a2a }), 1.5, 0.2);

    const pool = canvasTex(128, 128, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,210,130,1)'); gr.addColorStop(1, 'rgba(255,210,130,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
    });
    X.poolMat = new T.MeshBasicMaterial({ map: pool, transparent: true, opacity: night ? 0.5 : 0, blending: T.AdditiveBlending, depthWrite: false });

    X.water = canvasTex(256, 256, (g, w) => {
      g.fillStyle = '#2f7486'; g.fillRect(0, 0, w, w);
      for (let i = 0; i < 140; i++) {
        g.strokeStyle = `rgba(${200 + ri(0, 55)},${230 + ri(0, 25)},255,${rnd(0.08, 0.3)})`;
        g.lineWidth = rnd(1, 2.5);
        const x = rnd(0, w), y = rnd(0, w), l = rnd(8, 30);
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 3, x + l, y); g.stroke();
      }
    }, true);
    X.water.repeat.set(30, 30);
    X.waterMat = mat(0xffffff, { map: X.water, roughness: 0.25, metalness: 0.35 });

    X.slogan = canvasTex(1024, 96, (g, w, h) => {
      g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `900 64px ${FONT}`; g.fillText('NO CONDITION IS PERMANENT', w / 2, h / 2 + 4);
    });
    X.sloganMat = new T.MeshStandardMaterial({ map: X.slogan, transparent: true, roughness: 0.6 });
    X.destMat = glow(new T.MeshStandardMaterial({ map: textTex('OSHODI • CMS', { bg: '#111', fg: '#ffb300', w: 512, h: 96 }), emissive: 0xffffff }), 0.6, 0);
    X.destMat.emissiveMap = X.destMat.map;
    X.brtMat = new T.MeshStandardMaterial({ map: textTex('LAGOS BRT', { fg: '#ffffff', w: 512, h: 128 }), transparent: true });
    X.brtDestMat = glow(new T.MeshStandardMaterial({ map: textTex('TBS ⇄ IKORODU', { bg: '#0b0b0b', fg: '#ff9800', w: 512, h: 96 }) }), 0.8, 0.1);
    X.brtDestMat.emissive = new T.Color(0xffffff); X.brtDestMat.emissiveMap = X.brtDestMat.map;

    X.stripes = canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e53935';
      for (let i = -2; i < 10; i++) { g.beginPath(); g.moveTo(i * 32, h); g.lineTo(i * 32 + 16, h); g.lineTo(i * 32 + 32, 0); g.lineTo(i * 32 + 16, 0); g.fill(); }
    });
    X.stripeMat = mat(0xffffff, { map: X.stripes, roughness: 0.5 });
    X.hazard = canvasTex(256, 32, (g, w, h) => {
      g.fillStyle = '#ffcc00'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#111';
      for (let i = -1; i < 12; i++) { g.beginPath(); g.moveTo(i * 24, h); g.lineTo(i * 24 + 12, h); g.lineTo(i * 24 + 24, 0); g.lineTo(i * 24 + 12, 0); g.fill(); }
    });
    X.hazardMat = mat(0xffffff, { map: X.hazard });
    X.ekoSign = glow(new T.MeshStandardMaterial({ map: textTex('ÈKÓ Ò NÍ BÀJẸ́\nLagos no go spoil', { bg: '#e8173f', fg: '#fff', w: 512, h: 256 }), roughness: 0.5, emissive: 0xffffff }), 0.55, 0);
    X.ekoSign.emissiveMap = X.ekoSign.map;

    X.coinFaceTex = canvasTex(128, 128, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 10, w / 2, w / 2, w / 2);
      gr.addColorStop(0, '#ffe57a'); gr.addColorStop(1, '#e0a400');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
      g.strokeStyle = '#b07d00'; g.lineWidth = 8; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 12, 0, PI * 2); g.stroke();
      g.fillStyle = '#9a6a00'; g.font = `900 72px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('₦', w / 2, w / 2 + 4);
    });
    X.coinFace = new T.MeshStandardMaterial({ map: X.coinFaceTex, metalness: 0.5, roughness: 0.3, emissive: 0x8a6000, emissiveIntensity: 0.8 });
    X.coinSide = new T.MeshStandardMaterial({ color: 0xffc400, metalness: 0.6, roughness: 0.3, emissive: 0x8a6000, emissiveIntensity: 0.8 });

    const SHOPS = [
      ['MAMA PUT', 'Amala • Ewedu • Gbegiri', '#c62828'], ['SUYA SPOT', 'Hot suya every night', '#e65100'],
      ['POS HERE', 'Withdrawal • Transfer', '#1565c0'], ['FRESH CUTZ', 'Barbing salon', '#2e7d32'],
      ["GOD'S TIME STORES", 'Provisions • Wholesale', '#6a1b9a'], ['ÈKÓ PHONES', 'Accessories & repairs', '#00838f'],
      ['BUKA 24/7', 'Jollof • Dodo • Turkey', '#ad1457'], ['BALOGUN FABRICS', 'Ankara • Lace • Aso-oke', '#ef6c00'],
    ];
    X.shopMats = SHOPS.map(([t, s, c]) => {
      const m = new T.MeshStandardMaterial({ map: textTex(`${t}\n${s}`, { bg: c, fg: '#fff', w: 512, h: 128 }), roughness: 0.6, emissive: 0xffffff });
      m.emissiveMap = m.map;
      return glow(m, 0.6, 0);
    });
    const ADS = [
      ['ÈKÓ Ò NÍ BÀJẸ́', 'Lagos will not spoil', '#ff385c'], ['EKO RUSH', 'Run the city. Dodge the danfo.', '#222222'],
      ['JOLLOF FEST', 'Live at TBS • This December', '#e65100'], ['KEEP LAGOS CLEAN', 'Every Saturday, sweep your front', '#2e7d32'],
      ['AFROBEATS LIVE', 'Onikan • Friday night', '#4527a0'], ['THIRD MAINLAND', 'Expect traffic. Bring patience.', '#00796b'],
    ];
    X.adMats = ADS.map(([t, s, c]) => {
      const m = new T.MeshStandardMaterial({ map: textTex(`${t}\n${s}`, { bg: c, fg: '#fff', w: 1024, h: 512, border: '#ffffff' }), roughness: 0.5, emissive: 0xffffff });
      m.emissiveMap = m.map;
      return glow(m, 0.75, 0);
    });

    X.umbrellaMats = [['#ff385c', '#ffffff'], ['#ffb400', '#1b5e20'], ['#00a699', '#ffffff'], ['#3f51b5', '#ffeb3b']].map(([a, b]) =>
      new T.MeshStandardMaterial({
        side: T.DoubleSide, roughness: 0.7,
        map: canvasTex(256, 32, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * 32, 0, 32, h); } }),
      }));

    _tex = X;
    return X;
  }

  function ankaraTex(cols) {
    return canvasTex(128, 128, (g, w) => {
      g.fillStyle = cols[0]; g.fillRect(0, 0, w, w);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const cx = x * 32 + 16, cy = y * 32 + 16;
        g.fillStyle = cols[3];
        g.beginPath(); g.moveTo(x * 32, y * 32 - 6); g.lineTo(x * 32 + 6, y * 32); g.lineTo(x * 32, y * 32 + 6); g.lineTo(x * 32 - 6, y * 32); g.fill();
        g.fillStyle = cols[1]; g.beginPath(); g.arc(cx, cy, 11, 0, PI * 2); g.fill();
        g.fillStyle = cols[2]; g.beginPath(); g.arc(cx, cy, 6, 0, PI * 2); g.fill();
        g.fillStyle = cols[0]; g.beginPath(); g.arc(cx, cy, 2.5, 0, PI * 2); g.fill();
      }
    }, true);
  }

  function plaque(text, w = 7, h = 1.8, bg = '#ff385c') {
    const g = new T.Group();
    const post = mat(0x3a3a3a, { metalness: 0.4 });
    g.add(mesh(C(0.09, 0.09, 2.6, 8), post, 0, 1.3, -w / 2 + 0.4));
    g.add(mesh(C(0.09, 0.09, 2.6, 8), post, 0, 1.3, w / 2 - 0.4));
    g.add(mesh(B(0.18, h, w), mat(0x1c1c1c), 0, 2.4 + h / 2 - 0.3, 0));
    const m = new T.MeshStandardMaterial({ map: textTex(text, { bg, fg: '#fff', w: 1024, h: Math.round(1024 * h / w) }), roughness: 0.5, emissive: 0xffffff });
    m.emissiveMap = m.map;
    glow(m, 0.7, 0);
    g.add(plane(w - 0.2, h - 0.2, m, 0.1, 2.4 + h / 2 - 0.3, 0, PI / 2));
    return g;
  }

  /* ================= STREET FURNITURE ================= */
  const BUILD_COLORS = [0xf2e3c6, 0xe8c07a, 0xd98e5f, 0xa8c69f, 0xf0d9a8, 0xc9d6df, 0xe6a6a1, 0xfafafa, 0xd4b483, 0x9fb7c9, 0xf6c6a8];
  const AWNINGS = [0xff385c, 0x1e88e5, 0x43a047, 0xfdd835, 0x8e24aa, 0xfb8c00];

  /* Generic Lagos building – road-facing side is +X */
  function createBuilding(o = {}) {
    const X = tex();
    const len = o.len || rnd(7, 13), depth = o.depth || rnd(7, 11), floors = o.floors || ri(2, 7);
    const h = floors * 3 + 0.6;
    const wall = glow(mat(o.color || pick(BUILD_COLORS), { map: X.windows, emissive: 0xffcf7a, emissiveMap: pick(X.lit) }), 1, 0);
    const roof = mat(0x9a948c, { roughness: 0.95 });
    const g = new T.Group();
    g.add(mesh(boxUV(depth, h, len, 12), [wall, wall, roof, roof, wall, wall], 0, h / 2, 0));
    g.add(mesh(B(depth + 0.2, 0.4, len + 0.2), mat(0xe8e2d6), 0, h + 0.2, 0));
    const tankM = mat(0x1d1d1d, { roughness: 0.5 });
    for (let i = 0, n = ri(1, 3); i < n; i++) {
      const tx = rnd(-depth / 2 + 1.2, depth / 2 - 1.2), tz = rnd(-len / 2 + 1.2, len / 2 - 1.2);
      g.add(mesh(B(1.5, 0.6, 1.5), mat(0x777777), tx, h + 0.7, tz));
      g.add(mesh(C(0.65, 0.65, 1.4, 16), tankM, tx, h + 1.7, tz));
    }
    if (Math.random() < 0.4) {
      const dish = mesh(new T.SphereGeometry(0.5, 12, 8, 0, PI * 2, 0, PI / 3), mat(0xeeeeee, { side: T.DoubleSide }), depth / 2 - 0.8, h + 1.1, rnd(-len / 3, len / 3));
      dish.rotation.z = -1; g.add(dish);
    }
    const sx = depth / 2;
    if (o.shop !== false && Math.random() < 0.8) {
      const awn = mesh(B(1.4, 0.12, len * 0.85), mat(pick(AWNINGS)), sx + 0.65, 3.0, 0);
      awn.rotation.z = -0.2; g.add(awn);
      g.add(plane(len * 0.8, 1.1, pick(X.shopMats), sx + 0.03, 3.8, 0, PI / 2));
      g.add(plane(len * 0.7, 2.5, mat(0x2a2522), sx + 0.02, 1.25, 0, PI / 2));
    }
    if (floors >= 3 && Math.random() < 0.6) {
      const bm = mat(0xdedad2), bz = rnd(-len / 4, len / 4);
      for (let f = 1; f < floors; f++) {
        g.add(mesh(B(0.9, 0.12, len * 0.45), bm, sx + 0.45, f * 3 + 0.1, bz));
        g.add(mesh(B(0.06, 0.8, len * 0.45), mat(0x444444), sx + 0.88, f * 3 + 0.55, bz));
      }
    }
    for (let i = 0, n = ri(0, 3); i < n; i++) {
      g.add(mesh(B(0.5, 0.45, 0.8), mat(0xe0e0e0), sx + 0.25, ri(1, floors - 1) * 3 + 1.4, rnd(-len / 2 + 1, len / 2 - 1)));
    }
    g.userData = { len, depth, h };
    return g;
  }

  /* Street lamp – arm points to +X */
  function createLamp() {
    const X = tex();
    const g = new T.Group();
    const pole = mat(0x55595f, { metalness: 0.5, roughness: 0.4 });
    g.add(mesh(C(0.08, 0.13, 6.6, 8), pole, 0, 3.3, 0));
    g.add(mesh(B(1.7, 0.08, 0.08), pole, 0.8, 6.5, 0));
    g.add(mesh(B(0.65, 0.16, 0.32), pole, 1.6, 6.45, 0));
    const bulb = new T.Mesh(B(0.5, 0.05, 0.22), X.lampMat);
    bulb.position.set(1.6, 6.35, 0);
    g.add(bulb);
    const pool = new T.Mesh(new T.PlaneGeometry(7, 7), X.poolMat);
    pool.rotation.x = -PI / 2;
    pool.position.set(1.6, 0.22, 0);
    pool.renderOrder = 2;
    g.add(pool);
    return g;
  }

  function createPalm(h = rnd(5, 8.5)) {
    const g = new T.Group();
    const trunkM = mat(0x8a6a48, { roughness: 1 });
    const leafM = mat(0x2f8f3a, { roughness: 0.8, side: T.DoubleSide });
    const segs = 6, lean = rnd(-0.08, 0.08);
    let x = 0, y = 0;
    for (let i = 0; i < segs; i++) {
      const sh = h / segs;
      const seg = mesh(C(0.15 - i * 0.012, 0.2 - i * 0.012, sh * 1.02, 8), trunkM, x, y + sh / 2, 0);
      seg.rotation.z = -lean * (i + 1) * 0.5;
      g.add(seg);
      y += sh; x += Math.sin(lean * (i + 1) * 0.5) * sh;
    }
    const crown = new T.Group();
    crown.position.set(x, y, 0);
    g.add(crown);
    const leafG = new T.ConeGeometry(0.42, 3, 4);
    leafG.rotateX(PI / 2);
    leafG.scale(1, 0.12, 1);
    for (let i = 0; i < 9; i++) {
      const yaw = new T.Group(); yaw.rotation.y = (i / 9) * PI * 2 + rnd(-0.2, 0.2);
      const droop = new T.Group(); droop.rotation.x = 0.35 + rnd(0, 0.45);
      const leaf = mesh(leafG, leafM, 0, 0, 1.4);
      droop.add(leaf); yaw.add(droop); crown.add(yaw);
    }
    const nutM = mat(0x5d4023);
    for (let i = 0; i < 3; i++) crown.add(mesh(S(0.16, 8, 6), nutM, Math.sin(i * 2.1) * 0.22, -0.2, Math.cos(i * 2.1) * 0.22));
    return g;
  }

  function createStall() {
    const X = tex();
    const g = new T.Group();
    const wood = mat(0x8d6e4b);
    g.add(mesh(B(1.0, 0.08, 1.7), wood, 0, 0.9, 0));
    [[-0.42, -0.75], [0.42, -0.75], [-0.42, 0.75], [0.42, 0.75]].forEach(([x, z]) => g.add(mesh(B(0.06, 0.9, 0.06), wood, x, 0.45, z)));
    const goods = [0xe53935, 0xff9800, 0x43a047, 0xfdd835];
    for (let i = 0; i < 9; i++) g.add(mesh(S(0.11, 8, 6), mat(pick(goods)), rnd(-0.35, 0.35), 1.02, rnd(-0.7, 0.7)));
    g.add(mesh(C(0.03, 0.03, 2.2, 6), mat(0x555555), 0, 1.6, 0));
    const um = new T.Mesh(new T.ConeGeometry(1.3, 0.55, 8, 1, true), pick(X.umbrellaMats));
    um.position.y = 2.6; um.castShadow = true;
    g.add(um);
    return g;
  }

  function createBillboard(side) {
    const X = tex();
    const g = new T.Group();
    const steel = mat(0x4b4f55, { metalness: 0.5, roughness: 0.4 });
    g.add(mesh(C(0.15, 0.2, 8, 8), steel, 0, 4, -2));
    g.add(mesh(C(0.15, 0.2, 8, 8), steel, 0, 4, 2));
    g.add(mesh(B(0.3, 3.4, 6.6), mat(0x222222), 0, 9.4, 0));
    g.add(plane(6.3, 3.1, pick(X.adMats), 0.16, 9.4, 0, PI / 2));
    g.rotation.y = side < 0 ? -0.6 : PI + 0.6;
    return g;
  }

  /* ================= VEHICLES & OBSTACLES (front faces +Z) ================= */
  function wheel(r, w, x, y, z) {
    const g = new T.Group();
    const t = mesh(C(r, r, w, 18), mat(0x111111, { roughness: 0.9 }), 0, 0, 0);
    t.rotation.z = PI / 2; g.add(t);
    const hub = mesh(C(r * 0.5, r * 0.5, w + 0.02, 12), mat(0xc8cdd2, { metalness: 0.8, roughness: 0.3 }), 0, 0, 0);
    hub.rotation.z = PI / 2; g.add(hub);
    g.position.set(x, y, z);
    return g;
  }

  function createDanfo() {
    const X = tex();
    const g = new T.Group();
    const yellow = mat(0xffc20e, { roughness: 0.45, metalness: 0.15 });
    const black = mat(0x151515);
    const chrome = mat(0xcfd4d8, { metalness: 0.8, roughness: 0.3 });
    const L = 4.6, W = 1.9;
    g.add(mesh(B(W, 1.0, L), yellow, 0, 0.85, 0));
    g.add(mesh(B(W - 0.06, 0.72, L - 0.25), yellow, 0, 1.71, -0.05));
    g.add(mesh(B(W - 0.18, 0.08, L - 0.5), yellow, 0, 2.11, -0.05));
    [-1, 1].forEach((s) => {
      g.add(mesh(B(0.02, 0.48, L - 0.7), X.darkGlass, s * ((W - 0.06) / 2 + 0.011), 1.74, -0.1));
      const p = plane(3.4, 0.28, X.sloganMat, s * (W / 2 + 0.012), 0.84, 0, s * PI / 2);
      g.add(p);
    });
    g.add(mesh(B(W - 0.3, 0.5, 0.02), X.darkGlass, 0, 1.74, 2.14));
    g.add(mesh(B(W - 0.3, 0.45, 0.02), X.darkGlass, 0, 1.74, -2.24));
    [0.62, 1.05].forEach((y) => g.add(mesh(B(W + 0.02, 0.07, L + 0.02), black, 0, y, 0)));
    [-1, 1].forEach((s) => {
      const hl = new T.Mesh(C(0.13, 0.13, 0.05, 16), X.headlightMat);
      hl.rotation.x = PI / 2; hl.position.set(s * 0.62, 0.8, L / 2 + 0.02); g.add(hl);
      g.add(mesh(B(0.18, 0.22, 0.04), X.tailMat, s * 0.75, 0.9, -L / 2 - 0.02));
    });
    g.add(mesh(B(W + 0.1, 0.16, 0.18), black, 0, 0.42, L / 2 + 0.05));
    g.add(mesh(B(W + 0.1, 0.16, 0.18), black, 0, 0.42, -L / 2 - 0.05));
    const logo = mesh(C(0.17, 0.17, 0.04, 20), chrome, 0, 1.12, L / 2 + 0.02);
    logo.rotation.x = PI / 2; g.add(logo);
    g.add(mesh(B(1.3, 0.34, 0.08), black, 0, 2.32, 1.85));
    g.add(plane(1.2, 0.26, X.destMat, 0, 2.32, 1.9));
    g.add(mesh(B(1.5, 0.06, 2.6), black, 0, 2.2, -0.6));
    [[-1, 1.45], [1, 1.45], [-1, -1.45], [1, -1.45]].forEach(([s, z]) => g.add(wheel(0.36, 0.26, s * (W / 2 - 0.05), 0.36, z)));
    g.userData = { len: L, top: 2.15, width: W };
    return g;
  }

  function createBRT() {
    const X = tex();
    const g = new T.Group();
    const L = 10, W = 2.35;
    const blue = mat(0x1b5fb8, { roughness: 0.4, metalness: 0.2 });
    const white = mat(0xf4f6f8, { roughness: 0.4 });
    const red = mat(0xe53935);
    g.add(mesh(B(W, 1.2, L), blue, 0, 1.0, 0));
    g.add(mesh(B(W, 1.35, L), white, 0, 2.275, 0));
    g.add(mesh(B(W - 0.1, 0.1, L - 0.2), white, 0, 3.0, 0));
    g.add(mesh(B(W + 0.02, 0.18, L + 0.02), red, 0, 1.6, 0));
    g.add(mesh(B(0.4, 0.04, L - 0.6), red, 0, 3.06, 0));
    [-1, 1].forEach((s) => g.add(mesh(B(0.16, 0.05, L - 0.3), X.hazardMat, s * (W / 2 - 0.14), 3.07, 0)));
    g.add(mesh(B(W - 0.3, 0.05, 0.16), X.hazardMat, 0, 3.07, L / 2 - 0.2));
    [-1, 1].forEach((s) => {
      g.add(mesh(B(0.02, 1.0, L - 1.2), X.darkGlass, s * (W / 2 + 0.01), 2.25, -0.2));
      g.add(plane(2.6, 0.65, X.brtMat, s * (W / 2 + 0.012), 1.0, 1.4, s * PI / 2));
      const hl = new T.Mesh(B(0.35, 0.16, 0.04), X.headlightMat);
      hl.position.set(s * 0.82, 0.85, L / 2 + 0.02); g.add(hl);
      g.add(mesh(B(0.3, 0.3, 0.04), X.tailMat, s * 0.9, 1.0, -L / 2 - 0.02));
    });
    g.add(mesh(B(W - 0.2, 1.1, 0.02), X.darkGlass, 0, 2.1, L / 2 + 0.01));
    g.add(plane(1.9, 0.3, X.brtDestMat, 0, 2.82, L / 2 + 0.02));
    g.add(mesh(B(W + 0.06, 0.3, 0.16), mat(0x222222), 0, 0.45, L / 2 + 0.04));
    [[-1, 3.3], [1, 3.3], [-1, -3.3], [1, -3.3]].forEach(([s, z]) => g.add(wheel(0.5, 0.32, s * (W / 2 - 0.12), 0.5, z)));
    g.userData = { len: L, top: 3.05, width: W };
    return g;
  }

  function createKeke() {
    const X = tex();
    const g = new T.Group();
    const L = 2.6, W = 1.35;
    const yellow = mat(0xffd000, { roughness: 0.45, metalness: 0.1 });
    const green = mat(0x1e8e3e);
    const canvas = mat(0x1a1a1a, { roughness: 1 });
    g.add(mesh(B(W, 0.55, L), yellow, 0, 0.6, 0));
    g.add(mesh(B(W * 0.85, 0.5, 0.5), yellow, 0, 1.1, L / 2 - 0.25));
    const ws = mesh(B(W * 0.8, 0.5, 0.03), X.darkGlass, 0, 1.55, L / 2 - 0.42);
    ws.rotation.x = -0.15; g.add(ws);
    g.add(mesh(B(W + 0.06, 0.08, L - 0.2), canvas, 0, 1.75, -0.05));
    g.add(mesh(B(W + 0.02, 0.08, L + 0.02), green, 0, 0.78, 0));
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([s, d]) => g.add(mesh(C(0.025, 0.025, 0.9, 6), canvas, s * (W / 2 - 0.03), 1.3, d * (L / 2 - 0.2))));
    g.add(mesh(B(W - 0.1, 0.5, 0.05), canvas, 0, 1.45, -L / 2 + 0.15));
    const hl = new T.Mesh(C(0.1, 0.1, 0.05, 14), X.headlightMat);
    hl.rotation.x = PI / 2; hl.position.set(0, 1.15, L / 2 + 0.01); g.add(hl);
    g.add(wheel(0.25, 0.14, 0, 0.25, L / 2 - 0.3));
    g.add(wheel(0.25, 0.14, -W / 2 + 0.02, 0.25, -L / 2 + 0.45));
    g.add(wheel(0.25, 0.14, W / 2 - 0.02, 0.25, -L / 2 + 0.45));
    g.userData = { len: L, top: 1.79, width: W };
    return g;
  }

  function createBarrier() {
    const X = tex();
    const g = new T.Group();
    const W = 2.0;
    const grey = mat(0x444444);
    [-1, 1].forEach((s) => {
      g.add(mesh(B(0.1, 1.05, 0.1), grey, s * 0.85, 0.525, 0));
      g.add(mesh(B(0.14, 0.08, 0.8), grey, s * 0.85, 0.04, 0));
    });
    g.add(mesh(B(W, 0.3, 0.08), X.stripeMat, 0, 0.88, 0));
    g.add(mesh(B(W, 0.22, 0.08), X.stripeMat, 0, 0.45, 0));
    [-1, 1].forEach((s) => g.add(mesh(S(0.09, 12, 8), X.blinkMat, s * 0.85, 1.14, 0)));
    g.userData = { len: 0.5, top: 1.05, width: W };
    return g;
  }

  function createGantry() {
    const X = tex();
    const g = new T.Group();
    const grey = mat(0x6b7077, { metalness: 0.4, roughness: 0.4 });
    [-1, 1].forEach((s) => g.add(mesh(B(0.15, 2.6, 0.15), grey, s * 1.02, 1.3, 0)));
    g.add(mesh(B(2.15, 1.1, 0.2), [grey, grey, grey, grey, X.ekoSign, X.ekoSign], 0, 1.9, 0));
    g.add(mesh(B(2.15, 0.12, 0.22), X.hazardMat, 0, 1.3, 0));
    [-1, 1].forEach((s) => g.add(mesh(S(0.09, 12, 8), X.blinkMat, s * 1.02, 2.66, 0)));
    g.userData = { len: 0.3, bottom: 1.3, top: 2.5, width: 2.15 };
    return g;
  }

  /* Ramp: high end at z=0, low end at z=+L */
  function createRamp(L = 6.5, h = 3.05, w = 2.2) {
    const X = tex();
    const s = new T.Shape();
    s.moveTo(0, 0); s.lineTo(L, 0); s.lineTo(0, h); s.lineTo(0, 0);
    const geo = new T.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
    geo.rotateY(-PI / 2);
    geo.translate(w / 2, 0, 0);
    const g = new T.Group();
    g.add(mesh(geo, mat(0x7d838c, { roughness: 0.8 })));
    const ang = Math.atan2(h, L), slope = Math.hypot(L, h);
    [-1, 1].forEach((sd) => {
      const edge = mesh(B(0.12, 0.08, slope), X.hazardMat, sd * (w / 2 - 0.06), h / 2 + 0.05, L / 2);
      edge.rotation.x = ang;
      g.add(edge);
    });
    g.userData = { len: L, h, width: w };
    return g;
  }

  function createCoin() {
    const X = tex();
    if (!X.coinGeo) { X.coinGeo = C(0.33, 0.33, 0.07, 24); X.coinGeo.rotateX(PI / 2); }
    const m = new T.Mesh(X.coinGeo, [X.coinSide, X.coinFace, X.coinFace]);
    m.castShadow = true;
    return m;
  }

  function createPowerup(type) {
    const g = new T.Group();
    const bubble = new T.Mesh(S(0.62, 24, 16), new T.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.3, emissive: 0xff385c, emissiveIntensity: 0.25 }));
    g.add(bubble);
    const inner = new T.Group();
    g.add(inner);
    if (type === 'magnet') {
      const u = mesh(new T.TorusGeometry(0.24, 0.09, 10, 20, PI), mat(0xe53935, { metalness: 0.3 }));
      u.rotation.z = PI; inner.add(u);
      [-1, 1].forEach((s) => inner.add(mesh(C(0.095, 0.095, 0.16, 12), mat(0xdddddd, { metalness: 0.8, roughness: 0.2 }), s * 0.24, 0.08, 0)));
    } else if (type === 'shoes') {
      inner.add(mesh(B(0.26, 0.18, 0.5), mat(0xff385c), 0, 0.02, 0));
      inner.add(mesh(B(0.28, 0.07, 0.54), mat(0xffffff), 0, -0.1, 0));
      [-1, 1].forEach((s) => { const wg = mesh(B(0.04, 0.16, 0.3), mat(0xffffff), s * 0.17, 0.12, 0.08); wg.rotation.x = -0.6; inner.add(wg); });
    } else if (type === 'jet') {
      const jp = createJetpack();
      jp.scale.setScalar(1.4);
      jp.position.y = 0.12;
      inner.add(jp);
    } else {
      const m = new T.MeshStandardMaterial({ map: textTex('2X', { bg: '#ffb300', fg: '#3b2500', w: 128, h: 128 }), metalness: 0.4, roughness: 0.3 });
      inner.add(mesh(B(0.55, 0.55, 0.12), m));
    }
    g.userData = { type };
    return g;
  }

  /* Jetpack worn on the back; flames are children named "flame" */
  function createJetpack() {
    const X = tex();
    const g = new T.Group();
    const red = mat(0xff385c, { metalness: 0.4, roughness: 0.35 });
    const steel = mat(0xc9ced4, { metalness: 0.85, roughness: 0.25 });
    const bar = mesh(C(0.04, 0.04, 0.26, 10), mat(0x2a2a2a), 0, 0.06, -0.02);
    bar.rotation.z = PI / 2;
    g.add(bar);
    [-1, 1].forEach((s) => {
      g.add(mesh(new T.CapsuleGeometry(0.085, 0.24, 6, 16), red, s * 0.1, 0.02, 0));
      g.add(mesh(S(0.05, 10, 8), steel, s * 0.1, 0.2, 0));
      g.add(mesh(C(0.055, 0.08, 0.1, 14), steel, s * 0.1, -0.2, 0));
      const fl = new T.Mesh(new T.ConeGeometry(0.07, 0.45, 12, 1, true), X.flameMat);
      fl.rotation.x = PI; fl.position.set(s * 0.1, -0.47, 0); fl.name = 'flame';
      g.add(fl);
      const core = new T.Mesh(new T.ConeGeometry(0.035, 0.25, 10, 1, true), X.flameCore);
      core.rotation.x = PI; core.position.set(s * 0.1, -0.37, 0); core.name = 'flame';
      g.add(core);
    });
    return g;
  }

  /* ================= CHARACTERS (face -Z) ================= */
  const VARIANTS = {
    tunde: { name: 'Tunde', tagline: 'Yaba tech bro. Fastest legs on Herbert Macaulay.', skin: 0x6b4226, shirt: { type: 'ankara', cols: ['#f28c28', '#1b4d89', '#fdd835', '#c62828'] }, pants: 0x2c3e66, shoe: 0xffffff, accent: 0xff385c, hat: 'cap', hatColor: 0xff385c, backpack: 0x2e7d32 },
    amaka: { name: 'Amaka', tagline: 'Lekki fashion queen. Gele stays on at 30 km/h.', skin: 0x7a4a2b, shirt: { type: 'ankara', cols: ['#6a1b9a', '#fbc02d', '#00897b', '#ffffff'] }, pants: 0x222222, shoe: 0xff80ab, accent: 0xffffff, hat: 'gele', hatCols: ['#fbc02d', '#6a1b9a', '#e91e63', '#ffffff'], earrings: true },
    seun: { name: 'Seun', tagline: 'Surulere footballer. Fila tilted, never offside.', skin: 0x4e2f1c, shirt: { type: 'jersey' }, pants: 0xf5f5f5, shoe: 0x111111, accent: 0x0b8a4f, hat: 'fila', hatColor: 0x0b6e4f },
    officer: { name: 'LASTMA Officer', skin: 0x5a3a22, shirt: { type: 'plain', color: 0xf2c230 }, pants: 0x6d1a2a, shoe: 0x111111, accent: 0x111111, hat: 'officer', hatColor: 0x6d1a2a, belt: true },
  };

  function createRunner(key) {
    const v = typeof key === 'string' ? VARIANTS[key] || VARIANTS.tunde : key;
    const skin = mat(v.skin, { roughness: 0.5 });
    let shirt;
    if (v.shirt.type === 'ankara') {
      const tx = ankaraTex(v.shirt.cols);
      tx.repeat.set(3, 2);
      shirt = mat(0xffffff, { map: tx, roughness: 0.7 });
    } else if (v.shirt.type === 'jersey') {
      shirt = mat(0xffffff, {
        map: canvasTex(256, 128, (g, w, h) => {
          g.fillStyle = '#0b8a4f'; g.fillRect(0, 0, w, h);
          g.fillStyle = '#ffffff'; g.fillRect(w * 0.36, 0, w * 0.28, h);
          g.fillStyle = '#0b8a4f'; g.font = `900 54px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('9', w / 2, h * 0.55);
        }),
      });
    } else shirt = mat(v.shirt.color);
    const pants = mat(v.pants, { roughness: 0.8 });
    const shoe = mat(v.shoe, { roughness: 0.45 });
    const accent = mat(v.accent);
    const dark = mat(0x161616, { roughness: 0.6 });
    const cap = (r, len, seg = 14) => new T.CapsuleGeometry(r, len, 6, seg);

    const root = new T.Group();
    const body = new T.Group(); body.position.y = 0.85; root.add(body);
    const torso = new T.Group(); body.add(torso);

    const profile = [[0, 0], [0.17, 0], [0.19, 0.06], [0.182, 0.16], [0.2, 0.3], [0.232, 0.43], [0.245, 0.51], [0.225, 0.58], [0.15, 0.635], [0.065, 0.665], [0, 0.67]]
      .map(([x, y]) => new T.Vector2(x, y));
    const torsoGeo = new T.LatheGeometry(profile, 24);
    torsoGeo.scale(1, 1, 0.68);
    torso.add(mesh(torsoGeo, shirt, 0, 0, 0));
    const hips = mesh(S(0.2, 18, 12), pants, 0, 0.02, 0);
    hips.scale.set(1, 0.6, 0.72);
    torso.add(hips);
    if (v.belt) {
      const belt = mesh(new T.TorusGeometry(0.185, 0.026, 8, 28), dark, 0, 0.1, 0);
      belt.rotation.x = PI / 2; belt.scale.set(1, 0.72, 1);
      torso.add(belt);
    }
    torso.add(mesh(C(0.058, 0.07, 0.12, 12), skin, 0, 0.71, 0));
    if (v.backpack) {
      const bpM = mat(v.backpack, { roughness: 0.6 });
      const bp = mesh(cap(0.14, 0.16), bpM, 0, 0.36, 0.2);
      bp.scale.set(1.15, 1, 0.6);
      torso.add(bp);
      const pocket = mesh(cap(0.08, 0.06), mat(0xfdd835), 0, 0.28, 0.27);
      pocket.scale.set(1.2, 1, 0.45);
      torso.add(pocket);
      [-1, 1].forEach((s) => torso.add(mesh(cap(0.022, 0.3, 8), bpM, s * 0.12, 0.36, -0.158)));
    }

    const head = new T.Group(); head.position.y = 0.87; torso.add(head);
    const skull = mesh(S(0.18, 24, 18), skin);
    skull.scale.set(0.95, 1.05, 1);
    head.add(skull);
    [-1, 1].forEach((s) => {
      head.add(mesh(S(0.034, 12, 10), mat(0xffffff, { roughness: 0.25 }), s * 0.066, 0.025, -0.152));
      head.add(mesh(S(0.019, 10, 8), dark, s * 0.066, 0.025, -0.18));
      const brow = mesh(cap(0.011, 0.05, 6), dark, s * 0.066, 0.085, -0.163);
      brow.rotation.z = PI / 2 + s * 0.15;
      head.add(brow);
      const ear = mesh(S(0.042, 10, 8), skin, s * 0.17, 0, 0);
      ear.scale.set(0.55, 1, 0.8);
      head.add(ear);
      if (v.earrings) head.add(mesh(new T.TorusGeometry(0.03, 0.008, 6, 14), mat(0xffc107, { metalness: 0.9, roughness: 0.2 }), s * 0.178, -0.07, 0));
    });
    const nose = mesh(S(0.032, 10, 8), skin, 0, -0.02, -0.176);
    nose.scale.set(1.1, 0.85, 0.9);
    head.add(nose);
    const smile = mesh(new T.TorusGeometry(0.036, 0.009, 6, 14, PI), mat(0x5a1f1a), 0, -0.07, -0.162);
    smile.rotation.z = PI;
    head.add(smile);

    const hatColor = v.hatColor != null ? mat(v.hatColor) : null;
    const brim = (m, y) => {
      const b = mesh(C(0.2, 0.2, 0.022, 24, false, PI / 2, PI), m, 0, y, -0.05);
      b.scale.set(1, 1, 1.2);
      return b;
    };
    if (v.hat !== 'gele') {
      const hair = mesh(new T.SphereGeometry(0.186, 20, 10, 0, PI * 2, 0, PI / 2.1), dark, 0, 0.014, 0.008);
      hair.scale.set(0.97, 1.05, 1.02);
      head.add(hair);
    }
    if (v.hat === 'cap') {
      head.add(mesh(new T.SphereGeometry(0.194, 20, 10, 0, PI * 2, 0, PI / 2), hatColor, 0, 0.035, 0));
      head.add(brim(hatColor, 0.05));
      head.add(mesh(S(0.025, 8, 6), mat(0xffffff), 0, 0.23, 0));
    } else if (v.hat === 'gele') {
      const gm = mat(0xffffff, { map: ankaraTex(v.hatCols) });
      head.add(mesh(C(0.19, 0.2, 0.16, 18), gm, 0, 0.1, 0.01));
      const fan = mesh(S(0.22, 18, 12), gm, 0, 0.27, 0.04);
      fan.scale.set(1.45, 0.85, 0.5); fan.rotation.x = 0.35; head.add(fan);
      const fan2 = mesh(S(0.16, 14, 10), gm, 0.12, 0.33, 0.08);
      fan2.scale.set(1.2, 0.7, 0.4); fan2.rotation.z = -0.5; head.add(fan2);
      head.add(mesh(S(0.06, 10, 8), gm, -0.04, 0.12, 0.2));
    } else if (v.hat === 'fila') {
      const f = mesh(C(0.16, 0.19, 0.2, 18), hatColor, 0.02, 0.16, 0);
      f.rotation.z = -0.3; head.add(f);
      const fold = mesh(S(0.1, 12, 8), hatColor, 0.09, 0.26, 0);
      fold.scale.set(1, 0.4, 1.5); fold.rotation.z = -0.9; head.add(fold);
      head.add(mesh(C(0.192, 0.192, 0.03, 18), mat(0xffffff), 0, 0.075, 0));
    } else if (v.hat === 'officer') {
      head.add(mesh(C(0.22, 0.19, 0.11, 18), hatColor, 0, 0.15, 0));
      head.add(mesh(C(0.19, 0.19, 0.04, 18), dark, 0, 0.09, 0));
      head.add(brim(dark, 0.08));
      head.add(mesh(S(0.03, 8, 6), mat(0xffc107, { metalness: 0.9 }), 0, 0.15, -0.21));
    }

    function arm(side) {
      const sh = new T.Group(); sh.position.set(side * 0.25, 0.53, 0); torso.add(sh);
      sh.add(mesh(S(0.085, 14, 10), shirt));
      sh.add(mesh(cap(0.066, 0.18), shirt, 0, -0.15, 0));
      const el = new T.Group(); el.position.y = -0.3; sh.add(el);
      el.add(mesh(cap(0.055, 0.17), skin, 0, -0.13, 0));
      const hand = mesh(S(0.064, 12, 10), skin, 0, -0.29, 0);
      hand.scale.set(0.85, 1.1, 0.9);
      el.add(hand);
      return [sh, el];
    }
    function leg(side) {
      const hp = new T.Group(); hp.position.set(side * 0.105, 0, 0); body.add(hp);
      hp.add(mesh(cap(0.088, 0.24), pants, 0, -0.2, 0));
      const kn = new T.Group(); kn.position.y = -0.42; hp.add(kn);
      kn.add(mesh(S(0.078, 12, 10), pants));
      kn.add(mesh(cap(0.07, 0.22), pants, 0, -0.18, 0));
      const sg = cap(0.078, 0.15);
      const sh = mesh(sg, shoe, 0, -0.37, -0.05);
      sh.rotation.x = PI / 2; sh.scale.set(1.05, 1, 0.75);
      kn.add(sh);
      const sole = mesh(sg, accent, 0, -0.415, -0.05);
      sole.rotation.x = PI / 2; sole.scale.set(1.12, 1.06, 0.3);
      kn.add(sole);
      return [hp, kn];
    }
    const [armL, elbL] = arm(-1), [armR, elbR] = arm(1);
    const [legL, kneeL] = leg(-1), [legR, kneeR] = leg(1);
    if (v.hat === 'officer') {
      elbR.add(mesh(C(0.02, 0.02, 0.12, 6), mat(0xffc107, { metalness: 0.8 }), 0, -0.34, -0.02));
    }
    root.userData = { rig: { body, torso, head, armL, armR, elbL, elbR, legL, legR, kneeL, kneeR, baseY: 0.85 }, name: v.name };
    return root;
  }
  const createOfficer = () => createRunner('officer');

  function poseRunner(fig, ph, mode, dt) {
    const r = fig.userData.rig;
    const k = Math.min(1, dt * 16);
    const s = Math.sin(ph), c = Math.cos(ph);
    let P;
    switch (mode) {
      case 'run': P = { legL: s * 0.95, legR: -s * 0.95, kneeL: -Math.max(0, c) * 1.4 - 0.15, kneeR: -Math.max(0, -c) * 1.4 - 0.15, armL: -s * 0.9, armR: s * 0.9, elbL: 1.3, elbR: 1.3, torso: -0.2, bob: Math.abs(c) * 0.07, armZ: 0.12, head: 0.1 }; break;
      case 'jump': P = { legL: 0.95, legR: -0.4, kneeL: -1.4, kneeR: -0.5, armL: 2.5, armR: -0.7, elbL: 0.4, elbR: 0.9, torso: -0.1, bob: 0, armZ: 0.35, head: 0 }; break;
      case 'roll': P = { legL: 1.9, legR: 1.9, kneeL: -2.3, kneeR: -2.3, armL: 1.4, armR: 1.4, elbL: 1.6, elbR: 1.6, torso: -0.7, bob: -0.35, armZ: 0.1, head: 0.4 }; break;
      case 'fly': P = { legL: -0.25 + s * 0.08, legR: -0.05 - s * 0.08, kneeL: -0.7, kneeR: -0.35, armL: 0.5, armR: 0.5, elbL: 0.5, elbR: 0.5, torso: -0.35, bob: Math.sin(ph * 0.5) * 0.04, armZ: 0.45, head: -0.25 }; break;
      case 'fall': P = { legL: 0.4, legR: -0.25, kneeL: -0.3, kneeR: -0.7, armL: 2.9, armR: 2.6, elbL: 0.2, elbR: 0.3, torso: 0.35, bob: 0, armZ: 0.6, head: -0.3 }; break;
      case 'wave': P = { legL: 0, legR: 0.05, kneeL: 0, kneeR: -0.05, armL: s * 0.04, armR: 2.7, elbL: 0.15, elbR: 0.6 + Math.sin(ph * 3) * 0.5, torso: 0, bob: Math.sin(ph) * 0.012, armZ: 0.1, head: -0.05, armRZ: 0.5 }; break;
      default: P = { legL: 0, legR: 0, kneeL: 0, kneeR: 0, armL: s * 0.05, armR: -s * 0.05, elbL: 0.15, elbR: 0.15, torso: Math.sin(ph) * 0.02, bob: Math.sin(ph) * 0.012, armZ: 0.08, head: 0 };
    }
    const L = (o, v) => { o.rotation.x += (v - o.rotation.x) * k; };
    L(r.legL, P.legL); L(r.legR, P.legR); L(r.kneeL, P.kneeL); L(r.kneeR, P.kneeR);
    L(r.armL, P.armL); L(r.armR, P.armR); L(r.elbL, P.elbL); L(r.elbR, P.elbR);
    L(r.torso, P.torso); L(r.head, P.head);
    r.armL.rotation.z += (-P.armZ - r.armL.rotation.z) * k;
    r.armR.rotation.z += ((P.armRZ != null ? P.armRZ : P.armZ) - r.armR.rotation.z) * k;
    r.body.position.y += (r.baseY + P.bob - r.body.position.y) * k;
  }

  /* ================= LANDMARKS (road-facing side is +X) ================= */
  function createNationalTheatre() {
    const g = new T.Group();
    const white = mat(0xece7dc, { roughness: 0.6 });
    const grey = mat(0xb9b4aa);
    const band = glow(mat(0x26323d, { roughness: 0.2, metalness: 0.5, emissive: 0xffc977 }), 0.8, 0);
    const trim = mat(0x6b6f74);
    g.add(mesh(C(16, 16.5, 1.2, 56), grey, 0, 0.6, 0));
    g.add(mesh(C(14.5, 14.5, 5, 56), white, 0, 3.7, 0));
    g.add(mesh(C(14.56, 14.56, 1.8, 56, true), band, 0, 3.9, 0));
    g.add(mesh(C(17.5, 17, 0.9, 56), white, 0, 6.6, 0));
    g.add(mesh(C(17.3, 17.3, 0.25, 56), trim, 0, 6.05, 0));
    g.add(mesh(C(11.5, 13.5, 6, 56), white, 0, 10, 0));
    const ribG = B(0.7, 6.4, 1.6);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * PI * 2;
      const rib = mesh(ribG, grey, Math.sin(a) * 12.6, 10, Math.cos(a) * 12.6);
      rib.rotation.order = 'YXZ';
      rib.rotation.y = a;
      rib.rotation.x = -0.32;
      g.add(rib);
    }
    g.add(mesh(C(9, 11.6, 1.6, 56), grey, 0, 13.8, 0));
    const dome = mesh(new T.SphereGeometry(9, 40, 12, 0, PI * 2, 0, PI / 2), white, 0, 14.6, 0);
    dome.scale.y = 0.28; g.add(dome);
    g.add(mesh(C(19.5, 19.5, 0.5, 40, false, PI / 2 - 0.7, 1.4), white, 0, 6.1, 0));
    g.add(mesh(B(3, 0.6, 9), grey, 17.5, 0.3, 0));
    g.add(mesh(B(1.5, 1.2, 9), grey, 16.4, 0.6, 0));
    const p = plaque('NATIONAL THEATRE\nIganmu • Built for FESTAC ’77', 9, 2.2);
    p.position.set(21, 0, 9); g.add(p);
    g.userData = { len: 40, name: 'National Theatre, Iganmu' };
    return g;
  }

  function createNecomHouse() {
    const X = tex();
    const g = new T.Group();
    const facade = glow(mat(0xb98f6e, { map: X.windows, emissive: 0xffd27a, emissiveMap: X.lit[0] }), 0.9, 0);
    const roof = mat(0x6d625a);
    const fin = mat(0x8a6b55);
    g.add(mesh(B(22, 6, 22), X.darkGlass, 0, 3, 0));
    g.add(mesh(B(23, 0.6, 23), mat(0xd8d0c4), 0, 6.3, 0));
    g.add(mesh(boxUV(13, 72, 13, 12), [facade, facade, roof, roof, facade, facade], 0, 42.6, 0));
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => g.add(mesh(B(0.9, 72, 0.9), fin, a * 6.55, 42.6, b * 6.55)));
    [-3.2, 0, 3.2].forEach((z) => g.add(mesh(B(0.5, 72, 0.5), fin, 6.6, 42.6, z)));
    g.add(mesh(B(10, 5, 10), mat(0x7a5f4d), 0, 81, 0));
    const red = mat(0xd32f2f), whiteM = mat(0xf2f2f2);
    for (let i = 0; i < 8; i++) g.add(mesh(C(0.4, 0.55, 4, 10), i % 2 ? whiteM : red, 0, 85.5 + i * 4, 0));
    [[88, 0.6], [93, 2.4], [98, 4.2]].forEach(([y, a]) => {
      const d = mesh(C(1.3, 1.3, 0.3, 20), whiteM, Math.sin(a) * 1.2, y, Math.cos(a) * 1.2);
      d.rotation.set(PI / 2, 0, a); g.add(d);
    });
    g.add(mesh(S(0.5, 10, 8), glow(mat(0xff1744, { emissive: 0xff1744 }), 3, 0.8), 0, 117.8, 0));
    const p = plaque('NECOM HOUSE\nMarina • 32 floors of Lagos history', 9, 2.2);
    p.position.set(12.5, 0, 6); g.add(p);
    g.userData = { len: 26, name: 'NECOM House, Marina' };
    return g;
  }

  function createCivicCentre() {
    const X = tex();
    const g = new T.Group();
    const white = mat(0xf3f1ec, { roughness: 0.5 });
    g.add(mesh(B(26, 5, 30), white, -4, 2.5, 0));
    g.add(mesh(B(26.5, 0.5, 30.5), mat(0xc9c4ba), -4, 5.2, 0));
    const ts = PI / 2 - 1.0;
    g.add(mesh(C(14, 14, 13, 40, true, ts, 2.0), X.glassPlain, -6.5, 11.9, 0));
    g.add(mesh(C(14.4, 14.4, 0.6, 40, false, ts, 2.0), white, -6.5, 18.6, 0));
    g.add(mesh(C(14.4, 14.4, 0.6, 40, false, ts, 2.0), white, -6.5, 5.4, 0));
    for (let i = 0; i <= 8; i++) {
      const a = ts + (i / 8) * 2.0;
      g.add(mesh(B(0.25, 13, 0.25), white, -6.5 + Math.sin(a) * 14.05, 11.9, Math.cos(a) * 14.05));
    }
    g.add(mesh(B(0.5, 13, 23.6), white, -6.5 + Math.sin(ts) * 14 - 0.2, 11.9, 0));
    g.add(mesh(boxUV(11, 58, 11, 8), [X.glassMat, X.glassMat, white, white, X.glassMat, X.glassMat], -10, 29, -20));
    const cap = mesh(B(11.2, 4, 11.2), X.glassMat, -10, 59, -20);
    cap.rotation.z = 0.3; g.add(cap);
    const p = plaque('THE CIVIC CENTRE\nVictoria Island', 8, 2);
    p.position.set(11, 0, 12); g.add(p);
    g.userData = { len: 44, name: 'The Civic Centre, Victoria Island' };
    return g;
  }

  function createHorse(m) {
    const g = new T.Group();
    const body = mesh(B(0.6, 0.65, 1.6), m, 0, 1.45, 0); body.rotation.x = -0.5; g.add(body);
    const neck = mesh(B(0.3, 0.9, 0.38), m, 0, 2.15, 0.7); neck.rotation.x = 0.45; g.add(neck);
    const head = mesh(B(0.28, 0.3, 0.68), m, 0, 2.6, 1.05); head.rotation.x = 0.55; g.add(head);
    [-1, 1].forEach((s) => {
      g.add(mesh(C(0.08, 0.06, 1.15, 8), m, s * 0.2, 0.6, -0.55));
      const fl = mesh(C(0.08, 0.06, 0.95, 8), m, s * 0.2, 1.75, 0.95); fl.rotation.x = 1.1; g.add(fl);
      const ear = mesh(B(0.06, 0.14, 0.06), m, s * 0.08, 2.88, 0.92); g.add(ear);
    });
    const tail = mesh(B(0.12, 0.7, 0.12), m, 0, 1.2, -0.95); tail.rotation.x = -0.6; g.add(tail);
    const mane = mesh(B(0.08, 0.7, 0.2), m, 0, 2.3, 0.55); mane.rotation.x = 0.45; g.add(mane);
    return g;
  }

  /* Spans the road – centred on X=0 */
  function createTBSGate() {
    const g = new T.Group();
    const white = mat(0xf5f3ee, { roughness: 0.5 });
    const green = mat(0x0b7a43);
    [-1, 1].forEach((s) => {
      g.add(mesh(B(2.6, 9, 2.6), white, s * 7.2, 4.5, 0));
      [1.4, 8.0].forEach((y) => g.add(mesh(B(2.75, 0.45, 2.75), green, s * 7.2, y, 0)));
      g.add(mesh(B(9, 2.2, 0.8), white, s * (7.2 + 1.3 + 4.5), 1.1, 0));
      g.add(mesh(B(9.05, 0.3, 0.85), green, s * (7.2 + 1.3 + 4.5), 2.25, 0));
    });
    const sign = new T.MeshStandardMaterial({ map: textTex('TAFAWA BALEWA SQUARE', { bg: '#f5f3ee', fg: '#0b7a43', w: 1024, h: 128 }), roughness: 0.5, emissive: 0xffffff });
    sign.emissiveMap = sign.map; glow(sign, 0.5, 0);
    g.add(mesh(B(17, 2.2, 2.6), [white, white, white, white, sign, sign], 0, 10.1, 0));
    g.add(mesh(B(17.2, 0.3, 2.7), green, 0, 11.35, 0));
    const marble = mat(0xfbfbf8, { roughness: 0.35 });
    [-5.4, -1.8, 1.8, 5.4].forEach((x, i) => {
      g.add(mesh(B(1.4, 0.4, 2), white, x, 11.7, 0));
      const h = createHorse(marble);
      h.position.set(x, 11.9, -0.2);
      h.scale.setScalar(1.15);
      h.rotation.y = (i - 1.5) * 0.12;
      g.add(h);
    });
    g.userData = { len: 4, name: 'Tafawa Balewa Square, Onikan', span: true };
    return g;
  }

  function createStiltHouse() {
    const g = new T.Group();
    const wood = mat(pick([0x7a5534, 0x8d6748, 0x6b4a2e]), { roughness: 1 });
    [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]].forEach(([x, z]) => g.add(mesh(C(0.07, 0.07, 2, 6), wood, x, 0.6, z)));
    g.add(mesh(B(3.2, 0.15, 3.2), wood, 0, 1.4, 0));
    g.add(mesh(B(2.6, 1.8, 2.6), wood, 0, 2.4, 0));
    const roof = mesh(new T.ConeGeometry(2.4, 1.1, 4), mat(0x9c5a3c, { metalness: 0.5, roughness: 0.6 }), 0, 3.85, 0);
    roof.rotation.y = PI / 4; g.add(roof);
    g.add(plane(0.7, 1.2, mat(0x2a1a10), 1.31, 2.1, 0, PI / 2));
    return g;
  }

  function createCanoe() {
    const g = new T.Group();
    const hull = mesh(S(1, 14, 8), mat(0x5d3b1e), 0, 0.05, 0);
    hull.scale.set(0.45, 0.22, 2.4); g.add(hull);
    const man = mesh(C(0.12, 0.16, 0.7, 8), mat(pick([0xff385c, 0x1e88e5, 0xfdd835])), 0, 0.45, 0.5); g.add(man);
    g.add(mesh(S(0.12, 8, 6), mat(0x4e2f1c), 0, 0.92, 0.5));
    const pole = mesh(C(0.025, 0.025, 3, 5), mat(0x8d6e4b), 0.3, 0.9, 0.3); pole.rotation.x = 0.5; g.add(pole);
    return g;
  }

  function bridgeDeck(g, len, waterY) {
    const deck = mesh(B(15.6, 1, len), mat(0x55585e), 0, -0.5, 0);
    g.add(deck);
    g.add(mesh(B(7.2, 0.04, len), mat(0x2f2f33), 0, 0.02, 0));
    for (let z = -len / 2 + 6; z <= len / 2 - 6; z += 18) {
      g.add(mesh(C(1.1, 1.3, -waterY, 12), mat(0xbdb8b0), -4.5, waterY / 2 - 0.5, z));
      g.add(mesh(C(1.1, 1.3, -waterY, 12), mat(0xbdb8b0), 4.5, waterY / 2 - 0.5, z));
    }
  }

  /* Bridge segment centred on the road (X=0) */
  function createLinkBridge(o = {}) {
    const X = tex();
    const len = o.len || 130, water = o.water != null ? o.water : 200;
    const waterY = o.preview ? -6 : 0.04;
    const g = new T.Group();
    const concrete = mat(0xd9d6cf, { roughness: 0.8 });
    const H = 46, baseX = 7.6, topX = 1.3;
    const ang = Math.atan2(baseX - topX, H), legLen = Math.hypot(baseX - topX, H);
    [-1, 1].forEach((s) => {
      const leg = mesh(B(1.6, legLen, 2.4), concrete, s * (baseX + topX) / 2, H / 2, 0);
      leg.rotation.z = s * ang; g.add(leg);
    });
    g.add(mesh(B(4.2, 9, 2.6), concrete, 0, H + 3.5, 0));
    g.add(mesh(B(11.6, 1.4, 2.2), concrete, 0, 13, 0));
    g.add(mesh(S(0.45, 10, 8), glow(mat(0xff1744, { emissive: 0xff1744 }), 3, 0.6), 0, H + 8.3, 0));
    const cA = glow(mat(0xeeeeee, { metalness: 0.6, roughness: 0.3, emissive: 0xb04bff }), 1.8, 0);
    const cB = glow(mat(0xeeeeee, { metalness: 0.6, roughness: 0.3, emissive: 0x3fa9ff }), 1.8, 0);
    const n = 9, reach = Math.min(len / 2 - 4, 58);
    for (let i = 0; i < n; i++) {
      const yTop = H - 1 - i * 2.2;
      const xTop = baseX - (baseX - topX) * (yTop / H);
      const zEnd = 10 + (reach - 10) * (1 - i / (n - 1));
      [-1, 1].forEach((s) => [-1, 1].forEach((d) => {
        g.add(rod(new T.Vector3(s * xTop, yTop, d * 0.6), new T.Vector3(s * 7.4, 1.2, d * zEnd), 0.06, i % 2 ? cA : cB));
      }));
    }
    [-1, 1].forEach((s) => {
      g.add(mesh(B(0.5, 1.1, len), concrete, s * 7.6, 0.55, 0));
      g.add(mesh(B(0.12, 0.12, len), mat(0x9aa0a6, { metalness: 0.7, roughness: 0.3 }), s * 7.6, 1.25, 0));
      if (water) {
        const w = new T.Mesh(new T.PlaneGeometry(water, len), X.waterMat);
        w.rotation.x = -PI / 2; w.position.set(s * (7.9 + water / 2), waterY, 0); w.receiveShadow = true; g.add(w);
      }
    });
    if (o.preview) bridgeDeck(g, len, waterY);
    g.userData = { len, name: 'Lekki–Ikoyi Link Bridge', segment: true };
    return g;
  }

  function createThirdMainland(o = {}) {
    const X = tex();
    const len = o.len || 220, water = o.water != null ? o.water : 220;
    const waterY = o.preview ? -6 : 0.04;
    const g = new T.Group();
    const concrete = mat(0xcfcac0, { roughness: 0.85 });
    [-1, 1].forEach((s) => {
      g.add(mesh(B(0.6, 1.0, len), concrete, s * 7.6, 0.5, 0));
      g.add(mesh(B(0.62, 0.12, len), mat(0x2b2b2b), s * 7.6, 0.25, 0));
      for (let z = -len / 2 + 10; z < len / 2; z += 24) {
        const l = createLamp();
        l.position.set(s * 7.6, 0.9, z);
        if (s > 0) l.rotation.y = PI;
        g.add(l);
      }
      if (water) {
        const w = new T.Mesh(new T.PlaneGeometry(water, len), X.waterMat);
        w.rotation.x = -PI / 2; w.position.set(s * (7.9 + water / 2), waterY, 0); w.receiveShadow = true; g.add(w);
      }
    });
    if (water) {
      const near = o.preview ? 12 : 30, far = o.preview ? 30 : 100;
      const nh = o.preview ? 6 : 16;
      for (let i = 0; i < nh; i++) {
        const s = i % 2 ? 1 : -1;
        const h = createStiltHouse();
        h.position.set(s * rnd(near, far), waterY - 0.4, rnd(-len / 2 + 6, len / 2 - 6));
        h.rotation.y = rnd(0, PI * 2);
        g.add(h);
      }
      for (let i = 0; i < (o.preview ? 3 : 8); i++) {
        const c = createCanoe();
        c.position.set((i % 2 ? 1 : -1) * rnd(near * 0.6, far * 0.8), waterY, rnd(-len / 2, len / 2));
        c.rotation.y = rnd(0, PI);
        g.add(c);
      }
      if (!o.preview) {
        for (let i = 0; i < 9; i++) {
          const h = rnd(18, 60);
          const b = mesh(boxUV(10, h, 12, 12), [X.glassMat, X.glassMat, mat(0x777777), mat(0x777777), X.glassMat, X.glassMat], -rnd(150, 175), h / 2, -len / 2 + i * (len / 9));
          b.castShadow = false; g.add(b);
        }
      }
    }
    if (o.preview) bridgeDeck(g, len, waterY);
    g.userData = { len, name: 'Third Mainland Bridge', segment: true };
    return g;
  }

  function createEkoAtlantic() {
    const X = tex();
    const g = new T.Group();
    const roof = mat(0xdddddd);
    [[0, 0, 10, 10, 80], [14, -16, 9, 9, 58], [-6, -28, 12, 12, 96], [16, 14, 8, 8, 44], [2, 24, 10, 10, 66], [-12, 10, 9, 9, 52]].forEach(([x, z, w, d, h]) => {
      g.add(mesh(boxUV(w, h, d, 8), [X.glassMat, X.glassMat, roof, roof, X.glassMat, X.glassMat], x, h / 2, z));
      g.add(mesh(B(w * 0.6, 3, d * 0.6), X.glassMat, x, h + 1.5, z));
      g.add(mesh(C(0.15, 0.15, 6, 6), mat(0xffffff), x, h + 6, z));
    });
    const p = plaque('EKO ATLANTIC CITY\nThe new Lagos, built on the sea', 10, 2.2);
    p.position.set(22, 0, 0); g.add(p);
    g.userData = { len: 64, name: 'Eko Atlantic City' };
    return g;
  }

  const LANDMARK_INFO = [
    { key: 'theatre', name: 'National Arts Theatre', place: 'Iganmu', fact: 'Completed in 1976 for FESTAC ’77, its shape famously resembles a military cap.', make: createNationalTheatre },
    { key: 'necom', name: 'NECOM House', place: 'Marina, Lagos Island', fact: 'The 32-storey former NITEL tower was Nigeria’s tallest building for decades.', make: createNecomHouse },
    { key: 'link', name: 'Lekki–Ikoyi Link Bridge', place: 'Lekki ↔ Ikoyi', fact: 'Opened in 2013, the cable-stayed bridge glows purple and blue at night.', make: () => createLinkBridge({ len: 110, water: 40, preview: true }) },
    { key: 'third', name: 'Third Mainland Bridge', place: 'Oworonshoki ↔ Adeniji Adele', fact: 'Opened in 1990, it runs 11.8 km over the lagoon past the Makoko stilt village.', make: () => createThirdMainland({ len: 90, water: 40, preview: true }) },
    { key: 'tbs', name: 'Tafawa Balewa Square', place: 'Onikan', fact: 'Built on the old racecourse, its gate is crowned by four white horses.', make: createTBSGate },
    { key: 'civic', name: 'The Civic Centre', place: 'Victoria Island', fact: 'A curved glass waterfront venue facing the Lagos lagoon.', make: createCivicCentre },
    { key: 'eko', name: 'Eko Atlantic City', place: 'Victoria Island', fact: 'A new city rising from land reclaimed from the Atlantic Ocean.', make: createEkoAtlantic },
  ];

  window.LagosModels = {
    THREE: T, rnd, ri, pick, mat, mesh, canvasTex, textTex, tex, glow, setNight, isNight: () => night,
    createBuilding, createLamp, createPalm, createStall, createBillboard,
    createDanfo, createBRT, createKeke, createBarrier, createGantry, createRamp, createCoin, createPowerup, createJetpack,
    createRunner, createOfficer, poseRunner, VARIANTS,
    createNationalTheatre, createNecomHouse, createCivicCentre, createTBSGate, createLinkBridge, createThirdMainland, createEkoAtlantic,
    createStiltHouse, createCanoe, LANDMARK_INFO,
  };
})();
