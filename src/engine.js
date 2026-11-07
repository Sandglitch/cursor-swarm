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
    formations: [],

    /* Flipped to true once every manifest file has been attempted, so
     * src/build.js can wait for the full registry (formations load
     * last) before generating cards and the Hall of Fame. */
    loadedAll: false,

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
    },

    registerFormation: function (def) {
      if (!def || !def.id || !def.name || !Array.isArray(def.points) || def.points.length === 0) {
        console.warn('[swarm] Ignored a formation with missing id/name/points:', def);
        return;
      }
      if (findById(registry.formations, def.id)) {
        console.warn('[swarm] Duplicate formation id ignored:', def.id);
        return;
      }
      registry.formations.push(def);
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
    ],
    formations: [
      'formations/star.js',
      'formations/smiley.js',
      'formations/rocket.js'
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
    if (formation.active) assignFormationTargets();
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
    if (formation.active) assignFormationTargets();
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

  /* Formation mode: when active, the behavior dropdown is overridden
   * and every dot steers to an assigned target point instead. `targets`
   * is parallel to `boids` (canvas coordinates, or null for spare dots
   * that lazily orbit the formation). */
  var formation = {
    active: false,
    gridPoints: null,
    targets: [],
    center: { x: 0, y: 0 }
  };

  /* Last finished Collect-the-Orbs score (set by src/game.js), folded
   * into share links and share cards. */
  var lastScore = null;

  /* Control-bar element refs, captured by buildControls(). */
  var controls = null;

  /* ------------------------------------------------------------------ */
  /* Formations                                                          */
  /*                                                                     */
  /* A formation is pure data: [x, y] points on a 100x60 grid. The grid  */
  /* is scaled to a centered box on the canvas; each dot is greedily     */
  /* assigned the nearest still-free target and springs toward it with   */
  /* a tiny jitter so the shape breathes. With reduced motion the dots   */
  /* simply snap onto their targets.                                     */
  /* ------------------------------------------------------------------ */
  function formationScale() {
    var boxW = Math.min(W * 0.86, 920);
    var boxH = boxW * 0.6;
    if (boxH > H * 0.82) { boxH = H * 0.82; boxW = boxH / 0.6; }
    var s = boxW / 100;
    return { s: s, ox: W / 2 - 50 * s, oy: H / 2 - 30 * s };
  }

  function assignFormationTargets() {
    var pts = formation.gridPoints || [];
    var sc = formationScale();
    formation.center.x = W / 2;
    formation.center.y = H / 2;
    var canvasPts = [];
    for (var i = 0; i < pts.length; i++) {
      canvasPts.push({ x: sc.ox + pts[i][0] * sc.s, y: sc.oy + pts[i][1] * sc.s });
    }
    /* More points than dots: sample the points evenly. */
    var n = boids.length;
    if (canvasPts.length > n && n > 0) {
      var sampled = [];
      var stepF = canvasPts.length / n;
      for (var j = 0; j < n; j++) sampled.push(canvasPts[Math.floor(j * stepF)]);
      canvasPts = sampled;
    }
    /* Greedy nearest-free-target assignment. */
    var used = [];
    for (var u = 0; u < canvasPts.length; u++) used.push(false);
    formation.targets = [];
    for (var d = 0; d < boids.length; d++) {
      var b = boids[d];
      var best = -1, bestD2 = Infinity;
      for (var t = 0; t < canvasPts.length; t++) {
        if (used[t]) continue;
        var dx = canvasPts[t].x - b.x;
        var dy = canvasPts[t].y - b.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; best = t; }
      }
      if (best >= 0) {
        used[best] = true;
        formation.targets.push(canvasPts[best]);
      } else {
        formation.targets.push(null); /* spare dot: orbits the shape */
      }
    }
  }

  function steerToFormation(b, i, now) {
    var tgt = formation.targets[i];
    if (tgt) {
      if (REDUCED_MOTION) {
        b.x = tgt.x; b.y = tgt.y; b.vx = 0; b.vy = 0;
        return;
      }
      b.vx += (tgt.x - b.x) * 0.035;
      b.vy += (tgt.y - b.y) * 0.035;
      b.vx += (Math.random() - 0.5) * 0.05;   /* breathing jitter */
      b.vy += (Math.random() - 0.5) * 0.05;
    } else {
      /* No target left: drift in a lazy ring around the formation. */
      var dx = b.x - formation.center.x;
      var dy = b.y - formation.center.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      b.vx += (-dy / d) * 0.05 + (dx / d) * (d - 190) * 0.0004;
      b.vy += (dx / d) * 0.05 + (dy / d) * (d - 190) * 0.0004;
    }
  }

  function syncFormationUI() {
    if (!controls) return;
    controls.behaviorSelect.disabled = formation.active;
    if (controls.formationHint) {
      controls.formationHint.hidden = !formation.active;
    }
    if (controls.formBtn) {
      controls.formBtn.textContent = formation.active ? 'Release' : '✨ Form';
    }
  }

  function formFormation(points) {
    if (!points || !points.length) return;
    formation.gridPoints = points;
    formation.active = true;
    assignFormationTargets();
    syncFormationUI();
  }

  function releaseFormation() {
    if (!formation.active) return;
    formation.active = false;
    formation.targets = [];
    if (!REDUCED_MOTION) spawnBurst(formation.center.x, formation.center.y);
    syncFormationUI();
  }

  /* ---------------- text formations: a compact 5x7 pixel font -------- */
  var FONT_5X7 = {
    'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    'C': ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
    'D': ['###..', '#..#.', '#...#', '#...#', '#...#', '#..#.', '###..'],
    'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    'G': ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
    'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'I': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
    'J': ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
    'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    'N': ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
    'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
    'X': ['#...#', '.#.#.', '.#.#.', '..#..', '.#.#.', '.#.#.', '#...#'],
    'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    '0': ['.###.', '#..##', '#.#.#', '##..#', '#...#', '#...#', '.###.'],
    '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
    '7': ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
    ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
    '♥': ['.#.#.', '#####', '#####', '.###.', '.###.', '..#..', '.....'],
    '★': ['..#..', '.###.', '#####', '.###.', '.#.#.', '#...#', '.....']
  };

  /* Sample a word into formation points on the 100x60 grid. Glyphs are
   * scaled to fill the width (height-capped) and centered. Unknown
   * characters become spaces. Returns [[x, y], ...] with float coords. */
  function textToPoints(text) {
    var word = String(text || '').toUpperCase();
    if (!word.length) return [];
    var totalW = word.length * 6 - 1;                 /* 5px glyph + 1px gap */
    var scaleF = Math.min(92 / totalW, 52 / 7);
    var ox = (100 - totalW * scaleF) / 2;
    var oy = (60 - 7 * scaleF) / 2;
    var points = [];
    for (var ci = 0; ci < word.length; ci++) {
      var glyph = FONT_5X7[word.charAt(ci)] || FONT_5X7[' '];
      for (var row = 0; row < 7; row++) {
        for (var col = 0; col < 5; col++) {
          if (glyph[row].charAt(col) === '#') {
            points.push([
              ox + (ci * 6 + col) * scaleF + scaleF / 2,
              oy + row * scaleF + scaleF / 2
            ]);
          }
        }
      }
    }
    return points;
  }

  /* ------------------------------------------------------------------ */
  /* Share my swarm                                                      */
  /*                                                                     */
  /* The current combo (behavior, skin, dot count — plus the last game   */
  /* score when there is one) rides in the URL hash, e.g.                */
  /* #s=matrix&b=orbit&n=300. Opening such a link applies the combo.     */
  /* ------------------------------------------------------------------ */
  function encodeShareState(st) {
    var parts = [];
    if (st.skin) parts.push('s=' + encodeURIComponent(st.skin));
    if (st.behavior) parts.push('b=' + encodeURIComponent(st.behavior));
    if (st.count) parts.push('n=' + st.count);
    if (st.score !== null && typeof st.score === 'number') {
      parts.push('score=' + st.score);
    }
    return parts.join('&');
  }

  function decodeShareState(str) {
    if (!str) return null;
    var out = {};
    var found = false;
    String(str).replace(/^#/, '').split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i < 0) return;
      var k = kv.slice(0, i);
      var v = '';
      try { v = decodeURIComponent(kv.slice(i + 1)); } catch (e) { return; }
      if (k === 's' && v) { out.skin = v; found = true; }
      else if (k === 'b' && v) { out.behavior = v; found = true; }
      else if (k === 'n') {
        var n = parseInt(v, 10);
        if (n >= 30 && n <= 600) { out.count = n; found = true; }
      }
      /* 'score' is written into shared links so a card/link can carry
       * it, but a recipient's page does not adopt a stranger's score. */
    });
    return found ? out : null;
  }

  function currentShareState() {
    return {
      behavior: activeBehavior ? activeBehavior.id : null,
      skin: activeSkin ? activeSkin.id : null,
      count: requestedCount || null,
      score: lastScore
    };
  }

  function shareLink() {
    return window.location.href.split('#')[0] + '#' +
      encodeShareState(currentShareState());
  }

  function copyShareLink() {
    var link = shareLink();
    var btn = controls && controls.shareLinkBtn;
    function done() {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = 'Link copied!';
      setTimeout(function () { btn.textContent = old; }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(done, function () {
        window.prompt('Copy your swarm link:', link);
      });
    } else {
      window.prompt('Copy your swarm link:', link);
    }
  }

  /* Apply a share hash on load. Unknown ids are ignored gracefully. */
  function applyHashState() {
    var st = decodeShareState(window.location.hash || '');
    if (!st || !controls) return;
    if (st.behavior) {
      var b = findById(registry.behaviors, st.behavior);
      if (b) {
        activeBehavior = b;
        controls.behaviorSelect.value = b.id;
      }
    }
    if (st.skin) {
      var s = findById(registry.skins, st.skin);
      if (s) {
        activeSkin = s;
        controls.skinSelect.value = s.id;
        ctx2d.fillStyle = s.background || '#05060f';
        ctx2d.fillRect(0, 0, W, H);
      }
    }
    if (st.count) {
      controls.countRange.value = st.count;
      controls.countValue.textContent = st.count;
      makeBoids(st.count);
    }
  }

  /* ---------------- share card: a 1200x630 PNG ---------------------- */
  var cardCanvas = null;
  var cardBlob = null;

  function renderCardCanvas(scoreOverride) {
    if (!cardCanvas) {
      cardCanvas = document.createElement('canvas');
      cardCanvas.width = 1200;
      cardCanvas.height = 630;
    }
    var c = cardCanvas.getContext('2d');
    var skin = activeSkin ||
      { colors: ['#ffffff'], background: '#05060f', name: 'Default' };
    c.fillStyle = skin.background || '#05060f';
    c.fillRect(0, 0, 1200, 630);

    /* The live swarm, cover-fitted over the whole card. */
    if (canvas.width > 0 && canvas.height > 0) {
      var scale = Math.max(1200 / canvas.width, 630 / canvas.height);
      var dw = canvas.width * scale;
      var dh = canvas.height * scale;
      c.drawImage(canvas, (1200 - dw) / 2, (630 - dh) / 2, dw, dh);
    }

    var score = (typeof scoreOverride === 'number') ? scoreOverride : lastScore;
    var combo = (activeBehavior ? activeBehavior.name : 'Swarm') + ' · ' +
      (skin.name || 'Default') + ' · ' + (requestedCount || 0) + ' dots';

    /* Text block, top-left, over a soft dark plate. */
    c.fillStyle = 'rgba(3, 4, 12, 0.55)';
    c.fillRect(40, 36, 700, score !== null ? 218 : 168);
    c.fillStyle = '#ffffff';
    c.textAlign = 'left';
    c.font = '700 66px "Segoe UI", system-ui, sans-serif';
    c.fillText('Cursor Swarm', 68, 116);
    c.font = '400 31px "Segoe UI", system-ui, sans-serif';
    c.fillStyle = 'rgba(255, 255, 255, 0.92)';
    if (score !== null) {
      c.font = '600 34px "Segoe UI", system-ui, sans-serif';
      c.fillText('🏆 I collected ' + score + ' orbs in Collect the Orbs!', 68, 172);
      c.font = '400 28px "Segoe UI", system-ui, sans-serif';
      c.fillText(combo, 68, 220);
    } else {
      c.fillText(combo, 68, 172);
    }

    c.textAlign = 'center';
    c.font = '500 27px "Segoe UI", system-ui, sans-serif';
    c.fillStyle = 'rgba(255, 255, 255, 0.85)';
    c.fillText('anhnt256.github.io/cursor-swarm', 600, 594);
    c.textAlign = 'left';
    return cardCanvas;
  }

  function refreshCardBlob() {
    try {
      renderCardCanvas().toBlob(function (b) { if (b) cardBlob = b; }, 'image/png');
    } catch (e) { /* canvas taint etc. — the click path re-renders anyway */ }
  }

  /* iOS note: a share must ride the tap's user activation, and building
   * a File is async — so the card is pre-rendered to a Blob whenever
   * the button is hovered/focused (and after each game), letting the
   * click handler hand a ready File to navigator.share synchronously.
   * If no pre-render exists (or an explicit score is requested), the
   * canvas is redrawn synchronously in the handler and the Blob is
   * taken from that fresh render. */
  function shareCard(scoreOverride) {
    renderCardCanvas(scoreOverride); /* synchronous redraw, always */
    function deliver(blob) {
      if (!blob) return;
      var file = null;
      try {
        file = new File([blob], 'cursor-swarm.png', { type: 'image/png' });
      } catch (e) { file = null; }
      if (file && navigator.canShare &&
          navigator.canShare({ files: [file] }) && navigator.share) {
        navigator.share({ files: [file], title: 'Cursor Swarm' })
          .catch(function () {});
      } else {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'cursor-swarm.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      }
    }
    if (typeof scoreOverride !== 'number' && cardBlob) {
      deliver(cardBlob);
      refreshCardBlob();
    } else if (cardCanvas.toBlob) {
      cardCanvas.toBlob(function (b) {
        if (b) cardBlob = b;
        deliver(b);
      }, 'image/png');
    }
  }

  /* Read-only access for src/game.js (and tests), in the same spirit
   * as SwarmEngineTest above. */
  window.SwarmEngine = {
    getDots: function () { return boids; },
    getActiveCount: function () { return activeCount; },
    getSize: function () { return { width: W, height: H }; },
    getPointer: function () { return pointer; },
    burst: function (x, y) { spawnBurst(x, y); },
    isReducedMotion: function () { return REDUCED_MOTION; }
  };
  window.SwarmFormation = {
    form: formFormation,
    release: releaseFormation,
    isActive: function () { return formation.active; },
    textToPoints: textToPoints
  };
  window.SwarmShare = {
    encode: encodeShareState,
    decode: decodeShareState,
    link: shareLink,
    copyLink: copyShareLink,
    shareCard: shareCard,
    setLastScore: function (n) {
      lastScore = (typeof n === 'number') ? n : null;
      refreshCardBlob();
    },
    getState: currentShareState
  };

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
      if (formation.active) {
        steerToFormation(b, i, now);
      } else if (activeBehavior) {
        activeBehavior.update(b, ctxForBehavior);
      }

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

    controls = {
      behaviorSelect: behaviorSelect,
      skinSelect: skinSelect,
      countRange: countRange,
      countValue: countValue,
      shareLinkBtn: document.getElementById('shareLinkBtn'),
      shareCardBtn: document.getElementById('shareCardBtn'),
      formationSelect: document.getElementById('formationSelect'),
      formationText: document.getElementById('formationText'),
      formBtn: document.getElementById('formBtn'),
      releaseBtn: document.getElementById('releaseBtn'),
      formationHint: document.getElementById('formationHint')
    };

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

    /* -------- share buttons -------- */
    if (controls.shareLinkBtn) {
      controls.shareLinkBtn.addEventListener('click', copyShareLink);
    }
    if (controls.shareCardBtn) {
      controls.shareCardBtn.addEventListener('click', function () { shareCard(); });
      /* Pre-render the card so a tap can share a ready File (iOS). */
      controls.shareCardBtn.addEventListener('pointerenter', refreshCardBlob);
      controls.shareCardBtn.addEventListener('focus', refreshCardBlob);
    }

    /* -------- formation controls -------- */
    if (controls.formationSelect) {
      var fs = controls.formationSelect;
      fs.innerHTML = '';
      var textOpt = document.createElement('option');
      textOpt.value = '__text__';
      textOpt.textContent = 'Type your own…';
      fs.appendChild(textOpt);
      registry.formations.forEach(function (def) {
        var opt = document.createElement('option');
        opt.value = def.id;
        opt.textContent = def.name + (def.author ? ' — ' + def.author : '');
        fs.appendChild(opt);
      });
      fs.addEventListener('change', function () {
        if (controls.formationText) {
          controls.formationText.style.display =
            (fs.value === '__text__') ? '' : 'none';
        }
      });
    }
    if (controls.formBtn) {
      controls.formBtn.addEventListener('click', function () {
        if (formation.active) { releaseFormation(); return; }
        var pts = null;
        if (!controls.formationSelect ||
            controls.formationSelect.value === '__text__') {
          var txt = controls.formationText
            ? controls.formationText.value.trim() : '';
          pts = textToPoints(txt || 'HI');
        } else {
          var def = findById(registry.formations, controls.formationSelect.value);
          if (def) pts = def.points;
        }
        if (pts && pts.length) formFormation(pts);
      });
    }
    if (controls.releaseBtn) {
      controls.releaseBtn.addEventListener('click', releaseFormation);
    }

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
      var files = (manifest.behaviors || [])
        .concat(manifest.skins || [], manifest.formations || []);
      var chain = Promise.resolve();
      files.forEach(function (src) {
        chain = chain.then(function () { return loadScript(src); });
      });
      return chain;
    }).then(function () {
      registry.loadedAll = true;
      buildControls();
      applyHashState();
      requestAnimationFrame(frame);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
