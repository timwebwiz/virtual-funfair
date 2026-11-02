// Body & environment feedback: interoception, pain, climate (temperature / humidity / pressure),
// vibration, magnetic and electric fields, and kinesthetic limb awareness. Pure logic, no DOM.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Powered machinery that vibrates and disturbs magnetic / electric fields while it runs.
export const MACHINES = [
  { name: 'ferris wheel', x: -30, z: -30, fault: 0 },
  { name: 'carousel', x: 30, z: -20, fault: 1 }
];
const running = (m, faults) => !(faults && faults[m.fault]);

// ---- Climate ----
export function climate(clockMin, weather) {
  const day = Math.cos(((clockMin - 900) / 1440) * Math.PI * 2); // warmest at 15:00
  const rain = weather === 'rain';
  const hotSpell = !rain && clockMin > 660 && clockMin < 1020 ? 5 : 0;
  const night = clockMin < 360 || clockMin > 1260 ? -3 : 0;
  const tempC = Math.round(17 + 8 * day + hotSpell + night - (rain ? 4 : 0));
  const humidity = Math.round(clamp(62 - 22 * day + (rain ? 25 : 0), 15, 98));
  const pressure = 1013 + 3 * Math.sin((clockMin / 1440) * Math.PI * 2) - (rain ? 14 : 0);
  return { tempC, humidity, pressure };
}
// Atmospheric pressure eases toward its target, so a front shows up as a falling/rising trend.
export function easePressure(cur, target, dt) {
  const step = 0.25 * dt;
  return Math.abs(target - cur) <= step ? target : cur + Math.sign(target - cur) * step;
}
export const pressureTrend = (cur, target) => (target - cur < -0.5 ? 'falling' : target - cur > 0.5 ? 'rising' : 'steady');

// ---- Interoception (hunger, thirst), pain, static charge ----
export const FOOD = {
  salty: { h: -0.3, t: 0.12 }, sweet: { h: -0.3, t: 0.05 }, sour: { h: -0.1, t: -0.3 },
  spicy: { h: -0.25, t: 0.15 }, cold: { h: -0.1, t: -0.35 }
};

export class Body {
  constructor() { this.hunger = 0.1; this.thirst = 0.1; this.pain = 0; this.charge = 0; }
  update(dt, { moving = false, sprinting = false, tempC = 18, humidity = 50, hurt = false, field = 0 } = {}) {
    this.hunger = clamp(this.hunger + (dt / 600) * (1 + (sprinting ? 0.6 : 0)), 0, 1);
    this.thirst = clamp(this.thirst + (dt / 420) * (1 + (tempC >= 26 ? 0.8 : 0) + (sprinting ? 0.5 : 0)), 0, 1);
    this.pain = clamp(this.pain - dt * 0.05, hurt ? 0.5 : 0, 1);
    // static builds up when walking in dry air or near charged machinery, and leaks away in damp air
    const dry = humidity < 45 ? (45 - humidity) / 45 : 0;
    this.charge = clamp(this.charge + (moving ? dt * 0.03 * (1 + dry * 2) * (sprinting ? 2 : 1) * (humidity < 60 ? 1 : 0) : 0) + field * dt * 0.1 - (humidity > 70 ? dt * 0.1 : dt * 0.01), 0, 1);
  }
  eat(flavor) { const f = FOOD[flavor]; if (f) { this.hunger = clamp(this.hunger + f.h, 0, 1); this.thirst = clamp(this.thirst + f.t, 0, 1); } }
  hurt(v) { this.pain = clamp(this.pain + v, 0, 1); }
  // a touch of metal or a crate releases static; returns the shock strength (0 if none)
  discharge() { if (this.charge < 0.5) return 0; const s = this.charge; this.charge = 0; return s; }
  // slowdown and faster stamina drain caused by hunger, thirst and pain
  get drainMul() { return 1 + Math.max(0, this.hunger - 0.6) + Math.max(0, this.thirst - 0.6); }
  get speedMul() { return 1 - 0.35 * this.pain; }
}

