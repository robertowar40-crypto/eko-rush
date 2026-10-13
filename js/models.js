/* Eko Rush – procedural 3D model library: Lagos landmarks, vehicles, characters (Three.js r149) */
// =====================================================================
// WHAT THIS FILE DOES
// This file is the 3D model library for Eko Rush. Every object you see
// in the game (buildings, buses, coins, the runner characters and the
// famous Lagos landmarks) is created here by code, not loaded from a
// 3D model file. Other game files use it through window.LagosModels.
//
// HOW MODELS ARE BUILT
// Each model is a Three.js Group (an invisible container) filled with
// simple shapes: boxes, cylinders, spheres, cones, capsules and flat
// planes. Each shape is a Mesh = geometry (the shape) + material (the
// colour/surface). Shapes are placed with x, y, z coordinates relative
// to the centre of their group, so moving the group moves the whole model.
// Text and patterns (signs, windows, ankara fabric) are painted on a
// hidden HTML canvas and wrapped onto shapes as textures.
//
// COORDINATE CONVENTIONS
// - y is up; y = 0 is the ground/road surface. Units are roughly metres.
// - Vehicles and obstacles face +z (their front points along +z).
// - Buildings and landmarks have their road-facing side pointing +x.
// - Characters face -z (towards the camera as the game runs).
// - Rotations are in radians: PI = half a turn (180 degrees),
//   PI / 2 = a quarter turn (90 degrees).
// =====================================================================

