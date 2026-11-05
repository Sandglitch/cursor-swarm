/*
 * Behavior: Wave
 * Author: anhnt256
 * The swarm rides a slow sine-wave flow field across the screen,
 * while your cursor gently bends the current toward itself.
 */
window.SwarmRegistry.registerBehavior({
  id: 'wave',
  name: 'Wave',
  author: 'anhnt256',

  update: function (b, ctx) {
    var t = ctx.time;

    /* Flow field: two overlapping sine waves. */
    var flowX = Math.cos(b.y * 0.012 + t * 0.7);
    var flowY = Math.sin(b.x * 0.012 - t * 0.5);
    b.vx += flowX * 0.055;
    b.vy += flowY * 0.055;

    /* Gentle attraction so the wave still gathers around the pointer. */
    var p = ctx.pointer;
    var dx = p.x - b.x;
    var dy = p.y - b.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    b.vx += (dx / dist) * 0.03;
    b.vy += (dy / dist) * 0.03;
  }
});
