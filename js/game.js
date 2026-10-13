// =====================================================================
// EKO RUSH - js/game.js  (the main game engine)
// =====================================================================
// Eko Rush is a 3D "endless runner" (like Subway Surfers) set on the
// streets of Lagos, Nigeria. You run down a road, switch between 3 lanes,
// jump, roll and fly a jetpack while dodging danfo buses, BRT buses,
// keke tricycles and barriers, collecting coins and power-ups, and staying
// ahead of the LASTMA traffic officer who chases you.

// This file uses Three.js (version r149), a 3D library loaded on the page
// as the global variable `THREE`. Other files it relies on:
// - js/models.js -> window.LagosModels (LM): builds all the 3D models
// (buses, buildings, the runner, coins...) out of simple shapes in code.
// - js/pvp.js    -> window.EkoPvP (PvP): 2-player online races using
// PeerJS (WebRTC = direct browser-to-browser connection).
// - js/theme.js  -> switches the page between light and dark theme.

// HOW THIS FILE IS ORGANIZED (top to bottom):
// 1.  Constants & a tiny localStorage helper (saves settings/high scores)
// 2.  SOUND      - all sound effects + music made live with WebAudio
// (no audio files; tones and noise are generated in code)
// 3.  RENDERER / SCENE - the WebGL renderer, camera, lights, sky
// 4.  Ground, road & sidewalks whose textures scroll to fake motion
// 5.  OUTLINES   - black cartoon outlines around models (addOutline)
// 6.  MERGING    - bake / bakeRig / mergeMeshes: combine many small meshes
// into a few big ones so the GPU has less work (fewer "draw calls")
// 7.  PROTOTYPES - one master copy of every model, cloned when needed
// 8.  STATE      - all variables that describe the current run
// 9.  Seeded random numbers (mulberry32) so PvP rivals get the same course
// 10. EFFECTS    - dust puffs and speed-line streaks
// 11. SPAWNING   - creating scenery, landmarks, obstacles, coins, power-ups
// 12. PLAYER     - lanes, jumping, rolling, jetpack flight, collisions
// 13. The LASTMA chaser, the camera, the HUD (score display) and menus
// 14. PvP race flow, keyboard + touch-swipe input, theme, window resize
// 15. The main frame loop that runs ~60 times a second and ties it together

// KEY IDEAS FOR BEGINNERS:
// - "dt" (delta time) = seconds since the last frame (e.g. 0.016). Moving
// things by speed * dt keeps the game the same speed on fast and slow PCs.
// - The whole file is wrapped in (function () { ... })(); - an "IIFE".
// It runs once immediately and keeps all variables private so they can't
// clash with variables from other scripts.
// =====================================================================

