/*
 * Cursor Swarm — engine.
 *
 * Pure vanilla JS. No build step, no dependencies.
 *
 * How it fits together:
 *   1. This file creates window.SwarmRegistry.
 *   2. It reads contributions.json (a simple manifest of file paths).
 *   3. It loads every listed behavior / skin script; each file registers
 *      itself by calling SwarmRegistry.registerBehavior({...}) or
 *      SwarmRegistry.registerSkin({...}).
 *   4. The engine runs the active behavior's steering for every dot,
 *      integrates the physics, and paints the dots with the active skin.
 *
 * If contributions.json cannot be fetched (e.g. opening index.html from
 * file:// in some browsers), a built-in copy of the starter manifest is
 * used instead, so the demo still works. A contribution file that fails
 * to load is skipped with a console warning — it never breaks the page.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Registry — the public API that contribution files use.              */
  /* ------------------------------------------------------------------ */
  var registry = {
    behaviors: [],
    skins: [],

    registerBehavior: function (def) {
      if (!def || !def.id || !def.name || typeof def.update !== 'function') {
        console.warn('[swarm] Ignored a behavior with missing id/name/update:', def);
        return;
      }
      if (findById(registry.behaviors, def.id)) {
        console.warn('[swarm] Duplicate behavior id ignored:', def.id);
        return;
      }
      registry.behaviors.push(def);
    },

    registerSkin: function (def) {
      if (!def || !def.id || !def.name || !Array.isArray(def.colors) || def.colors.length === 0) {
        console.warn('[swarm] Ignored a skin with missing id/name/colors:', def);
        return;
      }
      if (findById(registry.skins, def.id)) {
        console.warn('[swarm] Duplicate skin id ignored:', def.id);
        return;
      }
      registry.skins.push(def);
    }
  };
  window.SwarmRegistry = registry;

  function findById(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* Built-in fallback manifest (mirrors contributions.json). */
  var FALLBACK_MANIFEST = {
    behaviors: [
      'behaviors/orbit.js',
      'behaviors/vortex.js',
      'behaviors/chase.js',
      'behaviors/wave.js',
      'behaviors/heart.js'
    ],
    skins: [
      'skins/neon.js',
      'skins/sunset.js',
      'skins/candy.js',
      'skins/mono.js',
      'skins/matrix.js'
    ]
  };

  /* ------------------------------------------------------------------ */
  /* Canvas + state                                                      */
  /* ------------------------------------------------------------------ */
  var canvas = document.getElementById('stage');
  var ctx2d = canvas.getContext('2d');
  var W = 0, H = 0, DPR = 1;

  var pointer = { x: 0, y: 0, active: false, down: false };

  /* Behaviors steer toward this eased copy of the pointer, not the raw
   * one: it glides a little behind the real cursor, which makes the
   * whole swarm feel fluid instead of jittery. `down` / `active` are
   * mirrored from the raw pointer every frame, so behavior semantics
   * (ctx.pointer.x / .y / .down) are unchanged. */
  var smoothPointer = { x: 0, y: 0, active: false, down: false };
  var POINTER_EASE = 0.16;

  var boids = [];
  var running = true;
  var startTime = performance.now();
  var lastFrameTime = 0;

  var activeBehavior = null;
  var activeSkin = null;

  var MAX_SPEED = 4.2;
  var FRICTION = 0.96;

  var REDUCED_MOTION = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* Click bursts (playground): pending expanding rings. The velocity
   * impulse itself is applied immediately by applyBurst(). */
  var bursts = [];
  var BURST_RADIUS = 260;
  var BURST_POWER = 10;
  var BURST_BOOST_MS = 380;
  var RING_MS = 650;

  /* Adaptive quality: requestedCount is what the slider asks for;
   * activeCount is how many dots are actually simulated/drawn. If the
   * frame rate stays low, activeCount steps down (and back up when the
   * frame rate recovers) — silently, with no UI. */
  var requestedCount = 0;
  var activeCount = 0;
  var QUALITY_STEPS = [1, 0.7, 0.45, 0.25];
  var qualityLevel = 0;
  var fpsFrames = 0;
  var fpsWindowStart = 0;
  var lowStreak = 0;
  var highStreak = 0;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx2d.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (!pointer.active) {
      pointer.x = W / 2; pointer.y = H / 2;
      smoothPointer.x = W / 2; smoothPointer.y = H / 2;
    }
  }
  window.addEventListener('resize', resize);

  function setPointer(x, y) {
    pointer.x = x;
    pointer.y = y;
    pointer.active = true;
  }
  window.addEventListener('mousemove', function (e) { setPointer(e.clientX, e.clientY); });
  window.addEventListener('touchmove', function (e) {
    if (e.touches.length) setPointer(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  window.addEventListener('mousedown', function () { pointer.down = true; });
  window.addEventListener('mouseup', function () { pointer.down = false; });
  window.addEventListener('mouseout', function (e) { if (!e.relatedTarget) pointer.active = false; });

  /* ------------------------------------------------------------------ */
  /* Boids                                                               */
  /* ------------------------------------------------------------------ */
  function makeBoids(n) {
    requestedCount = n;
    activeCount = n;
    qualityLevel = 0;
    lowStreak = 0;
    highStreak = 0;
    boids = [];
    for (var i = 0; i < n; i++) {
      boids.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        boostUntil: 0
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Click burst                                                         */
  /*                                                                     */
  /* Every dot within BURST_RADIUS of (x, y) gets a radial shove away    */
  /* from that point; the push fades linearly to zero at the rim, and    */
  /* friction decays it naturally afterwards. Affected dots may briefly  */
  /* exceed the normal speed cap (see step()) so the burst reads as a    */
  /* burst, not just a change of direction. Returns the number of dots   */
  /* affected. Kept free of DOM/canvas access so it can be unit-tested   */
  /* outside the browser.                                                */
  /* ------------------------------------------------------------------ */
  function applyBurst(list, x, y, power, now, limit) {
    var n = (typeof limit === 'number')
      ? Math.min(list.length, limit)
      : list.length;
    var hit = 0;
    for (var i = 0; i < n; i++) {
      var b = list[i];
      var dx = b.x - x;
      var dy = b.y - y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= BURST_RADIUS) continue;
      var d = dist || 1;
      var f = power * (1 - dist / BURST_RADIUS);
      b.vx += (dx / d) * f;
      b.vy += (dy / d) * f;
      b.boostUntil = now + BURST_BOOST_MS;
      hit++;
    }
    return hit;
  }

  function spawnBurst(x, y) {
    var now = performance.now();
    bursts.push({ x: x, y: y, t0: now });
    applyBurst(boids, x, y, BURST_POWER, now, activeCount);
  }

  /* Clicking/tapping the playground canvas area bursts the swarm. The
   * canvas itself is pointer-events:none, so clicks land on the window;
   * only fire while the playground is on screen (body.playground-on is
   * managed by src/build.js) and never when the click actually hit the
   * control bar or any interactive element. */
  window.addEventListener('pointerdown', function (e) {
    if (REDUCED_MOTION) return;
    if (!document.body || !document.body.classList.contains('playground-on')) return;
    var t = e.target;
    if (t && t.closest && t.closest('#bar, a, button, select, input, textarea, label')) return;
    spawnBurst(e.clientX, e.clientY);
  });

  /* Small test hook: lets a headless harness verify the burst math
   * against the real function instead of a copy. */
  window.SwarmEngineTest = { applyBurst: applyBurst };

  /* ------------------------------------------------------------------ */
  /* Adaptive quality                                                    */
  /*                                                                     */
  /* Once a second, look at the measured frame rate. Two low readings    */
  /* in a row (< 45fps) step the active dot count down; three strong     */
  /* readings (> 57fps) step it back up. Nothing is shown in the UI.     */
  /* ------------------------------------------------------------------ */
  function adaptQuality(now) {
    if (!fpsWindowStart) { fpsWindowStart = now; return; }
    fpsFrames++;
    var elapsed = now - fpsWindowStart;
    if (elapsed < 1000) return;
    var fps = (fpsFrames * 1000) / elapsed;
    fpsFrames = 0;
    fpsWindowStart = now;

    if (now - startTime < 3000) return; /* warm-up: don't judge early frames */

    if (fps < 45) { lowStreak++; highStreak = 0; }
    else if (fps > 57) { highStreak++; lowStreak = 0; }
    else { lowStreak = 0; highStreak = 0; }

    if (lowStreak >= 2 && qualityLevel < QUALITY_STEPS.length - 1) {
      qualityLevel++;
      lowStreak = 0;
      activeCount = Math.max(24, Math.round(requestedCount * QUALITY_STEPS[qualityLevel]));
    } else if (highStreak >= 3 && qualityLevel > 0) {
      qualityLevel--;
      highStreak = 0;
      activeCount = Math.round(requestedCount * QUALITY_STEPS[qualityLevel]);
    }
  }

  function step(now) {
    var t = (now - startTime) / 1000;

    /* Ease the pointer the behaviors see toward the real one. */
    smoothPointer.x += (pointer.x - smoothPointer.x) * POINTER_EASE;
    smoothPointer.y += (pointer.y - smoothPointer.y) * POINTER_EASE;
    smoothPointer.active = pointer.active;
    smoothPointer.down = pointer.down;

    var ctxForBehavior = {
      pointer: smoothPointer,
      width: W,
      height: H,
      time: t,
      count: activeCount,
      index: 0
    };

    for (var i = 0; i < activeCount; i++) {
      var b = boids[i];
      ctxForBehavior.index = i;
      if (activeBehavior) activeBehavior.update(b, ctxForBehavior);

      /* Integrate + cap speed (freshly burst dots get a brief, higher
       * cap so the shove isn't clipped in the same frame). */
      b.vx *= FRICTION;
      b.vy *= FRICTION;
      var cap = (b.boostUntil && now < b.boostUntil) ? MAX_SPEED * 2.6 : MAX_SPEED;
      var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (sp > cap) {
        b.vx = (b.vx / sp) * cap;
        b.vy = (b.vy / sp) * cap;
      }
      b.x += b.vx;
      b.y += b.vy;

      /* Wrap gently around the edges. */
      if (b.x < -10) b.x = W + 10; else if (b.x > W + 10) b.x = -10;
      if (b.y < -10) b.y = H + 10; else if (b.y > H + 10) b.y = -10;
    }
  }

  function hexToRgba(hex, alpha) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  function draw() {
    var skin = activeSkin || { colors: ['#ffffff'], radius: 3, glow: false, trail: 0.35, background: '#05060f' };
    var trail = (typeof skin.trail === 'number') ? skin.trail : 0.35;
    var bg = skin.background || '#05060f';

    /* Fading fill = motion trails. trail 1 means "clear fully". */
    ctx2d.fillStyle = hexToRgba(bg, Math.min(1, Math.max(0.05, trail)));
    ctx2d.fillRect(0, 0, W, H);

    var r = skin.radius || 3;
    ctx2d.shadowBlur = skin.glow ? 12 : 0;
    for (var i = 0; i < activeCount; i++) {
      var b = boids[i];
      var color = skin.colors[i % skin.colors.length];
      ctx2d.fillStyle = color;
      ctx2d.shadowColor = color;
      ctx2d.beginPath();
      ctx2d.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx2d.fill();
    }
    ctx2d.shadowBlur = 0;

    /* Expanding rings where visitors clicked to burst the swarm. */
    if (bursts.length) {
      var ringColor = (skin.colors && skin.colors[0]) || '#ffffff';
      if (ringColor.charAt(0) !== '#') ringColor = '#ffffff';
      for (var j = bursts.length - 1; j >= 0; j--) {
        var age = (lastFrameTime - bursts[j].t0) / RING_MS;
        if (age >= 1) { bursts.splice(j, 1); continue; }
        ctx2d.beginPath();
        ctx2d.strokeStyle = hexToRgba(ringColor, (1 - age) * 0.55);
        ctx2d.lineWidth = 2;
        ctx2d.arc(bursts[j].x, bursts[j].y, 12 + age * 170, 0, Math.PI * 2);
        ctx2d.stroke();
      }
    }
  }

  function frame(now) {
    lastFrameTime = now;
    adaptQuality(now);
    if (running) {
      step(now);
      draw();
    }
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ */
  /* Controls                                                            */
  /* ------------------------------------------------------------------ */
  function fillSelect(select, items) {
    select.innerHTML = '';
    items.forEach(function (item) {
      var opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.name + (item.author ? ' — ' + item.author : '');
      select.appendChild(opt);
    });
  }

  function buildControls() {
    var behaviorSelect = document.getElementById('behaviorSelect');
    var skinSelect = document.getElementById('skinSelect');
    var countRange = document.getElementById('countRange');
    var countValue = document.getElementById('countValue');
    var pauseBtn = document.getElementById('pauseBtn');

    fillSelect(behaviorSelect, registry.behaviors);
    fillSelect(skinSelect, registry.skins);

    activeBehavior = registry.behaviors[0] || null;
    activeSkin = registry.skins[0] || null;

    behaviorSelect.addEventListener('change', function () {
      activeBehavior = findById(registry.behaviors, behaviorSelect.value);
    });
    skinSelect.addEventListener('change', function () {
      activeSkin = findById(registry.skins, skinSelect.value);
      /* Repaint fully once so the new background color takes over. */
      ctx2d.fillStyle = (activeSkin && activeSkin.background) || '#05060f';
      ctx2d.fillRect(0, 0, W, H);
    });
    countRange.addEventListener('input', function () {
      countValue.textContent = countRange.value;
      makeBoids(parseInt(countRange.value, 10));
    });
    pauseBtn.addEventListener('click', function () {
      running = !running;
      pauseBtn.textContent = running ? '⏸ Pause' : '▶ Play';
    });

    makeBoids(parseInt(countRange.value, 10));
  }

  /* ------------------------------------------------------------------ */
  /* Loading contributions                                               */
  /* ------------------------------------------------------------------ */
  function loadScript(src) {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(true); };
      s.onerror = function () {
        console.warn('[swarm] Could not load contribution file:', src);
        resolve(false);
      };
      document.head.appendChild(s);
    });
  }

  function loadManifest() {
    return fetch('contributions.json')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function () { return FALLBACK_MANIFEST; });
  }

  function boot() {
    resize();
    loadManifest().then(function (manifest) {
      var files = (manifest.behaviors || []).concat(manifest.skins || []);
      var chain = Promise.resolve();
      files.forEach(function (src) {
        chain = chain.then(function () { return loadScript(src); });
      });
      return chain;
    }).then(function () {
      buildControls();
      requestAnimationFrame(frame);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
