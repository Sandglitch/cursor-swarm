/*
 * Behavior: Chase
 * Author: anhnt256
 * The classic: every dot homes in on your cursor and slows down
 * as it arrives, so the swarm piles up in a soft buzzing cloud.
 */
window.SwarmRegistry.registerBehavior({
  id: 'chase',
  name: 'Chase',
  author: 'anhnt256',

  update: function (b, ctx) {
    var p = ctx.pointer;
    var dx = p.x - b.x;
    var dy = p.y - b.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;

    /* Arrive steering: full force far away, gentle when close. */
    var strength = Math.min(dist / 120, 1) * 0.16;
    b.vx += (dx / dist) * strength;
    b.vy += (dy / dist) * strength;

    /* A whisper of jitter keeps the pile alive instead of frozen. */
    b.vx += (Math.random() - 0.5) * 0.05;
    b.vy += (Math.random() - 0.5) * 0.05;
  }
});
