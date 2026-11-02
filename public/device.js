// Technological adaptation: detects how the player is playing and tunes controls, hints and performance.
const mq = q => typeof matchMedia === 'function' && matchMedia(q).matches;

export function detectDevice() {
  const conn = navigator.connection || {};
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return {
    kind: touch && mq('(pointer: coarse)') ? 'touch' : 'keyboard',
    reduceMotion: mq('(prefers-reduced-motion: reduce)'),
    slowNet: !!conn.saveData || /(^|-)(2g|3g)$/.test(conn.effectiveType || ''),
    lowEnd: (navigator.deviceMemory || 8) <= 2 || (navigator.hardwareConcurrency || 8) <= 2,
    small: Math.min(innerWidth, innerHeight) < 500
  };
}

// Gamepad (standard mapping): left stick moves, right stick turns the camera,
// A jumps, B lifts/drops, X waves, RT/R1 sprints, Y opens the emote bar.
const edges = {};
const pressed = (pad, i, name) => { const v = !!(pad.buttons[i] && pad.buttons[i].pressed), was = edges[name]; edges[name] = v; return v && !was; };
export function pollGamepad() {
  const pad = (navigator.getGamepads ? [...navigator.getGamepads()] : []).find(Boolean);
  if (!pad) return null;
  const dz = v => (Math.abs(v) < 0.18 ? 0 : v);
  return {
    x: dz(pad.axes[0] || 0), y: dz(pad.axes[1] || 0), cam: dz(pad.axes[2] || 0),
    sprint: !!(pad.buttons[7] && pad.buttons[7].pressed) || !!(pad.buttons[5] && pad.buttons[5].pressed),
    jump: pressed(pad, 0, 'a'), grab: pressed(pad, 1, 'b'), wave: pressed(pad, 2, 'x'), emotes: pressed(pad, 3, 'y')
  };
}

// Samples frame rate and recommends a quality level (0 full, 1 reduced, 2 minimal). Never raises it again, to avoid flapping.
export class QualityGovernor {
  constructor(start = 0) { this.level = start; this.t = 0; this.n = 0; this.warm = 3; }
  sample(dt) {
    if ((this.warm -= dt) > 0) return null;
    this.t += dt; this.n++;
    if (this.t < 3) return null;
    const fps = this.n / this.t; this.t = 0; this.n = 0;
    if (fps < 24 && this.level < 2) { this.level++; return this.level; }
    return null;
  }
}
