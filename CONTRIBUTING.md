# Contributing to Cursor Swarm ✨

Welcome! This project is built for **first-time contributors**. A complete
contribution is **one new file plus one line in a JSON file**, and this
guide walks you through it step by step. No build step, no dependencies,
no setup — if you can edit a text file, you can do this.

⏱️ Total time: about 15 minutes.

---

## Step 1 — Fork the repo

Click **Fork** at the top of the
[GitHub repo](https://github.com/anhnt256/cursor-swarm), then clone your fork:

```bash
git clone https://github.com/YOUR-USERNAME/cursor-swarm.git
cd cursor-swarm
```

(You can also do everything in the GitHub web editor — no terminal needed.)

## Step 2 — Decide: a behavior, a skin, or a formation?

- **Behavior** — a new way for the swarm to move (spiral, fireworks, snake…).
  One file in `behaviors/`.
- **Skin** — a new color palette and dot style. One file in `skins/`.
- **Formation** — a shape the swarm arranges itself into (a star, a crown,
  a cat face…). Pure data, no code at all. One file in `formations/`.

Pick **one**. One file per pull request keeps reviews fast and merges
conflict-free.

## Step 3 — Add your file (copy-paste templates)

### Option A — a behavior

Create `behaviors/<your-behavior-name>.js` (lowercase, hyphens ok) and
paste this template, then make it yours:

```js
/*
 * Behavior: Fireworks
 * Author: YOUR-GITHUB-USERNAME
 * One sentence about what the swarm does.
 */
window.SwarmRegistry.registerBehavior({
  id: 'fireworks',              // unique, lowercase, no spaces
  name: 'Fireworks',            // shown in the dropdown
  author: 'YOUR-GITHUB-USERNAME',

  update: function (b, ctx) {
    // b is one dot:  b.x, b.y (position), b.vx, b.vy (velocity).
    // Your job: nudge b.vx / b.vy a little each frame. That's it!
    // The engine caps the speed and moves the dot for you.
    var p = ctx.pointer;                       // the visitor's cursor
    var dx = p.x - b.x;
    var dy = p.y - b.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    b.vx += (dx / dist) * 0.1;                 // steer toward the cursor
    b.vy += (dy / dist) * 0.1;
  }
});
```

**What you get in `ctx`:**

| Field | Meaning |
|---|---|
| `ctx.pointer.x` / `ctx.pointer.y` | Cursor position (screen center until first move) |
| `ctx.pointer.down` | `true` while the mouse button is held |
| `ctx.width` / `ctx.height` | Canvas size in pixels |
| `ctx.time` | Seconds since the page loaded (great for waves/pulses) |
| `ctx.index` | This dot's number, `0 … ctx.count - 1` (great for formations) |
| `ctx.count` | Total number of dots |

**Rules of the road for `update`:** just add forces to `b.vx` / `b.vy`.
Small numbers (0.02–0.3) feel best. Don't move `b.x` / `b.y` directly
unless your effect really needs it (teleport/respawn effects do — see
`behaviors/vortex.js`). Look at the 5 starter behaviors in `behaviors/`
for inspiration; each is under 60 lines.

### Option B — a skin

Create `skins/<your-skin-name>.js` and paste:

```js
/*
 * Skin: Ocean
 * Author: YOUR-GITHUB-USERNAME
 * One sentence about the vibe.
 */
window.SwarmRegistry.registerSkin({
  id: 'ocean',                  // unique, lowercase, no spaces
  name: 'Ocean',                // shown in the dropdown
  author: 'YOUR-GITHUB-USERNAME',
  colors: ['#00c2ff', '#0077ff', '#00ffd0', '#9be7ff'],  // dot colors, cycled
  radius: 3,                    // dot size in pixels
  glow: true,                   // true = soft neon glow
  trail: 0.30,                  // 0.05 = very long trails … 1 = no trails
  background: '#04121f'         // page background color
});
```

Skins are the easiest first PR of all — if you can pick 3–5 colors you
like together, you're done. 🎨

### Option C — a formation

A formation is **just data**: a list of `[x, y]` points on a **100×60
grid** (x runs 0–100 left→right, y runs 0–60 top→bottom). When a visitor
picks your formation in the playground, each dot flies to one of your
points and the swarm *becomes* your shape. No code, no functions —
if you can sketch a shape on graph paper, you can ship a formation.

Create `formations/<your-formation-name>.js` and paste:

```js
/*
 * Formation: Crown
 * Author: YOUR-GITHUB-USERNAME
 * One sentence about the shape.
 */
window.SwarmRegistry.registerFormation({
  id: 'crown',                  // unique, lowercase, no spaces
  name: 'Crown',                // shown in the Formation dropdown
  author: 'YOUR-GITHUB-USERNAME',
  points: [
    [10, 45], [15, 25], [30, 40], [50, 18], [70, 40], [85, 25], [90, 45],
    [10, 52], [90, 52]
    // …add as many points as your shape needs (50–300 is a good range)
  ]
});
```

Tips:

- Sketch your shape on graph paper (or any grid tool) with a 100-wide,
  60-tall grid, then read off the coordinates.
- Outline points alone read clearly; add interior points to fill the
  shape in. Denser = more solid.
- Every point is a pair of numbers in `[0–100, 0–60]` — that's the only
  rule. Look at `formations/star.js`, `formations/smiley.js` and
  `formations/rocket.js` for examples.

## Step 4 — Register your file

Open `contributions.json` and add **one line** with your file's path to
the matching list:

```json
{
  "behaviors": [
    "behaviors/orbit.js",
    "behaviors/fireworks.js"
  ],
  "skins": [
    "skins/neon.js",
    "skins/ocean.js"
  ],
  "formations": [
    "formations/star.js",
    "formations/crown.js"
  ]
}
```

(Mind the commas — JSON is picky. Keep alphabetical order if you can.)

## Step 5 — Test it

Open `index.html` in your browser (double-click it, or serve the folder
with any static server). Your behavior/skin should appear in the control
bar at the top; your formation in the Formation dropdown just below it.
Play with it. If the swarm sits still or the dropdown is
missing your entry, check:

- Is your file listed in `contributions.json`?
- Does your `id` match nothing else, and does the file have no typos?
  (Open the browser console — the engine logs friendly warnings.)
- Valid JSON in `contributions.json`? One missing comma breaks it.

## Step 6 — Open the pull request

```bash
git checkout -b add-fireworks-behavior
git add behaviors/fireworks.js contributions.json
git commit -m "Add Fireworks behavior"
git push origin add-fireworks-behavior
```

Then click **Compare & pull request** on GitHub. The PR template has a
tiny checklist — tick the boxes and submit. We merge friendly, working
contributions fast. 🚀

---

## Contribution rules (the short list)

1. **One file per PR** (+ the one manifest line). Small = fast merge.
2. **No dependencies, no build tools, no external images/fonts.** Vanilla only.
3. **Keep it under ~80 lines.** If your idea needs more, open an issue first.
4. **Credit yourself** in the header comment and `author` field — the
   dropdown shows your name!
5. **Be kind.** This repo is a playground for people learning open source.

## Good first issues

New here and out of ideas? Grab one from the
[good first issue list](https://github.com/anhnt256/cursor-swarm/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
— each one is scoped to exactly one file, or open a
**Behavior idea** issue to propose your own.

Questions? Open an issue and ask. There are no silly questions here. 💛
