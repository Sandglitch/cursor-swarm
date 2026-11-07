/*
 * Behavior: Gravity Well
 * Author: Sandglitch
 * While the mouse is held, a strong gravity well pulls every dot
 * spiraling into the click point; release and they scatter.
 */
window.SwarmRegistry.registerBehavior({
  id: 'gravity_well',
  name: 'Gravity Well',
  author: 'Sandglitch',

  update: function (b, ctx) {
    var p = ctx.pointer;
    var dx = p.x - b.x;
    var dy = p.y - b.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = dx / dist;
    var ny = dy / dist;

    var isDown = !!(p && p.down);
    var mult = isDown ? 3.5 : 1.0;

    /* Combine the inward pull of Chase with the tangential spin of Vortex */
    var pull = (isDown ? 0.35 : Math.min(dist / 120, 1) * 0.14) * mult;
    var spin = isDown ? 0.60 : 0.22;

    /* Apply Chase pull toward the pointer */
    b.vx += nx * pull;
    b.vy += ny * pull;

    /* Apply Vortex spin around the pointer */
    b.vx += (-ny) * spin;
    b.vy += nx * spin;

    /* Subtle jitter keeps the dots alive */
    b.vx += (Math.random() - 0.5) * 0.04;
    b.vy += (Math.random() - 0.5) * 0.04;
  }
});

