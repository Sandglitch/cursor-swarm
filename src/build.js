/*
 * Cursor Swarm — build.js
 *
 * "A website that builds itself as you scroll."
 *
 * Five tiny AI cursors (Míp, Nova, Pixel, Comet, Pip) assemble every
 * section of this page the first time it scrolls into view: they fly to each element,
 * type the headings character by character, and drop cards, buttons and
 * blocks into place one by one, narrating their work in the build-log
 * ticker at the bottom-left.
 *
 * Pure vanilla JS. No build step, no dependencies. Works from file://
 * and on GitHub Pages (it only watches window.SwarmRegistry, which
 * src/engine.js fills in; it never fetches anything itself).
 *
 * Accessibility: with prefers-reduced-motion, nothing is animated —
 * every section is simply shown, fully built, and the agents stay hidden.
 */
(function () {
  'use strict';

  var REDUCED = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var INSTANT = false; /* flipped by the watchdog if animations stall */

  /* ---------------- helpers ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function noop() {}

  var measureCtx = document.createElement('canvas').getContext('2d');
  function fontOf(el) {
    var cs = window.getComputedStyle(el);
    return cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
  }

  /* ---------------- build log ticker ---------------- */
  var logEl = document.getElementById('buildlog');
  function log(msg) {
    if (!logEl || REDUCED) return;
    var line = document.createElement('div');
    line.className = 'log-line';
    line.textContent = '✓ ' + msg;
    logEl.appendChild(line);
    while (logEl.children.length > 3) logEl.removeChild(logEl.firstChild);
  }

  /* ---------------- agents ---------------- */
  function makeAgent(id, name, parkFn) {
    return {
      name: name,
      el: document.getElementById(id),
      x: 0, y: 0,
      queue: Promise.resolve(),
      parkFn: parkFn
    };
  }
  var agents = {
    mip: makeAgent('agent-mip', 'Míp', function () {
      return { x: window.innerWidth - 110, y: window.innerHeight - 130 };
    }),
    nova: makeAgent('agent-nova', 'Nova', function () {
      return { x: window.innerWidth - 110, y: 92 };
    }),
    pixel: makeAgent('agent-pixel', 'Pixel', function () {
      return { x: 30, y: 92 };
    }),
    comet: makeAgent('agent-comet', 'Comet', function () {
      return { x: 30, y: window.innerHeight - 130 };
    }),
    pip: makeAgent('agent-pip', 'Pip', function () {
      return { x: Math.round(window.innerWidth / 2) - 40, y: window.innerHeight - 130 };
    })
  };

  /* Serialize work per agent: an agent never does two things at once,
   * but the five agents work in parallel. */
  function agentDo(agent, task) {
    var run = agent.queue.then(task, task);
    agent.queue = run.then(noop, noop);
    return run;
  }

  function flyAgentTo(agent, x, y) {
    var dx = x - agent.x, dy = y - agent.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    agent.x = x; agent.y = y;
    if (INSTANT || REDUCED) {
      agent.el.style.transitionDuration = '0ms';
      agent.el.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
      return Promise.resolve();
    }
    var dur = Math.max(160, Math.min(720, dist * 0.55));
    agent.el.style.transitionDuration = dur + 'ms';
    agent.el.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
    return sleep(dur * 0.92);
  }

  function park(agent) {
    var p = agent.parkFn();
    agentDo(agent, function () { return flyAgentTo(agent, p.x, p.y); });
  }

  function initAgents() {
    Object.keys(agents).forEach(function (key) {
      var a = agents[key];
      var p = a.parkFn();
      a.x = p.x; a.y = p.y;
      a.el.style.transitionDuration = '0ms';
      a.el.style.transform = 'translate(' + p.x + 'px, ' + p.y + 'px)';
    });
    /* Force reflow so the next transform animates instead of jumping. */
    void document.body.offsetWidth;
    Object.keys(agents).forEach(function (key) {
      agents[key].el.style.transitionDuration = '';
    });
    document.getElementById('agents').classList.add('on');
  }

  /* ---------------- core actions ---------------- */

  /* Fly to an element and pop it into existence. */
  function place(agent, el, msg) {
    if (!el) return Promise.resolve();
    if (INSTANT || REDUCED) {
      el.classList.add('built');
      el.classList.remove('unbuilt');
      if (msg) log(msg);
      return Promise.resolve();
    }
    return agentDo(agent, async function () {
      var r = el.getBoundingClientRect();
      await flyAgentTo(agent, r.left - 8, r.top - 8);
      el.classList.add('built');
      el.classList.remove('unbuilt');
      if (msg) log(msg);
      await sleep(80);
    });
  }

  /* Drag an element into place: the agent flies to a point off to one
   * side (fromDir -1 = from the left, +1 = from the right), grabs the
   * element there, and hauls it along a shallow arc into its slot,
   * where the .built transition's overshoot gives it a soft settle.
   * Used for cards and chips, where a plain pop feels too static. */
  function dragIn(agent, el, msg, fromDir) {
    if (!el) return Promise.resolve();
    if (INSTANT || REDUCED) {
      el.classList.add('built');
      el.classList.remove('unbuilt');
      if (msg) log(msg);
      return Promise.resolve();
    }
    return agentDo(agent, async function () {
      var r = el.getBoundingClientRect();
      var dir = (fromDir || 1);
      var offX = dir * -150;                 /* start off to one side… */
      var offY = 56;                         /* …and a little low */
      var startX = r.left + offX, startY = r.top + offY;
      await flyAgentTo(agent, startX, startY);

      /* Show the element at the grabbed offset, with no transition. */
      el.style.transition = 'none';
      el.classList.add('built');
      el.classList.remove('unbuilt');
      el.style.transform =
        'translate(' + offX + 'px, ' + offY + 'px) scale(0.92)';
      void el.offsetWidth;                   /* commit the start pose */
      el.style.transition = '';

      /* Arc midpoint: most of the way home, lifted a touch. */
      var midX = offX * 0.32, midY = offY * 0.32 - 26;
      el.style.transform =
        'translate(' + midX + 'px, ' + midY + 'px) scale(0.97)';
      flyAgentTo(agent, r.left + midX, r.top + midY);
      await sleep(190);

      /* Final leg: release — the element settles into its slot while
       * the agent steps back to the element's corner. */
      el.style.transform = '';
      await flyAgentTo(agent, r.left - 8, r.top - 8);
      if (msg) log(msg);
      await sleep(60);
    });
  }

  /* Type an element's stored full text, char by char, with the agent
   * standing at the caret. The full text lives in data-full-text
   * (captured from the HTML at prep time). */
  function typeText(agent, el, msPerChar) {
    if (!el) return Promise.resolve();
    var full = el.dataset.fullText || el.textContent;
    if (INSTANT || REDUCED) {
      el.textContent = full;
      el.classList.add('built');
      el.classList.remove('unbuilt');
      return Promise.resolve();
    }
    return agentDo(agent, async function () {
      el.classList.add('built');
      el.classList.remove('unbuilt');
      el.classList.add('typing');
      var cs = window.getComputedStyle(el);
      measureCtx.font = fontOf(el);
      var rect = el.getBoundingClientRect();
      var fullW = measureCtx.measureText(full).width;
      var startX = (cs.textAlign === 'center')
        ? rect.left + Math.max(0, (rect.width - fullW) / 2)
        : rect.left;
      var y = rect.top + rect.height * 0.38;
      await flyAgentTo(agent, startX, y);
      agent.el.style.transitionDuration = '45ms';
      for (var i = 1; i <= full.length; i++) {
        var slice = full.slice(0, i);
        el.textContent = slice;
        var cx = startX + measureCtx.measureText(slice).width;
        agent.el.style.transform = 'translate(' + cx + 'px, ' + y + 'px)';
        agent.x = cx; agent.y = y;
        await sleep(msPerChar);
      }
      el.classList.remove('typing');
    });
  }

  /* Type the code snippet into the <code> element, line by line, with
   * the agent walking down the left margin as lines complete. */
  function typeCode(agent, codeEl) {
    if (!codeEl) return Promise.resolve();
    var full = codeEl.dataset.fullText || '';
    if (INSTANT || REDUCED) { codeEl.textContent = full; return Promise.resolve(); }
    return agentDo(agent, async function () {
      var pre = codeEl.parentElement;
      var r = pre.getBoundingClientRect();
      var cs = window.getComputedStyle(codeEl);
      measureCtx.font = fontOf(codeEl);
      var lineH = parseFloat(cs.lineHeight) || 21.6;
      var baseX = r.left + 24, baseY = r.top + 14;
      await flyAgentTo(agent, baseX, baseY);
      agent.el.style.transitionDuration = '40ms';
      var lines = full.split('\n');
      var typed = '';
      for (var li = 0; li < lines.length; li++) {
        var line = lines[li];
        for (var ci = 1; ci <= line.length; ci++) {
          var slice = line.slice(0, ci);
          codeEl.textContent = typed + slice;
          var cx = baseX + measureCtx.measureText(slice).width;
          var cy = baseY + li * lineH;
          agent.el.style.transform = 'translate(' + cx + 'px, ' + cy + 'px)';
          agent.x = cx; agent.y = cy;
          await sleep(6);
        }
        typed += line + '\n';
      }
      codeEl.textContent = full;
    });
  }

  /* ---------------- contribution cards ---------------- */

  /* The engine loads contributions asynchronously; poll the registry
   * until it has content (or give up after ~6s and render what's there). */
  function registryReady() {
    return new Promise(function (resolve) {
      var started = Date.now();
      (function poll() {
        var r = window.SwarmRegistry;
        if (r && r.behaviors.length > 0 && r.skins.length > 0) return resolve(r);
        if (Date.now() - started > 6000) {
          return resolve(r || { behaviors: [], skins: [] });
        }
        setTimeout(poll, 120);
      })();
    });
  }

  function makeCard(def, instant) {
    var card = document.createElement('article');
    card.className = 'card' + (instant ? ' built' : ' unbuilt');
    card.setAttribute('data-build', '');
    return card;
  }
  function addText(parent, tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = text;
    parent.appendChild(el);
    return el;
  }

  function renderCards(instant) {
    var r = window.SwarmRegistry || { behaviors: [], skins: [] };

    var bWrap = document.getElementById('behaviorCards');
    if (bWrap && !bWrap.children.length) {
      r.behaviors.forEach(function (def) {
        var card = makeCard(def, instant);
        addText(card, 'div', 'card-emoji', '🌀');
        addText(card, 'h3', '', def.name);
        addText(card, 'p', 'card-author', 'by ' + (def.author || 'unknown'));
        addText(card, 'span', 'chip', def.id);
        bWrap.appendChild(card);
      });
    }

    var sWrap = document.getElementById('skinCards');
    if (sWrap && !sWrap.children.length) {
      r.skins.forEach(function (def) {
        var card = makeCard(def, instant);
        var sw = document.createElement('div');
        sw.className = 'swatches';
        def.colors.forEach(function (c) {
          var s = document.createElement('span');
          s.className = 'swatch';
          s.style.backgroundColor = c;
          sw.appendChild(s);
        });
        card.appendChild(sw);
        addText(card, 'h3', '', def.name);
        addText(card, 'p', 'card-author', 'by ' + (def.author || 'unknown'));
        var meta = 'radius ' + (def.radius || 3) +
          ' · ' + (def.glow ? 'glow' : 'no glow') +
          ' · bg ' + (def.background || '#05060f');
        addText(card, 'p', 'card-meta', meta);
        addText(card, 'span', 'chip', def.id);
        sWrap.appendChild(card);
      });
    }
  }

  /* ---------------- hall of fame ---------------- */

  /* One entry per unique author across behaviors + skins, with counts.
   * Sorted: anhnt256 (the maintainer) first, then by total count
   * descending, then by name. Pure function of the registry — exposed
   * below as window.SwarmHallOfFame so it can be tested headlessly. */
  function aggregateAuthors(r) {
    var map = {};
    var list = [];
    function add(def, kind) {
      var author = (def && def.author) || 'unknown';
      if (!map[author]) {
        map[author] = { author: author, behaviors: 0, skins: 0, total: 0 };
        list.push(map[author]);
      }
      map[author][kind]++;
      map[author].total++;
    }
    ((r && r.behaviors) || []).forEach(function (d) { add(d, 'behaviors'); });
    ((r && r.skins) || []).forEach(function (d) { add(d, 'skins'); });
    list.sort(function (a, b) {
      if (a.author === 'anhnt256') return -1;
      if (b.author === 'anhnt256') return 1;
      if (b.total !== a.total) return b.total - a.total;
      return a.author < b.author ? -1 : 1;
    });
    return list;
  }

  /* Presentation facts for one author's chip: initial letter, a stable
   * color hashed from the name, and the "N behaviors · M skins" line. */
  function hofDescribe(entry) {
    var hash = 0;
    for (var i = 0; i < entry.author.length; i++) {
      hash = (hash * 31 + entry.author.charCodeAt(i)) % 360;
    }
    var parts = [];
    if (entry.behaviors) {
      parts.push(entry.behaviors + (entry.behaviors === 1 ? ' behavior' : ' behaviors'));
    }
    if (entry.skins) {
      parts.push(entry.skins + (entry.skins === 1 ? ' skin' : ' skins'));
    }
    return {
      initial: entry.author.charAt(0).toUpperCase(),
      color: 'hsl(' + hash + ', 72%, 58%)',
      countText: parts.join(' · ')
    };
  }

  function renderHallOfFame(instant) {
    var section = document.getElementById('halloffame');
    var wrap = document.getElementById('hofChips');
    if (!section || !wrap || wrap.children.length) return;
    var authors = aggregateAuthors(window.SwarmRegistry || { behaviors: [], skins: [] });
    if (!authors.length) {
      /* Nothing to celebrate yet: hide the section and stop the build
       * observer from ever trying to assemble it. */
      section.style.display = 'none';
      section.removeAttribute('data-build-section');
      return;
    }
    authors.forEach(function (entry) {
      var d = hofDescribe(entry);
      var chip = document.createElement('div');
      chip.className = 'hof-chip' + (instant ? ' built' : ' unbuilt');
      chip.setAttribute('data-build', '');
      var face = document.createElement('span');
      face.className = 'hof-initial';
      face.style.backgroundColor = d.color;
      face.textContent = d.initial;
      chip.appendChild(face);
      var text = document.createElement('span');
      text.className = 'hof-text';
      var name = document.createElement('span');
      name.className = 'hof-name';
      name.textContent = entry.author;
      var count = document.createElement('span');
      count.className = 'hof-count';
      count.textContent = d.countText;
      text.appendChild(name);
      text.appendChild(count);
      chip.appendChild(text);
      wrap.appendChild(chip);
    });
  }

  /* Test hook: lets a headless harness run the real aggregation +
   * chip-description logic against the real registry. */
  window.SwarmHallOfFame = {
    aggregateAuthors: aggregateAuthors,
    describe: hofDescribe
  };

  /* ---------------- section build sequences ---------------- */

  async function buildHero(section) {
    var badge = section.querySelector('.hero-badge');
    var btns = section.querySelectorAll('.hero-actions .btn');
    var hint = section.querySelector('.scroll-hint');
    await place(agents.pixel, badge, 'Pixel placed the emblem');
    await typeText(agents.mip, document.getElementById('heroTitle'), 46);
    log('Míp typed the title');
    await typeText(agents.nova, document.getElementById('heroSub'), 14);
    log('Nova typed the subtitle');
    await Promise.all([
      place(agents.pixel, btns[0], 'Pixel placed the playground button'),
      place(agents.comet, btns[1], 'Comet placed the GitHub button')
    ]);
    await place(agents.pip, hint, 'Pip placed the scroll hint');
    park(agents.mip); park(agents.nova); park(agents.pixel);
    park(agents.comet); park(agents.pip);
  }

  async function buildCardSection(section, kind, headingAgent) {
    var h2 = section.querySelector('h2');
    var lede = section.querySelector('.section-lede');
    var cards = section.querySelectorAll('.card');
    await typeText(headingAgent, h2, 42);
    log(headingAgent.name + ' typed the "' + (h2.dataset.fullText || '') + '" heading');
    await place(agents.comet, lede);
    /* Two crews drag cards in from opposite ends at the same time:
     * Nova + Comet work from the first card forward, Pip + Pixel from
     * the last card backward, and they meet in the middle. */
    var total = cards.length;
    var half = Math.ceil(total / 2);
    var frontCrew = [agents.nova, agents.comet];
    var backCrew = [agents.pip, agents.pixel];
    await Promise.all(Array.prototype.map.call(cards, function (card, i) {
      var fromFront = i < half;
      var slot = fromFront ? i : (total - 1 - i);
      var agent = fromFront
        ? frontCrew[slot % frontCrew.length]
        : backCrew[slot % backCrew.length];
      return sleep(INSTANT ? 0 : slot * 160).then(function () {
        return dragIn(agent, card,
          agent.name + ' placed card ' + (i + 1) + '/' + total + ' — ' + kind,
          fromFront ? -1 : 1);
      });
    }));
    park(agents.nova); park(agents.pixel);
    park(agents.comet); park(agents.pip);
  }

  async function buildContribute(section) {
    var h2 = section.querySelector('h2');
    var ledes = section.querySelectorAll('.section-lede');
    var steps = section.querySelectorAll('.step-card');
    var pre = section.querySelector('.code-block');
    var code = document.getElementById('snippetCode');
    await typeText(agents.mip, h2, 40);
    log('Míp typed the "How to contribute" heading');
    await place(agents.nova, ledes[0]);
    await Promise.all([
      place(agents.nova, steps[0], 'Nova placed step 1/3 — contribute'),
      place(agents.pixel, steps[1], 'Pixel placed step 2/3 — contribute'),
      place(agents.comet, steps[2], 'Comet placed step 3/3 — contribute')
    ]);
    await place(agents.pip, pre, 'Pip placed the code block');
    await typeCode(agents.nova, code);
    log('Nova typed the registerBehavior snippet');
    await place(agents.comet, ledes[1]);
    park(agents.mip); park(agents.nova); park(agents.pixel);
    park(agents.comet); park(agents.pip);
  }

  async function buildPlayground(section) {
    var h2 = section.querySelector('h2');
    var lede = section.querySelector('.section-lede');
    var note = section.querySelector('.play-note');
    var tip = section.querySelector('.play-tip');
    await typeText(agents.pixel, h2, 42);
    log('Pixel typed the "Playground" heading');
    await place(agents.nova, lede);
    await place(agents.mip, document.getElementById('bar'),
      'Míp placed the playground controls');
    await Promise.all([
      place(agents.comet, note),
      place(agents.pip, tip, 'Pip placed the burst tip')
    ]);
    park(agents.mip); park(agents.nova); park(agents.pixel);
    park(agents.comet); park(agents.pip);
  }

  async function buildContributors(section) {
    var h2 = section.querySelector('h2');
    var lede = section.querySelector('.section-lede');
    var cards = section.querySelectorAll('.wall-card');
    await typeText(agents.nova, h2, 42);
    log('Nova typed the "Contributors" heading');
    await place(agents.pixel, lede);
    await Promise.all([
      place(agents.pixel, cards[0], 'Pixel placed the contributor wall'),
      place(agents.comet, cards[1], 'Comet saved a spot for you')
    ]);
    park(agents.pixel); park(agents.comet);
  }

  async function buildHallOfFame(section) {
    var h2 = section.querySelector('h2');
    var lede = section.querySelector('.section-lede');
    var chips = section.querySelectorAll('.hof-chip');
    await typeText(agents.comet, h2, 42);
    log('Comet typed the "Hall of Fame" heading');
    await place(agents.pip, lede);
    /* Same two-crew trick as the card grids: chips are dragged in from
     * both ends at once. */
    var total = chips.length;
    var half = Math.ceil(total / 2);
    var frontCrew = [agents.nova, agents.pip];
    var backCrew = [agents.comet, agents.mip];
    await Promise.all(Array.prototype.map.call(chips, function (chip, i) {
      var fromFront = i < half;
      var slot = fromFront ? i : (total - 1 - i);
      var agent = fromFront
        ? frontCrew[slot % frontCrew.length]
        : backCrew[slot % backCrew.length];
      return sleep(INSTANT ? 0 : slot * 150).then(function () {
        return dragIn(agent, chip,
          agent.name + ' placed a Hall of Fame chip — ' +
            (chip.querySelector('.hof-name') || {}).textContent,
          fromFront ? -1 : 1);
      });
    }));
    park(agents.nova); park(agents.pip);
    park(agents.comet); park(agents.mip);
  }

  async function buildFooter(footer) {
    await place(agents.mip, footer.querySelector('.foot-line'),
      'Míp placed the closing line');
    await place(agents.pip, footer.querySelector('.foot-links'),
      'Pip placed the footer links');
    park(agents.mip); park(agents.pip);
  }

  async function buildGeneric(section) {
    var headings = section.querySelectorAll('.type-me');
    var items = section.querySelectorAll('[data-build]');
    var i;
    for (i = 0; i < headings.length; i++) {
      await typeText(agents.pixel, headings[i], 30);
    }
    var crew = [agents.nova, agents.pip, agents.comet];
    await Promise.all(Array.prototype.map.call(items, function (el, j) {
      return sleep(INSTANT ? 0 : j * 150).then(function () {
        return place(crew[j % crew.length], el);
      });
    }));
  }

  var builders = {
    hero: buildHero,
    behaviors: function (s) { return buildCardSection(s, 'behaviors', agents.nova); },
    skins: function (s) { return buildCardSection(s, 'skins', agents.mip); },
    contribute: buildContribute,
    playground: buildPlayground,
    halloffame: buildHallOfFame,
    contributors: buildContributors,
    foot: buildFooter
  };

  /* ---------------- build orchestration ---------------- */

  function forceBuilt(root) {
    $all('.type-me', root).forEach(function (el) {
      if (el.dataset.fullText) el.textContent = el.dataset.fullText;
    });
    var code = document.getElementById('snippetCode');
    if (code && code.dataset.fullText) code.textContent = code.dataset.fullText;
    $all('.unbuilt', root).forEach(function (el) {
      el.classList.add('built');
      el.classList.remove('unbuilt');
    });
  }

  var builtSet = {};
  function buildSection(section) {
    if (!section || builtSet[section.id]) return;
    builtSet[section.id] = true;
    var builder = builders[section.id] || buildGeneric;
    Promise.resolve()
      .then(function () { return builder(section); })
      .then(function () {
        /* Triggers the title underline draw in style.css. */
        section.classList.add('build-done');
      })
      .catch(function () {
        forceBuilt(section);
        section.classList.add('build-done');
      });
  }

  function setupObservers() {
    var sections = $all('[data-build-section]');
    if (!('IntersectionObserver' in window)) {
      sections.forEach(buildSection);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.34) {
          buildSection(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: [0.35] });
    sections.forEach(function (s) { io.observe(s); });
  }

  /* The fixed canvas is ambient everywhere except the playground,
   * where it comes to full strength. */
  function setupPlaygroundObserver() {
    var pg = document.getElementById('playground');
    if (!pg || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        document.body.classList.toggle('playground-on', entry.isIntersecting);
      });
    }, { threshold: 0.15 });
    io.observe(pg);
  }

  /* If the hero has not built within a few seconds (observer quirks,
   * background tab, …), stop animating and simply show everything. */
  function watchdog() {
    if (!builtSet.hero) {
      INSTANT = true;
      $all('[data-build-section]').forEach(buildSection);
    }
  }

  /* ---------------- prep + init ---------------- */

  function prepText() {
    $all('.type-me').forEach(function (el) {
      el.dataset.fullText = el.textContent.replace(/\s+/g, ' ').trim();
      if (!REDUCED) el.textContent = '';
    });
    var code = document.getElementById('snippetCode');
    if (code) {
      code.dataset.fullText = code.textContent.replace(/^\s*\n/, '').replace(/\s+$/, '');
      if (!REDUCED) code.textContent = '';
    }
  }

  function init() {
    prepText();
    setupPlaygroundObserver();

    if (REDUCED) {
      document.documentElement.classList.add('reduced-motion');
      registryReady().then(function () {
        renderCards(true);
        renderHallOfFame(true);
        forceBuilt(document);
        $all('[data-build-section]').forEach(function (s) {
          s.classList.add('build-done');
        });
      });
      return;
    }

    initAgents();
    registryReady().then(function () {
      renderCards(false);
      renderHallOfFame(false);
      setupObservers();
      setTimeout(watchdog, 6500);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
