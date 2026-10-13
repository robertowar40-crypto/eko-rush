/* Eko Rush – landing page interactions */
// =====================================================================
// FILE OVERVIEW
// This script powers the landing page (index.html). It uses Three.js (the global
// THREE object), a library that draws 3D graphics in a <canvas> using WebGL, and
// window.LagosModels (from js/models.js), which builds the Lagos 3D models.
// How it is organised (top to bottom):
//   1. Nav bar         – shadow on scroll + mobile menu button.
//   2. Scroll reveal   – fade sections in as they scroll into view.
//   3. Custom cursor   – a dot and a trailing ring that follow the mouse.
//   4. Honk synth      – a tiny "danfo horn" sound made with the Web Audio API.
//   5. Helpers         – normalize() to size models, makeRenderer() to create WebGL renderers.
//   6. HERO            – a 3D model that follows the cursor, can be dragged/spun,
//                        bounces with a coin burst and speech bubble when clicked.
//   7. LANDMARK VIEWER – a turntable showing Lagos landmarks, chosen by tabs, orbit by dragging.
//   8. RUNNER THUMBS   – character pictures rendered once offscreen into <img> tags.
//   9. THEME           – adjust 3D lights/colours when light/dark theme changes.
//  10. LOOP            – the animation loop that moves and draws everything each frame.
// =====================================================================
// Wrap everything in an immediately-invoked function so variables stay private to this file.
(function () {
  // Strict mode: report more mistakes as errors.
  'use strict';
  // Short alias for the model library from js/models.js.
  const LM = window.LagosModels;
  // Short alias for THREE.Vector3 (a 3D point/direction with x, y, z).
  const V3 = THREE.Vector3;
  // Returns true when the page is in dark theme (theme.js sets data-theme on <html>).
  const isDark = () => document.documentElement.dataset.theme === 'dark';
  // true if the user asked their OS to reduce motion; we then tone down automatic animations.
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Put the current year in the footer (element with id="year").
  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------------- nav ---------------- */
  // The top navigation bar.
  const nav = document.getElementById('nav');
  // Add the 'scrolled' class (e.g. a shadow) once the page has scrolled more than 10px.
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 10);
  // Run on every scroll; passive: true promises we won't block scrolling, which keeps it smooth.
  window.addEventListener('scroll', onScroll, { passive: true });
  // Run once now in case the page loaded already scrolled down.
  onScroll();
  // The "hamburger" menu button shown on small screens.
  const menuBtn = document.getElementById('menu-btn');
  // The list of nav links that the button opens/closes.
  const links = document.getElementById('nav-links');
  // Clicking the menu button toggles the menu open/closed.
  menuBtn.addEventListener('click', () => {
    // toggle() adds or removes 'open' and returns true if it is now open.
    const open = links.classList.toggle('open');
    // Tell screen readers whether the menu is expanded.
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  // Clicking any link inside the menu closes the menu (so it doesn't cover the section you jumped to).
  links.addEventListener('click', (e) => { if (e.target.closest('a')) { links.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); } });

  /* ---------------- reveal on scroll ---------------- */
  // An IntersectionObserver tells us when elements enter the visible screen area, without
  // us checking positions on every scroll. When a '.reveal' element is 12% visible
  // (threshold 0.12), add the 'in' class (CSS animates it in) and stop watching it.
  const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12 });
  // Watch every '.reveal' element; stagger delays (0, 70, 140, 210ms) so neighbours appear one after another.
  document.querySelectorAll('.reveal').forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 70}ms`; io.observe(el); });

  /* ---------------- custom cursor ---------------- */
  // true when the main pointer is precise (a mouse), not a finger; only then do we show a custom cursor.
  const fine = matchMedia('(pointer: fine)').matches;
  // The large ring that smoothly trails the mouse.
  const ring = document.querySelector('.cursor-ring');
  // The small dot that sits exactly on the mouse.
  const dot = document.querySelector('.cursor-dot');
  // Latest mouse position on screen (start in the middle of the window).
  const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  // Current ring position; it eases toward the mouse in the animation loop.
  const ringPos = { x: mouse.x, y: mouse.y };
  // Only set up the custom cursor for mouse users.
  if (fine) {
    // Whenever the pointer moves...
    window.addEventListener('pointermove', (e) => {
      // ...remember where it is,
      mouse.x = e.clientX; mouse.y = e.clientY;
      // ...turn on the custom cursor styles,
      document.body.classList.add('has-cursor');
      // ...and move the dot straight to it (CSS transform is fast to animate).
      dot.style.transform = `translate(${mouse.x}px, ${mouse.y}px)`;
    });
    // Hide the custom cursor when the mouse leaves the window.
    document.addEventListener('pointerleave', () => document.body.classList.remove('has-cursor'));
    // Grow the ring (class 'hover') when over something clickable or the 3D landmark canvas.
    document.addEventListener('pointerover', (e) => ring.classList.toggle('hover', !!e.target.closest('a, button, .lm-item, #landmark-canvas')));
  }

  /* ---------------- tiny honk synth ---------------- */
  // The Web Audio "AudioContext" that makes sound; created on first use (browsers require a user click first).
  let actx = null;
  // honk(): play a short two-tone danfo-style horn "beep-beep". No parameters, no return value.
  function honk() {
    // try/catch: if audio isn't available, quietly do nothing.
    try {
      // Create the audio context once (webkitAudioContext is the older Safari name).
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      // Browsers may start audio paused; resume it.
      if (actx.state === 'suspended') actx.resume();
      // The audio clock's current time, used to schedule the notes.
      const t = actx.currentTime;
      // Four notes as [frequency in Hz, start delay in seconds]: two notes together, then again 0.2s later.
      [[392, 0], [494, 0], [392, 0.2], [494, 0.2]].forEach(([f, d]) => {
        // An oscillator generates a tone; a gain node controls its volume.
        const o = actx.createOscillator(), g = actx.createGain();
        // A 'square' wave sounds buzzy like a horn; set its pitch.
        o.type = 'square'; o.frequency.value = f;
        // Start almost silent (exponential ramps can't start from exactly 0).
        g.gain.setValueAtTime(0.0001, t + d);
        // Quickly fade up to a gentle volume...
        g.gain.exponentialRampToValueAtTime(0.05, t + d + 0.02);
        // ...then fade back down so the note ends smoothly without a click.
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.17);
        // Wire it up: oscillator -> volume -> speakers.
        o.connect(g).connect(actx.destination);
        // Schedule the note to start and stop.
        o.start(t + d); o.stop(t + d + 0.2);
      });
    // Ignore any audio errors.
    } catch (e) { /* audio unavailable */ }
  }

  // normalize(obj, size): centre a model and scale it so its biggest side equals 'size'.
  // Parameters: obj – a Three.js object; size – target size in world units.
  // Returns a new Group wrapping the object (rotate/scale the wrapper without touching the model).
  function normalize(obj, size) {
    // A Box3 is the smallest box that fits around the whole model.
    const box = new THREE.Box3().setFromObject(obj);
    // Get the box's width/height/depth (s) and its centre point (c).
    const s = box.getSize(new V3()), c = box.getCenter(new V3());
    // Shift the model so its centre sits at the origin (0,0,0); then it rotates around its middle.
    obj.position.sub(c);
    // Create a wrapper group...
    const wrap = new THREE.Group();
    // ...and put the model inside it.
    wrap.add(obj);
    // Scale evenly so the largest dimension becomes 'size'.
    wrap.scale.setScalar(size / Math.max(s.x, s.y, s.z));
    // Hand back the wrapper.
    return wrap;
  }

  // makeRenderer(canvas, alpha): create a WebGL renderer that draws into a given <canvas>.
  // Parameters: canvas – the canvas element; alpha – true for a transparent background.
  // Returns the configured THREE.WebGLRenderer.
  function makeRenderer(canvas, alpha) {
    // antialias smooths jagged edges.
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha });
    // Use the screen's pixel density for sharpness, capped at 2 to protect performance.
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    // sRGB output makes colours look correct on normal screens.
    r.outputEncoding = THREE.sRGBEncoding;
    // Turn on shadows...
    r.shadowMap.enabled = true;
    // ...with soft edges.
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    // Return the renderer.
    return r;
  }

  /* =========================================================
     HERO: cursor-following, draggable 3D object
     ========================================================= */
  // The hero section (top of page) that receives pointer events.
  const hero = document.querySelector('.hero');
  // The canvas the hero 3D scene is drawn into.
  const heroCanvas = document.getElementById('hero-canvas');
  // The speech bubble element shown when the model is clicked.
  const bubble = document.getElementById('bubble');
  // Renderer for the hero, with transparent background so the page shows behind it.
  const hr = makeRenderer(heroCanvas, true);
  // The scene: a container for everything in the hero 3D world.
  const hScene = new THREE.Scene();
  // A perspective camera: 35° field of view, aspect set later on resize, visible from 0.1 to 200 units.
  const hCam = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
  // Place the camera 20 units back, looking toward the origin.
  hCam.position.set(0, 0, 20);

  // Soft ambient sky/ground light (white from above, purple-grey from below).
  const hHemi = new THREE.HemisphereLight(0xffffff, 0x554466, 0.9);
  // The main "key" light, like the sun, which casts shadows.
  const hKey = new THREE.DirectionalLight(0xffffff, 1.0);
  // Position it up and to the right.
  hKey.position.set(6, 10, 8);
  // Let this light cast shadows.
  hKey.castShadow = true;
  // Shadow texture resolution (higher = sharper shadows).
  hKey.shadow.mapSize.set(1024, 1024);
  // Set the area the shadow covers (the shadow camera's box) to fit the hero scene.
  Object.assign(hKey.shadow.camera, { left: -14, right: 14, top: 10, bottom: -10, near: 1, far: 50 });
  // A pink "rim" light from the back-left for a coloured edge glow.
  const hRim = new THREE.PointLight(0xff385c, 1.4, 60);
  // Place the rim light.
  hRim.position.set(-8, 3, 6);
  // Add all three lights to the scene.
  hScene.add(hHemi, hKey, hRim);

  // An invisible floor that only shows shadows (ShadowMaterial), so the model seems to sit on the page.
  const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.ShadowMaterial({ opacity: 0.12 }));
  // Planes stand upright by default; rotate 90° to lie flat.
  shadowCatcher.rotation.x = -Math.PI / 2;
  // Lower it below the model.
  shadowCatcher.position.y = -4.2;
  // Let shadows fall on it.
  shadowCatcher.receiveShadow = true;
  // Add it to the scene.
  hScene.add(shadowCatcher);

  // 'holder' moves around following the cursor and tilts; 'spinner' inside it handles spin and bounce.
  // Nesting groups lets us combine these motions without them fighting each other.
  const holder = new THREE.Group();
  const spinner = new THREE.Group();
  // Put spinner inside holder...
  holder.add(spinner);
  // ...and holder into the scene.
  hScene.add(holder);

  // The models you can pick in the hero. Each entry has:
  //   make  – function that builds the model,
  //   size  – how big to scale it,
  //   base  – starting rotation [x, y, z] in radians so it faces nicely,
  //   lines – things it "says" in the speech bubble when clicked.
  const HERO_MODELS = [
    // Danfo: the yellow Lagos minibus.
    { make: () => LM.createDanfo(), size: 4.6, base: [0.18, -0.75, 0], lines: ['Oshodi! Oshodi!', 'CMS, enter with your change!', 'Owa o! Owa o!', 'Wole! Wole!', 'Na straight, no shaking!'] },
    // Keke: the tricycle taxi.
    { make: () => LM.createKeke(), size: 3.6, base: [0.18, -0.75, 0], lines: ['Keke dey go Ojuelegba!', 'Shift, make I enter!', 'Na ₦300 o!'] },
    // National Theatre in Iganmu.
    { make: () => LM.createNationalTheatre(), size: 5.4, base: [0.35, 0.6, 0], lines: ['FESTAC ’77 vibes!', 'Welcome to Iganmu!', 'Na military cap I be!'] },
    // NECOM House (the tall tower on Marina).
    { make: () => LM.createNecomHouse(), size: 6.2, base: [0.1, 0.5, 0], lines: ['32 floors of Lagos!', 'Marina view no dey disappoint.', 'NITEL tower, still standing!'] },
    // Tunde, the runner character; flagged isRunner so the loop can animate his waving pose.
    { make: () => { const r = LM.createRunner('tunde'); r.userData.isRunner = true; return r; }, size: 4.2, base: [0.05, Math.PI + 0.4, 0], lines: ['Ẹ kú ojúmọ́!', 'Catch me if you can, LASTMA!', 'How far?'] },
  ];
  // Cache of built hero models (index -> wrapped model), so each is only built once.
  const heroModels = [];
  // Index of the model currently shown.
  let current = 0;
  // "Pop-in" progress from 0 to 1; reset to 0 on model change so it grows into view.
  let pop = 1;

  // heroModel(i): get the hero model for index i, building and caching it on first request.
  // Returns the wrapped (normalized) model group.
  function heroModel(i) {
    // Not built yet?
    if (!heroModels[i]) {
      // Look up its definition.
      const def = HERO_MODELS[i];
      // Build the raw model.
      const raw = def.make();
      // Centre and scale it.
      const wrap = normalize(raw, def.size);
      // Make every mesh (visible shape) in it cast shadows.
      wrap.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      // Keep a reference to the raw model (needed to animate the runner's pose).
      wrap.userData.raw = raw;
      // Store in the cache.
      heroModels[i] = wrap;
    }
    // Return the cached model.
    return heroModels[i];
  }

  // setHeroModel(i): show model number i in the hero. Wraps around past either end.
  // Side effects: swaps the model, restarts the pop-in, highlights the matching pill button.
  function setHeroModel(i) {
    // Wrap the index (e.g. -1 becomes the last, 5 becomes 0).
    current = (i + HERO_MODELS.length) % HERO_MODELS.length;
    // Remove the previous model from the spinner.
    spinner.clear();
    // Get (or build) the new one.
    const m = heroModel(current);
    // Apply its nice starting rotation.
    const b = HERO_MODELS[current].base;
    m.rotation.set(b[0], b[1], b[2]);
    // Show it.
    spinner.add(m);
    // Restart the pop-in animation.
    pop = 0;
    // Mark the matching picker pill as active (+ turns the data-model string into a number).
    document.querySelectorAll('.pill[data-model]').forEach((p) => p.classList.toggle('active', +p.dataset.model === current));
  }
  // Start with the first model (the danfo).
  setHeroModel(0);
  // Clicking a picker pill shows that model and gives it a silent bounce.
  document.querySelectorAll('.pill[data-model]').forEach((p) => p.addEventListener('click', () => { setHeroModel(+p.dataset.model); poke(true); }));

  /* background naira coins */
  // Coins that slowly circle in the background of the hero.
  const bgCoins = [];
  // Make 9 of them.
  for (let i = 0; i < 9; i++) {
    // Build a coin model.
    const c = LM.createCoin();
    // Random size (LM.rnd(a, b) returns a random number between a and b).
    c.scale.setScalar(LM.rnd(0.9, 1.6));
    // Store each coin's orbit: start angle a (evenly spread), radius r, height y, speed sp, depth z.
    c.userData = { a: (i / 9) * Math.PI * 2, r: LM.rnd(5, 11), y: LM.rnd(-3.5, 4), sp: LM.rnd(0.05, 0.14), z: LM.rnd(-12, -4) };
    // Add to the scene...
    hScene.add(c);
    // ...and to our list so the loop can move it.
    bgCoins.push(c);
  }

  /* coin burst particles */
  // A pool of coins that fly out when the model is clicked (made once and reused, which is cheaper).
  const burst = [];
  // Make 22 of them.
  for (let i = 0; i < 22; i++) {
    // Build a coin.
    const c = LM.createCoin();
    // Hidden until a burst happens.
    c.visible = false;
    // v = velocity (speed and direction), life = seconds left before it disappears.
    c.userData = { v: new V3(), life: 0 };
    // Add to scene and pool.
    hScene.add(c);
    burst.push(c);
  }

  // Size of the visible area (in world units) at the model's depth; computed in resizeHero().
  const view = { w: 1, h: 1 };
  // Pointer position in "normalized device coordinates" (NDC): -1..1 across the canvas, +1 at the top.
  const ndc = new THREE.Vector2();
  // Where the holder is trying to move to (follows the cursor).
  const target = new V3();
  // The resting spot when the cursor isn't over the hero.
  const rest = new V3();
  // Holder position last frame (to compute how fast it moves).
  const prevPos = new V3();
  // A Raycaster shoots an invisible ray from the camera through the pointer to see what 3D object it hits.
  const ray = new THREE.Raycaster();
  // true while a mouse is over the hero (so the model follows it).
  let pointerInside = false;
  // Drag state: are we dragging, total pixels moved, and last pointer x/y.
  let dragging = false, dragMoved = 0, lastX = 0, lastY = 0;
  // Spin speed around x and y (keeps spinning after a drag, slowly slowing down).
  const spinVel = { x: 0, y: 0 };
  // Bounce height and vertical speed (for the jump when clicked).
  let bounceY = 0, bounceV = 0;
  // true on wide (desktop) layouts, where the model sits to the right of the text.
  let wide = true;

  // resizeHero(): fit the renderer and camera to the hero's current size and recompute layout values.
  function resizeHero() {
    // Current hero size in CSS pixels.
    const w = hero.clientWidth, h = hero.clientHeight;
    // Resize the drawing buffer (false = don't change the canvas's CSS size).
    hr.setSize(w, h, false);
    // Match the camera's aspect ratio to avoid stretching.
    hCam.aspect = w / h;
    // Treat wider than 860px as a desktop layout.
    wide = w > 860;
    // Move the camera further back on narrow screens so the model fits.
    hCam.position.z = wide ? 20 : 24;
    // Apply the camera changes.
    hCam.updateProjectionMatrix();
    // Visible height at distance z: 2 * tan(fov/2) * z (fov is in degrees; *PI/360 = half-angle in radians).
    view.h = 2 * Math.tan((hCam.fov * Math.PI) / 360) * hCam.position.z;
    // Visible width = height * aspect ratio.
    view.w = view.h * hCam.aspect;
    // Resting spot: right side on desktop, lower-centre on mobile.
    rest.set(wide ? view.w * 0.24 : 0, wide ? 0.2 : -view.h * 0.22, 0);
    // If nobody is pointing at the hero, send the model to its resting spot.
    if (!pointerInside) target.copy(rest);
  }
  // A ResizeObserver calls resizeHero whenever the hero element changes size.
  new ResizeObserver(resizeHero).observe(hero);
  // Run once now.
  resizeHero();
  // Start the model at its resting spot (no slide-in on load).
  holder.position.copy(rest);

  // setNDC(e): convert a pointer event's screen position into NDC (-1..1) relative to the hero canvas.
  function setNDC(e) {
    // The canvas's position and size on screen.
    const r = heroCanvas.getBoundingClientRect();
    // x: left edge -> -1, right edge -> +1. y is flipped because screen y grows downward but 3D y grows upward.
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  // hitModel(): returns true if the pointer (current ndc) is over the hero model.
  function hitModel() {
    // Aim the ray from the camera through the pointer position.
    ray.setFromCamera(ndc, hCam);
    // Check the spinner and all its children (true = recursive); any hit means "over the model".
    return ray.intersectObject(spinner, true).length > 0;
  }

  // Pointer moving over the hero: either drag-spin the model or make it follow the cursor.
  hero.addEventListener('pointermove', (e) => {
    // Update the pointer's NDC position.
    setNDC(e);
    // While dragging, rotate the model instead of moving it.
    if (dragging) {
      // How far the pointer moved since last event, in pixels.
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      // Remember the new position for next time.
      lastX = e.clientX; lastY = e.clientY;
      // Add to the total distance (used to tell a click from a drag).
      dragMoved += Math.abs(dx) + Math.abs(dy);
      // Convert pixel movement to spin speed (keeps spinning after release).
      spinVel.y = dx * 0.012; spinVel.x = dy * 0.008;
      // Spin left/right.
      spinner.rotation.y += spinVel.y;
      // Tilt up/down, clamped (limited) so it can't flip upside down.
      spinner.rotation.x = THREE.MathUtils.clamp(spinner.rotation.x + spinVel.x, -1.1, 1.1);
      // Don't also do the follow behaviour below.
      return;
    }
    // Follow only for mouse/pen (on touch screens there's no hovering).
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      // The pointer is over the hero.
      pointerInside = true;
      // Margins so the model stays fully inside the visible area.
      const mx = view.w / 2 - 2.2, my = view.h / 2 - 2;
      // Convert NDC to world units and clamp inside the margins: this is where the model will glide to.
      target.set(THREE.MathUtils.clamp((ndc.x * view.w) / 2, -mx, mx), THREE.MathUtils.clamp((ndc.y * view.h) / 2, -my, my), 0);
      // Show a "grab" hand cursor when hovering the model itself.
      if (e.target === heroCanvas) heroCanvas.style.cursor = hitModel() ? 'grab' : '';
    }
  });
  // Pointer left the hero: send the model back to rest.
  hero.addEventListener('pointerleave', () => { pointerInside = false; target.copy(rest); });

  // Pressing on the hero canvas: start a drag if on the model; on touch, tapping elsewhere moves the model there.
  heroCanvas.addEventListener('pointerdown', (e) => {
    // Update the pointer's NDC position.
    setNDC(e);
    // A finger tap that missed the model:
    if (e.pointerType === 'touch' && !hitModel()) {
      // Margins to keep the model on screen.
      const mx = view.w / 2 - 2, my = view.h / 2 - 2;
      // Move the model toward the tap.
      target.set(THREE.MathUtils.clamp((ndc.x * view.w) / 2, -mx, mx), THREE.MathUtils.clamp((ndc.y * view.h) / 2, -my, my), 0);
      // Treat it like hovering for now.
      pointerInside = true;
      // Cancel any earlier "go back" timer (stored on the canvas as _t).
      clearTimeout(heroCanvas._t);
      // After 2.5 seconds, send the model back to its resting spot.
      heroCanvas._t = setTimeout(() => { pointerInside = false; target.copy(rest); }, 2500);
      // Done; no drag.
      return;
    }
    // Mouse press that missed the model: nothing to do.
    if (!hitModel()) return;
    // Start dragging and reset the moved distance.
    dragging = true; dragMoved = 0;
    // Remember where the drag started.
    lastX = e.clientX; lastY = e.clientY;
    // Pointer capture: keep receiving move/up events even if the pointer leaves the canvas.
    heroCanvas.setPointerCapture(e.pointerId);
    // Show the "closed hand" cursor.
    heroCanvas.style.cursor = 'grabbing';
  });
  // endDrag(e): finish a drag. A tiny movement (< 6px) counts as a click and "pokes" the model.
  const endDrag = (e) => {
    // Not dragging, nothing to finish.
    if (!dragging) return;
    // Stop dragging.
    dragging = false;
    // Back to the open-hand cursor.
    heroCanvas.style.cursor = 'grab';
    // Barely moved: treat it as a click.
    if (dragMoved < 6) poke();
    // Release the pointer capture (ignore errors if it was already released).
    try { heroCanvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  };
  // Releasing or cancelling the pointer ends the drag.
  heroCanvas.addEventListener('pointerup', endDrag);
  heroCanvas.addEventListener('pointercancel', endDrag);
  // Double-click switches to the next model.
  heroCanvas.addEventListener('dblclick', () => { setHeroModel(current + 1); poke(true); });

  // Timer id for hiding the speech bubble.
  let bubbleTimer = 0;
  // poke(silent): make the model jump, spin and burst coins. Unless silent is true,
  // also play the honk and show a random speech bubble line.
  function poke(silent) {
    // Launch upward.
    bounceV = 9;
    // Add a spin kick.
    spinVel.y += 0.35;
    // Fire every coin in the burst pool from the model's position.
    burst.forEach((c) => {
      // Show it.
      c.visible = true;
      // Start at the model.
      c.position.copy(holder.position);
      // Random outward/upward velocity.
      c.userData.v.set(LM.rnd(-7, 7), LM.rnd(5, 12), LM.rnd(-3, 5));
      // Random lifetime of 1–1.6 seconds.
      c.userData.life = LM.rnd(1, 1.6);
      // Random size.
      c.scale.setScalar(LM.rnd(0.8, 1.3));
    });
    // Silent pokes stop here (no sound, no bubble).
    if (silent) return;
    // Play the horn.
    honk();
    // Pick a random line for the current model and show it in the bubble.
    const lines = HERO_MODELS[current].lines;
    bubble.textContent = lines[Math.floor(Math.random() * lines.length)];
    bubble.classList.add('show');
    // Restart the hide timer: hide the bubble after 1.8 seconds.
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove('show'), 1800);
  }

  // placeBubble(): position the speech bubble on screen just above the 3D model.
  function placeBubble() {
    // Only needed while the bubble is visible.
    if (!bubble.classList.contains('show')) return;
    // Copy the model's 3D position (clone so we don't move the model itself).
    const p = holder.position.clone();
    // A bit above the model.
    p.y += 2.6;
    // project() converts a 3D point into NDC (-1..1) as seen by the camera.
    p.project(hCam);
    // Convert NDC x to pixels from the left edge.
    bubble.style.left = `${((p.x + 1) / 2) * hero.clientWidth}px`;
    // Convert NDC y to pixels from the top (flip, since screen y goes down).
    bubble.style.top = `${((1 - p.y) / 2) * hero.clientHeight}px`;
  }

  // Track whether the hero is on screen; when it isn't, skip drawing it to save battery/CPU.
  let heroVisible = true;
  new IntersectionObserver(([en]) => { heroVisible = en.isIntersecting; }).observe(hero);

  /* =========================================================
     LANDMARK VIEWER
     ========================================================= */
  // The canvas for the landmark explorer.
  const lmCanvas = document.getElementById('landmark-canvas');
  // Its container (we size the canvas to it).
  const viewer = lmCanvas.parentElement;
  // A separate renderer, scene and camera for the landmark viewer.
  const vr = makeRenderer(lmCanvas, true);
  const vScene = new THREE.Scene();
  const vCam = new THREE.PerspectiveCamera(38, 1, 0.1, 500);
  // Ambient sky/ground light.
  const vHemi = new THREE.HemisphereLight(0xffffff, 0x665544, 0.9);
  // Main shadow-casting sun light.
  const vKey = new THREE.DirectionalLight(0xffffff, 1.0);
  // Place it high up.
  vKey.position.set(10, 18, 12);
  // Enable shadows with a 1024x1024 shadow texture.
  vKey.castShadow = true;
  vKey.shadow.mapSize.set(1024, 1024);
  // Shadow area sized to fit the turntable.
  Object.assign(vKey.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 60 });
  // Add the lights.
  vScene.add(vHemi, vKey);
  // The round display base (a flat cylinder) the landmark stands on. LM.mat makes a material (surface look).
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.8, 0.5, 64), LM.mat(0xe9e3d8, { roughness: 0.9 }));
  // Lower it so its top is at y = 0.
  disc.position.y = -0.25;
  // Shadows fall on it.
  disc.receiveShadow = true;
  // Add it.
  vScene.add(disc);
  // A glowing pink ring (torus = doughnut shape) around the edge of the disc.
  const discRing = new THREE.Mesh(new THREE.TorusGeometry(8.65, 0.08, 8, 96), LM.mat(0xff385c, { emissive: 0xff385c, emissiveIntensity: 0.6 }));
  // Lay it flat.
  discRing.rotation.x = Math.PI / 2;
  // Add it.
  vScene.add(discRing);

  // The group holding the current landmark (used for the pop-in animation).
  const turntable = new THREE.Group();
  vScene.add(turntable);
  // Cache of built landmark models (index -> model).
  const lmCache = {};
  // Current landmark index, and its pop-in progress (0..1).
  let lmIndex = 0, lmPop = 1;
  // Camera orbit state: yaw (angle around), pitch (angle up), vy (spin speed),
  // dragging flag, last pointer x/y, and idle (seconds since last drag, for auto-rotate).
  const orbit = { yaw: 0.6, pitch: 0.38, vy: 0, dragging: false, lx: 0, ly: 0, idle: 0 };

  // The list where the landmark tab buttons go.
  const list = document.getElementById('lm-list');
  // Make one tab button per landmark (LANDMARK_INFO comes from models.js).
  LM.LANDMARK_INFO.forEach((info, i) => {
    // Create the button.
    const b = document.createElement('button');
    b.className = 'lm-item';
    // role="tab" tells screen readers these behave like tabs.
    b.setAttribute('role', 'tab');
    // Content: a two-digit number (01, 02...), the name and the place.
    b.innerHTML = `<span class="num">${String(i + 1).padStart(2, '0')}</span><span><strong>${info.name}</strong><small>${info.place}</small></span>`;
    // Clicking shows that landmark.
    b.addEventListener('click', () => showLandmark(i));
    // Put it in the list.
    list.appendChild(b);
  });

  // landmarkModel(i): get landmark i's model, building it once and caching it.
  // Returns a model scaled to size 14 and standing on the disc.
  function landmarkModel(i) {
    // Not built yet?
    if (!lmCache[i]) {
      // Build the raw model.
      const raw = LM.LANDMARK_INFO[i].make();
      // Centre and scale to size 14.
      const wrap = normalize(raw, 14);
      // Measure it...
      const box = new THREE.Box3().setFromObject(wrap);
      // ...and lift it so its lowest point touches y = 0 (the top of the disc).
      wrap.position.y = -box.min.y;
      // Save it.
      lmCache[i] = wrap;
    }
    // Return the cached model.
    return lmCache[i];
  }

  // showLandmark(i): switch the viewer to landmark i and update the text and tabs.
  function showLandmark(i) {
    // Remember the selection.
    lmIndex = i;
    // Look up its info (name, place, fact).
    const info = LM.LANDMARK_INFO[i];
    // Swap the model on the turntable.
    turntable.clear();
    turntable.add(landmarkModel(i));
    // Restart the pop-in animation.
    lmPop = 0;
    // Fill in the text panel.
    document.getElementById('lm-name').textContent = info.name;
    document.getElementById('lm-place').textContent = info.place;
    document.getElementById('lm-fact').textContent = info.fact;
    // Highlight the chosen tab and set aria-selected for screen readers.
    list.querySelectorAll('.lm-item').forEach((el, k) => { el.classList.toggle('active', k === i); el.setAttribute('aria-selected', String(k === i)); });
    // The chosen tab element.
    const active = list.children[i];
    // If the tab list scrolls sideways (small screens), smoothly scroll the chosen tab into view.
    if (active && list.scrollWidth > list.clientWidth) list.scrollTo({ left: active.offsetLeft - 10, behavior: 'smooth' });
  }

  // resizeViewer(): fit the landmark renderer and camera to the container size.
  function resizeViewer() {
    // Container size.
    const w = viewer.clientWidth, h = viewer.clientHeight;
    // Resize the drawing buffer.
    vr.setSize(w, h, false);
    // Update the camera's aspect ratio and apply it.
    vCam.aspect = w / h;
    vCam.updateProjectionMatrix();
  }
  // Re-fit whenever the container resizes, and once now.
  new ResizeObserver(resizeViewer).observe(viewer);
  resizeViewer();

  // Pressing on the viewer starts orbiting: remember the start point and capture the pointer.
  lmCanvas.addEventListener('pointerdown', (e) => { orbit.dragging = true; orbit.lx = e.clientX; orbit.ly = e.clientY; lmCanvas.setPointerCapture(e.pointerId); });
  // Moving while pressed rotates the camera around the landmark.
  lmCanvas.addEventListener('pointermove', (e) => {
    // Ignore moves when not dragging.
    if (!orbit.dragging) return;
    // Pixels moved since last event.
    const dx = e.clientX - orbit.lx, dy = e.clientY - orbit.ly;
    // Remember the new position.
    orbit.lx = e.clientX; orbit.ly = e.clientY;
    // Horizontal movement becomes spin speed (so it keeps gliding after release)...
    orbit.vy = dx * 0.008;
    // ...and is applied to the yaw now.
    orbit.yaw += orbit.vy;
    // Vertical movement tilts the camera, limited so it stays above the ground and not straight overhead.
    orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + dy * 0.005, 0.05, 1.1);
    // The user is active, so reset the auto-rotate idle timer.
    orbit.idle = 0;
  });
  // Stop orbiting when the pointer is released or cancelled.
  const stopOrbit = () => { orbit.dragging = false; };
  lmCanvas.addEventListener('pointerup', stopOrbit);
  lmCanvas.addEventListener('pointercancel', stopOrbit);

  // Only draw the viewer while it is on screen (tracked by an IntersectionObserver).
  let viewerVisible = false;
  new IntersectionObserver(([en]) => { viewerVisible = en.isIntersecting; }).observe(viewer);
  // Show the first landmark to begin.
  showLandmark(0);

  /* =========================================================
     RUNNER THUMBNAILS (rendered once, offscreen)
     ========================================================= */
  // renderThumbs(): draw each runner character once into a hidden canvas and use the
  // result as the picture for <img data-runner="..."> tags. Cheaper than live 3D for every card.
  function renderThumbs() {
    // Find all runner image placeholders.
    const imgs = document.querySelectorAll('img[data-runner]');
    // None on this page: nothing to do.
    if (!imgs.length) return;
    // A canvas that is never added to the page ("offscreen").
    const c = document.createElement('canvas');
    // preserveDrawingBuffer keeps the drawn image around so we can read it with toDataURL.
    const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
    // Fixed size output: 420x520 pixels.
    r.setPixelRatio(1);
    r.setSize(420, 520, false);
    // Correct colours.
    r.outputEncoding = THREE.sRGBEncoding;
    // A small scene with soft ambient light...
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0x775544, 1.0));
    // ...plus a directional light.
    const d = new THREE.DirectionalLight(0xffffff, 0.9);
    d.position.set(2, 4, -5);
    sc.add(d);
    // A camera matching the image's shape, placed in front of the character and aimed at chest height.
    const cam = new THREE.PerspectiveCamera(30, 420 / 520, 0.1, 50);
    cam.position.set(1.1, 1.25, -4.1);
    cam.lookAt(0, 0.95, 0);
    // For each image placeholder:
    imgs.forEach((img) => {
      // Build the named character (e.g. data-runner="tunde").
      const fig = LM.createRunner(img.dataset.runner);
      // Run the pose animation for 30 small steps so the character settles into the waving pose.
      for (let i = 0; i < 30; i++) LM.poseRunner(fig, 0.6, 'wave', 0.05);
      // Turn slightly for a nicer angle.
      fig.rotation.y = -0.25;
      // Add, draw once, and save the picture as a PNG data URL into the <img>.
      sc.add(fig);
      r.render(sc, cam);
      img.src = c.toDataURL('image/png');
      // Remove the character before drawing the next one.
      sc.remove(fig);
    });
    // Free the renderer's GPU memory...
    r.dispose();
    // ...and release the WebGL context (browsers allow only a limited number at once).
    if (r.forceContextLoss) r.forceContextLoss();
  }
  // Wait for web fonts to finish loading if the browser supports it (keeps page load smooth), otherwise render now.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(renderThumbs); else renderThumbs();

  /* =========================================================
     THEME
     ========================================================= */
  // applyTheme(): adjust 3D lighting and colours for the current light/dark theme.
  function applyTheme() {
    // Is dark mode on?
    const dark = isDark();
    // Tell models.js to switch shared materials to night look (e.g. glowing windows).
    LM.setNight(dark);
    // Hero: dimmer ambient and key light at night, stronger pink rim glow, darker shadows.
    hHemi.intensity = dark ? 0.55 : 0.9;
    hKey.intensity = dark ? 0.55 : 1.0;
    hRim.intensity = dark ? 2.2 : 1.4;
    shadowCatcher.material.opacity = dark ? 0.3 : 0.12;
    // Viewer: dimmer lights, a cool blue moonlight tint, and a dark disc.
    vHemi.intensity = dark ? 0.45 : 0.9;
    vKey.intensity = dark ? 0.45 : 1.0;
    vHemi.color.set(dark ? 0x9fb0ff : 0xffffff);
    disc.material.color.set(dark ? 0x2a2a33 : 0xe9e3d8);
  }
  // Re-apply whenever theme.js announces a change (its custom 'themechange' event)...
  window.addEventListener('themechange', applyTheme);
  // ...and once now for the starting theme.
  applyTheme();

  /* =========================================================
     LOOP
     ========================================================= */
  // A clock measures time between frames so motion speed doesn't depend on frame rate.
  const clock = new THREE.Clock();
  // Total elapsed seconds (drives gentle bobbing and waving).
  let t = 0;
  // loop(): runs about 60 times per second; updates and draws everything.
  function loop() {
    // requestAnimationFrame asks the browser to call loop again before the next screen repaint.
    requestAnimationFrame(loop);
    // dt = seconds since last frame, capped at 0.05 so a long pause (e.g. tab switch) doesn't cause a huge jump.
    const dt = Math.min(clock.getDelta(), 0.05);
    // Add to total time.
    t += dt;

    // Custom cursor ring: move a fraction of the remaining distance each frame (an "easing"
    // that makes it trail smoothly behind the mouse). Math.min keeps the fraction ≤ 1.
    if (fine) {
      ringPos.x += (mouse.x - ringPos.x) * Math.min(1, dt * 14);
      ringPos.y += (mouse.y - ringPos.y) * Math.min(1, dt * 14);
      // Apply the new position.
      ring.style.transform = `translate(${ringPos.x}px, ${ringPos.y}px)`;
    }

    // ---- Hero (only when on screen) ----
    if (heroVisible) {
      // Remember last frame's position to work out speed.
      prevPos.copy(holder.position);
      // "lerp" (linear interpolation) moves part of the way toward the target. Using 1 - exp(-dt*k)
      // makes the glide feel the same at any frame rate; slower when reduced motion is requested.
      if (!dragging) holder.position.lerp(target, 1 - Math.exp(-dt * (reduceMotion ? 1.5 : 3.2)));
      // Current velocity (units per second) in x and y; max() avoids dividing by zero.
      const vx = (holder.position.x - prevPos.x) / Math.max(dt, 1e-3);
      const vy = (holder.position.y - prevPos.y) / Math.max(dt, 1e-3);

      // How much to turn to "look" toward the cursor/target.
      const look = (target.x - holder.position.x) * 0.06 + ndc.x * 0.35;
      // Ease the turn toward that look angle.
      holder.rotation.y += (look - holder.rotation.y) * Math.min(1, dt * 4);
      // Lean sideways when moving left/right (like a vehicle cornering), limited to ±0.45.
      holder.rotation.z += (THREE.MathUtils.clamp(-vx * 0.04, -0.45, 0.45) - holder.rotation.z) * Math.min(1, dt * 6);
      // Tip forward/back with vertical movement, and tilt slightly toward the pointer's height.
      holder.rotation.x += (THREE.MathUtils.clamp(-vy * 0.03, -0.35, 0.35) - ndc.y * 0.12 - holder.rotation.x) * Math.min(1, dt * 6);

      // When not being dragged, let leftover spin play out.
      if (!dragging) {
        // Apply the spin speed.
        spinner.rotation.y += spinVel.y;
        // Slow the spin down over time (friction that's independent of frame rate).
        spinVel.y *= Math.pow(0.04, dt);
        // Ease any up/down tilt back to level.
        spinner.rotation.x += (0 - spinner.rotation.x) * Math.min(1, dt * 1.5);
        // Once spin has nearly stopped, slowly turn on its own (unless reduced motion).
        if (Math.abs(spinVel.y) < 0.001 && !reduceMotion) spinner.rotation.y += dt * 0.12;
      }

      // Simple physics bounce: gravity pulls speed down...
      bounceV -= 30 * dt;
      // ...speed changes height.
      bounceY += bounceV * dt;
      // Hit the "floor": bounce back at 35% speed, or stop if too slow.
      if (bounceY < 0) { bounceY = 0; bounceV = Math.abs(bounceV) > 2 ? -bounceV * 0.35 : 0; }
      // Apply the bounce plus a gentle floating bob (sine wave).
      spinner.position.y = bounceY + Math.sin(t * 1.6) * 0.18;

      // Ease pop toward 1.
      pop += (1 - pop) * Math.min(1, dt * 7);
      // Grow from 40% to full size with a slight overshoot in the middle (the sin term) for a springy pop.
      spinner.scale.setScalar(0.4 + 0.6 * pop + Math.sin(pop * Math.PI) * 0.12);

      // If the current hero model is the runner, animate his waving pose.
      const raw = heroModels[current] && heroModels[current].userData.raw;
      if (raw && raw.userData.isRunner) LM.poseRunner(raw, t * 2, 'wave', dt);

      // Move each background coin along its circle.
      bgCoins.forEach((c) => {
        // This coin's orbit settings.
        const u = c.userData;
        // Advance its angle.
        u.a += u.sp * dt;
        // Position on the circle (cos/sin), with a gentle up-down wave.
        c.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(t + u.a * 3) * 0.4, u.z);
        // Spin the coin.
        c.rotation.y += dt * 1.5;
      });
      // Update the burst coins.
      burst.forEach((c) => {
        // This coin's velocity and life.
        const u = c.userData;
        // Out of life: hide it and skip.
        if (u.life <= 0) { c.visible = false; return; }
        // Count down its life.
        u.life -= dt;
        // Gravity pulls it down.
        u.v.y -= 22 * dt;
        // Move by velocity * time.
        c.position.addScaledVector(u.v, dt);
        // Tumble it.
        c.rotation.x += dt * 8; c.rotation.y += dt * 6;
        // Shrink during its last 0.3 seconds.
        if (u.life < 0.3) c.scale.multiplyScalar(0.9);
      });
      // Keep the shadow light offset from the model and aimed at it so the shadow follows.
      hKey.position.set(holder.position.x + 6, 10, 8);
      hKey.target.position.copy(holder.position);
      // The light's target isn't in the scene, so update its world position manually.
      hKey.target.updateMatrixWorld();
      // Keep the speech bubble above the model.
      placeBubble();
      // Draw the hero scene.
      hr.render(hScene, hCam);
    }

    // ---- Landmark viewer (only when on screen) ----
    if (viewerVisible) {
      // When not being dragged:
      if (!orbit.dragging) {
        // Count idle time.
        orbit.idle += dt;
        // Keep gliding with leftover spin...
        orbit.yaw += orbit.vy;
        // ...which slows down over time.
        orbit.vy *= Math.pow(0.05, dt);
        // After 1.5 idle seconds, slowly rotate automatically (unless reduced motion).
        if (orbit.idle > 1.5 && !reduceMotion) orbit.yaw += dt * 0.25;
      }
      // Ease the landmark pop-in toward 1.
      lmPop += (1 - lmPop) * Math.min(1, dt * 6);
      // Grow from 60% to full size...
      turntable.scale.setScalar(0.6 + 0.4 * lmPop);
      // ...while unwinding a small twist, for a swirl-in effect.
      turntable.rotation.y = (1 - lmPop) * -0.8;
      // Camera distance from the centre.
      const R = 30;
      // Place the camera on a sphere of radius R using yaw/pitch angles (spherical -> x, y, z via sin/cos).
      vCam.position.set(Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * R, 4 + Math.sin(orbit.pitch) * R, Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * R);
      // Aim at a point slightly above the disc.
      vCam.lookAt(0, 3, 0);
      // Draw the landmark scene.
      vr.render(vScene, vCam);
    }
  }
  // Start the animation loop.
  loop();
// Close and immediately call the wrapping function.
})();