/* Eko Rush – game engine */
(function () {
  // Strict mode: makes JavaScript throw errors for common silent mistakes.
  'use strict';
  // Short name for the 3D model library from js/models.js.
  const LM = window.LagosModels;
  // Short name for the multiplayer (player-vs-player) helper from js/pvp.js.
  const PvP = window.EkoPvP;
  // Shortcut: $('#id') finds the first page element matching a CSS selector.
  const $ = (s) => document.querySelector(s);
  // Shortcut for THREE.Vector3, a 3D point/direction with x, y, z.
  const V3 = THREE.Vector3;
  // X positions of the 3 lanes: left, middle, right (in world units, ~metres).
  const LANES = [-2.2, 0, 2.2];
  // Physics tuning: G = gravity pulling the player down, JUMP_V / SUPER_JUMP_V =
  // upward launch speed for a normal jump / a jump with super sneakers,
  // ROLL_TIME = seconds a roll lasts, FLY_Y = height the jetpack flies at.
  const G = 40, JUMP_V = 12.6, SUPER_JUMP_V = 17.5, ROLL_TIME = 0.65, FLY_Y = 7.6;
  // The four power-ups: how many seconds each lasts and its on-screen name.
  const POWER = {
    // Magnet pulls nearby coins towards you.
    magnet: { time: 12, label: 'Magnet' },
    // Super sneakers let you jump much higher.
    shoes: { time: 12, label: 'Super sneakers' },
    // 2X doubles the points you earn.
    x2: { time: 15, label: '2X score' },
    // Jetpack lifts you above the traffic to fly over everything.
    jet: { time: 8, label: 'Jetpack' },
  };
  // Tiny wrapper around localStorage (the browser's permanent key/value storage).
  // try/catch is used because storage can be blocked (e.g. private mode);
  // then we just fall back to the default instead of crashing.
  const store = {
    // get(key, default): read a saved value, or return the default if missing/blocked.
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    // set(key, value): save a value; silently ignore any storage error.
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };

  // ---------------------------------------------------------------------
  // SOUND: every sound is synthesized with the WebAudio API. An "oscillator"
  // makes a pure tone (beep), a "noise buffer" makes hiss (crashes, drums),
  // and "gain" nodes act like volume knobs. Sound is an IIFE that returns an
  // object of functions like Sound.coin() or Sound.jump().
  // ---------------------------------------------------------------------
  /* =================== SOUND =================== */
  const Sound = (() => {
    // ctx = the audio engine; master = main volume knob; music = music volume knob;
    // timer/nextT/step = music sequencer bookkeeping; noiseBuf = reusable hiss sample;
    // jetSrc/jetGain = the looping jetpack roar and its volume knob.
    let ctx = null, master = null, music = null, timer = null, nextT = 0, step = 0, noiseBuf = null, jetSrc = null, jetGain = null;
    // Remember whether the player muted the game last time ('1' means muted).
    let muted = store.get('ekorush-muted', '0') === '1';
    // ensure(): create the audio engine the first time it's needed and wake it up.
    // Browsers only allow audio after a user click/tap, so this is called lazily.
    // Returns the AudioContext, or null if the browser has no WebAudio.
    function ensure() {
      // Only build the audio graph once.
      if (!ctx) {
        // Older Safari calls it webkitAudioContext.
        const AC = window.AudioContext || window.webkitAudioContext;
        // No audio support at all: give up quietly (game still works silently).
        if (!AC) return null;
        // Create the audio engine.
        ctx = new AC();
        // Master volume: 0 when muted, otherwise 0.7, connected to the speakers.
        master = ctx.createGain(); master.gain.value = muted ? 0 : 0.7; master.connect(ctx.destination);
        // Music goes through its own quieter knob (0.3) and then the master knob.
        music = ctx.createGain(); music.gain.value = 0.3; music.connect(master);
      }
      // Browsers start audio "suspended" until the user interacts; resume it.
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    // now(): the audio clock's current time in seconds (0 if no audio).
    // Sounds are scheduled on this clock for precise timing.
    const now = () => (ensure() ? ctx.currentTime : 0);
    // getNoise(c): build (once) and return half a second of random "white noise".
    // Param c = AudioContext. Reused by drums, crashes, whooshes and the jetpack.
    function getNoise(c) {
      if (!noiseBuf) {
        // Mono buffer, 0.5 s long (sampleRate samples per second * 0.5).
        noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
        // Get the raw sample array so we can fill it.
        const d = noiseBuf.getChannelData(0);
        // Fill with random values between -1 and 1 = static/hiss.
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      return noiseBuf;
    }
    // tone(): play one synthesized note.
    // f = start pitch (Hz), dur = length (s), type = wave shape ('sine' smooth,
    // 'square'/'sawtooth' buzzy), vol = loudness, f2 = optional end pitch for a
    // slide, at = audio-clock start time (0 = now), dest = output (default master).
    function tone(f, dur, type = 'sine', vol = 0.1, f2 = 0, at = 0, dest = null) {
      // Make sure audio exists; bail out if not.
      const c = ensure(); if (!c) return;
      // Start time: the requested time or right now.
      const t0 = at || c.currentTime;
      // o = the oscillator (sound source); g = a gain node (its volume envelope).
      const o = c.createOscillator(), g = c.createGain();
      // Wave shape.
      o.type = type;
      // Starting pitch.
      o.frequency.setValueAtTime(f, t0);
      // Optionally slide the pitch to f2 by the end (e.g. a rising "boing" for jump).
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
      // Volume envelope: start almost silent, quickly rise to vol in 10 ms
      // (avoids a click), then fade back to silence by the end. Exponential ramps
      // can't reach exactly 0, so 0.0001 is used as "silent".
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      // Wire it up: oscillator -> volume -> destination.
      o.connect(g); g.connect(dest || master);
      // Start, and stop slightly after the fade so it's cleaned up.
      o.start(t0); o.stop(t0 + dur + 0.05);
    }
    // noise(): play a short burst of filtered hiss (drum hits, crashes, whooshes).
    // dur = length, vol = loudness, at = start time, dest = output,
    // freq = high-pass cutoff: only frequencies above it pass (higher = thinner hiss).
    function noise(dur, vol, at = 0, dest = null, freq = 7000) {
      const c = ensure(); if (!c) return;
      // Source that plays the shared noise buffer.
      const s = c.createBufferSource(); s.buffer = getNoise(c);
      // High-pass filter shapes the hiss (low cutoff = thud, high = hi-hat).
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq;
      // Volume knob and start time.
      const g = c.createGain(); const t0 = at || c.currentTime;
      // Start at full volume and fade out quickly = percussive hit.
      g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      // Wire: noise -> filter -> volume -> output.
      s.connect(f); f.connect(g); g.connect(dest || master);
      // Play and stop just after the fade.
      s.start(t0); s.stop(t0 + dur + 0.02);
    }
    // MUSIC SEQUENCER: the song is a loop of 16th-note "steps".
    // STEP = seconds per step at 108 beats per minute (60/108 s per beat, 4 steps per beat).
    const STEP = 60 / 108 / 4;
    // Bass line pattern, one entry per step (frequency in Hz; 0 = rest).
    const BASS = [55, 0, 0, 55, 0, 0, 65.4, 0, 73.4, 0, 0, 65.4, 0, 0, 49, 0];
    // Lead melody, 32 steps long (0 = rest).
    const LEAD = [440, 0, 523, 0, 0, 587, 0, 523, 0, 440, 0, 0, 392, 0, 440, 0, 659, 0, 587, 0, 523, 0, 0, 440, 0, 392, 0, 440, 0, 0, 0, 0];
    // playStep(s, t): play every instrument that hits on step number s at audio time t.
    function playStep(s, t) {
      // Position inside the 16-step bar.
      const i = s % 16;
      // Kick drum: a low sine that quickly slides down in pitch, on steps 0, 7, 10.
      if (i === 0 || i === 7 || i === 10) tone(130, 0.22, 'sine', 0.5, 45, t, music);
      // Snare/clap: mid-frequency noise on steps 4 and 12 (the back-beat).
      if (i === 4 || i === 12) noise(0.12, 0.22, t, music, 1800);
      // Hi-hat on every step, louder on even steps for a groove.
      noise(0.03, i % 2 ? 0.04 : 0.08, t, music, 8000);
      // Bass note (an octave up, slight downward slide) if this step has one.
      if (BASS[i]) tone(BASS[i] * 2, 0.26, 'triangle', 0.28, BASS[i] * 1.9, t, music);
      // Little bell "pings" for an Afrobeat-style sparkle.
      if (i === 3 || i === 11 || i === 14) tone(i === 14 ? 660 : 880, 0.05, 'sine', 0.05, 0, t, music);
      // Melody note for this step (melody loops every 32 steps).
      const l = LEAD[s % 32];
      // Play the melody only every other 32-step block, so it comes and goes.
      if (l && s % 64 >= 32) tone(l, 0.18, 'square', 0.03, 0, t, music);
    }
    // schedule(): runs every 40 ms and queues any steps due in the next 0.15 s.
    // Scheduling slightly ahead on the audio clock keeps the beat steady even if
    // JavaScript timers are a bit late.
    function schedule() { if (!ctx) return; while (nextT < ctx.currentTime + 0.15) { playStep(step, nextT); nextT += STEP; step++; } }
    // Public sound API used by the rest of the game.
    return {
      // unlock(): call on first user tap so the browser allows sound.
      unlock: ensure,
      // startMusic(): begin the sequencer loop (does nothing if already running).
      startMusic() { const c = ensure(); if (!c || timer) return; nextT = c.currentTime + 0.05; step = 0; timer = setInterval(schedule, 40); },
      // stopMusic(): stop the sequencer.
      stopMusic() { clearInterval(timer); timer = null; },
      // coin(): two quick high "ding-ding" notes.
      coin() { const t = now(); tone(1320, 0.07, 'square', 0.04, 0, t); tone(1980, 0.12, 'square', 0.035, 0, t + 0.06); },
      // jump(): a rising tone.
      jump() { tone(380, 0.18, 'sine', 0.12, 760); },
      // land(): a short low thud.
      land() { noise(0.08, 0.08, 0, null, 900); },
      // roll(): a longer low rumble.
      roll() { noise(0.2, 0.12, 0, null, 500); },
      // swoosh(): a quick airy whoosh for lane changes.
      swoosh() { noise(0.08, 0.05, 0, null, 3000); },
      // stumble(): a falling buzzy tone when you clip something.
      stumble() { tone(220, 0.22, 'sawtooth', 0.08, 110); },
      // crash(): a deep falling buzz plus a noisy smash.
      crash() { tone(160, 0.5, 'sawtooth', 0.16, 40); noise(0.4, 0.25, 0, null, 300); },
      // power(): an upward 4-note arpeggio (C-E-G-C) when picking up a power-up.
      power() { const t = now(); [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, 'triangle', 0.08, 0, t + i * 0.07)); },
      // close(): a two-note chime for a "close call" near-miss.
      close() { const t = now(); tone(880, 0.08, 'triangle', 0.07, 0, t); tone(1320, 0.12, 'triangle', 0.07, 0, t + 0.07); },
      // whistle(): the LASTMA officer's two-blast whistle.
      whistle() { const t = now(); tone(2300, 0.16, 'sine', 0.06, 2500, t); tone(2300, 0.32, 'sine', 0.06, 2450, t + 0.22); },
      // beep(hi): countdown beep; the final "GO" beep is higher and longer.
      beep(hi) { tone(hi ? 1320 : 660, hi ? 0.4 : 0.15, 'square', 0.06); },
      // jetOn(): start the looping jetpack roar (low-passed noise) plus an ignition sound.
      jetOn() {
        // Skip if no audio or the roar is already playing.
        const c = ensure(); if (!c || jetSrc) return;
        // Loop the noise buffer forever.
        const s = c.createBufferSource(); s.buffer = getNoise(c); s.loop = true;
        // Low-pass filter: keep only deep frequencies = rumble.
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 850;
        // Fade the roar in over a quarter second.
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.2, c.currentTime + 0.25);
        // Wire it and start.
        s.connect(f); f.connect(g); g.connect(master); s.start();
        // Remember it so jetOff() can stop it.
        jetSrc = s; jetGain = g;
        // Rising "whoosh" as the jetpack fires up.
        tone(180, 0.6, 'sawtooth', 0.08, 640);
      },
      // jetOff(): fade the jetpack roar out and stop it.
      jetOff() {
        // Nothing to stop.
        if (!jetSrc) return;
        // Fade out over 0.35 s ...
        jetGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
        // ... then stop the source just after.
        jetSrc.stop(ctx.currentTime + 0.4);
        // Forget it so jetOn() can start a new one later.
        jetSrc = null;
      },
      // setMuted(m): mute/unmute, remember the choice, and apply it to the master volume.
      setMuted(m) { muted = m; store.set('ekorush-muted', m ? '1' : '0'); if (master) master.gain.value = m ? 0 : 0.7; },
      // Read-only property: Sound.muted tells whether sound is muted.
      get muted() { return muted; },
    };
  })();

  // ---------------------------------------------------------------------
  // RENDERER / SCENE: the renderer draws the 3D scene onto the <canvas>.
  // The scene holds every object; the camera decides what we see.
  // ---------------------------------------------------------------------
  /* =================== RENDERER / SCENE =================== */
  // The <canvas> element in index.html that the game draws into.
  const canvas = $('#game-canvas');
  // WebGL renderer with anti-aliasing (smoother edges); ask for the fast GPU.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // Pixel ratio capped at 1.25: on very sharp (retina) screens rendering at full
  // resolution is slow, so we trade a little sharpness for speed.
  let pixelRatio = Math.min(window.devicePixelRatio, 1.25);
  renderer.setPixelRatio(pixelRatio);
  // Use sRGB colour output so colours look correct on screens.
  renderer.outputEncoding = THREE.sRGBEncoding;
  // Turn on shadows (objects cast shadows onto the road).
  renderer.shadowMap.enabled = true;
  // PCF shadows = slightly softened edges, good quality/speed balance.
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // The scene: the container for everything in the 3D world.
  const scene = new THREE.Scene();
  // Fog fades distant objects into the sky colour (starts at 85, full at 215).
  // It hides the point where the world is still being built ahead of you.
  scene.fog = new THREE.Fog(0xcfe9ff, 85, 215);
  // Camera: 62 degree field of view, aspect fixed later on resize, sees from 0.1 to 240 units.
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 240);
  // Normal field of view; widened briefly for speed effects ("FOV kick").
  let baseFov = 62;

  // Hemisphere light: soft sky-blue light from above, warm ground bounce from below.
  const hemi = new THREE.HemisphereLight(0xdff2ff, 0xb08860, 0.85);
  // Sun: a directional light (parallel rays) that casts shadows.
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.05);
  // Let the sun cast shadows.
  sun.castShadow = true;
  // Shadow texture resolution (bigger = sharper but slower).
  sun.shadow.mapSize.set(1024, 1024);
  // The area the sun's shadow covers: a box around the player.
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 90 });
  // Small bias stops "shadow acne" (stripy self-shadowing artefacts).
  sun.shadow.bias = -0.0006;
  // A light that follows the player; brightness 0 by day, switched on at night.
  const playerLight = new THREE.PointLight(0xffd9a0, 0, 16, 1.6);
  // Add all lights (and the sun's aim target) to the scene.
  scene.add(hemi, sun, sun.target, playerLight);

  // Daytime sky texture: a vertical gradient drawn on a canvas (blue to peach).
  const skyDay = LM.canvasTex(16, 256, (g, w, h) => {
    // Gradient from top (0) to bottom (h).
    const gr = g.createLinearGradient(0, 0, 0, h);
    // Deep blue at the top, pale blue in the middle, warm peach at the horizon.
    gr.addColorStop(0, '#3aa6ff'); gr.addColorStop(0.55, '#bfe6ff'); gr.addColorStop(1, '#ffe2c4');
    // Paint the whole canvas with the gradient.
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  // Night sky texture: dark gradient plus random stars and a moon.
  const skyNight = LM.canvasTex(512, 512, (g, w, h) => {
    // Top-to-bottom gradient.
    const gr = g.createLinearGradient(0, 0, 0, h);
    // Near-black navy at the top fading to purple at the horizon.
    gr.addColorStop(0, '#050816'); gr.addColorStop(0.6, '#141a44'); gr.addColorStop(1, '#3b2a5a');
    // Paint it.
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // 260 stars: tiny squares of random brightness in the upper 70% of the sky.
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`; g.fillRect(Math.random() * w, Math.random() * h * 0.7, 1.4, 1.4); }
    // The moon: a pale yellow circle near the top right.
    g.fillStyle = '#fffbe6'; g.beginPath(); g.arc(w * 0.78, h * 0.18, 16, 0, Math.PI * 2); g.fill();
  });

  // ---------------------------------------------------------------------
  // GROUND, ROAD, SIDEWALKS. These are long flat strips that never actually
  // move. Instead their textures slide (scroll), which makes it LOOK like the
  // road is rushing past - a cheap, classic endless-runner trick.
  // ---------------------------------------------------------------------
  /* ---------- ground, road, sidewalks ---------- */
  // Length of the road strip in world units.
  const ROAD_LEN = 330;
  // List of all scrolling surfaces, updated every frame.
  const scrollers = [];
  // scroller(): register a mesh whose texture should scroll as the player runs.
  // mesh = the object, tex = its texture, axis = 'x' or 'y' texture direction,
  // sign = scroll direction (+1/-1), R = how many times the texture repeats.
  // Adds the mesh to the scene and returns it.
  function scroller(mesh, tex, axis, sign, R) { tex.repeat[axis] = R; scrollers.push({ mesh, tex, axis, sign, R }); scene.add(mesh); return mesh; }

  // The big sandy ground plane under everything (900x900).
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), LM.mat(0xc9a77a, { roughness: 1 }));
  // Planes are created standing up; rotate -90 degrees to lie flat.
  ground.rotation.x = -Math.PI / 2;
  // Slightly below 0 so it doesn't flicker against the road ("z-fighting").
  ground.position.y = -0.02;
  // Shadows can fall onto it.
  ground.receiveShadow = true;
  // Put it in the world.
  scene.add(ground);

  // Road texture (256x256) painted in code: asphalt, grit, lane lines, yellow edges.
  const roadTex = LM.canvasTex(256, 256, (g, w, h) => {
    // Dark grey asphalt base.
    g.fillStyle = '#3b3b40'; g.fillRect(0, 0, w, h);
    // 1600 tiny faint light/dark specks for a gritty asphalt look.
    for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    // White paint colour.
    g.fillStyle = '#f5f5f5';
    // Two dashed lane dividers (painted on the top half only, so they look dashed when repeated).
    [88, 167].forEach((x) => g.fillRect(x - 3, 0, 6, h * 0.5));
    // Yellow paint colour.
    g.fillStyle = '#ffcc00';
    // Solid yellow edge lines on both sides.
    g.fillRect(6, 0, 5, h); g.fillRect(w - 11, 0, 5, h);
  // The final "true" asks models.js to make the texture repeat/tile.
  }, true);
  // The road: a 7.2-wide (3 lanes), ROAD_LEN-long plane with the asphalt texture.
  const road = new THREE.Mesh(new THREE.PlaneGeometry(7.2, ROAD_LEN), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.92 }));
  // Lay it flat.
  road.rotation.x = -Math.PI / 2;
  // Shadows show on it.
  road.receiveShadow = true;
  // Scroll its texture along 'y' and repeat it once every 8 units.
  scroller(road, roadTex, 'y', 1, ROAD_LEN / 8);

  // Paving-stone texture factory (a function, so each sidewalk gets its own copy
  // and its own scroll offset).
  const paveTex = () => LM.canvasTex(128, 128, (g, w) => {
    // Light grey stone base.
    g.fillStyle = '#b9b2a6'; g.fillRect(0, 0, w, w);
    // Darker grout lines.
    g.strokeStyle = '#8f877b'; g.lineWidth = 3;
    // Draw offset rows of bricks (every other row shifted by half a brick).
    for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) { g.strokeRect(x * 64 + (y % 2) * 32, y * 32, 64, 32); g.strokeRect(x * 64 + (y % 2) * 32 - 128, y * 32, 64, 32); }
    // A faint reddish band for some variety.
    g.fillStyle = 'rgba(160,60,40,0.18)'; g.fillRect(0, 0, w, 32);
  }, true);
  // Yellow-and-black striped texture for the curbs.
  const stripeTex = () => LM.canvasTex(128, 16, (g, w, h) => { g.fillStyle = '#ffcc00'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.fillRect(64, 0, 64, h); }, true);
  // Build a sidewalk and a curb on each side: s = -1 (left) and +1 (right).
  [-1, 1].forEach((s) => {
    // Fresh paving texture for this side.
    const pt = paveTex();
    // The sidewalk strip, 3.4 wide.
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(3.4, ROAD_LEN), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.95 }));
    // Lay it flat.
    walk.rotation.x = -Math.PI / 2;
    // Place it beside the road, raised 0.2 like a real kerb.
    walk.position.set(s * 5.5, 0.2, 0);
    // Receives shadows.
    walk.receiveShadow = true;
    // Scroll its texture; repeat once per 3.4 units so tiles stay square.
    scroller(walk, pt, 'y', 1, ROAD_LEN / 3.4);
    // Fresh stripe texture for this curb.
    const st = stripeTex();
    // The curb face: a long thin vertical strip.
    const curb = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_LEN, 0.2), new THREE.MeshStandardMaterial({ map: st, roughness: 0.6 }));
    // Turn it sideways so it faces the road on its side.
    curb.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2;
    // Place it at the road edge.
    curb.position.set(s * 3.6, 0.1, 0);
    // Scroll the stripes; direction flips per side because the curbs face opposite ways.
    scroller(curb, st, 'x', s < 0 ? 1 : -1, ROAD_LEN / 1.6);
  });

  // ---------------------------------------------------------------------
  // OUTLINES: a cartoon trick. For each mesh we add a slightly bigger copy
  // drawn in near-black with only its BACK faces visible. The copy peeks out
  // around the edges, giving a thick dark outline that makes obstacles easy
  // to read at speed.
  // ---------------------------------------------------------------------
  /* =================== OUTLINES (toon-style, makes obstacles readable) =================== */
  // The outline material: flat dark colour, draws only back faces (BackSide).
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x17141f, side: THREE.BackSide });
  // addOutline(root, t, minSize): add outlines to every mesh inside root.
  // t = outline thickness, minSize = skip meshes smaller than this (tiny details
  // would just turn into black blobs). Returns root (so calls can be chained).
  function addOutline(root, t = 0.04, minSize = 0.3) {
    // Meshes that should get an outline.
    const list = [];
    // Collect solid meshes that aren't outlines already and aren't see-through.
    root.traverse((o) => { if (o.isMesh && !o.userData.outline && !(o.material && o.material.transparent)) list.push(o); });
    // Reusable vectors for each mesh's size and centre.
    const size = new V3(), center = new V3();
    // Process each mesh.
    for (const m of list) {
      // Its geometry (the shape data).
      const g = m.geometry;
      // Compute its bounding box (smallest box around the shape) if not known yet.
      if (!g.boundingBox) g.computeBoundingBox();
      // Box size in x, y, z ...
      g.boundingBox.getSize(size);
      // ... and its centre.
      g.boundingBox.getCenter(center);
      // Skip meshes that are too small overall or paper-thin in any direction.
      if (Math.max(size.x, size.y, size.z) < minSize || Math.min(size.x, size.y, size.z) < 0.025) continue;
      // Scale factor per axis so the copy is t larger on every side.
      const k = new V3((size.x + 2 * t) / size.x, (size.y + 2 * t) / size.y, (size.z + 2 * t) / size.z);
      // The outline copy shares the same geometry but uses the dark material.
      const o = new THREE.Mesh(g, outlineMat);
      // Mark it so we never outline an outline.
      o.userData.outline = true;
      // Same rotation as the original mesh.
      o.quaternion.copy(m.quaternion);
      // Same scale, then enlarged by k.
      o.scale.copy(m.scale).multiply(k);
      // Scaling happens around the mesh's origin, not its centre, so an off-centre
      // shape would drift. Compute the shift that keeps the enlarged copy centred.
      const off = center.clone().multiply(new V3(1 - k.x, 1 - k.y, 1 - k.z)).multiply(m.scale).applyQuaternion(m.quaternion);
      // Place it at the original's position plus that correction.
      o.position.copy(m.position).add(off);
      // Attach it next to the original so it moves with it.
      m.parent.add(o);
    }
    return root;
  }

  // ---------------------------------------------------------------------
  // MESH MERGING (performance). Each separate mesh costs one "draw call" -
  // an instruction from the CPU telling the GPU to draw something. Hundreds of
  // little parts (wheels, windows...) mean hundreds of draw calls and a slow
  // game. We glue all parts that share a material into ONE mesh, so a whole
  // bus may need only a few draw calls.
  // ---------------------------------------------------------------------
  /* Merge a static model into one mesh per material: far fewer draw calls. */
  // Cache of unique materials, keyed by their settings.
  const matCache = new Map();
  // canonMat(m): return a single shared material for all materials that look
  // identical. Models create many equal-but-separate materials; sharing one lets
  // more parts be merged together. Returns the canonical (shared) material.
  function canonMat(m) {
    // A texture's unique id, or '-' if there's no texture.
    const id = (t) => (t ? t.uuid : '-');
    // Build a text key from every property that affects how the material looks.
    const key = [m.type, m.color && m.color.getHex(), m.emissive && m.emissive.getHex(), m.emissiveIntensity, id(m.map), id(m.emissiveMap),
      m.roughness, m.metalness, m.side, m.transparent, m.opacity, m.depthWrite, m.blending, m.flatShading, m.userData.glow && m.userData.glow.join()].join('|');
    // First time we see this look: remember this material as the shared one.
    if (!matCache.has(key)) matCache.set(key, m);
    // Return the shared material for this look.
    return matCache.get(key);
  }
  // isPlain(m): true for simple single-colour materials (no textures, no glow,
  // no transparency). Those can all be merged into one mesh by storing each
  // part's colour in its vertices ("vertex colours") instead of in the material.
  const isPlain = (m) => m.isMeshStandardMaterial && !m.map && !m.emissiveMap && !m.transparent && !m.userData.glow && m.emissive.getHex() === 0;
  // Cache of the vertex-colour materials.
  const vcMats = {};
  // vcMat(m): get the shared vertex-colour material matching m's metal-ness and
  // face side. Returns a MeshStandardMaterial that reads colour from the vertices.
  function vcMat(m) {
    // Treat it as metal if metalness >= 0.3; also keep its side (front/back/double).
    const metal = m.metalness >= 0.3, side = m.side;
    // Cache key, e.g. "0m" = front side, metallic.
    const key = side + (metal ? 'm' : '');
    // Reuse an existing one, or create it once and store it.
    return vcMats[key] || (vcMats[key] = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: metal ? 0.45 : 0.75, metalness: metal ? 0.5 : 0.05, side }));
  }
  // bake(root): merge a whole static (non-animated) model into a few meshes.
  // Returns a new Group with the merged meshes, keeping the original's position,
  // rotation, scale and userData (extra info like length/depth).
  function bake(root) {
    // All meshes inside the model.
    const list = [];
    // Collect them.
    root.traverse((m) => { if (m.isMesh) list.push(m); });
    // New container for the result.
    const out = new THREE.Group();
    // Merge them (relative to root's own space) and add the results.
    mergeMeshes(list, root).forEach((m) => out.add(m));
    // Keep the model's extra info (e.g. userData.len used for spacing).
    out.userData = root.userData;
    // Copy its placement.
    out.position.copy(root.position); out.quaternion.copy(root.quaternion); out.scale.copy(root.scale);
    return out;
  }
  // bakeRig(root): like bake, but for animated characters. A character has
  // "joints" (torso, arms, legs) that rotate during animation, so we can't merge
  // everything. Instead, the meshes hanging off each joint are merged together,
  // and the joints stay movable. Changes root in place and returns it.
  /* Same idea for animated characters: merge the meshes hanging off each joint. */
  function bakeRig(root) {
    // Make sure every part's world position is up to date.
    root.updateMatrixWorld(true);
    // The non-mesh nodes = the joints/groups.
    const nodes = [];
    // Collect them.
    root.traverse((n) => { if (!n.isMesh) nodes.push(n); });
    // For each joint ...
    for (const n of nodes) {
      // ... find its direct mesh children that have no children of their own.
      const kids = n.children.filter((c) => c.isMesh && !c.children.length);
      // Nothing to gain merging fewer than 2.
      if (kids.length < 2) continue;
      // Merge them in the joint's coordinate space.
      const merged = mergeMeshes(kids, n);
      // Remove the original parts ...
      kids.forEach((k) => n.remove(k));
      // ... and attach the merged mesh(es) instead.
      merged.forEach((m) => n.add(m));
    }
    return root;
  }
  // mergeMeshes(list, space): the core merging routine.
  // list = meshes to merge, space = the object whose coordinate system the result
  // should be in. Groups parts by material, then copies every vertex (position,
  // normal, uv, colour) into big new arrays. Returns an array of merged Meshes.
  function mergeMeshes(list, space) {
    // Make sure world matrices (positions in the world) are current.
    space.updateMatrixWorld(true);
    // inv = converts world coordinates into "space" coordinates; rel = reusable matrix.
    const inv = space.matrixWorld.clone().invert(), rel = new THREE.Matrix4();
    // material key -> group of parts that will become one merged mesh.
    const groups = new Map();
    // addPart(): put one mesh (or one material section of it) into the right group.
    // start/count = which range of triangle indices to take.
    const addPart = (m, material, start, count) => {
      // Plain single-colour materials go into vertex-colour groups.
      const plain = isPlain(material);
      // Choose the shared material.
      const mat = plain ? vcMat(material) : canonMat(material);
      // Parts must also agree on shadow casting/receiving to be merged.
      const key = mat.uuid + (m.castShadow ? 'c' : '') + (m.receiveShadow ? 'r' : '');
      // Create the group the first time this key appears.
      if (!groups.has(key)) groups.set(key, { mat, vc: plain, cast: m.castShadow, recv: m.receiveShadow, parts: [] });
      // Record the part (and its colour if using vertex colours).
      groups.get(key).parts.push({ m, start, count, color: plain ? material.color : null });
    };
    // Go through every mesh in the list.
    list.forEach((m) => {
      // Skip meshes that are hidden (or have a hidden parent).
      for (let p = m; p && p !== space; p = p.parent) if (!p.visible) return;
      // Total number of vertex indices (indexed geometry) or vertices (non-indexed).
      const geo = m.geometry, total = geo.index ? geo.index.count : geo.attributes.position.count;
      // Meshes with several materials have "groups" - one section per material.
      if (Array.isArray(m.material)) {
        // Add each section separately so it lands with its own material.
        for (const gr of geo.groups) if (m.material[gr.materialIndex]) addPart(m, m.material[gr.materialIndex], gr.start, Math.min(gr.count, total - gr.start));
      // Single material: add the whole mesh.
      } else addPart(m, m.material, 0, total);
    });
    // Finished merged meshes.
    const out = [];
    // nm = normal matrix (rotates surface normals correctly); v = scratch vector.
    const nm = new THREE.Matrix3(), v = new V3();
    // Build one merged mesh per group.
    for (const g of groups.values()) {
      // Count total vertices and indices so the arrays can be allocated once.
      let vCount = 0, iCount = 0;
      // Add up every part's sizes.
      for (const p of g.parts) { vCount += p.m.geometry.attributes.position.count; iCount += p.count; }
      // Big arrays: positions (3 per vertex), normals (3), texture coords (2).
      const P3 = new Float32Array(vCount * 3), N3 = new Float32Array(vCount * 3), U2 = new Float32Array(vCount * 2);
      // Index array: 16-bit if the vertex count fits (saves memory), else 32-bit.
      const I = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
      // Colour array only for vertex-colour groups.
      const C3 = g.vc ? new Float32Array(vCount * 3) : null;
      // vo = where this part's vertices start; io = where its indices start.
      let vo = 0, io = 0;
      // Copy each part into the big arrays.
      for (const { m, start, count, color } of g.parts) {
        // Vertex-colour group: paint every vertex of this part with its material colour.
        if (C3) for (let i = 0; i < m.geometry.attributes.position.count; i++) { const k = (vo + i) * 3; C3[k] = color.r; C3[k + 1] = color.g; C3[k + 2] = color.b; }
        // Shortcuts for this part's position, normal and uv data.
        const geo = m.geometry, pa = geo.attributes.position, na = geo.attributes.normal, ua = geo.attributes.uv;
        // rel = transform from the part's own space into the target space.
        rel.multiplyMatrices(inv, m.matrixWorld);
        // Matching matrix for normals (handles rotation and non-uniform scale).
        nm.getNormalMatrix(rel);
        // Copy every vertex.
        for (let i = 0; i < pa.count; i++) {
          // Index of this vertex in the big arrays.
          const k = (vo + i) * 3;
          // Transform the position into the target space ...
          v.fromBufferAttribute(pa, i).applyMatrix4(rel);
          // ... and store it.
          P3[k] = v.x; P3[k + 1] = v.y; P3[k + 2] = v.z;
          // Transform and store the normal (re-normalized to length 1).
          if (na) { v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); N3[k] = v.x; N3[k + 1] = v.y; N3[k + 2] = v.z; }
          // Copy texture coordinates unchanged.
          if (ua) { U2[(vo + i) * 2] = ua.getX(i); U2[(vo + i) * 2 + 1] = ua.getY(i); }
        }
        // A mirrored transform (negative determinant) flips triangles inside-out.
        const flip = rel.determinant() < 0;
        // Map a local index to the big array (shifted by vo).
        const idx = (i) => (geo.index ? geo.index.array[i] : i) + vo;
        // Copy triangles (3 indices each) ...
        for (let i = start; i < start + count; i += 3) {
          // ... swapping the last two corners if mirrored so faces still point outward.
          I[io++] = idx(i);
          I[io++] = idx(flip ? i + 2 : i + 1);
          I[io++] = idx(flip ? i + 1 : i + 2);
        }
        // Advance past this part's vertices.
        vo += pa.count;
      }
      // Build the merged geometry from the big arrays.
      const geo = new THREE.BufferGeometry();
      // Positions (3 numbers per vertex).
      geo.setAttribute('position', new THREE.BufferAttribute(P3, 3));
      // Normals (used for lighting).
      geo.setAttribute('normal', new THREE.BufferAttribute(N3, 3));
      // Texture coordinates.
      geo.setAttribute('uv', new THREE.BufferAttribute(U2, 2));
      // Per-vertex colours, if used.
      if (C3) geo.setAttribute('color', new THREE.BufferAttribute(C3, 3));
      // Triangle list.
      geo.setIndex(new THREE.BufferAttribute(I, 1));
      // Bounding sphere is used to skip drawing things off-screen ("frustum culling").
      geo.computeBoundingSphere();
      // The merged mesh with the group's shared material.
      const mesh = new THREE.Mesh(geo, g.mat);
      // Keep the shadow settings.
      mesh.castShadow = g.cast; mesh.receiveShadow = g.recv;
      // It never moves relative to its parent, so skip recalculating its matrix each frame.
      mesh.matrixAutoUpdate = false;
      // Calculate it once now.
      mesh.updateMatrix();
      // Add to the results.
      out.push(mesh);
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // PROTOTYPES: build every model once ("master copy"). During play we
  // .clone() these, which is much faster than building models from scratch
  // and lets clones share the same geometry/material in GPU memory.
  // ---------------------------------------------------------------------
  /* =================== PROTOTYPES =================== */
  // Obstacles (outlined and baked), coins and power-ups.
  const protos = {
    // Danfo (yellow minibus), BRT bus and keke (tricycle) obstacles.
    danfo: bake(addOutline(LM.createDanfo())), brt: bake(addOutline(LM.createBRT())), keke: bake(addOutline(LM.createKeke())),
    // Barrier, overhead gantry (roll under it) and ramp (run up it onto buses).
    barrier: bake(addOutline(LM.createBarrier(), 0.035, 0.15)), gantry: bake(addOutline(LM.createGantry(), 0.035, 0.15)), ramp: bake(addOutline(LM.createRamp())),
    // Coin: keep just its gold face material, and no shadow (cheaper, many coins).
    coin: (() => { const c = LM.createCoin(); c.material = c.material[1]; c.castShadow = false; return c; })(),
    // One prototype per power-up type.
    magnet: LM.createPowerup('magnet'), shoes: LM.createPowerup('shoes'), x2: LM.createPowerup('x2'), jet: LM.createPowerup('jet'),
  };
  // noShadow(o): turn off shadow casting for all meshes in o (cheaper for scenery).
  // Returns o.
  const noShadow = (o) => { o.traverse((m) => { if (m.isMesh) m.castShadow = false; }); return o; };
  // 20 different random buildings to pick from.
  const buildingProtos = Array.from({ length: 20 }, () => bake(noShadow(LM.createBuilding())));
  // Street lamp.
  const lampProto = bake(noShadow(LM.createLamp()));
  // 4 palm tree variants.
  const palmProtos = Array.from({ length: 4 }, () => bake(noShadow(LM.createPalm())));
  // 3 market stall variants.
  const stallProtos = Array.from({ length: 3 }, () => bake(noShadow(LM.createStall())));
  // 3 billboards for each side of the road (-1 left, 1 right).
  const boardProtos = { '-1': [0, 1, 2].map(() => bake(noShadow(LM.createBillboard(-1)))), '1': [0, 1, 2].map(() => bake(noShadow(LM.createBillboard(1)))) };
  // Angle the billboards slightly towards the oncoming runner.
  Object.values(boardProtos).flat().forEach((b) => { b.rotation.y = b.rotation.y > 1 ? Math.PI + 0.35 : -0.35; });
  // Grass material used beside the bridge landmarks.
  const lawnMat = LM.mat(0x5fa34a, { roughness: 1 });
  // Famous Lagos landmarks.
  const landmarkProtos = {
    // National Theatre, NECOM House, Civic Centre, Tafawa Balewa Square gate.
    theatre: bake(LM.createNationalTheatre()), necom: bake(LM.createNecomHouse()), civic: bake(LM.createCivicCentre()), tbs: bake(LM.createTBSGate()),
    // Lekki Link Bridge, Third Mainland Bridge, Eko Atlantic skyline.
    link: bake(LM.createLinkBridge()), third: bake(LM.createThirdMainland()), eko: bake(noShadow(LM.createEkoAtlantic())),
  };
  // "Warm-up": add one copy of everything, compile all shaders now, then remove it.
  // Otherwise the game would stutter the first time each new model appears.
  {
    // Temporary group.
    const warm = new THREE.Group();
    // A copy of every obstacle, power-up and landmark ...
    [protos, landmarkProtos].forEach((set) => Object.values(set).forEach((p) => warm.add(p.clone())));
    // ... and every scenery piece.
    [buildingProtos, palmProtos, stallProtos, boardProtos['-1'], [lampProto]].forEach((a) => a.forEach((p) => warm.add(p.clone())));
    // Add to the scene so they get compiled.
    scene.add(warm);
    // Compile all the GPU shader programs up front.
    renderer.compile(scene, camera);
    // Remove the temporary copies again.
    scene.remove(warm);
  }
  // The order the landmarks appear in as you run.
  const LANDMARK_ORDER = ['theatre', 'link', 'necom', 'tbs', 'third', 'civic', 'eko'];
  // How far from the road centre side-landmarks are placed (they're wide).
  const LANDMARK_OFFSET = { theatre: 27, necom: 20.5, civic: 19, eko: 30 };
  // Shared blinking material (used for flashing lights).
  const blinkMat = LM.tex().blinkMat;

  // ---------------------------------------------------------------------
  // STATE: variables that describe what's going on right now.
  // ---------------------------------------------------------------------
  /* =================== STATE =================== */
  // Which screen/phase the game is in.
  let state = 'menu';            // menu | countdown | playing | paused | dying | over
  let mode = 'solo';             // mode of the current run
  let menuMode = 'solo';         // selected menu tab
  // P = the player's physics state (lane, x, y, z, velocity...), filled in at run start.
  const P = {};
  // distance run, current speed, score, coins this run, score multiplier,
  // t = total game time, runPhase = running animation cycle, lastStep = footstep
  // timer, deathT = time since crash, shake = camera shake amount, countdown timers.
  let distance = 0, speed = 0, score = 0, runCoins = 0, mult = 1, t = 0, runPhase = 0, lastStep = 0, deathT = 0, shake = 0, countdownT = 0, lastCount = 0;
  // chaserDist = how far behind the LASTMA officer is; deathReason = crash
  // message; sendT = PvP network send timer; fovKick = extra camera zoom-out.
  let chaserDist = 16, deathReason = '', finalScore = 0, sendT = 0, fovKick = 0;
  // Seconds left on each power-up (0 = inactive).
  const power = { magnet: 0, shoes: 0, x2: 0, jet: 0 };
  // nextRowZ = where the next row of obstacles goes; sceneryCursor = where the next
  // scenery is built; blockCount/landmarkIdx = which landmark comes next.
  let nextRowZ = -50, sceneryCursor = 60, blockCount = 0, landmarkIdx = 0;
  // Lists of live objects in the world, plus landmark name "triggers".
  const obstacles = [], coins = [], powerups = [], scenery = [], triggers = [];
  // Which character the player picked (saved between visits); default Tunde.
  let runnerKey = store.get('ekorush-runner', 'tunde');
  // If the saved one doesn't exist (or is the officer), fall back to Tunde.
  if (!LM.VARIANTS[runnerKey] || runnerKey === 'officer') runnerKey = 'tunde';
  // The player's 3D model and the jetpack attached to its back.
  let player, jetpack;
  // buildPlayer(): (re)create the player model for the chosen character,
  // with outlines, merged parts, and a hidden jetpack on its back.
  function buildPlayer() {
    // Remove the old model if we're swapping characters.
    if (player) scene.remove(player);
    // Build, outline (thin) and merge the runner while keeping joints animatable.
    player = bakeRig(addOutline(LM.createRunner(runnerKey), 0.014, 0.08));
    // Jetpack model.
    jetpack = LM.createJetpack();
    // Position it on the runner's back.
    jetpack.position.set(0, 0.36, 0.3);
    // Hidden until the jetpack power-up is picked up.
    jetpack.visible = false;
    // Attach it to the torso so it moves with the body.
    player.userData.rig.torso.add(jetpack);
    // Put the runner in the world.
    scene.add(player);
  }
  // Build the player right away.
  buildPlayer();
  // The LASTMA officer who chases you, built the same way.
  const officer = bakeRig(addOutline(LM.createOfficer(), 0.014, 0.08));
  // Add him to the world.
  scene.add(officer);
  // Point the camera looks at (smoothed every frame).
  const camLook = new V3();

  // ---------------------------------------------------------------------
  // SEEDED RANDOM NUMBERS. Math.random() gives different numbers each time.
  // A "seeded" generator always produces the SAME sequence for the same
  // starting number (the seed). In PvP both players use the same seed, so
  // both get exactly the same obstacles and coins.
  // ---------------------------------------------------------------------
  /* seeded RNG so both racers get the same course */
  // mulberry32(a): a tiny, fast seeded generator. a = the seed.
  // Returns a function that gives the next number in [0, 1) each time it's called.
  function mulberry32(a) {
    // The returned generator.
    return function () {
      // Force a to a 32-bit integer and step it by a fixed odd constant.
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      // Scramble the bits (xor-shift and multiply) so outputs look random.
      let r = Math.imul(a ^ (a >>> 15), 1 | a);
      // More scrambling.
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      // Final mix, then divide by 2^32 to get a number from 0 up to (not including) 1.
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  // R = the random function used for the course. Solo: Math.random; PvP: seeded.
  let R = Math.random;
  // Rri(a, b): random whole number from a to b (inclusive).
  const Rri = (a, b) => Math.floor(a + R() * (b - a + 1));
  // Rpick(arr): random item from an array.
  const Rpick = (arr) => arr[Math.floor(R() * arr.length)];

  // ---------------------------------------------------------------------
  // EFFECTS: dust puffs and speed lines.
  // "Object pooling": we create 90 dust particles once and reuse them,
  // because creating/destroying objects every frame is slow.
  // ---------------------------------------------------------------------
  /* =================== EFFECTS =================== */
  // The pool of dust particles.
  const dust = [];
  // One shared small sphere shape for all particles.
  const dustGeo = new THREE.SphereGeometry(0.12, 7, 5);
  // Create 90 particles.
  for (let i = 0; i < 90; i++) {
    // Each has its own see-through material so its colour/opacity can change.
    // depthWrite: false stops transparent particles hiding each other oddly.
    const m = new THREE.Mesh(dustGeo, new THREE.MeshBasicMaterial({ color: 0xd8c3a0, transparent: true, opacity: 0, depthWrite: false }));
    // Hidden until used.
    m.visible = false;
    // Add to the world.
    scene.add(m);
    // v = velocity, life/max = remaining/total lifetime, size, op = start opacity.
    dust.push({ m, v: new V3(), life: 0, max: 1, size: 1, op: 0.55 });
  }
  // Index of the next particle to reuse (cycles through the pool).
  let dustIdx = 0;
  // puff(x, y, z, n, color, o): emit n particles at a point.
  // o = options: add (glowing additive blend), jitter (start spread), spread
  // (sideways speed), vy/vz (vertical/forward speed), life, size, op (opacity).
  function puff(x, y, z, n, color, o = {}) {
    // For each particle requested ...
    for (let i = 0; i < n; i++) {
      // ... take the next one from the pool (oldest gets recycled; % wraps around).
      const d = dust[dustIdx++ % dust.length];
      // Set its colour.
      d.m.material.color.set(color);
      // Additive blending makes overlapping particles glow (fire/sparkles).
      d.m.material.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending;
      // Start near the point with a little random offset.
      d.m.position.set(x + (Math.random() - 0.5) * (o.jitter || 0.4), y, z + (Math.random() - 0.5) * (o.jitter || 0.4));
      // Sideways speed factor.
      const sp = o.spread || 1;
      // Random velocity: sideways, upward (or given vy), slightly backward (+ vz).
      d.v.set((Math.random() - 0.5) * 2 * sp, (o.vy != null ? o.vy : Math.random() * 1.6) + (Math.random() - 0.5) * 0.6, (Math.random() - 0.2) * 2 * sp + (o.vz || 0));
      // Lifetime with +-30% randomness so particles don't all vanish together.
      d.max = d.life = (o.life || 0.6) * (0.7 + Math.random() * 0.6);
      // Size multiplier.
      d.size = o.size || 1;
      // Starting opacity.
      d.op = o.op || 0.55;
      // Show it.
      d.m.visible = true;
    }
  }
  // updateDust(dt): move, grow and fade every active particle. dt = frame seconds.
  function updateDust(dt) {
    // Check every particle.
    for (const d of dust) {
      // Skip inactive ones.
      if (d.life <= 0) continue;
      // Age it.
      d.life -= dt;
      // Just died: hide it.
      if (d.life <= 0) { d.m.visible = false; continue; }
      // k goes from 1 (newborn) down to 0 (dead).
      const k = d.life / d.max;
      // Move by velocity * time.
      d.m.position.addScaledVector(d.v, dt);
      // Slow down (air drag): keep 20% of speed per second, independent of frame rate.
      d.v.multiplyScalar(Math.pow(0.2, dt));
      // Grow as it ages (puffs spread out).
      d.m.scale.setScalar(d.size * (1.7 - k));
      // Fade out as it ages.
      d.m.material.opacity = d.op * k;
    }
  }

  // SPEED LINES: 70 white streaks around the camera that appear at high speed.
  // All 70 are one LineSegments object = one draw call.
  const STREAKS = 70;
  // Each line has 2 points x 3 numbers (x, y, z) = 6 numbers.
  const streakPos = new Float32Array(STREAKS * 6);
  // Geometry for the lines ...
  const streakGeo = new THREE.BufferGeometry();
  // ... using the array above for positions (we update it every frame).
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
  // White, see-through; opacity starts at 0 (invisible).
  const streakMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  // The lines object.
  const streakLines = new THREE.LineSegments(streakGeo, streakMat);
  // Lines follow the camera; never let Three.js cull (hide) them by mistake.
  streakLines.frustumCulled = false;
  // Add to the world.
  scene.add(streakLines);
  // Position of each streak relative to the camera.
  const streaks = Array.from({ length: STREAKS }, () => ({ x: 0, y: 0, z: 0 }));
  // resetStreak(s, anywhere): put streak s at a new random spot beside the camera.
  // anywhere = true scatters along the whole depth (start); otherwise far ahead.
  function resetStreak(s, anywhere) {
    // Left or right of the camera.
    const side = Math.random() < 0.5 ? -1 : 1;
    // Keep a gap in the middle so lines don't cover the runner.
    s.x = side * (1.2 + Math.random() * 7);
    // Random height.
    s.y = -2 + Math.random() * 8;
    // Distance ahead of the camera (negative z is forward).
    s.z = anywhere ? -Math.random() * 70 : -45 - Math.random() * 30;
  }
  // Scatter all streaks initially.
  streaks.forEach((s) => resetStreak(s, true));
  // updateStreaks(dt): fade the lines in/out by speed and move them past the camera.
  function updateStreaks(dt) {
    // Are we flying with the jetpack right now?
    const flying = power.jet > 0 && state === 'playing';
    // Target visibility: grows with speed above 17, capped at 0.42, more when flying.
    const target = state === 'playing' ? THREE.MathUtils.clamp((speed - 17) / 22, 0, 0.42) + (flying ? 0.35 : 0) : 0;
    // Ease opacity towards the target (smooth fade instead of popping).
    streakMat.opacity += (target - streakMat.opacity) * Math.min(1, dt * 4);
    // Hide completely when nearly invisible.
    streakLines.visible = streakMat.opacity > 0.01;
    // Skip the work if invisible.
    if (!streakLines.visible) return;
    // Line length grows with speed (longer = faster feeling).
    const len = 1 + speed * 0.12 + (flying ? 3 : 0);
    // Camera position.
    const cp = camera.position;
    // Update each streak.
    streaks.forEach((s, i) => {
      // Move it towards/past the camera (faster when flying).
      s.z += speed * 0.9 * dt + (flying ? 25 * dt : 0);
      // Once behind the camera, respawn it far ahead.
      if (s.z > 3) resetStreak(s, false);
      // Where its 6 numbers live in the array.
      const o = i * 6;
      // Start point (camera position + offset) ...
      streakPos[o] = cp.x + s.x; streakPos[o + 1] = cp.y + s.y; streakPos[o + 2] = cp.z + s.z;
      // ... and end point, len further ahead.
      streakPos[o + 3] = cp.x + s.x; streakPos[o + 4] = cp.y + s.y; streakPos[o + 5] = cp.z + s.z - len;
    });
    // Tell Three.js the positions changed so it re-uploads them to the GPU.
    streakGeo.attributes.position.needsUpdate = true;
  }

  // ---------------------------------------------------------------------
  // SPAWNING. The player runs towards negative z (forward). The world ahead
  // is built bit by bit just beyond the fog, and things far behind are
  // removed, so the road seems endless while memory stays small.
  // ---------------------------------------------------------------------
  /* =================== SPAWNING =================== */
  // addScenery(obj, rear): add a scenery object; rear = the z of its back end,
  // used later to remove it once the player is past it.
  function addScenery(obj, rear) { scene.add(obj); scenery.push({ obj, rear }); }

  // fillSide(s, z0, length): fill one side of the road (s = -1 left, 1 right)
  // with buildings plus palms/stalls/billboards from z0 forward over length.
  // Returns the z where the buildings ended.
  function fillSide(s, z0, length) {
    // Building cursor.
    let z = z0;
    // Place buildings one after another until the stretch is filled.
    while (z > z0 - length) {
      // Copy a random building.
      const b = LM.pick(buildingProtos).clone();
      // Its length along the road and depth away from it.
      const L = b.userData.len, D = b.userData.depth;
      // Set it back from the road by half its depth, centred on its length.
      b.position.set(s * (8.2 + D / 2), 0, z - L / 2);
      // Buildings on the right are turned around to face the road.
      if (s > 0) b.rotation.y = Math.PI;
      // Register it (its back end is z - L).
      addScenery(b, z - L);
      // Move on, leaving a small random gap between buildings.
      z -= L + LM.rnd(0.4, 2.5);
    }
    // Street furniture every 6-11 units along the sidewalk.
    for (let zz = z0 - LM.rnd(2, 7); zz > z0 - length; zz -= LM.rnd(6, 11)) {
      // Random roll to decide what goes here.
      const r = Math.random();
      // Chosen object (or nothing).
      let o = null;
      // 38%: a palm tree, randomly rotated.
      if (r < 0.38) { o = LM.pick(palmProtos).clone(); o.position.set(s * 6.9, 0.2, zz); o.rotation.y = LM.rnd(0, 6); }
      // 20%: a market stall.
      else if (r < 0.58) { o = LM.pick(stallProtos).clone(); o.position.set(s * 6.1, 0.2, zz); o.rotation.y = LM.rnd(0, 6); }
      // 10%: a billboard. (Remaining 32%: nothing.)
      else if (r < 0.68) { o = LM.pick(boardProtos[s]).clone(); o.position.set(s * 6.9, 0.2, zz); }
      // Add whatever was chosen.
      if (o) addScenery(o, zz - 4);
    }
    return z;
  }
  // lampsAlong(z0, length): street lamps on both sides every 20 units.
  function lampsAlong(z0, length) {
    // Every 20 units along the stretch.
    for (let z = z0 - 5; z > z0 - length; z -= 20) {
      // Both sides.
      [-1, 1].forEach((s) => {
        // Copy the lamp.
        const l = lampProto.clone();
        // On the sidewalk.
        l.position.set(s * 6.5, 0.2, z);
        // Right-side lamps turned to face the road.
        if (s > 0) l.rotation.y = Math.PI;
        // Register it.
        addScenery(l, z - 1);
      });
    }
  }

  // spawnLandmark(key): build a famous landmark at the scenery cursor.
  // Three kinds: "segment" (the road passes through it, e.g. a bridge),
  // "span" (spans over the road with lawns beside), or a side building.
  // Also adds a trigger to show the landmark's name on screen.
  function spawnLandmark(key) {
    // The landmark's prototype ...
    const p = landmarkProtos[key];
    // ... and a copy to place.
    const obj = p.clone();
    // Its length, and where it starts.
    const len = p.userData.len, z0 = sceneryCursor;
    // Segment landmarks (e.g. bridges) sit right over the road.
    if (p.userData.segment) {
      // Centre it on its length.
      obj.position.set(0, 0, z0 - len / 2);
      // Register it.
      addScenery(obj, z0 - len);
      // Show its name a little before the player reaches it.
      triggers.push({ z: z0 + 25, name: p.userData.name });
      // Move the cursor past it.
      sceneryCursor = z0 - len - 2;
      return;
    }
    // Span landmarks (like a gate over the road) get a 34-long area.
    if (p.userData.span) {
      // Area length.
      const L = 34;
      // Centre it.
      obj.position.set(0, 0, z0 - L / 2);
      // Register it.
      addScenery(obj, z0 - L / 2 - 2);
      // Lawns with palms on both sides.
      [-1, 1].forEach((s) => {
        // 60-wide grass strip.
        const lawn = new THREE.Mesh(new THREE.PlaneGeometry(60, L), lawnMat);
        // Lay flat.
        lawn.rotation.x = -Math.PI / 2;
        // Placed beyond the sidewalk, just above the ground.
        lawn.position.set(s * (7.4 + 30), 0.03, z0 - L / 2);
        // Shadows show on it.
        lawn.receiveShadow = true;
        // Register it.
        addScenery(lawn, z0 - L);
        // 4 random palms scattered on the lawn.
        for (let i = 0; i < 4; i++) { const pm = LM.pick(palmProtos).clone(); pm.position.set(s * LM.rnd(10, 30), 0, z0 - LM.rnd(2, L - 2)); addScenery(pm, z0 - L); }
      });
      // Lamps too.
      lampsAlong(z0, L);
      // Name trigger.
      triggers.push({ z: z0 + 20, name: p.userData.name });
      // Move the cursor on.
      sceneryCursor = z0 - L - 1;
      return;
    }
    // Side landmark: pick a random side.
    const s = Math.random() < 0.5 ? -1 : 1;
    // Place it beside the road.
    obj.position.set(s * LANDMARK_OFFSET[key], 0, z0 - len / 2);
    // Turn it to face the road if on the right.
    if (s > 0) obj.rotation.y = Math.PI;
    // Register it.
    addScenery(obj, z0 - len);
    // Fill the opposite side with normal buildings.
    const other = fillSide(-s, z0, len);
    // Lamps.
    lampsAlong(z0, len);
    // Name trigger.
    triggers.push({ z: z0 + 30, name: p.userData.name });
    // Continue from whichever side ends further back.
    sceneryCursor = Math.min(z0 - len - 2, other);
  }

  // spawnScenery(): keep building scenery until it reaches 225 units ahead of the player.
  function spawnScenery() {
    // While the build cursor is less than 225 units ahead (more negative = further ahead) ...
    while (sceneryCursor > P.z - 225) {
      // Count "blocks" of scenery.
      blockCount++;
      // Every 4th block is a landmark (cycling through the list).
      if (blockCount % 4 === 0) spawnLandmark(LANDMARK_ORDER[landmarkIdx++ % LANDMARK_ORDER.length]);
      // Otherwise a normal street block.
      else {
        // 34 units long, starting at the cursor.
        const z0 = sceneryCursor, len = 34;
        // Buildings on both sides.
        const a = fillSide(-1, z0, len), b = fillSide(1, z0, len);
        // Lamps.
        lampsAlong(z0, len);
        // Continue from whichever side reached further.
        sceneryCursor = Math.min(a, b);
      }
    }
  }

  // addSolid(type, x, zFront, extra): place a solid obstacle (bus, keke, barrier).
  // type = prototype name, x = lane position, zFront = z of its front end,
  // extra = optional extra properties (e.g. base = height it sits at, stumble = true
  // if hitting it only trips you). Returns the obstacle's data object.
  function addSolid(type, x, zFront, extra) {
    // Prototype, a fresh copy of it, and its length along the road.
    const p = protos[type], m = p.clone(), len = p.userData.len;
    // Height it sits at (0 = on the road; higher = on top of a bus roof).
    const base = (extra && extra.base) || 0;
    // Model origin is its centre, so shift back by half its length.
    m.position.set(x, base, zFront - len / 2);
    // Show it.
    scene.add(m);
    // Collision data: front/back z, height of its roof (top), and half its width.
    const o = Object.assign({ kind: 'solid', type, mesh: m, x, zFront, zBack: zFront - len, top: base + p.userData.top, halfW: p.userData.width / 2 }, extra || {});
    // Add to the list checked for collisions every frame.
    obstacles.push(o);
    return o;
  }
  // addOverhead(x, z): place an overhead sign gantry you must roll under.
  function addOverhead(x, z) {
    // Prototype and a copy.
    const p = protos.gantry, m = p.clone();
    // It's very thin (0.3 deep), so centre it 0.15 behind z.
    m.position.set(x, 0, z - 0.15);
    // Show it.
    scene.add(m);
    // Collision data: it only hurts between its bottom and top heights.
    obstacles.push({ kind: 'overhead', type: 'gantry', mesh: m, x, zFront: z, zBack: z - 0.3, bottom: p.userData.bottom, top: p.userData.top, halfW: 1.0 });
  }
  // addRamp(x, zFront): place a ramp that lets you run up onto a bus roof.
  function addRamp(x, zFront) {
    // Prototype, copy, and ramp length.
    const p = protos.ramp, m = p.clone(), L = p.userData.len;
    // The ramp model's origin is at its back, so shift by its full length.
    m.position.set(x, 0, zFront - L);
    // Show it.
    scene.add(m);
    // Collision data: h = height at the top of the ramp.
    obstacles.push({ kind: 'ramp', type: 'ramp', mesh: m, x, zFront, zBack: zFront - L, h: p.userData.h, halfW: 1.1 });
  }
  // addCoin(x, y, z): place one coin.
  function addCoin(x, y, z) {
    // Copy the coin.
    const m = protos.coin.clone();
    // Position it.
    m.position.set(x, y, z);
    // Start rotation depends on z so a row of coins spins in a "wave".
    m.rotation.y = z * 0.5;
    // Show it.
    scene.add(m);
    // fly = true once the magnet starts pulling it.
    coins.push({ mesh: m, fly: false });
  }
  // coinLine(x, z, n, y, step): a straight line of n coins going forward from z.
  // y = height, step = spacing.
  function coinLine(x, z, n, y = 0.9, step = 2.4) { for (let i = 0; i < n; i++) addCoin(x, y, z - i * step); }
  // addPower(type, x, z): place a floating power-up of the given type.
  function addPower(type, x, z) {
    // Copy the power-up model.
    const m = protos[type].clone();
    // Float it at about waist height.
    m.position.set(x, 1.1, z);
    // Show it.
    scene.add(m);
    // Track it for pickup.
    powerups.push({ mesh: m, type });
  }

  // ROW_TABLE(d): the chances of each thing appearing in a lane, as [name, weight].
  // d = difficulty from 0 to 1; harder rows (gantries, buses) get more likely as d grows.
  // 'brtRamp' = a ramp followed by a BRT bus you can run on top of.
  const ROW_TABLE = (d) => [['empty', 3], ['barrier', 1.6], ['gantry', 1.1 + d], ['keke', 1], ['danfo', 1.2 + d], ['brt', 0.7 + d], ['brtRamp', 1.1]];
  // weighted(table): pick a name at random, where bigger weights are more likely.
  // Like a raffle: each entry gets as many tickets as its weight. Uses the seeded R.
  function weighted(table) {
    // Total number of "tickets".
    const total = table.reduce((a, r) => a + r[1], 0);
    // Draw a random ticket number.
    let x = R() * total;
    // Walk through entries, subtracting each weight; where it drops to 0 is the winner.
    for (const [k, w] of table) { x -= w; if (x <= 0) return k; }
    // Fallback (only reached through rounding).
    return table[0][0];
  }
  // blocking(k): danfo and BRT can't be jumped over from the road (too tall).
  const blocking = (k) => k === 'danfo' || k === 'brt';
  // diffAt(z): difficulty 0..1, growing as you go further (full at 4000 units).
  // z is negative going forward, so -z is the distance.
  const diffAt = (z) => Math.min(1, -z / 4000);

  // roofHazard(x, brtFront): put a barrier on top of a BRT bus roof, with an arc of
  // coins over it, so running along the roof still needs a jump.
  function roofHazard(x, brtFront) {
    // Height of the bus roof.
    const top = protos.brt.userData.top;
    // Random spot along the roof.
    const zf = brtFront - 3.5 - R() * 2.5;
    // A barrier sitting on the roof (base = roof height); hitting it trips you.
    addSolid('barrier', x, zf, { stumble: true, base: top });
    // 4 coins in an arc (sine curve) over the barrier, showing where to jump.
    for (let j = 0; j < 4; j++) addCoin(x, top + 0.9 + Math.sin((j / 3) * Math.PI) * 1.2, zf + 2.4 - j * 1.6);
  }

  // spawnRow(z): build one row across all 3 lanes at z.
  // Returns how much road the row occupies (so the next row doesn't overlap it).
  function spawnRow(z) {
    // Difficulty here.
    const d = diffAt(z);
    // Weights for this difficulty.
    const table = ROW_TABLE(d);
    // Pick what goes in each of the 3 lanes.
    const kinds = [0, 1, 2].map(() => weighted(table));
    // Fairness rule: if all 3 lanes are blocked by buses, clear one at random.
    if (kinds.every(blocking)) kinds[Rri(0, 2)] = 'empty';
    // Boring rule: if all are empty, put an easy obstacle in one lane.
    if (kinds.every((k) => k === 'empty')) kinds[Rri(0, 2)] = Rpick(['barrier', 'gantry', 'keke']);
    // ext = row length so far; powered = we already placed a power-up in this row.
    let ext = 1, powered = false;
    // Build each lane.
    kinds.forEach((k, i) => {
      // The lane's x position.
      const x = LANES[i];
      // What goes here?
      switch (k) {
        case 'barrier':
          // A barrier (jump over it; hitting it trips you) ...
          addSolid('barrier', x, z, { stumble: true });
          // ... with 5 coins arching over it in a jump shape.
          for (let j = 0; j < 5; j++) addCoin(x, 0.9 + Math.sin((j / 4) * Math.PI) * 1.3, z + 3.2 - j * 1.6);
          break;
        // Overhead gantry, often with 3 low coins leading under it (hint: roll).
        case 'gantry': addOverhead(x, z); if (R() < 0.6) coinLine(x, z + 2.4, 3, 0.5, 2.4); break;
        // Keke, sometimes with 2 coins on its roof; it takes 2.6 units of road.
        case 'keke': addSolid('keke', x, z); if (R() < 0.6) coinLine(x, z - 0.4, 2, protos.keke.userData.top + 0.7, 1.2); ext = Math.max(ext, 2.6); break;
        // Danfo minibus (4.6 long).
        case 'danfo': addSolid('danfo', x, z); ext = Math.max(ext, 4.6); break;
        // BRT bus:
        case 'brt':
          // place the bus ...
          addSolid('brt', x, z);
          // ... sometimes with a barrier on its roof (more often when harder) ...
          if (R() < 0.25 + d * 0.3) roofHazard(x, z);
          // ... and reserve 10 units of road.
          ext = Math.max(ext, 10);
          break;
        // Ramp leading onto a BRT roof:
        case 'brtRamp': {
          // Ramp length and bus roof height.
          const L = protos.ramp.userData.len, top = protos.brt.userData.top;
          // The ramp ...
          addRamp(x, z);
          // ... with the bus right behind it.
          addSolid('brt', x, z - L);
          // Coins rising up the ramp, following its slope.
          for (let j = 0; j < 4; j++) { const cz = z - 0.8 - j * 1.6; addCoin(x, ((z - cz) / L) * protos.ramp.userData.h + 0.9, cz); }
          // Sometimes a roof barrier ...
          if (R() < 0.35 + d * 0.35) roofHazard(x, z - L);
          // ... otherwise a line of coins along the roof.
          else coinLine(x, z - L - 1, 4, top + 0.9, 2.4);
          // Reserve ramp + bus length.
          ext = Math.max(ext, L + 10);
          break;
        }
        // Empty lane:
        default:
          // 7.5% chance of a power-up (max one per row; jetpack slightly rarer) ...
          if (!powered && R() < 0.075) { addPower(weighted([['magnet', 1], ['shoes', 1], ['x2', 1], ['jet', 0.8]]), x, z - 2); powered = true; }
          // ... otherwise a 50% chance of a line of 6 coins.
          else if (R() < 0.5) coinLine(x, z, 6);
      }
    });
    // Tell the caller how long this row is.
    return ext;
  }

  // spawnObstacles(): keep adding rows until they reach 175 units ahead of the player.
  function spawnObstacles() {
    // While the next row spot is within 175 units ahead ...
    while (nextRowZ > P.z - 175) {
      // Build a row.
      const ext = spawnRow(nextRowZ);
      // Gap to the next row: row length + a gap shrinking from 15 to 9 with
      // difficulty (lerp = blend between two numbers) + up to 8 random.
      nextRowZ -= ext + THREE.MathUtils.lerp(15, 9, diffAt(nextRowZ)) + R() * 8;
    }
  }

  // spawnAirCoins(): when the jetpack starts, lay a long trail of coins in the sky.
  function spawnAirCoins() {
    // How many coins fit along the flight: flight time x speed / 3 units spacing.
    const n = Math.floor(((POWER.jet.time - 1.2) * speed) / 3);
    // Start in the player's lane.
    let lane = P.lane;
    // For each coin ...
    for (let i = 0; i < n; i++) {
      // ... every 9 coins, drift one lane left or right (staying within lanes 0-2).
      if (i > 0 && i % 9 === 0) lane = THREE.MathUtils.clamp(lane + (Math.random() < 0.5 ? -1 : 1), 0, 2);
      // Place it at flying height, starting 18 units ahead.
      addCoin(LANES[lane], FLY_Y + 0.6, P.z - 18 - i * 3);
    }
  }

  // cleanup(): remove objects that are now behind the player, to save memory and
  // drawing time.
  function cleanup() {
    // Anything whose z is more than 14 units behind the player is gone.
    // (Behind = larger z, because the player runs towards negative z.)
    const limit = P.z + 14;
    // Loop backwards so removing items doesn't skip the next one.
    // Obstacles: remove from the scene and from the list.
    for (let i = obstacles.length - 1; i >= 0; i--) if (obstacles[i].zBack > limit) { scene.remove(obstacles[i].mesh); obstacles.splice(i, 1); }
    // Coins.
    for (let i = coins.length - 1; i >= 0; i--) if (coins[i].mesh.position.z > limit) { scene.remove(coins[i].mesh); coins.splice(i, 1); }
    // Power-ups.
    for (let i = powerups.length - 1; i >= 0; i--) if (powerups[i].mesh.position.z > limit) { scene.remove(powerups[i].mesh); powerups.splice(i, 1); }
    // Scenery uses a bigger margin (40) since the camera can still see it.
    for (let i = scenery.length - 1; i >= 0; i--) if (scenery[i].rear > P.z + 40) { scene.remove(scenery[i].obj); scenery.splice(i, 1); }
  }

  // resetWorld(seed): clear everything and set up a fresh run.
  // seed = number for the seeded random generator (PvP passes a shared one;
  // solo passes nothing, so a random seed is chosen).
  function resetWorld(seed) {
    // New seeded generator. (x | 0 turns the number into a whole 32-bit integer.)
    R = mulberry32(seed != null ? seed : (Math.random() * 2 ** 31) | 0);
    // Remove all old obstacles, coins, power-ups and scenery from the scene.
    obstacles.forEach((o) => scene.remove(o.mesh));
    coins.forEach((c) => scene.remove(c.mesh));
    powerups.forEach((p) => scene.remove(p.mesh));
    scenery.forEach((s) => scene.remove(s.obj));
    // Empty all the lists (setting length to 0 clears an array).
    obstacles.length = coins.length = powerups.length = scenery.length = triggers.length = 0;
    // Reset the player: middle lane (1), on the ground, at z = 0, not rolling,
    // not stumbling, no invulnerability, not flying.
    Object.assign(P, { lane: 1, prevLane: 1, x: 0, prevX: 0, y: 0, vy: 0, z: 0, grounded: true, airT: 0, rollT: 0, queuedRoll: false, stumbleT: 0, invuln: 0, glide: false, wasFlying: false, laneT: 9, squash: 0 });
    // Reset run counters and effects.
    distance = 0; speed = 0; score = 0; runCoins = 0; mult = 1; deathT = 0; shake = 0; fovKick = 0;
    // No power-ups active.
    power.magnet = power.shoes = power.x2 = power.jet = 0;
    // Start the spawning cursors again.
    nextRowZ = -50; sceneryCursor = 60; blockCount = 0; landmarkIdx = 0;
    // Stand the player model upright ...
    player.rotation.set(0, 0, 0);
    // ... at normal size ...
    player.scale.set(1, 1, 1);
    // ... with the body not tilted.
    player.userData.rig.body.rotation.x = 0;
    // Hide the jetpack ...
    jetpack.visible = false;
    // ... and stop its sound.
    Sound.jetOff();
    // Build the starting scenery ...
    spawnScenery();
    // ... and the first obstacles.
    spawnObstacles();
  }

  // ---------------------------------------------------------------------
  // GAMEPLAY: player actions and collisions.
  // ---------------------------------------------------------------------
  /* =================== GAMEPLAY =================== */
  // moveLane(dir): change lane. dir = -1 (left) or +1 (right).
  function moveLane(dir) {
    // Only while playing.
    if (state !== 'playing') return;
    // New lane, kept within 0..2.
    const nl = THREE.MathUtils.clamp(P.lane + dir, 0, 2);
    // Already at the edge: a tiny camera shake as feedback and do nothing.
    if (nl === P.lane) { shake = Math.max(shake, 0.08); return; }
    // Remember where we came from (used if we hit something from the side).
    P.prevLane = P.lane;
    // Set the new lane; the actual sliding happens in the physics update.
    P.lane = nl;
    // Restart the lane-change timer (used for close-call detection and leaning).
    P.laneT = 0;
    // Whoosh sound.
    Sound.swoosh();
    // A little dust kick if on the ground.
    if (P.grounded) puff(P.x, P.y + 0.05, P.z + 0.2, 3, 0xcfc6b8, { spread: 0.8, life: 0.45, size: 0.8 });
  }
  // jump(): jump if on the ground (not available while flying the jetpack).
  function jump() {
    // Only while playing and not flying.
    if (state !== 'playing' || power.jet > 0) return;
    // On the ground, OR "coyote time": a tiny grace period (0.12 s) just after
    // running off an edge where a jump still counts. Makes controls feel fair.
    if (P.grounded || (P.airT < 0.12 && P.vy <= 0)) {
      // Launch upward (much higher with super sneakers).
      P.vy = power.shoes > 0 ? SUPER_JUMP_V : JUMP_V;
      // Now in the air.
      P.grounded = false;
      // Mark the grace period as used up.
      P.airT = 1;
      // Jumping cancels a roll.
      P.rollT = 0;
      // Squash/stretch value: negative = stretched tall (a cartoony jump feel).
      P.squash = -0.25;
      // Jump sound.
      Sound.jump();
      // Dust puff (pink if wearing super sneakers).
      puff(P.x, P.y + 0.05, P.z + 0.2, 5, power.shoes > 0 ? 0xff385c : 0xcfc6b8, { spread: 1, life: 0.5 });
    }
  }
  // roll(): roll (slide) under things. In the air, it slams you down fast and rolls on landing.
  function roll() {
    // Only while playing and not flying.
    if (state !== 'playing' || power.jet > 0) return;
    // In the air: dive down quickly and remember to roll when we land.
    if (!P.grounded) { P.vy = Math.min(P.vy, -24); P.queuedRoll = true; }
    // On the ground: roll right away.
    else startRoll();
  }
  // startRoll(): begin a roll that lasts ROLL_TIME seconds.
  function startRoll() { P.rollT = ROLL_TIME; Sound.roll(); }

  // stumble(): you clipped something. First time: you stagger and the LASTMA officer
  // catches up close. If you stumble again while still staggered, you're caught.
  function stumble() {
    // Second stumble within the window = game over.
    if (P.stumbleT > 0) { die('caught'); return; }
    // 4.5 seconds of "staggered" state (the officer stays close).
    P.stumbleT = 4.5;
    // Camera shake.
    shake = 0.35;
    // Sounds: stumble and the officer's whistle.
    Sound.stumble();
    Sound.whistle();
    // Screen flash.
    flash();
  }

  // Game-over messages for each cause: [headline, tip]. Nigerian Pidgin flavour.
  const DEATH_TEXT = {
    caught: ['Oga LASTMA don catch you!', 'Two bumps and he caught up with you.'],
    danfo: ['You ran into a danfo!', 'The conductor is still shouting "Oshodi!"'],
    brt: ['BRT no dey brake!', 'Next time take the ramp onto the roof.'],
    keke: ['Keke wins this round.', 'Jump and you can land on the roof.'],
    gantry: ['ÈKÓ Ò NÍ BÀJẸ́!', 'Roll under the signs. Swipe down or press ↓.'],
  };

  // die(reason): end the run. reason = what killed you (a key of DEATH_TEXT).
  function die(reason) {
    // Ignore if already dead or not playing.
    if (state !== 'playing') return;
    // Switch to the short "dying" animation phase.
    state = 'dying';
    // Remember why, for the game-over screen.
    deathReason = reason;
    // Restart the death timer.
    deathT = 0;
    // Big camera shake.
    shake = 0.6;
    // Crash sound, and stop the jetpack roar.
    Sound.crash();
    Sound.jetOff();
    // Whistle if the officer caught you.
    if (reason === 'caught') Sound.whistle();
    // Screen flash.
    flash();
    // Stop the music.
    Sound.stopMusic();
    // Big white burst of dust at the crash.
    puff(P.x, P.y + 0.8, P.z - 0.3, 14, 0xffffff, { spread: 2.2, life: 0.7, size: 1.4, vy: 2 });
  }

  // collide(height): check the player against every obstacle.
  // height = the player's current body height (smaller when rolling).
  // Returns the "ground" height under the player (0 = road; higher if standing on a
  // ramp or a roof). May call die(), stumble() or sideHit().
  function collide(height) {
    // Default ground: the road.
    let ground = 0;
    // The player's front/back z extent (0.7 deep).
    const pz0 = P.z - 0.35, pz1 = P.z + 0.35;
    // Check each obstacle.
    for (const o of obstacles) {
      // Skip already-hit obstacles and ones not overlapping the player along z.
      if (o.hit || o.zBack > pz1 || o.zFront < pz0) continue;
      // How close in x counts as touching (half obstacle width + half player width).
      const reach = o.halfW + 0.32;
      // Not overlapping sideways: skip.
      if (Math.abs(P.x - o.x) >= reach) continue;
      // Ramp: no damage; the ground rises along it.
      if (o.kind === 'ramp') {
        // k = how far up the ramp we are (0 at the front, 1 at the back).
        const k = THREE.MathUtils.clamp((o.zFront - P.z) / (o.zFront - o.zBack), 0, 1);
        // Ground height = fraction of the ramp's height.
        ground = Math.max(ground, k * o.h);
        continue;
      }
      // Overhead gantry:
      if (o.kind === 'overhead') {
        // Hit if the body overlaps its height range (and we're not invulnerable).
        if (P.y + height > o.bottom && P.y < o.top && P.invuln <= 0) {
          // If we were in a different lane last frame, we brushed it from the side: just a stumble.
          if (Math.abs(P.prevX - o.x) >= reach) { sideHit(); return ground; }
          // Otherwise it's a head-on hit.
          die('gantry');
          return ground;
        }
        continue;
      // Raised obstacles (on a roof): skip if we're fully below them.
      }
      if (o.base && P.y + height < o.base + 0.05) continue;
      // If our feet are near or above its top, we land/run on top of it.
      if (P.y >= o.top - 0.45) { ground = Math.max(ground, o.top); continue; }
      // Invulnerable (just recovered / flying): pass through.
      if (P.invuln > 0) continue;
      // Came from the side during a lane change: bounce back and stumble.
      if (Math.abs(P.prevX - o.x) >= reach) { sideHit(); return ground; }
      // Trip-type obstacles (barriers): knock them over and stumble, don't die.
      if (o.stumble) {
        // Mark it so it's only hit once.
        o.hit = true;
        // Tip it over ...
        o.mesh.rotation.x = -1.35;
        // ... lift it a little ...
        o.mesh.position.y += 0.1;
        // ... and push it forward, like it was kicked.
        o.mesh.position.z -= 0.6;
        // Dust puff.
        puff(o.x, (o.base || 0) + 0.6, o.zFront, 8, 0xffffff, { spread: 1.5, life: 0.5 });
        // Stumble.
        stumble();
        continue;
      }
      // Head-on hit with a solid vehicle: game over.
      die(o.type);
      return ground;
    }
    // Nothing hit: return the ground height.
    return ground;
  }

  // sideHit(): bounce back to the previous lane and stumble.
  function sideHit() {
    // Return to the previous lane ...
    P.lane = P.prevLane;
    // ... instantly.
    P.x = P.prevX;
    // Stumble penalty.
    stumble();
  }

  // Time of the last "Close call!" message (to avoid spamming them).
  let lastPopup = 0;
  // checkCloseCalls(): reward narrowly dodging a vehicle by changing lane at the last moment.
  function checkCloseCalls() {
    // Look at every obstacle.
    for (const o of obstacles) {
      // Only ground-level solid obstacles we haven't checked yet, once they're just behind us.
      if (o.passed || o.kind !== 'solid' || o.base || o.zBack <= P.z + 0.4) continue;
      // Mark it checked.
      o.passed = true;
      // Sideways distance from the player.
      const dx = Math.abs(o.x - P.x);
      // Close call if: not flying, changed lane in the last 0.55 s, in the next lane
      // over, below its roof, not a barrier, and no popup in the last 0.8 s.
      if (power.jet <= 0 && P.laneT < 0.55 && dx > 1.2 && dx < 3 && P.y < o.top - 0.5 && o.type !== 'barrier' && t - lastPopup > 0.8) {
        // Bonus points.
        const bonus = 25 * mult;
        // Add them.
        score += bonus;
        // Remember when.
        lastPopup = t;
        // Show the message.
        popup(`Close call! +${bonus}`);
        // Chime.
        Sound.close();
      }
    }
  }

  // collectStuff(dt): spin coins, apply the magnet, and pick up coins and power-ups.
  function collectStuff(dt) {
    // Height of the player's chest (where pickups are checked).
    const cy = P.y + 0.9;
    // Is the magnet active?
    const magnet = power.magnet > 0;
    // Every coin:
    for (const c of coins) {
      // Its model.
      const m = c.mesh;
      // Only draw coins within 110 units ahead (saves work).
      m.visible = m.position.z > P.z - 110;
      // Skip far-away coins.
      if (!m.visible) continue;
      // Spin it.
      m.rotation.y += dt * 4;
      // Magnet: start pulling coins within 18 units ahead.
      if (magnet && !c.fly && m.position.z > P.z - 18 && m.position.z < P.z + 1) c.fly = true;
      // A pulled coin ...
      if (c.fly) {
        // ... moves a fraction k of the way to the player each frame (smooth homing).
        const k = Math.min(1, dt * 12);
        m.position.x += (P.x - m.position.x) * k;
        m.position.y += (cy - m.position.y) * k;
        m.position.z += (P.z - 0.2 - m.position.z) * k;
      }
      // Close enough in x, z and height: collect it!
      if (Math.abs(m.position.x - P.x) < 0.95 && Math.abs(m.position.z - P.z) < 0.9 && Math.abs(m.position.y - cy) < 1.25) {
        // Golden sparkle.
        puff(m.position.x, m.position.y, m.position.z, 2, 0xffd54f, { spread: 0.6, life: 0.35, size: 0.6, add: true, op: 0.9 });
        // Move it far away; cleanup() will remove it later.
        m.position.z = 1e6;
        // Count it.
        runCoins++;
        // 5 points x multiplier, doubled with the 2X power-up.
        score += 5 * mult * (power.x2 > 0 ? 2 : 1);
        // Ding!
        Sound.coin();
      }
    }
    // Every power-up:
    for (const p of powerups) {
      // Its model.
      const m = p.mesh;
      // Bob up and down (sine wave over time; z offsets each one's timing).
      m.position.y = 1.1 + Math.sin(t * 3 + m.position.z) * 0.15;
      // Spin the icon inside it.
      if (m.children[1]) m.children[1].rotation.y += dt * 2.5;
      // Touching it?
      if (Math.abs(m.position.x - P.x) < 1.0 && Math.abs(m.position.z - P.z) < 1.0 && Math.abs(m.position.y - cy) < 1.4) {
        // Move it away (removed later).
        m.position.z = 1e6;
        // Start (or refill) that power-up's timer.
        power[p.type] = POWER[p.type].time;
        // Sound.
        Sound.power();
        // Show its name.
        toast(`${POWER[p.type].label}!`, 'power');
        // Pink sparkle burst.
        puff(P.x, P.y + 1, P.z, 12, 0xff385c, { spread: 2, life: 0.6, add: true, op: 0.8 });
        // Jetpack picked up:
        if (p.type === 'jet') {
          // Remember we're flying (for the landing later).
          P.wasFlying = true;
          // Not gliding down yet.
          P.glide = false;
          // Cancel any roll.
          P.rollT = 0;
          // Zoom the camera out for a sense of speed.
          fovKick = 10;
          // Small shake.
          shake = 0.25;
          // Show the jetpack on the runner's back ...
          jetpack.visible = true;
          // ... start its roar ...
          Sound.jetOn();
          // ... and lay a trail of coins in the sky.
          spawnAirCoins();
        }
      }
    }
  }
  // update(dt): one step of gameplay physics while playing. dt = seconds since
  // the last frame. Moves the player forward, handles lanes, jumping, gravity,
  // landing, timers, pickups, spawning and the chaser distance.

  // Speed starts at 16 and smoothly approaches 34 as you run further.
  // exp(-distance/2400) shrinks from 1 towards 0, so the increase slows down over time.
  function update(dt) {
    // Jetpack makes you 15% faster.
    speed = 16 + 18 * (1 - Math.exp(-distance / 2400));
    if (power.jet > 0) speed *= 1.15;
    // dz = distance travelled this frame (speed x time).
    const dz = speed * dt;
    // Total distance run.
    distance += dz;
    // Move the player forward. Forward is NEGATIVE z in this game's world.
    // (The camera and the road strips follow the player, so the road seems endless.)
    P.z -= dz;
    // Score multiplier: +1 every 700 units, up to x6.
    mult = Math.min(6, 1 + Math.floor(distance / 700));
    // Points for distance: half a point per unit, times multiplier (and 2X power-up).
    score += dz * mult * (power.x2 > 0 ? 2 : 1) * 0.5;

    // Remember last frame's x (used to tell side hits from head-on hits).
    P.prevX = P.x;
    // Slide smoothly towards the target lane: move a fraction of the remaining gap each frame
    // (min(1, ...) stops it overshooting when dt is large).
    P.x += (LANES[P.lane] - P.x) * Math.min(1, dt * 16);
    // Time since the last lane change.
    P.laneT += dt;
    // Count down the roll, stumble and invulnerability timers.
    if (P.rollT > 0) P.rollT -= dt;
    if (P.stumbleT > 0) P.stumbleT -= dt;
    if (P.invuln > 0) P.invuln -= dt;
    // Count down every active power-up timer, never below 0.
    for (const k in power) if (power[k] > 0) power[k] = Math.max(0, power[k] - dt);

    // FLYING with the jetpack:
    if (power.jet > 0) {
      // Glide smoothly up to flying height.
      P.y += (FLY_Y - P.y) * Math.min(1, dt * 2.6);
      // No gravity, not grounded, can't roll; airT = 1 blocks coyote-time jumps.
      P.vy = 0; P.grounded = false; P.rollT = 0; P.airT = 1;
      // In the last 1.2 s, start descending a bit as a warning that it's ending.
      if (power.jet < 1.2) P.y += (FLY_Y - 1.5 - P.y) * Math.min(1, dt * 1.5);
    // NOT flying (normal running):
    } else {
      // The jetpack just ran out:
      if (P.wasFlying) {
        // Switch to a slow glide down, with 1.8 s of invulnerability so you can't
        // land straight onto a bus and die unfairly.
        P.wasFlying = false; P.glide = true; P.invuln = 1.8; P.vy = 0;
        // Hide the jetpack ...
        jetpack.visible = false;
        // ... stop its roar ...
        Sound.jetOff();
        // ... and tell the player.
        toast('Landing — you’re safe for a moment', 'power');
      }
      // Body height: shorter while rolling (so you fit under gantries).
      const height = P.rollT > 0 ? 0.9 : 1.75;
      // Check collisions; this also tells us the ground height under us (road, ramp, roof).
      const ground = collide(height);
      // If a collision just killed us, stop updating.
      if (state !== 'playing') return;
      // Gravity: speed downward increases every frame (weaker while gliding).
      P.vy -= (P.glide ? 13 : G) * dt;
      // While gliding, never fall faster than 7 units/s (like a parachute).
      if (P.glide) P.vy = Math.max(P.vy, -7);
      // Move vertically by the vertical velocity.
      P.y += P.vy * dt;
      // Reached (or sank below) the ground:
      if (P.y <= ground) {
        // True only on the first frame of touching down.
        const landed = !P.grounded;
        // How hard we hit the ground (downward speed).
        const impact = -P.vy;
        // Snap onto the ground and stop falling.
        P.y = ground; P.vy = 0; P.grounded = true; P.airT = 0;
        // Just landed:
        if (landed) {
          // Gliding is over.
          P.glide = false;
          // A hard landing:
          if (impact > 6) {
            // Squash the character a bit (stronger for harder landings, capped).
            P.squash = Math.min(0.35, impact * 0.022);
            // Dust puff ...
            puff(P.x, P.y + 0.05, P.z + 0.1, 7, 0xcfc6b8, { spread: 1.6, life: 0.55 });
            // ... and a thud.
            Sound.land();
          }
          // If roll was pressed mid-air, roll now.
          if (P.queuedRoll) { P.queuedRoll = false; startRoll(); }
        }
      // Clearly above the ground (e.g. ran off a bus roof):
      } else if (P.y > ground + 0.06) {
        // Now airborne ...
        P.grounded = false;
        // ... counting how long (for coyote time).
        P.airT += dt;
      }
    }

    // Reward near misses.
    checkCloseCalls();
    // Coins and power-ups.
    collectStuff(dt);
    // Show a landmark's name when the player passes its trigger point
    // (loop backwards so removing an item is safe).
    for (let i = triggers.length - 1; i >= 0; i--) if (P.z < triggers[i].z) { toast(triggers[i].name, 'place'); triggers.splice(i, 1); }
    // Build more world ahead and remove what's behind.
    spawnScenery();
    spawnObstacles();
    cleanup();

    // The officer: stays far back (16) normally, rushes close (2.3) while you're staggered.
    const target = P.stumbleT > 0 ? 2.3 : 16;
    // Ease towards that distance: fast when closing in, slow when falling back.
    chaserDist += (target - chaserDist) * Math.min(1, dt * (target < chaserDist ? 2.5 : 0.5));
  }

  // updateDying(dt): the short crash animation before the game-over screen.
  function updateDying(dt) {
    // Time since the crash.
    deathT += dt;
    // Slow down rapidly (lose 98% of speed per second).
    speed *= Math.pow(0.02, dt);
    // Keep sliding forward a little.
    P.z -= speed * dt;
    // Fall under gravity ...
    P.vy -= G * dt;
    // ... but not through the road.
    P.y = Math.max(0, P.y + P.vy * dt);
    // The officer walks right up to you.
    chaserDist += (1.3 - chaserDist) * Math.min(1, dt * 2.5);
    // Tilt the player forward as they fall.
    player.rotation.x += (0.35 - player.rotation.x) * Math.min(1, dt * 6);
    // After 1.1 seconds, show the game-over screen.
    if (deathT > 1.1 && state === 'dying') showGameOver();
  }

  // ---------------------------------------------------------------------
  // OPPONENT (PvP "ghost"): a see-through copy of your rival's runner. Their
  // position arrives over the network a few times a second; we smooth it out
  // between updates so it moves fluidly.
  // ---------------------------------------------------------------------
  /* =================== OPPONENT (ghost runner) =================== */
  // Opponent data: d = distance, v = speed, t = time of last update, x/y = position,
  // r/f/j = rolling/flying/jumping flags, sc = score, c = coins, alive, final result,
  // rematch wanted, zr/xr/yr = smoothed displayed position, phase = animation cycle.
  const opp = { key: null, name: 'Friend', model: null, jet: null, d: 0, v: 0, t: 0, x: 0, y: 0, r: 0, f: 0, j: 0, sc: 0, c: 0, alive: false, final: null, rematch: false, zr: 0, xr: 0, yr: 0, phase: 0 };
  // Did I ask for a rematch?
  let meRematch = false;

  // nameSprite(text): make a pink rounded name tag floating above the rival.
  // Returns a THREE.Sprite (a flat picture that always faces the camera).
  function nameSprite(text) {
    // Draw the tag on a 256x72 canvas.
    const tex = LM.canvasTex(256, 72, (g, w, h) => {
      // Corner radius.
      const r = 30;
      // Pink fill.
      g.fillStyle = '#ff385c';
      // Trace a pill shape: straight top, right half-circle, straight bottom, left half-circle.
      g.beginPath();
      g.moveTo(r + 4, 4); g.lineTo(w - r - 4, 4); g.arc(w - r - 4, h / 2, h / 2 - 4, -Math.PI / 2, Math.PI / 2);
      g.lineTo(r + 4, h - 4); g.arc(r + 4, h / 2, h / 2 - 4, Math.PI / 2, -Math.PI / 2);
      // Fill it.
      g.fill();
      // White bold centred text.
      g.fillStyle = '#fff'; g.font = '800 34px "Plus Jakarta Sans", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      // Write the name.
      g.fillText(text, w / 2, h / 2 + 2);
    });
    // Sprite that ignores depth (drawn on top even behind objects), see-through edges.
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    // Size of the tag in world units.
    s.scale.set(1.5, 0.42, 1);
    // Draw after everything else.
    s.renderOrder = 10;
    return s;
  }

  // setOppRunner(key): build the rival's ghost model for their chosen character.
  function setOppRunner(key) {
    // Unknown character (or the officer): use Tunde.
    if (!LM.VARIANTS[key] || key === 'officer') key = 'tunde';
    // Already showing that character: nothing to do.
    if (opp.model && opp.key === key) return;
    // Remove the old ghost.
    if (opp.model) scene.remove(opp.model);
    // Remember the character and its display name.
    opp.key = key;
    opp.name = LM.VARIANTS[key].name;
    // Build and merge the model (no outlines: it's a ghost).
    const m = bakeRig(LM.createRunner(key));
    // For every mesh in it ...
    m.traverse((o) => {
      if (!o.isMesh) return;
      // ... give it its own copy of the material (so we don't make every model see-through) ...
      o.material = o.material.clone();
      // ... make it 60% opaque ...
      o.material.transparent = true;
      o.material.opacity = 0.6;
      // ... and no shadow.
      o.castShadow = false;
    });
    // Name tag ...
    const tag = nameSprite(opp.name);
    // ... floating above the head.
    tag.position.y = 2.3;
    m.add(tag);
    // The rival's own jetpack, hidden until they fly.
    opp.jet = LM.createJetpack();
    opp.jet.position.set(0, 0.36, 0.3);
    opp.jet.visible = false;
    m.userData.rig.torso.add(opp.jet);
    // Hidden until a PvP race starts.
    m.visible = false;
    // Save it and add it to the world.
    opp.model = m;
    scene.add(m);
    // Put their name in the HUD.
    $('#opp-name').textContent = opp.name;
  }

  // animateOpp(dt): move and animate the ghost every frame.
  function animateOpp(dt) {
    // Only show it during a PvP race.
    const show = mode === 'pvp' && opp.model && ['countdown', 'playing', 'dying', 'over', 'paused'].includes(state);
    // No model yet: nothing to do.
    if (!opp.model) return;
    // Show/hide (!! turns the value into true/false).
    opp.model.visible = !!show;
    // Hidden: stop here.
    if (!show) return;
    // Current time in milliseconds.
    const now = performance.now();
    // Estimate where they are NOW: last known distance + speed x time since the update
    // (capped at 0.3 s so a lag spike doesn't send them flying ahead). This is "extrapolation".
    const dEst = opp.alive && opp.t ? opp.d + opp.v * Math.min(0.3, (now - opp.t) / 1000) : opp.d;
    // Smoothing amount for this frame.
    const k = Math.min(1, dt * 12);
    // Ease the displayed position towards the target (distance d means z = -d).
    opp.zr += (-dEst - opp.zr) * k;
    opp.xr += (opp.x - opp.xr) * k;
    opp.yr += (opp.y - opp.yr) * k;
    // Place the model.
    opp.model.position.set(opp.xr, opp.yr, opp.zr);
    // Choose an animation: fallen if crashed, idle in countdown, else fly/roll/jump/run.
    const m = !opp.alive && opp.final ? 'fall' : state === 'countdown' ? 'idle' : opp.f ? 'fly' : opp.r ? 'roll' : opp.j ? 'jump' : 'run';
    // Advance the animation cycle (faster when they run faster).
    opp.phase += dt * (m === 'idle' ? 2 : 8 + opp.v * 0.32);
    // Pose the limbs.
    LM.poseRunner(opp.model, opp.phase, m, dt);
    // Their body joint.
    const body = opp.model.userData.rig.body;
    // Rolling: spin the body forward.
    if (m === 'roll') body.rotation.x -= dt * 10;
    // Otherwise straighten it back up smoothly.
    else body.rotation.x += (0 - body.rotation.x) * Math.min(1, dt * 12);
    // Lean forward while flying.
    opp.model.rotation.x = m === 'fly' ? -0.5 : 0;
    // Show their jetpack only when flying.
    opp.jet.visible = m === 'fly';
    // Flicker the jetpack flames by randomly stretching them.
    if (opp.jet.visible) opp.jet.children.forEach((c) => { if (c.name === 'flame') c.scale.y = 0.8 + Math.random() * 0.6; });
  }

  // ---------------------------------------------------------------------
  // ANIMATION / CAMERA
  // ---------------------------------------------------------------------
  /* =================== ANIMATION / CAMERA =================== */
  // animate(dt): pose and place every visible character and effect each frame,
  // and keep the road, sun and lights following the player.
  function animate(dt) {
    // Total time (drives many wobbles and blinks).
    t += dt;
    // The player's skeleton joints.
    const rig = player.userData.rig;
    // Which animation to use.
    let pose = 'idle';
    // Flying right now?
    const flying = power.jet > 0 && state === 'playing';
    // Menu: mostly idle, occasionally waving at you.
    if (state === 'menu') pose = Math.sin(t * 0.5) > 0.4 ? 'wave' : 'idle';
    // Countdown: standing ready.
    else if (state === 'countdown') pose = 'idle';
    // Crashed: falling over.
    else if (state === 'dying' || state === 'over') pose = 'fall';
    // Paused: frozen in running pose.
    else if (state === 'paused') pose = 'run';
    // Otherwise pick fly / roll / jump / run depending on what the player is doing.
    else if (flying) pose = 'fly';
    else if (P.rollT > 0) pose = 'roll';
    else if (!P.grounded) pose = 'jump';
    else pose = 'run';
    // While playing, the run cycle speeds up with speed (faster legs).
    if (state === 'playing') runPhase += dt * (8 + speed * 0.32);
    // In the menu/countdown, slow gentle movement.
    else if (state === 'menu' || state === 'countdown') runPhase += dt * 2;
    // Apply the pose (skip while paused so it freezes).
    if (state !== 'paused') LM.poseRunner(player, runPhase, pose, dt);

    // Rolling: spin the whole body one full turn (2 x PI radians) over the roll.
    if (pose === 'roll') {
      // k goes from 0 to 1 during the roll.
      const k = 1 - Math.max(0, P.rollT) / ROLL_TIME;
      rig.body.rotation.x = -k * Math.PI * 2;
    // Not rolling: smoothly straighten the body.
    } else {
      rig.body.rotation.x += (0 - rig.body.rotation.x) * Math.min(1, dt * 12);
    }
    // Move the 3D model to the physics position.
    player.position.set(P.x, P.y, P.z);
    // While playing:
    if (state === 'playing') {
      // How far we still have to slide to reach our lane.
      const dx = LANES[P.lane] - P.x;
      // Turn to face the direction we're moving ...
      player.rotation.y = -dx * 0.22;
      // ... lean into the lane change (smoothed) ...
      player.rotation.z += (-dx * 0.18 - player.rotation.z) * Math.min(1, dt * 12);
      // ... and lean forward when flying.
      player.rotation.x += ((flying ? -0.55 : 0) - player.rotation.x) * Math.min(1, dt * 6);
      // Footstep dust while running:
      if (pose === 'run') {
        // Each half-turn of the run cycle (PI) is one footstep.
        const stepIdx = Math.floor(runPhase / Math.PI);
        // A new step:
        if (stepIdx !== lastStep) {
          // Remember it ...
          lastStep = stepIdx;
          // ... and kick up a tiny puff under the left or right foot.
          if (speed > 14) puff(P.x + (stepIdx % 2 ? 0.1 : -0.1), P.y + 0.04, P.z + 0.15, 1, 0xd2c8b8, { spread: 0.5, life: 0.4, size: 0.7, vy: 0.4, op: 0.4 });
        }
      }
    }
    // Ease the squash value back to 0 (normal shape).
    P.squash = P.squash ? P.squash + (0 - P.squash) * Math.min(1, dt * 10) : 0;
    // Only squash during play.
    const sq = state === 'playing' ? P.squash || 0 : 0;
    // Squash/stretch: shorter AND wider (or taller and thinner), keeping the volume similar.
    player.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);

    // Jetpack showing:
    if (jetpack.visible) {
      // Flicker the flames.
      jetpack.children.forEach((c) => { if (c.name === 'flame') c.scale.set(1, 0.7 + Math.random() * 0.8, 1); });
      // While playing ...
      if (state === 'playing') {
        // ... shoot fire particles (orange/yellow, glowing) out of both nozzles.
        for (const s of [-0.1, 0.1]) puff(P.x + s, P.y + 0.55, P.z + 0.4, 1, Math.random() < 0.5 ? 0xff8a00 : 0xffd54f, { spread: 0.25, vy: -3, vz: 4, life: 0.35, size: 0.7, add: true, op: 0.85, jitter: 0.05 });
      }
    }

    // In the menu, the officer stands beside you, idling.
    if (state === 'menu') {
      // Position ...
      officer.position.set(1.6, 0, P.z + 3.2);
      // ... turned slightly ...
      officer.rotation.y = 0.35;
      // ... idle animation ...
      LM.poseRunner(officer, t * 2, 'idle', dt);
      // ... visible.
      officer.visible = true;
    // During a run:
    } else {
      // Only show him when close enough to matter, and only in solo mode.
      officer.visible = chaserDist < 14 && mode === 'solo';
      // Facing forward.
      officer.rotation.y = 0;
      // Follow the player's lane (smoothed).
      officer.position.x += (P.x - officer.position.x) * Math.min(1, dt * 4);
      // On the road ...
      officer.position.y = 0;
      // ... chaserDist behind the player.
      officer.position.z = P.z + chaserDist;
      // Running animation (idle once it's game over).
      if (state !== 'paused') LM.poseRunner(officer, runPhase * 0.95 + 1, state === 'over' ? 'idle' : 'run', dt);
    }

    // Update the ghost, dust and speed lines.
    animateOpp(dt);
    updateDust(dt);
    updateStreaks(dt);

    // Blinking lights: switch brightness on/off about 1.4 times a second.
    blinkMat.emissiveIntensity = Math.sin(t * 9) > 0 ? 2.6 : 0.25;
    // Slowly drift the water texture (for the lagoon under the bridges).
    LM.tex().water.offset.x += dt * 0.012;
    LM.tex().water.offset.y += dt * 0.006;

    // The scrolling strips are centred 120 units ahead of the player, so they always cover the view.
    const cz = P.z - 120;
    // For each road/sidewalk/curb strip:
    for (const s of scrollers) {
      // Move the strip along with the player ...
      s.mesh.position.z = cz;
      // ... and shift its texture by exactly how far it moved, so the painted road
      // appears to stay fixed in the world while the strip travels with us.
      const v = s.sign * (-cz * s.R / ROAD_LEN);
      // Keep the offset between 0 and 1 (the double % also handles negative numbers).
      s.tex.offset[s.axis] = ((v % 1) + 1) % 1;
    }
    // The big ground plane follows too.
    ground.position.set(0, -0.02, P.z - 150);

    // The sun follows the player so its shadows always cover the area around them.
    sun.position.set(P.x + 10, 26 + P.y, P.z + 8);
    // The sun aims a bit ahead of the player.
    sun.target.position.set(P.x, 0, P.z - 12);
    // The night-time light floats above the player.
    playerLight.position.set(P.x, P.y + 3, P.z + 1);
  }

  // Reusable vectors: where the camera wants to be, and what it wants to look at.
  const want = new V3(), look = new V3();
  // updateCamera(dt): smoothly move the camera behind the player, plus shake,
  // lean, field-of-view effects and the speed vignette.
  function updateCamera(dt) {
    // Tall phone screen? Then pull the camera further back.
    const portrait = camera.aspect < 0.8;
    // Menu: the camera slowly swings around the runner.
    if (state === 'menu') {
      // Swing angle oscillates over time.
      const a = Math.sin(t * 0.25) * 0.7 + 0.35;
      // Orbit radius.
      const r = portrait ? 6.4 : 5.2;
      // A point on a circle around the player.
      want.set(P.x + Math.sin(a) * r, portrait ? 1.7 : 2.1, P.z - Math.cos(a) * r);
      // Look at the runner.
      look.set(P.x, portrait ? -0.9 : 1.15, P.z);
    // During a run:
    } else {
      // Flying?
      const flying = power.jet > 0 && state === 'playing';
      // Distance behind: more on phones, when flying, and at high speed.
      const back = (portrait ? 8.2 : 6.8) + (flying ? 2.5 : 0) + Math.max(0, speed - 20) * 0.06;
      // Behind and above the player, following their height partly (x0.75 keeps it centred-ish).
      want.set(P.x * 0.75, (portrait ? 4.2 : 3.5) + P.y * 0.78, P.z + back);
      // Look a bit ahead of the player.
      look.set(P.x * 0.6, 1.2 + P.y * 0.8, P.z - 8);
      // Small up-down bob while running, for a feeling of footsteps.
      if (state === 'playing' && P.grounded && P.rollT <= 0) want.y += Math.abs(Math.sin(runPhase)) * 0.06;
    }
    // Smoothing factor that behaves the same at any frame rate (exponential smoothing).
    const k = 1 - Math.exp(-dt * (state === 'menu' ? 3 : 7));
    // Move the camera and its look point part of the way towards their targets.
    camera.position.lerp(want, k);
    camLook.lerp(look, k);
    // Camera shake: random jitter that fades out over time.
    if (shake > 0) {
      shake = Math.max(0, shake - dt);
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
    }
    // Point the camera.
    camera.lookAt(camLook);
    // Tilt slightly during lane changes.
    if (state === 'playing') camera.rotateZ((P.x - LANES[P.lane]) * 0.035);

    // The FOV kick fades away.
    fovKick += (0 - fovKick) * Math.min(1, dt * 2);
    // Wider field of view at high speed and when flying = stronger sense of speed.
    const targetFov = baseFov + (state === 'playing' ? Math.max(0, speed - 16) * 0.38 + (power.jet > 0 ? 7 : 0) : 0) + fovKick;
    // Only change it if needed (updating the projection costs a little).
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      // Ease towards the target ...
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
      // ... and apply it.
      camera.updateProjectionMatrix();
    }
    // Darken the screen edges (vignette) more at higher speed.
    ui.vignette.style.opacity = state === 'playing' ? String(THREE.MathUtils.clamp((speed - 20) / 14, 0, 1) * 0.8 + (power.jet > 0 ? 0.3 : 0)) : '0';
  }

  // ---------------------------------------------------------------------
  // UI: the HTML elements layered over the 3D canvas (HUD, menus, popups).
  // ---------------------------------------------------------------------
  /* =================== UI =================== */
  // References to the page elements, looked up once.
  const ui = {
    score: $('#score'), coins: $('#coins'), mult: $('#mult'), powers: $('#powers'), toast: $('#toast'), toastText: $('#toast-text'),
    menu: $('#menu'), pause: $('#pause'), over: $('#over'), best: $('#best'), bank: $('#bank'), tagline: $('#tagline'), flash: $('#flash'),
    popup: $('#popup'), countdown: $('#countdown'), oppPill: $('#opp-pill'), oppText: $('#opp-text'), vignette: $('#vignette'),
  };
  // The last values written to the HUD (to avoid needless page updates).
  let lastHud = '';
  // updateHud(): refresh the score, coins, multiplier, power-up bars and PvP status.
  function updateHud() {
    // Effective multiplier (doubled by 2X).
    const m = mult * (power.x2 > 0 ? 2 : 1);
    // A text "fingerprint" of the numbers shown.
    const key = `${Math.floor(score)}|${runCoins}|${m}`;
    // Only touch the page if something changed (changing the page is slowish).
    if (key !== lastHud) {
      // Remember it.
      lastHud = key;
      // Score with thousands separators (e.g. 12,345).
      ui.score.textContent = Math.floor(score).toLocaleString();
      // Coins and multiplier.
      ui.coins.textContent = runCoins;
      ui.mult.textContent = `x${m}`;
    }
    // Build HTML for each active power-up with a bar showing time left.
    let html = '';
    // For each power-up ...
    for (const k in power) {
      // ... a label and a bar whose width is the percentage of time remaining.
      if (power[k] > 0) html += `<div class="power">${POWER[k].label}<span class="bar"><i style="width:${(power[k] / POWER[k].time) * 100}%"></i></span></div>`;
    }
    // Only replace the HTML if it changed (stored on the element as _h).
    if (ui.powers._h !== html) { ui.powers.innerHTML = html; ui.powers._h = html; }
    // PvP race status pill:
    if (mode === 'pvp') {
      // Text and CSS class for the pill.
      let txt, cls = '';
      // Rival crashed: show their final score.
      if (!opp.alive && opp.final) { txt = `${opp.name} crashed · ${opp.final.sc.toLocaleString()}`; cls = 'out'; }
      // Rival disconnected.
      else if (!PvP.connected && !opp.alive) { txt = `${opp.name} left`; cls = 'out'; }
      // Otherwise show how far ahead or behind they are.
      else {
        // Positive = they're ahead.
        const diff = Math.round(opp.d - distance);
        // e.g. "Amaka · 12m ahead · 3,400".
        txt = `${opp.name} · ${Math.abs(diff)}m ${diff >= 0 ? 'ahead' : 'behind'} · ${opp.sc.toLocaleString()}`;
        // Highlight the pill when the rival is ahead.
        cls = diff > 0 ? 'ahead' : '';
      }
      // Update the text only if it changed.
      if (ui.oppText.textContent !== txt) ui.oppText.textContent = txt;
      // Set the CSS classes (controls the pill's colour).
      ui.oppPill.className = `pill opp ${cls}`;
    }
  }

  // Timer id for hiding the toast.
  let toastTimer = 0;
  // toast(text, kind): show a banner message for 2.6 seconds.
  // kind = 'place' (landmark name, "Now passing ...") or 'power' (plain bold text).
  function toast(text, kind) {
    // Fill in the message (the HTML <b> tag makes it bold).
    ui.toastText.innerHTML = kind === 'place' ? `Now passing <b>${text}</b>` : `<b>${text}</b>`;
    // Slide it in (the CSS class "show" animates it).
    ui.toast.classList.add('show');
    // Cancel any earlier hide timer so a new toast stays its full time ...
    clearTimeout(toastTimer);
    // ... and hide it after 2.6 seconds.
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2600);
  }
  // popup(text): show a short pop-up message like "Close call! +50".
  function popup(text) {
    // Set the text.
    ui.popup.textContent = text;
    // Restart the CSS animation: remove the class, force the browser to recalculate
    // layout (reading offsetWidth does that), then add the class back.
    ui.popup.classList.remove('show');
    void ui.popup.offsetWidth;
    ui.popup.classList.add('show');
  }
  // flash(): a quick white screen flash on crashes and stumbles.
  function flash() {
    // Turn the flash on ...
    ui.flash.classList.add('on');
    // ... and off again two frames later (so the CSS fade-out transition plays).
    requestAnimationFrame(() => requestAnimationFrame(() => ui.flash.classList.remove('on')));
  }

  // refreshMenu(): update the main menu (best score, coin bank, chosen runner).
  function refreshMenu() {
    // Best score ever (the + turns the saved text into a number).
    ui.best.textContent = (+store.get('ekorush-best', 0)).toLocaleString();
    // Total coins collected across all runs.
    ui.bank.textContent = (+store.get('ekorush-bank', 0)).toLocaleString();
    // Highlight the selected runner's button.
    document.querySelectorAll('.runner-btn').forEach((b) => b.classList.toggle('active', b.dataset.runner === runnerKey));
    // Show that runner's tagline ...
    ui.tagline.textContent = LM.VARIANTS[runnerKey].tagline;
    // ... and name.
    $('#me-name').textContent = LM.VARIANTS[runnerKey].name;
  }

  // setRunner(key): switch to a different character.
  function setRunner(key) {
    // Already chosen: nothing to do.
    if (key === runnerKey) return;
    // Remember it ...
    runnerKey = key;
    // ... permanently.
    store.set('ekorush-runner', key);
    // Rebuild the 3D model ...
    buildPlayer();
    // ... update the menu ...
    refreshMenu();
    // ... and tell the PvP rival (if connected) which character we are.
    PvP.send({ t: 'hello', runner: runnerKey });
  }

  // setMenuMode(m): switch the menu tab between 'solo' and 'pvp'.
  function setMenuMode(m) {
    // Remember the tab.
    menuMode = m;
    // Highlight the right tab (aria-selected helps screen readers).
    document.querySelectorAll('.tab').forEach((b) => { const on = b.dataset.mode === m; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    // Show only the buttons for the chosen tab.
    $('#solo-actions').hidden = m !== 'solo';
    $('#pvp-actions').hidden = m !== 'pvp';
  }

  // showMenu(): go back to the main menu and reset the world behind it.
  function showMenu() {
    // Menu state, solo mode.
    state = 'menu';
    mode = 'solo';
    // Remove page-wide CSS classes used during a run.
    document.body.classList.remove('playing', 'pvp');
    // Hide game-over and pause screens, show the menu.
    ui.over.hidden = true; ui.pause.hidden = true; ui.menu.hidden = false;
    // Hide the PvP pill and countdown.
    ui.oppPill.hidden = true;
    ui.countdown.textContent = '';
    // Fresh world as the menu background.
    resetWorld();
    // Update menu numbers.
    refreshMenu();
    // Still connected to a friend? Go straight to the PvP "ready" screen.
    if (PvP.connected) { setMenuMode('pvp'); pvpView('ready'); }
  }

  // startRun(seed, pvp): start a new run. seed = course seed (PvP), pvp = true for a race.
  function startRun(seed, pvp) {
    // Allow audio (we're inside a click/tap handler).
    Sound.unlock();
    // Hide all menus.
    ui.menu.hidden = true; ui.over.hidden = true; ui.pause.hidden = true;
    // Set the mode.
    mode = pvp ? 'pvp' : 'solo';
    // CSS class for PvP-only styling.
    document.body.classList.toggle('pvp', !!pvp);
    // Show the rival pill only in PvP.
    ui.oppPill.hidden = !pvp;
    // Build a fresh course (same seed = same course for both players).
    resetWorld(seed);
    // Solo: the officer starts right behind you for a dramatic start. PvP: far back.
    chaserDist = pvp ? 20 : 2.6;
    // Officer starts in your lane.
    officer.position.x = P.x;
    // Force the HUD to redraw.
    lastHud = '';
    // Switch the page into "playing" layout.
    document.body.classList.add('playing');
    // PvP: a 3-2-1 countdown first so both start together.
    if (pvp) {
      // Countdown state ...
      state = 'countdown';
      // ... 3.2 seconds ...
      countdownT = 3.2;
      // ... and no number shown yet.
      lastCount = 0;
    // Solo: go immediately.
    } else {
      goRun();
    }
  }

  // goRun(): the run actually begins.
  function goRun() {
    // Physics starts.
    state = 'playing';
    // Music on.
    Sound.startMusic();
    // Solo: whistle and a warning message.
    if (mode === 'solo') { Sound.whistle(); toast('Run! LASTMA is right behind you', 'power'); }
  }

  // updateCountdown(dt): run the 3-2-1-GO! countdown.
  function updateCountdown(dt) {
    // Count down.
    countdownT -= dt;
    // Whole number to show (3, 2, 1, then 0 or less = GO).
    const n = Math.ceil(countdownT - 0.2);
    // Only act when the number changes.
    if (n !== lastCount) {
      // Remember it.
      lastCount = n;
      // Show the number or "GO!".
      ui.countdown.textContent = n > 0 ? String(n) : 'GO!';
      // Restart the pop animation (same trick as popup()).
      ui.countdown.classList.remove('pop');
      void ui.countdown.offsetWidth;
      ui.countdown.classList.add('pop');
      // Beep (higher for GO).
      Sound.beep(n <= 0);
      // GO: start running, and clear "GO!" once its animation has finished.
      if (n <= 0) {
        goRun();
        setTimeout(() => { if (ui.countdown.textContent === 'GO!') { ui.countdown.textContent = ''; ui.countdown.classList.remove('pop'); } }, 950);
      }
    }
  }

  // togglePause(): pause or resume (solo only).
  function togglePause() {
    // No pausing in PvP (it would be unfair); just tell the player.
    if (mode === 'pvp') { if (state === 'playing') toast('No pausing in a race!', 'power'); return; }
    // Pause:
    if (state === 'playing') {
      // Freeze the game ...
      state = 'paused';
      // ... show the pause screen ...
      ui.pause.hidden = false;
      // ... and stop the sounds.
      Sound.stopMusic();
      Sound.jetOff();
    // Resume:
    } else if (state === 'paused') {
      // Unfreeze ...
      state = 'playing';
      // ... hide the pause screen ...
      ui.pause.hidden = true;
      // ... and restart music (and the jetpack roar if still flying).
      Sound.startMusic();
      if (power.jet > 0) Sound.jetOn();
    }
  }

  // showGameOver(): show the end screen and save best score and coins.
  function showGameOver() {
    // Game over state.
    state = 'over';
    // Final whole-number score.
    finalScore = Math.floor(score);
    // Previous best.
    const best = +store.get('ekorush-best', 0);
    // New record?
    const isBest = finalScore > best;
    // Save it.
    if (isBest) store.set('ekorush-best', finalScore);
    // Add this run's coins to the saved coin bank.
    store.set('ekorush-bank', +store.get('ekorush-bank', 0) + runCoins);
    // Show the "New best!" badge only if it's a record.
    $('#newbest').hidden = !isBest;
    // Leave the playing layout and show the game-over screen.
    document.body.classList.remove('playing');
    ui.over.hidden = false;
    // PvP:
    if (mode === 'pvp') {
      // Tell the rival we crashed and our final numbers.
      PvP.send({ t: 'dead', sc: finalScore, d: Math.floor(distance), c: runCoins });
      // Reset our rematch request.
      meRematch = false;
      // Show the race result panel instead of solo stats.
      $('#solo-stats').hidden = true;
      $('#race-result').hidden = false;
      // Fill it in.
      renderResults();
      return;
    }
    // Solo: show solo stats.
    $('#solo-stats').hidden = false;
    $('#race-result').hidden = true;
    // Headline and tip for how we died (fallback: caught).
    const [title, sub] = DEATH_TEXT[deathReason] || DEATH_TEXT.caught;
    // Show them.
    $('#over-title').textContent = title;
    $('#over-sub').textContent = sub;
    // Score, coins and distance.
    $('#o-score').textContent = finalScore.toLocaleString();
    $('#o-coins').textContent = runCoins;
    $('#o-dist').textContent = `${Math.floor(distance)}m`;
    // Button text.
    $('#again-label').textContent = 'Run again';
    $('#again-btn').disabled = false;
  }

  // renderResults(): fill in the PvP race result panel and the button state.
  function renderResults() {
    // Has the rival finished (crashed or left)?
    const oppDone = !opp.alive;
    // Their final score, or their latest live score.
    const oppScore = opp.final ? opp.final.sc : opp.sc;
    // Our name, score, distance.
    $('#rr-me-name').textContent = LM.VARIANTS[runnerKey].name;
    $('#rr-me-score').textContent = finalScore.toLocaleString();
    $('#rr-me-dist').textContent = `${Math.floor(distance)}m`;
    // Their name and score.
    $('#rr-opp-name').textContent = opp.name;
    $('#rr-opp-score').textContent = oppScore.toLocaleString();
    // Their distance, or a status if they haven't finished.
    $('#rr-opp-dist').textContent = opp.final ? `${opp.final.d}m` : PvP.connected ? 'still running…' : 'left the match';
    // The two result cards ...
    const meEl = $('#rr-me'), opEl = $('#rr-opp');
    // ... with no winner highlighted yet.
    meEl.classList.remove('win'); opEl.classList.remove('win');
    // The "again" button.
    const btn = $('#again-btn');
    // Rival still running: we have to wait.
    if (!oppDone) {
      // Show why we crashed ...
      $('#over-title').textContent = (DEATH_TEXT[deathReason] || DEATH_TEXT.caught)[0];
      // ... and who's leading.
      $('#over-sub').textContent = oppScore > finalScore ? `${opp.name} is ahead. Waiting for them to finish…` : `You lead! Waiting for ${opp.name} to crash…`;
      // Can't rematch yet.
      btn.disabled = true;
      $('#again-label').textContent = 'Race in progress…';
      return;
    }
    // Both done: announce the winner and highlight their card.
    if (finalScore > oppScore) { $('#over-title').textContent = 'You win the race! 🏆'; meEl.classList.add('win'); }
    else if (finalScore < oppScore) { $('#over-title').textContent = `${opp.name} wins this one`; opEl.classList.add('win'); }
    else $('#over-title').textContent = 'Dead heat!';
    // Offer a rematch (if the friend is still connected).
    $('#over-sub').textContent = PvP.connected ? 'Same course, new seed. Fancy a rematch?' : 'Your friend has left the match.';
    // Enable the button ...
    btn.disabled = false;
    // ... with a label depending on connection and rematch status.
    if (!PvP.connected) $('#again-label').textContent = 'Back to menu';
    else if (meRematch) $('#again-label').textContent = 'Waiting for friend…';
    else if (opp.rematch) $('#again-label').textContent = 'Friend is ready. Rematch!';
    else $('#again-label').textContent = 'Rematch';
  }

  // onAgain(): the "Run again" / "Rematch" button.
  function onAgain() {
    // Solo: just start another run.
    if (mode !== 'pvp') { startRun(); return; }
    // Friend left: back to the menu.
    if (!PvP.connected) { showMenu(); return; }
    // We want a rematch ...
    meRematch = true;
    // ... tell the rival.
    PvP.send({ t: 'rematch' });
    // The host starts the race once both want it; otherwise update the button text.
    if (PvP.role === 'host' && opp.rematch) hostStartRace();
    else renderResults();
  }

  // ---------------------------------------------------------------------
  // PVP FLOW: one player "hosts" a room and shares a code/link; the other
  // joins. The host picks the random seed and sends it, so both race the
  // exact same course. Messages are small objects like { t: 'start', seed }.
  // ---------------------------------------------------------------------
  /* =================== PVP FLOW =================== */
  // pvpView(v): show one panel of the PvP menu: 'idle', 'wait' or 'ready'.
  function pvpView(v) {
    // Show only the matching panel.
    $('#pvp-idle').hidden = v !== 'idle';
    $('#pvp-wait').hidden = v !== 'wait';
    $('#pvp-ready').hidden = v !== 'ready';
    // Ready: only the host gets the "Race" button; the guest sees "waiting for host".
    if (v === 'ready') {
      const host = PvP.role === 'host';
      $('#race-btn').hidden = !host;
      $('#guest-wait').hidden = host;
    }
  }
  // pvpError(msg): show an error message, or hide it when msg is empty.
  function pvpError(msg) {
    const el = $('#pvp-error');
    el.hidden = !msg;
    el.textContent = msg || '';
  }
  // Is the game opened from this computer only (a file or localhost)? Then a
  // friend can't open our link, so explain that in the PvP note.
  const localOnly = location.protocol === 'file:' || ['localhost', '127.0.0.1', ''].includes(location.hostname);
  // Pick the help text to show.
  $('#pvp-note').textContent = localOnly
    ? 'This copy of the game runs on your own computer, so your friend can’t open your link directly. They need the same game files (or a hosted copy). They open it, pick "Vs a friend" and type the code. Playing needs an internet connection.'
    : 'Your friend just opens the link on their own computer or phone. Playing needs an internet connection.';

  // beginRace(seed): reset the rival's data and start a PvP run with the shared seed.
  function beginRace(seed) {
    // Rival is alive with zeroed stats and positions.
    opp.alive = true; opp.final = null; opp.rematch = false; opp.d = 0; opp.v = 0; opp.t = 0; opp.sc = 0; opp.c = 0;
    opp.x = 0; opp.y = 0; opp.zr = 0; opp.xr = 0; opp.yr = 0; opp.r = opp.f = opp.j = 0;
    // No rematch request yet.
    meRematch = false;
    // No rival model yet? Use a default character until they tell us theirs.
    if (!opp.model) setOppRunner('amaka');
    // Start the run in PvP mode.
    startRun(seed, true);
  }
  // hostStartRace(): (host only) choose a seed, send it to the guest, and start.
  function hostStartRace() {
    // Random whole-number seed.
    const seed = (Math.random() * 2 ** 31) | 0;
    // Tell the guest to start with this seed.
    PvP.send({ t: 'start', seed, runner: runnerKey });
    // Start ourselves.
    beginRace(seed);
  }

  // PvP.onStatus: called by pvp.js when the connection status changes.
  // s = status name, info = extra data (e.g. the room code).
  PvP.onStatus = (s, info) => {
    switch (s) {
      // We're hosting and waiting for a friend:
      case 'waiting':
        // Clear errors and show the waiting panel.
        pvpError('');
        pvpView('wait');
        // Show the room code ...
        $('#room-code').textContent = info;
        // ... and the shareable link.
        $('#room-link').value = PvP.link();
        // Show the code box and link row.
        document.querySelector('.code-box').hidden = false;
        document.querySelector('.link-row').hidden = false;
        // Show the Share button only if the device supports sharing.
        $('#share-link').hidden = !navigator.share;
        // Status text.
        $('#pvp-status').textContent = 'Waiting for your friend to join…';
        break;
      // We're joining someone else's room:
      case 'joining':
        // Clear errors and show the waiting panel ...
        pvpError('');
        pvpView('wait');
        // ... but hide the host-only code and link.
        document.querySelector('.code-box').hidden = true;
        document.querySelector('.link-row').hidden = true;
        $('#share-link').hidden = true;
        // Status text.
        $('#pvp-status').textContent = `Joining match ${info}…`;
        break;
      // Connected!
      case 'connected':
        pvpError('');
        // Tell the rival which character we are.
        PvP.send({ t: 'hello', runner: runnerKey });
        // Switch to the PvP tab, ready panel.
        setMenuMode('pvp');
        pvpView('ready');
        // Notify.
        toast('Friend connected!', 'power');
        break;
      // Connection lost:
      case 'closed':
        // Cancel any rematch request from them.
        opp.rematch = false;
        // If they left during a race, treat them as finished.
        if (mode === 'pvp' && opp.alive && (state === 'playing' || state === 'countdown' || state === 'dying' || state === 'over')) {
          // They're out of the race ...
          opp.alive = false;
          // ... and we tell the player.
          toast(`${opp.name} left the match`, 'power');
        }
        // If we're on the result screen, update it.
        if (state === 'over' && mode === 'pvp') renderResults();
        // Back to the idle PvP panel with an explanation.
        pvpView('idle');
        pvpError('Your friend left the match.');
        break;
      // Something went wrong (e.g. bad code, no internet):
      case 'error':
        // If not connected, go back to the idle panel ...
        if (!PvP.connected) pvpView('idle');
        // ... and show the error.
        pvpError(info);
        break;
      // Any other status: ignore.
      default:
    }
  };

  // PvP.onMessage: called whenever the rival sends us a message. m = the message
  // object; m.t is its type: 'hello', 'start', 's' (state), 'dead' or 'rematch'.
  PvP.onMessage = (m) => {
    // Ignore anything that isn't a proper object (safety against bad data).
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      // 'hello': the rival told us their character.
      case 'hello': setOppRunner(m.runner); break;
      // 'start': the host started a race.
      case 'start':
        // Use the host's character ...
        if (m.runner) setOppRunner(m.runner);
        // ... and start with the host's seed (unless we're already racing).
        if (state !== 'playing' && state !== 'countdown') beginRace(m.seed);
        break;
      // 's' = state update, sent about 15 times a second during a race:
      case 's': {
        // Time it arrived.
        const now = performance.now();
        // If we had a previous update ...
        if (opp.t) {
          // ... seconds between the two updates ...
          const dts = (now - opp.t) / 1000;
          // ... estimate their speed = distance change / time (clamped to a sane 0-45).
          if (dts > 0.01) opp.v = THREE.MathUtils.clamp((m.d - opp.d) / dts, 0, 45);
        }
        // Store their latest distance, position, flags, score and coins, and the arrival time.
        opp.d = m.d; opp.x = m.x; opp.y = m.y; opp.r = m.r; opp.f = m.f; opp.j = m.j; opp.sc = m.sc; opp.c = m.c; opp.t = now;
        break;
      }
      // 'dead': the rival crashed.
      case 'dead':
        // They're out ...
        opp.alive = false;
        // ... with these final numbers.
        opp.final = { sc: m.sc, d: m.d, c: m.c };
        opp.sc = m.sc;
        // If we're also done, show the results ...
        if (state === 'over' && mode === 'pvp') renderResults();
        // ... otherwise tell the player the score to beat.
        else if (mode === 'pvp' && state === 'playing') toast(`${opp.name} crashed at ${m.sc.toLocaleString()}! Beat it to win`, 'power');
        break;
      // 'rematch': the rival wants another race.
      case 'rematch':
        // Remember it.
        opp.rematch = true;
        // Host and we want one too: start now. Otherwise update the button text.
        if (PvP.role === 'host' && meRematch && state === 'over') hostStartRace();
        else if (state === 'over' && mode === 'pvp') renderResults();
        break;
      // Unknown message type: ignore.
      default:
    }
  };

  // hostMatch(): create a room and wait for a friend. "async" means it can
  // "await" slow network work without freezing the game.
  async function hostMatch() {
    // Clear errors and show the waiting panel.
    pvpError('');
    pvpView('wait');
    // Show the code box and link row with placeholders while the room is created.
    document.querySelector('.code-box').hidden = false;
    document.querySelector('.link-row').hidden = false;
    $('#room-code').textContent = '······';
    $('#room-link').value = '';
    // Status text.
    $('#pvp-status').textContent = 'Creating match…';
    // Ask pvp.js to create the room; on failure, go back and show the error.
    try { await PvP.host(); } catch (e) { pvpView('idle'); pvpError(e.message); }
  }
  // joinMatch(code): join a friend's room using their 6-character code.
  async function joinMatch(code) {
    // Clean the code: uppercase letters and digits only (removes spaces, dashes...).
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Wrong length: show a helpful error.
    if (code.length !== 6) { pvpError('Match codes are 6 characters, like ABC123.'); return; }
    // Show the waiting panel (without the host-only code/link).
    pvpError('');
    pvpView('wait');
    document.querySelector('.code-box').hidden = true;
    document.querySelector('.link-row').hidden = true;
    // Status text.
    $('#pvp-status').textContent = 'Connecting…';
    // Connect; on failure, go back and show the error.
    try { await PvP.join(code); } catch (e) { pvpView('idle'); pvpError(e.message); }
  }

  // BUTTON WIRING: connect page buttons to the functions above.
  // "Host" button creates a room.
  $('#host-btn').addEventListener('click', hostMatch);
  // The join form: preventDefault stops the page reloading on submit.
  $('#join-form').addEventListener('submit', (e) => { e.preventDefault(); joinMatch($('#join-code').value); });
  // While typing a code, force uppercase and strip invalid characters.
  $('#join-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  // "Copy link" button:
  $('#copy-link').addEventListener('click', async (e) => {
    // The button and the link to copy.
    const btn = e.currentTarget, link = $('#room-link').value;
    // Use the modern clipboard; if blocked, fall back to the old select-and-copy way.
    try { await navigator.clipboard.writeText(link); } catch (err) { $('#room-link').select(); document.execCommand('copy'); }
    // Confirm on the button ...
    btn.textContent = 'Copied!';
    // ... and restore its label after 1.6 s.
    setTimeout(() => { btn.textContent = 'Copy link'; }, 1600);
  });
  // "Share" button: open the phone's share sheet (errors like "cancelled" are ignored).
  $('#share-link').addEventListener('click', () => {
    navigator.share({ title: 'Race me in Eko Rush', text: `Race me through Lagos! Code: ${PvP.code}`, url: $('#room-link').value }).catch(() => {});
  });
  // Cancel waiting: close the connection.
  $('#pvp-cancel').addEventListener('click', () => { PvP.close(); pvpView('idle'); });
  // Leave the match.
  $('#pvp-leave').addEventListener('click', () => { PvP.close(); pvpView('idle'); pvpError(''); });
  // "Race" button (host): start if still connected. blur() removes keyboard focus so
  // Space doesn't "click" the button again during the race.
  $('#race-btn').addEventListener('click', (e) => { e.currentTarget.blur(); if (PvP.connected) hostStartRace(); });

  // Menu tabs (Solo / Vs a friend).
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setMenuMode(b.dataset.mode)));
  // Character buttons.
  document.querySelectorAll('.runner-btn').forEach((b) => b.addEventListener('click', () => { setRunner(b.dataset.runner); b.blur(); }));
  // "Play" button.
  $('#play-btn').addEventListener('click', (e) => { e.currentTarget.blur(); startRun(); });
  // "Run again" / "Rematch" button.
  $('#again-btn').addEventListener('click', (e) => { e.currentTarget.blur(); onAgain(); });
  // "Change runner" button on the game-over screen.
  $('#change-btn').addEventListener('click', showMenu);
  // Pause screen: resume, restart, quit.
  $('#resume-btn').addEventListener('click', togglePause);
  $('#restart-btn').addEventListener('click', () => startRun());
  $('#quit-btn').addEventListener('click', showMenu);
  // Pause button in the HUD.
  $('#pause-btn').addEventListener('click', (e) => { e.currentTarget.blur(); togglePause(); });
  // Sound on/off button.
  const soundBtn = $('#sound-btn');
  // syncSound(): make the button's look match the mute state.
  const syncSound = () => soundBtn.classList.toggle('muted', Sound.muted);
  // Clicking toggles mute.
  soundBtn.addEventListener('click', () => { Sound.setMuted(!Sound.muted); syncSound(); soundBtn.blur(); });
  // Set the initial look.
  syncSound();

  // ---------------------------------------------------------------------
  // INPUT: keyboard (arrows / WASD / space) and touch/mouse swipes.
  // ---------------------------------------------------------------------
  /* =================== INPUT =================== */
  // Keyboard handler:
  window.addEventListener('keydown', (e) => {
    // Ignore keys while typing in a text box (e.g. the match code).
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    // The key pressed.
    const k = e.key;
    // Stop arrow keys and space from scrolling the page.
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k)) e.preventDefault();
    // Ignore auto-repeat when a key is held down.
    if (e.repeat) return;
    // M toggles mute anywhere.
    if (k === 'm' || k === 'M') { Sound.setMuted(!Sound.muted); syncSound(); return; }
    // In the menu, Enter/Space starts a solo run, or a race if we're the connected host.
    if (state === 'menu' && (k === 'Enter' || k === ' ')) {
      if (menuMode === 'solo') startRun();
      else if (PvP.connected && PvP.role === 'host') hostStartRace();
      return;
    }
    // On the game-over screen, Enter/Space presses "Run again" (if enabled).
    if (state === 'over' && (k === 'Enter' || k === ' ')) { if (!$('#again-btn').disabled) onAgain(); return; }
    // P or Escape pauses/resumes.
    if (k === 'p' || k === 'P' || k === 'Escape') { togglePause(); return; }
    // Movement keys only work while playing.
    if (state !== 'playing') return;
    // Map keys to actions.
    switch (k) {
      case 'ArrowLeft': case 'a': case 'A': moveLane(-1); break;
      case 'ArrowRight': case 'd': case 'D': moveLane(1); break;
      case 'ArrowUp': case 'w': case 'W': case ' ': jump(); break;
      case 'ArrowDown': case 's': case 'S': roll(); break;
      default:
    }
  });

  // Touch/mouse swipe: where the finger went down (done = swipe already used).
  let swipe = null;
  // Finger/mouse down: remember the start point.
  canvas.addEventListener('pointerdown', (e) => { swipe = { x: e.clientX, y: e.clientY, done: false }; });
  // Finger moving:
  canvas.addEventListener('pointermove', (e) => {
    // Only one action per swipe, and only while playing.
    if (!swipe || swipe.done || state !== 'playing') return;
    // How far it moved horizontally and vertically (in pixels).
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    // Too small a movement (under 26 px) isn't a swipe yet.
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 26) return;
    // Used up.
    swipe.done = true;
    // Mostly sideways: change lane.
    if (Math.abs(dx) > Math.abs(dy)) moveLane(dx > 0 ? 1 : -1);
    // Up (screen y grows downwards, so up is negative): jump.
    else if (dy < 0) jump();
    // Down: roll.
    else roll();
  });
  // Finger lifted or cancelled: forget the swipe.
  const endSwipe = () => { swipe = null; };
  canvas.addEventListener('pointerup', endSwipe);
  canvas.addEventListener('pointercancel', endSwipe);
  // Auto-pause solo runs when the tab is hidden (switching apps/tabs).
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing' && mode === 'solo') togglePause(); });

  // ---------------------------------------------------------------------
  // THEME: js/theme.js sets data-theme="dark" on <html> and fires a
  // "themechange" event. Dark theme = Lagos at night.
  // ---------------------------------------------------------------------
  /* =================== THEME =================== */
  // applyTheme(): switch sky, fog, lights and colours for day or night.
  function applyTheme() {
    // Is dark (night) mode on?
    const dark = document.documentElement.dataset.theme === 'dark';
    // Let the models switch to night (e.g. lit windows).
    LM.setNight(dark);
    // Night or day sky.
    scene.background = dark ? skyNight : skyDay;
    // Fog colour matches the sky.
    scene.fog.color.set(dark ? 0x161a3a : 0xcfe9ff);
    // Sky light: dimmer and bluer at night.
    hemi.intensity = dark ? 0.42 : 0.85;
    hemi.color.set(dark ? 0x8a96ff : 0xdff2ff);
    hemi.groundColor.set(dark ? 0x2a2030 : 0xb08860);
    // Sun becomes cool, dim moonlight at night.
    sun.intensity = dark ? 0.32 : 1.05;
    sun.color.set(dark ? 0x9fb4ff : 0xfff0d0);
    // Turn on the light around the player at night so they stay visible.
    playerLight.intensity = dark ? 1.3 : 0;
    // Speed lines slightly blue at night.
    streakMat.color.set(dark ? 0xbfd4ff : 0xffffff);
    // Outlines a bit darker at night.
    outlineMat.color.set(dark ? 0x05040a : 0x17141f);
  }
  // Re-apply whenever the theme changes ...
  window.addEventListener('themechange', applyTheme);
  // ... and once now at startup.
  applyTheme();

  // ---------------------------------------------------------------------
  // LOOP & STARTUP
  // ---------------------------------------------------------------------
  /* =================== LOOP =================== */
  // resize(): fit the renderer and camera to the browser window.
  function resize() {
    // Window size in pixels.
    const w = window.innerWidth, h = window.innerHeight;
    // Resize the drawing area (false = don't touch the canvas CSS size).
    renderer.setSize(w, h, false);
    // Aspect ratio (width / height) so things aren't stretched.
    camera.aspect = w / h;
    // Tall phone screens get a wider field of view so you can see more lanes.
    baseFov = camera.aspect < 0.8 ? 74 : 62;
    // Apply it.
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
  }
  // Run on every window resize ...
  window.addEventListener('resize', resize);
  // ... and once now.
  resize();

  // Show the menu (also builds the first world).
  showMenu();
  // Starting camera spot and look point.
  camera.position.set(3, 2.2, -5);
  camLook.set(0, 1.1, 0);

  // Opened via a shared invite link (?join=CODE)? Join that match automatically.
  const joinParam = new URLSearchParams(location.search).get('join');
  if (joinParam) {
    // Switch to the PvP tab, fill in the code and connect.
    setMenuMode('pvp');
    $('#join-code').value = joinParam.toUpperCase();
    joinMatch(joinParam);
  }

  // Time of the previous frame (in milliseconds).
  let last = performance.now();
  // frame(now): THE MAIN GAME LOOP. The browser calls this before each screen
  // refresh (~60 times a second). now = current time in milliseconds.
  // Each frame: update the game, animate, move the camera, update the HUD,
  // talk to the PvP rival, then draw ("render") the picture.
  function frame(now) {
    // Ask the browser to call frame again next refresh (this keeps the loop going).
    requestAnimationFrame(frame);
    // dt = seconds since the last frame, capped at 0.05 so a hiccup (or returning
    // to the tab) doesn't make everything jump forward.
    const dt = Math.min(0.05, (now - last) / 1000);
    // Remember this frame's time.
    last = now;
    // Run the logic for the current phase.
    if (state === 'playing') update(dt);
    else if (state === 'dying') updateDying(dt);
    else if (state === 'countdown') updateCountdown(dt);
    // Characters, effects, world-following.
    animate(dt);
    // Camera.
    updateCamera(dt);
    // Update the HUD only when it's visible.
    if (state === 'playing' || state === 'dying' || state === 'countdown') updateHud();
    // During a PvP race, send our state to the rival ...
    if (mode === 'pvp' && state === 'playing') {
      // ... about 15 times a second (every 0.066 s), not every frame, to save bandwidth.
      sendT -= dt;
      if (sendT <= 0) {
        sendT = 0.066;
        // Our distance, position, rolling/flying/jumping flags (as 1/0), score and coins.
        PvP.send({ t: 's', d: distance, x: P.x, y: P.y, r: P.rollT > 0 ? 1 : 0, f: power.jet > 0 ? 1 : 0, j: P.grounded ? 0 : 1, sc: Math.floor(score), c: runCoins });
      }
    }
    // After we crash in PvP while the rival is still running, refresh the live results 4 times a second.
    if (state === 'over' && mode === 'pvp' && opp.alive) {
      sendT -= dt;
      if (sendT <= 0) { sendT = 0.25; renderResults(); }
    }
    // Draw the scene from the camera's point of view.
    renderer.render(scene, camera);
    // Lower the resolution if the device is struggling.
    adaptResolution(now);
  }
  /* Step resolution down (never up) on GPUs that can't hold ~50fps during a run. */
  // qFrames = frames measured, qStart = when measuring began, qWarm = frames to skip first.
  let qFrames = 0, qStart = 0, qWarm = 0;
  // adaptResolution(now): measure the average frame time during a run; if it's
  // over 20 ms (below ~50 fps), lower the pixel ratio a step (never below 0.75).
  function adaptResolution(now) {
    // Only measure during visible play; otherwise reset the counters.
    if (document.hidden || state !== 'playing') { qFrames = 0; qWarm = 0; return; }
    // Skip the first 150 frames (the start of a run can be uneven).
    if (qWarm++ < 150) return;
    // Note when this measuring window started.
    if (!qFrames) qStart = now;
    // Measure over 120 frames.
    if (++qFrames < 120) return;
    // Average milliseconds per frame.
    const avg = (now - qStart) / (qFrames - 1);
    // Start a new window next time.
    qFrames = 0;
    // Too slow and still room to lower:
    if (avg > 20 && pixelRatio > 0.76) {
      // Reduce the pixel ratio by 0.15 ...
      pixelRatio = Math.max(0.75, pixelRatio - 0.15);
      // ... and apply it to the renderer.
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    }
  }
  // Start the game loop.
  requestAnimationFrame(frame);
  // Fade out the loading screen shortly after startup.
  setTimeout(() => $('#loading').classList.add('done'), 150);
})();
