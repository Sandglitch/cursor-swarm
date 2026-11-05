/*
 * Behavior: Vortex
 * Author: anhnt256
 * Dots spiral into your cursor like water down a drain,
 * then respawn at the edge of the swirl so it never runs out.
 */
window.SwarmRegistry.registerBehavior({
  id: 'vortex',
  name: 'Vortex',
  author: 'anhnt256',

  update: function (b, ctx) {
    var p = ctx.pointer;
    var dx = p.x - b.x;
    var dy = p.y - b.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = dx / dist, ny = dy / dist;        // unit vector toward pointer

    /* Strong tangential spin + gentle inward pull. */
    b.vx += (-ny) * 0.28 + nx * 0.045;
    b.vy += (nx) * 0.28 + ny * 0.045;

    /* Swallowed by the center? Respawn on a wide ring around the pointer. */
    if (dist < 14) {
      var angle = Math.random() * Math.PI * 2;
      var radius = 260 + Math.random() * 160;
      b.x = p.x + Math.cos(angle) * radius;
      b.y = p.y + Math.sin(angle) * radius;
      b.vx = 0;
      b.vy = 0;
    }
  }
});
