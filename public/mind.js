// Mind feedback: speaking, listening, memory, learning, prediction and adaptation. Pure logic, no DOM.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---- Speaking: hear your own voice, raise it over noise (Lombard effect), strain it by shouting ----
export const voiceLevel = noise => (noise > 0.7 ? 'shout' : noise > 0.35 ? 'raised' : 'normal');
export class Voice {
  constructor() { this.strain = 0; }
  say(level) { this.strain = clamp(this.strain + (level === 'shout' ? 0.2 : level === 'raised' ? 0.05 : 0.01), 0, 1); }
  update(dt) { this.strain = clamp(this.strain - dt * 0.01, 0, 1); }
  get hoarse() { return this.strain > 0.6; }
  // pitch/volume of the sidetone the speaker hears
  tone(level) { return { f: (level === 'shout' ? 260 : level === 'raised' ? 220 : 180) * (this.hoarse ? 0.8 : 1), v: level === 'shout' ? 0.05 : 0.025 }; }
}

// ---- Listening: speech is understood less well with distance and background noise ----
export const intelligibility = (dist, noise = 0, level = 'normal') => {
  const reach = level === 'shout' ? 45 : level === 'raised' ? 32 : 22;
  return clamp(1 - dist / reach - noise * 0.4, 0, 1);
};
// Deterministically drop words the listener couldn't catch.
export function garble(text, q) {
  if (q >= 0.7) return text;
  return String(text).split(/\s+/).map((w, i) => ((i * 7 + w.length * 3) % 10) / 10 < q * 1.2 ? w : '…').join(' ');
}
export const heardAs = (text, q) => (q < 0.1 ? null : garble(text, q));

// ---- Memory: places where things happened, kept between visits ----
export class Memory {
  constructor(places = []) { this.places = places; }
  remember(kind, x, z, note = '') {
    const p = this.places.find(q => q.kind === kind && Math.hypot(q.x - x, q.z - z) < 4);
    if (p) { p.n++; p.x = (p.x + x) / 2; p.z = (p.z + z) / 2; if (note) p.note = note; } else this.places.push({ kind, x: +x.toFixed(1), z: +z.toFixed(1), n: 1, note });
    if (this.places.length > 40) this.places.sort((a, b) => b.n - a.n).length = 40;
  }
  recall(x, z, r = 5) {
    let best = null, bd = r;
    for (const p of this.places) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
    return best;
  }
}
const RECALL = {
  slip: 'You remember slipping around here. Careful.', burn: 'You burned yourself near here once. Keep clear.',
  zap: 'You got a static shock around here before.', crowd: 'It got crowded here last time.',
  food: p => `You remember ${p.note || 'the food'} here was good.`
};
export const recallText = p => (p ? (typeof RECALL[p.kind] === 'function' ? RECALL[p.kind](p) : RECALL[p.kind]) || null : null);
export const BAD = ['slip', 'burn', 'zap', 'crowd'];

// ---- Learning: repeated experiences build skill and preferences ----
export class Learning {
  constructor(counts = {}, flavors = {}) { this.counts = counts; this.flavors = flavors; }
  note(kind) { this.counts[kind] = (this.counts[kind] || 0) + 1; }
  level(kind) { return 1 - Math.exp(-(this.counts[kind] || 0) / 6); } // 0..1, flattens out
  taste(flavor) { this.flavors[flavor] = (this.flavors[flavor] || 0) + 1; }
  get favourite() { const e = Object.entries(this.flavors).sort((a, b) => b[1] - a[1])[0]; return e && e[1] >= 2 ? e[0] : ''; }
}

// ---- Prediction: where will people be in the next couple of seconds? ----
// Returns the soonest predicted close pass {t, who}, or null.
export function predictContact(me, vel, people, horizon = 2, gap = 1.1) {
  let best = null;
  for (const p of people) {
    const rx = p.x - me.x, rz = p.z - me.z, vx = (p.vx || 0) - vel.x, vz = (p.vz || 0) - vel.z;
    const vv = vx * vx + vz * vz;
    if (vv < 0.05) continue;
    const t = clamp(-(rx * vx + rz * vz) / vv, 0, horizon);
    if (Math.hypot(rx + vx * t, rz + vz * t) < gap && (rx * vx + rz * vz) < 0 && (!best || t < best.t)) best = { t: +t.toFixed(2), who: p.name };
  }
  return best;
}
export const secondsToWinded = (stamina, drainPerSec) => (drainPerSec > 0 ? Math.max(0, (stamina - 0) / drainPerSec) : Infinity);
export const forecast = ({ trend = 'steady', weather = 'clear' }) => (trend === 'falling' && weather === 'clear' ? 'Pressure is falling: rain is likely soon.' : trend === 'rising' && weather === 'rain' ? 'Pressure is rising: the rain should clear.' : '');

// ---- Adaptation: pick a more careful or bolder pace from conditions and experience ----
// Returns a speed multiplier (0.8 cautious .. 1 normal).
export function adaptPace({ slipSkill = 0, recentSlips = 0, rain = false, night = false, pain = 0, crowd = 0 }) {
  const worry = clamp(recentSlips * 0.12 + (rain ? 0.08 : 0) + (night ? 0.06 : 0) + pain * 0.1 + crowd * 0.01, 0, 0.3);
  return +(1 - worry * (1 - slipSkill * 0.5)).toFixed(2); // experience makes you less jumpy
}
export const strategyOf = mul => (mul < 0.88 ? 'cautious' : mul < 0.97 ? 'careful' : 'confident');
// Fewer recent slips as time passes.
export const decaySlips = (n, dt) => Math.max(0, n - dt / 60);
