// Pushable / liftable crates. Server-authoritative; strength decides what a player can move.
import { blockedPoint } from './nav.js';

const START = [
  { x: 8, z: 22, w: 8 }, { x: 12, z: 24, w: 8 }, { x: -10, z: 26, w: 20 },
  { x: -14, z: 28, w: 20 }, { x: 4, z: 30, w: 45 }, { x: 16, z: -14, w: 8 }
];
const LIM = 75;

export class Crates {
  constructor() { this.list = START.map((c, i) => ({ id: i + 1, ...c, by: null })); }
  snapshot() { return this.list.map(c => ({ id: c.id, x: c.x, z: c.z, w: c.w, by: c.by })); }
  get(id) { return this.list.find(c => c.id === id); }

  // a player pushes a crate to a new spot (validated against distance, obstacles and bounds)
  push(p, id, x, z) {
    const c = this.get(id);
    if (!c || c.by || ![x, z].every(Number.isFinite)) return null;
    if (Math.abs(x) > LIM || Math.abs(z) > LIM) return null;
    if (Math.hypot(p.x - c.x, p.z - c.z) > 3 || Math.hypot(x - c.x, z - c.z) > 2) return null;
    if (blockedPoint(x, z, 0.6)) return null;
    c.x = x; c.z = z;
    return c;
  }

  // returns {crate} on success or {err} with a message
  grab(p) {
    if (this.list.some(c => c.by === p.id)) return { err: 'You are already carrying a crate.' };
    let best = null, bd = 2.2;
    for (const c of this.list) { const d = Math.hypot(p.x - c.x, p.z - c.z); if (!c.by && d < bd) { best = c; bd = d; } }
    if (!best) return { err: 'No crate within reach.' };
    const max = (p.avatar?.strength || 5) * 5;
    if (best.w > max) return { err: `That crate weighs ${best.w} kg. You can lift about ${max} kg.` };
    if (p.hurt) return { err: 'You are too hurt to lift anything.' };
    best.by = p.id;
    return { crate: best };
  }

  drop(p) {
    const c = this.list.find(k => k.by === p.id);
    if (!c) return null;
    c.by = null;
    const fx = Math.sin(p.ry || 0), fz = Math.cos(p.ry || 0);
    for (const d of [0.9, 0.5, 0]) {
      const x = p.x + fx * d, z = p.z + fz * d;
      if (!blockedPoint(x, z, 0.6)) { c.x = x; c.z = z; return c; }
    }
    c.x = p.x; c.z = p.z;
    return c;
  }
}
