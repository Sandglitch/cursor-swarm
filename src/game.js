/*
 * Cursor Swarm — src/game.js
 *
 * "Collect the Orbs": a 60-second mini-game played with the swarm
 * itself. A glowing orb appears somewhere on screen; steer the swarm
 * (it keeps following your pointer / touch with the current behavior)
 * so that any dot touches the orb to collect it. Score as many as you
 * can before the clock runs out.
 *
 * The game is a guest of the engine: it reads dot positions through
 * the read-only window.SwarmEngine accessor, draws its orbs on its
 * own fixed overlay canvas (above the swarm canvas, below the page),
 * and borrows the engine's click burst when an orb is collected.
 * Pure vanilla JS, no dependencies.
 */
(function () {
  'use strict';

  var ROUND_MS = 60000;
  var COLLECT_RADIUS = 26;
  var SPAWN_DELAY_MS = 300;
  var EDGE_MARGIN = 120;
  var POINTER_CLEARANCE = 170;
  var BEST_KEY = 'cs_orbs_best';

  /* ---------------- pure helpers (unit-testable) ---------------- */

  /* True when any of the first `count` dots is within r of (x, y). */
  function anyDotWithin(dots, count, x, y, r) {
    var r2 = r * r;
    var n = Math.min(count, dots.length);
    for (var i = 0; i < n; i++) {
      var dx = dots[i].x - x;
      var dy = dots[i].y - y;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }

  /* Pick an orb position: at least EDGE_MARGIN from the canvas edges
   * (clamped on small screens) and not too close to the pointer.
   * Gives up after a few tries and takes the best candidate found. */
  function pickOrbPosition(width, height, pointer) {
    var mx = Math.min(EDGE_MARGIN, width * 0.18);
    var my = Math.min(EDGE_MARGIN, height * 0.18);
    var best = null;
    var bestClear = -1;
    for (var i = 0; i < 40; i++) {
      var x = mx + Math.random() * Math.max(1, width - mx * 2);
      var y = my + Math.random() * Math.max(1, height - my * 2);
      var clear = pointer
        ? Math.sqrt((x - pointer.x) * (x - pointer.x) +
                    (y - pointer.y) * (y - pointer.y))
        : Infinity;
      if (clear > bestClear) { bestClear = clear; best = { x: x, y: y }; }
      if (clear >= POINTER_CLEARANCE) break;
    }
    return best;
  }

  /* Test hook, same spirit as the engine's SwarmEngineTest. */
  window.SwarmGameTest = {
    anyDotWithin: anyDotWithin,
    pickOrbPosition: pickOrbPosition,
    COLLECT_RADIUS: COLLECT_RADIUS
  };

  /* ---------------- game state + DOM ---------------- */

  var playing = false;
  var score = 0;
  var endsAt = 0;
  var orb = null;          /* { x, y, born } */
  var nextSpawnAt = 0;
  var rafId = 0;

  var playBtn = null;
  var orbCanvas = null;
  var orbCtx = null;
  var hud = null;
  var overPanel = null;
  var overText = null;
  var overBest = null;

  function loadBest() {
    try {
      return parseInt(window.localStorage.getItem(BEST_KEY) || '0', 10) || 0;
    } catch (e) { return 0; }
  }
  function saveBest(v) {
    try { window.localStorage.setItem(BEST_KEY, String(v)); } catch (e) {}
  }

  function ensureDom() {
    if (orbCanvas) return;
    orbCanvas = document.createElement('canvas');
    orbCanvas.id = 'orbsCanvas';
    orbCanvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(orbCanvas);
    orbCtx = orbCanvas.getContext('2d');
    sizeOrbCanvas();
    window.addEventListener('resize', sizeOrbCanvas);

    var pg = document.getElementById('playground');
    if (!pg) return;

    hud = document.createElement('div');
    hud.id = 'gameHud';
    hud.style.display = 'none';
    pg.appendChild(hud);

    overPanel = document.createElement('div');
    overPanel.id = 'gameOver';
    overPanel.style.display = 'none';
    var panel = document.createElement('div');
    panel.className = 'game-panel';
    overText = document.createElement('h3');
    overBest = document.createElement('p');
    var againBtn = document.createElement('button');
    againBtn.type = 'button';
    againBtn.className = 'btn btn-primary';
    againBtn.textContent = 'Play again';
    againBtn.addEventListener('click', startRound);
    var shareBtn = document.createElement('button');
    shareBtn.type = 'button';
    shareBtn.className = 'btn btn-ghost';
    shareBtn.textContent = 'Share card';
    shareBtn.addEventListener('click', function () {
      if (window.SwarmShare) window.SwarmShare.shareCard(score);
    });
    panel.appendChild(overText);
    panel.appendChild(overBest);
    panel.appendChild(againBtn);
    panel.appendChild(shareBtn);
    overPanel.appendChild(panel);
    pg.appendChild(overPanel);
  }

  function sizeOrbCanvas() {
    if (!orbCanvas) return;
    var eng = window.SwarmEngine;
    var size = eng ? eng.getSize() : { width: window.innerWidth, height: window.innerHeight };
    orbCanvas.width = size.width;
    orbCanvas.height = size.height;
  }

  function spawnOrb(now) {
    var eng = window.SwarmEngine;
    if (!eng) return;
    var size = eng.getSize();
    var pos = pickOrbPosition(size.width, size.height, eng.getPointer());
    if (pos) orb = { x: pos.x, y: pos.y, born: now };
  }

  function formatClock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  function updateHud(now) {
    if (!hud) return;
    hud.textContent = '🎯 Score ' + score + ' · ⏱ ' + formatClock(endsAt - now);
  }

  function collect(now) {
    score++;
    var eng = window.SwarmEngine;
    if (eng) eng.burst(orb.x, orb.y);   /* celebrate with the swarm burst */
    orb = null;
    nextSpawnAt = now + SPAWN_DELAY_MS;
    updateHud(now);
  }

  function drawOrbs(now) {
    if (!orbCtx || !orbCanvas) return;
    orbCtx.clearRect(0, 0, orbCanvas.width, orbCanvas.height);
    if (!orb) return;
    var skin = null;
    var color = '#ffe600';
    /* Match the orb to the active skin's first color when readable. */
    if (window.SwarmShare && window.SwarmShare.getState) {
      var st = window.SwarmShare.getState();
      var skins = (window.SwarmRegistry && window.SwarmRegistry.skins) || [];
      for (var i = 0; i < skins.length; i++) {
        if (skins[i].id === st.skin) { skin = skins[i]; break; }
      }
    }
    if (skin && skin.colors && skin.colors.length) color = skin.colors[0];
    var pulse = 10 + Math.sin(now / 180) * 2.5;
    orbCtx.save();
    orbCtx.shadowColor = color;
    orbCtx.shadowBlur = 22;
    orbCtx.fillStyle = color;
    orbCtx.beginPath();
    orbCtx.arc(orb.x, orb.y, pulse, 0, Math.PI * 2);
    orbCtx.fill();
    orbCtx.shadowBlur = 0;
    orbCtx.strokeStyle = color;
    orbCtx.globalAlpha = 0.55;
    orbCtx.lineWidth = 2;
    orbCtx.beginPath();
    orbCtx.arc(orb.x, orb.y, pulse + 7 + Math.sin(now / 180) * 2, 0, Math.PI * 2);
    orbCtx.stroke();
    orbCtx.restore();
  }

  function loop(now) {
    if (!playing) return;
    if (now >= endsAt) { endRound(); return; }
    if (!orb && now >= nextSpawnAt) spawnOrb(now);
    if (orb) {
      var eng = window.SwarmEngine;
      if (eng && anyDotWithin(eng.getDots(), eng.getActiveCount(),
                              orb.x, orb.y, COLLECT_RADIUS)) {
        collect(now);
      }
    }
    drawOrbs(now);
    updateHud(now);
    rafId = requestAnimationFrame(loop);
  }

  function startRound() {
    if (!window.SwarmEngine) return;
    ensureDom();
    score = 0;
    endsAt = performance.now() + ROUND_MS;
    orb = null;
    nextSpawnAt = performance.now() + 250;
    playing = true;
    if (hud) hud.style.display = '';
    if (overPanel) overPanel.style.display = 'none';
    if (playBtn) playBtn.textContent = '⏹ Stop: Collect the Orbs';
    updateHud(performance.now());
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function stopGame() {
    playing = false;
    cancelAnimationFrame(rafId);
    orb = null;
    if (orbCtx && orbCanvas) {
      orbCtx.clearRect(0, 0, orbCanvas.width, orbCanvas.height);
    }
    if (hud) hud.style.display = 'none';
    if (overPanel) overPanel.style.display = 'none';
    if (playBtn) playBtn.textContent = '🎮 Play: Collect the Orbs';
  }

  function endRound() {
    playing = false;
    cancelAnimationFrame(rafId);
    orb = null;
    if (orbCtx && orbCanvas) {
      orbCtx.clearRect(0, 0, orbCanvas.width, orbCanvas.height);
    }
    if (hud) hud.style.display = 'none';
    if (playBtn) playBtn.textContent = '🎮 Play: Collect the Orbs';
    var best = loadBest();
    if (score > best) { best = score; saveBest(best); }
    if (window.SwarmShare) window.SwarmShare.setLastScore(score);
    if (overPanel && overText) {
      overText.textContent = '⏰ Time! You collected ' + score +
        (score === 1 ? ' orb' : ' orbs');
      overBest.textContent = 'Best score: ' + best;
      overPanel.style.display = '';
    }
  }

  /* ---------------- wiring ---------------- */

  function init() {
    playBtn = document.getElementById('playOrbsBtn');
    if (playBtn) {
      playBtn.addEventListener('click', function () {
        if (playing) stopGame(); else startRound();
      });
    }
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && (playing ||
          (overPanel && overPanel.style.display !== 'none'))) {
        stopGame();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
