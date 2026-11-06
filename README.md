# 🌀 Cursor Swarm

**A tiny swarm of glowing dots that follows your cursor around the screen — on a demo page that builds itself as you scroll — and you can teach it a new trick in 15 minutes.**

▶️ **Live demo: https://anhnt256.github.io/cursor-swarm/**

![Pure vanilla JS](https://img.shields.io/badge/vanilla-JS-yellow) ![No build step](https://img.shields.io/badge/build-none-brightgreen) ![PRs welcome](https://img.shields.io/badge/PRs-welcome-ff69b4)

## What is this?

Cursor Swarm is a playful interactive web toy: hundreds of glowing dots
(a boid swarm) flow, orbit, spiral and even form a heart around your mouse
pointer. The swarm hovers behind the page as a soft ambient glow while you
read, and comes to full strength in the playground section, where you can
switch behaviors and color skins, drag the slider to add more dots, and
just play.

And the demo page itself is part of the toy: **it builds itself as you
scroll.** Five tiny AI cursors — Míp, Nova, Pixel, Comet and Pip — fly around each
section as it comes into view: one types the headings character by
character while the others drop the cards, buttons and code blocks into
place, narrating their work in a little build log at the bottom of the
screen. Every section on the page was placed by a cursor, working
alongside the others.

It is also an experiment in friendly open source: **almost everything fun
about this project is meant to be added by contributors**, one tiny file
at a time. If you have never opened a pull request before, this repo is
designed to be your first one. 💛

## How it works

- Pure vanilla HTML/CSS/JS. **No build step, no dependencies.** Open
  `index.html` in a browser and it runs. It also works as-is on GitHub Pages.
- `src/engine.js` runs the canvas, the dot physics (velocity, speed cap,
  pointer tracking) and the control bar.
- `src/build.js` runs the five builder cursors that assemble the demo
  page section by section as you scroll (and quietly shows everything at
  once if you prefer reduced motion). The Behaviors and Skins sections of
  the page are generated live from the registry — add a file, and your
  card appears on the page automatically.
- A **behavior** is one small file in `behaviors/` that tells the swarm
  how to move. A **skin** is one small file in `skins/` with a color
  palette and dot style.
- `contributions.json` is the manifest: the engine loads every file
  listed there, and each file registers itself with the engine.
- A contribution = **add 1 file + add 1 line to `contributions.json`.**
  That's the whole trick — contributions almost never conflict.

## Contribute in 15 minutes

You can add a brand-new behavior (fireworks! a snake trail! dots that
spell "HI"!) or a new skin (ocean, lava, matrix green…) in about
15 minutes, even if this is your very first pull request.

👉 Follow the step-by-step guide in **[CONTRIBUTING.md](CONTRIBUTING.md)** —
it has copy-paste templates for both kinds of contribution.

Looking for an idea? Check the
[good first issues](https://github.com/anhnt256/cursor-swarm/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

## Project layout

```
index.html          the demo page (builds itself as you scroll)
style.css           page styling
src/engine.js       canvas engine + registry + loader
src/build.js        the builder cursors that assemble the page
behaviors/          one file per swarm behavior   ← your PR goes here
skins/              one file per color skin        ← …or here
contributions.json  manifest of behaviors & skins (add 1 line)
```

## Contributors

Every behavior and skin in the control bar is credited to its author.
Thank you to everyone who teaches the swarm a new trick! 🙌

| Contributor | Contribution |
|---|---|
| [@anhnt256](https://github.com/anhnt256) | Engine + Orbit, Vortex, Chase, Wave, Heart behaviors + Neon, Sunset, Candy, Mono skins |
| [@faithfull-3](https://github.com/faithfull-3) | Matrix skin — the first community contribution 🎉 |
| *You could be next!* | *Your behavior or skin here — see [CONTRIBUTING.md](CONTRIBUTING.md)* |

## License

MIT — see [LICENSE](LICENSE). Have fun, remix freely.
