/*
 * Behavior: Orbit
 * Author: anhnt256
 * The swarm circles your cursor like a tiny solar system.
 * Each dot aims for its own ring around the pointer and moves tangentially.
 */
window.SwarmRegistry.registerBehavior({
  id: 'orbit',
  name: 'Orbit',
  author: 'anhnt256',

  update: function (b, ctx) {
    var p = ctx.pointer;
    var dx = b.x - p.x;
    var dy = b.y - p.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;

    /* Each dot owns a ring radius based on its index. */
    var ring = 40 + (ctx.index % 90);
    var radial = (dist - ring) * 0.0022;      // pull in / push out to reach the ring
    var tangent = 0.55;                        // sideways push = the circling motion

    var nx = dx / dist, ny = dy / dist;        // unit vector away from pointer
    b.vx += nx * radial * dist * 0.06 + (-ny) * tangent * 0.12;
    b.vy += ny * radial * dist * 0.06 + (nx) * tangent * 0.12;
  }
});
