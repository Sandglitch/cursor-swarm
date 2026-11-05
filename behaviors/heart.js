/*
 * Behavior: Heart
 * Author: anhnt256
 * The swarm settles into a heart-shaped formation around your cursor.
 * Each dot owns one point on a parametric heart curve, chosen by index.
 */
window.SwarmRegistry.registerBehavior({
  id: 'heart',
  name: 'Heart',
  author: 'anhnt256',

  update: function (b, ctx) {
    var p = ctx.pointer;

    /* This dot's personal spot on the heart curve. */
    var a = (ctx.index / ctx.count) * Math.PI * 2;
    var hx = 16 * Math.pow(Math.sin(a), 3);
    var hy = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);

    var scale = 9 + Math.sin(ctx.time * 1.6) * 0.7;   // soft heartbeat pulse
    var tx = p.x + hx * scale;
    var ty = p.y - hy * scale;                        // flip Y: screen coords

    /* Spring toward the target spot. */
    b.vx += (tx - b.x) * 0.012;
    b.vy += (ty - b.y) * 0.012;
  }
});