// ---- Vibration: running machinery rumbles underfoot; a major fault shakes hard ----
export function vibrationAt(x, z, faults = [0, 0], range = 12) {
  let best = { level: 0, src: '' };
  for (const m of MACHINES) {
    const d = Math.hypot(x - m.x, z - m.z);
    if (d >= range) continue;
    const major = faults[m.fault] === 2;
    const l = major ? 1 - d / range : running(m, faults) ? 0.6 * (1 - d / range) ** 2 : 0;
    if (l > best.level) best = { level: +l.toFixed(2), src: m.name + (major ? ' (fault)' : '') };
  }
  return best;
}

// ---- Magnetic compass and electric field: machinery distorts both ----
export function fieldAt(x, z, faults = [0, 0], { storm = false } = {}) {
  let v = storm ? 0.4 : 0;
  for (const m of MACHINES) {
    const d = Math.hypot(x - m.x, z - m.z);
    if (running(m, faults) && d < 14) v = Math.max(v, 1 - d / 14);
  }
  return +clamp(v, 0, 1).toFixed(2);
}
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
// Facing ry (radians, 0 = +z) -> compass reading. Strong fields swing the needle.
export function compass(ry, distortion = 0, t = 0) {
  const deg = ((((-ry * 180) / Math.PI + distortion * 70 * Math.sin(t * 3)) % 360) + 360) % 360;
  return { deg: Math.round(deg), dir: DIRS[Math.round(deg / 45) % 8], disturbed: distortion > 0.3 };
}

// ---- Kinesthetic awareness: how the limbs feel (loose, ready, strained, heavy) ----
export function limbs({ moving = false, sprinting = false, load = 0, tired = 0, pain = 0, stab = 1 }) {
  const strain = clamp(load * 0.6 + tired * 0.5 + pain * 0.4 + (sprinting ? 0.2 : 0) + (1 - stab) * 0.2, 0, 1);
  const state = strain > 0.75 ? 'trembling' : strain > 0.5 ? 'strained' : load > 0.3 ? 'heavy' : moving ? 'ready' : 'relaxed';
  return { strain: +strain.toFixed(2), state, tremble: strain > 0.75 };
}

// ---- Notices: say something only when a state is first entered ----
export function bodyState({ body, c, trend, vib, field, hurt }) {
  return {
    hungry: body.hunger > 0.75, thirsty: body.thirst > 0.75,
    pain: body.pain > 0.6 ? 2 : body.pain > 0.25 ? 1 : 0,
    cold: c.tempC <= 8, hot: c.tempC >= 28, muggy: c.humidity >= 85 && c.tempC >= 22, dry: c.humidity <= 30,
    trend: trend !== 'steady' ? trend : '', shaking: vib.level > 0.5, field: field > 0.6, charged: body.charge > 0.7, hurt: !!hurt
  };
}
const NOTES = [
  ['hungry', 'Your stomach rumbles. Find a food stand.'], ['thirsty', 'You are thirsty. A cold drink would help.'],
  ['pain', s => (s.pain === 2 ? 'It really hurts. You are moving carefully.' : 'A dull ache. You slow down a little.')],
  ['cold', 'It is cold. You shiver.'], ['hot', 'It is hot. You start to sweat.'],
  ['muggy', 'The air is heavy and muggy.'], ['dry', 'The air is very dry. Static is building up.'],
  ['trend', s => (s.trend === 'falling' ? 'Your ears feel odd: pressure is dropping. Weather is changing.' : 'Pressure is rising. The weather is clearing.')],
  ['shaking', 'The ground rumbles under your feet.'], ['field', 'Your compass spins and your skin tingles near the machinery.'],
  ['charged', 'Your hair stands on end. You are carrying static.']
];
export function bodyNotice(prev, cur) {
  if (!prev) return null;
  for (const [k, msg] of NOTES) {
    if (cur[k] && cur[k] !== prev[k] && !(k === 'pain' && cur.pain < prev.pain)) return typeof msg === 'function' ? msg(cur) : msg;
  }
  return null;
}
