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

// ---- Sensory feedback: reactions the body shows (and others can see) ----
export const REACTIONS = ['ears', 'nose', 'sniff', 'fan', 'pucker', 'chew', 'squint', 'startle', 'burn'];
export const FLAVOR_REACTION = { salty: 'chew', sweet: 'chew', sour: 'pucker', spicy: 'fan', cold: 'chew' };
// Pick a reaction from what the senses currently report (null = none).
export function pickReaction({ loud = 0, siren = false, smell = null, burn = false, rain = false, night = false, moving = false }) {
  if (burn) return { r: 'burn', ms: 1400 };
  if (siren) return { r: 'startle', ms: 1200 };
  if (loud > 0.85) return { r: 'ears', ms: 2000 };
  if (smell && smell.strength > 0.5 && smell.pleasant < 0.3) return { r: 'nose', ms: 2200 };
  if (smell && smell.strength > 0.5 && smell.pleasant >= 0.7) return { r: 'sniff', ms: 1500 };
  if ((rain || night) && moving) return { r: 'squint', ms: 600 };
  return null;
}

// ---- Proprioception: the body senses its own pose and corrects it ----
// Wider stance and arm counterbalance when unstable, lean back against a carried load,
// and lean into turns. Returns offsets that animateAvatar blends into the pose.
export function proprio({ stab = 1, slope = 0, loadRatio = 0, turnRate = 0, speed = 0 }) {
  const wobble = clamp(1 - stab, 0, 1);
  return {
    stance: clamp(wobble * 0.7 + Math.abs(slope) * 0.5, 0, 0.5),   // leg splay (rad each side)
    counter: -clamp(loadRatio, 0, 1) * 0.18,                       // lean back against a load
    roll: clamp(-turnRate * speed * 0.012, -0.22, 0.22),           // lean into a turn
    armSpread: wobble * 0.5
  };
}
// ---- Vestibular head control: the head counter-rotates against body motion to keep gaze level ----
export function headStabilise({ lean = 0, roll = 0, dizzy = 0, t = 0 }) {
  const k = 1 - clamp(dizzy, 0, 1) * 0.8; // dizziness weakens the reflex
  return { hx: -lean * 0.6 * k + Math.sin(t * 3.1) * dizzy * 0.12, hz: -roll * 0.7 * k + Math.sin(t * 2.3) * dizzy * 0.1 };
}
// Haptic pattern (ms) for a touch device; heavier objects buzz longer.
export const hapticFor = (kind, weightKg = 0) => ({ lift: [Math.min(120, 30 + weightKg * 1.5)], burn: [60, 40, 90], stumble: [40, 30, 40], siren: [200, 100, 200], taste: [25] }[kind] || [20]);
