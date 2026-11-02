// The avatar's senses: touch, hearing, vision, smell, taste and equilibrium.
// Pure helpers (no DOM/Three) so they can be unit tested; main.js wires them into the scene.
import { heightAt } from './terrain.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---- Sensory spots (shared layout) ----
export const SPOTS = [
  { id: 'popcorn', name: 'popcorn stand', x: 14, z: 22, smell: 'buttery popcorn', pleasant: 1, radius: 14, flavor: 'salty' },
  { id: 'candy', name: 'candy cart', x: -14, z: 24, smell: 'sweet spun sugar', pleasant: 1, radius: 12, flavor: 'sweet' },
  { id: 'lemonade', name: 'lemonade stand', x: 20, z: 34, smell: 'fresh lemons', pleasant: 1, radius: 10, flavor: 'sour' },
  { id: 'grill', name: 'chili grill', x: -34, z: -26, smell: 'smoky chili', pleasant: 0.4, radius: 14, flavor: 'spicy', surface: 'hot' },
  { id: 'icecart', name: 'ice cart', x: -38, z: -34, smell: 'cold vanilla', pleasant: 0.8, radius: 8, flavor: 'cold', surface: 'cold' }
];

// ---- Smell: strongest odour at a point (spots plus nearby litter/spills) ----
export function smellAt(x, z, litter = []) {
  let best = null;
  const consider = (name, pleasant, d, radius) => {
    if (d > radius) return;
    const strength = 1 - d / radius;
    if (!best || strength > best.strength) best = { name, pleasant, strength };
  };
  for (const s of SPOTS) consider(s.smell, s.pleasant, Math.hypot(s.x - x, s.z - z), s.radius);
  for (const l of litter) consider(l.spill ? 'stale spilled drink' : 'rubbish', 0, Math.hypot(l.x - x, l.z - z), l.spill ? 5 : 4);
  return best;
}
// Pleasant smells lift the mood, foul ones make the avatar wrinkle its nose.
export const smellReaction = o => (!o || o.strength < 0.35 ? null : o.pleasant >= 0.7 ? { mood: 'happy', emote: 'belly' } : o.pleasant < 0.3 ? { mood: 'sad', emote: 'shrug' } : null);

// ---- Taste ----
export const FLAVORS = {
  salty: { text: 'Salty and buttery. Delicious!', mood: 'happy', emote: 'belly', thirst: 6 },
  sweet: { text: 'Sweet! Pure sugar rush.', mood: 'excited', emote: 'cheer', energy: 12 },
  sour: { text: 'Sour! Your face scrunches up.', mood: 'surprised', emote: 'shrug', thirst: -10 },
  spicy: { text: 'Spicy! Your mouth is on fire.', mood: 'surprised', emote: 'shrug', heat: 1 },
  cold: { text: 'Cold and creamy. Refreshing.', mood: 'happy', emote: 'belly', cool: 1 }
};
export const nearestSpot = (x, z, within = 3) => {
  let best = null, bd = within;
  for (const s of SPOTS) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
  return best;
};

// ---- Touch: what an object feels like (texture, pressure from weight, temperature) ----
export function touchOf(weightKg, ambient = 'mild') {
  const texture = weightKg >= 40 ? 'rough, splintery planks' : weightKg >= 15 ? 'coarse cardboard' : 'smooth, light cardboard';
  const pressure = weightKg >= 40 ? 'heavy, digging into your arms' : weightKg >= 15 ? 'a firm weight' : 'light';
  const temp = ambient === 'hot' ? 'warm from the sun' : ambient === 'cold' ? 'cold to the touch' : 'room temperature';
  return { texture, pressure, temp, text: `Feels ${texture}; ${pressure}; ${temp}.` };
}
// Hot/cold surfaces: touching a hot grill hurts, cold surfaces only chill.
export const surfaceTouch = spot => (!spot || !spot.surface ? null : spot.surface === 'hot' ? { text: 'Ouch! The grill is hot!', pain: true } : { text: 'Brr, the ice cart is freezing cold.', pain: false });

// ---- Hearing ----
// Loudness at a listener from sources {x,z,level(0-1),kind}. Returns total and the loudest source.
export function hearing(x, z, sources, { rain = false, covered = false } = {}) {
  let total = rain ? 0.1 : 0, loud = null;
  for (const s of sources) {
    const d = Math.max(1, Math.hypot(s.x - x, s.z - z));
    const v = (s.level / (1 + d * d * 0.02)) * (covered ? 0.4 : 1);
    total += v;
    if (!loud || v > loud.v) loud = { ...s, v, d };
  }
  return { total: clamp(total, 0, 1), loud: loud && loud.v > 0.12 ? loud : null };
}
// Pan (-1 left..1 right) of a source relative to the listener facing `ry` (three.js yaw).
export function panOf(x, z, ry, sx, sz) {
  const a = Math.atan2(sx - x, sz - z) - ry;
  return Math.sin(Math.atan2(Math.sin(a), Math.cos(a)));
}

// ---- Vision ----
// How far and how wide the avatar sees. Night, rain and a lite-quality renderer shorten range.
export const visionRange = ({ night = false, rain = false } = {}) => (night ? 16 : 40) * (rain ? 0.7 : 1);
export function canSee(x, z, ry, tx, tz, range, fov = 2.2) {
  const d = Math.hypot(tx - x, tz - z);
  if (d < 2) return true; // peripheral awareness when very close
  if (d > range) return false;
  let a = Math.atan2(tx - x, tz - z) - ry;
  a = Math.atan2(Math.sin(a), Math.cos(a));
  return Math.abs(a) < fov / 2;
}
// Something approaching from behind within a few metres makes the avatar glance round.
export const glanceBehind = (x, z, ry, tx, tz) => {
  const d = Math.hypot(tx - x, tz - z);
  if (d > 3.5 || d < 0.5) return 0;
  let a = Math.atan2(tx - x, tz - z) - ry; a = Math.atan2(Math.sin(a), Math.cos(a));
  return Math.abs(a) > 1.6 ? clamp(a, -1.2, 1.2) : 0;
};

// ---- Equilibrium (vestibular) ----
// Spinning quickly builds dizziness that fades when you stand still; it lowers stability.
export class Vestibular {
  constructor() { this.dizzy = 0; this.prev = null; }
  update(dt, yaw, camYaw, grounded = true) {
    const turn = this.prev ? Math.abs(Math.atan2(Math.sin(yaw - this.prev.yaw), Math.cos(yaw - this.prev.yaw))) + Math.abs(camYaw - this.prev.cam) : 0;
    this.prev = { yaw, cam: camYaw };
    const rate = dt > 0 ? turn / dt : 0;
    if (rate > 4) this.dizzy += (rate - 4) * dt * 0.3;
    this.dizzy = clamp(this.dizzy - dt * (grounded ? 0.12 : 0.02), 0, 1);
    return this.dizzy;
  }
  // stability penalty and the visual wobble amount
  get penalty() { return this.dizzy * 0.45; }
}
// Standing on a slope with eyes on the horizon (looking forward) keeps balance; ground tilt in degrees for display.
export const tiltDeg = (x, z, ry) => Math.round(Math.atan((heightAt(x + Math.sin(ry) * 0.5, z + Math.cos(ry) * 0.5) - heightAt(x, z)) / 0.5) * 57.3);
