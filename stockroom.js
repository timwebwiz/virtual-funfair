// Pushable / liftable crates, a delivery pad puzzle, and staff who tidy stray crates.
// Server-authoritative; strength decides what a player can move. Staff can lift anything.
import { blockedPoint } from './nav.js';

const START = [
  { x: 8, z: 22, w: 8 }, { x: 12, z: 24, w: 8 }, { x: -10, z: 26, w: 20 },
  { x: -14, z: 28, w: 20 }, { x: 4, z: 30, w: 45 }, { x: 16, z: -14, w: 8 }
];
export const PAD = { x: -22, z: 34, r: 2.2, need: 3 };
const LIM = 75;
export const CRATE_R = 0.55;
export const onPad = c => Math.abs(c.x - PAD.x) < PAD.r && Math.abs(c.z - PAD.z) < PAD.r;

export class Crates {
  constructor() { this.list = START.map((c, i) => ({ id: i + 1, ...c, hx: c.x, hz: c.z, by: null, idle: 0, last: null })); }
  snapshot() { return this.list.map(c => ({ id: c.id, x: c.x, z: c.z, w: c.w, by: c.by })); }
  get(id) { return this.list.find(c => c.id === id); }
  loose() { return this.list.filter(c => c.by == null); }

  // a player pushes a crate to a new spot (validated against distance, obstacles and bounds)
  push(p, id, x, z) {
    const c = this.get(id);
    if (!c || c.by != null || ![x, z].every(Number.isFinite)) return null;
    if (Math.abs(x) > LIM || Math.abs(z) > LIM) return null;
    if (Math.hypot(p.x - c.x, p.z - c.z) > 3 || Math.hypot(x - c.x, z - c.z) > 2) return null;
    if (blockedPoint(x, z, 0.6)) return null;
    c.x = x; c.z = z; c.idle = 0; c.last = p.id; c.padT = Date.now();
    return c;
  }

  // returns {crate} on success or {err} with a message
  grab(p) {
    if (this.list.some(c => c.by === p.id)) return { err: 'You are already carrying a crate.' };
    let best = null, bd = 2.2;
    for (const c of this.list) { const d = Math.hypot(p.x - c.x, p.z - c.z); if (c.by == null && d < bd) { best = c; bd = d; } }
    if (!best) return { err: 'No crate within reach.' };
    const max = (p.avatar?.strength || 5) * 5;
    if (best.w > max) return { err: `That crate weighs ${best.w} kg. You can lift about ${max} kg.` };
    if (p.hurt) return { err: 'You are too hurt to lift anything.' };
    best.by = p.id; best.idle = 0; best.last = p.id;
    return { crate: best };
  }

  drop(p) {
    const c = this.list.find(k => k.by === p.id);
    if (!c) return null;
    c.by = null; c.idle = 0; c.padT = Date.now();
    const fx = Math.sin(p.ry || 0), fz = Math.cos(p.ry || 0);
    for (const d of [0.9, 0.5, 0]) {
      const x = p.x + fx * d, z = p.z + fz * d;
      if (!blockedPoint(x, z, 0.6)) { c.x = x; c.z = z; return c; }
    }
    c.x = p.x; c.z = p.z;
    return c;
  }
}

export const crateMethods = {
  crateTick(dt) {
    const cr = this.crates;
    for (const c of cr.list) {
      if (typeof c.by === 'string') { // carried by staff: follow them, or drop if they left
        const n = this.npcs.find(m => 'n' + m.id === c.by);
        if (n) { c.x = n.x; c.z = n.z; } else { c.by = null; this.emit({ t: 'carry', id: c.id, by: null, x: c.x, z: c.z }); }
      } else if (c.by == null) c.idle += dt;
    }
    // delivery pad: bring enough crates and the stockroom is complete
    const on = cr.list.filter(c => c.by == null && onPad(c));
    if (on.length >= PAD.need) {
      const last = [...on].sort((a, b) => b.padT - a.padT)[0], who = [...this.players.values()].find(p => p.id === last.last);
      this.radio('Park Management', `Stockroom delivery complete${who ? ', thanks ' + who.name : ''}! Crates are being restocked.`);
      if (who) this.emit({ t: 'bonus', id: who.id, xp: 120, text: 'Stockroom delivery complete! +2 min of experience.' });
      for (const c of on) { c.x = c.hx; c.z = c.hz; c.idle = 0; this.emit({ t: 'crate', id: c.id, x: c.x, z: c.z }); }
    }
  },

  // crew members move stray crates back to their stockroom spots
  // (never ones a player just touched or left on the pad)
  haulStep(n) {
    const cr = this.crates;
    if (n.state === 'haul') {
      const c = cr.get(n.haulId);
      if (!c || c.by !== 'n' + n.id) { n.haulId = null; n.state = 'idle'; n.wait = 0.5; return true; }
      this.goTo(n, c.hx, c.hz, c.id);
      if (this.reached(n, { x: c.hx, z: c.hz }, 1.6)) {
        c.by = null; c.x = c.hx; c.z = c.hz; c.idle = 0; n.haulId = null; n.state = 'idle'; n.wait = 1;
        this.emit({ t: 'carry', id: c.id, by: null, x: c.x, z: c.z });
        this.speak(n, 'Back where it belongs.');
      }
      return true;
    }
    if (n.state === 'fetch') {
      const c = cr.get(n.haulId);
      if (!c || c.by != null || c.idle < 5) { n.haulId = null; n.state = 'idle'; n.wait = 0.5; return false; }
      this.goTo(n, c.x, c.z, c.id);
      if (this.reached(n, c, 2.4)) {
        c.by = 'n' + n.id; n.state = 'haul'; n.arrived = false; n.goalX = undefined;
        this.emit({ t: 'carry', id: c.id, by: c.by, w: c.w });
        this.speak(n, c.w > 25 ? 'Heavy one! Using the hand truck.' : 'Let me tidy this crate away.');
      }
      return true;
    }
    return false;
  },

  // called when a cleaner is free: returns true if it picked a crate to fetch
  findStray(n) {
    const claimed = new Set(this.npcs.filter(m => m.haulId).map(m => m.haulId));
    let best = null, bd = 1e9;
    for (const c of this.crates.loose()) {
      if (claimed.has(c.id) || c.idle < 12 || onPad(c) || Math.hypot(c.x - c.hx, c.z - c.hz) < 1.5) continue;
      const d = Math.hypot(c.x - n.x, c.z - n.z); if (d < bd) { bd = d; best = c; }
    }
    if (!best) return false;
    n.haulId = best.id; n.state = 'fetch'; n.arrived = false; n.goalX = undefined;
    this.radio(n.name, `Moving a stray crate back to the stockroom near ${this.place(best.x, best.z)}.`);
    return true;
  }
};