// The whole file is wrapped in a function that runs immediately (an IIFE)
// so its helper variables stay private and don't clutter the global scope.
(function () {
  // strict mode makes JavaScript report common mistakes as errors
  'use strict';
  // short alias for the global Three.js library (loaded before this file)
  const T = THREE;
  // PI radians = 180 degrees; used for all rotations
  const PI = Math.PI;
  // rnd(a, b): random decimal number between a and b
  const rnd = (a, b) => a + Math.random() * (b - a);
  // ri(a, b): random whole number from a to b (both included)
  const ri = (a, b) => Math.floor(rnd(a, b + 1));
  // pick(arr): returns a random element of an array
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // font list used when drawing text onto canvas textures
  const FONT = '"Plus Jakarta Sans", "Segoe UI", Arial, sans-serif';

  /* ---------------- night-glow registry ---------------- */
  // every material that should light up at night is remembered in this list
  const glowMats = [];
  // true while the game is in night mode
  let night = false;
  // glow(m, nightI, dayI): registers material m as a 'night glow' material.
  // 'emissive' is light a material gives off by itself (it isn't lit by lamps),
  // so windows and signs can shine in the dark. nightI / dayI are how strong
  // that self-light is at night and by day. Returns the same material.
  function glow(m, nightI = 1, dayI = 0) {
    // remember both strengths on the material (userData is a free storage slot)
    m.userData.glow = [nightI, dayI];
    // apply the strength that matches the current time of day
    m.emissiveIntensity = night ? nightI : dayI;
    // add it to the registry so setNight() can update it later
    glowMats.push(m);
    // return the material so calls can be chained, e.g. glow(mat(...))
    return m;
  }
  // setNight(v): switches every registered glow material between day and night
  // strength. v = true for night, false for day. Returns nothing.
  function setNight(v) {
    // !! turns any value into a true/false boolean
    night = !!v;
    // index 0 holds the night strength, index 1 the day strength
    for (const m of glowMats) m.emissiveIntensity = m.userData.glow[night ? 0 : 1];
    // street-lamp light pools on the road are only visible at night
    if (_tex) _tex.poolMat.opacity = night ? 0.5 : 0;
  }

  /* ---------------- helpers ---------------- */
  // mat(color, o): creates a MeshStandardMaterial (a realistic material that
  // reacts to lights). color is a hex number like 0xff0000 (red); o is an
  // optional object of extra settings that override the defaults.
  // roughness 0 = mirror-shiny, 1 = matte; metalness 0 = plastic, 1 = metal.
  function mat(color, o) {
    // Object.assign merges the defaults with any custom options in o
    return new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0.05 }, o || {}));
  }
  // mesh(geo, m, x, y, z): builds a Mesh (a visible 3D object = geometry shape
  // + material) and places it at position (x, y, z). Returns the mesh.
  function mesh(geo, m, x = 0, y = 0, z = 0) {
    // combine the shape (geo) with its surface material (m)
    const me = new T.Mesh(geo, m);
    // move it to its spot relative to its parent group
    me.position.set(x, y, z);
    // castShadow: this object throws a shadow onto other objects
    me.castShadow = true;
    // receiveShadow: other objects' shadows can fall onto this one
    me.receiveShadow = true;
    return me;
  }
  // Shortcut geometry makers so model code stays short:
  // B(w, h, d): a box w wide (x), h tall (y), d deep (z)
  const B = (w, h, d) => new T.BoxGeometry(w, h, d);
  // C(rt, rb, h, ...): a cylinder with top radius rt, bottom radius rb, height h,
  // s round segments (smoothness), open = no end caps, ts/tl = start angle and
  // length of the arc (for partial cylinders such as curved walls)
  const C = (rt, rb, h, s = 20, open = false, ts = 0, tl = PI * 2) => new T.CylinderGeometry(rt, rb, h, s, 1, open, ts, tl);
  // S(r, ...): a sphere of radius r; ws/hs are the number of segments (smoothness)
  const S = (r, ws = 16, hs = 12) => new T.SphereGeometry(r, ws, hs);

  // plane(w, h, m, x, y, z, ry): a flat w-by-h rectangle (great for signs and
  // windows), placed at (x, y, z) and turned ry radians around the vertical
  // y axis. A plane faces +z by default, so ry = PI / 2 makes it face +x.
  function plane(w, h, m, x, y, z, ry = 0) {
    // PlaneGeometry is a flat rectangle shape
    const p = new T.Mesh(new T.PlaneGeometry(w, h), m);
    // place the plane
    p.position.set(x, y, z);
    // turn it to face the right direction
    p.rotation.y = ry;
    return p;
  }

  // rod(a, b, r, m): a thin cylinder of radius r stretched from point a to
  // point b (both Vector3 points). Used for the Link Bridge cables. Returns the mesh.
  function rod(a, b, r, m) {
    // d = the direction (and distance) from a to b
    const d = new T.Vector3().subVectors(b, a);
    // how long the rod must be
    const len = d.length();
    // a 6-sided cylinder, standing upright by default
    const me = new T.Mesh(C(r, r, len, 6), m);
    // put its centre halfway between a and b
    me.position.copy(a).addScaledVector(d, 0.5);
    // tilt it so its upright (0,1,0) axis points along d (a quaternion stores a rotation)
    me.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    return me;
  }

  /* Box whose UVs are scaled to world size so window textures tile instead of stretching */
  // boxUV(wx, hy, dz, unit): a box geometry whose texture repeats once every
  // 'unit' world units. Normally a texture stretches over a whole face; here
  // a tall building simply gets more rows of windows. Returns the geometry.
  function boxUV(wx, hy, dz, unit) {
    // start with a normal box
    const g = new T.BoxGeometry(wx, hy, dz);
    // UVs say which part of the texture appears at each corner of each face
    const uv = g.attributes.uv;
    // a box has 6 faces: +x, -x, +y, -y, +z, -z (in that order)
    for (let f = 0; f < 6; f++) {
      // su, sv = real width and height of the current face
      let su, sv;
      // side faces (x) span depth by height, top/bottom span width by depth, front/back width by height
      if (f < 2) { su = dz; sv = hy; } else if (f < 4) { su = wx; sv = dz; } else { su = wx; sv = hy; }
      // each face has 4 corners (vertices)
      for (let i = 0; i < 4; i++) {
        // index of this corner in the UV list
        const k = f * 4 + i;
        // scale the texture coordinates by face size / unit so the pattern tiles
        uv.setXY(k, uv.getX(k) * su / unit, uv.getY(k) * sv / unit);
      }
    }
    return g;
  }

  // canvasTex(w, h, draw, repeat): makes a texture (an image wrapped onto a 3D
  // surface) by drawing on a hidden w-by-h HTML canvas. 'draw' is a function
  // that paints with the 2D canvas API. If repeat is true the image can tile.
  // Returns a CanvasTexture.
  function canvasTex(w, h, draw, repeat) {
    // an off-screen canvas, never added to the page
    const c = document.createElement('canvas');
    // its size in pixels
    c.width = w; c.height = h;
    // let the caller paint on it (gets the 2D pen, width and height)
    draw(c.getContext('2d'), w, h);
    // CanvasTexture turns the canvas picture into a texture Three.js can use
    const t = new T.CanvasTexture(c);
    // sRGB colour encoding keeps canvas colours looking correct in 3D
    t.encoding = T.sRGBEncoding;
    // keeps the texture sharp when seen at a steep angle
    t.anisotropy = 4;
    // allow the texture to repeat horizontally (S) and vertically (T)
    if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
    return t;
  }

  // textTex(text, o): a texture showing text, used for shop signs, billboards
  // and plaques. '\n' in the text starts a second, smaller line. Options in o:
  // w/h size, bg background colour, fg text colour, border, size, weight, subScale.
  function textTex(text, o = {}) {
    // canvas size, default 512 x 128 pixels
    const w = o.w || 512, h = o.h || 128;
    // draw the sign onto a new canvas texture
    return canvasTex(w, h, (g) => {
      // optional solid background colour
      if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, w, h); }
      // optional outline drawn just inside the edges
      if (o.border) { g.strokeStyle = o.border; g.lineWidth = o.borderW || 10; g.strokeRect(5, 5, w - 10, h - 10); }
      // text colour (white by default), centred horizontally and vertically
      g.fillStyle = o.fg || '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      // split the text into separate lines
      const lines = String(text).split('\n');
      // font size for the first line, sized to fit the canvas height
      const base = o.size || Math.floor(h / (lines.length + 0.5));
      // draw each line
      lines.forEach((ln, i) => {
        // the first line is big; later lines are smaller (subScale)
        let size = i === 0 ? base : Math.floor(base * (o.subScale || 0.62));
        // e.g. '800 64px Plus Jakarta Sans' (800 = bold weight)
        g.font = `${o.weight || 800} ${size}px ${FONT}`;
        // measure how wide the text would be
        const mw = g.measureText(ln).width;
        // if it is wider than 90% of the canvas, shrink the font to fit
        if (mw > w * 0.9) { size = Math.floor(size * (w * 0.9) / mw); g.font = `${o.weight || 800} ${size}px ${FONT}`; }
        // vertical position: centred for one line, otherwise spread out
        const y = lines.length === 1 ? h / 2 : h * (i + 0.5) / lines.length + (i === 0 ? h * 0.04 : -h * 0.02);
        // paint the text in the centre
        g.fillText(ln, w / 2, y);
      });
    });
  }

  /* ---------------- shared textures + materials (lazy) ---------------- */
  // cache for the shared textures/materials below; null until first needed
  let _tex = null;
  // tex(): creates (only once, the first time it's called) all the textures and
  // materials shared by many models, and returns them in one object X.
  // Sharing saves memory: 100 buildings can reuse one window texture.
  function tex() {
    // already built? just hand back the cached set
    if (_tex) return _tex;
    // X collects every shared texture and material
    const X = {};

    // building wall texture: a 4 x 4 grid of windows on a white wall (tiles via boxUV)
    X.windows = canvasTex(512, 512, (g, w) => {
      // white wall background (tinted by the building's colour)
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, w);
      // r = row, c = column of each window cell (128 px each)
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        // top-left pixel of this window cell
        const x = c * 128, y = r * 128;
        // light grey window frame
        g.fillStyle = '#d6d2cb'; g.fillRect(x + 18, y + 22, 92, 84);
        // dark blue diagonal gradient for the glass
        const gr = g.createLinearGradient(x, y, x + 128, y + 128);
        gr.addColorStop(0, '#3e5366'); gr.addColorStop(1, '#22303d');
        // fill the glass pane with the gradient
        g.fillStyle = gr; g.fillRect(x + 24, y + 28, 80, 72);
        // a vertical bar splitting the window in two
        g.fillStyle = '#d6d2cb'; g.fillRect(x + 62, y + 28, 4, 72);
        // the window sill underneath
        g.fillStyle = '#bdb8b0'; g.fillRect(x + 14, y + 104, 100, 8);
      }
    }, true);

    // three random 'lit window' maps (black = dark, yellow/blue = light on).
    // Used as emissiveMaps so only some windows glow at night.
    X.lit = [0, 1, 2].map(() => canvasTex(512, 512, (g, w) => {
      // black means 'no glow'
      g.fillStyle = '#000'; g.fillRect(0, 0, w, w);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        // about half of the windows have lights on
        if (Math.random() < 0.5) {
          // mostly warm yellow light, sometimes cool TV-blue
          g.fillStyle = Math.random() < 0.8 ? '#ffd27a' : '#bfe3ff';
          // fill exactly where the glass is in the windows texture
          g.fillRect(c * 128 + 24, r * 128 + 28, 80, 72);
        }
      }
    }, true));

    // blue glass curtain-wall texture with a white grid (for skyscrapers)
    X.glassGrid = canvasTex(256, 256, (g, w) => {
      // light-to-dark blue diagonal sky reflection
      const gr = g.createLinearGradient(0, 0, w, w);
      gr.addColorStop(0, '#9fd3f5'); gr.addColorStop(0.5, '#4f8fc0'); gr.addColorStop(1, '#2c5f8a');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
      // thin semi-transparent white grid lines
      g.strokeStyle = 'rgba(230,245,255,0.55)'; g.lineWidth = 3;
      // draw 5 vertical and 5 horizontal lines, 64 px apart
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, w); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
    }, true);
    // matching night map: random glass panels glow light blue
    X.glassLit = canvasTex(256, 256, (g, w) => {
      // start dark, then light up about 55% of the panels
      g.fillStyle = '#000'; g.fillRect(0, 0, w, w);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (Math.random() < 0.55) { g.fillStyle = '#9fd8ff'; g.fillRect(c * 64 + 3, r * 64 + 3, 58, 58); }
    }, true);
    // shiny glass tower material that glows at night (strength 0.9) and not by day
    X.glassMat = glow(mat(0xffffff, { map: X.glassGrid, metalness: 0.55, roughness: 0.18, emissive: 0x9fd8ff, emissiveMap: X.glassLit }), 0.9, 0);
    // plain blue glass; DoubleSide means both sides of the surface are drawn
    X.glassPlain = mat(0x5f9cc8, { metalness: 0.7, roughness: 0.12, side: T.DoubleSide });
    // dark tinted glass for vehicle windows
    X.darkGlass = mat(0x1d2a35, { roughness: 0.15, metalness: 0.6 });

    // street-lamp bulb: glows strongly at night (2.4), faintly by day (0.15)
    X.lampMat = glow(mat(0xfff3c4, { emissive: 0xffd27a }), 2.4, 0.15);
    // always-glowing orange-red warning light (barriers, gantries)
    X.blinkMat = mat(0xff3d00, { emissive: 0xff3d00, emissiveIntensity: 1.5 });
    // jetpack flame: MeshBasicMaterial ignores lighting; AdditiveBlending adds its
    // colour on top of what's behind it, so it looks like bright fire.
    // depthWrite: false stops see-through flames from hiding objects behind them.
    X.flameMat = new T.MeshBasicMaterial({ color: 0xff7a00, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false });
    // paler yellow inner core of the flame
    X.flameCore = new T.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false });
    // vehicle headlights: bright at night
    X.headlightMat = glow(mat(0xfffbe6, { emissive: 0xfff2b0, metalness: 0.4, roughness: 0.2 }), 2, 0.1);
    // red vehicle tail lights
    X.tailMat = glow(mat(0xc62828, { emissive: 0xff2a2a }), 1.5, 0.2);

    // soft round glow texture used as the pool of lamp light on the road
    const pool = canvasTex(128, 128, (g, w) => {
      // circular gradient: solid warm light in the middle fading to transparent
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,210,130,1)'); gr.addColorStop(1, 'rgba(255,210,130,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
    });
    // transparent light-pool material; invisible by day (opacity 0), half visible at night
    X.poolMat = new T.MeshBasicMaterial({ map: pool, transparent: true, opacity: night ? 0.5 : 0, blending: T.AdditiveBlending, depthWrite: false });

    // lagoon water texture: teal with lots of little white wave strokes
    X.water = canvasTex(256, 256, (g, w) => {
      // base water colour
      g.fillStyle = '#2f7486'; g.fillRect(0, 0, w, w);
      // draw 140 random ripples
      for (let i = 0; i < 140; i++) {
        // a random pale, mostly transparent white-blue
        g.strokeStyle = `rgba(${200 + ri(0, 55)},${230 + ri(0, 25)},255,${rnd(0.08, 0.3)})`;
        // random ripple thickness
        g.lineWidth = rnd(1, 2.5);
        // random ripple position and length
        const x = rnd(0, w), y = rnd(0, w), l = rnd(8, 30);
        // draw a small curved stroke (a wave crest)
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 3, x + l, y); g.stroke();
      }
    }, true);
    // tile the water texture 30 x 30 times over big water planes
    X.water.repeat.set(30, 30);
    // slightly shiny water material
    X.waterMat = mat(0xffffff, { map: X.water, roughness: 0.25, metalness: 0.35 });

    // the classic danfo bus side slogan, drawn as black text on a transparent canvas
    X.slogan = canvasTex(1024, 96, (g, w, h) => {
      // near-black, centred text
      g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `900 64px ${FONT}`; g.fillText('NO CONDITION IS PERMANENT', w / 2, h / 2 + 4);
    });
    // transparent: true lets the empty parts of the slogan canvas show the bus behind
    X.sloganMat = new T.MeshStandardMaterial({ map: X.slogan, transparent: true, roughness: 0.6 });
    // danfo destination sign 'OSHODI • CMS' in amber on black, glows at night
    X.destMat = glow(new T.MeshStandardMaterial({ map: textTex('OSHODI • CMS', { bg: '#111', fg: '#ffb300', w: 512, h: 96 }), emissive: 0xffffff }), 0.6, 0);
    // emissiveMap = the sign image itself, so the letters glow in their own colours
    X.destMat.emissiveMap = X.destMat.map;
    // 'LAGOS BRT' white lettering for the bus sides
    X.brtMat = new T.MeshStandardMaterial({ map: textTex('LAGOS BRT', { fg: '#ffffff', w: 512, h: 128 }), transparent: true });
    // BRT front destination display 'TBS ⇄ IKORODU'
    X.brtDestMat = glow(new T.MeshStandardMaterial({ map: textTex('TBS ⇄ IKORODU', { bg: '#0b0b0b', fg: '#ff9800', w: 512, h: 96 }) }), 0.8, 0.1);
    // emissive colour white x the sign image = the sign lights up as drawn
    X.brtDestMat.emissive = new T.Color(0xffffff); X.brtDestMat.emissiveMap = X.brtDestMat.map;

    // red-and-white diagonal stripes for road barriers
    X.stripes = canvasTex(256, 64, (g, w, h) => {
      // white background
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      // red stripes
      g.fillStyle = '#e53935';
      // each stripe is a slanted four-sided shape (parallelogram)
      for (let i = -2; i < 10; i++) { g.beginPath(); g.moveTo(i * 32, h); g.lineTo(i * 32 + 16, h); g.lineTo(i * 32 + 32, 0); g.lineTo(i * 32 + 16, 0); g.fill(); }
    });
    // material using the stripes
    X.stripeMat = mat(0xffffff, { map: X.stripes, roughness: 0.5 });
    // yellow-and-black hazard stripes (BRT roof edges, gantry, ramp edges)
    X.hazard = canvasTex(256, 32, (g, w, h) => {
      // yellow background
      g.fillStyle = '#ffcc00'; g.fillRect(0, 0, w, h);
      // black slanted stripes
      g.fillStyle = '#111';
      for (let i = -1; i < 12; i++) { g.beginPath(); g.moveTo(i * 24, h); g.lineTo(i * 24 + 12, h); g.lineTo(i * 24 + 24, 0); g.lineTo(i * 24 + 12, 0); g.fill(); }
    });
    // material using the hazard stripes
    X.hazardMat = mat(0xffffff, { map: X.hazard });
    // red overhead gantry sign with the Lagos slogan in Yoruba and pidgin
    X.ekoSign = glow(new T.MeshStandardMaterial({ map: textTex('ÈKÓ Ò NÍ BÀJẸ́\nLagos no go spoil', { bg: '#e8173f', fg: '#fff', w: 512, h: 256 }), roughness: 0.5, emissive: 0xffffff }), 0.55, 0);
    // make the sign glow using its own picture
    X.ekoSign.emissiveMap = X.ekoSign.map;

    // coin face: golden radial gradient with a ring and the Naira sign
    X.coinFaceTex = canvasTex(128, 128, (g, w) => {
      // bright gold centre fading to deeper gold at the rim
      const gr = g.createRadialGradient(w / 2, w / 2, 10, w / 2, w / 2, w / 2);
      gr.addColorStop(0, '#ffe57a'); gr.addColorStop(1, '#e0a400');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
      // darker gold ring near the edge
      g.strokeStyle = '#b07d00'; g.lineWidth = 8; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 12, 0, PI * 2); g.stroke();
      // big centred Naira symbol
      g.fillStyle = '#9a6a00'; g.font = `900 72px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('₦', w / 2, w / 2 + 4);
    });
    // coin face material: metallic and slightly self-lit so coins always look shiny
    X.coinFace = new T.MeshStandardMaterial({ map: X.coinFaceTex, metalness: 0.5, roughness: 0.3, emissive: 0x8a6000, emissiveIntensity: 0.8 });
    // plain gold for the coin's rim
    X.coinSide = new T.MeshStandardMaterial({ color: 0xffc400, metalness: 0.6, roughness: 0.3, emissive: 0x8a6000, emissiveIntensity: 0.8 });

    // shop signs: [name, subtitle, background colour]
    const SHOPS = [
      ['MAMA PUT', 'Amala • Ewedu • Gbegiri', '#c62828'], ['SUYA SPOT', 'Hot suya every night', '#e65100'],
      ['POS HERE', 'Withdrawal • Transfer', '#1565c0'], ['FRESH CUTZ', 'Barbing salon', '#2e7d32'],
      ["GOD'S TIME STORES", 'Provisions • Wholesale', '#6a1b9a'], ['ÈKÓ PHONES', 'Accessories & repairs', '#00838f'],
      ['BUKA 24/7', 'Jollof • Dodo • Turkey', '#ad1457'], ['BALOGUN FABRICS', 'Ankara • Lace • Aso-oke', '#ef6c00'],
    ];
    // turn each shop into a glowing sign material
    X.shopMats = SHOPS.map(([t, s, c]) => {
      // two-line text sign on the shop's colour
      const m = new T.MeshStandardMaterial({ map: textTex(`${t}\n${s}`, { bg: c, fg: '#fff', w: 512, h: 128 }), roughness: 0.6, emissive: 0xffffff });
      // let the sign glow using its own image
      m.emissiveMap = m.map;
      // glows at night only
      return glow(m, 0.6, 0);
    });
    // billboard adverts: [headline, subtitle, background colour]
    const ADS = [
      ['ÈKÓ Ò NÍ BÀJẸ́', 'Lagos will not spoil', '#ff385c'], ['EKO RUSH', 'Run the city. Dodge the danfo.', '#222222'],
      ['JOLLOF FEST', 'Live at TBS • This December', '#e65100'], ['KEEP LAGOS CLEAN', 'Every Saturday, sweep your front', '#2e7d32'],
      ['AFROBEATS LIVE', 'Onikan • Friday night', '#4527a0'], ['THIRD MAINLAND', 'Expect traffic. Bring patience.', '#00796b'],
    ];
    // turn each advert into a big bordered glowing billboard material
    X.adMats = ADS.map(([t, s, c]) => {
      // 1024 x 512 canvas with a white border
      const m = new T.MeshStandardMaterial({ map: textTex(`${t}\n${s}`, { bg: c, fg: '#fff', w: 1024, h: 512, border: '#ffffff' }), roughness: 0.5, emissive: 0xffffff });
      // glow using the advert picture
      m.emissiveMap = m.map;
      // bright at night, off by day
      return glow(m, 0.75, 0);
    });

    // market umbrella materials: four colour pairs painted as alternating stripes
    X.umbrellaMats = [['#ff385c', '#ffffff'], ['#ffb400', '#1b5e20'], ['#00a699', '#ffffff'], ['#3f51b5', '#ffeb3b']].map(([a, b]) =>
      new T.MeshStandardMaterial({
        // visible from inside and outside the umbrella cone
        side: T.DoubleSide, roughness: 0.7,
        // 8 vertical stripes alternating colour a and b
        map: canvasTex(256, 32, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * 32, 0, 32, h); } }),
      }));

    // save to the cache so the next tex() call is instant
    _tex = X;
    return X;
  }

  // ankaraTex(cols): a repeating ankara (African wax print) fabric pattern.
  // cols = 4 CSS colours [background, big circle, small circle, diamond].
  // Returns a tiling CanvasTexture used for shirts and the gele head-tie.
  function ankaraTex(cols) {
    return canvasTex(128, 128, (g, w) => {
      // background colour
      g.fillStyle = cols[0]; g.fillRect(0, 0, w, w);
      // a 4 x 4 grid of motifs, each 32 px
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        // centre of this motif
        const cx = x * 32 + 16, cy = y * 32 + 16;
        // small diamond at the corner of each cell
        g.fillStyle = cols[3];
        g.beginPath(); g.moveTo(x * 32, y * 32 - 6); g.lineTo(x * 32 + 6, y * 32); g.lineTo(x * 32, y * 32 + 6); g.lineTo(x * 32 - 6, y * 32); g.fill();
        // three circles inside each other make a bullseye motif
        g.fillStyle = cols[1]; g.beginPath(); g.arc(cx, cy, 11, 0, PI * 2); g.fill();
        g.fillStyle = cols[2]; g.beginPath(); g.arc(cx, cy, 6, 0, PI * 2); g.fill();
        g.fillStyle = cols[0]; g.beginPath(); g.arc(cx, cy, 2.5, 0, PI * 2); g.fill();
      }
    }, true);
  }

  // plaque(text, w, h, bg): a roadside name board on two posts, used to label
  // landmarks. w = board width, h = height, bg = colour. Faces +x (the road).
  // Returns a Group.
  function plaque(text, w = 7, h = 1.8, bg = '#ff385c') {
    // Group: an invisible container; everything added to it moves together
    const g = new T.Group();
    // dark grey metal for the posts
    const post = mat(0x3a3a3a, { metalness: 0.4 });
    // left and right posts, 2.6 tall, near each end of the board
    g.add(mesh(C(0.09, 0.09, 2.6, 8), post, 0, 1.3, -w / 2 + 0.4));
    g.add(mesh(C(0.09, 0.09, 2.6, 8), post, 0, 1.3, w / 2 - 0.4));
    // the dark backing board above the posts
    g.add(mesh(B(0.18, h, w), mat(0x1c1c1c), 0, 2.4 + h / 2 - 0.3, 0));
    // the text face, sized to match the board's shape
    const m = new T.MeshStandardMaterial({ map: textTex(text, { bg, fg: '#fff', w: 1024, h: Math.round(1024 * h / w) }), roughness: 0.5, emissive: 0xffffff });
    // make the text glow at night
    m.emissiveMap = m.map;
    glow(m, 0.7, 0);
    // stick the text just in front of the board, turned to face +x
    g.add(plane(w - 0.2, h - 0.2, m, 0.1, 2.4 + h / 2 - 0.3, 0, PI / 2));
    return g;
  }

  /* ================= STREET FURNITURE ================= */
  // paint colours for ordinary buildings (cream, ochre, terracotta, mint...)
  const BUILD_COLORS = [0xf2e3c6, 0xe8c07a, 0xd98e5f, 0xa8c69f, 0xf0d9a8, 0xc9d6df, 0xe6a6a1, 0xfafafa, 0xd4b483, 0x9fb7c9, 0xf6c6a8];
  // colours for shop awnings
  const AWNINGS = [0xff385c, 0x1e88e5, 0x43a047, 0xfdd835, 0x8e24aa, 0xfb8c00];

  /* Generic Lagos building – road-facing side is +X */
  // createBuilding(o): a random Lagos shop-house/apartment block. Options in o:
  // len (along the road, z), depth (x), floors, color, shop (false = no shop).
  // Returns a Group; userData holds { len, depth, h } for placing it.
  function createBuilding(o = {}) {
    // get the shared textures
    const X = tex();
    // use given sizes or pick random ones
    const len = o.len || rnd(7, 13), depth = o.depth || rnd(7, 11), floors = o.floors || ri(2, 7);
    // each floor is 3 units tall, plus a little roof slab
    const h = floors * 3 + 0.6;
    // wall material: window texture, tinted colour, random lit-window glow at night
    const wall = glow(mat(o.color || pick(BUILD_COLORS), { map: X.windows, emissive: 0xffcf7a, emissiveMap: pick(X.lit) }), 1, 0);
    // plain grey concrete for the flat roof
    const roof = mat(0x9a948c, { roughness: 0.95 });
    // container for the whole building
    const g = new T.Group();
    // the main block; an array of 6 materials gives each box face its own
    // (order +x, -x, +y top, -y bottom, +z, -z): walls on the sides, roof on top/bottom
    g.add(mesh(boxUV(depth, h, len, 12), [wall, wall, roof, roof, wall, wall], 0, h / 2, 0));
    // a slightly wider parapet slab around the roof edge
    g.add(mesh(B(depth + 0.2, 0.4, len + 0.2), mat(0xe8e2d6), 0, h + 0.2, 0));
    // black plastic water tanks, a common Lagos rooftop sight
    const tankM = mat(0x1d1d1d, { roughness: 0.5 });
    // 1 to 3 tanks at random roof spots
    for (let i = 0, n = ri(1, 3); i < n; i++) {
      // random position on the roof, kept away from the edges
      const tx = rnd(-depth / 2 + 1.2, depth / 2 - 1.2), tz = rnd(-len / 2 + 1.2, len / 2 - 1.2);
      // grey stand the tank sits on
      g.add(mesh(B(1.5, 0.6, 1.5), mat(0x777777), tx, h + 0.7, tz));
      // the round tank itself
      g.add(mesh(C(0.65, 0.65, 1.4, 16), tankM, tx, h + 1.7, tz));
    }
    // 40% of buildings get a satellite dish
    if (Math.random() < 0.4) {
      // a shallow sphere slice (only the top third) makes a dish shape on the road-side roof edge
      const dish = mesh(new T.SphereGeometry(0.5, 12, 8, 0, PI * 2, 0, PI / 3), mat(0xeeeeee, { side: T.DoubleSide }), depth / 2 - 0.8, h + 1.1, rnd(-len / 3, len / 3));
      // tilt the dish (about 57 degrees) to point at the sky
      dish.rotation.z = -1; g.add(dish);
    }
    // sx = x of the road-facing wall (+x side)
    const sx = depth / 2;
    // most buildings get a ground-floor shop front
    if (o.shop !== false && Math.random() < 0.8) {
      // coloured awning sticking out over the pavement
      const awn = mesh(B(1.4, 0.12, len * 0.85), mat(pick(AWNINGS)), sx + 0.65, 3.0, 0);
      // slope the awning down towards the road
      awn.rotation.z = -0.2; g.add(awn);
      // random shop sign just above the awning, facing the road
      g.add(plane(len * 0.8, 1.1, pick(X.shopMats), sx + 0.03, 3.8, 0, PI / 2));
      // dark open shop entrance at ground level
      g.add(plane(len * 0.7, 2.5, mat(0x2a2522), sx + 0.02, 1.25, 0, PI / 2));
    }
    // some taller buildings get a column of balconies
    if (floors >= 3 && Math.random() < 0.6) {
      // balcony colour and a random position along the wall
      const bm = mat(0xdedad2), bz = rnd(-len / 4, len / 4);
      // one balcony per upper floor
      for (let f = 1; f < floors; f++) {
        // balcony floor slab
        g.add(mesh(B(0.9, 0.12, len * 0.45), bm, sx + 0.45, f * 3 + 0.1, bz));
        // dark railing along its outer edge
        g.add(mesh(B(0.06, 0.8, len * 0.45), mat(0x444444), sx + 0.88, f * 3 + 0.55, bz));
      }
    }
    // up to 3 air-conditioner boxes on random floors
    for (let i = 0, n = ri(0, 3); i < n; i++) {
      g.add(mesh(B(0.5, 0.45, 0.8), mat(0xe0e0e0), sx + 0.25, ri(1, floors - 1) * 3 + 1.4, rnd(-len / 2 + 1, len / 2 - 1)));
    }
    // remember the size so the game can line buildings up along the street
    g.userData = { len, depth, h };
    return g;
  }

  /* Street lamp – arm points to +X */
  // createLamp(): a street lamp, 6.6 tall, whose arm reaches towards +x with a
  // bulb and a pool of light on the ground beneath it. Returns a Group.
  function createLamp() {
    const X = tex();
    const g = new T.Group();
    // metallic grey for pole, arm and lamp head
    const pole = mat(0x55595f, { metalness: 0.5, roughness: 0.4 });
    // tapered pole (thinner at the top), centred at half its height
    g.add(mesh(C(0.08, 0.13, 6.6, 8), pole, 0, 3.3, 0));
    // horizontal arm at the top
    g.add(mesh(B(1.7, 0.08, 0.08), pole, 0.8, 6.5, 0));
    // lamp head at the end of the arm
    g.add(mesh(B(0.65, 0.16, 0.32), pole, 1.6, 6.45, 0));
    // glowing bulb strip under the head (no shadow, it's the light source)
    const bulb = new T.Mesh(B(0.5, 0.05, 0.22), X.lampMat);
    // just below the lamp head
    bulb.position.set(1.6, 6.35, 0);
    g.add(bulb);
    // 7 x 7 light-pool on the ground (only visible at night)
    const pool = new T.Mesh(new T.PlaneGeometry(7, 7), X.poolMat);
    // rotate -90 degrees so the plane lies flat on the ground
    pool.rotation.x = -PI / 2;
    // right under the bulb, slightly above the road to avoid flicker
    pool.position.set(1.6, 0.22, 0);
    // draw it after the road so it blends on top
    pool.renderOrder = 2;
    g.add(pool);
    return g;
  }

  // createPalm(h): a palm tree of height h (random 5 - 8.5 if not given) with a
  // slightly leaning trunk, 9 drooping leaves and coconuts. Returns a Group.
  function createPalm(h = rnd(5, 8.5)) {
    const g = new T.Group();
    // brown, fully rough bark
    const trunkM = mat(0x8a6a48, { roughness: 1 });
    // green leaves, visible from both sides
    const leafM = mat(0x2f8f3a, { roughness: 0.8, side: T.DoubleSide });
    // trunk is built from 6 stacked pieces; lean = random tilt per piece
    const segs = 6, lean = rnd(-0.08, 0.08);
    // running position of the top of the trunk
    let x = 0, y = 0;
    // stack the trunk segments
    for (let i = 0; i < segs; i++) {
      // height of one segment
      const sh = h / segs;
      // each segment slightly thinner than the one below
      const seg = mesh(C(0.15 - i * 0.012, 0.2 - i * 0.012, sh * 1.02, 8), trunkM, x, y + sh / 2, 0);
      // tilt more the higher it goes, so the trunk curves
      seg.rotation.z = -lean * (i + 1) * 0.5;
      g.add(seg);
      // move up, and sideways by the amount of lean
      y += sh; x += Math.sin(lean * (i + 1) * 0.5) * sh;
    }
    // a sub-group at the top of the trunk that holds the leaves
    const crown = new T.Group();
    crown.position.set(x, y, 0);
    g.add(crown);
    // one leaf shape: a 4-sided cone 3 long, turned to lie along z and squashed flat
    const leafG = new T.ConeGeometry(0.42, 3, 4);
    // point the cone forward (along z) instead of up
    leafG.rotateX(PI / 2);
    // flatten it vertically to 12% so it looks like a blade
    leafG.scale(1, 0.12, 1);
    // 9 leaves around the crown
    for (let i = 0; i < 9; i++) {
      // yaw group spins each leaf to its own direction around the tree
      const yaw = new T.Group(); yaw.rotation.y = (i / 9) * PI * 2 + rnd(-0.2, 0.2);
      // droop group tilts the leaf downwards a random amount
      const droop = new T.Group(); droop.rotation.x = 0.35 + rnd(0, 0.45);
      // offset 1.4 forward so the leaf starts at the crown and hangs outwards
      const leaf = mesh(leafG, leafM, 0, 0, 1.4);
      // nest: crown > yaw > droop > leaf
      droop.add(leaf); yaw.add(droop); crown.add(yaw);
    }
    // brown coconuts
    const nutM = mat(0x5d4023);
    // three coconuts in a small ring under the leaves
    for (let i = 0; i < 3; i++) crown.add(mesh(S(0.16, 8, 6), nutM, Math.sin(i * 2.1) * 0.22, -0.2, Math.cos(i * 2.1) * 0.22));
    return g;
  }

  // createStall(): a roadside market table with fruit and a striped umbrella.
  // Returns a Group.
  function createStall() {
    const X = tex();
    const g = new T.Group();
    // brown wood
    const wood = mat(0x8d6e4b);
    // table top at hip height (0.9)
    g.add(mesh(B(1.0, 0.08, 1.7), wood, 0, 0.9, 0));
    // four table legs, one per corner
    [[-0.42, -0.75], [0.42, -0.75], [-0.42, 0.75], [0.42, 0.75]].forEach(([x, z]) => g.add(mesh(B(0.06, 0.9, 0.06), wood, x, 0.45, z)));
    // colours for tomatoes, oranges, peppers, plantain...
    const goods = [0xe53935, 0xff9800, 0x43a047, 0xfdd835];
    // 9 small balls of produce scattered on the table
    for (let i = 0; i < 9; i++) g.add(mesh(S(0.11, 8, 6), mat(pick(goods)), rnd(-0.35, 0.35), 1.02, rnd(-0.7, 0.7)));
    // umbrella pole
    g.add(mesh(C(0.03, 0.03, 2.2, 6), mat(0x555555), 0, 1.6, 0));
    // umbrella: an open cone (no base) with a random striped material
    const um = new T.Mesh(new T.ConeGeometry(1.3, 0.55, 8, 1, true), pick(X.umbrellaMats));
    // raise it to the top of the pole
    um.position.y = 2.6; um.castShadow = true;
    g.add(um);
    return g;
  }

  // createBillboard(side): a big advert board on two steel legs, about 11 tall.
  // side < 0 means it stands on the left of the road; it is angled to face
  // oncoming players. Returns a Group.
  function createBillboard(side) {
    const X = tex();
    const g = new T.Group();
    // grey metal legs
    const steel = mat(0x4b4f55, { metalness: 0.5, roughness: 0.4 });
    // two 8-tall legs, 4 apart
    g.add(mesh(C(0.15, 0.2, 8, 8), steel, 0, 4, -2));
    g.add(mesh(C(0.15, 0.2, 8, 8), steel, 0, 4, 2));
    // dark frame of the board
    g.add(mesh(B(0.3, 3.4, 6.6), mat(0x222222), 0, 9.4, 0));
    // random advert picture on the +x face of the frame
    g.add(plane(6.3, 3.1, pick(X.adMats), 0.16, 9.4, 0, PI / 2));
    // turn the board towards the road depending on which side it stands
    g.rotation.y = side < 0 ? -0.6 : PI + 0.6;
    return g;
  }

  /* ================= VEHICLES & OBSTACLES (front faces +Z) ================= */
  // wheel(r, w, x, y, z): a tyre of radius r and width w with a silver hub,
  // positioned at (x, y, z). Shared by all vehicles. Returns a Group.
  function wheel(r, w, x, y, z) {
    const g = new T.Group();
    // black rubber tyre (a short wide cylinder)
    const t = mesh(C(r, r, w, 18), mat(0x111111, { roughness: 0.9 }), 0, 0, 0);
    // cylinders stand upright; turn 90 degrees so the wheel rolls along z
    t.rotation.z = PI / 2; g.add(t);
    // smaller shiny metal hub, a little wider so it pokes out of the tyre
    const hub = mesh(C(r * 0.5, r * 0.5, w + 0.02, 12), mat(0xc8cdd2, { metalness: 0.8, roughness: 0.3 }), 0, 0, 0);
    // turn the hub the same way as the tyre
    hub.rotation.z = PI / 2; g.add(hub);
    // put the whole wheel where the vehicle needs it
    g.position.set(x, y, z);
    return g;
  }

  // createDanfo(): the iconic yellow Lagos danfo minibus with black stripes,
  // 4.6 long and 1.9 wide, facing +z. Returns a Group; userData gives its
  // length, roof height and width for collisions.
  function createDanfo() {
    const X = tex();
    const g = new T.Group();
    // danfo yellow paint, a little glossy
    const yellow = mat(0xffc20e, { roughness: 0.45, metalness: 0.15 });
    // black for stripes and bumpers
    const black = mat(0x151515);
    // shiny metal for the front logo
    const chrome = mat(0xcfd4d8, { metalness: 0.8, roughness: 0.3 });
    // L = length, W = width of the bus
    const L = 4.6, W = 1.9;
    // lower yellow body, 1.0 tall, centred 0.85 up (above the wheels)
    g.add(mesh(B(W, 1.0, L), yellow, 0, 0.85, 0));
    // upper cabin, slightly narrower and shorter
    g.add(mesh(B(W - 0.06, 0.72, L - 0.25), yellow, 0, 1.71, -0.05));
    // thin roof cap
    g.add(mesh(B(W - 0.18, 0.08, L - 0.5), yellow, 0, 2.11, -0.05));
    // for each side of the bus (s = -1 left, +1 right):
    [-1, 1].forEach((s) => {
      // long strip of dark side windows
      g.add(mesh(B(0.02, 0.48, L - 0.7), X.darkGlass, s * ((W - 0.06) / 2 + 0.011), 1.74, -0.1));
      // the 'NO CONDITION IS PERMANENT' slogan on the body, facing outwards
      const p = plane(3.4, 0.28, X.sloganMat, s * (W / 2 + 0.012), 0.84, 0, s * PI / 2);
      g.add(p);
    });
    // windscreen at the front (+z)
    g.add(mesh(B(W - 0.3, 0.5, 0.02), X.darkGlass, 0, 1.74, 2.14));
    // rear window at the back (-z)
    g.add(mesh(B(W - 0.3, 0.45, 0.02), X.darkGlass, 0, 1.74, -2.24));
    // two black stripes wrapped around the body
    [0.62, 1.05].forEach((y) => g.add(mesh(B(W + 0.02, 0.07, L + 0.02), black, 0, y, 0)));
    // left and right lights:
    [-1, 1].forEach((s) => {
      // round headlight (a thin cylinder)
      const hl = new T.Mesh(C(0.13, 0.13, 0.05, 16), X.headlightMat);
      // turn it to face forward and place it on the front
      hl.rotation.x = PI / 2; hl.position.set(s * 0.62, 0.8, L / 2 + 0.02); g.add(hl);
      // red tail light on the back
      g.add(mesh(B(0.18, 0.22, 0.04), X.tailMat, s * 0.75, 0.9, -L / 2 - 0.02));
    });
    // front and rear bumpers
    g.add(mesh(B(W + 0.1, 0.16, 0.18), black, 0, 0.42, L / 2 + 0.05));
    g.add(mesh(B(W + 0.1, 0.16, 0.18), black, 0, 0.42, -L / 2 - 0.05));
    // round chrome badge on the front
    const logo = mesh(C(0.17, 0.17, 0.04, 20), chrome, 0, 1.12, L / 2 + 0.02);
    // face it forward
    logo.rotation.x = PI / 2; g.add(logo);
    // black box above the windscreen for the destination sign
    g.add(mesh(B(1.3, 0.34, 0.08), black, 0, 2.32, 1.85));
    // glowing 'OSHODI • CMS' sign on that box
    g.add(plane(1.2, 0.26, X.destMat, 0, 2.32, 1.9));
    // roof rack for luggage
    g.add(mesh(B(1.5, 0.06, 2.6), black, 0, 2.2, -0.6));
    // four wheels: [side, z position] for front-left, front-right, back-left, back-right
    [[-1, 1.45], [1, 1.45], [-1, -1.45], [1, -1.45]].forEach(([s, z]) => g.add(wheel(0.36, 0.26, s * (W / 2 - 0.05), 0.36, z)));
    // size info used by the game for collisions and landing on the roof
    g.userData = { len: L, top: 2.15, width: W };
    return g;
  }

  // createBRT(): a blue-and-white Lagos BRT bus, 10 long and 2.35 wide,
  // facing +z. Returns a Group with size info in userData.
  function createBRT() {
    const X = tex();
    const g = new T.Group();
    // length and width
    const L = 10, W = 2.35;
    // colour scheme: blue lower body, white upper body, red stripe
    const blue = mat(0x1b5fb8, { roughness: 0.4, metalness: 0.2 });
    const white = mat(0xf4f6f8, { roughness: 0.4 });
    const red = mat(0xe53935);
    // blue lower half
    g.add(mesh(B(W, 1.2, L), blue, 0, 1.0, 0));
    // white upper half sitting on top
    g.add(mesh(B(W, 1.35, L), white, 0, 2.275, 0));
    // roof slab
    g.add(mesh(B(W - 0.1, 0.1, L - 0.2), white, 0, 3.0, 0));
    // red stripe where blue meets white
    g.add(mesh(B(W + 0.02, 0.18, L + 0.02), red, 0, 1.6, 0));
    // red strip down the middle of the roof
    g.add(mesh(B(0.4, 0.04, L - 0.6), red, 0, 3.06, 0));
    // hazard-striped roof edges on both sides
    [-1, 1].forEach((s) => g.add(mesh(B(0.16, 0.05, L - 0.3), X.hazardMat, s * (W / 2 - 0.14), 3.07, 0)));
    // hazard stripe across the front of the roof
    g.add(mesh(B(W - 0.3, 0.05, 0.16), X.hazardMat, 0, 3.07, L / 2 - 0.2));
    // for each side (s = -1 left, +1 right):
    [-1, 1].forEach((s) => {
      // long row of dark side windows
      g.add(mesh(B(0.02, 1.0, L - 1.2), X.darkGlass, s * (W / 2 + 0.01), 2.25, -0.2));
      // 'LAGOS BRT' lettering on the blue panel
      g.add(plane(2.6, 0.65, X.brtMat, s * (W / 2 + 0.012), 1.0, 1.4, s * PI / 2));
      // rectangular headlight
      const hl = new T.Mesh(B(0.35, 0.16, 0.04), X.headlightMat);
      // on the front corners
      hl.position.set(s * 0.82, 0.85, L / 2 + 0.02); g.add(hl);
      // square tail light on the back
      g.add(mesh(B(0.3, 0.3, 0.04), X.tailMat, s * 0.9, 1.0, -L / 2 - 0.02));
    });
    // big front windscreen
    g.add(mesh(B(W - 0.2, 1.1, 0.02), X.darkGlass, 0, 2.1, L / 2 + 0.01));
    // glowing destination display above the windscreen
    g.add(plane(1.9, 0.3, X.brtDestMat, 0, 2.82, L / 2 + 0.02));
    // front bumper
    g.add(mesh(B(W + 0.06, 0.3, 0.16), mat(0x222222), 0, 0.45, L / 2 + 0.04));
    // four large wheels
    [[-1, 3.3], [1, 3.3], [-1, -3.3], [1, -3.3]].forEach(([s, z]) => g.add(wheel(0.5, 0.32, s * (W / 2 - 0.12), 0.5, z)));
    g.userData = { len: L, top: 3.05, width: W };
    return g;
  }

  // createKeke(): a keke napep tricycle (yellow with a green stripe and black
  // canvas roof), 2.6 long, facing +z: one front wheel, two rear wheels.
  // Returns a Group with size info in userData.
  function createKeke() {
    const X = tex();
    const g = new T.Group();
    // length and width
    const L = 2.6, W = 1.35;
    // yellow body, green trim, black canvas
    const yellow = mat(0xffd000, { roughness: 0.45, metalness: 0.1 });
    const green = mat(0x1e8e3e);
    const canvas = mat(0x1a1a1a, { roughness: 1 });
    // main yellow tub of the body
    g.add(mesh(B(W, 0.55, L), yellow, 0, 0.6, 0));
    // raised front nose where the driver sits
    g.add(mesh(B(W * 0.85, 0.5, 0.5), yellow, 0, 1.1, L / 2 - 0.25));
    // windscreen
    const ws = mesh(B(W * 0.8, 0.5, 0.03), X.darkGlass, 0, 1.55, L / 2 - 0.42);
    // lean it back slightly
    ws.rotation.x = -0.15; g.add(ws);
    // black canvas roof
    g.add(mesh(B(W + 0.06, 0.08, L - 0.2), canvas, 0, 1.75, -0.05));
    // green stripe around the body
    g.add(mesh(B(W + 0.02, 0.08, L + 0.02), green, 0, 0.78, 0));
    // four thin poles holding up the roof, one per corner
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([s, d]) => g.add(mesh(C(0.025, 0.025, 0.9, 6), canvas, s * (W / 2 - 0.03), 1.3, d * (L / 2 - 0.2))));
    // rear canvas panel
    g.add(mesh(B(W - 0.1, 0.5, 0.05), canvas, 0, 1.45, -L / 2 + 0.15));
    // single round headlight in the middle of the front
    const hl = new T.Mesh(C(0.1, 0.1, 0.05, 14), X.headlightMat);
    // face it forward and put it on the nose
    hl.rotation.x = PI / 2; hl.position.set(0, 1.15, L / 2 + 0.01); g.add(hl);
    // one wheel at the front centre
    g.add(wheel(0.25, 0.14, 0, 0.25, L / 2 - 0.3));
    // two wheels at the back, left and right
    g.add(wheel(0.25, 0.14, -W / 2 + 0.02, 0.25, -L / 2 + 0.45));
    g.add(wheel(0.25, 0.14, W / 2 - 0.02, 0.25, -L / 2 + 0.45));
    g.userData = { len: L, top: 1.79, width: W };
    return g;
  }

  // createBarrier(): a low red-and-white striped road barrier with warning
  // lights, 2 wide. Players must jump over it. Returns a Group.
  function createBarrier() {
    const X = tex();
    const g = new T.Group();
    // barrier width (one lane)
    const W = 2.0;
    const grey = mat(0x444444);
    // on both ends:
    [-1, 1].forEach((s) => {
      // upright post
      g.add(mesh(B(0.1, 1.05, 0.1), grey, s * 0.85, 0.525, 0));
      // flat foot that keeps it standing
      g.add(mesh(B(0.14, 0.08, 0.8), grey, s * 0.85, 0.04, 0));
    });
    // upper striped board
    g.add(mesh(B(W, 0.3, 0.08), X.stripeMat, 0, 0.88, 0));
    // lower striped board
    g.add(mesh(B(W, 0.22, 0.08), X.stripeMat, 0, 0.45, 0));
    // orange warning light on top of each post
    [-1, 1].forEach((s) => g.add(mesh(S(0.09, 12, 8), X.blinkMat, s * 0.85, 1.14, 0)));
    g.userData = { len: 0.5, top: 1.05, width: W };
    return g;
  }

  // createGantry(): an overhead sign on two legs that the player must roll
  // (slide) under. Returns a Group; userData.bottom is the gap height.
  function createGantry() {
    const X = tex();
    const g = new T.Group();
    // grey metal
    const grey = mat(0x6b7077, { metalness: 0.4, roughness: 0.4 });
    // two 2.6 tall legs
    [-1, 1].forEach((s) => g.add(mesh(B(0.15, 2.6, 0.15), grey, s * 1.02, 1.3, 0)));
    // the sign box; the slogan shows on its front and back faces (+z / -z)
    g.add(mesh(B(2.15, 1.1, 0.2), [grey, grey, grey, grey, X.ekoSign, X.ekoSign], 0, 1.9, 0));
    // hazard-striped bar along the bottom edge (the duck-under height)
    g.add(mesh(B(2.15, 0.12, 0.22), X.hazardMat, 0, 1.3, 0));
    // warning lights on top of each leg
    [-1, 1].forEach((s) => g.add(mesh(S(0.09, 12, 8), X.blinkMat, s * 1.02, 2.66, 0)));
    g.userData = { len: 0.3, bottom: 1.3, top: 2.5, width: 2.15 };
    return g;
  }

  /* Ramp: high end at z=0, low end at z=+L */
  // createRamp(L, h, w): a sloped ramp the player can run up onto vehicles.
  // L = length, h = height of the high end, w = width. High end at z = 0,
  // low end at z = +L. Returns a Group.
  function createRamp(L = 6.5, h = 3.05, w = 2.2) {
    const X = tex();
    // Shape: a flat 2D outline we can later give thickness to
    const s = new T.Shape();
    // draw a right-angled triangle: along the ground, up the slope, back down
    s.moveTo(0, 0); s.lineTo(L, 0); s.lineTo(0, h); s.lineTo(0, 0);
    // ExtrudeGeometry pushes the 2D triangle out by w to make a 3D wedge
    const geo = new T.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
    // turn it so the slope runs along z
    geo.rotateY(-PI / 2);
    // shift it so the ramp is centred on x = 0
    geo.translate(w / 2, 0, 0);
    const g = new T.Group();
    // the grey concrete wedge
    g.add(mesh(geo, mat(0x7d838c, { roughness: 0.8 })));
    // slope angle and slope length (for the edge strips)
    const ang = Math.atan2(h, L), slope = Math.hypot(L, h);
    // a hazard strip along each top edge of the slope:
    [-1, 1].forEach((sd) => {
      // thin striped bar, as long as the slope, placed halfway up
      const edge = mesh(B(0.12, 0.08, slope), X.hazardMat, sd * (w / 2 - 0.06), h / 2 + 0.05, L / 2);
      // tilt it to lie along the slope
      edge.rotation.x = ang;
      g.add(edge);
    });
    g.userData = { len: L, h, width: w };
    return g;
  }

  // createCoin(): a golden Naira coin. Returns a single Mesh (not a Group).
  function createCoin() {
    const X = tex();
    // build the coin shape once and reuse it: a flat cylinder turned to stand on edge
    if (!X.coinGeo) { X.coinGeo = C(0.33, 0.33, 0.07, 24); X.coinGeo.rotateX(PI / 2); }
    // a cylinder has 3 material slots: [side, top, bottom] -> gold rim, Naira face on both sides
    const m = new T.Mesh(X.coinGeo, [X.coinSide, X.coinFace, X.coinFace]);
    // coins cast a shadow (but don't need to receive one)
    m.castShadow = true;
    return m;
  }

  // createPowerup(type): a floating power-up: a see-through pink bubble with
  // an icon inside. type = 'magnet', 'shoes', 'jet' or anything else for '2X'
  // score. Returns a Group; userData.type tells the game which power-up it is.
  function createPowerup(type) {
    const g = new T.Group();
    // transparent glowing bubble (opacity 0.22 = mostly see-through)
    const bubble = new T.Mesh(S(0.62, 24, 16), new T.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.3, emissive: 0xff385c, emissiveIntensity: 0.25 }));
    g.add(bubble);
    // group for the icon inside, so the game can spin it separately
    const inner = new T.Group();
    g.add(inner);
    // MAGNET: a red horseshoe with silver tips
    if (type === 'magnet') {
      // half a torus (doughnut), i.e. a U shape
      const u = mesh(new T.TorusGeometry(0.24, 0.09, 10, 20, PI), mat(0xe53935, { metalness: 0.3 }));
      // flip it upside down
      u.rotation.z = PI; inner.add(u);
      // silver magnet tips on both ends
      [-1, 1].forEach((s) => inner.add(mesh(C(0.095, 0.095, 0.16, 12), mat(0xdddddd, { metalness: 0.8, roughness: 0.2 }), s * 0.24, 0.08, 0)));
    // SUPER SHOES: a sneaker with little wings
    } else if (type === 'shoes') {
      // pink shoe upper
      inner.add(mesh(B(0.26, 0.18, 0.5), mat(0xff385c), 0, 0.02, 0));
      // white sole
      inner.add(mesh(B(0.28, 0.07, 0.54), mat(0xffffff), 0, -0.1, 0));
      // a white wing on each side, angled back
      [-1, 1].forEach((s) => { const wg = mesh(B(0.04, 0.16, 0.3), mat(0xffffff), s * 0.17, 0.12, 0.08); wg.rotation.x = -0.6; inner.add(wg); });
    // JETPACK: a scaled-up copy of the real jetpack model
    } else if (type === 'jet') {
      // build a jetpack
      const jp = createJetpack();
      // make it 1.4 times bigger
      jp.scale.setScalar(1.4);
      jp.position.y = 0.12;
      inner.add(jp);
    // DEFAULT: a '2X' score multiplier tile
    } else {
      // amber square with '2X' text
      const m = new T.MeshStandardMaterial({ map: textTex('2X', { bg: '#ffb300', fg: '#3b2500', w: 128, h: 128 }), metalness: 0.4, roughness: 0.3 });
      // a thin square block wearing that texture
      inner.add(mesh(B(0.55, 0.55, 0.12), m));
    }
    g.userData = { type };
    return g;
  }

  /* Jetpack worn on the back; flames are children named "flame" */
  // createJetpack(): twin red tanks with steel nozzles and flames below.
  // Worn on the runner's back. Flames are named 'flame' so the game can find
  // and animate or hide them. Returns a Group.
  function createJetpack() {
    const X = tex();
    const g = new T.Group();
    // red painted metal tanks, shiny steel fittings
    const red = mat(0xff385c, { metalness: 0.4, roughness: 0.35 });
    const steel = mat(0xc9ced4, { metalness: 0.85, roughness: 0.25 });
    // dark cross-bar joining the two tanks
    const bar = mesh(C(0.04, 0.04, 0.26, 10), mat(0x2a2a2a), 0, 0.06, -0.02);
    // lay it sideways (along x)
    bar.rotation.z = PI / 2;
    g.add(bar);
    // build the left and right tank:
    [-1, 1].forEach((s) => {
      // CapsuleGeometry: a cylinder with rounded ends (the tank)
      g.add(mesh(new T.CapsuleGeometry(0.085, 0.24, 6, 16), red, s * 0.1, 0.02, 0));
      // small steel cap on top
      g.add(mesh(S(0.05, 10, 8), steel, s * 0.1, 0.2, 0));
      // flared nozzle underneath
      g.add(mesh(C(0.055, 0.08, 0.1, 14), steel, s * 0.1, -0.2, 0));
      // outer orange flame: an open cone
      const fl = new T.Mesh(new T.ConeGeometry(0.07, 0.45, 12, 1, true), X.flameMat);
      // flip the cone so it points down, below the nozzle, and tag it 'flame'
      fl.rotation.x = PI; fl.position.set(s * 0.1, -0.47, 0); fl.name = 'flame';
      g.add(fl);
      // smaller, brighter inner flame
      const core = new T.Mesh(new T.ConeGeometry(0.035, 0.25, 10, 1, true), X.flameCore);
      // also pointing down, also tagged 'flame'
      core.rotation.x = PI; core.position.set(s * 0.1, -0.37, 0); core.name = 'flame';
      g.add(core);
    });
    return g;
  }

  /* ================= CHARACTERS (face -Z) ================= */
  // The playable characters (plus the chasing officer). Each entry lists:
  // name, tagline, skin colour, shirt style (ankara pattern colours, jersey or
  // plain), pants, shoe, accent (shoe sole) colours, hat type and colour, and
  // extras such as backpack, earrings or belt. createRunner() reads these.
  const VARIANTS = {
    // Tunde: ankara shirt, red cap, green backpack
    tunde: { name: 'Tunde', tagline: 'Yaba tech bro. Fastest legs on Herbert Macaulay.', skin: 0x6b4226, shirt: { type: 'ankara', cols: ['#f28c28', '#1b4d89', '#fdd835', '#c62828'] }, pants: 0x2c3e66, shoe: 0xffffff, accent: 0xff385c, hat: 'cap', hatColor: 0xff385c, backpack: 0x2e7d32 },
    // Amaka: purple ankara, gele head-tie, gold earrings
    amaka: { name: 'Amaka', tagline: 'Lekki fashion queen. Gele stays on at 30 km/h.', skin: 0x7a4a2b, shirt: { type: 'ankara', cols: ['#6a1b9a', '#fbc02d', '#00897b', '#ffffff'] }, pants: 0x222222, shoe: 0xff80ab, accent: 0xffffff, hat: 'gele', hatCols: ['#fbc02d', '#6a1b9a', '#e91e63', '#ffffff'], earrings: true },
    // Seun: green-and-white football jersey, fila cap
    seun: { name: 'Seun', tagline: 'Surulere footballer. Fila tilted, never offside.', skin: 0x4e2f1c, shirt: { type: 'jersey' }, pants: 0xf5f5f5, shoe: 0x111111, accent: 0x0b8a4f, hat: 'fila', hatColor: 0x0b6e4f },
    // LASTMA traffic officer: yellow shirt, maroon trousers and cap, belt
    officer: { name: 'LASTMA Officer', skin: 0x5a3a22, shirt: { type: 'plain', color: 0xf2c230 }, pants: 0x6d1a2a, shoe: 0x111111, accent: 0x111111, hat: 'officer', hatColor: 0x6d1a2a, belt: true },
  };

  // createRunner(key): builds a full character. key is a VARIANTS name such as
  // 'amaka' (or a variant object). The body is a 'rig': a tree of joint groups
  // (body > torso > head/shoulders/elbows, body > hips > knees). Rotating a
  // joint group swings everything attached below it, which is how poseRunner()
  // animates running. Characters face -z. Returns the root Group; its
  // userData.rig holds the joints.
  function createRunner(key) {
    // look up the variant (falling back to Tunde if the name is unknown)
    const v = typeof key === 'string' ? VARIANTS[key] || VARIANTS.tunde : key;
    // skin material, slightly smooth
    const skin = mat(v.skin, { roughness: 0.5 });
    // the shirt material depends on the shirt type
    let shirt;
    // ankara: patterned fabric texture
    if (v.shirt.type === 'ankara') {
      // make the fabric texture from the variant's colours
      const tx = ankaraTex(v.shirt.cols);
      // repeat the pattern 3 times across and 2 times up the torso
      tx.repeat.set(3, 2);
      shirt = mat(0xffffff, { map: tx, roughness: 0.7 });
    // jersey: a green shirt with a white centre band and number 9
    } else if (v.shirt.type === 'jersey') {
      shirt = mat(0xffffff, {
        map: canvasTex(256, 128, (g, w, h) => {
          // green background
          g.fillStyle = '#0b8a4f'; g.fillRect(0, 0, w, h);
          // white band down the middle
          g.fillStyle = '#ffffff'; g.fillRect(w * 0.36, 0, w * 0.28, h);
          // big green number 9
          g.fillStyle = '#0b8a4f'; g.font = `900 54px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('9', w / 2, h * 0.55);
        }),
      });
    // plain: a single colour
    } else shirt = mat(v.shirt.color);
    // trousers, shoes, shoe soles and a near-black for hair/eyes
    const pants = mat(v.pants, { roughness: 0.8 });
    const shoe = mat(v.shoe, { roughness: 0.45 });
    const accent = mat(v.accent);
    const dark = mat(0x161616, { roughness: 0.6 });
    // cap(r, len): shortcut for a capsule (pill shape) used for limbs
    const cap = (r, len, seg = 14) => new T.CapsuleGeometry(r, len, 6, seg);

    // root: the character's base at ground level; the game moves this around
    const root = new T.Group();
    // body: hip-height (0.85) joint; bobs up and down while running
    const body = new T.Group(); body.position.y = 0.85; root.add(body);
    // torso: joint that leans forward/back
    const torso = new T.Group(); body.add(torso);

    // Torso outline: [radius, height] points from the waist (0) up to the neck
    // (0.67). LatheGeometry spins this outline around the vertical axis, like
    // a potter's wheel, to make a smooth rounded chest.
    const profile = [[0, 0], [0.17, 0], [0.19, 0.06], [0.182, 0.16], [0.2, 0.3], [0.232, 0.43], [0.245, 0.51], [0.225, 0.58], [0.15, 0.635], [0.065, 0.665], [0, 0.67]]
      .map(([x, y]) => new T.Vector2(x, y));
    // spin the outline with 24 segments
    const torsoGeo = new T.LatheGeometry(profile, 24);
    // flatten front-to-back (z) so the chest isn't perfectly round
    torsoGeo.scale(1, 1, 0.68);
    // add the shirt-covered torso
    torso.add(mesh(torsoGeo, shirt, 0, 0, 0));
    // hips: a squashed sphere in the trouser colour
    const hips = mesh(S(0.2, 18, 12), pants, 0, 0.02, 0);
    // wider than tall
    hips.scale.set(1, 0.6, 0.72);
    torso.add(hips);
    // officer's belt: a dark ring around the waist
    if (v.belt) {
      // TorusGeometry = a ring/doughnut shape
      const belt = mesh(new T.TorusGeometry(0.185, 0.026, 8, 28), dark, 0, 0.1, 0);
      // lay the ring flat and squash it to match the torso
      belt.rotation.x = PI / 2; belt.scale.set(1, 0.72, 1);
      torso.add(belt);
    }
    // the neck
    torso.add(mesh(C(0.058, 0.07, 0.12, 12), skin, 0, 0.71, 0));
    // backpack (Tunde): sits on the back, which is +z because he faces -z
    if (v.backpack) {
      // backpack colour
      const bpM = mat(v.backpack, { roughness: 0.6 });
      // main bag: a squashed capsule
      const bp = mesh(cap(0.14, 0.16), bpM, 0, 0.36, 0.2);
      // wider and flatter
      bp.scale.set(1.15, 1, 0.6);
      torso.add(bp);
      // yellow front pocket on the bag
      const pocket = mesh(cap(0.08, 0.06), mat(0xfdd835), 0, 0.28, 0.27);
      // flatten it against the bag
      pocket.scale.set(1.2, 1, 0.45);
      torso.add(pocket);
      // two shoulder straps on the chest side
      [-1, 1].forEach((s) => torso.add(mesh(cap(0.022, 0.3, 8), bpM, s * 0.12, 0.36, -0.158)));
    }

    // head joint on top of the neck (so it can nod)
    const head = new T.Group(); head.position.y = 0.87; torso.add(head);
    // the head: a slightly tall sphere
    const skull = mesh(S(0.18, 24, 18), skin);
    skull.scale.set(0.95, 1.05, 1);
    head.add(skull);
    // symmetrical face parts for each side (s = -1 left, +1 right):
    [-1, 1].forEach((s) => {
      // white of the eye, on the front (-z)
      head.add(mesh(S(0.034, 12, 10), mat(0xffffff, { roughness: 0.25 }), s * 0.066, 0.025, -0.152));
      // dark pupil, slightly further forward
      head.add(mesh(S(0.019, 10, 8), dark, s * 0.066, 0.025, -0.18));
      // eyebrow: a tiny capsule
      const brow = mesh(cap(0.011, 0.05, 6), dark, s * 0.066, 0.085, -0.163);
      // lay it sideways with a slight angle
      brow.rotation.z = PI / 2 + s * 0.15;
      head.add(brow);
      // ear: a flattened sphere on the side of the head
      const ear = mesh(S(0.042, 10, 8), skin, s * 0.17, 0, 0);
      ear.scale.set(0.55, 1, 0.8);
      head.add(ear);
      // gold hoop earrings (Amaka)
      if (v.earrings) head.add(mesh(new T.TorusGeometry(0.03, 0.008, 6, 14), mat(0xffc107, { metalness: 0.9, roughness: 0.2 }), s * 0.178, -0.07, 0));
    });
    // nose: a small sphere on the front of the face
    const nose = mesh(S(0.032, 10, 8), skin, 0, -0.02, -0.176);
    nose.scale.set(1.1, 0.85, 0.9);
    head.add(nose);
    // smile: half a thin ring
    const smile = mesh(new T.TorusGeometry(0.036, 0.009, 6, 14, PI), mat(0x5a1f1a), 0, -0.07, -0.162);
    // flip it so it curves upward like a smile
    smile.rotation.z = PI;
    head.add(smile);

    // hat material, if the variant has a hat colour
    const hatColor = v.hatColor != null ? mat(v.hatColor) : null;
    // brim(m, y): a half-disc cap peak sticking out over the face at height y
    const brim = (m, y) => {
      // a thin half-cylinder (angle PI) facing forward
      const b = mesh(C(0.2, 0.2, 0.022, 24, false, PI / 2, PI), m, 0, y, -0.05);
      // stretch it forward a little
      b.scale.set(1, 1, 1.2);
      return b;
    };
    // everyone except Amaka shows short dark hair (top part of a sphere)
    if (v.hat !== 'gele') {
      const hair = mesh(new T.SphereGeometry(0.186, 20, 10, 0, PI * 2, 0, PI / 2.1), dark, 0, 0.014, 0.008);
      // fit the hair snugly over the skull
      hair.scale.set(0.97, 1.05, 1.02);
      head.add(hair);
    }
    // baseball cap: dome + peak + button on top
    if (v.hat === 'cap') {
      head.add(mesh(new T.SphereGeometry(0.194, 20, 10, 0, PI * 2, 0, PI / 2), hatColor, 0, 0.035, 0));
      head.add(brim(hatColor, 0.05));
      head.add(mesh(S(0.025, 8, 6), mat(0xffffff), 0, 0.23, 0));
    // gele: a tall, fanned Nigerian head-tie in ankara fabric
    } else if (v.hat === 'gele') {
      // fabric material from the variant's gele colours
      const gm = mat(0xffffff, { map: ankaraTex(v.hatCols) });
      // the wrapped band around the head
      head.add(mesh(C(0.19, 0.2, 0.16, 18), gm, 0, 0.1, 0.01));
      // big fanned fold on top
      const fan = mesh(S(0.22, 18, 12), gm, 0, 0.27, 0.04);
      // wide, flat and tilted back
      fan.scale.set(1.45, 0.85, 0.5); fan.rotation.x = 0.35; head.add(fan);
      // a second smaller fold to one side
      const fan2 = mesh(S(0.16, 14, 10), gm, 0.12, 0.33, 0.08);
      // flattened and tilted sideways
      fan2.scale.set(1.2, 0.7, 0.4); fan2.rotation.z = -0.5; head.add(fan2);
      // the knot at the back
      head.add(mesh(S(0.06, 10, 8), gm, -0.04, 0.12, 0.2));
    // fila: the traditional Yoruba cap, folded over to one side
    } else if (v.hat === 'fila') {
      // cap body, tilted
      const f = mesh(C(0.16, 0.19, 0.2, 18), hatColor, 0.02, 0.16, 0);
      f.rotation.z = -0.3; head.add(f);
      // the flopped-over fold
      const fold = mesh(S(0.1, 12, 8), hatColor, 0.09, 0.26, 0);
      fold.scale.set(1, 0.4, 1.5); fold.rotation.z = -0.9; head.add(fold);
      // white band at the bottom of the cap
      head.add(mesh(C(0.192, 0.192, 0.03, 18), mat(0xffffff), 0, 0.075, 0));
    // officer's peaked cap
    } else if (v.hat === 'officer') {
      // wide crown of the cap
      head.add(mesh(C(0.22, 0.19, 0.11, 18), hatColor, 0, 0.15, 0));
      // dark band
      head.add(mesh(C(0.19, 0.19, 0.04, 18), dark, 0, 0.09, 0));
      // dark peak
      head.add(brim(dark, 0.08));
      // gold badge on the front
      head.add(mesh(S(0.03, 8, 6), mat(0xffc107, { metalness: 0.9 }), 0, 0.15, -0.21));
    }

    // arm(side): builds one arm (side -1 = left, +1 = right) attached to the
    // torso. Returns [shoulder joint, elbow joint] for animation.
    function arm(side) {
      // shoulder joint, at the top corner of the torso
      const sh = new T.Group(); sh.position.set(side * 0.25, 0.53, 0); torso.add(sh);
      // round shoulder
      sh.add(mesh(S(0.085, 14, 10), shirt));
      // upper arm hanging down (sleeve colour)
      sh.add(mesh(cap(0.066, 0.18), shirt, 0, -0.15, 0));
      // elbow joint at the bottom of the upper arm
      const el = new T.Group(); el.position.y = -0.3; sh.add(el);
      // bare forearm
      el.add(mesh(cap(0.055, 0.17), skin, 0, -0.13, 0));
      // hand: a slightly stretched sphere
      const hand = mesh(S(0.064, 12, 10), skin, 0, -0.29, 0);
      hand.scale.set(0.85, 1.1, 0.9);
      el.add(hand);
      return [sh, el];
    }
    // leg(side): builds one leg attached to the body at the hip.
    // Returns [hip joint, knee joint] for animation.
    function leg(side) {
      // hip joint
      const hp = new T.Group(); hp.position.set(side * 0.105, 0, 0); body.add(hp);
      // thigh
      hp.add(mesh(cap(0.088, 0.24), pants, 0, -0.2, 0));
      // knee joint at the bottom of the thigh
      const kn = new T.Group(); kn.position.y = -0.42; hp.add(kn);
      // round knee cap
      kn.add(mesh(S(0.078, 12, 10), pants));
      // shin
      kn.add(mesh(cap(0.07, 0.22), pants, 0, -0.18, 0));
      // one capsule shape shared by the shoe and its sole
      const sg = cap(0.078, 0.15);
      // shoe, pointing forward (-z)
      const sh = mesh(sg, shoe, 0, -0.37, -0.05);
      // lay the capsule flat and squash it into a shoe shape
      sh.rotation.x = PI / 2; sh.scale.set(1.05, 1, 0.75);
      kn.add(sh);
      // sole in the accent colour, slightly larger and very flat
      const sole = mesh(sg, accent, 0, -0.415, -0.05);
      sole.rotation.x = PI / 2; sole.scale.set(1.12, 1.06, 0.3);
      kn.add(sole);
      return [hp, kn];
    }
    // build both arms and both legs, keeping their joints
    const [armL, elbL] = arm(-1), [armR, elbR] = arm(1);
    const [legL, kneeL] = leg(-1), [legR, kneeR] = leg(1);
    // the officer holds a small gold baton in his right hand
    if (v.hat === 'officer') {
      elbR.add(mesh(C(0.02, 0.02, 0.12, 6), mat(0xffc107, { metalness: 0.8 }), 0, -0.34, -0.02));
    }
    // store the rig (all joints) and baseY (resting body height) for poseRunner()
    root.userData = { rig: { body, torso, head, armL, armR, elbL, elbR, legL, legR, kneeL, kneeR, baseY: 0.85 }, name: v.name };
    return root;
  }
  // createOfficer(): shortcut for the LASTMA officer character
  const createOfficer = () => createRunner('officer');

  // poseRunner(fig, ph, mode, dt): animates a character made by createRunner().
  // fig = the character, ph = animation phase (a growing number that drives
  // the swing), mode = 'run', 'jump', 'roll', 'fly', 'fall', 'wave' or idle,
  // dt = seconds since the last frame. Each joint is eased smoothly towards
  // the target pose rather than snapping. Returns nothing.
  function poseRunner(fig, ph, mode, dt) {
    // the joints
    const r = fig.userData.rig;
    // easing amount per frame (bigger dt = faster catch-up, max 1)
    const k = Math.min(1, dt * 16);
    // sine and cosine of the phase give smooth back-and-forth swings
    const s = Math.sin(ph), c = Math.cos(ph);
    // P = target joint angles (radians) for the chosen pose
    let P;
    // pick the pose; armZ spreads arms outwards, bob raises/lowers the body
    switch (mode) {
      // run: legs and arms swing opposite each other, knees bend on the back-swing
      case 'run': P = { legL: s * 0.95, legR: -s * 0.95, kneeL: -Math.max(0, c) * 1.4 - 0.15, kneeR: -Math.max(0, -c) * 1.4 - 0.15, armL: -s * 0.9, armR: s * 0.9, elbL: 1.3, elbR: 1.3, torso: -0.2, bob: Math.abs(c) * 0.07, armZ: 0.12, head: 0.1 }; break;
      // jump: one knee up, one arm high
      case 'jump': P = { legL: 0.95, legR: -0.4, kneeL: -1.4, kneeR: -0.5, armL: 2.5, armR: -0.7, elbL: 0.4, elbR: 0.9, torso: -0.1, bob: 0, armZ: 0.35, head: 0 }; break;
      // roll: tucked into a ball, body lowered
      case 'roll': P = { legL: 1.9, legR: 1.9, kneeL: -2.3, kneeR: -2.3, armL: 1.4, armR: 1.4, elbL: 1.6, elbR: 1.6, torso: -0.7, bob: -0.35, armZ: 0.1, head: 0.4 }; break;
      // fly (jetpack): legs trailing, gentle kicking, leaning forward
      case 'fly': P = { legL: -0.25 + s * 0.08, legR: -0.05 - s * 0.08, kneeL: -0.7, kneeR: -0.35, armL: 0.5, armR: 0.5, elbL: 0.5, elbR: 0.5, torso: -0.35, bob: Math.sin(ph * 0.5) * 0.04, armZ: 0.45, head: -0.25 }; break;
      // fall (crash): arms thrown up, leaning back
      case 'fall': P = { legL: 0.4, legR: -0.25, kneeL: -0.3, kneeR: -0.7, armL: 2.9, armR: 2.6, elbL: 0.2, elbR: 0.3, torso: 0.35, bob: 0, armZ: 0.6, head: -0.3 }; break;
      // wave (menu screen): right arm raised and waving
      case 'wave': P = { legL: 0, legR: 0.05, kneeL: 0, kneeR: -0.05, armL: s * 0.04, armR: 2.7, elbL: 0.15, elbR: 0.6 + Math.sin(ph * 3) * 0.5, torso: 0, bob: Math.sin(ph) * 0.012, armZ: 0.1, head: -0.05, armRZ: 0.5 }; break;
      // idle: standing with a gentle breathing sway
      default: P = { legL: 0, legR: 0, kneeL: 0, kneeR: 0, armL: s * 0.05, armR: -s * 0.05, elbL: 0.15, elbR: 0.15, torso: Math.sin(ph) * 0.02, bob: Math.sin(ph) * 0.012, armZ: 0.08, head: 0 };
    }
    // L(joint, target): move the joint's x rotation part of the way towards the target
    const L = (o, v) => { o.rotation.x += (v - o.rotation.x) * k; };
    // apply the targets to legs, arms, torso and head
    L(r.legL, P.legL); L(r.legR, P.legR); L(r.kneeL, P.kneeL); L(r.kneeR, P.kneeR);
    L(r.armL, P.armL); L(r.armR, P.armR); L(r.elbL, P.elbL); L(r.elbR, P.elbR);
    L(r.torso, P.torso); L(r.head, P.head);
    // spread the arms sideways (z rotation); right arm may use its own value
    r.armL.rotation.z += (-P.armZ - r.armL.rotation.z) * k;
    r.armR.rotation.z += ((P.armRZ != null ? P.armRZ : P.armZ) - r.armR.rotation.z) * k;
    // ease the body's height for the bobbing effect
    r.body.position.y += (r.baseY + P.bob - r.body.position.y) * k;
  }

  /* ================= LANDMARKS (road-facing side is +X) ================= */
  // createNationalTheatre(): the National Arts Theatre, Iganmu — a round
  // building with sloped ribs and a low dome, famous for looking like a
  // military cap. About 40 across. Returns a Group.
  function createNationalTheatre() {
    const g = new T.Group();
    // materials: white concrete, grey, a glowing glass band, darker trim
    const white = mat(0xece7dc, { roughness: 0.6 });
    const grey = mat(0xb9b4aa);
    const band = glow(mat(0x26323d, { roughness: 0.2, metalness: 0.5, emissive: 0xffc977 }), 0.8, 0);
    const trim = mat(0x6b6f74);
    // wide round base platform
    g.add(mesh(C(16, 16.5, 1.2, 56), grey, 0, 0.6, 0));
    // round ground-floor wall
    g.add(mesh(C(14.5, 14.5, 5, 56), white, 0, 3.7, 0));
    // open (no caps) glass band wrapped around the wall; glows at night
    g.add(mesh(C(14.56, 14.56, 1.8, 56, true), band, 0, 3.9, 0));
    // overhanging ring (the 'cap brim') at height 6.6
    g.add(mesh(C(17.5, 17, 0.9, 56), white, 0, 6.6, 0));
    // thin trim under the brim
    g.add(mesh(C(17.3, 17.3, 0.25, 56), trim, 0, 6.05, 0));
    // upper drum, narrower at the top
    g.add(mesh(C(11.5, 13.5, 6, 56), white, 0, 10, 0));
    // shape of one vertical rib
    const ribG = B(0.7, 6.4, 1.6);
    // 40 ribs evenly spaced around the drum
    for (let i = 0; i < 40; i++) {
      // angle of this rib around the circle
      const a = (i / 40) * PI * 2;
      // sin/cos of the angle put the rib on a circle of radius 12.6
      const rib = mesh(ribG, grey, Math.sin(a) * 12.6, 10, Math.cos(a) * 12.6);
      // apply the turn around y first, then the tilt
      rib.rotation.order = 'YXZ';
      // face the rib outwards
      rib.rotation.y = a;
      // lean it inwards to follow the sloping drum
      rib.rotation.x = -0.32;
      g.add(rib);
    }
    // grey ring at the top of the drum
    g.add(mesh(C(9, 11.6, 1.6, 56), grey, 0, 13.8, 0));
    // dome: the top half of a sphere...
    const dome = mesh(new T.SphereGeometry(9, 40, 12, 0, PI * 2, 0, PI / 2), white, 0, 14.6, 0);
    // ...squashed to 28% height for a low profile
    dome.scale.y = 0.28; g.add(dome);
    // partial ring (1.4 radians) forming a canopy over the road-side entrance
    g.add(mesh(C(19.5, 19.5, 0.5, 40, false, PI / 2 - 0.7, 1.4), white, 0, 6.1, 0));
    // entrance steps on the +x side
    g.add(mesh(B(3, 0.6, 9), grey, 17.5, 0.3, 0));
    g.add(mesh(B(1.5, 1.2, 9), grey, 16.4, 0.6, 0));
    // name board by the road
    const p = plaque('NATIONAL THEATRE\nIganmu • Built for FESTAC ’77', 9, 2.2);
    p.position.set(21, 0, 9); g.add(p);
    g.userData = { len: 40, name: 'National Theatre, Iganmu' };
    return g;
  }

  // createNecomHouse(): NECOM House on the Marina — a 72-tall tower on a glass
  // podium with a red-and-white communications mast and dishes. Returns a Group.
  function createNecomHouse() {
    const X = tex();
    const g = new T.Group();
    // brown window facade that lights up at night
    const facade = glow(mat(0xb98f6e, { map: X.windows, emissive: 0xffd27a, emissiveMap: X.lit[0] }), 0.9, 0);
    // roof and vertical fin materials
    const roof = mat(0x6d625a);
    const fin = mat(0x8a6b55);
    // dark glass podium at street level
    g.add(mesh(B(22, 6, 22), X.darkGlass, 0, 3, 0));
    // slab on top of the podium
    g.add(mesh(B(23, 0.6, 23), mat(0xd8d0c4), 0, 6.3, 0));
    // the main tower, 72 tall, with tiling windows
    g.add(mesh(boxUV(13, 72, 13, 12), [facade, facade, roof, roof, facade, facade], 0, 42.6, 0));
    // thick fins running up all four corners
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => g.add(mesh(B(0.9, 72, 0.9), fin, a * 6.55, 42.6, b * 6.55)));
    // three extra fins on the road-facing (+x) side
    [-3.2, 0, 3.2].forEach((z) => g.add(mesh(B(0.5, 72, 0.5), fin, 6.6, 42.6, z)));
    // plant room box on the roof
    g.add(mesh(B(10, 5, 10), mat(0x7a5f4d), 0, 81, 0));
    // red and white for the mast
    const red = mat(0xd32f2f), whiteM = mat(0xf2f2f2);
    // mast made of 8 stacked sections, alternating red and white
    for (let i = 0; i < 8; i++) g.add(mesh(C(0.4, 0.55, 4, 10), i % 2 ? whiteM : red, 0, 85.5 + i * 4, 0));
    // three microwave dishes at different heights and angles: [height, angle]
    [[88, 0.6], [93, 2.4], [98, 4.2]].forEach(([y, a]) => {
      // a flat disc placed around the mast
      const d = mesh(C(1.3, 1.3, 0.3, 20), whiteM, Math.sin(a) * 1.2, y, Math.cos(a) * 1.2);
      // stand it upright and turn it to face outward
      d.rotation.set(PI / 2, 0, a); g.add(d);
    });
    // red aircraft warning light at the very top (always glowing a bit)
    g.add(mesh(S(0.5, 10, 8), glow(mat(0xff1744, { emissive: 0xff1744 }), 3, 0.8), 0, 117.8, 0));
    const p = plaque('NECOM HOUSE\nMarina • 32 floors of Lagos history', 9, 2.2);
    p.position.set(12.5, 0, 6); g.add(p);
    g.userData = { len: 26, name: 'NECOM House, Marina' };
    return g;
  }

  // createCivicCentre(): The Civic Centre, Victoria Island — a white podium
  // with a curved glass wall facing the road and a glass tower behind.
  // Returns a Group.
  function createCivicCentre() {
    const X = tex();
    const g = new T.Group();
    // white concrete
    const white = mat(0xf3f1ec, { roughness: 0.5 });
    // low podium building
    g.add(mesh(B(26, 5, 30), white, -4, 2.5, 0));
    // slab on top of the podium
    g.add(mesh(B(26.5, 0.5, 30.5), mat(0xc9c4ba), -4, 5.2, 0));
    // start angle so the 2-radian curved wall is centred on the +x (road) side
    const ts = PI / 2 - 1.0;
    // curved glass wall: an open slice of a big cylinder
    g.add(mesh(C(14, 14, 13, 40, true, ts, 2.0), X.glassPlain, -6.5, 11.9, 0));
    // white curved slabs at the top and bottom of the glass
    g.add(mesh(C(14.4, 14.4, 0.6, 40, false, ts, 2.0), white, -6.5, 18.6, 0));
    g.add(mesh(C(14.4, 14.4, 0.6, 40, false, ts, 2.0), white, -6.5, 5.4, 0));
    // 9 thin white columns along the curve
    for (let i = 0; i <= 8; i++) {
      // angle of this column
      const a = ts + (i / 8) * 2.0;
      // place it on the curve using sin/cos
      g.add(mesh(B(0.25, 13, 0.25), white, -6.5 + Math.sin(a) * 14.05, 11.9, Math.cos(a) * 14.05));
    }
    // flat white wall closing the open back of the curve
    g.add(mesh(B(0.5, 13, 23.6), white, -6.5 + Math.sin(ts) * 14 - 0.2, 11.9, 0));
    // tall glass tower behind (sides glass, top/bottom white)
    g.add(mesh(boxUV(11, 58, 11, 8), [X.glassMat, X.glassMat, white, white, X.glassMat, X.glassMat], -10, 29, -20));
    // slanted glass crown on top of the tower
    const cap = mesh(B(11.2, 4, 11.2), X.glassMat, -10, 59, -20);
    // tilt it for the angled roofline
    cap.rotation.z = 0.3; g.add(cap);
    const p = plaque('THE CIVIC CENTRE\nVictoria Island', 8, 2);
    p.position.set(11, 0, 12); g.add(p);
    g.userData = { len: 44, name: 'The Civic Centre, Victoria Island' };
    return g;
  }

  // createHorse(m): a simple rearing horse statue made of boxes and cylinders
  // in material m (used on the TBS gate). Faces +z. Returns a Group.
  function createHorse(m) {
    const g = new T.Group();
    // tilted body (rearing up)
    const body = mesh(B(0.6, 0.65, 1.6), m, 0, 1.45, 0); body.rotation.x = -0.5; g.add(body);
    // neck angled forward
    const neck = mesh(B(0.3, 0.9, 0.38), m, 0, 2.15, 0.7); neck.rotation.x = 0.45; g.add(neck);
    // head at the end of the neck
    const head = mesh(B(0.28, 0.3, 0.68), m, 0, 2.6, 1.05); head.rotation.x = 0.55; g.add(head);
    // left and right:
    [-1, 1].forEach((s) => {
      // back leg standing on the ground
      g.add(mesh(C(0.08, 0.06, 1.15, 8), m, s * 0.2, 0.6, -0.55));
      // front leg raised in the air
      const fl = mesh(C(0.08, 0.06, 0.95, 8), m, s * 0.2, 1.75, 0.95); fl.rotation.x = 1.1; g.add(fl);
      // ear
      const ear = mesh(B(0.06, 0.14, 0.06), m, s * 0.08, 2.88, 0.92); g.add(ear);
    });
    // tail sloping down at the back
    const tail = mesh(B(0.12, 0.7, 0.12), m, 0, 1.2, -0.95); tail.rotation.x = -0.6; g.add(tail);
    // mane along the neck
    const mane = mesh(B(0.08, 0.7, 0.2), m, 0, 2.3, 0.55); mane.rotation.x = 0.45; g.add(mane);
    return g;
  }

  /* Spans the road – centred on X=0 */
  // createTBSGate(): the Tafawa Balewa Square gate that spans the road,
  // centred on x = 0: two towers, low side walls, a sign beam and four white
  // horses on top. Returns a Group.
  function createTBSGate() {
    const g = new T.Group();
    // white and green colour scheme
    const white = mat(0xf5f3ee, { roughness: 0.5 });
    const green = mat(0x0b7a43);
    // each side of the road:
    [-1, 1].forEach((s) => {
      // 9-tall tower, 7.2 from the road centre
      g.add(mesh(B(2.6, 9, 2.6), white, s * 7.2, 4.5, 0));
      // two green bands around the tower
      [1.4, 8.0].forEach((y) => g.add(mesh(B(2.75, 0.45, 2.75), green, s * 7.2, y, 0)));
      // low wall stretching outward from the tower
      g.add(mesh(B(9, 2.2, 0.8), white, s * (7.2 + 1.3 + 4.5), 1.1, 0));
      // green coping along the top of that wall
      g.add(mesh(B(9.05, 0.3, 0.85), green, s * (7.2 + 1.3 + 4.5), 2.25, 0));
    });
    // 'TAFAWA BALEWA SQUARE' sign texture
    const sign = new T.MeshStandardMaterial({ map: textTex('TAFAWA BALEWA SQUARE', { bg: '#f5f3ee', fg: '#0b7a43', w: 1024, h: 128 }), roughness: 0.5, emissive: 0xffffff });
    // glows at night
    sign.emissiveMap = sign.map; glow(sign, 0.5, 0);
    // beam across the road; sign on the front and back faces (+z / -z)
    g.add(mesh(B(17, 2.2, 2.6), [white, white, white, white, sign, sign], 0, 10.1, 0));
    // green trim on top of the beam
    g.add(mesh(B(17.2, 0.3, 2.7), green, 0, 11.35, 0));
    // shiny white marble for the horses
    const marble = mat(0xfbfbf8, { roughness: 0.35 });
    // four horses spread across the beam (i = 0..3)
    [-5.4, -1.8, 1.8, 5.4].forEach((x, i) => {
      // pedestal
      g.add(mesh(B(1.4, 0.4, 2), white, x, 11.7, 0));
      // the horse statue
      const h = createHorse(marble);
      // on top of the pedestal
      h.position.set(x, 11.9, -0.2);
      // 15% bigger
      h.scale.setScalar(1.15);
      // fan the horses out slightly
      h.rotation.y = (i - 1.5) * 0.12;
      g.add(h);
    });
    // span: true tells the game this crosses the road instead of standing beside it
    g.userData = { len: 4, name: 'Tafawa Balewa Square, Onikan', span: true };
    return g;
  }

  // createStiltHouse(): a small wooden house on stilts over the lagoon, like
  // those in Makoko. Returns a Group.
  function createStiltHouse() {
    const g = new T.Group();
    // random shade of brown wood
    const wood = mat(pick([0x7a5534, 0x8d6748, 0x6b4a2e]), { roughness: 1 });
    // four stilts, one under each corner
    [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]].forEach(([x, z]) => g.add(mesh(C(0.07, 0.07, 2, 6), wood, x, 0.6, z)));
    // wooden platform on the stilts
    g.add(mesh(B(3.2, 0.15, 3.2), wood, 0, 1.4, 0));
    // the hut
    g.add(mesh(B(2.6, 1.8, 2.6), wood, 0, 2.4, 0));
    // pyramid roof: a 4-sided cone in rusty metal
    const roof = mesh(new T.ConeGeometry(2.4, 1.1, 4), mat(0x9c5a3c, { metalness: 0.5, roughness: 0.6 }), 0, 3.85, 0);
    // turn 45 degrees so the roof edges line up with the walls
    roof.rotation.y = PI / 4; g.add(roof);
    // dark doorway on the +x side
    g.add(plane(0.7, 1.2, mat(0x2a1a10), 1.31, 2.1, 0, PI / 2));
    return g;
  }

  // createCanoe(): a dugout canoe with a standing paddler. Returns a Group.
  function createCanoe() {
    const g = new T.Group();
    // hull: a sphere...
    const hull = mesh(S(1, 14, 8), mat(0x5d3b1e), 0, 0.05, 0);
    // ...stretched long and squashed flat into a canoe shape
    hull.scale.set(0.45, 0.22, 2.4); g.add(hull);
    // paddler's body in a random bright shirt colour
    const man = mesh(C(0.12, 0.16, 0.7, 8), mat(pick([0xff385c, 0x1e88e5, 0xfdd835])), 0, 0.45, 0.5); g.add(man);
    // paddler's head
    g.add(mesh(S(0.12, 8, 6), mat(0x4e2f1c), 0, 0.92, 0.5));
    // long punting pole, angled
    const pole = mesh(C(0.025, 0.025, 3, 5), mat(0x8d6e4b), 0.3, 0.9, 0.3); pole.rotation.x = 0.5; g.add(pole);
    return g;
  }

  // bridgeDeck(g, len, waterY): adds a road deck and support pillars down to
  // the water (at height waterY) to group g. Used for the menu previews where
  // there is no real game road. Returns nothing.
  function bridgeDeck(g, len, waterY) {
    // the deck slab, 15.6 wide
    const deck = mesh(B(15.6, 1, len), mat(0x55585e), 0, -0.5, 0);
    g.add(deck);
    // dark asphalt strip on top
    g.add(mesh(B(7.2, 0.04, len), mat(0x2f2f33), 0, 0.02, 0));
    // a pair of pillars every 18 units along the bridge
    for (let z = -len / 2 + 6; z <= len / 2 - 6; z += 18) {
      // left and right pillars reaching down into the water
      g.add(mesh(C(1.1, 1.3, -waterY, 12), mat(0xbdb8b0), -4.5, waterY / 2 - 0.5, z));
      g.add(mesh(C(1.1, 1.3, -waterY, 12), mat(0xbdb8b0), 4.5, waterY / 2 - 0.5, z));
    }
  }

  /* Bridge segment centred on the road (X=0) */
  // createLinkBridge(o): one segment of the Lekki–Ikoyi Link Bridge, centred
  // on the road (x = 0): an A-shaped pylon with fanned cables that glow purple
  // and blue at night. Options: len (length), water (width of water each
  // side, 0 = none), preview (true = small menu version with its own deck).
  // Returns a Group.
  function createLinkBridge(o = {}) {
    const X = tex();
    // segment length and water width (defaults 130 and 200)
    const len = o.len || 130, water = o.water != null ? o.water : 200;
    // water height: far below in the preview, at road level in the game
    const waterY = o.preview ? -6 : 0.04;
    const g = new T.Group();
    // pale concrete
    const concrete = mat(0xd9d6cf, { roughness: 0.8 });
    // pylon height, half-width at the base and at the top
    const H = 46, baseX = 7.6, topX = 1.3;
    // lean angle and length of each pylon leg
    const ang = Math.atan2(baseX - topX, H), legLen = Math.hypot(baseX - topX, H);
    // the two legs of the A-shaped pylon:
    [-1, 1].forEach((s) => {
      // a long box placed halfway between base and top
      const leg = mesh(B(1.6, legLen, 2.4), concrete, s * (baseX + topX) / 2, H / 2, 0);
      // lean it inwards so the legs meet at the top
      leg.rotation.z = s * ang; g.add(leg);
    });
    // the pylon head where the legs join
    g.add(mesh(B(4.2, 9, 2.6), concrete, 0, H + 3.5, 0));
    // cross-beam joining the legs at height 13
    g.add(mesh(B(11.6, 1.4, 2.2), concrete, 0, 13, 0));
    // red aircraft warning light on top
    g.add(mesh(S(0.45, 10, 8), glow(mat(0xff1744, { emissive: 0xff1744 }), 3, 0.6), 0, H + 8.3, 0));
    // cable materials: purple glow...
    const cA = glow(mat(0xeeeeee, { metalness: 0.6, roughness: 0.3, emissive: 0xb04bff }), 1.8, 0);
    // ...and blue glow
    const cB = glow(mat(0xeeeeee, { metalness: 0.6, roughness: 0.3, emissive: 0x3fa9ff }), 1.8, 0);
    // 9 cables per fan; reach = how far along the road they land
    const n = 9, reach = Math.min(len / 2 - 4, 58);
    // for each cable level:
    for (let i = 0; i < n; i++) {
      // where it attaches on the pylon, going lower each time
      const yTop = H - 1 - i * 2.2;
      // the pylon leg's x at that height
      const xTop = baseX - (baseX - topX) * (yTop / H);
      // higher cables land further along the road
      const zEnd = 10 + (reach - 10) * (1 - i / (n - 1));
      // both sides of the road (s) and both directions along it (d)
      [-1, 1].forEach((s) => [-1, 1].forEach((d) => {
        // cable from the pylon down to the road edge, alternating purple/blue
        g.add(rod(new T.Vector3(s * xTop, yTop, d * 0.6), new T.Vector3(s * 7.4, 1.2, d * zEnd), 0.06, i % 2 ? cA : cB));
      }));
    }
    // each side of the road:
    [-1, 1].forEach((s) => {
      // concrete side barrier
      g.add(mesh(B(0.5, 1.1, len), concrete, s * 7.6, 0.55, 0));
      // metal handrail on top
      g.add(mesh(B(0.12, 0.12, len), mat(0x9aa0a6, { metalness: 0.7, roughness: 0.3 }), s * 7.6, 1.25, 0));
      // lagoon water stretching out from the bridge
      if (water) {
        // a big water plane
        const w = new T.Mesh(new T.PlaneGeometry(water, len), X.waterMat);
        // lay it flat beside the road
        w.rotation.x = -PI / 2; w.position.set(s * (7.9 + water / 2), waterY, 0); w.receiveShadow = true; g.add(w);
      }
    });
    // menu preview: add a deck and pillars
    if (o.preview) bridgeDeck(g, len, waterY);
    // segment: true means the game repeats this along the road
    g.userData = { len, name: 'Lekki–Ikoyi Link Bridge', segment: true };
    return g;
  }

  // createThirdMainland(o): a segment of the Third Mainland Bridge: low
  // barriers, street lamps, lagoon water with stilt houses and canoes, and a
  // distant skyline. Options as for createLinkBridge. Returns a Group.
  function createThirdMainland(o = {}) {
    const X = tex();
    // segment length and water width (defaults 220 and 220)
    const len = o.len || 220, water = o.water != null ? o.water : 220;
    // water height (lower in the preview)
    const waterY = o.preview ? -6 : 0.04;
    const g = new T.Group();
    // weathered concrete
    const concrete = mat(0xcfcac0, { roughness: 0.85 });
    // each side of the road:
    [-1, 1].forEach((s) => {
      // concrete parapet wall
      g.add(mesh(B(0.6, 1.0, len), concrete, s * 7.6, 0.5, 0));
      // dark stain line along it
      g.add(mesh(B(0.62, 0.12, len), mat(0x2b2b2b), s * 7.6, 0.25, 0));
      // a lamp every 24 units
      for (let z = -len / 2 + 10; z < len / 2; z += 24) {
        // reuse the street lamp
        const l = createLamp();
        // stand it on the parapet
        l.position.set(s * 7.6, 0.9, z);
        // turn right-side lamps around so their arms point over the road
        if (s > 0) l.rotation.y = PI;
        g.add(l);
      }
      // lagoon water beside the bridge
      if (water) {
        // big flat water plane
        const w = new T.Mesh(new T.PlaneGeometry(water, len), X.waterMat);
        // lay it flat and push it out to the side
        w.rotation.x = -PI / 2; w.position.set(s * (7.9 + water / 2), waterY, 0); w.receiveShadow = true; g.add(w);
      }
    });
    // scenery on the water:
    if (water) {
      // stilt houses appear between 'near' and 'far' from the road
      const near = o.preview ? 12 : 30, far = o.preview ? 30 : 100;
      // how many stilt houses
      const nh = o.preview ? 6 : 16;
      // place the stilt houses (Makoko village)
      for (let i = 0; i < nh; i++) {
        // alternate left and right sides
        const s = i % 2 ? 1 : -1;
        // build one house
        const h = createStiltHouse();
        // random distance from the road and position along it, slightly sunk
        h.position.set(s * rnd(near, far), waterY - 0.4, rnd(-len / 2 + 6, len / 2 - 6));
        // random facing
        h.rotation.y = rnd(0, PI * 2);
        g.add(h);
      }
      // a few canoes
      for (let i = 0; i < (o.preview ? 3 : 8); i++) {
        // build one canoe
        const c = createCanoe();
        // random position on the water, alternating sides
        c.position.set((i % 2 ? 1 : -1) * rnd(near * 0.6, far * 0.8), waterY, rnd(-len / 2, len / 2));
        // random heading
        c.rotation.y = rnd(0, PI);
        g.add(c);
      }
      // in the game only: a distant skyline of glass towers on the left
      if (!o.preview) {
        // 9 towers spread along the segment
        for (let i = 0; i < 9; i++) {
          // random height
          const h = rnd(18, 60);
          // glass tower 150-175 units to the left (-x)
          const b = mesh(boxUV(10, h, 12, 12), [X.glassMat, X.glassMat, mat(0x777777), mat(0x777777), X.glassMat, X.glassMat], -rnd(150, 175), h / 2, -len / 2 + i * (len / 9));
          // too far away for shadows to matter (saves work)
          b.castShadow = false; g.add(b);
        }
      }
    }
    // menu preview: add a deck and pillars
    if (o.preview) bridgeDeck(g, len, waterY);
    g.userData = { len, name: 'Third Mainland Bridge', segment: true };
    return g;
  }

  // createEkoAtlantic(): a cluster of glass skyscrapers representing Eko
  // Atlantic City. Returns a Group.
  function createEkoAtlantic() {
    const X = tex();
    const g = new T.Group();
    // light grey roofs
    const roof = mat(0xdddddd);
    // each tower: [x, z, width, depth, height]
    [[0, 0, 10, 10, 80], [14, -16, 9, 9, 58], [-6, -28, 12, 12, 96], [16, 14, 8, 8, 44], [2, 24, 10, 10, 66], [-12, 10, 9, 9, 52]].forEach(([x, z, w, d, h]) => {
      // the glass tower
      g.add(mesh(boxUV(w, h, d, 8), [X.glassMat, X.glassMat, roof, roof, X.glassMat, X.glassMat], x, h / 2, z));
      // smaller glass crown on top
      g.add(mesh(B(w * 0.6, 3, d * 0.6), X.glassMat, x, h + 1.5, z));
      // thin white antenna
      g.add(mesh(C(0.15, 0.15, 6, 6), mat(0xffffff), x, h + 6, z));
    });
    const p = plaque('EKO ATLANTIC CITY\nThe new Lagos, built on the sea', 10, 2.2);
    p.position.set(22, 0, 0); g.add(p);
    g.userData = { len: 64, name: 'Eko Atlantic City' };
    return g;
  }

  // Landmark facts for the menu/info screens: key, display name, location,
  // a short fact, and make() which builds the model (bridges in preview form).
  const LANDMARK_INFO = [
    { key: 'theatre', name: 'National Arts Theatre', place: 'Iganmu', fact: 'Completed in 1976 for FESTAC ’77, its shape famously resembles a military cap.', make: createNationalTheatre },
    { key: 'necom', name: 'NECOM House', place: 'Marina, Lagos Island', fact: 'The 32-storey former NITEL tower was Nigeria’s tallest building for decades.', make: createNecomHouse },
    { key: 'link', name: 'Lekki–Ikoyi Link Bridge', place: 'Lekki ↔ Ikoyi', fact: 'Opened in 2013, the cable-stayed bridge glows purple and blue at night.', make: () => createLinkBridge({ len: 110, water: 40, preview: true }) },
    { key: 'third', name: 'Third Mainland Bridge', place: 'Oworonshoki ↔ Adeniji Adele', fact: 'Opened in 1990, it runs 11.8 km over the lagoon past the Makoko stilt village.', make: () => createThirdMainland({ len: 90, water: 40, preview: true }) },
    { key: 'tbs', name: 'Tafawa Balewa Square', place: 'Onikan', fact: 'Built on the old racecourse, its gate is crowned by four white horses.', make: createTBSGate },
    { key: 'civic', name: 'The Civic Centre', place: 'Victoria Island', fact: 'A curved glass waterfront venue facing the Lagos lagoon.', make: createCivicCentre },
    { key: 'eko', name: 'Eko Atlantic City', place: 'Victoria Island', fact: 'A new city rising from land reclaimed from the Atlantic Ocean.', make: createEkoAtlantic },
  ];

  // Public API: everything other game files can use via window.LagosModels
  window.LagosModels = {
    // helpers, textures and day/night control
    THREE: T, rnd, ri, pick, mat, mesh, canvasTex, textTex, tex, glow, setNight, isNight: () => night,
    // street furniture
    createBuilding, createLamp, createPalm, createStall, createBillboard,
    // vehicles, obstacles, collectibles
    createDanfo, createBRT, createKeke, createBarrier, createGantry, createRamp, createCoin, createPowerup, createJetpack,
    // characters and animation
    createRunner, createOfficer, poseRunner, VARIANTS,
    // landmarks and their info
    createNationalTheatre, createNecomHouse, createCivicCentre, createTBSGate, createLinkBridge, createThirdMainland, createEkoAtlantic,
    createStiltHouse, createCanoe, LANDMARK_INFO,
  };
// end of the wrapper function, which runs immediately
})();
